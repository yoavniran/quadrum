import type { Piece, Pieces, Square } from "../types";
import { fileIndex, rankIndex, squareIndex } from "./squares";

export interface AnimMove {
	piece: Piece;
	from: Square;
	to: Square;
}

export interface AnimFade {
	piece: Piece;
	square: Square;
}

export interface AnimPlan {
	moves: AnimMove[];
	fades: AnimFade[];
	appears: Square[];
}

export interface PlanOptions {
	exclude?: Square | null;
}

export function planDiff(before: Pieces, after: Pieces, opts?: PlanOptions): AnimPlan {
	const exclude = opts?.exclude || null;

	// Find vanished and appeared squares
	const vanished = new Set<Square>();
	const appeared = new Set<Square>();

	// Check all squares that were occupied in "before" or are occupied in "after"
	const allOccupied = new Set<Square>();
	for (const sq of before.keys()) {
		allOccupied.add(sq);
	}
	for (const sq of after.keys()) {
		allOccupied.add(sq);
	}

	for (const sq of allOccupied) {
		const beforePiece = before.get(sq);
		const afterPiece = after.get(sq);

		// Check if piece changed (disappeared or changed piece)
		if (beforePiece && (!afterPiece || beforePiece.color !== afterPiece.color || beforePiece.role !== afterPiece.role)) {
			if (sq !== exclude) {
				vanished.add(sq);
			}
		}

		// Check if piece appeared (wasn't there or changed piece)
		if (afterPiece && (!beforePiece || beforePiece.color !== afterPiece.color || beforePiece.role !== afterPiece.role)) {
			appeared.add(sq);
		}
	}

	// Build valid pairs (same color and role)
	interface Pair {
		vanishedSq: Square;
		appearedSq: Square;
		distance: number;
		vanishedIdx: number;
		appearedIdx: number;
	}

	const pairs: Pair[] = [];

	for (const vanishedSq of vanished) {
		const vanishedPiece = before.get(vanishedSq)!;
		const vanishedIdx = squareIndex(vanishedSq);

		for (const appearedSq of appeared) {
			const appearedPiece = after.get(appearedSq)!;
			const appearedIdx = squareIndex(appearedSq);

			if (vanishedPiece.color === appearedPiece.color && vanishedPiece.role === appearedPiece.role) {
				const vf = fileIndex(vanishedSq);
				const vr = rankIndex(vanishedSq);
				const af = fileIndex(appearedSq);
				const ar = rankIndex(appearedSq);

				const distance = Math.sqrt((vf - af) * (vf - af) + (vr - ar) * (vr - ar));

				pairs.push({
					vanishedSq,
					appearedSq,
					distance,
					vanishedIdx,
					appearedIdx,
				});
			}
		}
	}

	// Sort pairs: distance ascending, then vanishedIdx, then appearedIdx
	pairs.sort((a, b) => {
		if (a.distance !== b.distance) {
			return a.distance - b.distance;
		}
		if (a.vanishedIdx !== b.vanishedIdx) {
			return a.vanishedIdx - b.vanishedIdx;
		}
		return a.appearedIdx - b.appearedIdx;
	});

	// Greedily pick pairs
	const moves: AnimMove[] = [];
	const usedVanished = new Set<Square>();
	const usedAppeared = new Set<Square>();

	for (const pair of pairs) {
		if (!usedVanished.has(pair.vanishedSq) && !usedAppeared.has(pair.appearedSq)) {
			moves.push({
				piece: before.get(pair.vanishedSq)!,
				from: pair.vanishedSq,
				to: pair.appearedSq,
			});
			usedVanished.add(pair.vanishedSq);
			usedAppeared.add(pair.appearedSq);
		}
	}

	// Build fades and appears
	const fades: AnimFade[] = [];
	for (const sq of vanished) {
		if (!usedVanished.has(sq)) {
			fades.push({
				piece: before.get(sq)!,
				square: sq,
			});
		}
	}

	const appears: Square[] = [];
	for (const sq of appeared) {
		if (!usedAppeared.has(sq)) {
			appears.push(sq);
		}
	}

	return { moves, fades, appears };
}
