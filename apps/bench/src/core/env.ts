/**
 * Runtime environment detection for benchmarks.
 */

import type { BenchEnv } from "./types";

/**
 * Read the benchmark environment, including browser and build info.
 */
export function readEnv(
	quadrumVersion: string,
	chessgroundVersion: string,
): BenchEnv {
	return {
		userAgent: navigator.userAgent,
		devicePixelRatio: window.devicePixelRatio,
		hardwareConcurrency: navigator.hardwareConcurrency || 0,
		deviceMemory:
			(navigator as { deviceMemory?: number }).deviceMemory ?? null,
		mode: import.meta.env.DEV ? "development" : "production",
		quadrumVersion,
		chessgroundVersion,
	};
}

/**
 * Assert that the build is a production build. Throws an Error if not and
 * allowDev is false. The error message is clear about how to override.
 */
export function assertProductionBuild(allowDev: boolean): void {
	if (import.meta.env.DEV && !allowDev) {
		throw new Error(
			"benchmarks must run against `vite build` + `vite preview`; " +
				"dev-server timings compare build pipelines, not renderers. " +
				"Pass --allow-dev to override.",
		);
	}
}
