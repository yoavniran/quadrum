/**
 * The ONLY contract between the page and the headless runner.
 * Everything crossing this boundary must be structured-clonable:
 * plain objects, numbers, strings, arrays. No functions, DOM nodes, Maps.
 */

import { SCENARIOS, getScenario, GATED_SCENARIO_IDS } from "./scenarios/registry";
import { runComparison } from "./core/harness";
import { readEnv, assertProductionBuild } from "./core/env";
import { applyPieceArtParity } from "./adapters/shared/piece-art";
import { ensureFrames } from "./core/frames";
import { QUADRUM_VERSION, CHESSGROUND_VERSION } from "./adapters/versions";
import type {
	BenchApi,
	BenchHooks,
	ScenarioOptions,
	ScenarioComparison,
} from "./core/types";

let hooks: BenchHooks = {};

/**
 * Install the bench API into window.__bench.
 * Enforces production-build constraints at run-time.
 */
export function installBenchApi(args: {
	container: HTMLElement;
	allowDev: boolean;
	log: (m: string) => void;
}): BenchApi {
	const api: BenchApi = {
		list() {
			// The prose fields cross the boundary with the ids so the runner can
			// write them straight into the results JSON. The runner must never
			// carry its own copy of a scenario's parity or end-condition text:
			// two copies means one of them is eventually wrong, and this is the
			// one place where a stale sentence is a false claim about the method.
			return SCENARIOS.map((s) => ({
				id: s.id,
				title: s.title,
				description: s.description,
				parity: s.parity,
				endCondition: s.endCondition,
				runnerOnly: s.runnerOnly || false,
				headlineMetric: s.headlineMetric,
				gated: GATED_SCENARIO_IDS.includes(s.id),
				repsCap: s.repsCap ?? null,
			}));
		},

		env() {
			return readEnv(QUADRUM_VERSION, CHESSGROUND_VERSION);
		},

		setHooks(h: BenchHooks): void {
			hooks = h;
		},

		async run(
			scenarioId: string,
			partial?: Partial<ScenarioOptions>,
		): Promise<ScenarioComparison> {
			assertProductionBuild(args.allowDev);

			// Each subject runs in its own same-origin frame so neither
			// library's CSS can reach the other's document. Built once and
			// reused, which keeps ABBA interleaving free of page loads.
			const frames = await ensureFrames(args.container);
			await applyPieceArtParity(frames);

			const scenario = getScenario(scenarioId);
			const options: ScenarioOptions = {
				...scenario.defaults,
				...partial,
			};

			const controller = new AbortController();

			return runComparison({
				scenario,
				frames,
				options,
				hooks,
				signal: controller.signal,
				log: args.log,
			});
		},
	};

	window.__bench = api;
	return api;
}
