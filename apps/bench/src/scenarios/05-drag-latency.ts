/**
 * Scenario 'drag-latency' — drag input handling latency.
 *
 * Runner-only. See BenchHooks.mouse for why: chessground does not act on
 * synthesized mouse events, so a gesture built with dispatchEvent measures
 * nothing on one of the two arms. Real input has to come from the runner.
 */

import { metricFromSamples } from "../core/harness";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

/** Input event types either library might act on. */
const INPUT_EVENTS = ["pointerdown", "mousedown", "pointermove", "mousemove"] as const;

/** Number of waypoints in a drag gesture. */
const DRAG_STEPS = 12;
/** Milliseconds between each waypoint: 8 ms ≈ 125 Hz report rate of a standard mouse. */
const DRAG_STEP_MS = 8;

/**
 * Time, per input event, from the event arriving in the page to the end of the
 * task that processed it.
 *
 * The clock starts in a capture-phase listener on window, which runs before any
 * library handler, and stops in a `setTimeout(0)` scheduled from it, which runs
 * once the current task -- including every listener the library registered --
 * has finished. Measuring the task rather than a bubble-phase listener is
 * deliberate: a library that calls stopPropagation would never reach a bubble
 * listener, and would score zero for work it actually did.
 *
 * Nothing here crosses the runner boundary, so the IPC cost of driving real
 * input stays out of the measurement.
 */
function observeInputHandling(): { samples: number[]; stop: () => void } {
	const samples: number[] = [];

	const onInput = (): void => {
		const arrived = performance.now();

		setTimeout(() => {
			samples.push(performance.now() - arrived);
		}, 0);
	};

	for (const type of INPUT_EVENTS) {
		window.addEventListener(type, onInput, { capture: true });
	}

	return {
		samples,
		stop(): void {
			for (const type of INPUT_EVENTS) {
				window.removeEventListener(type, onInput, { capture: true });
			}
		},
	};
}

export const dragLatencyScenario: Scenario = {
	id: "drag-latency",
	title: "Drag latency, p95",
	description: "Measure input handling cost across a press-drag-release gesture.",
	expectation:
		"Expected to favour chessground if anything — its pointer path is battle-hardened by lichess. Included deliberately as a scenario quadrum can lose.",
	parity:
		"Both mounted interactive with dragging enabled. The identical gesture — press on e2, drag to e4 with 12 waypoints paced at 8 ms each (125 Hz mouse rate), release — is driven by the runner as real browser input at the same viewport coordinates, so neither library is asked to respond to an event family it does not listen to. Timing covers the page-side handling of each input event only; the runner round-trip is excluded by starting the clock inside the page.",
	endCondition:
		"The library has entered its drag state and written a transform on the dragged piece, and the gesture has been released.",
	runnerOnly: true,
	headlineMetric: "drag-latency-p95-ms",
	defaults: { sizePx: 480, iterations: 20, warmupIterations: 2, discardFirst: 5 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, factory, options, signal, hooks } = ctx;
		const mouse = hooks.mouse;

		if (!mouse) {
			throw new Error(
				"drag-latency needs real browser input and is runner-only; no mouse hook was installed",
			);
		}

		const child = document.createElement("div");
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

		const observer = observeInputHandling();
		let dragEntered = false;
		let draggedTransformSeen = false;

		try {
			for (let i = 0; i < options.iterations; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				const from = adapter.squareCenter("e2");
				const to = adapter.squareCenter("e4");

				await mouse("move", from.x, from.y);
				await mouse("down", from.x, from.y);

				for (let step = 1; step <= DRAG_STEPS; step++) {
					const fraction = step / DRAG_STEPS;
					await mouse(
						"move",
						from.x + (to.x - from.x) * fraction,
						from.y + (to.y - from.y) * fraction,
					);
					await new Promise((resolve) => setTimeout(resolve, DRAG_STEP_MS));
				}

				// Observed while the gesture is still held; the release below ends it.
				if (adapter.isDragging()) {
					dragEntered = true;

					if (adapter.draggedTransform() !== null) {
						draggedTransformSeen = true;
					}
				}

				await mouse("up", to.x, to.y);

				// Put the piece back so every iteration starts from the same board.
				adapter.setPosition({
					placement: INITIAL_PLACEMENT,
					lastMove: null,
					sideToMove: "white",
				});
				adapter.flush();
			}

			// The samples are pushed from timeouts; let the last ones land.
			await new Promise((resolve) => setTimeout(resolve, 20));
			observer.stop();

			const assertions: Assertion[] = [
				{
					label: "drag entered on both",
					passed: dragEntered,
				},
				{
					label: "dragged piece carried a transform",
					passed: draggedTransformSeen,
				},
				{
					label: "drag released",
					passed: !adapter.isDragging(),
				},
				{
					label: "input handling was observed",
					passed: observer.samples.length > 0,
					detail: `${observer.samples.length} input events`,
				},
			];

			const p95Metric = metricFromSamples(
				"drag-latency-p95-ms",
				"Drag latency p95",
				observer.samples,
				{
					unit: "ms",
					direction: "lower",
					statistic: "p95",
					discardFirst: options.discardFirst,
				},
			);

			const medianMetric = metricFromSamples(
				"drag-latency-median-ms",
				"Drag latency median",
				observer.samples,
				{
					unit: "ms",
					direction: "lower",
					statistic: "median",
					discardFirst: options.discardFirst,
				},
			);

			const metrics: Metric[] = [
				{
					...p95Metric,
					advisory:
						"p95 from a small n has high estimator variance — reported, never gated",
				},
				medianMetric,
			];

			return {
				adapter: factory.id,
				metrics,
				assertions,
			};
		} finally {
			observer.stop();
			adapter.destroy();
			child.remove();
		}
	},
};
