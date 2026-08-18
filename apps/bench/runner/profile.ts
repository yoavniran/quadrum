/**
 * CPU-profile a bench scenario and attribute the time to real function names.
 *
 * This is the re-scoping tool the perf plans call for ("re-profile, then
 * re-scope"): it answers WHERE the script time goes, which the gate numbers
 * (medians and ratios) cannot. It is not a benchmark — its numbers are not
 * comparable to the runner's and must never feed the gate.
 *
 * Method:
 *  - build the bench app UNMINIFIED, so the profile carries source names
 *    instead of mangled single letters (the runner rebuilds minified on its
 *    next run, so this leaves nothing stale behind);
 *  - drive the same __bench.run() the runner uses, under the same CPU
 *    throttle, with V8 sampling at 50µs — fine enough that sub-millisecond
 *    functions on the update path accumulate attributable samples;
 *  - write the raw .cpuprofile (open it in Chrome DevTools or speedscope)
 *    and print per-function self/total time.
 *
 * Both subject frames are same-origin iframes in one renderer target, so a
 * single profiler session covers the parent page and both subjects; rows are
 * told apart by function name and source bundle.
 *
 * Usage:
 *   pnpm --filter quadrum-bench profile
 *   pnpm --filter quadrum-bench profile -- --scenario update-throughput-anim-off --rounds 3
 */

import { writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, startPreview, findFreePort } from "./server.ts";
import { launch, openPage, installHooks } from "./browser.ts";
import {
	aggregateProfile,
	watchlist,
	renderTable,
} from "./profile-aggregate.ts";
import type { CpuProfile } from "./profile-aggregate.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Sampling interval in microseconds. */
const SAMPLING_INTERVAL_US = 50;

/**
 * The update-path functions the perf plans track. Watching them by name keeps
 * the report useful even when a refactor moves them between bundles.
 */
const WATCH_PATTERNS: readonly RegExp[] = [
	/^renderPieces$/,
	/^renderSquares$/,
	/^placePieceEl$/,
	/^placeSquare$/,
	/^isPlacedAt$/,
	/^writeTranslate$/,
	/^setTransform$/,
	/^setTranslate$/,
	/^isHeld$/,
	/^applyOptions$/,
	/^fenToPieces$/,
	/^planDiff$/,
	/^squareIndex$/,
	/^update$/,
];

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			scenario: { type: "string", default: "update-throughput-anim-off" },
			throttle: { type: "string", default: "4" },
			rounds: { type: "string", default: "3" },
			top: { type: "string", default: "30" },
			out: { type: "string" },
		},
	});

	const scenario = values.scenario!;
	const throttle = Number(values.throttle);
	const rounds = Number(values.rounds);
	const top = Number(values.top);

	if (!Number.isFinite(throttle) || throttle < 1) {
		throw new Error(`--throttle must be a number >= 1, got "${values.throttle}"`);
	}
	if (!Number.isInteger(rounds) || rounds < 1) {
		throw new Error(`--rounds must be a positive integer, got "${values.rounds}"`);
	}
	if (!Number.isInteger(top) || top < 1) {
		throw new Error(`--top must be a positive integer, got "${values.top}"`);
	}

	const appRoot = resolve(__dirname, "..");
	const outPath = resolve(
		appRoot,
		values.out ?? `results/profile-${scenario}.cpuprofile`,
	);

	let previewServer: { url: string; stop: () => Promise<void> } | null = null;
	let browser: Awaited<ReturnType<typeof launch>> | null = null;

	try {
		console.log("Building app (unminified, for readable stacks)...");
		await buildApp(appRoot, ["--minify", "false"]);

		const port = await findFreePort(5473);
		console.log(`Starting preview server on port ${port}...`);
		previewServer = await startPreview(appRoot, port);

		browser = await launch(false);
		const { page, cdp, dispose } = await openPage(
			browser,
			previewServer.url,
			throttle,
		);

		try {
			await installHooks(page, cdp);

			// One unprofiled round first, so the profile reads steady-state code:
			// JIT warmup, frame boot and stylesheet work all land here instead of
			// polluting the attribution.
			console.log(`Warmup: ${scenario} (unprofiled)...`);
			await runScenario(page, scenario);

			await cdp.send("Profiler.enable");
			await cdp.send("Profiler.setSamplingInterval", {
				interval: SAMPLING_INTERVAL_US,
			});
			await cdp.send("Profiler.start");

			console.log(`Profiling: ${scenario} x ${rounds} round(s), throttle ${throttle}x...`);
			for (let round = 0; round < rounds; round++) {
				await runScenario(page, scenario);
			}

			const { profile } = (await cdp.send("Profiler.stop")) as {
				profile: CpuProfile;
			};

			await mkdir(dirname(outPath), { recursive: true });
			await writeFile(outPath, JSON.stringify(profile));

			report(profile, { scenario, throttle, rounds, top, outPath });
		} finally {
			await dispose();
		}
	} finally {
		if (browser) {
			await browser.close();
		}
		if (previewServer) {
			await previewServer.stop();
		}
	}
}

/** Run one full __bench.run() comparison for the scenario, in the page. */
async function runScenario(
	page: { evaluate: (fn: any, arg?: any) => Promise<any> },
	scenarioId: string,
): Promise<void> {
	const comparison = await page.evaluate(
		async (id: string): Promise<{ valid: boolean }> => {
			return (globalThis as any).__bench.run(id, {});
		},
		scenarioId,
	);

	if (!comparison || comparison.valid !== true) {
		throw new Error(
			`scenario ${scenarioId} did not produce a valid comparison; ` +
				"profile attribution over a failed run would be misleading",
		);
	}
}

function report(
	profile: CpuProfile,
	meta: {
		scenario: string;
		throttle: number;
		rounds: number;
		top: number;
		outPath: string;
	},
): void {
	const summary = aggregateProfile(profile);

	console.log(`\nRaw profile written to ${meta.outPath}`);
	console.log(
		`Sampled ${summary.sampledMs.toFixed(0)} ms over ${meta.rounds} round(s) ` +
			`of ${meta.scenario} at ${meta.throttle}x throttle ` +
			`(${SAMPLING_INTERVAL_US}µs sampling).`,
	);
	console.log(
		"\nNOTE: the profiled window covers BOTH subjects plus bench scaffolding " +
			"(each round is a full ABBA comparison including its warmup passes). " +
			"Use these numbers for attribution, never as a benchmark.",
	);

	console.log(`\nTop ${meta.top} functions by self time:\n`);
	console.log(renderTable(summary.functions.slice(0, meta.top), summary.sampledMs));

	const watched = watchlist(summary, WATCH_PATTERNS);
	console.log("\nWatchlist (quadrum update-path functions):\n");
	if (watched.length === 0) {
		console.log(
			"  none of the watched functions appear in the profile — either they " +
				"are now too cheap to sample, or the build was minified.",
		);
	} else {
		console.log(renderTable(watched, summary.sampledMs));
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
