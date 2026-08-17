/**
 * Byte counting, delegated to `overweight`.
 *
 * The runner used to reach for node:zlib and `buffer.length` directly, which
 * meant this repo maintained its own opinion about what "min+brotli" means.
 * overweight is the project that owns that opinion (and its gzip/brotli/none
 * testers), so the runner hands it files and reads back numbers.
 *
 * What stays here is only the part overweight does not do: the bench builds its
 * own bundles (see bundle-size.ts) and needs raw numbers for arithmetic --
 * baseline subtraction, CSS-plus-art sums -- rather than pass/fail against a
 * limit. So every rule is measure-only, and the gate that DOES fail on growth
 * stays where it already lives, in .github/scripts/bench-report.mjs against the
 * recorded baseline.
 */

import { basename, dirname } from "node:path";
import { normalizeConfig, runChecks, type BuiltinTesterId } from "overweight";

/**
 * overweight's schema requires a limit on every rule. Nothing here is gating, so
 * pick a limit nothing can trip and ignore the resulting `passed`.
 */
const MEASURE_ONLY_LIMIT = Number.MAX_SAFE_INTEGER;

export interface SizeTarget {
	/** Caller's name for this measurement; must be unique across the batch. */
	readonly key: string;
	/** Absolute path of the file to measure. */
	readonly file: string;
	readonly compression: BuiltinTesterId;
}

/**
 * A file name is a literal, but overweight resolves `path` as a glob, so any
 * glob metacharacter in the name has to be escaped or the rule silently matches
 * nothing (or, worse, something else). pnpm's store paths are the realistic
 * source of these -- `@lichess-org+chessground@10.1.1` today, which already
 * carries both a `@` and a `+`, and a `+build` tag tomorrow.
 */
function escapeGlob(name: string): string {
	return name.replace(/[\\*?[\](){}!+@]/g, (char) => `\\${char}`);
}

/**
 * Measure every target and return `key -> bytes`.
 *
 * Targets are grouped by directory because a normalized overweight config has a
 * single `root`; the bench's files come from a temp build dir, the repo, and
 * node_modules at once.
 *
 * Throws rather than reporting a zero: a bundle-size row that quietly reads 0
 * because a path moved is worse than no row at all.
 */
export async function measureSizes(targets: readonly SizeTarget[]): Promise<Map<string, number>> {
	if (targets.length === 0) {
		return new Map();
	}

	const byDirectory = new Map<string, SizeTarget[]>();

	for (const target of targets) {
		const directory = dirname(target.file);
		const group = byDirectory.get(directory);

		if (group) {
			group.push(target);
		} else {
			byDirectory.set(directory, [target]);
		}
	}

	const runs = await Promise.all(
		[...byDirectory].map(([root, group]) =>
			runChecks(
				normalizeConfig({
					root,
					files: group.map((target) => ({
						path: escapeGlob(basename(target.file)),
						label: target.key,
						compression: target.compression,
						maxSize: MEASURE_ONLY_LIMIT,
					})),
				}),
			),
		),
	);

	const sizes = new Map<string, number>();

	for (const run of runs) {
		for (const entry of run.results) {
			if (entry.error || typeof entry.size !== "number") {
				throw new Error(
					`size-measure: overweight could not measure "${entry.label}" (${entry.pattern}): ${entry.error ?? "no size reported"}`,
				);
			}

			if (sizes.has(entry.label)) {
				throw new Error(`size-measure: "${entry.label}" matched more than one file, last was "${entry.filePath}"`);
			}

			sizes.set(entry.label, entry.size);
		}
	}

	const missing = targets.filter((target) => !sizes.has(target.key));

	if (missing.length > 0) {
		throw new Error(`size-measure: no measurement returned for ${missing.map((target) => `"${target.key}"`).join(", ")}`);
	}

	return sizes;
}

/**
 * Read a key that `measureSizes` was asked to produce. Separate from the map
 * lookup so a typo in a key becomes an error instead of `undefined` spreading
 * into the arithmetic below it.
 */
export function requireSize(sizes: ReadonlyMap<string, number>, key: string): number {
	const size = sizes.get(key);

	if (size === undefined) {
		throw new Error(`size-measure: expected a measurement for "${key}"`);
	}

	return size;
}
