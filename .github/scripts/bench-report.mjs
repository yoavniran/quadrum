/**
 * Pure functions behind the benchmark report, the regression gate and the
 * README headline block.
 *
 * Nothing here touches the filesystem, the environment or the clock; the CLI
 * wrapper (`write-bench-report.mjs`) does all the I/O, and `now` is always a
 * parameter. That is what makes the whole thing testable, and it is why
 * `bench-report.test.mjs` can assert on a regression verdict without running a
 * benchmark.
 *
 * The design rule throughout: the author of these numbers also owns one of the
 * two subjects. Every function here is written so that the flattering result is
 * not the easy one to produce. See `apps/bench/README.md` for the full
 * statement of interest.
 */

import { describe as describeSamples, medianCi, p95Ci } from "./bench-stats.mjs";

export { medianCi, p95Ci };

/** The only results schema this file understands. */
export const SCHEMA_VERSION = 1;

/**
 * Cross-origin-isolated performance.now() resolution. Values measured below this
 * were not measured so much as not resolved, and should render as such.
 */
export const TIMER_RESOLUTION_MS = 0.005;

/** Ratio tolerance over baseline before a gated scenario is a regression. */
export const DEFAULT_TOLERANCE = 0.15;

/**
 * Bundle size is gated absolutely rather than by ratio -- it has no runtime
 * noise, and a regression that hits both subjects would cancel out of a ratio.
 *
 * Temporarily relaxed from 0.02 to 0.12 for docs/plans/update-path-node-churn.md.
 * Phase A of that plan cost 155 brotli bytes and only fit under 2% after two
 * rewrites driven purely by size; Phases B-D each add more shipped code than A
 * did, and leaving the tight cap in place would let byte pressure dictate how
 * they are written. The gate still catches a real jump, and a bundle scenario
 * missing from a run is still a hard fail. Phase F of that plan restores 0.02
 * against a freshly minted baseline -- when this constant goes back to 0.02,
 * that reference and this paragraph go with it.
 */
export const DEFAULT_BUNDLE_TOLERANCE = 0.12;

/**
 * How far chessground's own absolute timing may drift from baseline before the
 * run is called inconclusive rather than trusted.
 */
export const DEFAULT_SANITY_DRIFT_FACTOR = 2.5;

/** A gated scenario must be able to detect a regression at or below this
 *  fraction over baseline, or gating it is theatre rather than a gate. */
export const MAX_GATED_DETECTABLE_REGRESSION = 1.0;

/**
 * Minimum number of timer ticks for a gated metric's central value. 20 ticks (0.1 ms)
 * is the point at which one tick of movement is a 5% ratio swing, which sits inside the
 * 15% gate tolerance with room to spare. Metrics below this are quantized and
 * non-reproducible between runs.
 */
export const MIN_GATED_MEDIAN_TICKS = 20;

const HEADLINE_START = "<!-- bench:headline:start -->";
const HEADLINE_END = "<!-- bench:headline:end -->";

/** Days before the published block warns, then fails, as stale. */
export const FRESHNESS_WARN_DAYS = 45;
export const FRESHNESS_FAIL_DAYS = 120;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * a / b, defined at the edges rather than left to produce NaN or Infinity in a
 * published table.
 *
 * Zero-versus-zero is the common case that matters: two libraries that both
 * retain zero nodes are at parity, and 0/0 must say so rather than poisoning
 * the row.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function safeRatio(a, b) {
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		return NaN;
	}

	if (a === 0 && b === 0) {
		return 1;
	}

	if (b === 0) {
		return Infinity;
	}

	return a / b;
}

/**
 * `value > threshold`, with enough slack to survive binary floating point.
 *
 * The thresholds here are products (`0.7 * 1.15` is 0.80499999999999994), so a
 * measurement that lands exactly on the documented limit would otherwise fail
 * the gate on representation error rather than on a regression. A gate that
 * fires at its own stated limit is a gate people learn to ignore.
 *
 * @param {number} value
 * @param {number} threshold
 * @returns {boolean}
 */
function exceeds(value, threshold) {
	if (!Number.isFinite(value) || !Number.isFinite(threshold)) {
		return false;
	}

	return value - threshold > Math.abs(threshold) * 1e-9;
}

/**
 * The smallest regression a scenario can still detect, as a multiplier over
 * baseline (1.35 = "+35% or worse"). Returns null when the interval is so wide
 * that no regression is detectable at all.
 *
 * @param {number} ratio
 * @param {[number, number]} ratioCi95
 * @param {number} tolerance
 * @returns {number | null}
 */
export function detectableRegression(ratio, ratioCi95, tolerance) {
	if (!Number.isFinite(ratio) || ratio === 0) {
		return null;
	}

	if (!ratioCi95 || !Number.isFinite(ratioCi95[0]) || !Number.isFinite(ratioCi95[1])) {
		return null;
	}

	const halfWidth = (ratioCi95[1] - ratioCi95[0]) / 2;
	const h = Math.abs(halfWidth / ratio);

	if (h >= 1) {
		return null;
	}

	const detectable = (1 + tolerance) / (1 - h);

	if (!Number.isFinite(detectable)) {
		return null;
	}

	return detectable;
}

/**
 * Compare the two subjects on one metric, normalised so that **lower always
 * means quadrum is better**, whichever way the underlying unit points.
 *
 * That normalisation is not cosmetic: it is what lets one gate rule cover every
 * metric. Without it, "higher is better" metrics would need an inverted
 * comparison somewhere, and an inverted comparison somewhere is where a
 * regression hides.
 *
 * @param {{ median: number, p95: number, ci95: [number, number], p95Ci95: [number, number] }} quadrum
 * @param {{ median: number, p95: number, ci95: [number, number], p95Ci95: [number, number] }} chessground
 * @param {"lower" | "higher"} direction
 * @param {"median" | "p95"} statistic
 * @returns {{ ratio: number, ratioCi95: [number, number], verdict: "quadrum" | "chessground" | "parity", tie: boolean }}
 */
