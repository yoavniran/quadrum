/**
 * Tests for the statistics behind every published benchmark number.
 *
 * The bulk of this file exists for one reason: `medianCi` and `p95Ci` were
 * moved off the generic `statisticCi` path onto a selection-based bootstrap over
 * a reused buffer, which took one `gate` replay of a 31-repetition results file
 * from 3m18s to 26s -- the difference between replaying a failed gate and
 * re-running the 40-minute benchmark to find out what it would have said. That
 * change is only safe if it is provably a *speed* change, so the equivalence to
 * the generic path is asserted directly against the same inputs and the same
 * seed, rather than claimed in a comment.
 */

import { clean, median, percentile, mean, stddev, mad, seededRandom, statisticCi, medianCi, p95Ci, describe as describeSamples } from "./bench-stats.mjs";

/** The generic-path estimators the fast path must agree with, exactly. */
const genericMedianCi = (xs, options) => statisticCi(xs, median, options);
const genericP95Ci = (xs, options) => statisticCi(xs, (values) => percentile(values, 0.95), options);

/**
 * Deterministic pseudo-samples with the shape real timings have: a floor near
 * zero, a right skew, and a few outliers. Generated from the seeded PRNG so the
 * fixtures never move between runs.
 *
 * @param {number} n
 * @param {number} seed
 */
function samples(n, seed) {
	const random = seededRandom(seed);

	return Array.from({ length: n }, () => {
		const base = 0.2 + random() * 0.4;

		// One in ten is an outlier, which is exactly what makes the distribution
		// skewed enough that a normal-theory interval would be wrong.
		return random() < 0.1 ? base * (5 + random() * 20) : base;
	});
}

describe("clean", () => {
	it("drops non-finite values and sorts ascending", () => {
		expect(clean([3, NaN, 1, Infinity, 2, -Infinity])).toEqual([1, 2, 3]);
	});

	it("does not mutate its input", () => {
		const input = [3, 1, 2];

		clean(input);

		expect(input).toEqual([3, 1, 2]);
	});
});

describe("median", () => {
	it("averages the middle pair at even n", () => {
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it("takes the middle value at odd n", () => {
		expect(median([5, 1, 3])).toBe(3);
	});

	it("is NaN for an empty sample rather than zero", () => {
		// Zero would read as a real measurement of zero -- the most flattering
		// possible value for a duration metric.
		expect(median([])).toBeNaN();
	});
});

describe("percentile", () => {
	it("interpolates linearly between neighbours (R-7)", () => {
		// pos = (4 - 1) * 0.5 = 1.5, so halfway between 2 and 3.
		expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
	});

	it("returns the endpoints at p=0 and p=1", () => {
		expect(percentile([1, 2, 3, 4], 0)).toBe(1);
		expect(percentile([1, 2, 3, 4], 1)).toBe(4);
	});

	it("clamps out-of-range p rather than reading past the array", () => {
		expect(percentile([1, 2, 3], 1.5)).toBe(3);
		expect(percentile([1, 2, 3], -1)).toBe(1);
	});

	it("is NaN for an empty sample", () => {
		expect(percentile([], 0.95)).toBeNaN();
	});
});

describe("stddev and mad", () => {
	it("reports stddev as NaN below two samples", () => {
		// The spread of one measurement is not zero, it is unknown.
		expect(stddev([5])).toBeNaN();
	});

	it("leaves mad untouched by an outlier that inflates stddev", () => {
		// This is the whole reason both ship: the gap between them tells a reader
		// which kind of distribution they are looking at.
		const tight = [10, 10, 10, 10, 10, 11, 9];
		const withOutlier = [...tight, 500];

		expect(mad(withOutlier)).toBe(mad(tight));
		expect(stddev(withOutlier)).toBeGreaterThan(stddev(tight) * 10);
	});

	it("computes the mean of an empty sample as NaN", () => {
		expect(mean([])).toBeNaN();
	});
});

describe("seededRandom", () => {
	it("produces the same stream for the same seed", () => {
		const a = seededRandom(0x5eed);
		const b = seededRandom(0x5eed);

		expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
	});

	it("stays inside [0, 1)", () => {
		const random = seededRandom(1);
		const values = Array.from({ length: 1000 }, random);

		expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...values)).toBeLessThan(1);
	});
});

describe("bootstrap intervals", () => {
	it("returns a degenerate interval for a single sample rather than a fabricated width", () => {
		expect(medianCi([7])).toEqual([7, 7]);
		expect(p95Ci([7])).toEqual([7, 7]);
	});

	it("returns NaN bounds when there is nothing to resample", () => {
		expect(medianCi([])).toEqual([NaN, NaN]);
		expect(p95Ci([])).toEqual([NaN, NaN]);
	});

	it("is deterministic across calls, so an interval cannot be re-rolled", () => {
		const xs = samples(200, 11);

		expect(medianCi(xs)).toEqual(medianCi(xs));
		expect(p95Ci(xs)).toEqual(p95Ci(xs));
	});

	it("brackets the point estimate it is an interval for", () => {
		const xs = samples(300, 12);
		const [lo, hi] = medianCi(xs);

		expect(lo).toBeLessThanOrEqual(median(xs));
		expect(hi).toBeGreaterThanOrEqual(median(xs));
	});

	it("narrows as the sample grows", () => {
		const width = (n) => {
			const [lo, hi] = medianCi(samples(n, 13));

			return hi - lo;
		};

		expect(width(1000)).toBeLessThan(width(50));
	});

	// The equivalence guard. If the fast path ever stops matching the generic
	// one, these fail loudly -- which is the difference between a performance
	// optimisation and a silent change to every published confidence interval.
	describe("fast path equals the generic statisticCi path", () => {
		const cases = [
			["odd n", samples(101, 1)],
			["even n", samples(100, 2)],
			["heavy duplicates", Array.from({ length: 200 }, (_, i) => (i % 3) * 0.005)],
			["all identical", Array(64).fill(0.42)],
			["two samples", [1, 9]],
			["with non-finite values mixed in", [...samples(50, 3), NaN, Infinity, -Infinity]],
			["large, the size a real run pools", samples(3000, 4)],
		];

		for (const [name, xs] of cases) {
			it(`matches for ${name}`, () => {
				expect(medianCi(xs)).toEqual(genericMedianCi(xs));
				expect(p95Ci(xs)).toEqual(genericP95Ci(xs));
			});
		}

		it("matches for a non-default seed and resample count", () => {
			const xs = samples(150, 5);
			const options = { seed: 12345, resamples: 500 };

			expect(medianCi(xs, options)).toEqual(genericMedianCi(xs, options));
			expect(p95Ci(xs, options)).toEqual(genericP95Ci(xs, options));
		});
	});
});

describe("describe", () => {
	it("ships every statistic regardless of which one is headlined", () => {
		// The mechanism against statistical selectivity: you cannot pick the
		// flattering statistic after the fact if all of them are already in the file.
		const result = describeSamples(samples(50, 6));

		expect(Object.keys(result).sort()).toEqual(
			["ci95", "mad", "max", "mean", "median", "min", "n", "p95", "p95Ci95", "raw", "stddev"].sort(),
		);
	});

	it("carries the raw samples so a third party can recompute everything", () => {
		const xs = [3, 1, 2];
		const result = describeSamples(xs);

		expect(result.raw).toEqual([1, 2, 3]);
		expect(result.n).toBe(3);
	});
});
