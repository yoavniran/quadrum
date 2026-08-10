/**
 * Chess board square utilities and constants.
 */

import type { BenchSquare, BenchColor } from "../core/types";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/**
 * All 64 squares in file-major order (a1..a8, b1..b8, ..., h1..h8).
 */
export const ALL_SQUARES: readonly BenchSquare[] = (() => {
	const squares: BenchSquare[] = [];
	for (const file of FILES) {
		for (const rank of RANKS) {
			squares.push((file + rank) as BenchSquare);
		}
	}
	return squares;
})();

/**
 * Parse a square into file and rank indices (0-based).
 * Throws RangeError on a malformed square.
 */
export function squareIndex(
	sq: BenchSquare,
): { file: number; rank: number } {
	if (sq.length !== 2) {
		throw new RangeError(`malformed square: ${sq}`);
	}
	const file = FILES.indexOf(sq[0] as never);
	const rank = RANKS.indexOf(sq[1] as never);
	if (file < 0 || rank < 0) {
		throw new RangeError(`malformed square: ${sq}`);
	}
	return { file, rank };
}

/**
 * Check if a string is a valid bench square.
 */
export function isBenchSquare(v: string): v is BenchSquare {
	if (v.length !== 2) return false;
	const file = v[0];
	const rank = v[1];
	return FILES.includes(file as never) && RANKS.includes(rank as never);
}

/**
 * Get the center of a square as a 0..1 fraction of the board, from the given
 * orientation's point of view.
 */
export function squareFraction(
	sq: BenchSquare,
	orientation: BenchColor,
): { x: number; y: number } {
	const { file, rank } = squareIndex(sq);

	if (orientation === "white") {
		return {
			x: (file + 0.5) / 8,
			y: (7 - rank + 0.5) / 8,
		};
	} else {
		return {
			x: (7 - file + 0.5) / 8,
			y: (rank + 0.5) / 8,
		};
	}
}