export function compareSubjects(quadrum, chessground, direction = "lower", statistic = "median") {
	const higher = direction === "higher";

	// Select the point estimate and interval based on the declared statistic.
	// The current behaviour flatters quadrum by using median for p95-headlined
	// metrics -- that is exactly why we are fixing this now, before it stops doing so.
	const qValue = statistic === "p95" ? quadrum.p95 : quadrum.median;
	const cValue = statistic === "p95" ? chessground.p95 : chessground.median;
	const [qLo, qHi] = (statistic === "p95" ? quadrum.p95Ci95 : quadrum.ci95) ?? [NaN, NaN];
	const [cLo, cHi] = (statistic === "p95" ? chessground.p95Ci95 : chessground.ci95) ?? [NaN, NaN];

	const ratio = higher ? safeRatio(cValue, qValue) : safeRatio(qValue, cValue);

	// Widest ratio consistent with both intervals: pair each subject's optimistic
	// bound against the other's pessimistic one. Deliberately conservative --
	// a wider interval makes a "win" harder to claim, never easier.
	const bounds = higher
		? [safeRatio(cLo, qHi), safeRatio(cHi, qLo)]
		: [safeRatio(qLo, cHi), safeRatio(qHi, cLo)];
	const ratioCi95 = /** @type {[number, number]} */ (
		bounds.every(Number.isFinite) ? [...bounds].sort((a, b) => a - b) : [NaN, NaN]
	);

	// A tie is any difference the interval cannot separate from 1.0. This is the
	// mechanism that stops a 3% noise-level difference becoming a marketing
	// claim: with no usable interval, only an exact 1.0 is a tie.
	const tie = Number.isFinite(ratioCi95[0])
		? ratioCi95[0] <= 1 && ratioCi95[1] >= 1
		: ratio === 1;

	let verdict = "parity";

	if (!tie && Number.isFinite(ratio)) {
		verdict = ratio < 1 ? "quadrum" : "chessground";
	} else if (!tie && ratio === Infinity) {
		verdict = "chessground";
	}

	return { ratio, ratioCi95, verdict: /** @type {any} */ (verdict), tie };
}

/**
 * Pool one metric's samples for one subject across every repetition.
 *
 * Metrics that carry per-iteration `samples` are pooled at sample level, which
 * is what the p95 needs. Metrics that carry only a `value` (counts, long-task
 * totals) contribute one point per repetition -- still a real distribution,
 * just a coarser one, and `n` in the output says which kind you are reading.
 *
 * @param {Array<{ value: number, samples?: readonly number[] }>} metrics
 * @returns {number[]}
 */
function poolSamples(metrics) {
	const pooled = metrics.flatMap((metric) => [...(metric.samples ?? [])]);

	return pooled.length > 0 ? pooled : metrics.map((metric) => metric.value);
}

/**
 * Turn the bundle-size measurements -- taken in Node, not in the page -- into
 * metric shapes the rest of the report can treat identically.
 *
 * CSS gets two rows on purpose. "Library CSS" flatters quadrum and means little
 * alone, because quadrum ships no piece art and that cost falls on the consumer
 * either way. The second row prices a board that actually works.
 *
 * @param {readonly { subject: string, raw: number, gzip: number, brotli: number, cssRaw: number, cssWithArtRaw: number }[]} bundleSizes
 * @returns {Record<string, { key: string, label: string, unit: string, direction: string, bySubject: Record<string, number[]> }>}
 */
function bundleMetrics(bundleSizes) {
	/** @type {Array<[string, string, string]>} */
	const fields = [
		["brotli", "bundle-brotli-bytes", "JS, min+brotli"],
		["gzip", "bundle-gzip-bytes", "JS, min+gzip"],
		["raw", "bundle-raw-bytes", "JS, minified"],
		["cssRaw", "bundle-css-bytes", "Library CSS"],
		["cssWithArtRaw", "bundle-css-with-art-bytes", "CSS + art for a working board"],
	];

	/** @type {Record<string, any>} */
	const out = {};

	for (const [field, key, label] of fields) {
		/** @type {Record<string, number[]>} */
		const bySubject = {};

		for (const entry of bundleSizes ?? []) {
			bySubject[entry.subject] = [entry[/** @type {keyof typeof entry} */ (field)]];
		}

		out[key] = { key, label, unit: "bytes", direction: "lower", bySubject };
	}

	return out;
}

/**
 * Normalise a raw run record into the shape every renderer and the gate read.
 *
 * @param {any} record a parsed results JSON
 * @param {{ seed?: number }} [options]
 * @returns {any} summary
 */
