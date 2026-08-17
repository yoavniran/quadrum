/**
 * Scenario 'mount' — mount a full board and measure first render.
 */

import { forceLayout, settle } from "../core/clock";
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
	//
	// NOTE: `mount-layout-ms` CHANGED MEANING when the double-mount was removed
	// (see run()). It now includes the mount call, where before it timed only a
	// bare reflow. The `mount` entry in results/baseline.json predates that and
	// is not comparable -- it must be re-minted before this scenario gates again.
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

			// ONE mount per iteration, and the two timings are NESTED brackets
			// around it: script is the call, layout is the call plus the forced
			// reflow. That relationship is the whole point -- script must be a
			// subset of layout, or the two numbers cannot be differenced and the
			// "where did the time go" question has no answer.
			//
			// This scenario previously mounted TWICE into the same child: once
			// inside a timeScript bracket, then again, with the layout bracket
			// opened only AFTER the second mount returned. So `mount-layout-ms`
			// -- the GATED headline metric -- excluded the mount call entirely
			// and timed a bare reflow, while the scenario's own description and
			// endCondition claimed it measured "construction plus first render".
			// The first adapter was also never destroyed, leaking a board per
			// iteration, and the second mount landed in a container the first had
			// already filled, so each library's overwrite behaviour (quadrum
			// wipes via innerHTML in buildDom) leaked into the number as well.
			const t0 = performance.now();
			const adapter = factory.mount(child, {
				placement: INITIAL_PLACEMENT,
				orientation: "white",
				coordinates: false,
				animate: false,
				animationMs: 0,
				interactive: false,
				sizePx: options.sizePx,
			});
			const t1 = performance.now();

			try {
				forceLayout(child);
				const t2 = performance.now();
				scriptSamples.push(t1 - t0);
				layoutSamples.push(t2 - t0);

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
