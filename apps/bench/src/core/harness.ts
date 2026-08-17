/**
 * Owns warmup, ABBA interleaving, discard and pairing.
 */

import { summarize, ratio } from "./stats";
import { settle } from "./clock";
import { DEFAULT_ORDER } from "../adapters/registry";
import { getFrame } from "./frames";
import type { BenchFrame, BenchFrames } from "./frames";
import type {
	Scenario,
	ScenarioOptions,
	ScenarioComparison,
	ScenarioRunResult,
	AdapterId,
	Assertion,
	Metric,
	ScenarioContext,
	BenchHooks,
} from "./types";

/**
 * ABBA interleaving for a given number of repetitions.
 * For reps=2 over ['quadrum','chessground'] yields
 * ['quadrum','chessground','chessground','quadrum'].
 * Each repetition emits the pair forward then reversed.
 */
export function abbaOrder(reps: number, ids: readonly AdapterId[]): AdapterId[] {
	const result: AdapterId[] = [];
	for (let rep = 0; rep < reps; rep++) {
		result.push(...ids);
		result.push(...ids.slice().reverse());
	}
	return result;
}

/**
 * Create a clean host element with the given size.
 */
export function makeHost(frame: BenchFrame, sizePx: number): HTMLElement {
	// Allocated in the subject's OWN document. Creating it in the parent and
	// inserting it here would force a cross-document adoption of every element
	// the library later appends -- work no real consumer does.
	const host = frame.document.createElement("div");
	host.className = "bench-frame";
	host.style.setProperty("--bench-size", `${sizePx}px`);
	frame.document.body.appendChild(host);
	return host;
}

/**
 * Apply discard to samples and return both kept and discarded arrays.
 */
export function applyDiscard(
	samples: readonly number[],
	discardFirst: number,
): { kept: number[]; discarded: number[] } {
	const discarded = samples.slice(0, discardFirst);
	const kept = samples.slice(discardFirst);
	return { kept: Array.from(kept), discarded: Array.from(discarded) };
}

/**
 * Build a metric from samples, applying discard and computing the headline value.
 */
export function metricFromSamples(
	key: string,
	label: string,
	samples: readonly number[],
	opts: {
		unit: Metric["unit"];
		direction: Metric["direction"];
		statistic: "median" | "p95";
		discardFirst: number;
	},
): Metric {
	const { kept, discarded } = applyDiscard(samples, opts.discardFirst);
	const stats = summarize(kept);
	const value =
		opts.statistic === "median" ? stats.median : stats.p95;

	return {
		key,
		label,
		unit: opts.unit,
		direction: opts.direction,
		value,
		samples: Array.from(kept),
		discarded: Array.from(discarded),
		statistic: opts.statistic,
	};
}

/**
 * Merge multiple passes of the same scenario into a single result.
 * Used to pool ABBA-order passes: concatenate samples and discarded across passes,
 * recompute the metric value with the original statistic, and concatenate assertions.
 */
export function mergePassResults(
	passes: readonly ScenarioRunResult[],
): ScenarioRunResult {
	if (passes.length === 0) {
		throw new Error("mergePassResults: empty array");
	}

	if (passes.length === 1) {
		return passes[0];
	}

	const firstPass = passes[0];
	const mergedMetrics: Metric[] = [];

	// Preserve the key order from the first pass
	for (const firstMetric of firstPass.metrics) {
		const key = firstMetric.key;

		// Collect this metric from all passes
		const metricsWithKey = passes
			.map((pass) => pass.metrics.find((m) => m.key === key))
			.filter((m) => m !== undefined) as Metric[];

		// Check if all passes have this metric with samples and statistic
		const allHaveSamples = metricsWithKey.every(
			(m) => m.samples && m.statistic,
		);

		if (allHaveSamples) {
			// Pool the samples and recompute the value
			const pooledSamples = metricsWithKey.flatMap((m) => m.samples ?? []);
			const pooledDiscarded = metricsWithKey.flatMap((m) => m.discarded ?? []);
			const statistic = metricsWithKey[0].statistic!;
			const stats = summarize(pooledSamples);
			const value =
				statistic === "median" ? stats.median : stats.p95;

			mergedMetrics.push({
				key: firstMetric.key,
				label: firstMetric.label,
				unit: firstMetric.unit,
				direction: firstMetric.direction,
				value,
				samples: pooledSamples,
				discarded: pooledDiscarded,
				statistic,
				advisory: firstMetric.advisory,
			});
		} else {
			// Use the last pass's metric unchanged
			const lastMetricWithKey = metricsWithKey[metricsWithKey.length - 1];
			mergedMetrics.push(lastMetricWithKey);
		}
	}

	// Concatenate assertions from all passes
	const mergedAssertions: Assertion[] = [];
	for (const pass of passes) {
		mergedAssertions.push(...pass.assertions);
	}

	return {
		adapter: firstPass.adapter,
		metrics: mergedMetrics,
		assertions: mergedAssertions,
	};
}

