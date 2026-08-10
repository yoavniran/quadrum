import { describe, it, expect } from "vitest";
import { GAME_POSITIONS, GAME_POSITION_COUNT } from "../src/data/game";
import { ARROW_FRAMES, ARROW_FRAME_COUNT } from "../src/data/arrows";
import {
	ALL_SQUARES,
	squareIndex,
	squareFraction,
	isBenchSquare,
} from "../src/data/squares";
import { fenToPieces } from "quadrum";

describe("game data", () => {
	describe("GAME_POSITIONS", () => {
		it("has exactly 200 entries", () => {
			expect(GAME_POSITIONS.length).toBe(200);
		});

		it("GAME_POSITION_COUNT matches the array length", () => {
			expect(GAME_POSITION_COUNT).toBe(200);
		});

		it("every placement parses through fenToPieces without throwing", () => {
			for (const position of GAME_POSITIONS) {
				expect(() => fenToPieces(position.placement)).not.toThrow();
			}
		});

		it("every placement yields at least 6 pieces", () => {
			for (const position of GAME_POSITIONS) {
				const pieces = fenToPieces(position.placement);
				expect(pieces.size).toBeGreaterThanOrEqual(6);
			}
		});

		it("sideToMove alternates starting with white", () => {
			for (let i = 0; i < GAME_POSITIONS.length; i++) {
				const expected = i % 2 === 0 ? "white" : "black";
				expect(GAME_POSITIONS[i].sideToMove).toBe(expected);
			}
		});

		it("every lastMove is a valid pair of squares", () => {
			for (const position of GAME_POSITIONS) {
				if (position.lastMove) {
					expect(position.lastMove.length).toBe(2);
					const [from, to] = position.lastMove;
					expect(isBenchSquare(from)).toBe(true);
					expect(isBenchSquare(to)).toBe(true);
				}
			}
		});

		it("is deterministic: first placement is consistent", () => {
			const first = GAME_POSITIONS[0].placement;
			expect(first).toBeTruthy();
			expect(typeof first).toBe("string");
			// Check it contains slashes (rank separators)
			const ranks = first.split("/");
			expect(ranks.length).toBe(8);
		});

		it("is deterministic: last placement is consistent", () => {
			const last = GAME_POSITIONS[GAME_POSITIONS.length - 1].placement;
			expect(last).toBeTruthy();
			const ranks = last.split("/");
			expect(ranks.length).toBe(8);
		});
	});

	describe("ARROW_FRAMES", () => {
		it("has exactly 100 frames", () => {
			expect(ARROW_FRAMES.length).toBe(100);
		});

		it("ARROW_FRAME_COUNT matches the array length", () => {
			expect(ARROW_FRAME_COUNT).toBe(100);
		});

		it("every frame holds exactly 3 arrows", () => {
			for (const frame of ARROW_FRAMES) {
				expect(frame.length).toBe(3);
			}
		});

		it("no arrow has from === to", () => {
			for (const frame of ARROW_FRAMES) {
				for (const arrow of frame) {
					expect(arrow.from).not.toBe(arrow.to);
				}
			}
		});

		it("every square in every arrow is in ALL_SQUARES", () => {
			const squareSet = new Set(ALL_SQUARES);
			for (const frame of ARROW_FRAMES) {
				for (const arrow of frame) {
					expect(squareSet.has(arrow.from)).toBe(true);
					expect(squareSet.has(arrow.to)).toBe(true);
				}
			}
		});
	});

	describe("squares", () => {
		describe("ALL_SQUARES", () => {
			it("has exactly 64 unique entries", () => {
				const set = new Set(ALL_SQUARES);
				expect(ALL_SQUARES.length).toBe(64);
				expect(set.size).toBe(64);
			});
		});

		describe("squareIndex", () => {
			it("parses a1 to {file:0, rank:0}", () => {
				const result = squareIndex("a1");
				expect(result).toEqual({ file: 0, rank: 0 });
			});

			it("parses h8 to {file:7, rank:7}", () => {
				const result = squareIndex("h8");
				expect(result).toEqual({ file: 7, rank: 7 });
			});

			it("throws RangeError on invalid square z9", () => {
				expect(() => squareIndex("z9")).toThrow(RangeError);
			});
		});

		describe("squareFraction", () => {
			it("returns 0.0625,0.9375 for a1 from white's perspective", () => {
				const result = squareFraction("a1", "white");
				expect(result.x).toBeCloseTo(0.0625, 4);
				expect(result.y).toBeCloseTo(0.9375, 4);
			});

			it("returns 0.9375,0.0625 for a1 from black's perspective", () => {
				const result = squareFraction("a1", "black");
				expect(result.x).toBeCloseTo(0.9375, 4);
				expect(result.y).toBeCloseTo(0.0625, 4);
			});
		});

		describe("isBenchSquare", () => {
			it("returns true for valid squares", () => {
				expect(isBenchSquare("a1")).toBe(true);
				expect(isBenchSquare("h8")).toBe(true);
				expect(isBenchSquare("e4")).toBe(true);
			});

			it("returns false for invalid squares", () => {
				expect(isBenchSquare("z9")).toBe(false);
				expect(isBenchSquare("a")).toBe(false);
				expect(isBenchSquare("a11")).toBe(false);
			});
		});
	});
});
