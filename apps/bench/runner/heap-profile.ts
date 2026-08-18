/**
 * Allocation-profile a bench scenario and attribute the garbage to real
 * function names.
 *
 * This is the sibling of `profile.ts`. That one answers WHERE THE TIME GOES;
 * this one answers WHO ALLOCATES — the question a GC-shaped tail asks. The
 * committed CPU profile over the anim-off loop shows the garbage collector at
 * 27.5 ms self (6.8%), the second-largest self-time entry, and GC pauses
 * landing inside a handful of repetitions are exactly the shape that widens a
 * confidence interval without moving the median. A .cpuprofile cannot say which
 * code produced that garbage; this can.
 *
 * Its numbers are attribution evidence for choosing what to fix. They are NOT a
 * benchmark and must never feed the gate — the bench decides whether a fix
 * worked.
 *
 * Method — the same harness discipline as `profile.ts`:
 *  - build the bench app UNMINIFIED, so the profile carries source names
 *    instead of mangled single letters;
 *  - drive the same __bench.run() the runner uses, under the same CPU throttle;
 *  - run one unprofiled warmup round first, so the profile reads steady state
 *    rather than JIT warmup and frame boot;
 *  - sample at a fine byte interval so per-update allocations of a few hundred
 *    bytes still accumulate attributable samples.
 *
 * Both subject frames are same-origin iframes in one renderer target, so a
 * single sampling session covers the parent page and both subjects. Rows are
 * told apart by function name and source bundle — read the `source` column
 * before attributing anything to quadrum.
 *
 * Usage:
 *   pnpm --filter quadrum-bench heap-profile
 *   pnpm --filter quadrum-bench heap-profile -- --scenario update-throughput-anim-off --rounds 3
 */

import { writeFile, mkdir } from "node:fs/promises";
import { parseArgs } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, startPreview, findFreePort } from "./server.ts";
import { launch, openPage, installHooks } from "./browser.ts";
import {
	aggregateHeapProfile,
	heapWatchlist,
	renderHeapTable,
} from "./heap-aggregate.ts";
import type { SamplingHeapProfile } from "./heap-aggregate.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Bytes between samples. V8's default is 32768, which is far too coarse here:
 * the update path's suspected allocations are a Map and a few small arrays per
 * update, tens to hundreds of bytes each. 1024 keeps the sample count high
 * enough that a per-update allocation of that size is attributed rather than
 * missed, at a sampling overhead that does not matter because this run is not
 * timed.
 */
const SAMPLING_INTERVAL_BYTES = 1024;

/**
 * The update-path functions the perf plans track, by allocation rather than by
 * time. Deliberately a superset of the CPU watchlist's update-path entries plus
 * the array/Map builders the anim-off spec names as suspects, so the profile
 * can convict or acquit each of them by name.
 */