/**
 * Run a scenario comparison between both adapters.
 * Interleaves with ABBA, handles warmup and discard, and pools ABBA passes.
 */
export async function runComparison(args: {
	scenario: Scenario;
	frames: BenchFrames;
	options: ScenarioOptions;
	hooks: BenchHooks;
	signal: AbortSignal;
	log: (m: string) => void;
}): Promise<ScenarioComparison> {
	const { scenario, frames, options, hooks, signal, log } = args;

	const startTime = performance.now();
	const passes: Map<AdapterId, ScenarioRunResult[]> = new Map();
	passes.set("quadrum", []);
	passes.set("chessground", []);

	// Run one warmup pass per adapter (discarded entirely)
	for (const id of DEFAULT_ORDER) {
		if (signal.aborted) {
			throw new DOMException("aborted", "AbortError");
		}
		const frame = getFrame(frames, id);
		const host = makeHost(frame, options.sizePx);
		const ctx: ScenarioContext = {
			host,
			frame,
			factory: frame.factory,
			options,
			log,
			signal,
			hooks,
		};

		try {
			await scenario.run(ctx);
			log(`warmup ${id}`);
		} finally {
			host.remove();
			host.innerHTML = "";
		}

		await settle();
	}

	// Run the actual passes with ABBA interleaving, collecting all passes per adapter
	const order = abbaOrder(1, DEFAULT_ORDER);
	for (const id of order) {
		if (signal.aborted) {
			throw new DOMException("aborted", "AbortError");
		}
		const frame = getFrame(frames, id);
		const host = makeHost(frame, options.sizePx);
		const ctx: ScenarioContext = {
			host,
			frame,
			factory: frame.factory,
			options,
			log,
			signal,
			hooks,
		};

		try {
			const result = await scenario.run(ctx);
			passes.get(id)!.push(result);
			log(`pass ${id}`);
		} finally {
			host.remove();
			host.innerHTML = "";
		}

		await settle();
	}

	// Merge passes per adapter and build ratios
	const results: Map<AdapterId, ScenarioRunResult> = new Map();
	for (const [id, adapterPasses] of passes) {
		if (adapterPasses.length > 0) {
			results.set(id, mergePassResults(adapterPasses));
		}
	}

	// Build ratios and check validity
	const ratios: Record<string, number> = {};
	const quadrumResult = results.get("quadrum");
	const chessgroundResult = results.get("chessground");

	if (quadrumResult && chessgroundResult) {
		const allKeys = new Set<string>();
		for (const m of quadrumResult.metrics) {
			allKeys.add(m.key);
		}
		for (const m of chessgroundResult.metrics) {
			allKeys.add(m.key);
		}

		for (const key of allKeys) {
			const qMetric = quadrumResult.metrics.find((m) => m.key === key);
			const cMetric = chessgroundResult.metrics.find((m) => m.key === key);

			if (qMetric && cMetric) {
				let r = ratio(qMetric.value, cMetric.value);
				// Invert if direction is "higher"
				if (qMetric.direction === "higher") {
					r = ratio(cMetric.value, qMetric.value);
				}
				ratios[key] = r;
			}
		}
	}

	const allAssertionsPassed =
		(!quadrumResult || quadrumResult.assertions.every((a) => a.passed)) &&
		(!chessgroundResult || chessgroundResult.assertions.every((a) => a.passed));

	const valid =
		allAssertionsPassed && !!quadrumResult && !!chessgroundResult;

	const durationMs = performance.now() - startTime;

	return {
		scenarioId: scenario.id,
		options,
		byAdapter: {
			...(quadrumResult ? { quadrum: quadrumResult } : {}),
			...(chessgroundResult ? { chessground: chessgroundResult } : {}),
		},
		ratios,
		valid,
		durationMs,
	};
}
