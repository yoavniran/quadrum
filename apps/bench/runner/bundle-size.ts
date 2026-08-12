/**
 * Realistic bundle measurement, no browser needed.
 * quadrum ships no piece art; that cost falls on the consumer either way.
 * Pretending it is zero would be the most obvious lie available here.
 */

import { build } from "vite";
// Via vite's own re-export: rollup is a transitive dependency, not a direct one,
// so importing "rollup" types only typechecks by accident of hoisting.
import type { Rollup } from "vite";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import type { BundleSizeResult } from "./types.ts";

/**
 * The CSS a consumer actually has to ship. Two rows, not one: "library CSS"
 * flatters quadrum and means little on its own, because quadrum ships no piece
 * art at all -- that cost falls on the consumer either way, and pretending it is
 * zero would be the most obvious lie available in this whole exercise.
 *
 * Sizes only. No chessground CSS is copied into this repo; these paths are read
 * from node_modules at measurement time and their bytes are counted, never
 * emitted. See CLEANROOM.md.
 */
async function measureCss(appRoot: string): Promise<{ quadrum: [number, number]; chessground: [number, number] }> {
	const cg = (file: string) => fileURLToPath(import.meta.resolve(`chessground/assets/${file}`));
	const [quadrumCss, base, brown, cburnett] = await Promise.all([
		readFile(resolve(appRoot, "../../packages/core/assets/quadrum.css")),
		readFile(cg("chessground.base.css")),
		readFile(cg("chessground.brown.css")),
		readFile(cg("chessground.cburnett.css")),
	]);

	return {
		// quadrum's "working board" figure borrows the SAME cburnett art the bench
		// paints on it at runtime, so the two rows compare like with like. A quadrum
		// consumer picking different art pays a different number; this is the
		// closest honest stand-in, not a claim about any particular app.
		quadrum: [quadrumCss.length, quadrumCss.length + cburnett.length],
		chessground: [base.length, base.length + brown.length + cburnett.length],
	};
}

/**
 * Measure bundles for both subjects, subtracting baseline overhead.
 */
export async function measureBundles(appRoot: string): Promise<BundleSizeResult[]> {
	const tempDir = await mkdtemp(join(tmpdir(), "bench-bundle-"));

	try {
		const entries = {
			quadrum: join(appRoot, "bench-entries", "quadrum.entry.ts"),
			chessground: join(appRoot, "bench-entries", "chessground.entry.ts"),
			baseline: join(appRoot, "bench-entries", "baseline.entry.ts"),
		};

		const results: Record<string, Buffer> = {};

		for (const [name, entry] of Object.entries(entries)) {
			const outDir = join(tempDir, name);
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
				throw new Error(`bundle-size: no entry chunk emitted for "${name}"`);
			}

			results[name] = await readFile(join(outDir, chunk.fileName));
		}

		const baseline = results.baseline;
		const quadrumRaw = results.quadrum;
		const chessgroundRaw = results.chessground;

		// Subtract baseline from subjects
		const quadrumSubject = {
			raw: Math.max(0, quadrumRaw.length - baseline.length),
			gzip: Math.max(0, gzipSync(quadrumRaw).length - gzipSync(baseline).length),
			brotli: Math.max(0, brotliCompressSync(quadrumRaw).length - brotliCompressSync(baseline).length),
		};

		const chessgroundSubject = {
			raw: Math.max(0, chessgroundRaw.length - baseline.length),
			gzip: Math.max(0, gzipSync(chessgroundRaw).length - gzipSync(baseline).length),
			brotli: Math.max(0, brotliCompressSync(chessgroundRaw).length - brotliCompressSync(baseline).length),
		};

		const css = await measureCss(appRoot);

		return [
			{
				subject: "quadrum",
				raw: quadrumSubject.raw,
				gzip: quadrumSubject.gzip,
				brotli: quadrumSubject.brotli,
				cssRaw: css.quadrum[0],
				cssWithArtRaw: css.quadrum[1],
			},
			{
				subject: "chessground",
				raw: chessgroundSubject.raw,
				gzip: chessgroundSubject.gzip,
				brotli: chessgroundSubject.brotli,
				cssRaw: css.chessground[0],
				cssWithArtRaw: css.chessground[1],
			},
		];
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}
