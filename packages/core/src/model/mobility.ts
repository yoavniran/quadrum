import type { Pieces, Square } from "../types";
import { ALL_SQUARES, fileIndex, rankIndex, squareAt } from "./squares";

export interface MobilityOptions {
	chess960?: boolean;
}

export function premoveTargets(pieces: Pieces, from: Square, opts?: MobilityOptions): Square[] {
	const piece = pieces.get(from);
	if (!piece) return [];

	const color = piece.color;
	const file = fileIndex(from);
	const rank = rankIndex(from);
	const targets = new Set<Square>();

	function addTarget(sq: Square | null): void {
		if (sq && !wouldBeAttackedByOwnColor(sq)) {
			targets.add(sq);
		}
	}

	function wouldBeAttackedByOwnColor(sq: Square): boolean {
		const target = pieces.get(sq);
		return !!target && target.color === color;
	}

	function addRay(df: number, dr: number): void {
		let f = file + df;
		let r = rank + dr;

		while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
			const sq = squareAt(f, r);
			if (!sq) break;
			const target = pieces.get(sq);

			if (target) {
				if (target.color !== color) {
					targets.add(sq);
				}
				break;
			}

			targets.add(sq);
			f += df;
			r += dr;
		}
	}

	if (piece.role === "pawn") {
		const dir = piece.color === "white" ? 1 : -1;
		const homeRank = piece.color === "white" ? 1 : 6;

		const oneForward = squareAt(file, rank + dir);
		if (oneForward && !pieces.get(oneForward)) {
			targets.add(oneForward);
		}

		const twoForward = squareAt(file, rank + 2 * dir);
		if (
			rank === homeRank &&
			twoForward &&
			oneForward &&
			!pieces.get(twoForward) &&
			!pieces.get(oneForward)
		) {
			targets.add(twoForward);
		}

		// Diagonal captures (both directions)
		for (const df of [-1, 1]) {
			const diagFile = file + df;
			const diagRank = rank + dir;
			const sq = squareAt(diagFile, diagRank);
			if (sq && !wouldBeAttackedByOwnColor(sq)) {
				targets.add(sq);
			}
		}
	} else if (piece.role === "knight") {
		const moves = [
			[-2, -1],
			[-2, 1],
			[-1, -2],
			[-1, 2],
			[1, -2],
			[1, 2],
			[2, -1],
			[2, 1],
		];
		for (const [df, dr] of moves) {
			const sq = squareAt(file + df, rank + dr);
			addTarget(sq);
		}
	} else if (piece.role === "bishop") {
		addRay(1, 1);
		addRay(1, -1);
		addRay(-1, 1);
		addRay(-1, -1);
	} else if (piece.role === "rook") {
		addRay(1, 0);
		addRay(-1, 0);
		addRay(0, 1);
		addRay(0, -1);
	} else if (piece.role === "queen") {
		addRay(1, 0);
		addRay(-1, 0);
		addRay(0, 1);
		addRay(0, -1);
		addRay(1, 1);
		addRay(1, -1);
		addRay(-1, 1);
		addRay(-1, -1);
	} else if (piece.role === "king") {
		for (const df of [-1, 0, 1]) {
			for (const dr of [-1, 0, 1]) {
				if (df === 0 && dr === 0) continue;
				const sq = squareAt(file + df, rank + dr);
				addTarget(sq);
			}
		}

		// Castling. Two independent rules, both requiring the king on its home
		// rank; only the standard one also requires it on the e-file.
		const backRank = color === "white" ? 0 : 7;

		if (rank === backRank) {
			const isOwnRook = (sq: Square | null): boolean => {
				if (!sq) return false;
				const occupant = pieces.get(sq);
				return !!occupant && occupant.color === color && occupant.role === "rook";
			};

			// Standard: king on e1/e8, targeting the g/c-file destination.
			if (file === 4) {
				const kingSide = squareAt(6, backRank);
				const queenSide = squareAt(2, backRank);
				if (kingSide && isOwnRook(squareAt(7, backRank))) {
					targets.add(kingSide);
				}
				if (queenSide && isOwnRook(squareAt(0, backRank))) {
					targets.add(queenSide);
				}
			}

			// chess960 king-takes-rook, from wherever the king happens to sit.
			// These are friendly-occupied squares by design: the consumer must
			// not filter them and the board must not optimistically apply them.
			if (opts?.chess960) {
				for (let f = 0; f <= 7; f++) {
					if (f === file) continue;
					const sq = squareAt(f, backRank);
					if (sq && isOwnRook(sq)) {
						targets.add(sq);
					}
				}
			}
		}
	}

	// Return in ALL_SQUARES order for determinism
	const result: Square[] = [];
	for (const sq of ALL_SQUARES) {
		if (targets.has(sq)) {
			result.push(sq);
		}
	}

	return result;
}
