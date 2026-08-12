import {
	compareSubjects,
	compareToBaseline,
	summarizeRun,
	makeBaseline,
	renderHeadlineTable,
	renderFullReport,
	renderGateSummary,
	spliceMarkers,
	checkFreshness,
	formatValue,
	escapeCell,
	guardBaselineChange,
	remeasurableFailures,
	formatRatio,
	SCHEMA_VERSION,
	TIMER_RESOLUTION_MS,
	MIN_GATED_MEDIAN_TICKS,
} from "./bench-report.mjs";
import { percentile, median, medianCi, describe as describeSamples, statisticCi, p95Ci } from "./bench-stats.mjs";

/** A metric entry as `summarizeRun` produces it, with the comparison overridable. */
function metric({
	key = "m",
	label = "Layout",
	unit = "ms",
	direction = "lower",
	quadrum,
	chessground,
	comparison,
	advisory,
}) {
	return {
		key,
		label,
		unit,
		direction,
		advisory,
		quadrum: { n: 10, p95: quadrum.median, ...quadrum },
		chessground: { n: 10, p95: chessground.median, ...chessground },
		comparison: comparison ?? compareSubjects(quadrum, chessground, direction),
	};
}

function scenario({
	id = "mount",
	title = "Mount a full board",
	gated = true,
	headlineMetric = "m",
	metrics,
	assertionFailures = [],
	measured = true,
	valid = true,
}) {
	return {
		id,
		title,
		description: "d",
		expectation: "e",
		parity: "p",
		endCondition: "c",
		runnerOnly: false,
		gated,
		headlineMetric,
		measured,
		valid,
		assertionFailures,
		metrics: Object.fromEntries(metrics.map((m) => [m.key, m])),
	};
}

function summary(scenarios, overrides = {}) {
	return {
		schemaVersion: SCHEMA_VERSION,
		run: { id: "run-1", startedAt: "2026-08-01T00:00:00.000Z", durationMs: 1000, trigger: "schedule", publishable: true },
		env: { node: "v24.0.0", platform: "linux", arch: "x64", cpus: 4, cpuModel: "AMD EPYC 7763", gitSha: "9f1c0beabcdef", gitRef: "main", gitDirty: false },
		browser: { name: "chromium", version: "141.0", headless: true, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, cpuThrottlingRate: 4 },
		subjects: { quadrum: "0.2.2", chessground: "9.2.1" },
		config: { repetitions: 7, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true },
		caveats: ["CPU throttle rate: 4"],
		scenarios,
		...overrides,
	};
}

function baseline(scenarios, overrides = {}) {
	return {
		schemaVersion: SCHEMA_VERSION,
		mintedFrom: { runId: "run-0", startedAt: "2026-07-01T00:00:00.000Z", gitSha: "abc", repetitions: 31 },
		browser: { cpuThrottlingRate: 4, headless: true },
		subjects: { quadrum: "0.2.1", chessground: "9.2.1" },
		scenarios,
		...overrides,
	};
}

const statusOf = (gate, id) => gate.results.find((r) => r.scenarioId === id)?.status;

describe("compareSubjects", () => {
	it("calls a difference a tie when the confidence intervals overlap", () => {
		// The point ratio says quadrum is 6% faster. The intervals say the data
		// cannot tell the two apart, and that must beat the point estimate --
		// this is the rule that stops noise becoming a marketing claim.
		const result = compareSubjects(
			{ median: 9.4, ci95: [8.0, 11.0] },
			{ median: 10.0, ci95: [8.5, 11.5] },
			"lower",
		);

		expect(result.ratio).toBeCloseTo(0.94, 5);
		expect(result.tie).toBe(true);
		expect(result.verdict).toBe("parity");
	});

	it("calls a win only when the intervals separate", () => {
		const result = compareSubjects({ median: 4, ci95: [3.9, 4.1] }, { median: 10, ci95: [9.8, 10.2] }, "lower");

		expect(result.tie).toBe(false);
		expect(result.verdict).toBe("quadrum");
		expect(result.ratio).toBeCloseTo(0.4, 5);
	});

	it("reports a loss as a loss", () => {
		const result = compareSubjects({ median: 12, ci95: [11.8, 12.2] }, { median: 10, ci95: [9.8, 10.2] }, "lower");

		expect(result.verdict).toBe("chessground");
		expect(result.ratio).toBeGreaterThan(1);
	});

	it("inverts higher-is-better metrics so lower always means quadrum better", () => {
		const result = compareSubjects({ median: 100, ci95: [99, 101] }, { median: 50, ci95: [49, 51] }, "higher");

		// quadrum completed twice as many updates, so the normalised ratio is 0.5.
		expect(result.ratio).toBeCloseTo(0.5, 5);
		expect(result.verdict).toBe("quadrum");
	});

	it("treats zero versus zero as parity rather than NaN", () => {
		const result = compareSubjects({ median: 0, ci95: [0, 0] }, { median: 0, ci95: [0, 0] }, "lower");

		expect(result.ratio).toBe(1);
		expect(result.tie).toBe(true);
		expect(result.verdict).toBe("parity");
	});
});

