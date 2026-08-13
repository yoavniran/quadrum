import {
	ALL_PARTS,
	NO_PARTS,
	PART_COORDS,
	PART_MARKS,
	PART_PIECES,
	PART_PROMOTION,
	PART_SQUARES,
	PART_WRAP,
	SQUARES_ONLY,
	MARKS_ONLY,
	PIECES_AND_SQUARES,
	mergeParts,
	dirtyParts,
} from "../src/view/renderParts";
import type { BoardOptions } from "../src/options";
import type { RenderParts } from "../src/view/renderParts";

const has = (parts: RenderParts, flag: RenderParts): boolean => (parts & flag) !== 0;

const ALL_FLAGS = [
	PART_WRAP,
	PART_COORDS,
	PART_PIECES,
	PART_SQUARES,
	PART_MARKS,
	PART_PROMOTION,
];

// The exhaustive specification of which parts each option dirties. It lives here
// rather than in the shipped module on purpose: as a runtime lookup table it cost
// ~115 brotli bytes against an absolute +2% bundle gate, and its only real job is
// to catch an option added without a matching branch in dirtyParts. As a
// Record<keyof BoardOptions, ...> in a test it does that job at typecheck time --
// a new BoardOptions key fails to compile until it is given a value and an
// expectation here -- for no shipped bytes at all.
const SPEC: Record<keyof BoardOptions, { value: unknown; parts: RenderParts }> = {
	// Every layer is positioned by orientation.
	orientation: { value: "black", parts: ALL_PARTS },
	// Squares read state.pieces for their check and target classes.
	position: { value: "8/8/8/8/8/8/8/8", parts: PIECES_AND_SQUARES },
	checkSide: { value: "white", parts: PART_SQUARES },
	lastMove: { value: ["e2", "e4"], parts: PART_SQUARES },
	selected: { value: "e4", parts: PART_SQUARES },
	// targets / showTargets drive square classes.
	moves: { value: { showTargets: true }, parts: PART_SQUARES },
	coordinates: { value: true, parts: PART_COORDS },
	// applyWrapState is the only reader.
	locked: { value: true, parts: PART_WRAP },
	marks: { value: { auto: [] }, parts: PART_MARKS },
	promotion: { value: { enabled: true }, parts: PART_PROMOTION },
	// Nothing under src/view or src/input reads sideToMove; the rest are handlers,
	// enabled flags and timings, none of which are rendered.
	sideToMove: { value: "black", parts: NO_PARTS },
	select: { value: { enabled: true }, parts: NO_PARTS },
	drag: { value: { enabled: false }, parts: NO_PARTS },
	animate: { value: { duration: 300 }, parts: NO_PARTS },
	onPositionChanged: { value: () => {}, parts: NO_PARTS },
};

const bagFor = (key: string, value: unknown): BoardOptions =>
	({ [key]: value }) as BoardOptions;

describe("RenderParts", () => {
	describe("the flags themselves", () => {
		it("are distinct single bits", () => {
			// A duplicated or overlapping flag would silently make one layer render
			// whenever an unrelated one was dirtied.
			expect(new Set(ALL_FLAGS).size).toBe(ALL_FLAGS.length);
			for (const flag of ALL_FLAGS) {
				expect(flag & (flag - 1)).toBe(0);
			}
		});

		it("are all covered by ALL_PARTS, and none by NO_PARTS", () => {
			for (const flag of ALL_FLAGS) {
				expect(has(ALL_PARTS, flag)).toBe(true);
				expect(has(NO_PARTS, flag)).toBe(false);
			}
		});
	});

	describe("dirtyParts", () => {
		it("does nothing on empty options", () => {
			expect(dirtyParts({})).toBe(NO_PARTS);
		});

		// One case per BoardOptions key, generated from SPEC, so an option that is
		// added to the interface but not to dirtyParts cannot reach main: it either
		// fails typecheck here for want of a SPEC entry, or fails this test.
		for (const [key, { value, parts }] of Object.entries(SPEC)) {
			it(`maps ${key} to its declared parts`, () => {
				expect(dirtyParts(bagFor(key, value))).toBe(parts);
			});
		}

		it("treats sideToMove as invisible (no view module reads it)", () => {
			// Called out separately because this is the property the benchmark's
			// update loop passes on every single update -- mapping it to anything
			// would undo the whole optimisation.
			expect(dirtyParts({ sideToMove: "black" })).toBe(NO_PARTS);
		});

		it("keeps position off the layers it does not touch", () => {
			const result = dirtyParts({ position: "8/8/8/8/8/8/8/8" });
			expect(has(result, PART_MARKS)).toBe(false);
			expect(has(result, PART_COORDS)).toBe(false);
			expect(has(result, PART_WRAP)).toBe(false);
			expect(has(result, PART_PROMOTION)).toBe(false);
		});

		it("treats explicit undefined as absent", () => {
			// Callers routinely spread bags carrying explicit undefined.
			expect(dirtyParts({ selected: undefined, marks: { auto: [] } })).toBe(MARKS_ONLY);
			expect(dirtyParts({ orientation: undefined })).toBe(NO_PARTS);
		});

		it("unions multiple keys correctly", () => {
			const result = dirtyParts({
				position: "8/8/8/8/8/8/8/8",
				marks: { auto: [] },
				coordinates: true,
			});
			expect(has(result, PART_PIECES)).toBe(true);
			expect(has(result, PART_SQUARES)).toBe(true);
			expect(has(result, PART_MARKS)).toBe(true);
			expect(has(result, PART_COORDS)).toBe(true);
			expect(has(result, PART_WRAP)).toBe(false);
			expect(has(result, PART_PROMOTION)).toBe(false);
		});

		it("lets orientation absorb every other key", () => {
			expect(dirtyParts({ orientation: "black", marks: { auto: [] } })).toBe(ALL_PARTS);
		});
	});

	describe("mergeParts", () => {
		it("unions two part sets", () => {
			const result = mergeParts(SQUARES_ONLY, MARKS_ONLY);
			expect(has(result, PART_SQUARES)).toBe(true);
			expect(has(result, PART_MARKS)).toBe(true);
			expect(has(result, PART_WRAP)).toBe(false);
			expect(has(result, PART_COORDS)).toBe(false);
			expect(has(result, PART_PIECES)).toBe(false);
			expect(has(result, PART_PROMOTION)).toBe(false);
		});

		it("is order-independent", () => {
			expect(mergeParts(SQUARES_ONLY, MARKS_ONLY)).toBe(mergeParts(MARKS_ONLY, SQUARES_ONLY));
		});

		it("merging with NO_PARTS is identity", () => {
			expect(mergeParts(SQUARES_ONLY, NO_PARTS)).toBe(SQUARES_ONLY);
			expect(mergeParts(NO_PARTS, SQUARES_ONLY)).toBe(SQUARES_ONLY);
		});

		it("merging anything with ALL_PARTS gives ALL_PARTS", () => {
			expect(mergeParts(SQUARES_ONLY, ALL_PARTS)).toBe(ALL_PARTS);
			expect(mergeParts(ALL_PARTS, NO_PARTS)).toBe(ALL_PARTS);
		});
	});
});
