/**
 * Deterministic sequence of 200 board placements used as the position-replay
 * workload. This is a RENDER workload, not a legal chess game. The bench app
 * must not take a chess-rules dependency, and what matters for a renderer is
 * DOM churn per update, not legality.
 *
 * Each step relocates one piece to an empty square, capturing on a fixed cadence
 * so that piece removal -- the most expensive DOM operation either library
 * performs -- happens at a known rate instead of by accident. The board is kept
 * populated: an earlier version moved to a uniformly random square, which
 * captured something most moves and decayed a full board to nearly empty within
 * a few dozen steps, so the bulk of a 100-update run measured an almost-empty
 * board and badly understated real DOM churn.
 */

import { fenToPieces, piecesToFen, INITIAL_PLACEMENT } from "quadrum";
import type { Square } from "quadrum";
import type { PositionUpdate, BenchSquare } from "../core/types";
import { ALL_SQUARES } from "./squares";

/** Restart from the initial position once the board thins past this. */
const MIN_PIECES = 24;
/** One in every N steps is a capture. */
const CAPTURE_EVERY = 8;

/**
 * Generate 200 deterministic position updates using a seeded LCG.
 */
export const GAME_POSITIONS: readonly PositionUpdate[] = (() => {
	const positions: PositionUpdate[] = [];
	let seed = 0xc0ffee;
	let placement = INITIAL_PLACEMENT;
	let sideToMove: "white" | "black" = "white";

	const lcg = (): number => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed;
	};

	for (let step = 0; step < 200; step++) {
		const pieces = new Map(fenToPieces(placement));

		// Refill from the initial position rather than letting the board decay.
		if (pieces.size <= MIN_PIECES) {
			for (const [sq, piece] of fenToPieces(INITIAL_PLACEMENT)) {
				pieces.set(sq, piece);
			}
		}

		const occupied = Array.from(pieces.keys());
		const empty = ALL_SQUARES.filter((sq) => !pieces.has(sq as Square));
		const from = occupied[lcg() % occupied.length];

		// Capture on a fixed cadence, so removals happen at a known rate. Falling
		// back to an occupied square when the board is full keeps the step total.
		const capturing = step % CAPTURE_EVERY === CAPTURE_EVERY - 1;
		const targets =
			capturing || empty.length === 0 ? occupied.filter((sq) => sq !== from) : empty;
		const to = targets[lcg() % targets.length] as Square;

		const piece = pieces.get(from);

		if (piece) {
			pieces.delete(from);
			pieces.set(to, piece);
		}

		placement = piecesToFen(pieces);

		positions.push({
			placement,
			// The move actually made, as a real app would report it.
			lastMove: [from as BenchSquare, to as BenchSquare],
			sideToMove,
		});

		// Alternate side to move
		sideToMove = sideToMove === "white" ? "black" : "white";
	}

	return positions;
})();

/**
 * The number of game positions.
 */
export const GAME_POSITION_COUNT = GAME_POSITIONS.length;
