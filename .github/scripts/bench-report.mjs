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

import { describe as describeSamples, medianCi } from "./bench-stats.mjs";

export { medianCi };

/** The only results schema this file understands. */
export const SCHEMA_VERSION = 1;

/** Ratio tolerance over baseline before a gated scenario is a regression. */
export const DEFAULT_TOLERANCE = 0.15;

/** Bundle size is gated absolutely and far tighter -- it has no runtime noise. */
export const DEFAULT_BUNDLE_TOLERANCE = 0.02;

/**
 * How far chessground's own absolute timing may drift from baseline before the
 * run is called inconclusive rather than trusted.
 */
export const DEFAULT_SANITY_DRIFT_FACTOR = 2.5;

/** A gated scenario's CI half-width may not exceed this fraction of its median. */
export const MAX_GATED_CI_HALF_WIDTH = 0.08;

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
 * Compare the two subjects on one metric, normalised so that **lower always
 * means quadrum is better**, whichever way the underlying unit points.
 *
 * That normalisation is not cosmetic: it is what lets one gate rule cover every
 * metric. Without it, "higher is better" metrics would need an inverted
 * comparison somewhere, and an inverted comparison somewhere is where a
 * regression hides.
 *
 * @param {{ median: number, ci95: [number, number] }} quadrum
 * @param {{ median: number, ci95: [number, number] }} chessground
 * @param {"lower" | "higher"} direction
 * @returns {{ ratio: number, ratioCi95: [number, number], verdict: "quadrum" | "chessground" | "parity", tie: boolean }}
 */
