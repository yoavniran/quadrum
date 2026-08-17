/**
 * Scenario 'mount' — mount a full board and measure first render.
 */

import { timeScript, forceLayout, settle } from "../core/clock";
import { metricFromSamples } from "../core/harness";
import { elementCount } from "../core/guards";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const mountScenario: Scenario = {
	id: "mount",
	title: "Mount a full board",
	description: "Measure construction plus first render of the standard start position.",
	parity:
		"Both mounted with identical size, orientation, coordinates off, animation off, interactivity off, from the same FEN placement.",
	endCondition:
		"The board element has been laid out and all 32 piece boxes have non-zero geometry.",
	// Headlines on per-iteration metrics here rather than totals. Medians are 1.6 ms and
	// 1.05 ms — hundreds of ticks clear of the 5µs timer floor — so the ratio is
	// already trustworthy. Do not "fix" this one to total-time metrics.
	headlineMetric: "mount-layout-ms",
	defaults: { sizePx: 480, iterations: 25, warmupIterations: 2, discardFirst: 5 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const scriptSamples: number[] = [];
		const layoutSamples: number[] = [];
		const assertions: Assertion[] = [];
		let lastElementCount = 0;

		const { host, frame, factory, options, signal } = ctx;

		for (let i = 0; i < options.iterations; i++) {
			if (signal.aborted) {
				throw new DOMException("aborted", "AbortError");
			}

			const child = frame.document.createElement("div");
			host.appendChild(child);

			// Script timing: just the mount call
			const { ms: scriptMs } = timeScript(() => {
				factory.mount(child, {
					placement: INITIAL_PLACEMENT,
					orientation: "white",
					coordinates: false,
					animate: false,
					animationMs: 0,
					interactive: false,
					sizePx: options.sizePx,
				});
			});
			scriptSamples.push(scriptMs);

			// Force layout to measure full time
			const adapter = factory.mount(child, {
				placement: INITIAL_PLACEMENT,
				orientation: "white",
				coordinates: false,
				animate: false,
				animationMs: 0,
				interactive: false,
				sizePx: options.sizePx,
			});

			try {
				const t0 = performance.now();
				forceLayout(child);
				const layoutMs = performance.now() - t0;
				layoutSamples.push(layoutMs);

				// Verify geometry
				const pieces = adapter.pieceElements();
				if (i === options.iterations - 1) {
					lastElementCount = elementCount(adapter);

					if (pieces.length === 32) {
						const firstPiece = pieces[0];
						const rect = firstPiece.getBoundingClientRect();
						assertions.push({
							label: "renders 32 pieces",
							passed: pieces.length === 32,
						});
						assertions.push({
							label: "pieces have non-zero geometry",
							passed: rect.width > 0 && rect.height > 0,
							detail: `first piece width: ${rect.width}px`,
						});
					} else {
						assertions.push({
							label: "renders 32 pieces",
							passed: false,
							detail: `got ${pieces.length}`,
						});
						assertions.push({
							label: "pieces have non-zero geometry",
							passed: false,
						});
					}
				}
			} finally {
				adapter.destroy();
				child.remove();
			}

			await settle();
		}

		const metrics: Metric[] = [
			metricFromSamples("mount-layout-ms", "Layout", layoutSamples, {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: options.discardFirst,
			}),
			metricFromSamples("mount-script-ms", "Script", scriptSamples, {
				unit: "ms",
				direction: "lower",
				statistic: "median",
				discardFirst: options.discardFirst,
			}),
			{
				key: "mount-element-count",
				label: "Element count",
				unit: "count",
				direction: "lower",
				value: lastElementCount,
			},
		];

		return {
			adapter: factory.id,
			metrics,
			assertions,
		};
	},
};