const HEAP_WATCH_PATTERNS: readonly RegExp[] = [
	/^fenToPieces$/,
	/^changedSquares$/,
	/^planDiff$/,
	/^renderPieces$/,
	/^applyPairing$/,
	/^renderSquares$/,
	/^placePieceEl$/,
	/^placeSquare$/,
	/^createPieceEl$/,
	/^setTransform$/,
	/^setTranslate$/,
	/^writeTranslate$/,
	/^applyOptions$/,
	/^update$/,
	/^setPosition$/,
];

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			scenario: { type: "string", default: "update-throughput-anim-off" },
			throttle: { type: "string", default: "4" },
			rounds: { type: "string", default: "3" },
			top: { type: "string", default: "30" },
			interval: { type: "string", default: String(SAMPLING_INTERVAL_BYTES) },
			out: { type: "string" },
		},
	});

	const scenario = values.scenario!;
	const throttle = Number(values.throttle);
	const rounds = Number(values.rounds);
	const top = Number(values.top);
	const interval = Number(values.interval);

	if (!Number.isFinite(throttle) || throttle < 1) {
		throw new Error(`--throttle must be a number >= 1, got "${values.throttle}"`);
	}
	if (!Number.isInteger(rounds) || rounds < 1) {
		throw new Error(`--rounds must be a positive integer, got "${values.rounds}"`);
	}
	if (!Number.isInteger(top) || top < 1) {
		throw new Error(`--top must be a positive integer, got "${values.top}"`);
	}
	if (!Number.isInteger(interval) || interval < 1) {
		throw new Error(`--interval must be a positive integer, got "${values.interval}"`);
	}

	const appRoot = resolve(__dirname, "..");
	const outPath = resolve(
		appRoot,
		values.out ?? `results/heap-${scenario}.heapprofile`,
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

			// One unprofiled round first, so the profile reads steady-state
			// allocation: JIT warmup, frame boot and stylesheet work all land here
			// instead of polluting the attribution.
			console.log(`Warmup: ${scenario} (unprofiled)...`);
			await runScenario(page, scenario);

			// HeapProfiler is already enabled by openPage. Collect garbage first so
			// the sampled window starts from a settled heap rather than from the
			// warmup's leftovers.
			await cdp.send("HeapProfiler.collectGarbage");
			// The two include* flags are the whole point of this run, and they
			// default to FALSE: without them V8 drops every sampled object the GC
			// later collected, so the profile reports only what SURVIVED. That is
			// the exact opposite of what a GC-pressure question asks -- short-lived
			// garbage is the thing being hunted, and it would be invisible.
			// Calibrated: 1000 throwaway 32-entry Maps report ~64 kB under the
			// defaults and multiple MB with these flags on.
			await cdp.send("HeapProfiler.startSampling", {
				samplingInterval: interval,
				includeObjectsCollectedByMajorGC: true,
				includeObjectsCollectedByMinorGC: true,
			});

			console.log(
				`Sampling allocations: ${scenario} x ${rounds} round(s), ` +
					`throttle ${throttle}x, every ${interval} B...`,
			);
			for (let round = 0; round < rounds; round++) {
				await runScenario(page, scenario);
			}

			const { profile } = (await cdp.send("HeapProfiler.stopSampling")) as {
				profile: SamplingHeapProfile;
			};

			await mkdir(dirname(outPath), { recursive: true });
			await writeFile(outPath, JSON.stringify(profile));

			report(profile, { scenario, throttle, rounds, top, interval, outPath });
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
				"allocation attribution over a failed run would be misleading",
		);
	}
}

function report(
	profile: SamplingHeapProfile,
	meta: {
		scenario: string;
		throttle: number;
		rounds: number;
		top: number;
		interval: number;
		outPath: string;
	},
): void {
	const summary = aggregateHeapProfile(profile);

	console.log(`\nRaw heap profile written to ${meta.outPath}`);
	console.log(
		`Sampled ${(summary.sampledBytes / (1024 * 1024)).toFixed(2)} MB of allocation ` +
			`over ${meta.rounds} round(s) of ${meta.scenario} at ${meta.throttle}x throttle ` +
			`(${meta.interval} B sampling).`,
	);
	console.log(
		"\nNOTE: the sampled window covers BOTH subjects plus bench scaffolding " +
			"(each round is a full ABBA comparison including its warmup passes). " +
			"Read the `source` column before attributing a row to quadrum. Use these " +
			"numbers for attribution, never as a benchmark.",
	);

	console.log(`\nTop ${meta.top} functions by self-allocated bytes:\n`);
	console.log(renderHeapTable(summary.functions.slice(0, meta.top), summary.sampledBytes));

	const watched = heapWatchlist(summary, HEAP_WATCH_PATTERNS);
	console.log("\nWatchlist (update-path functions):\n");
	if (watched.length === 0) {
		console.log(
			"  none of the watched functions allocate at a sampled rate — either " +
				"they are allocation-free, or the build was minified.",
		);
	} else {
		console.log(renderHeapTable(watched, summary.sampledBytes));
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
