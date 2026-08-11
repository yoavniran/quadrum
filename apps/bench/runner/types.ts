/**
 * Node-side types for the headless runner.
 * This file is type-only; it is imported by the runner under Node 24 type stripping.
 * schemaVersion is hard-failed on by report scripts, as this file lives in git for years.
 */

import type { ScenarioComparison, BenchEnv, ScenarioMeta } from "../src/core/types.ts";

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

export interface BundleSizeResult {
	readonly subject: "quadrum" | "chessground";
	readonly raw: number;
	readonly gzip: number;
	readonly brotli: number;
	readonly cssRaw: number;
	readonly cssWithArtRaw: number;
}

export interface RunRecord {
	readonly schemaVersion: 1;
	readonly run: {
		readonly id: string;
		readonly startedAt: string;
		readonly durationMs: number;
		readonly trigger: string;
		readonly publishable: boolean;
	};
	readonly env: {
		readonly node: string;
		readonly platform: string;
		readonly arch: string;
		readonly cpus: number;
		readonly cpuModel: string;
		readonly gitSha: string;
		readonly gitRef: string;
		readonly gitDirty: boolean;
	};
	readonly browser: {
		readonly name: string;
		readonly version: string;
		readonly headless: boolean;
		readonly viewport: {
			readonly width: number;
			readonly height: number;
		};
		readonly deviceScaleFactor: number;
		readonly cpuThrottlingRate: number;
	};
	readonly page: BenchEnv;
	readonly subjects: {
		readonly quadrum: string;
		readonly chessground: string;
	};
	readonly config: {
		readonly repetitions: number;
		readonly warmups: number;
		readonly order: "interleaved-abba";
		readonly freshContextPerRepetition: boolean;
	};
	/**
	 * Scenario definitions as the page reported them, including the parity and
	 * end-condition prose. Carried in the record so the numbers and the method
	 * that produced them cannot be separated.
	 */
	readonly scenarioMeta: readonly ScenarioMeta[];
	/** One entry per repetition, each holding that repetition's comparisons. */
	readonly scenarios: readonly (readonly ScenarioComparison[])[];
	readonly bundleSizes: readonly BundleSizeResult[];
	readonly caveats: readonly string[];
}
