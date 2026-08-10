/**
 * The runner CLI entry point.
 */

import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, platform, arch } from "node:os";
import { buildApp, startPreview, findFreePort } from "./server.ts";
import { launch, openPage, installHooks } from "./browser.ts";
import { measureBundles } from "./bundle-size.ts";
import {
	aggregateRuns,
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
	const { values } = parseArgs({
		options: {
			scenario: { type: "string", default: "all" },
			runs: { type: "string", default: "7" },
			throttle: { type: "string", default: "4" },
			iterations: { type: "string" },
			headed: { type: "boolean", default: false },
			out: { type: "string", default: "results/latest.json" },
			compare: { type: "string" },
			"allow-dev": { type: "boolean", default: false },
		},
	});

	const opts = {
		scenario: String(values.scenario),
		runs: parseInt(String(values.runs), 10),
		throttle: parseFloat(String(values.throttle)),
		iterations: values.iterations ? parseInt(String(values.iterations), 10) : null,
		headed: Boolean(values.headed),
		out: String(values.out),
		compare: values.compare ? String(values.compare) : null,
		allowDev: Boolean(values["allow-dev"]),
	};

	const appRoot = resolve(__dirname, "..");
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
						scenarioIds = ["mount", "update-throughput-anim-off", "engine-arrow-tick"];
					} else {
						scenarioIds = [opts.scenario];
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
				id: `run-${Date.now()}`,
				startedAt: new Date().toISOString(),
				durationMs: Date.now(),
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
				version: "latest",
				headless: !opts.headed,
				viewport: { width: 1280, height: 900 },
				deviceScaleFactor: 1,
				cpuThrottlingRate: opts.throttle,
			},
			page: {
				userAgent: "headless",
				devicePixelRatio: 1,
				hardwareConcurrency: cpus().length,
				deviceMemory: null,
				mode: "production",
				quadrumVersion: "0.2.2",
				chessgroundVersion: "9.2.1",
			},
			subjects: {
				quadrum: "0.2.2",
				chessground: "9.2.1",
			},
			config: {
				repetitions: opts.runs,
				warmups: 1,
				order: "interleaved-abba",
				freshContextPerRepetition: true,
			},
			scenarios: allRuns,
			bundleSizes,
			caveats: [
				`CPU throttle rate: ${opts.throttle}`,
				"Headless has no real vsync; frame-derived metrics are advisory",
				"Synthetic game data: legal chess moves are not required; what matters for a renderer is DOM churn per update",
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

		process.exit(exitCodeFor(aggregated));
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
