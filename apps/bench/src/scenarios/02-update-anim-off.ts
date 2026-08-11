/**
 * Scenario 'update-throughput-anim-off' — 100 position updates, no animation.
 */

import { forceLayout, observeLongTasks } from "../core/clock";
import { metricFromSamples, applyDiscard } from "../core/harness";
import { GAME_POSITIONS } from "../data/game";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const updateAnimOffScenario: Scenario = {
	id: "update-throughput-anim-off",
	title: "100 position updates, animation off",
	description: "Replay a sequence of board positions with animation disabled.",
	expectation:
		"Expected to favour quadrum — it applies a keyed diff of piece nodes with no animation bookkeeping. This is the scenario a real analysis board spends most of its time in.",
	parity:
		"Animation disabled on both. Every update carries placement, lastMove and side-to-move, exactly as a real app does. Each update is flushed to the DOM inside the timed region, because chessground defers its render to a requestAnimationFrame while quadrum renders synchronously — without the flush chessground would be timed doing nothing and would collapse 100 updates into a single render.",
	endCondition:
		"Every position has been applied AND rendered into the DOM, and the board has been laid out; piece count matches the final placement.",
	headlineMetric: "update-total-script-ms",
	defaults: { sizePx: 480, iterations: 100, warmupIterations: 1, discardFirst: 10 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, factory, options, signal } = ctx;

		// Mount once
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

		try {
			for (let i = 0; i < options.iterations; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				const position = GAME_POSITIONS[i % GAME_POSITIONS.length];

				// Script timing. flush() is inside the bracket on purpose -- it is where
				// chessground actually renders.
				const t0 = performance.now();
				adapter.setPosition(position);
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

			// Extract piece count from final placement
			// Must wrap the same way the loop does, or an iteration count above the
			// number of positions asserts against a position never applied.
			const finalPlacement =
				GAME_POSITIONS[(options.iterations - 1) % GAME_POSITIONS.length].placement;
			const expectedPieceCount = finalPlacement
				.split("")
				.filter((c) => c !== "/" && isNaN(Number(c))).length;
			const actualPieceCount = adapter.pieceElements().length;

			const assertions: Assertion[] = [
				{
					label: "piece count matches final placement",
					passed: actualPieceCount === expectedPieceCount,
					detail: `actual: ${actualPieceCount}, expected: ${expectedPieceCount}`,
				},
				{
					label: "board still laid out",
					passed: child.getBoundingClientRect().width > 0,
				},
			];

			// Sum the kept samples to get total elapsed time over the whole loop.
			// Use the same discardFirst semantics as the per-iteration metrics, so
			// the total covers exactly the samples the other metrics report on.
			const { kept: keptScript } = applyDiscard(scriptSamples, options.discardFirst);
			const { kept: keptLayout } = applyDiscard(layoutSamples, options.discardFirst);
			const totalScriptMs = keptScript.reduce((sum, x) => sum + x, 0);
			const totalLayoutMs = keptLayout.reduce((sum, x) => sum + x, 0);

			const metrics: Metric[] = [
				metricFromSamples("update-layout-ms", "Layout", layoutSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				metricFromSamples("update-script-ms", "Script", scriptSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				{
					key: "update-total-script-ms",
					label: "Total script",
					unit: "ms",
					direction: "lower",
					value: totalScriptMs,
				},
				{
					key: "update-total-layout-ms",
					label: "Total layout",
					unit: "ms",
					direction: "lower",
					value: totalLayoutMs,
				},
				{
					key: "update-longtask-ms",
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
