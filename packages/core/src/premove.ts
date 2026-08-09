// Pre-moves: moves the player commits while the opponent is still thinking.
//
// A pre-move can't be validated when it is made — it is answering a reply that
// hasn't arrived — so legality is not the rule here. The premove library uses
// the same piece-mobility table that allows a pawn capture onto an empty square
// (the recapture you are betting on) and ignores check. Whether the move was a
// good bet is settled the moment the opponent moves, by handing it to the
// normal legal-move path and dropping the queue if it is refused.
//
// The queue is stacked, so the board the player sees while premoving is not the
// real one: it is the position their own queued moves project onto. Every move
// after the first is chosen against that projection, and `projectPremoves`
// builds it by walking the pieces — no side to move, no legality, because the
// opponent's replies in between are unknown by definition.

import type { Role, Square, Pieces, Targets } from "./types";
import { fenToPieces, piecesToFen } from "./model/position";
import { premoveTargets } from "./model/mobility";
import { fileIndex } from "./model/squares";

/** A move waiting for the opponent to move first. */
export interface PremoveIntent {
	from: Square;
	to: Square;
	/** set only for a pawn reaching the last rank — picked when the pre-move is made */
	promotion?: Role;
}

/** 0-based file index of a square ('a1' -> 0). */
function fileOf(square: Square): number {
	return fileIndex(square);
}

/**
 * Play one pre-move on a piece map, in place. Castling and en passant are
 * spelled out because the map has no notion of either: the king's rook has to
 * be dragged along, and the pawn taken en passant is beside the destination
 * rather than on it.
 */
function advance(pieces: Pieces, mv: PremoveIntent): void {
	const from = mv.from;
	const to = mv.to;
	const piece = pieces.get(from);
	if (!piece) return;

	if (piece.role === "pawn" && fileOf(mv.from) !== fileOf(mv.to) && !pieces.get(to)) {
		// En passant: remove the pawn beside the destination
		const capturedSquare = `${to[0]}${mv.from[1]}` as Square;
		pieces.delete(capturedSquare);
	}

	if (piece.role === "king" && Math.abs(fileOf(mv.from) - fileOf(mv.to)) === 2) {
		// Castling: drag the rook along
		const rank = mv.from[1];
		const kingSide = fileOf(mv.to) > fileOf(mv.from);
		const rookFrom = ((kingSide ? "h" : "a") + rank) as Square;
		const rook = pieces.get(rookFrom);
		if (rook) {
			pieces.delete(rookFrom);
			pieces.set(((kingSide ? "f" : "d") + rank) as Square, rook);
		}
	}

	pieces.delete(from);
	pieces.set(to, mv.promotion ? { ...piece, role: mv.promotion } : piece);
}

/**
 * The board once every queued pre-move has been played — what the player is
 * looking at (and choosing their next pre-move on) while the opponent thinks.
 *
 * Returned as a FEN so it can go straight to either renderer, but only the
 * placement is meaningful: castling rights and the en-passant square can't be
 * known without the replies in between, and the side to move is fixed to the
 * premoving player because that is who the board is accepting moves from.
 * An empty queue returns `fen` untouched, so nothing downstream re-renders.
 */
export function projectPremoves(fen: string, queue: readonly PremoveIntent[], sideToMove: "w" | "b"): string {
	if (queue.length === 0) return fen;
	const pieces = fenToPieces(fen);
	for (const mv of queue) advance(pieces, mv);
	return `${piecesToFen(pieces)} ${sideToMove} - - 0 1`;
}

/**
 * Where each of `color`'s pieces may be sent as a pre-move, keyed by origin —
 * the same shape the board takes for legal destinations.
 *
 * `canCastle` gates castling moves: when false, the two-square king moves are
 * removed from the targets.
 */
export function premoveDests(fen: string, color: "w" | "b", canCastle: boolean): Targets {
	const pieces = fenToPieces(fen);
	const want = color === "w" ? "white" : "black";
	const dests: Targets = new Map();

	for (const [square, piece] of pieces) {
		if (piece.color !== want) continue;

		let targets = premoveTargets(pieces, square, { chess960: false });

		// Filter out targets more than two files away (king-takes-rook in chess960)
		if (piece.role === "king") {
			targets = targets.filter((d) => Math.abs(fileOf(d) - fileOf(square)) <= 2);
		}

		// Gate castling when rights are not available
		if (piece.role === "king" && !canCastle) {
			targets = targets.filter((d) => Math.abs(fileOf(d) - fileOf(square)) !== 2);
		}

		if (targets.length) dests.set(square, targets);
	}

	return dests;
}

/** Whether this pre-move sends a pawn to the last rank, and so needs a piece picked. */
export function premovePromotes(fen: string, from: Square, to: Square): boolean {
	const piece = fenToPieces(fen).get(from);
	if (piece?.role !== "pawn") return false;
	return to[1] === (piece.color === "white" ? "8" : "1");
}

/**
 * Whether `color` may still castle at all, read off a FEN's rights field. Only
 * a hint for `premoveDests` — the real check happens when the move is played,
 * and a king that has already been pre-moved off e1 fails the mobility test on
 * its own.
 */
export function castlingAllowed(fen: string, color: "w" | "b"): boolean {
	const rights = fen.split(" ")[2] ?? "-";
	if (rights === "-") return false;
	return color === "w" ? /[KQ]/.test(rights) : /[kq]/.test(rights);
}
