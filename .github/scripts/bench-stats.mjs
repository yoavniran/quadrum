/**
 * Descriptive statistics and a seeded bootstrap CI for the benchmark report.
 *
 * Split out of `bench-report.mjs` because these are the functions that decide
 * what the published numbers *are* -- an off-by-one in a percentile silently
 * changes the headline -- and they deserve to be readable on their own.
 *
 * Everything here is pure and deterministic. The bootstrap uses a seeded PRNG
 * rather than Math.random specifically so that re-running the report on the
 * same JSON cannot produce a different confidence interval: a CI that moves
 * between renders is a CI you can re-roll until it says what you want.
 */

/**
 * @param {readonly number[]} xs
 * @returns {number[]} ascending copy, NaN and non-finite values dropped
 */
export function clean(xs) {
	return [...xs].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
}

/**
 * Median of an already-ascending, already-finite sample.
 *
 * Split out from `median` so the bootstrap can call it on a buffer it sorted
 * itself, instead of paying for a copy, a filter and a comparator sort on every
 * one of its thousands of resamples. Same arithmetic, no defensive work.
 *
 * @param {ArrayLike<number>} sorted non-empty, ascending
 * @returns {number}
 */
function medianOfSorted(sorted) {
	const mid = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Percentile of an already-ascending, already-finite sample. See
 * `medianOfSorted` for why this exists separately.
 *
 * @param {ArrayLike<number>} sorted non-empty, ascending
 * @param {number} p 0..1
 * @returns {number}
 */
function percentileOfSorted(sorted, p) {
	if (sorted.length === 1) {
		return sorted[0];
	}

	const pos = (sorted.length - 1) * Math.min(Math.max(p, 0), 1);
	const lower = Math.floor(pos);
	const upper = Math.ceil(pos);

	return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower);
}

/**
 * @param {readonly number[]} xs
 * @returns {number} NaN for an empty sample -- never 0, which would read as a
 * real measurement of zero.
 */
export function median(xs) {
	const sorted = clean(xs);

	return sorted.length === 0 ? NaN : medianOfSorted(sorted);
}

/**
 * Linear-interpolated percentile (the "R-7" definition, as used by NumPy and
 * Excel). Stated explicitly because percentile definitions disagree by up to a
 * whole sample at small n, which is exactly the n this benchmark has.
 *
 * @param {readonly number[]} xs
 * @param {number} p 0..1
 * @returns {number}
 */
export function percentile(xs, p) {
	const sorted = clean(xs);

	return sorted.length === 0 ? NaN : percentileOfSorted(sorted, p);
}

/**
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function mean(xs) {
	const values = clean(xs);

	return values.length === 0 ? NaN : values.reduce((sum, x) => sum + x, 0) / values.length;
}

/**
 * Sample standard deviation (n-1). NaN below two samples, because the spread of
 * one measurement is not zero, it is unknown.
 *
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function stddev(xs) {
	const values = clean(xs);

	if (values.length < 2) {
		return NaN;
	}

	const avg = mean(values);
	const sumSq = values.reduce((sum, x) => sum + (x - avg) ** 2, 0);

	return Math.sqrt(sumSq / (values.length - 1));
}

/**
 * Median absolute deviation. Reported next to stddev because these
 * distributions are right-skewed -- one GC pause inflates stddev and leaves MAD
 * alone, and the gap between them tells a reader which they are looking at.
 *
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function mad(xs) {
	const values = clean(xs);

	if (values.length === 0) {
		return NaN;
	}

	const centre = median(values);

	return median(values.map((x) => Math.abs(x - centre)));
}

/**
 * mulberry32 -- a small, fast, well-distributed seeded PRNG.
 *
 * @param {number} seed
 * @returns {() => number} uniform in [0, 1)
 */
