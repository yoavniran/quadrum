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
 * @param {readonly number[]} xs
 * @returns {number} NaN for an empty sample -- never 0, which would read as a
 * real measurement of zero.
 */
export function median(xs) {
	const sorted = clean(xs);

	if (sorted.length === 0) {
		return NaN;
	}

	const mid = Math.floor(sorted.length / 2);

	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

	if (sorted.length === 0) {
		return NaN;
	}

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
 * Percentile bootstrap 95% confidence interval for the median.
 *
 * @param {readonly number[]} xs
 * @param {{ resamples?: number, seed?: number }} [options]
 * @returns {[number, number]} [lo, hi]; [NaN, NaN] when there is nothing to
 * resample, and [x, x] for a single sample -- a degenerate interval, which is
 * honest, rather than a fabricated width.
 */
export function medianCi(xs, options = {}) {
	return statisticCi(xs, median, options);
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
	return statisticCi(xs, (values) => percentile(values, 0.95), options);
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