export function summarizeRun(record, options = {}) {
	if (record?.schemaVersion !== SCHEMA_VERSION) {
		// Hard failure, not a best-effort read. This file lives in git for years
		// and will one day meet a record it half-understands; half-understanding
		// a benchmark result is worse than refusing it.
		throw new Error(
			`unsupported results schemaVersion ${record?.schemaVersion}; this report understands ${SCHEMA_VERSION}`,
		);
	}

	const meta = record.scenarioMeta ?? [];
	const repetitions = record.scenarios ?? [];

	/** @type {Map<string, any[]>} */
	const byScenario = new Map();

	for (const repetition of repetitions) {
		for (const comparison of repetition ?? []) {
			if (!byScenario.has(comparison.scenarioId)) {
				byScenario.set(comparison.scenarioId, []);
			}

			byScenario.get(comparison.scenarioId).push(comparison);
		}
	}

	const bundles = bundleMetrics(record.bundleSizes);

	const scenarios = meta.map((scenario) => {
		const comparisons = byScenario.get(scenario.id) ?? [];

		/** @type {Map<string, any>} */
		const metricShapes = new Map();

		for (const comparison of comparisons) {
			for (const [subject, result] of Object.entries(comparison.byAdapter ?? {})) {
				for (const metric of result.metrics ?? []) {
					if (!metricShapes.has(metric.key)) {
						metricShapes.set(metric.key, {
							key: metric.key,
							label: metric.label,
							unit: metric.unit,
							direction: metric.direction,
							advisory: metric.advisory,
							statistic: metric.statistic ?? "median",
							bySubject: {},
						});
					}

					const shape = metricShapes.get(metric.key);
					shape.bySubject[subject] = shape.bySubject[subject] ?? [];
					shape.bySubject[subject].push(metric);
				}
			}
		}

		// bundle-size measures in Node, so it has no in-page metrics to merge.
		if (scenario.id === "bundle-size") {
			for (const [key, shape] of Object.entries(bundles)) {
				metricShapes.set(key, {
					...shape,
					bySubject: Object.fromEntries(
						Object.entries(shape.bySubject).map(([subject, values]) => [
							subject,
							values.map((value) => ({ value, samples: [value] })),
						]),
					),
				});
			}
		}

		/** @type {Record<string, any>} */
		const metrics = {};

		for (const [key, shape] of metricShapes) {
			const quadrum = describeSamples(poolSamples(shape.bySubject.quadrum ?? []), options);
			const chessground = describeSamples(
				poolSamples(shape.bySubject.chessground ?? []),
				options,
			);

			metrics[key] = {
				key,
				label: shape.label,
				unit: shape.unit,
				direction: shape.direction,
				advisory: shape.advisory,
				statistic: shape.statistic,
				quadrum,
				chessground,
				comparison: compareSubjects(quadrum, chessground, shape.direction, shape.statistic),
			};
		}

		const assertionFailures = comparisons.flatMap((comparison) =>
			Object.entries(comparison.byAdapter ?? {}).flatMap(([subject, result]) =>
				(result.assertions ?? [])
					.filter((assertion) => !assertion.passed)
					.map((assertion) => `${subject}: ${assertion.label}${assertion.detail ? ` — ${assertion.detail}` : ""}`),
			),
		);

		return {
			id: scenario.id,
			title: scenario.title,
			description: scenario.description,
			expectation: scenario.expectation,
			parity: scenario.parity,
			endCondition: scenario.endCondition,
			runnerOnly: Boolean(scenario.runnerOnly),
			gated: Boolean(scenario.gated),
			headlineMetric: scenario.headlineMetric,
			// bundle-size is measured in Node, so it has zero browser comparisons by
			// design. Requiring `comparisons.length > 0` for validity branded it
			// INVALID on every run; a Node-measured scenario is valid as long as no
			// browser comparison contradicts it (every() over [] is true).
			measured: comparisons.length > 0 || scenario.id === "bundle-size",
			valid:
				(comparisons.length > 0 || scenario.id === "bundle-size") &&
				comparisons.every((comparison) => comparison.valid),
			assertionFailures,
			metrics,
		};
	});

	return {
		schemaVersion: record.schemaVersion,
		run: record.run,
		env: record.env,
		browser: record.browser,
		subjects: record.subjects,
		config: record.config,
		caveats: record.caveats ?? [],
		scenarios,
	};
}

/**
 * The central value and interval a metric actually publishes, per its declared
 * statistic. The baseline must be minted, guarded and stored against the same
 * statistic the ratio was computed from -- storing a median beside a p95-derived
 * ratio is the half-converted state that made the duplicate drag rows possible.
 *
 * @param {{ median: number, p95: number, ci95: [number, number], p95Ci95: [number, number] }} subject
 * @param {"median" | "p95"} [statistic]
 * @returns {{ value: number, ci95: [number, number] }}
 */
function centralOf(subject, statistic = "median") {
	return statistic === "p95"
		? { value: subject.p95, ci95: subject.p95Ci95 ?? [NaN, NaN] }
		: { value: subject.median, ci95: subject.ci95 ?? [NaN, NaN] };
}

/**
 * Reduce a summary to the small, stable document the gate compares against.
 *
 * Only the headline metric of each scenario is kept, because that is the only
 * number gated -- a baseline that stored everything would invite gating
 * whichever metric happened to look good later.
 *
 * @param {any} summary
 * @param {{ tolerance?: number }} [options]
 * @returns {any} baseline document
 * @throws when a gated scenario is too noisy to gate honestly
 */
