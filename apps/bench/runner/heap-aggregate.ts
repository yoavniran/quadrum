/**
 * Pure aggregation over a V8 sampling heap profile: per-function self and total
 * (inclusive) allocated bytes. Kept free of I/O so it is unit-testable, exactly
 * as `profile-aggregate.ts` is for the CPU profile.
 *
 * The CPU profiler answers "where does the time go". This answers "who
 * allocates", which is the question a GC-shaped tail asks. The two are
 * deliberately separate tools: a function can be cheap in self time and still
 * be the largest source of garbage, and that combination is invisible to a
 * .cpuprofile.
 */

export interface HeapCallFrame {
	functionName: string;
	scriptId?: string;
	url: string;
	lineNumber: number;
	columnNumber: number;
}

/** A node of the CDP `HeapProfiler.SamplingHeapProfileNode` tree. */
export interface HeapProfileNode {
	callFrame: HeapCallFrame;
	selfSize: number;
	id?: number;
	children?: HeapProfileNode[];
}

export interface SamplingHeapProfile {
	head: HeapProfileNode;
}

export interface AllocationStat {
	/** functionName, or "(anonymous)" when V8 reports an empty string. */
	name: string;
	url: string;
	line: number;
	/** Bytes allocated by this frame itself. */
	selfBytes: number;
	/** Bytes allocated by this frame and everything it called. */
	totalBytes: number;
}

export interface HeapSummary {
	/** Total bytes attributed across the whole tree. */
	sampledBytes: number;
	/** All allocating functions, sorted by self bytes descending. */
	functions: AllocationStat[];
}

/** V8 meta frames that are not user functions. */
const META_NAMES = new Set(["(root)", "(program)", "(idle)", "(garbage collector)"]);

function frameKey(frame: HeapCallFrame): string {
	const name = frame.functionName === "" ? "(anonymous)" : frame.functionName;
	return `${name} ${frame.url} ${frame.lineNumber}`;
}

/**
 * Aggregate a sampling heap profile into per-function self and total bytes.
 *
 * Self bytes: a node's own `selfSize`. Total bytes: a node's subtree sum, added
 * once to every DISTINCT function on the path from the root, so recursion never
 * double-counts a function within one branch.
 *
 * @throws when the profile has no head node — that means sampling was never
 * started, and a report built from it would read as "nothing allocates".
 */
export function aggregateHeapProfile(profile: SamplingHeapProfile): HeapSummary {
	if (!profile || !profile.head) {
		throw new Error("heap profile has no head node; was sampling started?");
	}

	const selfBytes = new Map<string, number>();
	const totalBytes = new Map<string, number>();
	const frameOf = new Map<string, HeapCallFrame>();
	let sampledBytes = 0;

	/**
	 * Walk depth-first, returning the subtree's byte total so the caller can
	 * attribute it upward. `ancestors` carries the distinct function keys already
	 * seen on this path, which is what makes recursion count once.
	 */
	const walk = (node: HeapProfileNode, ancestors: ReadonlySet<string>): number => {
		const isMeta = META_NAMES.has(node.callFrame.functionName);
		const key = frameKey(node.callFrame);
		const self = node.selfSize > 0 ? node.selfSize : 0;

		if (!isMeta && self > 0) {
			selfBytes.set(key, (selfBytes.get(key) ?? 0) + self);
			frameOf.set(key, node.callFrame);
			sampledBytes += self;
		}

		const path = isMeta || ancestors.has(key) ? ancestors : new Set([...ancestors, key]);

		let subtree = self;
		for (const child of node.children ?? []) {
			subtree += walk(child, path);
		}

		// Charge the subtree to this frame, and to every ancestor exactly once.
		// `path` already contains this frame unless it is meta or a recursion.
		if (!isMeta && subtree > 0) {
			frameOf.set(key, node.callFrame);
			if (!ancestors.has(key)) {
				totalBytes.set(key, (totalBytes.get(key) ?? 0) + subtree);
			}
		}

		return subtree;
	};

	walk(profile.head, new Set());

	const functions: AllocationStat[] = [];

	for (const [key, frame] of frameOf) {
		functions.push({
			name: frame.functionName === "" ? "(anonymous)" : frame.functionName,
			url: frame.url,
			// V8 reports 0-based lines; every other report in this repo is 1-based.
			line: frame.lineNumber + 1,
			selfBytes: selfBytes.get(key) ?? 0,
			totalBytes: totalBytes.get(key) ?? 0,
		});
	}

	functions.sort((a, b) => b.selfBytes - a.selfBytes || b.totalBytes - a.totalBytes);

	return { sampledBytes, functions };
}

/**
 * Filter a summary down to functions whose name matches one of `patterns`,
 * preserving the summary's self-bytes ordering.
 */
export function heapWatchlist(
	summary: HeapSummary,
	patterns: readonly RegExp[],
): AllocationStat[] {
	return summary.functions.filter((fn) => patterns.some((p) => p.test(fn.name)));
}

/** The trailing path segment of a bundle URL, or "(native)" when there is none. */
export function shortUrl(url: string): string {
	if (!url) {
		return "(native)";
	}
	const withoutQuery = url.split("?")[0];
	const segments = withoutQuery.split("/");
	return segments[segments.length - 1] || withoutQuery;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}
	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(1)} kB`;
	}
	return `${Math.round(bytes)} B`;
}

/** A fixed-width table of allocating functions, with each row's share of the total. */
export function renderHeapTable(rows: readonly AllocationStat[], sampledBytes: number): string {
	if (rows.length === 0) {
		return "  (no rows)";
	}

	const nameWidth = Math.max(8, ...rows.map((r) => r.name.length));
	const urlWidth = Math.max(6, ...rows.map((r) => shortUrl(r.url).length));

	const header =
		`  ${"function".padEnd(nameWidth)}  ${"source".padEnd(urlWidth)}  ` +
		`${"self".padStart(10)}  ${"share".padStart(7)}  ${"total".padStart(10)}`;

	const lines = rows.map((row) => {
		const share = sampledBytes > 0 ? (row.selfBytes / sampledBytes) * 100 : 0;
		return (
			`  ${row.name.padEnd(nameWidth)}  ${shortUrl(row.url).padEnd(urlWidth)}  ` +
			`${formatBytes(row.selfBytes).padStart(10)}  ${`${share.toFixed(1)}%`.padStart(7)}  ` +
			`${formatBytes(row.totalBytes).padStart(10)}  ${shortUrl(row.url)}:${row.line}`
		);
	});

	return [header, ...lines].join("\n");
}
