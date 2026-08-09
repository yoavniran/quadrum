import type { Color, Pieces, Role, Square } from "../types";
import { ALL_SQUARES, FILES, RANKS } from "./squares";

export const INITIAL_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

const CHAR_TO_ROLE: Record<string, Role> = {
	p: "pawn",
	n: "knight",
	b: "bishop",
	r: "rook",
	q: "queen",
	k: "king",
};

/** Not `role[0]` — king and knight would collide on "k". */
const ROLE_TO_CHAR: Record<Role, string> = {
	pawn: "p",
	knight: "n",
	bishop: "b",
	rook: "r",
	queen: "q",
	king: "k",
};

export function fenToPieces(fen: string): Pieces {
	const placement = fen.split(/\s+/)[0];
	const ranks = placement.split("/");

	if (ranks.length !== 8) {
		throw Error("quadrum: fen placement must have 8 ranks");
	}

	const pieces: Pieces = new Map();

	for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
		const rankStr = ranks[rankIdx];
		const actualRank = 7 - rankIdx;
		let fileIdx = 0;

		for (const char of rankStr) {
			if (char === "~") {
				continue;
			}

			if (/\d/.test(char)) {
				fileIdx += parseInt(char, 10);
			} else if (CHAR_TO_ROLE[char.toLowerCase()]) {
				if (fileIdx > 7) {
					throw Error("quadrum: rank has more than 8 files");
				}
				const color: Color = char === char.toUpperCase() ? "white" : "black";
				const role = CHAR_TO_ROLE[char.toLowerCase()];
				const square = `${FILES[fileIdx]}${RANKS[actualRank]}` as Square;
				pieces.set(square, { color, role });
				fileIdx++;
			} else {
				throw Error(`quadrum: unknown character in placement: ${char}`);
			}
		}

		if (fileIdx !== 8) {
			throw Error(`quadrum: rank ${7 - rankIdx} does not sum to 8 files`);
		}
	}

	return pieces;
}

export function piecesToFen(pieces: Pieces): string {
	const ranks: string[] = [];

	for (let rankIdx = 7; rankIdx >= 0; rankIdx--) {
		let rank = "";
		let emptyCount = 0;

		for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
			const square = `${FILES[fileIdx]}${RANKS[rankIdx]}` as Square;
			const piece = pieces.get(square);

			if (piece) {
				if (emptyCount > 0) {
					rank += emptyCount;
					emptyCount = 0;
				}
				const role = ROLE_TO_CHAR[piece.role];
				rank += piece.color === "white" ? role.toUpperCase() : role.toLowerCase();
			} else {
				emptyCount++;
			}
		}

		if (emptyCount > 0) {
			rank += emptyCount;
		}

		ranks.push(rank);
	}

	return ranks.join("/");
}

export function clonePieces(pieces: Pieces): Pieces {
	return new Map(pieces);
}

export function samePieces(a: Pieces, b: Pieces): boolean {
	if (a.size !== b.size) return false;

	for (const [square, piece] of a) {
		const other = b.get(square);
		if (!other || other.color !== piece.color || other.role !== piece.role) {
			return false;
		}
	}

	return true;
}

export function kingSquare(pieces: Pieces, color: Color): Square | null {
	for (const square of ALL_SQUARES) {
		const piece = pieces.get(square);
		if (piece && piece.role === "king" && piece.color === color) {
			return square;
		}
	}
	return null;
}