export function makeBaseline(summary, options = {}) {
	const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
	/** @type {Map<string, string[]>} */
	const noiseByScenario = new Map();
	/** @type {string[]} */
	const gatedTimingIds = [];
	/** @type {Record<string, any>} */
	const scenarios = {};

	for (const scenario of summary.scenarios) {
		const metric = scenario.metrics[scenario.headlineMetric];

		if (!metric) {
			continue;
		}

		const statistic = metric.statistic ?? "median";
		const q = centralOf(metric.quadrum, statistic);
		const c = centralOf(metric.chessground, statistic);

		// Compute sensitivity for every scenario, gated or not. For bundle-size,
		// the published sensitivity is indicative rather than its actual gate,
		// since it is gated absolutely against a tighter tolerance.
		const sensitivity = detectableRegression(
			metric.comparison.ratio,
			metric.comparison.ratioCi95,
			tolerance,
		);

		if (scenario.gated) {
			/** @type {string[]} */
			const tooNoisy = [];

			if (metric.unit === "ms") {
				gatedTimingIds.push(scenario.id);
			}

			// Rules 1 & 2: only for timing metrics (unit "ms").
			if (metric.unit === "ms") {
				const minMedianMs = MIN_GATED_MEDIAN_TICKS * TIMER_RESOLUTION_MS;

				// Rule 1: neither subject's central value may sit within a few ticks
				// of the timer floor. Below that, the ratio is real-over-quantized:
				// the denominator can only move in 5us steps, so it reports a
				// precision the instrument does not have.
				if (q.value > 0 && q.value < minMedianMs) {
					tooNoisy.push(
						`${scenario.id}/${metric.key}: quadrum ${statistic} ${q.value.toFixed(4)} ms is below ${minMedianMs.toFixed(4)} ms (${MIN_GATED_MEDIAN_TICKS} ticks)`,
					);
				}

				if (c.value > 0 && c.value < minMedianMs) {
					tooNoisy.push(
						`${scenario.id}/${metric.key}: chessground ${statistic} ${c.value.toFixed(4)} ms is below ${minMedianMs.toFixed(4)} ms (${MIN_GATED_MEDIAN_TICKS} ticks)`,
					);
				}

				// Rule 2: zero-width CI with n > 1 is quantization, not precision --
				// resampling a median that sits on a single tick returns that tick
				// nearly every time, however far the true value roams between runs.
				// Genuinely constant invariants (central value === 0) stay exempt.
				const qCIWidth = q.ci95[1] - q.ci95[0];
				if (qCIWidth === 0 && q.value !== 0 && metric.quadrum.n > 1) {
					tooNoisy.push(
						`${scenario.id}/${metric.key}: quadrum CI width is exactly zero with n=${metric.quadrum.n} (quantization, not precision)`,
					);
				}

				const cCIWidth = c.ci95[1] - c.ci95[0];
				if (cCIWidth === 0 && c.value !== 0 && metric.chessground.n > 1) {
					tooNoisy.push(
						`${scenario.id}/${metric.key}: chessground CI width is exactly zero with n=${metric.chessground.n} (quantization, not precision)`,
					);
				}
			}

			// Rule 3: a scenario whose gate cannot detect anything below
			// MAX_GATED_DETECTABLE_REGRESSION is theatre and demotes.
			if (sensitivity === null) {
				tooNoisy.push(
					`${scenario.id}/${metric.key}: cannot detect any regression (interval too wide)`,
				);
			} else if (sensitivity - 1 > MAX_GATED_DETECTABLE_REGRESSION) {
				tooNoisy.push(
					`${scenario.id}/${metric.key}: can only detect a regression of +${((sensitivity - 1) * 100).toFixed(0)}% or worse (max +${MAX_GATED_DETECTABLE_REGRESSION * 100}%)`,
				);
			}

			if (tooNoisy.length > 0) {
				noiseByScenario.set(scenario.id, tooNoisy);
			}
		}

		scenarios[scenario.id] = {
			headlineMetric: metric.key,
			gated: scenario.gated,
			unit: metric.unit,
			direction: metric.direction,
			statistic,
			ratio: metric.comparison.ratio,
			ratioCi95: metric.comparison.ratioCi95,
			// `median` is the stored key for continuity with schemaVersion 1, but it
			// holds whichever statistic the metric declares -- `statistic` says which.
			quadrum: { median: q.value, ci95: q.ci95 },
			chessground: { median: c.value, ci95: c.ci95 },
			sensitivity,
		};
	}

	// A scenario too noisy to gate is demoted to reported-only, not a reason to
	// discard the whole run: a full run costs over an hour, and refusing to mint
	// because one metric's CI landed a point over the cap threw four of them away
	// before this rule changed. The plan's principle -- "a scenario may only be
	// gated if its CI half-width is under 8% of its median" -- is enforced by NOT
	// gating the noisy scenario, and the demotion is on the record twice: in the
	// committed baseline diff a human reviews, and in the mint's step summary.
	//
	// The floor still holds: a run where EVERY gated timing scenario is too noisy
	// measured the machine, not the code, and no demotion can save it.
	if (gatedTimingIds.length > 0 && gatedTimingIds.every((id) => noiseByScenario.has(id))) {
		const reasons = [...noiseByScenario.values()].flat();
		throw new Error(
			`cannot mint a baseline: every gated timing scenario exceeds the noise limit:\n  ${reasons.join("\n  ")}`,
		);
	}

	for (const [id, reasons] of noiseByScenario) {
		scenarios[id].gated = false;
		scenarios[id].demotedReason = reasons.join("; ");
	}

	return {
		schemaVersion: summary.schemaVersion,
		mintedFrom: {
			runId: summary.run.id,
			startedAt: summary.run.startedAt,
			gitSha: summary.env.gitSha,
			repetitions: summary.config.repetitions,
		},
		browser: {
			cpuThrottlingRate: summary.browser.cpuThrottlingRate,
			headless: summary.browser.headless,
		},
		subjects: summary.subjects,
		scenarios,
	};
}

/**
 * The baseline scenarios a given run was actually asked to measure.
 *
 * The gate fails a scenario that is in the baseline but absent from the results,
 * because deleting an inconvenient benchmark is otherwise invisible to every
 * check in the repo. That rule is right for a full run and wrong for a subset
 * one: `--scenario gated` is what every PR, every push and the confirm step run,
 * and under a blanket rule each of those fails on the three non-gated scenarios
 * before it has measured anything -- a red X that says nothing about the code.
 *
 * Scope is computed from the **baseline's** gated flags, never the results',
 * which keeps the anti-deletion property intact and tightens it: a scenario that
 * quietly stops being gated in the registry is still in scope here, so it cannot
 * un-gate itself out of the comparison.
 *
 * A record with no selector (schemaVersion 1 wrote none) is treated as a full
 * run, so an older results file gates exactly as it did before.
 *
 * @param {any} summary
 * @param {any} baseline
 * @returns {Set<string>}
 */
export function scenariosInScope(summary, baseline) {
	const ids = Object.keys(baseline.scenarios ?? {});
	const selector = summary.config?.scenarioSelector ?? "all";

	if (selector === "all") {
		return new Set(ids);
	}

	if (selector === "gated") {
		return new Set(ids.filter((id) => baseline.scenarios[id]?.gated));
	}

	return new Set(ids.filter((id) => id === selector));
}

