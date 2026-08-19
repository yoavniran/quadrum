import {
	aggregateHeapProfile,
	heapWatchlist,
	shortUrl,
	renderHeapTable,
} from "../runner/heap-aggregate.ts";
import type { HeapProfileNode, SamplingHeapProfile } from "../runner/heap-aggregate.ts";

function node(
	functionName: string,
	selfSize: number,
	children: HeapProfileNode[] = [],
	url = "app.js",
	lineNumber = 0,
): HeapProfileNode {
	return {
		callFrame: { functionName, url, lineNumber, columnNumber: 0 },
		selfSize,
		children,
	};
}

function profile(head: HeapProfileNode): SamplingHeapProfile {
	return { head };
}

describe("aggregateHeapProfile", () => {
	it("attributes self bytes to the allocating frame", () => {
		const p = profile(node("(root)", 0, [node("a", 100, [node("b", 200)])]));

		const summary = aggregateHeapProfile(p);

		expect(summary.sampledBytes).toBe(300);
		expect(summary.functions.find((f) => f.name === "a")!.selfBytes).toBe(100);
		expect(summary.functions.find((f) => f.name === "b")!.selfBytes).toBe(200);
	});

	it("total bytes include everything the frame called", () => {
		const p = profile(node("(root)", 0, [node("a", 100, [node("b", 200)])]));

		const summary = aggregateHeapProfile(p);

		expect(summary.functions.find((f) => f.name === "a")!.totalBytes).toBe(300);
		expect(summary.functions.find((f) => f.name === "b")!.totalBytes).toBe(200);
	});

	it("does not double-count a recursive function within one branch", () => {
		// (root) -> f -> f : both frames share name+url+line.
		const p = profile(node("(root)", 0, [node("f", 100, [node("f", 200)])]));

		const summary = aggregateHeapProfile(p);

		expect(summary.functions).toHaveLength(1);
		const f = summary.functions[0];
		expect(f.selfBytes).toBe(300);
		expect(f.totalBytes).toBe(300);
	});

	it("sums a function reached down two separate branches", () => {
		const p = profile(
			node("(root)", 0, [
				node("a", 0, [node("alloc", 100)]),
				node("b", 0, [node("alloc", 300)]),
			]),
		);

		const summary = aggregateHeapProfile(p);

		const alloc = summary.functions.find((f) => f.name === "alloc")!;
		expect(alloc.selfBytes).toBe(400);
		expect(alloc.totalBytes).toBe(400);
		expect(summary.functions.find((f) => f.name === "a")!.totalBytes).toBe(100);
	});

	it("keeps same-named functions from different bundles apart", () => {
		const p = profile(
			node("(root)", 0, [
				node("update", 100, [], "quadrum.js", 10),
				node("update", 300, [], "chessground.js", 20),
			]),
		);

		const summary = aggregateHeapProfile(p);

		expect(summary.functions).toHaveLength(2);
		expect(summary.functions[0].url).toBe("chessground.js");
		expect(summary.functions[0].selfBytes).toBe(300);
		expect(summary.functions[1].url).toBe("quadrum.js");
	});

	it("excludes V8 meta frames and their bytes from the totals", () => {
		const p = profile(node("(root)", 0, [node("(program)", 500), node("a", 100)]));

		const summary = aggregateHeapProfile(p);

		expect(summary.functions.map((f) => f.name)).toEqual(["a"]);
		expect(summary.sampledBytes).toBe(100);
	});

	it("labels an empty function name as (anonymous)", () => {
		const p = profile(node("(root)", 0, [node("", 100)]));

		const summary = aggregateHeapProfile(p);

		expect(summary.functions[0].name).toBe("(anonymous)");
	});

	it("reports 1-based line numbers", () => {
		const p = profile(node("(root)", 0, [node("a", 100, [], "x.js", 4)]));

		expect(aggregateHeapProfile(p).functions[0].line).toBe(5);
	});

	it("sorts by self bytes descending", () => {
		const p = profile(
			node("(root)", 0, [node("small", 10), node("big", 900), node("mid", 100)]),
		);

		const summary = aggregateHeapProfile(p);

		expect(summary.functions.map((f) => f.name)).toEqual(["big", "mid", "small"]);
	});

	it("throws when the profile has no head node", () => {
		expect(() => aggregateHeapProfile({} as SamplingHeapProfile)).toThrow(/no head node/);
	});
});

describe("heapWatchlist", () => {
	it("filters by name patterns preserving self-bytes order", () => {
		const p = profile(
			node("(root)", 0, [
				node("fenToPieces", 300),
				node("unrelated", 200),
				node("applyPairing", 100),
			]),
		);

		const summary = aggregateHeapProfile(p);
		const watched = heapWatchlist(summary, [/^fenToPieces$/, /^applyPairing$/]);

		expect(watched.map((f) => f.name)).toEqual(["fenToPieces", "applyPairing"]);
	});
});

describe("shortUrl", () => {
	it("returns the basename of a bundle URL", () => {
		expect(shortUrl("http://127.0.0.1:5473/assets/frame-quadrum-abc.js?v=1")).toBe(
			"frame-quadrum-abc.js",
		);
	});

	it("labels an empty URL as native", () => {
		expect(shortUrl("")).toBe("(native)");
	});
});

describe("renderHeapTable", () => {
	it("renders one row per function with its share of the sampled bytes", () => {
		const p = profile(node("(root)", 0, [node("a", 512, [], "x.js", 4)]));
		const summary = aggregateHeapProfile(p);

		const lines = renderHeapTable(summary.functions, summary.sampledBytes).split("\n");

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/function\s+source\s+self\s+share\s+total/);
		expect(lines[1]).toContain("512 B");
		expect(lines[1]).toContain("100.0%");
		expect(lines[1]).toContain("x.js:5");
	});

	it("says so rather than printing an empty table", () => {
		expect(renderHeapTable([], 0)).toContain("no rows");
	});
});
