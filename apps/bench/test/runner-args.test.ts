import { describe, it, expect } from "vitest";
import { parseRunnerArgs, stripSeparators } from "../runner/args.ts";

describe("stripSeparators", () => {
	it("drops a forwarded flag separator", () => {
		expect(stripSeparators(["--", "--scenario", "gated"])).toEqual(["--scenario", "gated"]);
	});

	it("drops every separator, wherever it lands", () => {
		expect(stripSeparators(["--", "--runs", "3", "--"])).toEqual(["--runs", "3"]);
	});

	it("leaves a real positional alone, so a typo still fails loudly", () => {
		expect(stripSeparators(["--runs", "3", "gated"])).toEqual(["--runs", "3", "gated"]);
	});
});

describe("parseRunnerArgs", () => {
	it("defaults to every scenario at 7 repetitions and 4x throttling", () => {
		const opts = parseRunnerArgs([]);

		expect(opts).toEqual({
			scenario: "all",
			runs: 7,
			throttle: 4,
			iterations: null,
			headed: false,
			out: "results/latest.json",
			compare: null,
			allowDev: false,
		});
	});

	it("survives the `--` that pnpm forwards through a nested workspace script", () => {
		// This is the exact argv the CI job produced when it failed:
		// `pnpm bench -- --scenario gated --runs 7` reached the runner as
		// `node runner/run.ts -- --scenario gated --runs 7`.
		const opts = parseRunnerArgs(["--", "--scenario", "gated", "--runs", "7"]);

		expect(opts.scenario).toBe("gated");
		expect(opts.runs).toBe(7);
	});

	it("reads every flag", () => {
		const opts = parseRunnerArgs([
			"--scenario",
			"mount",
			"--runs",
			"3",
			"--throttle",
			"1",
			"--iterations",
			"20",
			"--headed",
			"--out",
			"results/confirm.json",
			"--compare",
			"results/baseline.json",
			"--allow-dev",
		]);

		expect(opts).toEqual({
			scenario: "mount",
			runs: 3,
			throttle: 1,
			iterations: 20,
			headed: true,
			out: "results/confirm.json",
			compare: "results/baseline.json",
			allowDev: true,
		});
	});

	it("rejects an unknown flag", () => {
		expect(() => parseRunnerArgs(["--scenarios", "gated"])).toThrow();
	});

	it("rejects a stray positional", () => {
		expect(() => parseRunnerArgs(["gated"])).toThrow();
	});

	it.each([
		["--runs", "0"],
		["--runs", "abc"],
		["--throttle", "0"],
		["--throttle", "nope"],
		["--iterations", "0"],
	])("rejects %s %s rather than measuring nothing", (flag, value) => {
		expect(() => parseRunnerArgs([flag, value])).toThrow();
	});
});
