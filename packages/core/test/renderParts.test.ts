import {
	ALL_PARTS,
	NO_PARTS,
	SQUARES_ONLY,
	MARKS_ONLY,
	PIECES_AND_SQUARES,
	mergeParts,
	dirtyParts,
} from "../src/view/renderParts";
import type { BoardOptions } from "../src/options";

describe("RenderParts", () => {
	describe("dirtyParts", () => {
		it("does nothing on empty options", () => {
			expect(dirtyParts({})).toEqual(NO_PARTS);
		});

		it("dirties all parts on orientation change", () => {
			expect(dirtyParts({ orientation: "black" })).toEqual(ALL_PARTS);
		});

		it("dirties pieces and squares on position change", () => {
			const result = dirtyParts({ position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" });
			expect(result).toEqual(PIECES_AND_SQUARES);
			expect(result.marks).toBe(false);
			expect(result.coords).toBe(false);
			expect(result.wrap).toBe(false);
			expect(result.promotion).toBe(false);
		});

		it("treats sideToMove as invisible (no view module reads it)", () => {
			// This is the property the benchmark's update loop passes on every single
			// update, so mapping it to anything would undo the whole optimisation.
			expect(dirtyParts({ sideToMove: "black" })).toEqual(NO_PARTS);
		});

		it("dirties marks only on mark change", () => {
			expect(dirtyParts({ marks: { auto: [] } })).toEqual(MARKS_ONLY);
		});

		it("dirties squares only on selected/lastMove/checkSide/moves change", () => {
			expect(dirtyParts({ selected: "e4" })).toEqual(SQUARES_ONLY);
			expect(dirtyParts({ lastMove: ["e2", "e4"] })).toEqual(SQUARES_ONLY);
			expect(dirtyParts({ checkSide: "white" })).toEqual(SQUARES_ONLY);
			expect(dirtyParts({ moves: { showTargets: true } })).toEqual(SQUARES_ONLY);
		});

		it("dirties coords only on coordinates change", () => {
			const result = dirtyParts({ coordinates: true });
			expect(result.coords).toBe(true);
			expect(result.wrap).toBe(false);
			expect(result.pieces).toBe(false);
			expect(result.squares).toBe(false);
			expect(result.marks).toBe(false);
			expect(result.promotion).toBe(false);
		});

		it("dirties wrap only on locked change", () => {
			const result = dirtyParts({ locked: true });
			expect(result.wrap).toBe(true);
			expect(result.coords).toBe(false);
			expect(result.pieces).toBe(false);
			expect(result.squares).toBe(false);
			expect(result.marks).toBe(false);
			expect(result.promotion).toBe(false);
		});

		it("dirties promotion only on promotion change", () => {
			const result = dirtyParts({ promotion: { enabled: true } });
			expect(result.promotion).toBe(true);
			expect(result.wrap).toBe(false);
			expect(result.coords).toBe(false);
			expect(result.pieces).toBe(false);
			expect(result.squares).toBe(false);
			expect(result.marks).toBe(false);
		});

		it("returns NO_PARTS for invisible-only options", () => {
			expect(dirtyParts({ select: { enabled: true } })).toEqual(NO_PARTS);
			expect(dirtyParts({ drag: { enabled: false } })).toEqual(NO_PARTS);
			expect(dirtyParts({ animate: { duration: 300 } })).toEqual(NO_PARTS);
			expect(dirtyParts({ onPositionChanged: () => {} })).toEqual(NO_PARTS);
		});

		it("returns ALL_PARTS on unknown option key", () => {
			expect(
				dirtyParts({
					orientation: "white",
					unknown: "value",
				} as BoardOptions),
			).toEqual(ALL_PARTS);
		});

		it("treats explicit undefined as absent", () => {
			expect(dirtyParts({ selected: undefined, marks: { auto: [] } })).toEqual(
				MARKS_ONLY,
			);
		});

		it("unions multiple keys correctly", () => {
			const result = dirtyParts({
				position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
				marks: { auto: [] },
				coordinates: true,
			});
			expect(result.pieces).toBe(true);
			expect(result.squares).toBe(true);
			expect(result.marks).toBe(true);
			expect(result.coords).toBe(true);
			expect(result.wrap).toBe(false);
			expect(result.promotion).toBe(false);
		});
	});

	describe("mergeParts", () => {
		it("unions two part sets", () => {
			const result = mergeParts(SQUARES_ONLY, MARKS_ONLY);
			expect(result.squares).toBe(true);
			expect(result.marks).toBe(true);
			expect(result.wrap).toBe(false);
			expect(result.coords).toBe(false);
			expect(result.pieces).toBe(false);
			expect(result.promotion).toBe(false);
		});

		it("is order-independent", () => {
			const ab = mergeParts(SQUARES_ONLY, MARKS_ONLY);
			const ba = mergeParts(MARKS_ONLY, SQUARES_ONLY);
			expect(ab).toEqual(ba);
		});

		it("merging with NO_PARTS is identity", () => {
			expect(mergeParts(SQUARES_ONLY, NO_PARTS)).toEqual(SQUARES_ONLY);
			expect(mergeParts(NO_PARTS, SQUARES_ONLY)).toEqual(SQUARES_ONLY);
		});

		it("merging anything with ALL_PARTS gives ALL_PARTS", () => {
			expect(mergeParts(SQUARES_ONLY, ALL_PARTS)).toEqual(ALL_PARTS);
			expect(mergeParts(ALL_PARTS, NO_PARTS)).toEqual(ALL_PARTS);
		});
	});

	describe("constants are immutable", () => {
		it("ALL_PARTS is not mutated by operations", () => {
			mergeParts(ALL_PARTS, NO_PARTS);
			dirtyParts({ position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" });
			expect(ALL_PARTS).toEqual({
				wrap: true,
				coords: true,
				pieces: true,
				squares: true,
				marks: true,
				promotion: true,
			});
		});

		it("NO_PARTS is not mutated by operations", () => {
			mergeParts(NO_PARTS, SQUARES_ONLY);
			dirtyParts({ marks: { auto: [] } });
			expect(NO_PARTS).toEqual({
				wrap: false,
				coords: false,
				pieces: false,
				squares: false,
				marks: false,
				promotion: false,
			});
		});
	});
});
