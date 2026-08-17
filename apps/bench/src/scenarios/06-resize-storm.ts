/**
 * Scenario 'resize-storm' — 50 consecutive resizes.
 */

import { forceLayout, observeLongTasks } from "../core/clock";
import { metricFromSamples } from "../core/harness";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const resizeStormScenario: Scenario = {
	id: "resize-storm",
	title: "Resize storm, 50 resizes",
	description: "Resize the board box 50 times and verify clicks still resolve correctly.",
	expectation:
		"Expected to favour quadrum heavily — quadrum reads geometry live while chessground must redrawAll() to refresh its cached bounding rect. Because quadrum cannot lose this by construction, it is reported but never gated; gating something you cannot lose is theatre.",
	parity:
		"Both are resized through the same host-box style write. Each adapter then does whatever it needs to remain CORRECT — which for chessground means redrawAll(). The contract is a correct, clickable board afterwards, not an equal number of method calls.",
	endCondition:
		"The board box has the new size AND a click at the centre of a known square still resolves to that square.",
	headlineMetric: "resize-layout-ms",
	defaults: { sizePx: 480, iterations: 50, warmupIterations: 2, discardFirst: 5 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, frame, factory, options, signal } = ctx;

		// Mount once
		const child = frame.document.createElement("div");
		host.appendChild(child);
		const adapter = factory.mount(child, {
			placement: INITIAL_PLACEMENT,
			orientation: "white",
			coordinates: false,
			animate: false,
			animationMs: 0,
			interactive: true,
			sizePx: options.sizePx,
		});

		const scriptSamples: number[] = [];
		const layoutSamples: number[] = [];
		const longTasks = observeLongTasks();

		// Prime the hit-test geometry, exactly as any real interaction does before
		// the user drags a splitter. Without this, a cache-based library has nothing
		// cached, its first post-storm read computes fresh, and the correctness
		// assertion below passes for a board that would still mis-hit in practice.
		adapter.hitTestRect();

		const smallSize = Math.round(options.sizePx * 0.75);

		try {
			for (let i = 0; i < options.iterations; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				// Alternate full size and 75%, ending on the SMALL one. An even
				// iteration count that lands back on the primed size would let a
				// completely stale cache match the live rect by coincidence.
				const targetSize = i % 2 === 0 ? options.sizePx : smallSize;

				// Script timing
				const t0 = performance.now();
				adapter.resize(targetSize);
				const scriptMs = performance.now() - t0;
				scriptSamples.push(scriptMs);

				// Layout timing
				const t1 = performance.now();
				forceLayout(child);
				const layoutMs = performance.now() - t1;
				layoutSamples.push(layoutMs);
			}

			const { totalMs: longTaskMs } = longTasks.stop();

			// The geometry the library will hit-test against must match where the
			// board actually is. This is the assertion that makes the timed region
			// honest: chessground's resize() pays for redrawAll() precisely so this
			// holds, and deleting that call must break this check rather than simply
			// making chessground look faster.
			// Measured against the HOST BOX, which is what the app resized -- not
			// against the library's own board element. chessground sizes cg-board
			// itself and only resyncs it on redrawAll, so comparing the hit-test rect
			// to cg-board compares one stale value against another and reports zero
			// drift for a board that is visibly the wrong size. The host box is the
			// only reference that is true independently of either library.
			const liveRect = adapter.host.getBoundingClientRect();
			const hitRect = adapter.hitTestRect();

			// Half a square at the smallest size in the storm. A drift wider than
			// this puts a click on the wrong square, which is the actual bug.
			const tolerance = 0.5;
			const drift = Math.max(
				Math.abs(hitRect.left - liveRect.left),
				Math.abs(hitRect.top - liveRect.top),
				Math.abs(hitRect.width - liveRect.width),
				Math.abs(hitRect.height - liveRect.height),
			);

			const assertions: Assertion[] = [
				{
					label: "post-resize click accuracy",
					passed: drift <= tolerance,
					detail: `hit-test rect drifted ${drift.toFixed(2)}px from the live board rect (tolerance ${tolerance}px)`,
				},
				{
					// Guards the guard: an odd iteration count would end the storm back
					// on the primed size, and the accuracy check above would pass on a
					// board whose geometry was never refreshed at all.
					label: "storm ended at a size other than the primed one",
					passed: (options.iterations - 1) % 2 === 1,
					detail: `${options.iterations} iterations`,
				},
			];

			const metrics: Metric[] = [
				metricFromSamples("resize-layout-ms", "Layout", layoutSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				metricFromSamples("resize-script-ms", "Script", scriptSamples, {
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				}),
				{
					key: "resize-longtask-ms",
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
