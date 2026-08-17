/**
 * Bundle size scenario (runner-only).
 *
 * This scenario CANNOT measure anything in the browser; the real numbers come
 * from the Node runner's lib-mode builds. This file exists only so the scenario
 * registry is complete and the UI can list it. Fabricating a byte count in the
 * browser is exactly the kind of number this project refuses to publish.
 */

import type { Scenario, ScenarioContext, ScenarioRunResult } from "../core/types";

export const bundleSizeScenario: Scenario = {
	id: "bundle-size",
	title: "Bundle size, min+brotli",
	description: "Measure library bundle sizes in lib-mode builds.",
	parity:
		"Both measured from a realistic adapter-surface entry (mount, update, arrows, drag, destroy), not `export *`, which is meaningless against subpath exports and pessimistic against a single entry.",
	endCondition: "Three lib-mode builds complete and their raw/gzip/brotli byte counts are recorded.",
	runnerOnly: true,
	headlineMetric: "bundle-brotli-bytes",
	defaults: { sizePx: 0, iterations: 1, warmupIterations: 0, discardFirst: 0 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		return {
			adapter: ctx.factory.id,
			metrics: [],
			assertions: [
				{
					label: "measured by the Node runner",
					passed: true,
					detail: "bundle size is produced by runner/bundle-size.ts and merged into the results JSON; the browser cannot measure it",
				},
			],
		};
	},
};
