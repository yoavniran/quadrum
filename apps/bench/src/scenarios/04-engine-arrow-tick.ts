/**
 * Scenario 'engine-arrow-tick' — engine arrow re-draw per tick.
 */

import { forceLayout, observeLongTasks } from "../core/clock";
import { metricFromSamples } from "../core/harness";
import { ARROW_FRAMES } from "../data/arrows";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const engineArrowTickScenario: Scenario = {
	id: "engine-arrow-tick",
	title: "Engine arrow re-draw, per tick",
	description: "Replace the engine arrow layer 100 times without changing the position.",
	expectation:
		"Expected to favour quadrum — it caches pen definitions by key and repaints only the arrow layer. This is the scenario quadrum was built for, and it is named as such rather than presented as a neutral test.",
	parity:
		"Both mounted with drawing enabled and a static position; only the auto/engine arrow layer is replaced per tick. Neither adapter re-applies the FEN — doing so would make this measure a full position diff.",
	endCondition:
		"The new arrow layer is present in the DOM and laid out; the position is unchanged.",
	defaults: { sizePx: 480, iterations: 100, warmupIterations: 2, discardFirst: 10 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, factory, options, signal } = ctx;

		// Mount once from INITIAL_PLACEMENT
		const child = document.createElement("div");
		host.appendChild(child);
		const adapter = factory.mount(child, {
			placement: INITIAL_PLACEMENT,
			orientation: "white",
			coordinates: false,
			animate: false,
			animationMs: 0,
			interactive: false,
			sizePx: options.sizePx,
		});

		const scriptSamples: number[] = [];
		const layoutSamples: number[] = [];
		const longTasks = observeLongTasks();

		// Capture initial piece count before the loop
		const initialPieceCount = adapter.pieceElements().length;

		try {
			for (let i = 0; i < options.iterations; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				const arrows = ARROW_FRAMES[i % ARROW_FRAMES.length];

				// Script timing. flush() is inside the bracket for the same reason as
				// the update scenarios: chessground's setAutoShapes only marks the
				// board dirty, and the arrow layer is drawn on the following frame.
				const t0 = performance.now();
				adapter.setArrows(arrows);
				adapter.flush();
				const scriptMs = performance.now() - t0;
				scriptSamples.push(scriptMs);

				// Layout timing
				const t1 = performance.now();
				forceLayout(child);
				const layoutMs = performance.now() - t1;
				layoutSamples.push(layoutMs);
			}

			const { totalMs: longTaskMs } = longTasks.stop();

			// Check position survives arrow layer
			const finalPieceCount = adapter.pieceElements().length;
			const positionSurvived = initialPieceCount === finalPieceCount;

			// Count SVG arrows through the adapter. A shared "line, path" selector
			// silently found zero on BOTH libraries -- quadrum draws polygons, and
			// chessground's only <path> is the arrowhead template inside <defs>.
			const arrows = adapter.arrowElements().length;

			const assertions: Assertion[] = [
				{
					label: "position survives the arrow layer",
					passed: positionSurvived,
					detail: `initial: ${initialPieceCount}, final: ${finalPieceCount}`,
				},
				{
					label: "arrows are in the DOM",
					passed: arrows > 0,
					detail: `found ${arrows} line/path elements`,
				},
			];

			const metrics: Metric[] = [
				metricFromSamples("arrow-tick-layout-ms", "Layout", layoutSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				metricFromSamples("arrow-tick-script-ms", "Script", scriptSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				{
					key: "arrow-tick-longtask-ms",
					label: "Long tasks",
					unit: "ms",
					direction: "lower",
					value: longTaskMs,
				},
			];

			return {
				adapter: factory.id,
				metrics,
				assertions,
			};
		} finally {
			adapter.destroy();
			child.remove();
		}
	},
};
