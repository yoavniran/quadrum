/**
 * Realistic bundle measurement, no browser needed.
 * quadrum ships no piece art; that cost falls on the consumer either way.
 * Pretending it is zero would be the most obvious lie available here.
 *
 * This file builds; it does not weigh. Every byte count comes from `overweight`
 * via size-measure.ts, so "min+gzip" and "min+brotli" mean here exactly what
 * they mean in that project, and this repo has no second implementation of them
 * to keep in sync.
 */

import { build } from "vite";
// Via vite's own re-export: rollup is a transitive dependency, not a direct one,
// so importing "rollup" types only typechecks by accident of hoisting.
import type { Rollup } from "vite";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import type { BundleSizeResult } from "./types.ts";
import { measureSizes, requireSize, type SizeTarget } from "./size-measure.ts";

/** Subjects, plus the baseline whose bytes are subtracted from both. */
const ENTRY_NAMES = ["quadrum", "chessground", "baseline"] as const;

type EntryName = (typeof ENTRY_NAMES)[number];

/**
 * The CSS a consumer actually has to ship. Two rows, not one: "library CSS"
 * flatters quadrum and means little on its own, because quadrum ships no piece
 * art at all -- that cost falls on the consumer either way, and pretending it is
 * zero would be the most obvious lie available in this whole exercise.
 *
 * Paths only, resolved from node_modules at measurement time. No chessground CSS
 * is copied into this repo; its bytes are counted where they lie and never
 * emitted. See CLEANROOM.md.
 */
function cssTargets(appRoot: string): SizeTarget[] {
	const cg = (file: string) => fileURLToPath(import.meta.resolve(`chessground/assets/${file}`));

	return [
		{ key: "css:quadrum", file: resolve(appRoot, "../../packages/core/assets/quadrum.css"), compression: "none" },
		{ key: "css:chessground-base", file: cg("chessground.base.css"), compression: "none" },
		{ key: "css:chessground-brown", file: cg("chessground.brown.css"), compression: "none" },
		{ key: "css:cburnett", file: cg("chessground.cburnett.css"), compression: "none" },
	];
}

/**
 * Build one lib-mode bundle and return the absolute path of its entry chunk.
 */
async function buildEntry(appRoot: string, entry: string, outDir: string): Promise<string> {
	const built = (await build({
		root: appRoot,
		logLevel: "error",
		build: {
			lib: {
				entry,
				formats: ["es"],
				fileName: "bundle",
			},
			outDir,
			emptyOutDir: true,
			minify: "esbuild",
			write: true,
			sourcemap: false,
		},
		// No `resolve` here on purpose: `root` is apps/bench, so this build loads
		// apps/bench/vite.config.ts and inherits its alias, which maps quadrum to
		// its src/. That keeps the measured bytes the CURRENT source rather than a
		// stale dist/, and keeps chessground on ordinary consumer resolution.
	})) as Rollup.RollupOutput | Rollup.RollupOutput[];

	// Never guess the filename. Vite's lib mode derives the extension from the
	// package's own "type" field, so a hardcoded ".mjs" breaks the moment that
	// changes -- which is exactly how this first failed. Vite 8 also returns an
	// ARRAY of outputs (one per format), so normalise before searching.
	const outputs = (Array.isArray(built) ? built : [built]).flatMap((o) => o.output);
	const chunk = outputs.find((o) => o.type === "chunk" && o.isEntry);

	if (!chunk) {
		throw new Error(`bundle-size: no entry chunk emitted for "${entry}"`);
	}

	return join(outDir, chunk.fileName);
}

/** Every compression the results JSON reports for the JS bundles. */
const JS_COMPRESSIONS = ["none", "gzip", "brotli"] as const;

const jsKey = (name: EntryName, compression: (typeof JS_COMPRESSIONS)[number]) => `js:${name}:${compression}`;

/**
 * Measure bundles for both subjects, subtracting baseline overhead.
 */
export async function measureBundles(appRoot: string): Promise<BundleSizeResult[]> {
	const tempDir = await mkdtemp(join(tmpdir(), "bench-bundle-"));

	try {
		const bundles = new Map<EntryName, string>();

		for (const name of ENTRY_NAMES) {
			bundles.set(
				name,
				await buildEntry(appRoot, join(appRoot, "bench-entries", `${name}.entry.ts`), join(tempDir, name)),
			);
		}

		const jsTargets = ENTRY_NAMES.flatMap((name) =>
			JS_COMPRESSIONS.map((compression) => ({
				key: jsKey(name, compression),
				file: bundles.get(name)!,
				compression,
			})),
		);

		const sizes = await measureSizes([...jsTargets, ...cssTargets(appRoot)]);

		// Subtract the baseline entry's own bytes from each subject, per
		// compression. Clamped at zero: a negative "size" is never the honest
		// reading, it just means the two builds shared more than they differed.
		const subject = (name: EntryName) => ({
			raw: Math.max(0, requireSize(sizes, jsKey(name, "none")) - requireSize(sizes, jsKey("baseline", "none"))),
			gzip: Math.max(0, requireSize(sizes, jsKey(name, "gzip")) - requireSize(sizes, jsKey("baseline", "gzip"))),
			brotli: Math.max(0, requireSize(sizes, jsKey(name, "brotli")) - requireSize(sizes, jsKey("baseline", "brotli"))),
		});

		const quadrumCss = requireSize(sizes, "css:quadrum");
		const cburnett = requireSize(sizes, "css:cburnett");
		const chessgroundCss = requireSize(sizes, "css:chessground-base");

		return [
			{
				subject: "quadrum",
				...subject("quadrum"),
				cssRaw: quadrumCss,
				// quadrum's "working board" figure borrows the SAME cburnett art the
				// bench paints on it at runtime, so the two rows compare like with
				// like. A quadrum consumer picking different art pays a different
				// number; this is the closest honest stand-in, not a claim about any
				// particular app.
				cssWithArtRaw: quadrumCss + cburnett,
			},
			{
				subject: "chessground",
				...subject("chessground"),
				cssRaw: chessgroundCss,
				cssWithArtRaw: chessgroundCss + requireSize(sizes, "css:chessground-brown") + cburnett,
			},
		];
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