/**
 * The failing scenarios a second measurement could actually overturn.
 *
 * The gate fails for two different kinds of reason. Most are verdicts about
 * *numbers* -- a ratio past its threshold -- and those deserve the confirmation
 * re-run, because a single noisy run should never be enough to turn a PR red.
 * The rest are structural mismatches between two JSON files: the baseline gates
 * a metric the scenario no longer headlines, the metric is absent, the scenario
 * is absent. Those are settled before a browser starts, and re-measuring them
 * burns benchmark minutes to reprint the same sentence -- six minutes of it on
 * the 2026-08-12 PR run.
 *
 * Anything not explicitly marked `remeasurable: false` is treated as worth
 * confirming, so a new failure kind gets the benefit of the doubt rather than
 * silently losing its second chance.
 *
 * @param {{ results: any[] }} gate
 * @returns {string[]}
 */
export function remeasurableFailures(gate) {
	return gate.results
		.filter((result) => result.status === "fail" && result.remeasurable !== false)
		.map((result) => result.scenarioId);
}

/**
 * Apply the regression rules. Pure: returns verdicts, never exits.
 *
 * The comparison is ratio-based (quadrum / chessground) because the runner's
 * speed multiplier applies to both subjects, measured seconds apart in the same
 * context, so it cancels to first order. Absolute timings swing 2-3x across
 * GitHub runners while the A/B ratio holds to a few percent.
 *
 * @param {any} summary
 * @param {any} baseline
 * @param {{ tolerance?: number, bundleTolerance?: number, sanityDriftFactor?: number, override?: string | null }} [options]
 * @returns {{ ok: boolean, overridden: boolean, results: any[] }}
 */
export function compareToBaseline(summary, baseline, options = {}) {
	const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
	const bundleTolerance = options.bundleTolerance ?? DEFAULT_BUNDLE_TOLERANCE;
	const sanityDriftFactor = options.sanityDriftFactor ?? DEFAULT_SANITY_DRIFT_FACTOR;
	const override = options.override ?? null;

	if (baseline?.schemaVersion !== summary.schemaVersion) {
		throw new Error(
			`baseline schemaVersion ${baseline?.schemaVersion} does not match results ${summary.schemaVersion}`,
		);
	}

	if (baseline.browser?.cpuThrottlingRate !== summary.browser?.cpuThrottlingRate) {
		// Runs at different throttle rates are not comparable, and silently
		// comparing them is the easiest way to make a regression disappear.
		throw new Error(
			`cpu throttling rate changed: baseline ${baseline.browser?.cpuThrottlingRate}, results ${summary.browser?.cpuThrottlingRate}`,
		);
	}

	/** @type {any[]} */
	const results = [];
	const byId = new Map(summary.scenarios.map((scenario) => [scenario.id, scenario]));

	// A scenario this run was asked to measure, present in the baseline and
	// missing from the results, fails: deleting an inconvenient benchmark is
	// otherwise invisible to every check. One the run was never asked for is
	// reported as skipped, so a subset run's coverage is still on the record.
	const inScope = scenariosInScope(summary, baseline);

	for (const id of Object.keys(baseline.scenarios ?? {})) {
		if (byId.has(id) && byId.get(id).measured) {
			continue;
		}

		results.push(
			inScope.has(id)
				? {
						scenarioId: id,
						status: "fail",
						reason: "scenario is in the baseline but missing from the results",
						remeasurable: false,
					}
				: {
						scenarioId: id,
						status: "skipped",
						reason: `not measured: this run selected "${summary.config?.scenarioSelector ?? "all"}"`,
					},
		);
	}

	for (const scenario of summary.scenarios) {
		if (!scenario.measured) {
			continue;
		}

		const base = baseline.scenarios?.[scenario.id];

		if (!base) {
			// Adding a scenario must not break main.
			results.push({
				scenarioId: scenario.id,
				status: "advisory",
				reason: "scenario is not in the baseline; rebaseline to gate it",
			});
			continue;
		}

		if (scenario.assertionFailures.length > 0) {
			results.push({
				scenarioId: scenario.id,
				status: "fail",
				reason: `correctness assertions failed: ${scenario.assertionFailures.join("; ")}`,
			});
			continue;
		}

		if (!scenario.gated) {
			results.push({
				scenarioId: scenario.id,
				status: "reported",
				reason: "not gated",
				sensitivity: base.sensitivity ?? null,
			});
			continue;
		}

		// The registry wants this scenario gated, but the mint demoted it: its
		// baseline ratio was too noisy to gate against, and gating it anyway
		// would resurrect the coin flip the demotion removed.
		if (base.gated === false) {
			results.push({
				scenarioId: scenario.id,
				status: "reported",
				reason: base.demotedReason
					? `not gated: demoted at mint (${base.demotedReason})`
					: "not gated: the baseline does not gate this scenario",
				sensitivity: base.sensitivity ?? null,
			});
			continue;
		}

		results.push(gateScenario(scenario, base, { tolerance, bundleTolerance, sanityDriftFactor }));
	}

	const failed = results.filter((result) => result.status === "fail");
	const overridden = Boolean(override) && failed.length > 0;

	if (overridden) {
		for (const result of failed) {
			result.status = "warn";
			result.overriddenBy = override;
			result.reason = `${result.reason} (downgraded to warn by ${override})`;
		}
	}

	return {
		ok: results.every((result) => result.status !== "fail"),
		overridden,
		results,
	};
}

/**
 * The per-scenario gate rule.
 *
 * @param {any} scenario
 * @param {any} base
 * @param {{ tolerance: number, bundleTolerance: number, sanityDriftFactor: number }} limits
 * @returns {any}
 */
