import { describe, it, expect } from "vitest";
import {
	median,
	mean,
	percentile,
	min,
	max,
	stddev,
	mad,
	iqr,
	ratio,
	summarize,
} from "../src/core/stats";

describe("stats", () => {
	describe("median", () => {
		it("returns the middle value of an odd-length array", () => {
			expect(median([1, 2, 3, 4, 5])).toBe(3);
		});

		it("returns the mean of the two middle values of an even-length array", () => {
			expect(median([1, 2, 3, 4])).toBe(2.5);
		});

		it("does not mutate the input", () => {
			const arr = [5, 3, 1, 4, 2];
			const original = [...arr];
			median(arr);
			expect(arr).toEqual(original);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(median([]))).toBe(true);
		});
	});

	describe("percentile", () => {
		it("percentile(xs, 50) equals median for even-length arrays", () => {
			const arr = [1, 2, 3, 4];
			expect(percentile(arr, 50)).toBe(median(arr));
		});

		it("percentile(xs, 50) equals median for odd-length arrays", () => {
			const arr = [1, 2, 3, 4, 5];
			expect(percentile(arr, 50)).toBe(median(arr));
		});

		it("percentile(xs, 0) returns the minimum", () => {
			expect(percentile([1, 2, 3, 4], 0)).toBe(1);
		});

		it("percentile(xs, 100) returns the maximum", () => {
			expect(percentile([1, 2, 3, 4], 100)).toBe(4);
		});

		it("interpolates between ranks using linear interpolation", () => {
			const result = percentile([1, 2, 3, 4], 75);
			expect(result).toBeCloseTo(3.25, 2);
		});

		it("throws RangeError for p < 0", () => {
			expect(() => percentile([1, 2, 3], -1)).toThrow(RangeError);
		});

		it("throws RangeError for p > 100", () => {
			expect(() => percentile([1, 2, 3], 101)).toThrow(RangeError);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(percentile([], 50))).toBe(true);
		});
	});

	describe("stddev", () => {
		it("computes sample standard deviation (n-1)", () => {
			const arr = [2, 4, 4, 4, 5, 5, 7, 9];
			const result = stddev(arr);
			expect(result).toBeCloseTo(2.138, 3);
		});

		it("returns 0 for a constant array", () => {
			expect(stddev([5, 5, 5, 5])).toBe(0);
		});

		it("returns NaN for arrays with fewer than 2 elements", () => {
			expect(Number.isNaN(stddev([]))).toBe(true);
			expect(Number.isNaN(stddev([5]))).toBe(true);
		});
	});

	describe("mad", () => {
		it("computes median absolute deviation", () => {
			const result = mad([1, 1, 2, 2, 4, 6, 9]);
			expect(result).toBe(1);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(mad([]))).toBe(true);
		});
	});

	describe("ratio", () => {
		it("computes a/b", () => {
			expect(ratio(4, 2)).toBe(2);
		});

		it("returns NaN when b is 0", () => {
			expect(Number.isNaN(ratio(1, 0))).toBe(true);
		});
	});

	describe("mean", () => {
		it("computes the average", () => {
			expect(mean([1, 2, 3, 4, 5])).toBe(3);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(mean([]))).toBe(true);
		});
	});

	describe("min", () => {
		it("returns the minimum value", () => {
			expect(min([5, 2, 8, 1, 9])).toBe(1);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(min([]))).toBe(true);
		});
	});

	describe("max", () => {
		it("returns the maximum value", () => {
			expect(max([5, 2, 8, 1, 9])).toBe(9);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(max([]))).toBe(true);
		});
	});

	describe("iqr", () => {
		it("computes Q3 - Q1", () => {
			const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9];
			const result = iqr(arr);
			const q1 = percentile(arr, 25);
			const q3 = percentile(arr, 75);
			expect(result).toBe(q3 - q1);
		});

		it("returns NaN for an empty array", () => {
			expect(Number.isNaN(iqr([]))).toBe(true);
		});
	});

	describe("summarize", () => {
		it("computes all summary statistics", () => {
			const arr = [1, 2, 3, 4, 5];
			const result = summarize(arr);

			expect(result.n).toBe(5);
			expect(result.min).toBe(1);
			expect(result.max).toBe(5);
			expect(result.median).toBe(3);
			expect(result.mean).toBe(3);
			expect(Number.isFinite(result.p95)).toBe(true);
			expect(Number.isFinite(result.stddev)).toBe(true);
			expect(Number.isFinite(result.mad)).toBe(true);
			expect(Number.isFinite(result.iqr)).toBe(true);
		});

		it("handles empty arrays", () => {
			const result = summarize([]);
			expect(result.n).toBe(0);
			expect(Number.isNaN(result.min)).toBe(true);
			expect(Number.isNaN(result.median)).toBe(true);
		});
	});
});
