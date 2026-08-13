/**
 * Local types for `overweight`, which ships JS only (no `.d.ts`, no "types"
 * field) as of 2.1.0. This declares the narrow slice the runner actually calls
 * -- inline config in, measured bytes out -- so `tsc -p tsconfig.runner.json`
 * has something real to check instead of `any`.
 *
 * Delete this file the moment overweight publishes its own declarations; keeping
 * a hand-written mirror alive longer than that is how the two drift apart.
 */
declare module "overweight" {
	/** Built-in tester ids. overweight accepts custom ids too; the runner uses none. */
	export type OverweightTesterId = "none" | "gzip" | "brotli";

	export interface OverweightFileRule {
		/** Path or glob, resolved against the config's `root`. */
		readonly path: string;
		/** Required by overweight's schema even when only the measurement is wanted. */
		readonly maxSize: string | number;
		readonly compression?: string;
		readonly label?: string;
	}

	export interface OverweightConfig {
		readonly root?: string;
		readonly defaultCompression?: string;
		readonly files: readonly OverweightFileRule[];
	}

	/**
	 * A config that has been through `normalizeConfig`. Opaque on purpose: the
	 * runner only ever hands it straight back to `runChecks`.
	 */
	export type OverweightNormalizedConfig = { readonly __overweightNormalized: unique symbol };

	export interface OverweightEntry {
		readonly label: string;
		readonly pattern: string;
		/** Relative to the config's `root`. */
		readonly filePath: string;
		/** Absent on entries that matched no file. */
		readonly absolutePath?: string;
		readonly tester: string;
		readonly testerLabel: string;
		/** `null` when the rule matched nothing. */
		readonly size: number | null;
		readonly sizeFormatted: string;
		readonly maxSize: number;
		readonly diff: number | null;
		readonly passed: boolean;
		readonly error?: string;
	}

	export interface OverweightRunResult {
		readonly results: readonly OverweightEntry[];
		readonly stats: {
			readonly files: number;
			readonly failures: readonly OverweightEntry[];
			readonly hasFailures: boolean;
			readonly hasErrors: boolean;
		};
	}

	export function normalizeConfig(
		rawConfig: OverweightConfig,
		options?: { cwd?: string; source?: { type: string; location?: string } },
	): OverweightNormalizedConfig;

	export function runChecks(
		config: OverweightConfig | OverweightNormalizedConfig,
		options?: { testers?: Record<string, unknown> },
	): Promise<OverweightRunResult>;

	export function listTesters(): readonly { id: string; label: string }[];
}
