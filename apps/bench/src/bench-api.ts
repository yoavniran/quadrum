/**
 * The ONLY contract between the page and the headless runner.
 * Everything crossing this boundary must be structured-clonable:
 * plain objects, numbers, strings, arrays. No functions, DOM nodes, Maps.
 */

import { SCENARIOS, getScenario } from "./scenarios/registry";
import { runComparison } from "./core/harness";
import { readEnv, assertProductionBuild } from "./core/env";
import { applyPieceArtParity } from "./adapters/shared/piece-art";
import { quadrumAdapter } from "./adapters/quadrum/index";
import { chessgroundAdapter } from "./adapters/chessground/index";
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
			return SCENARIOS.map((s) => ({
				id: s.id,
				title: s.title,
				runnerOnly: s.runnerOnly || false,
			}));
		},

		env() {
			return readEnv(quadrumAdapter.version, chessgroundAdapter.version);
		},

		setHooks(h: BenchHooks): void {
			hooks = h;
		},

		async run(
			scenarioId: string,
			partial?: Partial<ScenarioOptions>,
		): Promise<ScenarioComparison> {
			assertProductionBuild(args.allowDev);

			await applyPieceArtParity();

			const scenario = getScenario(scenarioId);
			const options: ScenarioOptions = {
				...scenario.defaults,
				...partial,
			};

			const controller = new AbortController();

			return runComparison({
				scenario,
				container: args.container,
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