export function seededRandom(seed) {
	let state = seed >>> 0;

	return function next() {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Percentile bootstrap 95% confidence interval for any statistic.
 *
 * Bootstrapped rather than computed from normal theory because these samples
 * are right-skewed with a hard floor at zero, so a mean +/- 1.96 sigma interval
 * would routinely include negative durations and would be too narrow in the
 * tail that actually matters.
 *
 * @param {readonly number[]} xs
 * @param {(values: number[]) => number} estimator function that computes the statistic
 * @param {{ resamples?: number, seed?: number }} [options]
 * @returns {[number, number]} [lo, hi]; [NaN, NaN] when there is nothing to
 * resample, and [x, x] for a single sample -- a degenerate interval, which is
 * honest, rather than a fabricated width.
 */
export function statisticCi(xs, estimator, options = {}) {
	const values = clean(xs);
	const resamples = options.resamples ?? 2000;
	const seed = options.seed ?? 0x5eed;

	if (values.length === 0) {
		return [NaN, NaN];
	}

	if (values.length === 1) {
		return [values[0], values[0]];
	}

	const random = seededRandom(seed);
	const estimates = new Array(resamples);

	for (let i = 0; i < resamples; i++) {
		const draw = new Array(values.length);

		for (let j = 0; j < values.length; j++) {
			draw[j] = values[Math.floor(random() * values.length)];
		}

		estimates[i] = estimator(draw);
	}

	return [percentile(estimates, 0.025), percentile(estimates, 0.975)];
}

/**
 * The k-th smallest value of `buffer[lo..hi]`, found by partial ordering rather
 * than a full sort, leaving everything below index k no greater than it.
 *
 * Partitioning is three-way (Dutch national flag) rather than the textbook
 * two-way, and that is not a detail: the bench page is cross-origin isolated,
 * so `performance.now()` resolves at 5 microseconds and the fastest metrics sit
 * a handful of ticks above that floor. Those samples are heavily quantised --
 * thousands of draws taking only a few distinct values -- which is precisely the
 * input that collapses two-way quickselect to O(n^2). Three-way partitioning
 * puts every value equal to the pivot in its final place in one pass, so the
 * degenerate case is the *fast* case.
 *
 * Mutates `buffer` in place; it is a scratch buffer that is refilled per
 * resample.
 *
 * @param {Float64Array} buffer
 * @param {number} k index into the fully-sorted order
 * @param {number} lo
 * @param {number} hi inclusive
 * @returns {number}
 */
function selectKth(buffer, k, lo, hi) {
	while (lo < hi) {
		const pivot = buffer[lo + ((hi - lo) >> 1)];
		let lt = lo;
		let gt = hi;
		let i = lo;

		while (i <= gt) {
			const value = buffer[i];

			if (value < pivot) {
				buffer[i] = buffer[lt];
				buffer[lt] = value;
				lt++;
				i++;
			} else if (value > pivot) {
				buffer[i] = buffer[gt];
				buffer[gt] = value;
				gt--;
			} else {
				i++;
			}
		}

		if (k < lt) {
			hi = lt - 1;
		} else if (k > gt) {
			lo = gt + 1;
		} else {
			// k landed inside the run of values equal to the pivot, which is
			// already in its final position.
			return buffer[k];
		}
	}

	return buffer[k];
}

/**
 * Median of an unordered scratch buffer, via selection.
 *
 * At even n the second selection is restricted to `[0, mid - 1]`, which
 * `selectKth` has already established holds the mid smallest values -- so the
 * pair costs barely more than the single.
 *
 * @param {Float64Array} buffer mutated in place
 * @param {number} n non-zero
 * @returns {number}
 */
function medianOfDraw(buffer, n) {
	const mid = n >> 1;

	if (n % 2 !== 0) {
		return selectKth(buffer, mid, 0, n - 1);
	}

	const upper = selectKth(buffer, mid, 0, n - 1);

	return (selectKth(buffer, mid - 1, 0, mid - 1) + upper) / 2;
}

/**
 * Percentile of an unordered scratch buffer, via selection. Same R-7
 * interpolation and same two order statistics as `percentileOfSorted`.
 *
 * @param {Float64Array} buffer mutated in place
 * @param {number} n non-zero
 * @param {number} p 0..1
 * @returns {number}
 */
function percentileOfDraw(buffer, n, p) {
	if (n === 1) {
		return buffer[0];
	}

	const pos = (n - 1) * Math.min(Math.max(p, 0), 1);
	const lowerIndex = Math.floor(pos);
	const upperIndex = Math.ceil(pos);
	const upper = selectKth(buffer, upperIndex, 0, n - 1);
	const lower = lowerIndex === upperIndex ? upper : selectKth(buffer, lowerIndex, 0, upperIndex);

	return lower + (upper - lower) * (pos - lowerIndex);
}

/**
 * The same percentile bootstrap as `statisticCi`, for the two estimators the
 * report actually headlines, but without the per-resample overhead.
 *
 * `statisticCi` hands each resample to a generic `estimator`, and both
 * estimators we use begin by calling `clean` -- a spread, a filter and a
 * comparator sort, allocated fresh, 2000 times per metric per subject. On a run
 * that pools ~3000 samples per metric that dominated everything: one `gate`
 * over a 31-repetition results file took 3m18s of pure CPU locally and ~5
 * minutes in CI, which is what stops anyone replaying a failed gate instead of
 * re-running the 40-minute benchmark to find out what it would have said.
 *
 * Two things make this cheap. The drawn values are already finite, so nothing
 * needs cleaning -- only one reused Float64Array, never a fresh allocation per
 * resample. And a median or a p95 needs one or two order statistics, not a
 * total order, so each resample is a `selectKth` (linear) rather than a sort
 * (linearithmic).
 *
 * This is a speed change and must never be a numbers change: the draws happen
 * in the identical order against the identical seeded PRNG, and selection
 * returns the identical order statistics a sort would have, so every interval
 * is bit-identical to the generic path. `bench-stats.test.mjs` asserts that
 * equivalence directly rather than leaving it as a claim in a comment.
 *
 * @param {readonly number[]} values finite
 * @param {(buffer: Float64Array, n: number) => number} drawEstimator
 * @param {{ resamples?: number, seed?: number }} options
 * @returns {[number, number]}
 */
function bootstrapDraws(values, drawEstimator, options) {
	const resamples = options.resamples ?? 2000;
	const seed = options.seed ?? 0x5eed;

	if (values.length === 0) {
		return [NaN, NaN];
	}

	if (values.length === 1) {
		return [values[0], values[0]];
	}

	const random = seededRandom(seed);
	const draw = new Float64Array(values.length);
	const estimates = new Float64Array(resamples);

	for (let i = 0; i < resamples; i++) {
		for (let j = 0; j < values.length; j++) {
			draw[j] = values[Math.floor(random() * values.length)];
		}

		estimates[i] = drawEstimator(draw, values.length);
	}

	estimates.sort();

	return [percentileOfSorted(estimates, 0.025), percentileOfSorted(estimates, 0.975)];
}

/**
 * Percentile bootstrap 95% confidence interval for the median.
 *
 * @param {readonly number[]} xs
 * @param {{ resamples?: number, seed?: number }} [options]
 * @returns {[number, number]} [lo, hi]; [NaN, NaN] when there is nothing to
 * resample, and [x, x] for a single sample -- a degenerate interval, which is
 * honest, rather than a fabricated width.
 */
export function medianCi(xs, options = {}) {
	return bootstrapDraws(clean(xs), medianOfDraw, options);
}

/**
 * Percentile bootstrap 95% confidence interval for the p95.
 *
 * @param {readonly number[]} xs
 * @param {{ resamples?: number, seed?: number }} [options]
 * @returns {[number, number]} [lo, hi]; [NaN, NaN] when there is nothing to
 * resample, and [x, x] for a single sample -- a degenerate interval, which is
 * honest, rather than a fabricated width.
 */
export function p95Ci(xs, options = {}) {
	return bootstrapDraws(clean(xs), (buffer, n) => percentileOfDraw(buffer, n, 0.95), options);
}

/**
 * Every descriptive number the report publishes for one sample, in one place.
 *
 * All of them ship regardless of which one a scenario headlines. That is the
 * mechanism against statistical selectivity: you cannot pick the flattering
 * statistic after the fact if every statistic is already in the file.
 *
 * @param {readonly number[]} xs
 * @param {{ seed?: number }} [options]
 * @returns {{ n: number, min: number, median: number, mean: number, p95: number,
 *   max: number, stddev: number, mad: number, ci95: [number, number],
 *   p95Ci95: [number, number], raw: number[] }}
 */
export function describe(xs, options = {}) {
	const values = clean(xs);

	return {
		n: values.length,
		min: values.length ? values[0] : NaN,
		median: median(values),
		mean: mean(values),
		p95: percentile(values, 0.95),
		max: values.length ? values[values.length - 1] : NaN,
		stddev: stddev(values),
		mad: mad(values),
		ci95: medianCi(values, options),
		p95Ci95: p95Ci(values, options),
		raw: values,
	};
}
