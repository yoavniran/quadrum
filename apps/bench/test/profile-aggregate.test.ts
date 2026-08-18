import {
	aggregateProfile,
	watchlist,
	shortUrl,
	renderTable,
} from "../runner/profile-aggregate.ts";
import type { CpuProfile, ProfileNode } from "../runner/profile-aggregate.ts";

function node(
	id: number,
	functionName: string,
	children: number[] = [],
	url = "app.js",
	lineNumber = 0,
): ProfileNode {
	return { id, callFrame: { functionName, url, lineNumber, columnNumber: 0 }, children };
}

function profile(
	nodes: ProfileNode[],
	samples: number[],
	timeDeltas: number[],
): CpuProfile {
	return { nodes, samples, timeDeltas, startTime: 0, endTime: 1 };
}

describe("aggregateProfile", () => {
	it("attributes self time to the sampled frame", () => {
		// (root) -> a -> b
		const p = profile(
			[node(1, "(root)", [2]), node(2, "a", [3]), node(3, "b")],
			[2, 3, 3],
			[100, 100, 100],
		);

		const summary = aggregateProfile(p);

		expect(summary.sampledMs).toBeCloseTo(0.3);
		const a = summary.functions.find((f) => f.name === "a")!;
		const b = summary.functions.find((f) => f.name === "b")!;
		expect(a.selfMs).toBeCloseTo(0.1);
		expect(b.selfMs).toBeCloseTo(0.2);
	});

	it("total time includes time spent in callees", () => {
		const p = profile(
			[node(1, "(root)", [2]), node(2, "a", [3]), node(3, "b")],
			[2, 3, 3],
			[100, 100, 100],
		);

		const summary = aggregateProfile(p);

		const a = summary.functions.find((f) => f.name === "a")!;
		expect(a.totalMs).toBeCloseTo(0.3);
		const b = summary.functions.find((f) => f.name === "b")!;
		expect(b.totalMs).toBeCloseTo(0.2);
	});

	it("does not double-count a recursive function within one sample", () => {
		// (root) -> f -> f  (direct recursion; both frames share name+url+line)
		const p = profile(
			[node(1, "(root)", [2]), node(2, "f", [3]), node(3, "f")],
			[3],
			[100],
		);

		const summary = aggregateProfile(p);

		expect(summary.functions).toHaveLength(1);
		const f = summary.functions[0];
		expect(f.name).toBe("f");
		expect(f.selfMs).toBeCloseTo(0.1);
		expect(f.totalMs).toBeCloseTo(0.1);
	});

	it("keeps same-named functions from different sources apart", () => {
		const p = profile(
			[
				node(1, "(root)", [2, 3]),
				node(2, "update", [], "quadrum.js", 10),
				node(3, "update", [], "chessground.js", 20),
			],
			[2, 3],
			[100, 300],
		);

		const summary = aggregateProfile(p);

		expect(summary.functions).toHaveLength(2);
		expect(summary.functions[0].url).toBe("chessground.js");
		expect(summary.functions[0].selfMs).toBeCloseTo(0.3);
		expect(summary.functions[1].url).toBe("quadrum.js");
	});

	it("excludes V8 meta frames but keeps their time in sampledMs", () => {
		const p = profile(
			[node(1, "(root)", [2, 3]), node(2, "(idle)"), node(3, "a")],
			[2, 3],
			[900, 100],
		);

		const summary = aggregateProfile(p);

		expect(summary.sampledMs).toBeCloseTo(1);
		expect(summary.functions.map((f) => f.name)).toEqual(["a"]);
	});

	it("labels an empty function name as (anonymous)", () => {
		const p = profile([node(1, "(root)", [2]), node(2, "")], [2], [100]);

		const summary = aggregateProfile(p);

		expect(summary.functions[0].name).toBe("(anonymous)");
	});

	it("ignores non-positive deltas", () => {
		const p = profile(
			[node(1, "(root)", [2]), node(2, "a")],
			[2, 2, 2],
			[100, 0, -50],
		);

		const summary = aggregateProfile(p);

		expect(summary.sampledMs).toBeCloseTo(0.1);
		expect(summary.functions[0].selfMs).toBeCloseTo(0.1);
	});

	it("throws on a profile with no samples", () => {
		const p: CpuProfile = {
			nodes: [node(1, "(root)")],
			startTime: 0,
			endTime: 1,
		};

		expect(() => aggregateProfile(p)).toThrow(/no samples/);
	});

	it("throws on samples/timeDeltas length mismatch", () => {
		const p = profile([node(1, "(root)", [2]), node(2, "a")], [2, 2], [100]);

		expect(() => aggregateProfile(p)).toThrow(/mismatch/);
	});

	it("throws when a sample references an unknown node", () => {
		const p = profile([node(1, "(root)")], [99], [100]);

		expect(() => aggregateProfile(p)).toThrow(/unknown node/);
	});
});

describe("watchlist", () => {
	it("filters by name patterns preserving self-time order", () => {
		const p = profile(
			[
				node(1, "(root)", [2, 3, 4]),
				node(2, "renderPieces"),
				node(3, "unrelated"),
				node(4, "placeSquare"),
			],
			[2, 3, 4],
			[300, 200, 100],
		);

		const summary = aggregateProfile(p);
		const watched = watchlist(summary, [/^renderPieces$/, /^placeSquare$/]);

		expect(watched.map((f) => f.name)).toEqual(["renderPieces", "placeSquare"]);
	});
});

describe("shortUrl", () => {
	it("returns the basename of a bundle URL", () => {
		expect(shortUrl("http://127.0.0.1:5473/assets/frame-quadrum-abc.js")).toBe(
			"frame-quadrum-abc.js",
		);
	});

	it("labels an empty URL as native", () => {
		expect(shortUrl("")).toBe("(native)");
	});
});

describe("renderTable", () => {
	it("renders one aligned row per function with a 1-based line", () => {
		const p = profile(
			[node(1, "(root)", [2]), node(2, "a", [], "x.js", 4)],
			[2],
			[100],
		);
		const summary = aggregateProfile(p);

		const table = renderTable(summary.functions, summary.sampledMs);
		const lines = table.split("\n");

		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatch(/self ms\s+self %\s+total ms\s+function\s+source/);
		expect(lines[1]).toContain("a");
		expect(lines[1]).toContain("x.js:5");
		expect(lines[1]).toContain("100.0%");
	});
});
