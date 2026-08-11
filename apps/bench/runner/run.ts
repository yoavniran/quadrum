/**
 * The runner CLI entry point.
 */

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, arch } from "node:os";
import { parseRunnerArgs } from "./args.ts";
import { buildApp, startPreview, findFreePort } from "./server.ts";
import { launch, openPage, installHooks } from "./browser.ts";
import { measureBundles } from "./bundle-size.ts";
import {
	aggregateRuns,
	capScenarioIds,
	renderConsoleTable,
	summarizeFailures,
	exitCodeFor,
} from "./report.ts";
import type { RunRecord } from "./types.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Scenarios measured in Node, not in the page. Never dispatched to the browser. */
const NODE_MEASURED = ["bundle-size"];

async function main() {
	const opts = parseRunnerArgs(process.argv.slice(2));

	const appRoot = resolve(__dirname, "..");
	const startedAt = new Date();
	const startedMs = Date.now();
	let previewServer: { url: string; stop: () => Promise<void> } | null = null;

	try {
		console.log("Measuring bundles...");
		const bundleSizes = await measureBundles(appRoot);

		console.log("Building app...");
		await buildApp(appRoot);

		console.log("Finding port...");
		const port = await findFreePort(5473);

		console.log(`Starting preview server on port ${port}...`);
		previewServer = await startPreview(appRoot, port);
		const url = previewServer.url;

		const allRuns: any[][] = [];
		// Filled from the first repetition's page. Nothing here is hardcoded: a
		// version string typed into the runner is a claim the run never checked,
		// and it is exactly the field that goes stale after a dependency bump.
		let scenarioMeta: any[] = [];
		let pageEnv: any = null;
		let browserVersion = "unknown";

		for (let runIndex = 0; runIndex < opts.runs; runIndex++) {
			console.log(`Run ${runIndex + 1}/${opts.runs}...`);

			let browser: any = null;
			try {
				browser = await launch(opts.headed);
				const { page, cdp, dispose } = await openPage(browser, url, opts.throttle);

				try {
					await installHooks(page, cdp);

					// Get the scenario list and filter
					const scenarioList = await page.evaluate((): any => (globalThis as any).__bench.list());

					if (scenarioMeta.length === 0) {
						scenarioMeta = scenarioList;
						pageEnv = await page.evaluate((): any => (globalThis as any).__bench.env());
						browserVersion = browser.version();

						if (pageEnv && pageEnv.crossOriginIsolated === false) {
							console.warn(
								"WARNING: page is not cross-origin isolated; performance.now() is " +
									"clamped to 100µs and sub-0.1ms timings quantize to 0. Check the " +
									"COOP/COEP headers in vite.config.ts.",
							);
						}
					}

					let scenarioIds: string[] = [];
					if (opts.scenario === "all") {
						// runnerOnly does NOT mean "skip here" -- it means the visual page
						// cannot produce real numbers for it, so the runner is the only
						// place it CAN run. The one genuine exclusion is bundle-size, whose
						// numbers come from the Node-side lib builds above and are merged
						// into the JSON separately.
						scenarioIds = scenarioList
							.filter((s: any) => !NODE_MEASURED.includes(s.id))
							.map((s: any) => s.id);
					} else if (opts.scenario === "gated") {
						// Taken from the page's own registry, never re-listed here.
						// A second copy of "which scenarios are gated" is how a
						// scenario quietly stops being gated without a diff that
						// says so.
						scenarioIds = scenarioList
							.filter((s: any) => s.gated && !NODE_MEASURED.includes(s.id))
							.map((s: any) => s.id);
					} else {
						scenarioIds = [opts.scenario];
					}

					// An explicitly requested single scenario is exempt: the cap
					// exists to trim the broad sweeps, not to second-guess someone
					// asking for exactly this scenario at exactly this rep count.
					if (opts.scenario === "all" || opts.scenario === "gated") {
						scenarioIds = capScenarioIds(scenarioIds, scenarioList, runIndex);
					}

					const results = await page.evaluate(
						async ({ ids, iterations }: any): Promise<any> => {
							const out = [];
							for (const id of ids) {
								try {
									out.push(
										await (globalThis as any).__bench.run(
											id,
											iterations ? { iterations } : {},
										),
									);
								} catch (e) {
									console.error(`Error running scenario ${id}:`, e);
									out.push(null);
								}
							}
							return out;
						},
						{ ids: scenarioIds, iterations: opts.iterations },
					);

					allRuns.push(results.filter((r: any) => r !== null));
				} finally {
					await dispose();
				}
			} finally {
				if (browser) {
					await browser.close();
				}
			}
		}

		console.log("Aggregating results...");
		const aggregated = aggregateRuns(allRuns);

		// Build run record
		let gitSha = "unknown";
		let gitRef = "unknown";
		let gitDirty = false;

		try {
			gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
				cwd: appRoot,
				encoding: "utf-8",
			}).trim();
		} catch {}

		try {
			gitRef = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
				cwd: appRoot,
				encoding: "utf-8",
			}).trim();
		} catch {}

		try {
			const status = execFileSync("git", ["status", "--porcelain"], {
				cwd: appRoot,
				encoding: "utf-8",
			});
			gitDirty = status.trim().length > 0;
		} catch {}

		const publishable =
			(process.env.BENCH_TRIGGER === "schedule" ||
				process.env.BENCH_TRIGGER === "push") &&
			!gitDirty;

		const record: RunRecord = {
			schemaVersion: 1,
			run: {
				id: `run-${startedMs}`,
				startedAt: startedAt.toISOString(),
				durationMs: Date.now() - startedMs,
				trigger: process.env.BENCH_TRIGGER || "manual",
				publishable,
			},
			env: {
				node: process.version,
				platform: platform(),
				arch: arch(),
				cpus: cpus().length,
				cpuModel: cpus()[0]?.model || "unknown",
				gitSha,
				gitRef,
				gitDirty,
			},
			browser: {
				name: "chromium",
				version: browserVersion,
				headless: !opts.headed,
				viewport: { width: 1280, height: 900 },
				deviceScaleFactor: 1,
				cpuThrottlingRate: opts.throttle,
			},
			// Both read back from the page, which knows the versions it actually
			// imported. If the run never got a page up, that failure is visible
			// here as "unknown" rather than papered over with a plausible number.
			page: pageEnv ?? {
				userAgent: "unknown",
				devicePixelRatio: 1,
				hardwareConcurrency: cpus().length,
				deviceMemory: null,
				mode: "production",
				crossOriginIsolated: false,
				quadrumVersion: "unknown",
				chessgroundVersion: "unknown",
			},
			subjects: {
				quadrum: pageEnv?.quadrumVersion ?? "unknown",
				chessground: pageEnv?.chessgroundVersion ?? "unknown",
			},
			config: {
				repetitions: opts.runs,
				warmups: 1,
				order: "interleaved-abba",
				freshContextPerRepetition: true,
			},
			scenarioMeta,
			scenarios: allRuns,
			bundleSizes,
			caveats: [
				`CPU throttle rate: ${opts.throttle}`,
				"Headless has no real vsync; frame-derived metrics are advisory",
				"Position-replay workload: three real games spliced to 200 half-moves (see apps/bench/src/data/game.ts)",
				...(pageEnv && pageEnv.crossOriginIsolated === false
					? [
							"performance.now() clamped to 100µs (page not cross-origin isolated); sub-0.1ms medians quantize to 0",
						]
					: []),
			],
		};

		console.log(renderConsoleTable(aggregated));
		const failures = summarizeFailures(aggregated);
		if (failures.length > 0) {
			console.log("\nFailures:");
			for (const f of failures) {
				console.log(`  ${f}`);
			}
		}

		// Write results
		const outDir = dirname(opts.out);
		await mkdir(outDir, { recursive: true });
		await writeFile(opts.out, JSON.stringify(record, null, 2));
		console.log(`Results written to ${opts.out}`);

		let exitCode = exitCodeFor(aggregated);

		if (opts.compare) {
			// The gate logic lives in .github/scripts/bench-report.mjs and is
			// imported rather than reimplemented: CI and a local `pnpm bench
			// --compare` must reach the same verdict, and two implementations of
			// a regression rule eventually disagree in whichever direction is
			// convenient.
			const { summarizeRun, compareToBaseline, renderGateSummary } = await import(
				resolve(appRoot, "../../.github/scripts/bench-report.mjs")
			);
			const baseline = JSON.parse(
				await readFile(resolve(appRoot, opts.compare), "utf-8"),
			);
			const gate = compareToBaseline(summarizeRun(record), baseline, {});

			console.log(`\n${renderGateSummary(gate)}`);

			if (!gate.ok) {
				exitCode = 1;
			}
		}

		process.exit(exitCode);
	} finally {
		if (previewServer) {
			await previewServer.stop();
		}
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
