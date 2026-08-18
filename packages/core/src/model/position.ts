import type { Color, Piece, Pieces, Role, Square } from "../types";
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

// One frozen Piece per FEN character, shared by every position that contains it.
// An ordinary update re-parses the whole placement, so allocating a fresh
// {color, role} per occupant cost 32 short-lived objects per update -- 3200 over
// the benchmark's replay, all of them structurally identical to one of these 12.
// Interning also makes the survivor test in renderPieces a pointer comparison
// instead of two string comparisons.
//
// Safe only because a Piece is never mutated in place anywhere in the library:
// promotion and the drag layer both build a new object rather than reassigning
// .role or .color. freeze() is what keeps that true for consumers as well.
const INTERNED_PIECES: Readonly<Record<string, Piece>> = Object.freeze(
	Object.fromEntries(
		Object.entries(CHAR_TO_ROLE).flatMap(([char, role]) => [
			[char.toUpperCase(), Object.freeze({ color: "white" as Color, role })],
			[char, Object.freeze({ color: "black" as Color, role })],
		]),
	),
);

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

		// Indexed charCode walk rather than for..of with a regex test. The old form
		// ran `/\d/.test()` plus up to three case conversions per character, which
		// is ~160 calls for a full placement -- paid again on every update, since
		// every update re-parses.
		for (let i = 0; i < rankStr.length; i++) {
			const code = rankStr.charCodeAt(i);

			// "~" marks a promoted piece in crazyhouse placements; it annotates the
			// character before it and occupies no file.
			if (code === 126) {
				continue;
			}

			if (code >= 48 && code <= 57) {
				fileIdx += code - 48;
				continue;
			}

			const piece = INTERNED_PIECES[rankStr[i]];

			if (!piece) {
				throw Error(`quadrum: unknown character in placement: ${rankStr[i]}`);
			}

			if (fileIdx > 7) {
				throw Error("quadrum: rank has more than 8 files");
			}

			pieces.set(ALL_SQUARES[fileIdx * 8 + actualRank], piece);
			fileIdx++;
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

export function changedSquares(
	before: Pieces,
	after: Pieces,
	out: Square[],
): void {
	out.length = 0;

	// forEach, not `for...of`, in both walks. Iterating a Map through the
	// iterator protocol allocates two objects per entry -- the {value, done}
	// result and, when destructuring, the [key, value] pair array -- and this
	// runs over every occupied square on every update. An allocation profile of
	// the anim-off loop charged ~3.0 MB to this function alone, 44% of the whole
	// update subtree and its largest single source of garbage. forEach hands the
	// value and key in as arguments and allocates neither.
	//
	// This is not a cache: nothing is keyed on or remembered across calls. The
	// walk is the same walk, in the same order, producing the same `out`.

	// Walk after: find squares where the piece differs.
	after.forEach((piece, square) => {
		const other = before.get(square);
		// Identity first: pieces parsed out of a placement are interned, so
		// the common case is one pointer comparison. Fall back to comparing
		// color and role for pieces reconstructed from the DOM.
		if (!other || (other !== piece && (other.color !== piece.color || other.role !== piece.role))) {
			out.push(square);
		}
	});

	// Walk before: find squares that were occupied but no longer are.
	before.forEach((_piece, square) => {
		if (!after.has(square)) {
			out.push(square);
		}
	});
}
