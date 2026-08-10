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
	SCHEMA_VERSION,
} from "./bench-report.mjs";
import { percentile, median, medianCi, describe as describeSamples } from "./bench-stats.mjs";

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
	it("refuses to mint a baseline that gates a scenario too noisy to gate", () => {
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
	});

	it("renders an overlapping interval as parity, never as a win", () => {
		const tied = scenario({
			metrics: [metric({ quadrum: { median: 9.4, ci95: [8, 11] }, chessground: { median: 10, ci95: [8.5, 11.5] } })],
		});

		const table = renderHeadlineTable(summary([tied]));

		expect(table).toContain("parity");
		expect(table).not.toContain("**0.94×**");
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
		expect(formatValue(-0, "ms")).toBe("0.00 ms");
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
			["ci95", "mad", "max", "mean", "median", "min", "n", "p95", "raw", "stddev"].sort(),
		);
	});
});
