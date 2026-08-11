import { describe, it, expect } from "vitest";
import {
	abbaOrder,
	applyDiscard,
	metricFromSamples,
	mergePassResults,
} from "../src/core/harness";
import { median } from "../src/core/stats";
import type { ScenarioRunResult, Metric, Assertion } from "../src/core/types";

describe("harness", () => {
	describe("abbaOrder", () => {
		it("yields the correct sequence for 1 repetition", () => {
			const result = abbaOrder(1, ["quadrum", "chessground"]);
			expect(result).toEqual(["quadrum", "chessground", "chessground", "quadrum"]);
		});

		it("alternates each pair forward then reversed for 2 repetitions", () => {
			const result = abbaOrder(2, ["quadrum", "chessground"]);
			expect(result.length).toBe(8);
			expect(result).toEqual([
				"quadrum",
				"chessground",
				"chessground",
				"quadrum",
				"quadrum",
				"chessground",
				"chessground",
				"quadrum",
			]);
		});

		it("contains each id exactly 4 times for 2 repetitions", () => {
			const result = abbaOrder(2, ["quadrum", "chessground"]);
			const quadrumCount = result.filter((id) => id === "quadrum").length;
			const chessgroundCount = result.filter((id) => id === "chessground").length;
			expect(quadrumCount).toBe(4);
			expect(chessgroundCount).toBe(4);
		});

		it("is symmetric (reversed equals itself)", () => {
			const result = abbaOrder(1, ["quadrum", "chessground"]);
			const reversed = [...result].reverse();
			expect(reversed).toEqual(result);
		});

		it("distributes monotonic drift equally (symmetry property)", () => {
			// The ABBA sequence is symmetric, which is the property that makes
			// monotonic drift load equally on both subjects.
			const result = abbaOrder(1, ["a", "b"]);
			const reversed = [...result].reverse();
			expect(reversed).toEqual(result);
		});
	});

	describe("applyDiscard", () => {
		it("drops the first N samples and keeps the rest", () => {
			const result = applyDiscard([1, 2, 3, 4, 5], 2);
			expect(result.kept).toEqual([3, 4, 5]);
			expect(result.discarded).toEqual([1, 2]);
		});

		it("keeps everything when discardFirst is 0", () => {
			const result = applyDiscard([1, 2, 3, 4, 5], 0);
			expect(result.kept).toEqual([1, 2, 3, 4, 5]);
			expect(result.discarded).toEqual([]);
		});

		it("keeps an empty array when discardFirst >= length", () => {
			const result = applyDiscard([1, 2, 3], 5);
			expect(result.kept).toEqual([]);
			expect(result.discarded).toEqual([1, 2, 3]);
		});

		it("does not throw when discardFirst exceeds length", () => {
			expect(() => applyDiscard([1, 2, 3], 100)).not.toThrow();
		});
	});

	describe("metricFromSamples", () => {
		it("produces the median of KEPT samples only", () => {
			const samples = [10, 20, 30, 100, 200];
			const metric = metricFromSamples("test-metric", "Test Metric", samples, {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: 2,
			});

			// Discarding the first 2 leaves [30, 100, 200]
			// Median is 100
			expect(metric.value).toBe(100);
		});

		it("excludes discarded samples from the value computation", () => {
			const samples = [10, 20, 30, 40, 50];
			const metric = metricFromSamples("test", "Test", samples, {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: 2,
			});

			// Kept is [30, 40, 50], median is 40
			// If discarded were included, median would be 30
			expect(metric.value).toBe(40);
		});

		it("carries both samples and discarded arrays", () => {
			const samples = [1, 2, 3, 4, 5];
			const metric = metricFromSamples("test", "Test", samples, {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: 1,
			});

			expect(metric.samples).toEqual([2, 3, 4, 5]);
			expect(metric.discarded).toEqual([1]);
		});

		it("uses percentile 95 when statistic is p95", () => {
			const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
			const metric = metricFromSamples("test", "Test", samples, {
				unit: "ms",
				direction: "lower",
				statistic: "p95",
				discardFirst: 0,
			});

			// P95 of [1..10] should be 9.55
			expect(metric.value).toBeCloseTo(9.55, 1);
		});

		it("includes statistic in the returned metric", () => {
			const metric = metricFromSamples("test", "Test", [1, 2, 3], {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: 0,
			});
			expect(metric.statistic).toBe("median");
		});
	});

	describe("mergePassResults", () => {
		it("throws on an empty array", () => {
			expect(() => mergePassResults([])).toThrow("empty array");
		});

		it("returns a single pass unchanged", () => {
			const pass: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [90, 100, 110],
						statistic: "median",
					},
				],
				assertions: [{ label: "test", passed: true }],
			};

			const result = mergePassResults([pass]);
			expect(result).toEqual(pass);
		});

		it("pools samples and recomputes median across passes", () => {
			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [90, 100, 110],
						discarded: [],
						statistic: "median",
					},
				],
				assertions: [],
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 95,
						samples: [85, 95, 105],
						discarded: [],
						statistic: "median",
					},
				],
				assertions: [],
			};

			const result = mergePassResults([pass1, pass2]);
			// Pooled samples: [90, 100, 110, 85, 95, 105]
			// Sorted: [85, 90, 95, 100, 105, 110]
			// Median: (95 + 100) / 2 = 97.5
			expect(result.metrics[0].value).toBe(97.5);
			expect(result.metrics[0].samples).toEqual([90, 100, 110, 85, 95, 105]);
		});

		it("pools samples and recomputes p95 across passes", () => {
			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [1, 2, 3, 4, 5],
						discarded: [],
						statistic: "p95",
					},
				],
				assertions: [],
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [6, 7, 8, 9, 10],
						discarded: [],
						statistic: "p95",
					},
				],
				assertions: [],
			};

			const result = mergePassResults([pass1, pass2]);
			const pooledValue = result.metrics[0].value;
			// P95 of [1..10] is approximately 9.55
			expect(pooledValue).toBeCloseTo(9.55, 1);
		});

		it("concatenates discarded arrays across passes", () => {
			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [1, 2, 3],
						discarded: [1, 2],
						statistic: "median",
					},
				],
				assertions: [],
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "m1",
						label: "Metric 1",
						unit: "ms",
						direction: "lower",
						value: 100,
						samples: [4, 5, 6],
						discarded: [3],
						statistic: "median",
					},
				],
				assertions: [],
			};

			const result = mergePassResults([pass1, pass2]);
			expect(result.metrics[0].discarded).toEqual([1, 2, 3]);
		});

		it("uses the last pass's metric unchanged when not all passes have samples", () => {
			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "nodes",
						label: "Node Count",
						unit: "count",
						direction: "lower",
						value: 1000,
					},
				],
				assertions: [],
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [
					{
						key: "nodes",
						label: "Node Count",
						unit: "count",
						direction: "lower",
						value: 1100,
					},
				],
				assertions: [],
			};

			const result = mergePassResults([pass1, pass2]);
			expect(result.metrics[0].value).toBe(1100);
			expect(result.metrics[0].samples).toBeUndefined();
		});

		it("concatenates assertions across passes", () => {
			const assertions1: Assertion[] = [
				{ label: "test1", passed: true },
				{ label: "test2", passed: false, detail: "detail" },
			];

			const assertions2: Assertion[] = [
				{ label: "test3", passed: true },
			];

			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [],
				assertions: assertions1,
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [],
				assertions: assertions2,
			};

			const result = mergePassResults([pass1, pass2]);
			expect(result.assertions).toEqual([
				{ label: "test1", passed: true },
				{ label: "test2", passed: false, detail: "detail" },
				{ label: "test3", passed: true },
			]);
		});

		it("takes adapter from the first pass", () => {
			const pass1: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [],
				assertions: [],
			};

			const pass2: ScenarioRunResult = {
				adapter: "quadrum",
				metrics: [],
				assertions: [],
			};

			const result = mergePassResults([pass1, pass2]);
			expect(result.adapter).toBe("quadrum");
		});
	});
});
