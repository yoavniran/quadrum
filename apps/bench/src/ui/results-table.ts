/**
 * Renders a ScenarioComparison as a results table.
 */

import type { ScenarioComparison, Metric, AdapterId } from "../core/types";

/**
 * Format a metric value according to its unit.
 */
function formatMetricValue(metric: Metric): string {
	if (!Number.isFinite(metric.value)) {
		return "—";
	}

	switch (metric.unit) {
		case "ms":
			return `${metric.value.toFixed(2)} ms`;
		case "bytes":
			return `${(metric.value / 1024).toFixed(1)} kB`;
		case "count":
			return String(Math.round(metric.value));
		case "ratio":
		case "percent":
			return metric.value.toFixed(2);
		default:
			return String(metric.value);
	}
}

/**
 * Get the CSS class for a ratio cell.
 */
function getRatioClass(ratio: number): string {
	if (!Number.isFinite(ratio)) {
		return "tie";
	}
	if (ratio < 0.95) {
		return "win";
	}
	if (ratio > 1.05) {
		return "loss";
	}
	return "tie";
}

/**
 * Format a ratio cell value.
 */
function formatRatio(ratio: number): string {
	if (!Number.isFinite(ratio)) {
		return "—";
	}
	const formatted = ratio.toFixed(2);
	if (ratio >= 0.95 && ratio <= 1.05) {
		return `${formatted}× — parity`;
	}
	return `${formatted}×`;
}

/**
 * Create the results table element.
 */
export function createResultsTable(): {
	element: HTMLElement;
	render: (c: ScenarioComparison) => void;
	clear: () => void;
} {
	const container = document.createElement("div");
	container.className = "bench-results";

	return {
		element: container,
		render(comparison: ScenarioComparison): void {
			container.innerHTML = "";

			if (!comparison.valid) {
				const warning = document.createElement("p");
				warning.style.color = "#b3261e";
				warning.style.fontWeight = "600";
				warning.textContent =
					"⚠ INVALID: one or more assertions failed. No number in this table may be quoted.";
				container.appendChild(warning);
			}

			// Collect all metric keys from both adapters
			const allKeys = new Set<string>();
			const quadrumResult = comparison.byAdapter.quadrum;
			const chessgroundResult = comparison.byAdapter.chessground;

			if (quadrumResult) {
				quadrumResult.metrics.forEach((m) => allKeys.add(m.key));
			}
			if (chessgroundResult) {
				chessgroundResult.metrics.forEach((m) => allKeys.add(m.key));
			}

			const keys = Array.from(allKeys).sort();
			const advisories: Map<string, string> = new Map();

			// Build the table
			const table = document.createElement("table");

			// Header
			const headerRow = document.createElement("tr");
			["Metric", "quadrum", "chessground", "Ratio"].forEach((text) => {
				const th = document.createElement("th");
				th.textContent = text;
				headerRow.appendChild(th);
			});
			table.appendChild(headerRow);

			// Data rows
			for (const key of keys) {
				const row = document.createElement("tr");

				// Metric label with advisory marker if present
				const labelCell = document.createElement("td");
				const qMetric = quadrumResult?.metrics.find((m) => m.key === key);
				const cMetric = chessgroundResult?.metrics.find((m) => m.key === key);
				const metric = qMetric || cMetric;

				if (metric?.advisory) {
					advisories.set(key, metric.advisory);
					labelCell.innerHTML = `${metric.label}<sup>*</sup>`;
				} else {
					labelCell.textContent = metric?.label || key;
				}
				row.appendChild(labelCell);

				// quadrum value
				const qCell = document.createElement("td");
				qCell.className = "num";
				if (qMetric) {
					qCell.textContent = formatMetricValue(qMetric);
				} else {
					qCell.textContent = "—";
				}
				row.appendChild(qCell);

				// chessground value
				const cCell = document.createElement("td");
				cCell.className = "num";
				if (cMetric) {
					cCell.textContent = formatMetricValue(cMetric);
				} else {
					cCell.textContent = "—";
				}
				row.appendChild(cCell);

				// Ratio
				const ratioCell = document.createElement("td");
				ratioCell.className = `num ${getRatioClass(comparison.ratios[key])}`;
				const ratio = comparison.ratios[key];
				if (ratio !== undefined) {
					ratioCell.textContent = formatRatio(ratio);
				} else {
					ratioCell.textContent = "—";
				}
				row.appendChild(ratioCell);

				table.appendChild(row);
			}

			container.appendChild(table);

			// Advisories section
			if (advisories.size > 0) {
				const note = document.createElement("p");
				note.className = "bench-note";
				note.innerHTML =
					"* " +
					Array.from(advisories.values())
						.map((s) => `<em>${s}</em>`)
						.join("; ");
				container.appendChild(note);
			}

			// Assertions section
			const allAssertions: Array<{
				label: string;
				passed: boolean;
				detail?: string;
				adapter: AdapterId;
			}> = [];

			if (quadrumResult) {
				quadrumResult.assertions.forEach((a) => {
					allAssertions.push({
						...a,
						adapter: "quadrum",
					});
				});
			}

			if (chessgroundResult) {
				chessgroundResult.assertions.forEach((a) => {
					allAssertions.push({
						...a,
						adapter: "chessground",
					});
				});
			}

			if (allAssertions.length > 0) {
				const assertSection = document.createElement("p");
				assertSection.className = "bench-note";
				const assertList = document.createElement("ul");
				assertList.style.margin = "0";
				assertList.style.paddingLeft = "20px";

				for (const assertion of allAssertions) {
					const item = document.createElement("li");
					const status = assertion.passed ? "✓ PASS" : "✗ FAIL";
					item.textContent = `${status}: ${assertion.adapter} — ${assertion.label}`;
					if (assertion.detail) {
						item.textContent += ` (${assertion.detail})`;
					}
					assertList.appendChild(item);
				}

				assertSection.appendChild(assertList);
				container.appendChild(assertSection);
			}

			// Ratio direction note
			const directionNote = document.createElement("p");
			directionNote.className = "bench-note";
			directionNote.textContent =
				"Lower is better for quadrum in every row; higher-is-better metrics are already inverted.";
			container.appendChild(directionNote);
		},

		clear(): void {
			container.innerHTML = "";
		},
	};
}
