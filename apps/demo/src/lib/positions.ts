import { INITIAL_PLACEMENT, fenToPieces, piecesToFen } from "quadrum";
import type { Role, Square } from "quadrum";

export const EMPTY_PLACEMENT = "8/8/8/8/8/8/8/8";

/**
 * A Chess960 start: white king on f1 with rooks on b1 and h1. Chosen so the
 * castling distinction is visible — the standard rule only fires for a king on
 * the e-file, so this position has *no* castling targets unless the Chess960
 * option is on, and then has two (king-takes-rook on b1 and h1).
 */
export const CHESS960_PLACEMENT = "nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR";

/** One white pawn on the seventh and one black pawn on the second: both promote in a single move. */
export const PROMOTION_PLACEMENT = "8/4P3/8/8/8/8/4p3/8";

export const PRESETS = {
	initial: INITIAL_PLACEMENT,
	empty: EMPTY_PLACEMENT,
	chess960: CHESS960_PLACEMENT,
	promotion: PROMOTION_PLACEMENT,
} as const;

export type PresetName = keyof typeof PRESETS;

/**
 * Apply a move to a placement string.
 *
 * quadrum only reports `onPositionChanged` for a free board — a rules-bound one
 * deliberately leaves the new position to whatever supplied the targets in the
 * first place. This is that step, standing in for a real engine: move the piece,
 * let it overwrite whatever was on the destination, and optionally change its
 * role for a promotion.
 */
export function applyMove(
	placement: string,
	from: Square,
	to: Square,
	promoteTo?: Role,
): string {
	const pieces = fenToPieces(placement);
	const piece = pieces.get(from);
	if (!piece) return placement;

	pieces.delete(from);
	pieces.set(to, promoteTo ? { color: piece.color, role: promoteTo } : piece);
	return piecesToFen(pieces);
}
