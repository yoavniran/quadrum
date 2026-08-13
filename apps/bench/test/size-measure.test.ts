import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { measureSizes, requireSize } from "../runner/size-measure.ts";

/**
 * These cover the part of bundle-size measurement this repo still owns: handing
 * overweight the right files and mapping its answers back. The compression math
 * itself is overweight's, and is not re-asserted here beyond sanity.
 */

// Repetitive on purpose: compressible enough that gzip/brotli must come out
// well under raw, so a tester silently falling back to raw bytes fails the test.
const TEXT = "export const squares = [".concat("a1,b2,c3,d4,".repeat(400), "];\n");

let root = "";
let dirA = "";
let dirB = "";

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "size-measure-test-"));
	dirA = join(root, "a");
	dirB = join(root, "b");
	await mkdir(dirA);
	await mkdir(dirB);
	await writeFile(join(dirA, "bundle.js"), TEXT);
	await writeFile(join(dirB, "styles.css"), ".board{color:red}\n");
	// A pnpm-store-shaped name: the glob metacharacters here are why the pattern
	// gets escaped rather than passed through.
	await writeFile(join(dirB, "chessground@9.2.1+build(1).css"), ".cg{color:blue}\n");
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("measureSizes", () => {
	it("returns raw bytes for the none tester", async () => {
		const sizes = await measureSizes([{ key: "js:raw", file: join(dirA, "bundle.js"), compression: "none" }]);

		expect(sizes.get("js:raw")).toBe(Buffer.byteLength(TEXT));
	});

	it("compresses for the gzip and brotli testers", async () => {
		const sizes = await measureSizes([
			{ key: "js:raw", file: join(dirA, "bundle.js"), compression: "none" },
			{ key: "js:gzip", file: join(dirA, "bundle.js"), compression: "gzip" },
			{ key: "js:brotli", file: join(dirA, "bundle.js"), compression: "brotli" },
		]);

		const raw = requireSize(sizes, "js:raw");
		const gzip = requireSize(sizes, "js:gzip");
		const brotli = requireSize(sizes, "js:brotli");

		expect(gzip).toBeLessThan(raw);
		expect(brotli).toBeLessThanOrEqual(gzip);
		expect(brotli).toBeGreaterThan(0);
	});

	it("measures files that live in different directories in one call", async () => {
		const sizes = await measureSizes([
			{ key: "js", file: join(dirA, "bundle.js"), compression: "none" },
			{ key: "css", file: join(dirB, "styles.css"), compression: "none" },
		]);

		expect(sizes.get("js")).toBe(Buffer.byteLength(TEXT));
		expect(sizes.get("css")).toBe(Buffer.byteLength(".board{color:red}\n"));
	});

	it("measures file names containing glob metacharacters", async () => {
		const sizes = await measureSizes([
			{ key: "cg", file: join(dirB, "chessground@9.2.1+build(1).css"), compression: "none" },
		]);

		expect(sizes.get("cg")).toBe(Buffer.byteLength(".cg{color:blue}\n"));
	});

	it("does not let a glob-escaped pattern match a sibling file", async () => {
		// "chessground@9.2.1+build(1).css" unescaped is a glob that could match
		// other names in the same directory; escaped, it matches exactly itself.
		const sizes = await measureSizes([
			{ key: "cg", file: join(dirB, "chessground@9.2.1+build(1).css"), compression: "none" },
			{ key: "css", file: join(dirB, "styles.css"), compression: "none" },
		]);

		expect(sizes.size).toBe(2);
	});

	it("returns an empty map for no targets", async () => {
		await expect(measureSizes([])).resolves.toEqual(new Map());
	});

	it("throws when a file is missing rather than reporting zero", async () => {
		await expect(
			measureSizes([{ key: "gone", file: join(dirA, "not-here.js"), compression: "none" }]),
		).rejects.toThrow(/could not measure "gone"/);
	});

	it("throws when two targets share a key", async () => {
		await expect(
			measureSizes([
				{ key: "dupe", file: join(dirA, "bundle.js"), compression: "none" },
				{ key: "dupe", file: join(dirA, "bundle.js"), compression: "gzip" },
			]),
		).rejects.toThrow(/matched more than one file/);
	});
});

describe("requireSize", () => {
	it("returns the measured value", () => {
		expect(requireSize(new Map([["a", 12]]), "a")).toBe(12);
	});

	it("throws on a key that was never measured", () => {
		expect(() => requireSize(new Map([["a", 12]]), "b")).toThrow(/expected a measurement for "b"/);
	});
});
