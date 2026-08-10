/**
 * Scenario 'update-throughput-anim-on' — 100 position updates with animation.
 */

import {
	measureFrameInterval,
	nextFrame,
	observeLongTasks,
} from "../core/clock";
import { percentile } from "../core/stats";
import { GAME_POSITIONS } from "../data/game";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const updateAnimOnScenario: Scenario = {
	id: "update-throughput-anim-on",
	title: "100 position updates, animation on",
	description: "Replay a sequence of board positions with animation enabled.",
	expectation:
		"No inherent advantage for either library — both animate with CSS transforms on the compositor. Included precisely because quadrum has no architectural edge here; a loss would be a real finding.",
	parity:
		"Animation enabled on both at 200ms. Positions are applied one per animation frame, so both libraries face the same arrival rate.",
	endCondition:
		"All updates dispatched and one further frame has been painted.",
	defaults: { sizePx: 480, iterations: 100, warmupIterations: 1, discardFirst: 10 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, factory, options, signal } = ctx;

		// Measure frame interval first
		const frameIntervalMs = await measureFrameInterval();

		// Mount once with animation on
		const child = document.createElement("div");
		host.appendChild(child);
		const adapter = factory.mount(child, {
			placement: INITIAL_PLACEMENT,
			orientation: "white",
			coordinates: false,
			animate: true,
			animationMs: 200,
			interactive: false,
			sizePx: options.sizePx,
		});

		const frameDeltas: number[] = [];
		const longTasks = observeLongTasks();

		try {
			let lastTime = await nextFrame();

			for (let i = 0; i < options.iterations; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				const position = GAME_POSITIONS[i % GAME_POSITIONS.length];
				adapter.setPosition(position);

				const now = await nextFrame();
				const delta = now - lastTime;
				frameDeltas.push(delta);
				lastTime = now;
			}

			// Paint one more frame
			await nextFrame();

			const { totalMs: longTaskMs } = longTasks.stop();

			// Count dropped frames
			let droppedFrames = 0;
			for (const delta of frameDeltas) {
				const framesInDelta = Math.round(delta / frameIntervalMs);
				droppedFrames += Math.max(0, framesInDelta - 1);
			}

			const frameP95 = percentile(frameDeltas, 95);

			// Let the last animation finish before counting. Mid-flight, both libraries
			// legitimately hold extra nodes for pieces still travelling or fading, so
			// counting immediately asserts against a transient DOM. There is
			// deliberately no flush() in this scenario: it measures the libraries' own
			// frame scheduling, which forcing a synchronous render would destroy.
			const settleDeadline = performance.now() + 200 + frameIntervalMs * 3;
			while (performance.now() < settleDeadline) {
				await nextFrame();
			}

			// Final piece count assertion
			const finalPlacement =
				GAME_POSITIONS[(options.iterations - 1) % GAME_POSITIONS.length].placement;
			const expectedPieceCount = finalPlacement
				.split("")
				.filter((c) => c !== "/" && isNaN(Number(c))).length;
			const actualPieceCount = adapter.pieceElements().length;

			const assertions: Assertion[] = [
				{
					label: "board shows expected final piece count",
					passed: actualPieceCount === expectedPieceCount,
					detail: `actual: ${actualPieceCount}, expected: ${expectedPieceCount}`,
				},
			];

			const metrics: Metric[] = [
				{
					key: "frame-interval-ms",
					label: "Frame interval",
					unit: "ms",
					direction: "lower",
					value: frameIntervalMs,
					advisory: "empirically derived during warmup",
				},
				{
					key: "dropped-frames",
					label: "Dropped frames",
					unit: "count",
					direction: "lower",
					value: droppedFrames,
					advisory: "headless has no real vsync; treat as advisory unless run with --headed",
				},
				{
					key: "frame-interval-p95",
					label: "Frame interval p95",
					unit: "ms",
					direction: "lower",
					value: frameP95,
					advisory: "headless has no real vsync; treat as advisory unless run with --headed",
				},
				{
					key: "updates-completed",
					label: "Updates completed",
					unit: "count",
					direction: "higher",
					value: options.iterations,
				},
				{
					key: "update-anim-longtask-ms",
					label: "Long tasks",
					unit: "ms",
					direction: "lower",
					value: longTaskMs,
					advisory: "headless has no real vsync; treat as advisory unless run with --headed",
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
