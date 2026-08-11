import { describe, it, expect } from "vitest";
import { GAME_POSITIONS, GAME_POSITION_COUNT, GAME_SEGMENTS } from "../src/data/game";
import { ARROW_FRAMES, ARROW_FRAME_COUNT } from "../src/data/arrows";
import {
	ALL_SQUARES,
	squareIndex,
	squareFraction,
	isBenchSquare,
} from "../src/data/squares";
import { fenToPieces } from "quadrum";

/** Get the piece at a square, or null if empty. */
function getPieceAtSquare(placement: string, square: string): string | null {
	const pieces = fenToPieces(placement);
	return pieces.get(square) ?? null;
}

/** Slice positions for a segment by index. */
function sliceSegment(
	segmentIndex: number,
): { start: number; end: number; segment: (typeof GAME_SEGMENTS)[0] } {
	const segment = GAME_SEGMENTS[segmentIndex];
	let start = 0;
	for (let i = 0; i < segmentIndex; i++) {
		start += GAME_SEGMENTS[i].halfMoves;
	}
	const end = start + segment.halfMoves;
	return { start, end, segment };
}

describe("game data", () => {
	describe("GAME_POSITIONS", () => {
		it("has exactly 200 entries", () => {
			expect(GAME_POSITIONS.length).toBe(200);
		});

		it("GAME_POSITION_COUNT matches the array length", () => {
			expect(GAME_POSITION_COUNT).toBe(200);
		});

		it("GAME_SEGMENTS halfMoves sum to 200", () => {
			const total = GAME_SEGMENTS.reduce((sum, seg) => sum + seg.halfMoves, 0);
			expect(total).toBe(200);
		});

		it("every placement parses via fenToPieces and contains exactly one white king and one black king", () => {
			for (const position of GAME_POSITIONS) {
				const pieces = fenToPieces(position.placement);
				const whiteKings = Array.from(pieces.values()).filter(
					(p) => p.role === "king" && p.color === "white",
				).length;
				const blackKings = Array.from(pieces.values()).filter(
					(p) => p.role === "king" && p.color === "black",
				).length;
				expect(whiteKings).toBe(1);
				expect(blackKings).toBe(1);
			}
		});

		it("every lastMove is non-null and both squares match /^[a-h][1-8]$/", () => {
			for (const position of GAME_POSITIONS) {
				expect(position.lastMove).not.toBeNull();
				const [from, to] = position.lastMove!;
				expect(from).toMatch(/^[a-h][1-8]$/);
				expect(to).toMatch(/^[a-h][1-8]$/);
			}
		});

		it("within each segment, sideToMove alternates, starting with 'black' (white moves first)", () => {
			for (let segIdx = 0; segIdx < GAME_SEGMENTS.length; segIdx++) {
				const { start, end } = sliceSegment(segIdx);
				for (let i = start; i < end; i++) {
					const relativeIndex = i - start;
					const expected = relativeIndex % 2 === 0 ? "black" : "white";
					expect(GAME_POSITIONS[i].sideToMove).toBe(expected);
				}
			}
		});

		it("within each segment, for consecutive entries the piece at lastMove[1] exists in the current placement", () => {
			for (let segIdx = 0; segIdx < GAME_SEGMENTS.length; segIdx++) {
				const { start, end } = sliceSegment(segIdx);
				for (let i = start; i < end; i++) {
					const position = GAME_POSITIONS[i];
					const [, to] = position.lastMove!;
					const piece = getPieceAtSquare(position.placement, to);
					expect(piece).not.toBeNull();
				}
			}
		});

		it("the workload contains at least one promotion", () => {
			let foundPromotion = false;
			for (let segIdx = 0; segIdx < GAME_SEGMENTS.length; segIdx++) {
				const { start, end } = sliceSegment(segIdx);
				// Skip index 0 of each segment; promotions never happen on move one
				for (let i = start + 1; i < end; i++) {
					const prev = GAME_POSITIONS[i - 1];
					const curr = GAME_POSITIONS[i];
					const [fromSq, toSq] = curr.lastMove!;

					const prevPiece = getPieceAtSquare(prev.placement, fromSq);
					const currPiece = getPieceAtSquare(curr.placement, toSq);

					// Check if a pawn moved and became a different piece (promotion)
					if (
						prevPiece &&
						currPiece &&
						prevPiece.role === "pawn" &&
						currPiece.role !== "pawn" &&
						prevPiece.color === currPiece.color
					) {
						foundPromotion = true;
						break;
					}
				}
				if (foundPromotion) break;
			}
			expect(foundPromotion).toBe(true);
		});

		it("the workload contains at least one castling move (king moves two files)", () => {
			let foundCastling = false;
			for (let i = 0; i < GAME_POSITIONS.length; i++) {
				const position = GAME_POSITIONS[i];
				const [fromSq, toSq] = position.lastMove!;
				const piece = getPieceAtSquare(position.placement, toSq);

				if (piece && piece.role === "king") {
					// King moved; check if it moved two files (castling)
					const fromFile = fromSq.charCodeAt(0);
					const toFile = toSq.charCodeAt(0);
					if (Math.abs(fromFile - toFile) === 2) {
						foundCastling = true;
						break;
					}
				}
			}
			expect(foundCastling).toBe(true);
		});

		it("captures occur at a realistic rate: piece count decreases at least 40 times", () => {
			let captureCount = 0;
			for (let segIdx = 0; segIdx < GAME_SEGMENTS.length; segIdx++) {
				const { start, end } = sliceSegment(segIdx);
				for (let i = start + 1; i < end; i++) {
					const prev = GAME_POSITIONS[i - 1];
					const curr = GAME_POSITIONS[i];
					const prevCount = fenToPieces(prev.placement).size;
					const currCount = fenToPieces(curr.placement).size;
					if (currCount < prevCount) {
						captureCount++;
					}
				}
			}
			expect(captureCount).toBeGreaterThanOrEqual(40);
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
