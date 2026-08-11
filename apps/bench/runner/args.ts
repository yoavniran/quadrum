/**
 * The runner's command line, parsed in one place so it can be unit tested.
 *
 * Split out of run.ts for one reason: the CLI is the only part of the runner
 * that CI touches directly, and it broke there in a way no local run could
 * reproduce -- `pnpm bench -- --scenario gated` forwards the `--` *literally*
 * through the nested workspace script, so the runner received a bare `--` as
 * its first argument and `parseArgs` rejected it as a positional. The
 * invocations are fixed, but a flag separator arriving from a caller is not
 * something that should ever be fatal, so it is tolerated here and covered by
 * a test.
 */

import { parseArgs } from "node:util";

export interface RunnerOptions {
	readonly scenario: string;
	readonly runs: number;
	readonly throttle: number;
	readonly iterations: number | null;
	readonly headed: boolean;
	readonly out: string;
	readonly compare: string | null;
	readonly allowDev: boolean;
}

/**
 * Drops flag separators that a shell or a package manager forwarded verbatim.
 *
 * Only bare `--` tokens go; anything else -- including a real positional -- is
 * left alone so that parseArgs still rejects it and a typo stays loud.
 */
export function stripSeparators(argv: readonly string[]): string[] {
	return argv.filter((arg) => arg !== "--");
}

export function parseRunnerArgs(argv: readonly string[]): RunnerOptions {
	const { values } = parseArgs({
		args: stripSeparators(argv),
		options: {
			scenario: { type: "string", default: "all" },
			runs: { type: "string", default: "7" },
			throttle: { type: "string", default: "4" },
			iterations: { type: "string" },
			headed: { type: "boolean", default: false },
			out: { type: "string", default: "results/latest.json" },
			compare: { type: "string" },
			"allow-dev": { type: "boolean", default: false },
		},
	});

	const runs = parseInt(String(values.runs), 10);
	const throttle = parseFloat(String(values.throttle));
	const iterations = values.iterations ? parseInt(String(values.iterations), 10) : null;

	// A benchmark that silently ran zero repetitions, or NaN of them, would
	// still write a results file -- and the numbers in it would be fiction.
	if (!Number.isInteger(runs) || runs < 1) {
		throw new Error(`--runs must be a positive integer, got "${values.runs}"`);
	}

	if (!Number.isFinite(throttle) || throttle < 1) {
		throw new Error(`--throttle must be a number >= 1, got "${values.throttle}"`);
	}

	if (iterations !== null && (!Number.isInteger(iterations) || iterations < 1)) {
		throw new Error(`--iterations must be a positive integer, got "${values.iterations}"`);
	}

	return {
		scenario: String(values.scenario),
		runs,
		throttle,
		iterations,
		headed: Boolean(values.headed),
		out: String(values.out),
		compare: values.compare ? String(values.compare) : null,
		allowDev: Boolean(values["allow-dev"]),
	};
}
