/**
 * Pure statistics over number arrays. No DOM, no imports, no side effects.
 */

/**
 * Median of a number array. Copies the input before sorting; does not mutate.
 * Returns NaN for an empty array.
 */
export function median(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	const sorted = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

/**
 * Mean (average) of a number array.
 * Returns NaN for an empty array.
 */
export function mean(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Percentile of a number array using linear interpolation between closest ranks.
 * p is 0..100. Does not mutate input.
 * Throws RangeError if p is outside 0..100.
 * Returns NaN for an empty array.
 */
export function percentile(xs: readonly number[], p: number): number {
	if (p < 0 || p > 100) {
		throw new RangeError(`percentile p must be 0..100, got ${p}`);
	}
	if (xs.length === 0) return NaN;
	if (xs.length === 1) return xs[0];

	const sorted = [...xs].sort((a, b) => a - b);
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;

	if (lower === upper) return sorted[lower];
	return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Minimum of a number array.
 * Returns NaN for an empty array.
 */
export function min(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	return Math.min(...xs);
}

/**
 * Maximum of a number array.
 * Returns NaN for an empty array.
 */
export function max(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	return Math.max(...xs);
}

/**
 * Sample standard deviation (n-1). Does not mutate input.
 * Returns NaN for arrays with fewer than 2 elements.
 */
export function stddev(xs: readonly number[]): number {
	if (xs.length < 2) return NaN;
	const m = mean(xs);
	const squaredDiffs = xs.map((x) => (x - m) ** 2);
	const sumSquaredDiffs = squaredDiffs.reduce((a, b) => a + b, 0);
	return Math.sqrt(sumSquaredDiffs / (xs.length - 1));
}

/**
 * Median absolute deviation. Does not mutate input.
 * Returns NaN for an empty array.
 */
export function mad(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	const m = median(xs);
	const deviations = xs.map((x) => Math.abs(x - m));
	return median(deviations);
}

/**
 * Interquartile range (Q3 - Q1).
 * Returns NaN for an empty array.
 */
export function iqr(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	const q1 = percentile(xs, 25);
	const q3 = percentile(xs, 75);
	return q3 - q1;
}

/**
 * Ratio a / b. Returns NaN if b is 0.
 */
export function ratio(a: number, b: number): number {
	if (b === 0) return NaN;
	return a / b;
}

/**
 * Summary statistics for a number array.
 */
export interface Summary {
	readonly n: number;
	readonly min: number;
	readonly median: number;
	readonly mean: number;
	readonly p95: number;
	readonly max: number;
	readonly stddev: number;
	readonly mad: number;
	readonly iqr: number;
}

/**
 * Compute a complete summary of a number array.
 */
export function summarize(xs: readonly number[]): Summary {
	return {
		n: xs.length,
		min: min(xs),
		median: median(xs),
		mean: mean(xs),
		p95: percentile(xs, 95),
		max: max(xs),
		stddev: stddev(xs),
		mad: mad(xs),
		iqr: iqr(xs),
	};
}
