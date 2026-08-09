import type { Color, FileLetter, Point, RankNumber, Square } from "../types";

export const FILES: readonly FileLetter[] = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS: readonly RankNumber[] = ["1", "2", "3", "4", "5", "6", "7", "8"];

export const ALL_SQUARES: readonly Square[] = (() => {
	const squares: Square[] = [];
	for (let file = 0; file < 8; file++) {
		for (let rank = 0; rank < 8; rank++) {
			squares.push(`${FILES[file]}${RANKS[rank]}` as Square);
		}
	}
	return squares;
})();

export function isSquare(value: unknown): value is Square {
	if (typeof value !== "string" || value.length !== 2) return false;
	const [file, rank] = value;
	return FILES.includes(file as FileLetter) && RANKS.includes(rank as RankNumber);
}

export function fileIndex(square: Square): number {
	return FILES.indexOf(square[0] as FileLetter);
}

export function rankIndex(square: Square): number {
	return RANKS.indexOf(square[1] as RankNumber);
}

export function squareAt(file: number, rank: number): Square | null {
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
	return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function squareToPoint(square: Square, orientation: Color): Point {
	const file = fileIndex(square);
	const rank = rankIndex(square);

	if (orientation === "white") {
		return { x: file, y: 7 - rank };
	} else {
		return { x: 7 - file, y: rank };
	}
}

export function pointToSquare(x: number, y: number, orientation: Color): Square | null {
	const xf = Math.floor(x);
	const yf = Math.floor(y);

	if (xf < 0 || xf >= 8 || yf < 0 || yf >= 8) return null;

	let file: number;
	let rank: number;

	if (orientation === "white") {
		file = xf;
		rank = 7 - yf;
	} else {
		file = 7 - xf;
		rank = yf;
	}

	return `${FILES[file]}${RANKS[rank]}` as Square;
}

export function clientToPoint(clientX: number, clientY: number, rect: DOMRect): Point {
	const x = ((clientX - rect.left) / rect.width) * 8;
	const y = ((clientY - rect.top) / rect.height) * 8;
	return { x, y };
}

export function sameSquare(a: Square | null, b: Square | null): boolean {
	return a === b;
}

/** File 'a'..'h' -> 0..7, rank '1'..'8' -> 0..7. Null for malformed squares. */
export function squareToIndices(square: string): { file: number; rank: number } | null {
	if (square.length < 2) return null;
	const file = square.charCodeAt(0) - 97; // 'a'
	const rank = square.charCodeAt(1) - 49; // '1'
	if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
	return { file, rank };
}

/** Top-left pixel of a square. White: a1 bottom-left; black: mirrored. */
export function squareTopLeft(
	square: string,
	orientation: Color,
	size: number,
): { x: number; y: number } | null {
	const idx = squareToIndices(square);
	if (!idx) return null;
	const sq = size / 8;
	const col = orientation === "white" ? idx.file : 7 - idx.file;
	const row = orientation === "white" ? 7 - idx.rank : idx.rank;
	return { x: col * sq, y: row * sq };
}

/** Square under a local (x, y) pixel, or null if outside the board. */
export function squareAtPixel(
	x: number,
	y: number,
	orientation: Color,
	size: number,
): Square | null {
	if (x < 0 || y < 0 || x >= size || y >= size) return null;
	const sq = size / 8;
	const col = Math.floor(x / sq);
	const row = Math.floor(y / sq);
	const file = orientation === "white" ? col : 7 - col;
	const rank = orientation === "white" ? 7 - row : row;
	return squareAt(file, rank);
}