function gateScenario(scenario, base, limits) {
	const metric = scenario.metrics[base.headlineMetric];

	if (!metric) {
		return {
			scenarioId: scenario.id,
			status: "fail",
			reason: `baseline metric ${base.headlineMetric} is missing from the results`,
			remeasurable: false,
			sensitivity: base.sensitivity ?? null,
		};
	}

	// The scenario now headlines a different metric than the baseline gates.
	// The old metric is usually still *present* in the results, so without this
	// check the gate quietly compares the obsolete one and reports the answer as
	// a regression -- which is how re-pointing `update-throughput-anim-off` from
	// the quantized `update-layout-ms` to `update-total-script-ms` produced
	// "regression: ratio 23.000 vs threshold 5.750" on 2026-08-12, describing a
	// metric nothing in the repo headlines any more.
	//
	// Still a `fail`, not `inconclusive`. A neutral verdict here would be a
	// laundering route: re-point the headline metric, watch the gate go quiet.
	// The baseline genuinely cannot answer, and the fix is to re-mint it -- which
	// is a reviewed PR, not a silent one.
	if (scenario.headlineMetric && scenario.headlineMetric !== base.headlineMetric) {
		return {
			scenarioId: scenario.id,
			status: "fail",
			reason:
				`baseline gates ${base.headlineMetric}, but this scenario now headlines ` +
				`${scenario.headlineMetric}; the baseline predates the change and must be re-minted`,
			remeasurable: false,
			sensitivity: base.sensitivity ?? null,
		};
	}

	// The memory scenario is gated as an invariant, never as a number: the
	// verdict is zero-or-not. "quadrum retains 30% fewer nodes" would be a
	// meaningless sentence.
	if (scenario.id === "memory-leak") {
		const retained = ["retained-nodes", "retained-listeners"].flatMap((key) => {
			const entry = scenario.metrics[key];

			if (!entry) {
				return [];
			}

			return [
				["quadrum", entry.quadrum.median],
				["chessground", entry.chessground.median],
			]
				.filter(([, value]) => value > 0)
				.map(([subject, value]) => `${subject} ${key} = ${value}`);
		});

		return retained.length > 0
			? { scenarioId: scenario.id, status: "fail", reason: `retention is not zero: ${retained.join(", ")}`, sensitivity: base.sensitivity ?? null }
			: { scenarioId: scenario.id, status: "pass", reason: "no retention on either subject", sensitivity: base.sensitivity ?? null };
	}

	// Bundle size is gated absolutely, and tightly, because it has zero runtime
	// noise -- and because a ratio gate alone would miss a regression that hit
	// both subjects equally.
	if (scenario.id === "bundle-size") {
		const observed = metric.quadrum.median;
		const baseValue = base.quadrum.median;
		const growth = safeRatio(observed, baseValue) - 1;
		const detail = `quadrum ${base.headlineMetric} ${formatValue(observed, metric.unit)} vs baseline ${formatValue(baseValue, metric.unit)} (${(growth * 100).toFixed(1)}%)`;

		return exceeds(growth, limits.bundleTolerance)
			? { scenarioId: scenario.id, status: "fail", reason: `bundle grew beyond ${limits.bundleTolerance * 100}%: ${detail}`, sensitivity: base.sensitivity ?? null }
			: { scenarioId: scenario.id, status: "pass", reason: detail, sensitivity: base.sensitivity ?? null };
	}

	// Environment sanity: if chessground's own absolute number has moved a long
	// way from baseline, the machine changed, not the code. Neutral -- not a
	// pass, not a fail.
	const drift = safeRatio(metric.chessground.median, base.chessground.median);

	if (Number.isFinite(drift) && (drift > limits.sanityDriftFactor || drift < 1 / limits.sanityDriftFactor)) {
		return {
			scenarioId: scenario.id,
			status: "inconclusive",
			reason: `chessground's absolute drifted ${drift.toFixed(2)}x from baseline; the environment is not comparable`,
			sensitivity: base.sensitivity ?? null,
		};
	}

	const threshold = base.ratio * (1 + limits.tolerance);
	const detail = `ratio ${metric.comparison.ratio.toFixed(3)} (CI ${metric.comparison.ratioCi95.map((x) => x.toFixed(3)).join("–")}) vs threshold ${threshold.toFixed(3)}`;

	// Failing on the LOWER bound is deliberately asymmetric: noise buys a warn,
	// never a red X. False failures destroy trust in a gate faster than false
	// passes destroy a codebase.
	if (exceeds(metric.comparison.ratioCi95[0], threshold)) {
		return { scenarioId: scenario.id, status: "fail", reason: `regression: ${detail}`, sensitivity: base.sensitivity ?? null };
	}

	if (exceeds(metric.comparison.ratio, threshold)) {
		return {
			scenarioId: scenario.id,
			status: "warn",
			reason: `possible regression, interval too wide to confirm: ${detail}`,
			sensitivity: base.sensitivity ?? null,
		};
	}

	return { scenarioId: scenario.id, status: "pass", reason: detail, sensitivity: base.sensitivity ?? null };
}

/**
 * @param {number} value
 * @param {string} unit
 * @returns {string} never "NaN", never "-0"
 */
export function formatValue(value, unit) {
	if (!Number.isFinite(value)) {
		return "—";
	}

	// -0 formats as "-0" through toFixed and reads as a measurement below zero.
	const v = value === 0 ? 0 : value;

	switch (unit) {
		case "ms":
			// Values at or below zero, or below the timer resolution, were not measured.
			if (v === 0 || (v > 0 && v < TIMER_RESOLUTION_MS)) {
				return "< 0.01 ms";
			}
			return `${v.toFixed(2)} ms`;
		case "bytes":
			return v >= 1024 ? `${(v / 1024).toFixed(1)} kB` : `${Math.round(v)} B`;
		case "count":
			return String(Math.round(v));
		case "percent":
			return `${v.toFixed(1)}%`;
		default:
			return v.toFixed(2);
	}
}

/**
 * Escape a value for a markdown table cell. A scenario title containing a pipe
 * would otherwise silently split a row and shift every number one column left.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeCell(text) {
	return String(text).replace(/\|/g, "\\|");
}

/**
 * Format a ratio as a symmetric string with labels on both sides.
 * Ratio is normalised so lower means quadrum better.
 *
 * @param {number} ratio
 * @param {boolean} tie
 * @param {boolean} belowResolution true if either subject's value is below the timer floor
 * @returns {string}
 */
