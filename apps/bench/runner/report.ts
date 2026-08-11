/**
 * Pure aggregation and console rendering for the runner, no I/O.
 */

import type { ScenarioComparison, Metric } from "../src/core/types.ts";

/**
 * Inline a small median helper; do not import from src.
 */
function median(xs: readonly number[]): number {
	if (xs.length === 0) return NaN;
	const sorted = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

/**
 * Aggregate multiple runs into a single comparison per scenario.
 * For each metric, the value is the median across runs, and samples
 * is the concatenation of all runs' samples.
 */
export function aggregateRuns(
	runs: readonly ScenarioComparison[][],
): ScenarioComparison[] {
	const byScenario: Map<string, ScenarioComparison[]> = new Map();

	for (const run of runs) {
		for (const comparison of run) {
			if (!byScenario.has(comparison.scenarioId)) {
				byScenario.set(comparison.scenarioId, []);
			}
			byScenario.get(comparison.scenarioId)!.push(comparison);
		}
	}

	const aggregated: ScenarioComparison[] = [];

	for (const [scenarioId, comparisons] of byScenario) {
		// Merge metrics by adapter and key
		const metricsByAdapterAndKey: Map<string, Map<string, Metric[]>> = new Map();

		for (const comp of comparisons) {
			for (const [adapterId, result] of Object.entries(comp.byAdapter)) {
				if (!metricsByAdapterAndKey.has(adapterId)) {
					metricsByAdapterAndKey.set(adapterId, new Map());
				}
				const byKey = metricsByAdapterAndKey.get(adapterId)!;
				for (const metric of result.metrics) {
					if (!byKey.has(metric.key)) {
						byKey.set(metric.key, []);
					}
					byKey.get(metric.key)!.push(metric);
				}
			}
		}

		// Merge per-adapter results
		const mergedByAdapter: Record<string, any> = {};
		const allMetricKeys: Set<string> = new Set();

		for (const [adapterId, byKey] of metricsByAdapterAndKey) {
			const mergedMetrics: Metric[] = [];
			for (const [key, metrics] of byKey) {
				allMetricKeys.add(key);
				const values = metrics.map((m) => m.value);
				const allSamples = metrics.flatMap((m) => m.samples || []);
				const allDiscarded = metrics.flatMap((m) => m.discarded || []);

				mergedMetrics.push({
					key,
					label: metrics[0].label,
					unit: metrics[0].unit,
					direction: metrics[0].direction,
					value: median(values),
					samples: allSamples,
					discarded: allDiscarded.length > 0 ? allDiscarded : undefined,
					advisory: metrics[0].advisory,
				});
			}

			// Merge assertions: take the first run's assertions
			const adapterResult = comparisons[0].byAdapter[adapterId as keyof typeof comparisons[0]["byAdapter"]];
			const assertions = adapterResult?.assertions || [];

			mergedByAdapter[adapterId] = {
				adapter: adapterId as any,
				metrics: mergedMetrics,
				assertions,
			};
		}

		// Check validity: all contributing runs must be valid
		const valid = comparisons.every((c) => c.valid);

		// Compute ratios from the first comparison (template)
		const ratios: Record<string, number> = {};
		if (comparisons.length > 0) {
			for (const key of Object.keys(comparisons[0].ratios)) {
				ratios[key] = median(
					comparisons.map((c) => c.ratios[key] || NaN),
				);
			}
		}

		aggregated.push({
			scenarioId,
			options: comparisons[0].options,
			byAdapter: mergedByAdapter,
			ratios,
			valid,
			durationMs: comparisons.reduce((sum, c) => sum + c.durationMs, 0),
		});
	}

	return aggregated;
}

/**
 * Render a fixed-width text table for console output.
 * Invalid comparisons render with their numbers suppressed.
 */
export function renderConsoleTable(
	comparisons: readonly ScenarioComparison[],
): string {
	const lines: string[] = [];

	lines.push("Scenario\t|\tMetric\t|\tquadrum\t|\tchessground\t|\tRatio");
	lines.push("-".repeat(100));

	for (const comp of comparisons) {
		if (!comp.valid) {
			lines.push(`!! INVALID ${comp.scenarioId}`);
			continue;
		}

		const quadrumResult = comp.byAdapter.quadrum;
		const chessgroundResult = comp.byAdapter.chessground;

		if (!quadrumResult || !chessgroundResult) {
			lines.push(`!! MISSING ADAPTER ${comp.scenarioId}`);
			continue;
		}

		const allKeys = new Set<string>();
		for (const m of quadrumResult.metrics) {
			allKeys.add(m.key);
		}
		for (const m of chessgroundResult.metrics) {
			allKeys.add(m.key);
		}

		for (const key of allKeys) {
			const qMetric = quadrumResult.metrics.find((m) => m.key === key);
			const cMetric = chessgroundResult.metrics.find((m) => m.key === key);

			const qValue = qMetric ? formatValue(qMetric) : "";
			const cValue = cMetric ? formatValue(cMetric) : "";

			let ratioStr = "";
			if (qMetric && cMetric && comp.ratios[key] !== undefined) {
				const r = comp.ratios[key];
				if (Number.isFinite(r)) {
					if (r < 0.95) {
						ratioStr = `${r.toFixed(2)}× WIN`;
					} else if (r > 1.05) {
						ratioStr = `${r.toFixed(2)}× LOSS`;
					} else {
						ratioStr = `${r.toFixed(2)}× — parity`;
					}
				} else {
					ratioStr = "—";
				}
			}

			const label = qMetric?.label || cMetric?.label || key;
			lines.push(`${comp.scenarioId}\t|\t${label}\t|\t${qValue}\t|\t${cValue}\t|\t${ratioStr}`);
		}
	}

	lines.push("");
	lines.push("lower is better for quadrum in every row; higher-is-better metrics are already inverted");

	return lines.join("\n");
}

/**
 * Format a metric value for display.
 */
function formatValue(metric: Metric): string {
	if (!Number.isFinite(metric.value)) {
		return "—";
	}

	switch (metric.unit) {
		case "ms":
			return `${metric.value.toFixed(2)} ms`;
		case "bytes":
			return `${(metric.value / 1024).toFixed(1)} kB`;
		case "count":
			return `${Math.round(metric.value)}`;
		case "ratio":
		case "percent":
			return `${metric.value.toFixed(2)}`;
		default:
			return String(metric.value);
	}
}

/**
 * Summarize failures from all comparisons.
 */
export function summarizeFailures(
	comparisons: readonly ScenarioComparison[],
): string[] {
	const failures: string[] = [];

	for (const comp of comparisons) {
		for (const [adapterId, result] of Object.entries(comp.byAdapter)) {
			for (const assertion of result.assertions) {
				if (!assertion.passed) {
					const detail = assertion.detail ? ` — ${assertion.detail}` : "";
					failures.push(
						`${comp.scenarioId}/${adapterId}: ${assertion.label}${detail}`,
					);
				}
			}
		}
	}

	return failures;
}

/**
 * Determine the exit code based on comparison validity.
 */
export function exitCodeFor(comparisons: readonly ScenarioComparison[]): number {
	for (const comp of comparisons) {
		if (!comp.valid) {
			return 1;
		}
	}
	return 0;
}
