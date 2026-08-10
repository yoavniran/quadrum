/**
 * Registry of all scenarios.
 */

import { mountScenario } from "./01-mount";
import { updateAnimOffScenario } from "./02-update-anim-off";
import { updateAnimOnScenario } from "./03-update-anim-on";
import { engineArrowTickScenario } from "./04-engine-arrow-tick";
import { dragLatencyScenario } from "./05-drag-latency";
import { resizeStormScenario } from "./06-resize-storm";
import { memoryScenario } from "./07-memory";
import { bundleSizeScenario } from "./08-bundle-size";
import type { Scenario } from "../core/types";

/**
 * All scenarios in execution order.
 */
export const SCENARIOS: readonly Scenario[] = [
	mountScenario,
	updateAnimOffScenario,
	updateAnimOnScenario,
	engineArrowTickScenario,
	dragLatencyScenario,
	resizeStormScenario,
	memoryScenario,
	bundleSizeScenario,
];

/**
 * All scenario IDs.
 */
export const SCENARIO_IDS: readonly string[] = SCENARIOS.map((s) => s.id);

/**
 * Get a scenario by ID.
 * Throws an Error if the ID is not found.
 */
export function getScenario(id: string): Scenario {
	const scenario = SCENARIOS.find((s) => s.id === id);
	if (!scenario) {
		throw new Error(
			`unknown scenario: ${id}. Known: ${SCENARIO_IDS.join(", ")}`,
		);
	}
	return scenario;
}

/**
 * Scenarios that are gated (their results are a release blocker).
 * Excluded scenarios:
 * - update-throughput-anim-on: has no real vsync in headless
 * - drag-latency: p95 from a small n has estimator variance beyond sane tolerance
 * - resize-storm: cannot be lost by construction (quadrum always wins)
 */
export const GATED_SCENARIO_IDS: readonly string[] = [
	"mount",
	"update-throughput-anim-off",
	"engine-arrow-tick",
	"bundle-size",
	"memory-leak",
];
