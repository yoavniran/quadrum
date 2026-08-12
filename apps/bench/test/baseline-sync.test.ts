/**
 * The committed gate baseline must describe the scenarios as they exist today.
 *
 * `baseline.json` stores, per scenario, which metric it gates and whether it is
 * gated at all. Those are decisions that live in the scenario registry, and the
 * two drift apart whenever a scenario is re-pointed at a different headline
 * metric without the baseline being re-minted. When they drift, the gate has
 * nothing valid to compare and fails -- correctly, but only after the benchmark
 * has run.
 *
 * That is the expensive part. A full 31-repetition run costs over 40 minutes of
 * CI, so a drift introduced in a one-line registry edit is not discovered until
 * the better part of an hour later, and every attempted fix costs another hour
 * to disprove. The drift itself is visible in two files sitting in git, with no
 * browser and no measurement involved, which is what these tests check.
 *
 * A failure here does not mean the code is wrong. It means the baseline is
 * stale and must be re-minted -- a `workflow_dispatch` run with `mint_baseline`
 * ticked. No source change can turn it green, which is exactly why it is worth
 * saying so in a second rather than in an hour.
 */

import baselineJson from "../results/baseline.json";
import { SCENARIOS, GATED_SCENARIO_IDS } from "../src/scenarios/registry";

interface BaselineScenario {
	readonly headlineMetric: string;
	readonly gated: boolean;
}

interface Baseline {
	readonly schemaVersion: number;
	readonly mintedFrom?: { readonly startedAt?: string };
	readonly scenarios: Record<string, BaselineScenario>;
}

const baseline = baselineJson as unknown as Baseline;

const RE_MINT = "re-mint the baseline: workflow_dispatch on bench.yml with mint_baseline ticked";

describe("committed baseline is in sync with the scenario registry", () => {
	it("covers exactly the scenarios the registry defines", () => {
		// A scenario missing from the baseline cannot be gated; one present but no
		// longer defined is a benchmark that was deleted without the baseline
		// noticing, which is the shape a removed inconvenient scenario would take.
		expect(Object.keys(baseline.scenarios).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
	});

	for (const scenario of SCENARIOS) {
		describe(scenario.id, () => {
			it("is gated in the baseline exactly as the registry says", () => {
				expect(baseline.scenarios[scenario.id]?.gated).toBe(GATED_SCENARIO_IDS.includes(scenario.id));
			});

			it(`gates on the metric the registry headlines (${scenario.headlineMetric})`, () => {
				const stored = baseline.scenarios[scenario.id]?.headlineMetric;

				expect(
					stored,
					`baseline gates "${stored}" but ${scenario.id} now headlines ` +
						`"${scenario.headlineMetric}". The baseline predates that change, so ${RE_MINT}.`,
				).toBe(scenario.headlineMetric);
			});
		});
	}
});