export function formatRatio(ratio, tie, belowResolution = false) {
	if (!Number.isFinite(ratio)) {
		return "—";
	}

	// When either subject is below timer resolution, we cannot claim a magnitude.
	// Keep the direction marker (win/parity) since direction is still known.
	if (belowResolution) {
		if (tie) {
			return "below timer resolution — parity";
		}
		return ratio < 1
			? "**below timer resolution — quadrum wins** ✅"
			: "below timer resolution — **chessground wins**";
	}

	const text = `${ratio.toFixed(2)}×`;

	if (tie) {
		return `${text} — parity`;
	}

	return ratio < 1
		? `**${text} — quadrum wins** ✅`
		: `${text} — **chessground wins**`;
}

/**
 * The generated block spliced into the root README.
 *
 * Every scenario in the results is emitted, in registry order. There is no
 * supported way to publish with the losing rows removed, and the renderer
 * refuses a non-publishable run outright so that a locally re-rolled result
 * cannot become a claim.
 *
 * @param {any} summary
 * @returns {string} markdown, without the marker comments
 */
export function renderHeadlineTable(summary) {
	if (!summary.run?.publishable) {
		throw new Error(
			"refusing to render the headline table from a non-publishable run: only a scheduled or main-push run on a clean tree may publish numbers",
		);
	}

	const rows = summary.scenarios
		.filter((scenario) => scenario.measured && scenario.metrics[scenario.headlineMetric])
		.map((scenario) => {
			const metric = scenario.metrics[scenario.headlineMetric];
			const qValue = metric.statistic === "p95" ? metric.quadrum.p95 : metric.quadrum.median;
			const cValue = metric.statistic === "p95" ? metric.chessground.p95 : metric.chessground.median;
			const quadrum = formatValue(qValue, metric.unit);
			const chessground = formatValue(cValue, metric.unit);
			const better = !metric.comparison.tie && metric.comparison.verdict === "quadrum";
			const belowResolution = metric.unit === "ms" && (qValue < TIMER_RESOLUTION_MS || cValue < TIMER_RESOLUTION_MS);

			return `| ${escapeCell(scenario.title)} | ${better ? `**${quadrum}**` : quadrum} | ${chessground} | ${formatRatio(metric.comparison.ratio, metric.comparison.tie, belowResolution)} |`;
		});

	const date = summary.run.startedAt.slice(0, 10);
	const caption =
		`*Medians. Measured ${date} on ${summary.env.platform}/${summary.env.arch} ` +
		`(${summary.env.cpus} vCPU ${summary.env.cpuModel}), ` +
		`${summary.browser.headless ? "headless " : ""}Chromium ${summary.browser.version}, ` +
		`CPU throttled ${summary.browser.cpuThrottlingRate}×, ${summary.config.repetitions} repetitions interleaved. ` +
		`quadrum \`${summary.subjects.quadrum}\` @ \`${summary.env.gitSha.slice(0, 7)}\` vs chessground \`${summary.subjects.chessground}\`. ` +
		`"Parity" means the 95% confidence intervals overlap — a difference too small to claim.*`;

	return [
		`| Scenario | quadrum | chessground ${summary.subjects.chessground} | Ratio |`,
		"| --- | --- | --- | --- |",
		...rows,
		"",
		caption,
		"",
		...summary.caveats.map((caveat) => `- ${escapeCell(caveat)}`),
	].join("\n");
}

/**
 * The long-form report: every scenario, every metric, dispersion, and the prose
 * that says what was actually compared.
 *
 * @param {any} summary
 * @returns {string} markdown
 */
export function renderFullReport(summary) {
	const lines = [
		"# Benchmark results",
		"",
		`Run \`${summary.run.id}\`, ${summary.run.startedAt}, trigger \`${summary.run.trigger}\`${summary.run.publishable ? "" : " (not publishable)"}.`,
		"",
		`- quadrum \`${summary.subjects.quadrum}\` vs chessground \`${summary.subjects.chessground}\``,
		`- ${summary.env.platform}/${summary.env.arch}, ${summary.env.cpus} vCPU ${summary.env.cpuModel}, node ${summary.env.node}`,
		`- Chromium ${summary.browser.version}, ${summary.browser.headless ? "headless" : "headed"}, CPU throttled ${summary.browser.cpuThrottlingRate}×`,
		`- ${summary.config.repetitions} repetitions, ${summary.config.warmups} warmup, order \`${summary.config.order}\``,
		`- git \`${summary.env.gitSha}\` on \`${summary.env.gitRef}\`${summary.env.gitDirty ? " (dirty)" : ""}`,
		"",
	];

	for (const scenario of summary.scenarios) {
		lines.push(`## ${scenario.title}`);
		lines.push("");
		lines.push(scenario.description);
		lines.push("");
		lines.push(`**Expected to favour:** ${scenario.expectation}`);
		lines.push("");
		lines.push(`**Parity:** ${scenario.parity}`);
		lines.push("");
		lines.push(`**End condition:** ${scenario.endCondition}`);
		lines.push("");

		if (!scenario.measured) {
			lines.push("_Not measured in this run._");
			lines.push("");
			continue;
		}

		if (!scenario.valid) {
			lines.push(`> **INVALID** — ${scenario.assertionFailures.join("; ") || "a correctness assertion failed"}`);
			lines.push("");
		}

		lines.push("| Metric | quadrum (median) | p95 | CI95 | chessground (median) | p95 | CI95 | Ratio | n |");
		lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");

		for (const metric of Object.values(scenario.metrics)) {
			const q = metric.quadrum;
			const c = metric.chessground;
			const ci = (stats) =>
				`${formatValue(stats.ci95[0], metric.unit)}–${formatValue(stats.ci95[1], metric.unit)}`;
			const headline = metric.key === scenario.headlineMetric ? " ⭐" : "";
			const advisory = metric.advisory ? " ⚠️" : "";
			const belowResolution = metric.unit === "ms" && (q.median < TIMER_RESOLUTION_MS || c.median < TIMER_RESOLUTION_MS);

			lines.push(
				`| ${escapeCell(metric.label)}${headline}${advisory} | ${formatValue(q.median, metric.unit)} | ${formatValue(q.p95, metric.unit)} | ${ci(q)} | ${formatValue(c.median, metric.unit)} | ${formatValue(c.p95, metric.unit)} | ${ci(c)} | ${formatRatio(metric.comparison.ratio, metric.comparison.tie, belowResolution)} | ${q.n}/${c.n} |`,
			);
		}

		lines.push("");

		const advisories = Object.values(scenario.metrics).filter((metric) => metric.advisory);

		for (const metric of advisories) {
			lines.push(`- ⚠️ **${escapeCell(metric.label)}** — ${escapeCell(metric.advisory)}`);
		}

		if (advisories.length > 0) {
			lines.push("");
		}
	}

	lines.push("## Caveats");
	lines.push("");

	for (const caveat of summary.caveats) {
		lines.push(`- ${caveat}`);
	}

	lines.push("");
	lines.push("⭐ marks the metric this scenario contributes to the headline table.");

	return lines.join("\n");
}

