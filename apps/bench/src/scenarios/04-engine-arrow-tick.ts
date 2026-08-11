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
	// Script, not layout. Replacing the arrow layer mutates SVG children inside a
	// fixed viewBox, so most ticks force no real layout at all and the layout
	// metric measures whether the browser happened to do any -- quadrum's layout
	// samples come back with a median of 0.21ms against a p95 of 0.93ms, and the
	// bootstrap CI on that median spans 28% of it, three times the cap a gated
	// metric is allowed. The script metric over the same samples lands inside 2%.
	//
	// This makes the published headline WORSE for quadrum, not better -- the
	// layout ratio was 3.50x and the script ratio is 12.75x -- which is the point:
	// it is the metric that actually carries the cost this scenario exists to
	// expose, and the layout row stays in the full table either way.
	//
	// The spread itself is a symptom, not noise: the layer is torn down and
	// rebuilt every tick, so some ticks land real layout work and some do not.
	// Once that rebuild becomes a diff (docs/plans/arrow-diff-and-lazy-mount.md,
	// item 2), the layout metric should tighten enough to headline again.
	headlineMetric: "arrow-tick-script-ms",
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