describe("compareToBaseline", () => {
	const base = baseline({
		mount: {
			headlineMetric: "m",
			gated: true,
			unit: "ms",
			direction: "lower",
			ratio: 0.7,
			ratioCi95: [0.65, 0.75],
			quadrum: { median: 7, ci95: [6.8, 7.2] },
			chessground: { median: 10, ci95: [9.8, 10.2] },
		},
	});

	it("reports instead of gating a scenario the mint demoted for noise", () => {
		// The baseline records that this scenario's ratio was too noisy to gate;
		// gating it anyway would resurrect the coin flip the demotion removed --
		// even a flagrant regression against the demoted ratio must not fail.
		const demotedBase = baseline({
			mount: {
				...base.scenarios.mount,
				gated: false,
				demotedReason: "mount/m: chessground CI half-width 9.0% of median (max 8%)",
			},
		});

		const gate = compareToBaseline(
			summary([
				scenario({
					metrics: [
						metric({
							quadrum: { median: 70, ci95: [69, 71] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			demotedBase,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("reported");
		expect(gate.results.find((r) => r.scenarioId === "mount").reason).toMatch(/demoted at mint/);
		expect(gate.ok).toBe(true);
	});

	it("fails with a stale-baseline reason when the scenario re-points its headline metric", () => {
		// The 2026-08-12 dispatch: the registry had moved
		// update-throughput-anim-off from the timer-quantized `update-layout-ms`
		// to `update-total-script-ms`, but the committed baseline still gated the
		// old key -- which is still present in the results. The gate compared it
		// anyway and called the answer "regression: ratio 23.000", describing a
		// metric nothing headlines any more.
		const gate = compareToBaseline(
			summary([
				scenario({
					headlineMetric: "total-script",
					metrics: [
						// The obsolete metric is still measured and still wildly over
						// threshold -- exactly the trap. It must not be what decides.
						metric({
							key: "m",
							quadrum: { median: 0.46, ci95: [0.45, 0.47] },
							chessground: { median: 0.02, ci95: [0.02, 0.02] },
						}),
						metric({
							key: "total-script",
							quadrum: { median: 7, ci95: [6.8, 7.2] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			base,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(gate.results.find((r) => r.scenarioId === "mount").reason).toMatch(
			/baseline gates m, but this scenario now headlines total-script/,
		);
		// Not laundered into a neutral verdict: re-pointing a headline metric must
		// not be a way to make the gate go quiet.
		expect(gate.ok).toBe(false);
	});

	it("passes when the lower bound sits exactly on the threshold", () => {
		// threshold = 0.7 * 1.15 = 0.805, and the rule is a strict >. A gate that
		// fires exactly at its own limit fails on rounding, not on regressions.
		const gate = compareToBaseline(
			summary([
				scenario({
					metrics: [
						metric({
							quadrum: { median: 8.05, ci95: [8.0, 8.1] },
							chessground: { median: 10, ci95: [9.9, 10.1] },
							comparison: { ratio: 0.805, ratioCi95: [0.805, 0.81], verdict: "quadrum", tie: false },
						}),
					],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("pass");
		expect(gate.ok).toBe(true);
	});

	it("warns, and stays green, when the interval is too wide to confirm a regression", () => {
		const gate = compareToBaseline(
			summary([
				scenario({
					metrics: [
						metric({
							quadrum: { median: 9, ci95: [6, 12] },
							chessground: { median: 10, ci95: [9.9, 10.1] },
							comparison: { ratio: 0.9, ratioCi95: [0.6, 1.2], verdict: "parity", tie: true },
						}),
					],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("warn");
		expect(gate.ok).toBe(true);
	});

	it("fails on a confident regression", () => {
		const gate = compareToBaseline(
			summary([
				scenario({
					metrics: [
						metric({
							quadrum: { median: 12, ci95: [11.9, 12.1] },
							chessground: { median: 10, ci95: [9.9, 10.1] },
						}),
					],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(gate.ok).toBe(false);
	});

	it("reports inconclusive when chessground's own absolute has drifted", () => {
		// Both subjects got 3x slower: the runner changed, not the code. Neutral
		// is the only honest verdict -- calling it a pass would launder a real
		// regression on a slow machine.
		const gate = compareToBaseline(
			summary([
				scenario({
					metrics: [
						metric({
							quadrum: { median: 36, ci95: [35, 37] },
							chessground: { median: 30, ci95: [29, 31] },
						}),
					],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("inconclusive");
		expect(gate.ok).toBe(true);
	});

	it("fails when a baseline scenario is missing from the results", () => {
		// Deleting an inconvenient benchmark is invisible to every other check.
		const gate = compareToBaseline(summary([]), base);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(gate.ok).toBe(false);
	});

	describe("subset runs", () => {
		// `--scenario gated` is what every PR, every push and the confirm step
		// run. Under a blanket missing-scenario rule each of those goes red on the
		// non-gated scenarios before measuring anything -- which is what happened
		// on the 2026-08-11 dispatch: the confirm step reported
		// update-throughput-anim-on, drag-latency and resize-storm as "missing".
		const mixed = baseline({
			mount: {
				headlineMetric: "m",
				gated: true,
				unit: "ms",
				direction: "lower",
				ratio: 0.7,
				ratioCi95: [0.65, 0.75],
				quadrum: { median: 7, ci95: [6.8, 7.2] },
				chessground: { median: 10, ci95: [9.8, 10.2] },
			},
			"drag-latency": {
				headlineMetric: "m",
				gated: false,
				unit: "ms",
				direction: "lower",
				ratio: 0.88,
				ratioCi95: [0.85, 0.91],
				quadrum: { median: 1.99, ci95: [1.98, 2.0] },
				chessground: { median: 2.26, ci95: [2.25, 2.27] },
			},
		});

		const gatedOnly = (scenarios) =>
			compareToBaseline(
				summary(scenarios, {
					config: { repetitions: 7, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true, scenarioSelector: "gated" },
				}),
				mixed,
			);

		const passingMount = () =>
			scenario({
				metrics: [
					metric({
						quadrum: { median: 7, ci95: [6.9, 7.1] },
						chessground: { median: 10, ci95: [9.9, 10.1] },
					}),
				],
			});

		it("skips, rather than fails, a non-gated scenario a gated run never asked for", () => {
			const gate = gatedOnly([passingMount()]);

			expect(statusOf(gate, "drag-latency")).toBe("skipped");
			expect(statusOf(gate, "mount")).toBe("pass");
			expect(gate.ok).toBe(true);
		});

		it("still fails a gated scenario missing from a gated run", () => {
			// The anti-deletion rule has to survive the fix, or the fix is a hole.
			const gate = gatedOnly([]);

			expect(statusOf(gate, "mount")).toBe("fail");
			expect(gate.ok).toBe(false);
		});

		it("takes scope from the baseline's gated flags, not the results'", () => {
			// A scenario that quietly stops being gated in the registry must not be
			// able to un-gate itself out of the comparison.
			const gate = gatedOnly([passingMount(), scenario({ id: "drag-latency", gated: false, measured: false, metrics: [] })]);

			expect(statusOf(gate, "drag-latency")).toBe("skipped");

			const stillGated = compareToBaseline(
				summary([scenario({ id: "mount", gated: false, measured: false, metrics: [] })], {
					config: { repetitions: 7, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true, scenarioSelector: "gated" },
				}),
				mixed,
			);

			expect(statusOf(stillGated, "mount")).toBe("fail");
		});

		it("scopes a single-scenario run to that scenario alone", () => {
			const gate = compareToBaseline(
				summary([passingMount()], {
					config: { repetitions: 7, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true, scenarioSelector: "mount" },
				}),
				mixed,
			);

			expect(statusOf(gate, "drag-latency")).toBe("skipped");
			expect(gate.ok).toBe(true);
		});

		it("treats a record with no selector as a full run", () => {
			// schemaVersion 1 wrote no selector; those files must gate as before.
			const gate = compareToBaseline(summary([passingMount()]), mixed);

			expect(statusOf(gate, "drag-latency")).toBe("fail");
			expect(gate.ok).toBe(false);
		});
	});

	it("treats a scenario absent from the baseline as advisory", () => {
		const gate = compareToBaseline(
			summary([
				scenario({ id: "brand-new", metrics: [metric({ quadrum: { median: 1, ci95: [1, 1] }, chessground: { median: 1, ci95: [1, 1] } })] }),
				scenario({ metrics: [metric({ quadrum: { median: 7, ci95: [6.9, 7.1] }, chessground: { median: 10, ci95: [9.9, 10.1] } })] }),
			]),
			base,
		);

		expect(statusOf(gate, "brand-new")).toBe("advisory");
		expect(gate.ok).toBe(true);
	});

	it("fails on a correctness assertion regardless of the timings", () => {
		const gate = compareToBaseline(
			summary([
				scenario({
					assertionFailures: ["chessground: post-resize click accuracy — drifted 120.00px"],
					metrics: [metric({ quadrum: { median: 1, ci95: [1, 1] }, chessground: { median: 99, ci95: [98, 100] } })],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("fail");
	});

	it("does not gate a scenario that is only reported", () => {
		const gate = compareToBaseline(
			summary([
				scenario({
					gated: false,
					metrics: [metric({ quadrum: { median: 99, ci95: [98, 100] }, chessground: { median: 10, ci95: [9.9, 10.1] } })],
				}),
			]),
			base,
		);

		expect(statusOf(gate, "mount")).toBe("reported");
		expect(gate.ok).toBe(true);
	});

	it("throws rather than compare runs taken at different throttle rates", () => {
		expect(() =>
			compareToBaseline(
				summary([], { browser: { ...summary([]).browser, cpuThrottlingRate: 1 } }),
				base,
			),
		).toThrow(/throttling rate/);
	});

	it("throws on a baseline from another schema version", () => {
		expect(() => compareToBaseline(summary([]), baseline({}, { schemaVersion: 99 }))).toThrow(
			/schemaVersion/,
		);
	});

	describe("bundle size, gated absolutely", () => {
		const bundleBase = baseline({
			"bundle-size": {
				headlineMetric: "bundle-brotli-bytes",
				gated: true,
				unit: "bytes",
				direction: "lower",
				ratio: 0.72,
				ratioCi95: [0.72, 0.72],
				quadrum: { median: 10000, ci95: [10000, 10000] },
				chessground: { median: 14000, ci95: [14000, 14000] },
			},
		});

		const bundleSummary = (bytes) =>
			summary([
				scenario({
					id: "bundle-size",
					title: "Bundle size, min+brotli",
					headlineMetric: "bundle-brotli-bytes",
					metrics: [
						metric({
							key: "bundle-brotli-bytes",
							unit: "bytes",
							quadrum: { median: bytes, ci95: [bytes, bytes] },
							chessground: { median: 14000, ci95: [14000, 14000] },
						}),
					],
				}),
			]);

		it("passes a 1% growth", () => {
			expect(statusOf(compareToBaseline(bundleSummary(10100), bundleBase), "bundle-size")).toBe("pass");
		});

		it("fails a 3% growth", () => {
			expect(statusOf(compareToBaseline(bundleSummary(10300), bundleBase), "bundle-size")).toBe("fail");
		});
	});

	describe("memory, gated as an invariant", () => {
		const memBase = baseline({
			"memory-leak": {
				headlineMetric: "retained-nodes",
				gated: true,
				unit: "count",
				direction: "lower",
				ratio: 1,
				ratioCi95: [1, 1],
				quadrum: { median: 0, ci95: [0, 0] },
				chessground: { median: 0, ci95: [0, 0] },
			},
		});

		const memSummary = (nodes) =>
			summary([
				scenario({
					id: "memory-leak",
					title: "Retention after teardown",
					headlineMetric: "retained-nodes",
					metrics: [
						metric({ key: "retained-nodes", unit: "count", quadrum: { median: nodes, ci95: [nodes, nodes] }, chessground: { median: 0, ci95: [0, 0] } }),
						metric({ key: "retained-listeners", unit: "count", quadrum: { median: 0, ci95: [0, 0] }, chessground: { median: 0, ci95: [0, 0] } }),
					],
				}),
			]);

		it("passes at zero on both subjects", () => {
			expect(statusOf(compareToBaseline(memSummary(0), memBase), "memory-leak")).toBe("pass");
		});

		it("fails on a single retained node", () => {
			// One node is a leak. There is no tolerance band on an invariant.
			expect(statusOf(compareToBaseline(memSummary(1), memBase), "memory-leak")).toBe("fail");
		});
	});

	it("downgrades a failure to a warning under an explicit override, on the record", () => {
		const failing = summary([
			scenario({ metrics: [metric({ quadrum: { median: 12, ci95: [11.9, 12.1] }, chessground: { median: 10, ci95: [9.9, 10.1] } })] }),
		]);

		const gate = compareToBaseline(failing, base, { override: "bench-override by yoavniran" });

		expect(statusOf(gate, "mount")).toBe("warn");
		expect(gate.ok).toBe(true);
		expect(gate.overridden).toBe(true);
		expect(renderGateSummary(gate)).toContain("bench-override by yoavniran");
	});
});

describe("summarizeRun", () => {
	const record = {
		schemaVersion: SCHEMA_VERSION,
		run: { id: "run-1", startedAt: "2026-08-01T00:00:00.000Z", durationMs: 5, trigger: "schedule", publishable: true },
		env: { node: "v24.0.0", platform: "linux", arch: "x64", cpus: 4, cpuModel: "EPYC", gitSha: "9f1c0beaaaa", gitRef: "main", gitDirty: false },
		browser: { name: "chromium", version: "141.0", headless: true, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, cpuThrottlingRate: 4 },
		page: {},
		subjects: { quadrum: "0.2.2", chessground: "9.2.1" },
		config: { repetitions: 2, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true },
		scenarioMeta: [
			{ id: "mount", title: "Mount a full board", description: "d", expectation: "e", parity: "p", endCondition: "c", runnerOnly: false, headlineMetric: "mount-layout-ms", gated: true },
			{ id: "bundle-size", title: "Bundle size, min+brotli", description: "d", expectation: "e", parity: "p", endCondition: "c", runnerOnly: false, headlineMetric: "bundle-brotli-bytes", gated: true },
		],
		scenarios: [
			[
				{
					scenarioId: "mount",
					options: { sizePx: 480, iterations: 3, warmupIterations: 1, discardFirst: 0 },
					byAdapter: {
						quadrum: { adapter: "quadrum", metrics: [{ key: "mount-layout-ms", label: "Layout", unit: "ms", direction: "lower", value: 4, samples: [3, 4, 5] }], assertions: [{ label: "ok", passed: true }] },
						chessground: { adapter: "chessground", metrics: [{ key: "mount-layout-ms", label: "Layout", unit: "ms", direction: "lower", value: 8, samples: [7, 8, 9] }], assertions: [{ label: "ok", passed: true }] },
					},
					ratios: { "mount-layout-ms": 0.5 },
					valid: true,
					durationMs: 1,
				},
			],
			[
				{
					scenarioId: "mount",
					options: { sizePx: 480, iterations: 3, warmupIterations: 1, discardFirst: 0 },
					byAdapter: {
						quadrum: { adapter: "quadrum", metrics: [{ key: "mount-layout-ms", label: "Layout", unit: "ms", direction: "lower", value: 4, samples: [3, 4, 5] }], assertions: [{ label: "ok", passed: true }] },
						chessground: { adapter: "chessground", metrics: [{ key: "mount-layout-ms", label: "Layout", unit: "ms", direction: "lower", value: 8, samples: [7, 8, 9] }], assertions: [{ label: "ok", passed: true }] },
					},
					ratios: { "mount-layout-ms": 0.5 },
					valid: true,
					durationMs: 1,
				},
			],
		],
		bundleSizes: [
			{ subject: "quadrum", raw: 40000, gzip: 14000, brotli: 12000, cssRaw: 3000, cssWithArtRaw: 30000 },
			{ subject: "chessground", raw: 55000, gzip: 20000, brotli: 17000, cssRaw: 4000, cssWithArtRaw: 34000 },
		],
		caveats: ["CPU throttle rate: 4"],
	};

	it("throws on an unknown schema version rather than half-reading it", () => {
		expect(() => summarizeRun({ ...record, schemaVersion: 99 })).toThrow(/schemaVersion/);
	});

	it("pools per-iteration samples across repetitions", () => {
		const result = summarizeRun(record);
		const mount = result.scenarios.find((s) => s.id === "mount");

		expect(mount.metrics["mount-layout-ms"].quadrum.n).toBe(6);
		expect(mount.metrics["mount-layout-ms"].quadrum.median).toBe(4);
		expect(mount.metrics["mount-layout-ms"].comparison.verdict).toBe("quadrum");
	});

	it("carries the parity and end-condition prose from the page into the summary", () => {
		// These two sentences are where benchmarks lie most, so they are data,
		// not documentation that can drift from the code that produced the run.
		const mount = summarizeRun(record).scenarios.find((s) => s.id === "mount");

		expect(mount.parity).toBe("p");
		expect(mount.endCondition).toBe("c");
	});

	it("synthesises the bundle metrics from the Node-side measurements", () => {
		const bundle = summarizeRun(record).scenarios.find((s) => s.id === "bundle-size");

		expect(bundle.measured).toBe(true);
		expect(bundle.metrics["bundle-brotli-bytes"].quadrum.median).toBe(12000);
		expect(bundle.metrics["bundle-css-with-art-bytes"].quadrum.median).toBe(30000);
	});

	it("treats the Node-measured bundle scenario as valid despite zero browser comparisons", () => {
		// Regression: `valid` used to require comparisons.length > 0, which branded
		// bundle-size INVALID on every run even though nothing had failed.
		const bundle = summarizeRun(record).scenarios.find((s) => s.id === "bundle-size");

		expect(bundle.valid).toBe(true);
		expect(bundle.assertionFailures).toHaveLength(0);
	});

	it("reports a run with no repetitions as unmeasured rather than as a zero", () => {
		const empty = summarizeRun({ ...record, scenarios: [] });

		expect(empty.scenarios.find((s) => s.id === "mount").measured).toBe(false);
	});

	it("marks a scenario invalid when any repetition failed its assertions", () => {
		const broken = structuredClone(record);
		broken.scenarios[1][0].valid = false;
		broken.scenarios[1][0].byAdapter.chessground.assertions = [
			{ label: "post-resize click accuracy", passed: false, detail: "drifted 120.00px" },
		];

		const mount = summarizeRun(broken).scenarios.find((s) => s.id === "mount");

		expect(mount.valid).toBe(false);
		expect(mount.assertionFailures).toHaveLength(1);
	});
});

describe("makeBaseline", () => {
	it("refuses to mint when every gated timing scenario is too noisy to gate", () => {
		// With a single gated timing scenario, "one is noisy" and "all are noisy"
		// coincide -- a run like this measured the machine, not the code.
		expect(() =>
			makeBaseline(
				summary([
					scenario({
						metrics: [metric({ quadrum: { median: 10, ci95: [7, 13] }, chessground: { median: 10, ci95: [9.9, 10.1] } })],
					}),
				]),
			),
		).toThrow(/noise limit/);
	});

	it("demotes a noisy gated scenario to reported-only instead of failing the mint", () => {
		// A full run costs over an hour; one metric's CI landing a point over the
		// cap must cost that scenario its gate, not the whole run.
		const minted = makeBaseline(
			summary([
				scenario({
					metrics: [metric({ quadrum: { median: 10, ci95: [7, 13] }, chessground: { median: 10, ci95: [9.9, 10.1] } })],
				}),
				scenario({
					id: "steady",
					metrics: [metric({ quadrum: { median: 7, ci95: [6.95, 7.05] }, chessground: { median: 10, ci95: [9.9, 10.1] } })],
				}),
			]),
		);

		expect(minted.scenarios.mount.gated).toBe(false);
		expect(minted.scenarios.mount.demotedReason).toMatch(/quadrum CI half-width/);
		expect(minted.scenarios.steady.gated).toBe(true);
		expect(minted.scenarios.steady.demotedReason).toBeUndefined();
	});

	it("mints a baseline holding only each scenario's headline metric", () => {
		const minted = makeBaseline(
			summary([
				scenario({
					metrics: [
						metric({ quadrum: { median: 7, ci95: [6.95, 7.05] }, chessground: { median: 10, ci95: [9.9, 10.1] } }),
						metric({ key: "mount-script-ms", quadrum: { median: 1, ci95: [0, 5] }, chessground: { median: 1, ci95: [0, 5] } }),
					],
				}),
			]),
		);

		expect(Object.keys(minted.scenarios)).toEqual(["mount"]);
		expect(minted.scenarios.mount.headlineMetric).toBe("m");
		expect(minted.browser.cpuThrottlingRate).toBe(4);
	});

	it("exempts a zero-valued invariant from the noise limit", () => {
		expect(() =>
			makeBaseline(
				summary([
					scenario({
						id: "memory-leak",
						headlineMetric: "retained-nodes",
						metrics: [metric({ key: "retained-nodes", unit: "count", quadrum: { median: 0, ci95: [0, 0] }, chessground: { median: 0, ci95: [0, 0] } })],
					}),
				]),
			),
		).not.toThrow();
	});
});

describe("formatRatio", () => {
	it("returns — when ratio is not finite", () => {
		expect(formatRatio(NaN, false)).toBe("—");
		expect(formatRatio(Infinity, false)).toBe("—");
		expect(formatRatio(-Infinity, false)).toBe("—");
	});

	it("returns formatted text with parity when tie is true", () => {
		const result = formatRatio(0.95, true);
		expect(result).toBe("0.95× — parity");
	});

	it("returns quadrum wins label and checkmark when ratio < 1", () => {
		const result = formatRatio(0.58, false);
		expect(result).toBe("**0.58× — quadrum wins** ✅");
	});

	it("returns chessground wins label when ratio >= 1", () => {
		const result = formatRatio(1.2, false);
		expect(result).toBe("1.20× — **chessground wins**");
	});

	it("covers all four branches in renderHeadlineTable output", () => {
		// Test that all four branches are rendered through the table
		const quadrumWins = scenario({
			title: "Test 1",
			metrics: [metric({ quadrum: { median: 0.58, ci95: [0.5, 0.66] }, chessground: { median: 1, ci95: [0.9, 1.1] } })],
		});

		const chessgroundWins = scenario({
			title: "Test 2",
			gated: false,
			metrics: [metric({ quadrum: { median: 1.2, ci95: [1.15, 1.25] }, chessground: { median: 1, ci95: [0.95, 1.05] } })],
		});

		const tied = scenario({
			title: "Test 3",
			metrics: [metric({ quadrum: { median: 0.95, ci95: [0.8, 1.1] }, chessground: { median: 1, ci95: [0.8, 1.1] } })],
		});

		const table = renderHeadlineTable(summary([quadrumWins, chessgroundWins, tied]));

		// Verify quadrum wins row contains the label and checkmark
		expect(table).toContain("quadrum wins");
		expect(table).toContain("✅");

		// Verify chessground wins row still works
		expect(table).toContain("chessground wins");

		// Verify parity row
		expect(table).toContain("parity");
	});
});

describe("renderHeadlineTable", () => {
	const winner = scenario({
		metrics: [metric({ quadrum: { median: 4, ci95: [3.9, 4.1] }, chessground: { median: 10, ci95: [9.8, 10.2] } })],
	});

	it("refuses to publish numbers from a non-publishable run", () => {
		// Re-roll laundering: a locally re-runnable result must never be able to
		// become a README claim.
		const local = summary([winner], {
			run: { id: "run-1", startedAt: "2026-08-01T00:00:00.000Z", durationMs: 1, trigger: "manual", publishable: false },
		});

		expect(() => renderHeadlineTable(local)).toThrow(/non-publishable/);
	});

	it("emits a row for every measured scenario, losses included", () => {
		const loser = scenario({
			id: "drag-latency",
			title: "Drag latency, p95",
			gated: false,
			metrics: [metric({ quadrum: { median: 8.9, ci95: [8.8, 9.0] }, chessground: { median: 7.4, ci95: [7.3, 7.5] } })],
		});

		const table = renderHeadlineTable(summary([winner, loser]));

		expect(table).toContain("Mount a full board");
		expect(table).toContain("Drag latency, p95");
		expect(table).toContain("chessground wins");
		// Check that quadrum wins are labelled symmetrically
		expect(table).toContain("quadrum wins");
		expect(table).toContain("✅");
	});

	it("renders an overlapping interval as parity, never as a win", () => {
		const tied = scenario({
			metrics: [metric({ quadrum: { median: 9.4, ci95: [8, 11] }, chessground: { median: 10, ci95: [8.5, 11.5] } })],
		});

		const table = renderHeadlineTable(summary([tied]));

		expect(table).toContain("parity");
		expect(table).not.toContain("quadrum wins");
		expect(table).not.toContain("chessground wins");
	});

	it("takes its date from the run, not from the clock", () => {
		expect(renderHeadlineTable(summary([winner]))).toContain("Measured 2026-08-01");
	});

	it("escapes a pipe in a scenario title instead of shifting the row", () => {
		const piped = scenario({ title: "Mount | teardown", metrics: [metric({ quadrum: { median: 4, ci95: [3.9, 4.1] }, chessground: { median: 10, ci95: [9.8, 10.2] } })] });

		expect(renderHeadlineTable(summary([piped]))).toContain("Mount \\| teardown");
	});
});

describe("renderFullReport", () => {
	it("prints the parity and end-condition prose for every scenario", () => {
		const report = renderFullReport(
			summary([scenario({ metrics: [metric({ quadrum: { median: 4, ci95: [3.9, 4.1] }, chessground: { median: 10, ci95: [9.8, 10.2] } })] })]),
		);

		expect(report).toContain("**Parity:** p");
		expect(report).toContain("**End condition:** c");
	});

	it("flags an invalid scenario instead of printing its numbers as fact", () => {
		const report = renderFullReport(
			summary([
				scenario({
					valid: false,
					assertionFailures: ["chessground: post-resize click accuracy"],
					metrics: [metric({ quadrum: { median: 1, ci95: [1, 1] }, chessground: { median: 99, ci95: [98, 100] } })],
				}),
			]),
		);

		expect(report).toContain("INVALID");
	});

	it("surfaces an advisory metric rather than letting it read as a hard number", () => {
		const report = renderFullReport(
			summary([
				scenario({
					metrics: [
						metric({
							advisory: "reported, never gated; GC scheduling is nondeterministic",
							quadrum: { median: 1, ci95: [1, 1] },
							chessground: { median: 1, ci95: [1, 1] },
						}),
					],
				}),
			]),
		);

		expect(report).toContain("never gated");
	});
});

describe("spliceMarkers", () => {
	const readme = "# Quadrum\n\nintro\n\n<!-- bench:headline:start -->\nOLD\n<!-- bench:headline:end -->\n\ntail\n";

	it("replaces only the block between the markers", () => {
		const spliced = spliceMarkers(readme, "NEW");

		expect(spliced).toContain("NEW");
		expect(spliced).not.toContain("OLD");
		expect(spliced.startsWith("# Quadrum\n\nintro\n\n")).toBe(true);
		expect(spliced.endsWith("\n\ntail\n")).toBe(true);
	});

	it("is idempotent", () => {
		const once = spliceMarkers(readme, "NEW");

		expect(spliceMarkers(once, "NEW")).toBe(once);
	});

	it("throws when the markers are gone", () => {
		expect(() => spliceMarkers("# Quadrum\n", "NEW")).toThrow(/markers/);
	});
});

describe("checkFreshness", () => {
	const at = (days) => Date.parse("2026-08-01T00:00:00.000Z") + days * 24 * 60 * 60 * 1000;

	it("is ok inside the warn window", () => {
		expect(checkFreshness("2026-08-01T00:00:00.000Z", at(10)).status).toBe("ok");
	});

	it("warns past 45 days", () => {
		expect(checkFreshness("2026-08-01T00:00:00.000Z", at(46)).status).toBe("warn");
	});

	it("fails past 120 days", () => {
		expect(checkFreshness("2026-08-01T00:00:00.000Z", at(121)).status).toBe("fail");
	});

	it("fails an unparseable timestamp rather than treating it as fresh", () => {
		expect(checkFreshness("not-a-date", at(0)).status).toBe("fail");
	});
});

describe("formatValue", () => {
	it("never emits NaN or Infinity into a table", () => {
		expect(formatValue(NaN, "ms")).toBe("—");
		expect(formatValue(Infinity, "bytes")).toBe("—");
	});

	it("never emits a negative zero", () => {
		expect(formatValue(-0, "ms")).toBe("< 0.01 ms");
		expect(formatValue(-0, "count")).toBe("0");
	});

	it("switches bytes to kB only once there are kilobytes to show", () => {
		expect(formatValue(512, "bytes")).toBe("512 B");
		expect(formatValue(14336, "bytes")).toBe("14.0 kB");
	});
});

describe("escapeCell", () => {
	it("escapes pipes", () => {
		expect(escapeCell("a|b")).toBe("a\\|b");
	});
});

describe("guardBaselineChange", () => {
	const SOURCE = "packages/core/src/board.ts";
	const BASELINE = "apps/bench/results/baseline.json";

	it("allows a source change on its own", () => {
		expect(guardBaselineChange([SOURCE]).ok).toBe(true);
	});

	it("allows a baseline refresh on its own", () => {
		expect(guardBaselineChange([BASELINE, "apps/bench/results/latest.json"]).ok).toBe(true);
	});

	it("blocks a source change riding in with its own baseline update", () => {
		// The one diff every other check in the repo reads as green.
		const verdict = guardBaselineChange([SOURCE, BASELINE]);

		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toMatch(/bench-rebaseline/);
	});

	it("allows it when the rebaseline is a labelled decision", () => {
		expect(guardBaselineChange([SOURCE, BASELINE], ["bench-rebaseline"]).ok).toBe(true);
	});

	it("does not mistake a test or a doc for library source", () => {
		expect(guardBaselineChange(["packages/core/test/board.test.ts", BASELINE]).ok).toBe(true);
		expect(guardBaselineChange(["docs/plans/benchmarks-vs-chessground.md", BASELINE]).ok).toBe(true);
	});
});

describe("bench-stats", () => {
	it("interpolates percentiles rather than picking a neighbouring sample", () => {
		expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
		expect(percentile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85, 5);
	});

	it("returns NaN for an empty sample instead of a zero that reads as a measurement", () => {
		expect(median([])).toBeNaN();
		expect(percentile([], 0.5)).toBeNaN();
	});

	it("produces the same confidence interval every time it is asked", () => {
		// A CI that moves between renders is a CI you can re-roll until it
		// says what you want.
		const samples = [3, 4, 4, 5, 5, 5, 6, 6, 7, 12];

		expect(medianCi(samples)).toEqual(medianCi(samples));
	});

	it("gives a single sample a degenerate interval rather than a fabricated width", () => {
		expect(medianCi([7])).toEqual([7, 7]);
	});

	it("reports every statistic regardless of which one a scenario headlines", () => {
		const stats = describeSamples([1, 2, 3, 4, 5]);

		expect(Object.keys(stats).sort()).toEqual(
			["ci95", "mad", "max", "mean", "median", "min", "n", "p95", "p95Ci95", "raw", "stddev"].sort(),
		);
	});

	// UNIT-001: bootstrap CI for any statistic, not just median
	it("statisticCi with identity estimator behaves sanely", () => {
		const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		const identity = (values) => values[0]; // simple identity-ish estimator
		const result = statisticCi(samples, identity, { seed: 0x5eed });

		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(2);
		expect(result[0]).toBeLessThanOrEqual(result[1]);
	});

	it("p95Ci returns [NaN, NaN] for an empty array", () => {
		expect(p95Ci([])).toEqual([NaN, NaN]);
	});

	it("p95Ci returns [x, x] for a single sample", () => {
		expect(p95Ci([7])).toEqual([7, 7]);
	});

	it("medianCi produces identical intervals to statisticCi with median estimator", () => {
		const samples = [3, 4, 4, 5, 5, 5, 6, 6, 7, 12];
		const options = { seed: 0x5eed };

		const medianResult = medianCi(samples, options);
		const statisticResult = statisticCi(samples, median, options);

		expect(medianResult).toEqual(statisticResult);
	});

	it("describe returns both ci95 (median's interval) and p95Ci95 (p95's interval)", () => {
		const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
		const stats = describeSamples(samples);

		expect(stats.ci95).toBeDefined();
		expect(stats.p95Ci95).toBeDefined();
		expect(Array.isArray(stats.ci95)).toBe(true);
		expect(Array.isArray(stats.p95Ci95)).toBe(true);
	});

	it("on a right-skewed sample, p95 interval sits above median interval", () => {
		// Create a right-skewed distribution: many small values, one large outlier
		const samples = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 50];
		const stats = describeSamples(samples);

		const medianLo = stats.ci95[0];
		const medianHi = stats.ci95[1];
		const p95Lo = stats.p95Ci95[0];
		const p95Hi = stats.p95Ci95[1];

		// The p95 value should be greater than or equal to the median value
		expect(stats.p95).toBeGreaterThanOrEqual(stats.median);
		// The p95 interval should generally sit above the median interval
		// (at least its lower bound should be >= median's lower bound)
		expect(p95Lo).toBeGreaterThanOrEqual(medianLo);
	});
});

// UNIT-002: compare the statistic the metric actually declares
describe("compareSubjects with statistic parameter", () => {
	it("two metrics from same sample with different statistics produce different ratios", () => {
		const quadrumSamples = [10, 12, 14, 16, 18];
		const chessgoundSamples = [20, 22, 24, 26, 28];

		const quadrum = describeSamples(quadrumSamples);
		const chessground = describeSamples(chessgoundSamples);

		// Compare using median
		const medianRatio = compareSubjects(quadrum, chessground, "lower", "median");
		// Compare using p95
		const p95Ratio = compareSubjects(quadrum, chessground, "lower", "p95");

		// The two ratios should differ
		expect(medianRatio.ratio).not.toEqual(p95Ratio.ratio);
	});

	it("omitted statistic defaults to median", () => {
		const quadrum = { median: 10, p95: 15, ci95: [9, 11], p95Ci95: [14, 16] };
		const chessground = { median: 20, p95: 28, ci95: [19, 21], p95Ci95: [27, 29] };

		const resultDefault = compareSubjects(quadrum, chessground, "lower");
		const resultExplicit = compareSubjects(quadrum, chessground, "lower", "median");

		expect(resultDefault.ratio).toEqual(resultExplicit.ratio);
	});

	it("direction inversion (higher) works correctly under statistic p95", () => {
		const quadrum = { median: 100, p95: 150, ci95: [99, 101], p95Ci95: [149, 151] };
		const chessground = { median: 50, p95: 70, ci95: [49, 51], p95Ci95: [69, 71] };

		const result = compareSubjects(quadrum, chessground, "higher", "p95");

		// For "higher is better", chessground/quadrum ratio. quadrum is 150, chessground is 70.
		// So ratio should be 70/150 = 0.467, meaning quadrum wins
		expect(result.ratio).toBeLessThan(1);
		expect(result.verdict).toBe("quadrum");
	});

	it("direction inversion (higher) works correctly under statistic median", () => {
		const quadrum = { median: 100, p95: 150, ci95: [99, 101], p95Ci95: [149, 151] };
		const chessground = { median: 50, p95: 70, ci95: [49, 51], p95Ci95: [69, 71] };

		const result = compareSubjects(quadrum, chessground, "higher", "median");

		// For "higher is better", chessground/quadrum ratio. quadrum is 100, chessground is 50.
		// So ratio should be 50/100 = 0.5, meaning quadrum wins
		expect(result.ratio).toBeLessThan(1);
		expect(result.verdict).toBe("quadrum");
	});
});

describe("summarizeRun with statistic propagation", () => {
	it("propagates metric's statistic field onto the emitted metric", () => {
		const rawRecord = {
			schemaVersion: SCHEMA_VERSION,
			scenarioMeta: [
				{
					id: "test-scenario",
					title: "Test",
					description: "d",
					expectation: "e",
					parity: "p",
					endCondition: "c",
					runnerOnly: false,
					gated: false,
					headlineMetric: "m",
				},
			],
			scenarios: [
				[
					{
						scenarioId: "test-scenario",
						valid: true,
						byAdapter: {
							quadrum: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 10,
										samples: [10],
										statistic: "p95",
									},
								],
							},
							chessground: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 20,
										samples: [20],
										statistic: "p95",
									},
								],
							},
						},
					},
				],
			],
		};

		const summary = summarizeRun(rawRecord);
		const metric = summary.scenarios[0].metrics["m"];

		expect(metric.statistic).toBe("p95");
	});

	it("metric with no statistic field defaults to median", () => {
		const rawRecord = {
			schemaVersion: SCHEMA_VERSION,
			scenarioMeta: [
				{
					id: "test-scenario",
					title: "Test",
					description: "d",
					expectation: "e",
					parity: "p",
					endCondition: "c",
					runnerOnly: false,
					gated: false,
					headlineMetric: "m",
				},
			],
			scenarios: [
				[
					{
						scenarioId: "test-scenario",
						valid: true,
						byAdapter: {
							quadrum: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 10,
										samples: [10],
										// No statistic field
									},
								],
							},
							chessground: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 20,
										samples: [20],
										// No statistic field
									},
								],
							},
						},
					},
				],
			],
		};

		const summary = summarizeRun(rawRecord);
		const metric = summary.scenarios[0].metrics["m"];

		expect(metric.statistic).toBe("median");
	});

	it("compareSubjects is called with the metric's statistic in summarizeRun", () => {
		const rawRecord = {
			schemaVersion: SCHEMA_VERSION,
			scenarioMeta: [
				{
					id: "test-scenario",
					title: "Test",
					description: "d",
					expectation: "e",
					parity: "p",
					endCondition: "c",
					runnerOnly: false,
					gated: false,
					headlineMetric: "m",
				},
			],
			scenarios: [
				[
					{
						scenarioId: "test-scenario",
						valid: true,
						byAdapter: {
							quadrum: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 10,
										samples: [10, 12, 14],
										statistic: "p95",
									},
								],
							},
							chessground: {
								metrics: [
									{
										key: "m",
										label: "Metric",
										unit: "ms",
										direction: "lower",
										value: 20,
										samples: [20, 22, 24],
										statistic: "p95",
									},
								],
							},
						},
					},
				],
			],
		};

		const summary = summarizeRun(rawRecord);
		const metric = summary.scenarios[0].metrics["m"];

		// The comparison should use p95 values, not medians
		expect(metric.comparison.ratio).not.toEqual(
			compareSubjects(metric.quadrum, metric.chessground, metric.direction, "median").ratio,
		);
	});
});

// UNIT-004: render sub-resolution values as such
describe("formatValue with timer resolution", () => {
	it("formatValue(0, 'ms') returns '< 0.01 ms'", () => {
		expect(formatValue(0, "ms")).toBe("< 0.01 ms");
	});

	it("formatValue(0.002, 'ms') returns '< 0.01 ms'", () => {
		expect(formatValue(0.002, "ms")).toBe("< 0.01 ms");
	});

	it("formatValue(0.02, 'ms') returns '0.02 ms'", () => {
		expect(formatValue(0.02, "ms")).toBe("0.02 ms");
	});

	it("formatValue(-0, 'ms') returns '< 0.01 ms' (not -0)", () => {
		const result = formatValue(-0, "ms");
		expect(result).toBe("< 0.01 ms");
		expect(result).not.toContain("-");
	});

	it("formatValue(NaN, ...) never emits NaN string", () => {
		expect(formatValue(NaN, "ms")).not.toContain("NaN");
		expect(formatValue(NaN, "ms")).toBe("—");
	});

	it("non-ms units are unaffected by the resolution rule", () => {
		expect(formatValue(0.002, "bytes")).toBe("0 B");
		expect(formatValue(0.002, "count")).toBe("0");
		expect(formatValue(0.002, "percent")).toBe("0.0%");
	});
});

describe("formatRatio with below resolution", () => {
	it("formatRatio with belowResolution=true and tie renders 'below timer resolution'", () => {
		const result = formatRatio(0.5, true, true);
		expect(result).toContain("below timer resolution");
		expect(result).toContain("parity");
	});

	it("formatRatio with belowResolution=true and quadrum win keeps ✅ marker", () => {
		const result = formatRatio(0.5, false, true); // ratio < 1 = quadrum wins
		expect(result).toContain("below timer resolution");
		expect(result).toContain("quadrum wins");
		expect(result).toContain("✅");
	});

	it("formatRatio with belowResolution=true and chessground win renders correctly", () => {
		const result = formatRatio(2.0, false, true); // ratio > 1 = chessground wins
		expect(result).toContain("below timer resolution");
		expect(result).toContain("chessground wins");
		expect(result).not.toContain("✅");
	});

	it("formatRatio without belowResolution renders numeric ratio", () => {
		const result = formatRatio(0.5, false, false);
		expect(result).toContain("0.50");
		expect(result).not.toContain("below timer resolution");
	});

	it("formatValue integration: quadrum 0 and chessground 0.8 renders below resolution with quadrum win marker", () => {
		const qValue = 0;
		const cValue = 0.8;
		const quadrumFormatted = formatValue(qValue, "ms");
		const chessgoundFormatted = formatValue(cValue, "ms");

		// Both should format correctly
		expect(quadrumFormatted).toBe("< 0.01 ms");
		expect(chessgoundFormatted).toBe("0.80 ms");

		// The ratio should be below resolution
		const belowResolution = qValue < TIMER_RESOLUTION_MS || cValue < TIMER_RESOLUTION_MS;
		expect(belowResolution).toBe(true);

		// The formatRatio should still mark quadrum as winner
		const result = formatRatio(0, false, belowResolution); // 0/0.8 = 0, ratio < 1 = quadrum wins
		expect(result).toContain("below timer resolution");
		expect(result).toContain("quadrum wins");
		expect(result).toContain("✅");
	});
});

// UNIT-006: refuse to mint baseline with floor-bound denominator
describe("makeBaseline validation", () => {
	function baselineScenario({ gated = true, unit = "ms", direction = "lower", qMedian = 0.15, cMedian = 0.15, qN = 10, cN = 10 } = {}) {
		return {
			id: "test",
			title: "Test Scenario",
			description: "d",
			expectation: "e",
			parity: "p",
			endCondition: "c",
			runnerOnly: false,
			gated,
			headlineMetric: "m",
			measured: true,
			valid: true,
			assertionFailures: [],
			metrics: {
				m: {
					key: "m",
					label: "Metric",
					unit,
					direction,
					statistic: "median",
					quadrum: {
						n: qN,
						median: qMedian,
						p95: qMedian,
						ci95: [qMedian * 0.95, qMedian * 1.05],
						p95Ci95: [qMedian * 0.95, qMedian * 1.05],
					},
					chessground: {
						n: cN,
						median: cMedian,
						p95: cMedian,
						ci95: [cMedian * 0.95, cMedian * 1.05],
						p95Ci95: [cMedian * 0.95, cMedian * 1.05],
					},
					comparison: {
						ratio: qMedian / cMedian,
						ratioCi95: [(qMedian * 0.95) / (cMedian * 1.05), (qMedian * 1.05) / (cMedian * 0.95)],
						verdict: "parity",
						tie: true,
					},
				},
			},
		};
	}

	function baselineSummary(scenario) {
		return {
			schemaVersion: SCHEMA_VERSION,
			run: { id: "run-1", startedAt: "2026-08-01T00:00:00.000Z", durationMs: 1000, trigger: "schedule", publishable: true },
			env: { node: "v24.0.0", platform: "linux", arch: "x64", cpus: 4, cpuModel: "AMD EPYC 7763", gitSha: "9f1c0beabcdef", gitRef: "main", gitDirty: false },
			browser: { name: "chromium", version: "141.0", headless: true, viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, cpuThrottlingRate: 4 },
			subjects: { quadrum: "0.2.2", chessground: "9.2.1" },
			config: { repetitions: 7, warmups: 1, order: "interleaved-abba", freshContextPerRepetition: true },
			caveats: [],
			scenarios: [scenario],
		};
	}

	it("throws when gated metric has chessground median below floor", () => {
		const scen = baselineScenario({ cMedian: 0.015 }); // floor-bound: 3 ticks
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).toThrow(/chessground/);
	});

	it("throws when gated metric has wide chessground CI", () => {
		const scen = baselineScenario({
			cMedian: 0.3,
			gated: true,
		});
		// Make chessground CI very wide (> 8%)
		scen.metrics.m.chessground.ci95 = [0.1, 0.5];
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).toThrow();
	});

	it("throws when gated metric has chessground CI width exactly zero with n > 1", () => {
		const scen = baselineScenario({ cMedian: 0.15, cN: 5 });
		scen.metrics.m.chessground.ci95 = [0.15, 0.15]; // exact zero width
		scen.gated = true;
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).toThrow(/chessground.*zero.*quantization/);
	});

	it("still mints retained-nodes invariant (both subjects 0, zero-width CI, count unit)", () => {
		const scen = baselineScenario({ unit: "count", qMedian: 0, cMedian: 0, qN: 5 });
		scen.metrics.m.quadrum.ci95 = [0, 0];
		scen.metrics.m.chessground.ci95 = [0, 0];
		scen.gated = true;
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).not.toThrow();
	});

	it("still mints bundle-size metric with zero-width CI in bytes", () => {
		const scen = baselineScenario({ unit: "bytes", qMedian: 10000, cMedian: 10000, qN: 5 });
		scen.metrics.m.quadrum.ci95 = [10000, 10000];
		scen.metrics.m.chessground.ci95 = [10000, 10000];
		scen.gated = true;
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).not.toThrow();
	});

	it("mints healthy gated ms metric (medians > 0.1 ms, CI half-widths < 8%)", () => {
		const scen = baselineScenario({
			qMedian: 0.5,
			cMedian: 0.5,
			unit: "ms",
			gated: true,
		});
		// Create CI half-widths of ~5%
		scen.metrics.m.quadrum.ci95 = [0.475, 0.525]; // 5% relative
		scen.metrics.m.chessground.ci95 = [0.475, 0.525]; // 5% relative
		const sum = baselineSummary(scen);

		expect(() => makeBaseline(sum)).not.toThrow();
	});

	it("stores the declared statistic in the baseline", () => {
		const scen = baselineScenario({ qMedian: 0.5, cMedian: 0.5, unit: "ms", gated: true });
		scen.metrics.m.statistic = "p95";
		scen.metrics.m.quadrum.p95 = 0.6;
		scen.metrics.m.chessground.p95 = 0.65;
		// Set CI for p95
		scen.metrics.m.quadrum.p95Ci95 = [0.57, 0.63];
		scen.metrics.m.chessground.p95Ci95 = [0.62, 0.68];
		const sum = baselineSummary(scen);

		const baseline = makeBaseline(sum);
		const stored = baseline.scenarios.test;

		expect(stored.statistic).toBe("p95");
		// The stored "median" should actually be the p95 value
		expect(stored.quadrum.median).toBe(0.6);
		expect(stored.chessground.median).toBe(0.65);
	});

	it("stores median statistic when explicitly declared", () => {
		const scen = baselineScenario({ qMedian: 0.5, cMedian: 0.5, unit: "ms", gated: true });
		scen.metrics.m.statistic = "median";
		scen.metrics.m.quadrum.median = 0.5;
		scen.metrics.m.chessground.median = 0.5;
		const sum = baselineSummary(scen);

		const baseline = makeBaseline(sum);
		const stored = baseline.scenarios.test;

		expect(stored.statistic).toBe("median");
		expect(stored.quadrum.median).toBe(0.5);
	});
});

describe("remeasurableFailures", () => {
	const base = baseline({
		mount: {
			headlineMetric: "m",
			gated: true,
			unit: "ms",
			direction: "lower",
			ratio: 0.7,
			ratioCi95: [0.65, 0.75],
			quadrum: { median: 7, ci95: [6.8, 7.2] },
			chessground: { median: 10, ci95: [9.8, 10.2] },
		},
	});

	/** @param {object} overrides */
	const mountScenario = (overrides) =>
		scenario({
			metrics: [
				metric({
					key: "m",
					quadrum: { median: 7, ci95: [6.8, 7.2] },
					chessground: { median: 10, ci95: [9.8, 10.2] },
				}),
			],
			...overrides,
		});

	it("returns nothing for a stale baseline, because no browser can change that answer", () => {
		// The 2026-08-12 PR run spent six minutes re-measuring this exact failure
		// and reprinted the same sentence. The gate stays red either way -- this
		// only decides whether a second measurement could inform the verdict.
		const gate = compareToBaseline(
			summary([
				mountScenario({
					headlineMetric: "total-script",
					metrics: [
						metric({
							key: "m",
							quadrum: { median: 0.46, ci95: [0.45, 0.47] },
							chessground: { median: 0.02, ci95: [0.02, 0.02] },
						}),
						metric({
							key: "total-script",
							quadrum: { median: 7, ci95: [6.8, 7.2] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			base,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(gate.ok).toBe(false);
		expect(remeasurableFailures(gate)).toEqual([]);
	});

	it("returns nothing when the baseline's metric is absent from the results", () => {
		// Same shape: the two files disagree about which metrics exist, which is
		// settled in git rather than in a browser.
		const gate = compareToBaseline(
			summary([
				mountScenario({
					headlineMetric: "other",
					metrics: [
						metric({
							key: "other",
							quadrum: { median: 7, ci95: [6.8, 7.2] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			base,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(remeasurableFailures(gate)).toEqual([]);
	});

	it("returns nothing when a baselined scenario is missing from the results", () => {
		const gate = compareToBaseline(summary([]), base, {});

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(remeasurableFailures(gate)).toEqual([]);
	});

	it("returns a genuine regression, which is exactly what the second run exists to check", () => {
		const gate = compareToBaseline(
			summary([
				mountScenario({
					metrics: [
						metric({
							key: "m",
							quadrum: { median: 30, ci95: [29, 31] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			base,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(remeasurableFailures(gate)).toEqual(["mount"]);
	});

	it("returns only the regression when a stale scenario fails alongside it", () => {
		// The confirmation run re-measures the scenarios it names, so a drifted
		// scenario must not be dragged along by a real regression in another one.
		const twoScenarios = baseline({
			mount: base.scenarios.mount,
			update: { ...base.scenarios.mount },
		});
		const gate = compareToBaseline(
			summary([
				mountScenario({
					metrics: [
						metric({
							key: "m",
							quadrum: { median: 30, ci95: [29, 31] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
				mountScenario({
					id: "update",
					headlineMetric: "total-script",
					metrics: [
						metric({
							key: "total-script",
							quadrum: { median: 7, ci95: [6.8, 7.2] },
							chessground: { median: 10, ci95: [9.8, 10.2] },
						}),
					],
				}),
			]),
			twoScenarios,
			{},
		);

		expect(statusOf(gate, "mount")).toBe("fail");
		expect(statusOf(gate, "update")).toBe("fail");
		expect(remeasurableFailures(gate)).toEqual(["mount"]);
	});

	it("gives an unrecognised failure kind the benefit of the doubt", () => {
		// Opt-out, not opt-in: a failure branch added later without thinking about
		// this should keep its second chance rather than silently lose it.
		const gate = {
			results: [
				{ scenarioId: "novel", status: "fail" },
				{ scenarioId: "structural", status: "fail", remeasurable: false },
				{ scenarioId: "warned", status: "warn" },
				{ scenarioId: "fine", status: "pass" },
			],
		};

		expect(remeasurableFailures(gate)).toEqual(["novel"]);
	});
});