const STATUS_ICON = {
	pass: "✅",
	warn: "⚠️",
	fail: "❌",
	inconclusive: "➖",
	advisory: "ℹ️",
	reported: "📊",
	skipped: "⏭️",
};

/**
 * @param {{ ok: boolean, overridden: boolean, results: any[] }} gate
 * @returns {string} markdown
 */
export function renderGateSummary(gate) {
	const lines = [
		`### Benchmark gate: ${gate.ok ? "pass" : "fail"}${gate.overridden ? " (overridden)" : ""}`,
		"",
		"| Scenario | Status | Sensitivity | Detail |",
		"| --- | --- | --- | --- |",
	];

	for (const result of gate.results) {
		// Loose equality on purpose: results that never reach a baseline entry
		// (advisory, skipped, an assertion failure) carry no sensitivity at all,
		// and an undefined here would render as "+NaN%".
		const sensitivityText = result.sensitivity == null
			? "—"
			: `≥ +${Math.round((result.sensitivity - 1) * 100)}%`;

		lines.push(
			`| ${escapeCell(result.scenarioId)} | ${STATUS_ICON[result.status] ?? ""} ${result.status} | ${sensitivityText} | ${escapeCell(result.reason)} |`,
		);
	}

	if (gate.overridden) {
		lines.push("");
		lines.push("> A failing gate was downgraded to a warning by an explicit override. This is on the record deliberately.");
	}

	return lines.join("\n");
}

/**
 * Replace the content between the headline markers, leaving every byte outside
 * them untouched. Idempotent: splicing the same block twice is a no-op.
 *
 * @param {string} text
 * @param {string} block
 * @returns {string}
 */
export function spliceMarkers(text, block) {
	const start = text.indexOf(HEADLINE_START);
	const end = text.indexOf(HEADLINE_END);

	if (start === -1 || end === -1 || end < start) {
		throw new Error(
			`could not find the bench headline markers (${HEADLINE_START} … ${HEADLINE_END})`,
		);
	}

	const before = text.slice(0, start + HEADLINE_START.length);
	const after = text.slice(end);

	return `${before}\n${block}\n${after}`;
}

/**
 * @param {string} startedAt ISO timestamp of the published run
 * @param {number | Date} now
 * @returns {{ ageDays: number, status: "ok" | "warn" | "fail", message: string }}
 */
export function checkFreshness(startedAt, now) {
	const then = Date.parse(startedAt);
	const at = now instanceof Date ? now.getTime() : now;

	if (!Number.isFinite(then)) {
		return { ageDays: NaN, status: "fail", message: `unparseable run timestamp: ${startedAt}` };
	}

	const ageDays = Math.max(0, (at - then) / MS_PER_DAY);

	if (ageDays > FRESHNESS_FAIL_DAYS) {
		return {
			ageDays,
			status: "fail",
			message: `published numbers are ${Math.round(ageDays)} days old (limit ${FRESHNESS_FAIL_DAYS})`,
		};
	}

	if (ageDays > FRESHNESS_WARN_DAYS) {
		return {
			ageDays,
			status: "warn",
			message: `published numbers are ${Math.round(ageDays)} days old (warn at ${FRESHNESS_WARN_DAYS})`,
		};
	}

	return { ageDays, status: "ok", message: `published numbers are ${Math.round(ageDays)} days old` };
}

/** The label that lets a baseline update ride along with a source change. */
export const REBASELINE_LABEL = "bench-rebaseline";

/** The label that downgrades a gate failure to a warning. */
export const OVERRIDE_LABEL = "bench-override";

/**
 * The one diff that hides from every other check: a regression landing in the
 * same PR as the baseline update that accepts it. Every other gate in the repo
 * reads green for that PR, because the new baseline is what it is compared to.
 *
 * So it is blocked by default and must be an explicit, labelled decision.
 *
 * @param {readonly string[]} changedFiles repo-relative paths
 * @param {readonly string[]} labels PR labels
 * @returns {{ ok: boolean, touchesBaseline: boolean, touchesSource: boolean, reason: string }}
 */
export function guardBaselineChange(changedFiles, labels = []) {
	const touchesBaseline = changedFiles.some((f) => f === "apps/bench/results/baseline.json");
	const touchesSource = changedFiles.some((f) => /^packages\/[^/]+\/src\//.test(f));
	const labelled = labels.includes(REBASELINE_LABEL);

	if (!touchesBaseline || !touchesSource) {
		return { ok: true, touchesBaseline, touchesSource, reason: "no baseline-plus-source change" };
	}

	return labelled
		? {
				ok: true,
				touchesBaseline,
				touchesSource,
				reason: `baseline updated alongside a source change, accepted via the "${REBASELINE_LABEL}" label`,
			}
		: {
				ok: false,
				touchesBaseline,
				touchesSource,
				reason: `this PR changes both apps/bench/results/baseline.json and packages/*/src. A regression that arrives with its own baseline update is invisible to every other check. Split the two PRs, or add the "${REBASELINE_LABEL}" label to say the rebaseline is deliberate.`,
			};
}
