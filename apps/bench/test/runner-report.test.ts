/**
 * Runner-side aggregation helpers — the repetition-cap filter.
 */

import { describe, it, expect } from "vitest";
import { capScenarioIds } from "../runner/report.ts";

const META = [
	{ id: "mount", repsCap: null },
	{ id: "update-throughput-anim-off" },
	{ id: "memory-leak", repsCap: 5 },
];

const IDS = ["mount", "update-throughput-anim-off", "memory-leak"];

describe("capScenarioIds", () => {
	it("keeps every scenario while all caps are unmet", () => {
		expect(capScenarioIds(IDS, META, 0)).toEqual(IDS);
	});

	it("keeps a capped scenario on its final permitted repetition (cap 5 → run index 4)", () => {
		expect(capScenarioIds(IDS, META, 4)).toContain("memory-leak");
	});

	it("drops a capped scenario once its cap is met (cap 5 → run index 5)", () => {
		expect(capScenarioIds(IDS, META, 5)).toEqual([
			"mount",
			"update-throughput-anim-off",
		]);
	});

	it("never drops scenarios with a null or missing cap, however many repetitions run", () => {
		expect(capScenarioIds(IDS, META, 1000)).toEqual([
			"mount",
			"update-throughput-anim-off",
		]);
	});

	it("leaves an id with no meta entry untouched", () => {
		expect(capScenarioIds(["unknown"], META, 30)).toEqual(["unknown"]);
	});
});
