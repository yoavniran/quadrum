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
 *
 * Which raises the awkward case this file has to handle: the baseline is stale
 * *right now*, and re-minting is a ~50-minute dispatch that cannot be run from a
 * pull request. Leaving the assertion red would block every unrelated change for
 * as long as that takes. So the known-stale scenarios are listed in
 * `PENDING_REMINT` below, and that list is itself asserted: an entry that no
 * longer drifts fails until it is deleted. The exemption cannot outlive the
 * condition that justified it, and no *other* scenario is exempt from anything.
 */

import baselineJson from "../results/baseline.json";
import { SCENARIOS, GATED_SCENARIO_IDS } from "../src/scenarios/registry";
import { updateAnimOnScenario } from "../src/scenarios/03-update-anim-on";

interface BaselineScenario {
	readonly headlineMetric: string;
	readonly gated: boolean;
	readonly demotedReason?: string;
}

interface Baseline {
	readonly schemaVersion: number;
	readonly mintedFrom?: { readonly startedAt?: string };
	readonly scenarios: Record<string, BaselineScenario>;
}

const baseline = baselineJson as unknown as Baseline;

const RE_MINT = "re-mint the baseline: workflow_dispatch on bench.yml with mint_baseline ticked";

/**
 * Scenarios re-pointed at a new headline metric since the baseline was last
 * minted, and therefore known to drift until the next mint run lands.
 *
 * This is a record of a pending action, not a tolerance. Every entry must be
 * deleted by the pull request that commits the re-minted baseline -- the tests
 * below fail if an entry stops drifting, so the list cannot quietly become
 * permanent.
 */
// Empty, and that is the healthy state: mint #84 re-minted
// update-throughput-anim-on onto "update-anim-frame-script-ms", so its entry
// stopped drifting and the assertion below required its deletion. The list did
// exactly what it was built to do -- it expired on its own.
const PENDING_REMINT: ReadonlySet<string> = new Set([]);

describe("committed baseline is in sync with the scenario registry", () => {
	it("covers exactly the scenarios the registry defines", () => {
		// A scenario missing from the baseline cannot be gated; one present but no
		// longer defined is a benchmark that was deleted without the baseline
		// noticing, which is the shape a removed inconvenient scenario would take.
		expect(Object.keys(baseline.scenarios).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
	});

	it("exempts only scenarios that actually exist", () => {
		// A typo'd or deleted id in PENDING_REMINT would exempt nothing while
		// looking like it exempts something, which is how a real drift gets missed.
		const known = new Set(SCENARIOS.map((s) => s.id));

		expect([...PENDING_REMINT].filter((id) => !known.has(id))).toEqual([]);
	});

	for (const scenario of SCENARIOS) {
		describe(scenario.id, () => {
			it("is gated in the baseline exactly as the registry says", () => {
				const stored = baseline.scenarios[scenario.id];
				const registryGated = GATED_SCENARIO_IDS.includes(scenario.id);

				// The mint may demote a registry-gated scenario to reported-only when
				// its noise exceeds the gating cap. That is the one sanctioned way the
				// two files disagree, and the baseline must say why.
				if (registryGated && stored?.gated === false) {
					expect(
						stored.demotedReason,
						`the registry gates ${scenario.id} but the baseline does not, and no ` +
							`demotedReason explains it. Either the baseline predates a registry change (${RE_MINT}) ` +
							"or the gated flag was edited by hand.",
					).toBeTruthy();

					return;
				}

				expect(stored?.gated).toBe(registryGated);
			});

			it("carries a demotedReason only if it was demoted", () => {
				const stored = baseline.scenarios[scenario.id];

				if (stored?.demotedReason !== undefined) {
					expect(GATED_SCENARIO_IDS.includes(scenario.id)).toBe(true);
					expect(stored.gated).toBe(false);
				}
			});

			if (PENDING_REMINT.has(scenario.id)) {
				it("still drifts, so its PENDING_REMINT entry is still earning its place", () => {
					const stored = baseline.scenarios[scenario.id]?.headlineMetric;

					// Inverted on purpose. Once a mint run makes this scenario agree with
					// the registry, this fails -- which is the only reminder that will
					// still be around when the mint lands.
					expect(
						stored,
						`${scenario.id} now agrees with the registry on "${scenario.headlineMetric}", ` +
							`so the baseline has been re-minted. Delete "${scenario.id}" from PENDING_REMINT ` +
							"to put it back under the drift assertion.",
					).not.toBe(scenario.headlineMetric);
				});

				return;
			}

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

describe("update-throughput-anim-on configuration", () => {
	it("headlines the new frame-script-ms metric", () => {
		expect(updateAnimOnScenario.headlineMetric).toBe("update-anim-frame-script-ms");
	});

	it("is not gated", () => {
		expect(GATED_SCENARIO_IDS.includes("update-throughput-anim-on")).toBe(false);
	});
});
