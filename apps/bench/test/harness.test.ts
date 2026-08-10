import { describe, it, expect } from "vitest";
import { abbaOrder, applyDiscard, metricFromSamples } from "../src/core/harness";
import { median } from "../src/core/stats";

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
	});
});
