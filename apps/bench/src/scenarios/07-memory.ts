/**
 * Scenario 'memory-leak' — retention after teardown (runner-only).
 */

import { settle } from "../core/clock";
import { GAME_POSITIONS } from "../data/game";
import { INITIAL_PLACEMENT } from "quadrum";
import type {
	Scenario,
	ScenarioContext,
	ScenarioRunResult,
	Assertion,
	Metric,
} from "../core/types";

export const memoryScenario: Scenario = {
	id: "memory-leak",
	title: "Retention after teardown",
	description: "Measure retained nodes and memory after destroying boards.",
	expectation:
		"Expected parity — both libraries should retain nothing. This is an INVARIANT check, not a competition: the verdict is zero-or-not, and heap bytes are reported but never gated, because 'quadrum uses 30% less memory' would be the least defensible line in the whole table.",
	parity:
		"Identical mount/update/destroy cycles at two cycle counts. Every node and listener count — baseline and post-cycle, both arms — is read only after three forced GCs, so what is reported is what survived collection rather than what had not yet been swept.",
	endCondition:
		"All boards destroyed, hosts detached, three forced GCs complete, and the node/listener counters read back at that settled point.",
	runnerOnly: true,
	defaults: { sizePx: 480, iterations: 25, warmupIterations: 0, discardFirst: 0 },

	async run(ctx: ScenarioContext): Promise<ScenarioRunResult> {
		const { host, factory, options, hooks, signal } = ctx;

		// Check if hooks are available
		if (!hooks.collectGarbage || !hooks.heapUsed || !hooks.domCounters) {
			return {
				adapter: factory.id,
				metrics: [],
				assertions: [
					{
						label: "runner hooks available",
						passed: false,
						detail: "memory scenario requires the headless runner CDP hooks",
					},
				],
			};
		}

		async function cycle(n: number): Promise<void> {
			for (let i = 0; i < n; i++) {
				if (signal.aborted) {
					throw new DOMException("aborted", "AbortError");
				}

				const child = document.createElement("div");
				host.appendChild(child);
				const adapter = factory.mount(child, {
					placement: INITIAL_PLACEMENT,
					orientation: "white",
					coordinates: false,
					animate: false,
					animationMs: 0,
					interactive: false,
					sizePx: options.sizePx,
				});

				try {
					// Apply 5 position updates
					for (let j = 0; j < 5; j++) {
						adapter.setPosition(GAME_POSITIONS[j]);
					}
				} finally {
					adapter.destroy();
					child.remove();
				}

				await settle();
			}
		}

		const collect = async (): Promise<void> => {
			// Three passes: one collection can free an object whose finalization
			// releases the next, and Performance.getMetrics reads live counters.
			await hooks.collectGarbage!();
			await hooks.collectGarbage!();
			await hooks.collectGarbage!();
		};

		/**
		 * Node and listener growth across n mount/update/destroy cycles.
		 *
		 * BOTH readings are taken after a forced GC, and that ordering is the whole
		 * measurement. Reading the "after" counter before collecting counts every
		 * board just torn down but not yet swept -- roughly one board's worth of
		 * nodes per cycle -- and reports it as retention. That is garbage, not a
		 * leak, and it made both libraries look like they leaked an entire board on
		 * every cycle. Retention is what survives collection, so collect first.
		 */
		async function retentionOver(n: number): Promise<{ nodes: number; listeners: number }> {
			await collect();
			const before = await hooks.domCounters!();

			await cycle(n);

			await collect();
			const after = await hooks.domCounters!();

			return {
				nodes: after.nodes - before.nodes,
				listeners: after.listeners - before.listeners,
			};
		}

		await collect();
		const heapBefore = await hooks.heapUsed();

		const small = await retentionOver(options.iterations);
		const large = await retentionOver(options.iterations * 4);

		await collect();
		const heapAfter = await hooks.heapUsed();

		const retainedNodesSmall = small.nodes;
		const retainedNodesLarge = large.nodes;
		const retainedListenersSmall = small.listeners;
		const retainedListenersLarge = large.listeners;
		const heapDelta = heapAfter - heapBefore;

		// A real leak scales with cycles; noise does not. Clamped at zero because a
		// negative small delta (the counters settling below baseline, which happens)
		// would otherwise make the bound negative and fail a perfectly clean run.
		const retainsLinear =
			retainedNodesLarge <= Math.max(0, retainedNodesSmall) * 5 &&
			retainedListenersLarge <= Math.max(0, retainedListenersSmall) * 5;

		const metrics: Metric[] = [
			{
				key: "retained-nodes",
				label: "Retained nodes",
				unit: "count",
				direction: "lower",
				value: retainedNodesLarge,
			},
			{
				key: "retained-listeners",
				label: "Retained listeners",
				unit: "count",
				direction: "lower",
				value: retainedListenersLarge,
			},
			{
				key: "heap-delta-bytes",
				label: "Heap delta",
				unit: "bytes",
				direction: "lower",
				value: heapDelta,
				advisory: "reported, never gated; GC scheduling is nondeterministic",
			},
		];

		const assertions: Assertion[] = [
			{
				label: "no retained nodes",
				passed: retainedNodesLarge <= 0,
				detail: `large cycle: ${retainedNodesLarge}`,
			},
			{
				label: "no retained listeners",
				passed: retainedListenersLarge <= 0,
				detail: `large cycle: ${retainedListenersLarge}`,
			},
			{
				label: "retention does not scale with cycles",
				passed: retainsLinear,
				detail: `large (${retainedNodesLarge}n) vs small (${retainedNodesSmall}n)`,
			},
		];

		return {
			adapter: factory.id,
			metrics,
			assertions,
		};
	},
};