export function compareSubjects(quadrum, chessground, direction = "lower") {
	const higher = direction === "higher";
	const ratio = higher
		? safeRatio(chessground.median, quadrum.median)
		: safeRatio(quadrum.median, chessground.median);

	const [qLo, qHi] = quadrum.ci95 ?? [NaN, NaN];
	const [cLo, cHi] = chessground.ci95 ?? [NaN, NaN];

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
				quadrum,
				chessground,
				comparison: compareSubjects(quadrum, chessground, shape.direction),
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
 * Reduce a summary to the small, stable document the gate compares against.
 *
 * Only the headline metric of each scenario is kept, because that is the only
 * number gated -- a baseline that stored everything would invite gating
 * whichever metric happened to look good later.
 *
 * @param {any} summary
 * @returns {any} baseline document
 * @throws when a gated scenario is too noisy to gate honestly
 */
export function makeBaseline(summary) {
	/** @type {string[]} */
	const tooNoisy = [];
	/** @type {Record<string, any>} */
	const scenarios = {};

	for (const scenario of summary.scenarios) {
		const metric = scenario.metrics[scenario.headlineMetric];

		if (!metric) {
			continue;
		}

		if (scenario.gated) {
			const halfWidth = (metric.quadrum.ci95[1] - metric.quadrum.ci95[0]) / 2;
			const relative = Math.abs(safeRatio(halfWidth, metric.quadrum.median));

			// A gate whose baseline is noisier than its own tolerance is not a
			// gate, it is a coin flip that occasionally blocks a PR. Zero-valued
			// invariants (retained nodes) are exempt: their spread is zero and
			// the ratio is undefined, not large.
			if (Number.isFinite(relative) && metric.quadrum.median !== 0 && relative > MAX_GATED_CI_HALF_WIDTH) {
				tooNoisy.push(
					`${scenario.id}/${metric.key}: CI half-width ${(relative * 100).toFixed(1)}% of median (max ${MAX_GATED_CI_HALF_WIDTH * 100}%)`,
				);
			}
		}

		scenarios[scenario.id] = {
			headlineMetric: metric.key,
			gated: scenario.gated,
			unit: metric.unit,
			direction: metric.direction,
			ratio: metric.comparison.ratio,
			ratioCi95: metric.comparison.ratioCi95,
			quadrum: { median: metric.quadrum.median, ci95: metric.quadrum.ci95 },
			chessground: { median: metric.chessground.median, ci95: metric.chessground.ci95 },
		};
	}

	if (tooNoisy.length > 0) {
		throw new Error(
			`cannot mint a baseline: gated scenarios exceed the noise limit:\n  ${tooNoisy.join("\n  ")}`,
		);
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

	// A scenario present in the baseline but missing from the results fails.
	// Deleting an inconvenient benchmark is otherwise invisible to every check.
	for (const id of Object.keys(baseline.scenarios ?? {})) {
		if (!byId.has(id) || !byId.get(id).measured) {
			results.push({
				scenarioId: id,
				status: "fail",
				reason: "scenario is in the baseline but missing from the results",
			});
		}
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
			results.push({ scenarioId: scenario.id, status: "reported", reason: "not gated" });
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
			? { scenarioId: scenario.id, status: "fail", reason: `retention is not zero: ${retained.join(", ")}` }
			: { scenarioId: scenario.id, status: "pass", reason: "no retention on either subject" };
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
			? { scenarioId: scenario.id, status: "fail", reason: `bundle grew beyond ${limits.bundleTolerance * 100}%: ${detail}` }
			: { scenarioId: scenario.id, status: "pass", reason: detail };
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
		};
	}

	const threshold = base.ratio * (1 + limits.tolerance);
	const detail = `ratio ${metric.comparison.ratio.toFixed(3)} (CI ${metric.comparison.ratioCi95.map((x) => x.toFixed(3)).join("–")}) vs threshold ${threshold.toFixed(3)}`;

	// Failing on the LOWER bound is deliberately asymmetric: noise buys a warn,
	// never a red X. False failures destroy trust in a gate faster than false
	// passes destroy a codebase.
	if (exceeds(metric.comparison.ratioCi95[0], threshold)) {
		return { scenarioId: scenario.id, status: "fail", reason: `regression: ${detail}` };
	}

	if (exceeds(metric.comparison.ratio, threshold)) {
		return {
			scenarioId: scenario.id,
			status: "warn",
			reason: `possible regression, interval too wide to confirm: ${detail}`,
		};
	}

	return { scenarioId: scenario.id, status: "pass", reason: detail };
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
 * @returns {string}
 */
export function formatRatio(ratio, tie) {
	if (!Number.isFinite(ratio)) {
		return "—";
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
			const quadrum = formatValue(metric.quadrum.median, metric.unit);
			const chessground = formatValue(metric.chessground.median, metric.unit);
			const better = !metric.comparison.tie && metric.comparison.verdict === "quadrum";

			return `| ${escapeCell(scenario.title)} | ${better ? `**${quadrum}**` : quadrum} | ${chessground} | ${formatRatio(metric.comparison.ratio, metric.comparison.tie)} |`;
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

			lines.push(
				`| ${escapeCell(metric.label)}${headline}${advisory} | ${formatValue(q.median, metric.unit)} | ${formatValue(q.p95, metric.unit)} | ${ci(q)} | ${formatValue(c.median, metric.unit)} | ${formatValue(c.p95, metric.unit)} | ${ci(c)} | ${formatRatio(metric.comparison.ratio, metric.comparison.tie)} | ${q.n}/${c.n} |`,
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
};

/**
 * @param {{ ok: boolean, overridden: boolean, results: any[] }} gate
 * @returns {string} markdown
 */
export function renderGateSummary(gate) {
	const lines = [
		`### Benchmark gate: ${gate.ok ? "pass" : "fail"}${gate.overridden ? " (overridden)" : ""}`,
		"",
		"| Scenario | Status | Detail |",
		"| --- | --- | --- |",
	];

	for (const result of gate.results) {
		lines.push(
			`| ${escapeCell(result.scenarioId)} | ${STATUS_ICON[result.status] ?? ""} ${result.status} | ${escapeCell(result.reason)} |`,
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
