// Board.render() used to re-run the entire pipeline (wrap, coords, pieces,
// squares, marks, promotion) for every mutation, so an arrow-only change
// re-reconciled 32 piece elements that never moved. This module lets each call
// site render only the layers it dirtied.
//
// Two shapes here are chosen for size, not taste: this module is on the shipped
// path and the bench gates bundle size absolutely, at +2% with no ratio to hide
// behind. Parts are a bitmask rather than a `{ pieces: boolean, ... }` record --
// the record form cost ~175 brotli bytes in nine six-field object literals that a
// minifier cannot dedupe. And dirtyParts is a chain of branches rather than a
// keyed lookup table -- the table plus its Object.keys/hasOwn loop cost a further
// ~115 bytes, and it had to name the five options that dirty nothing just to tell
// them apart from unknown keys.
//
// Dropping the table gives up its one real benefit: an option added to
// BoardOptions without a matching branch here now falls through to NO_PARTS and
// silently renders nothing. That check moved to renderParts.test.ts, which keeps
// the exhaustive `Record<keyof BoardOptions, RenderParts>` and fails typecheck
// when a new option appears. The guarantee survives; it just costs no bytes.

import type { BoardOptions } from "../options";

/** A set of render parts, as a bitmask of the PART_* flags below. */
export type RenderParts = number;

export const PART_WRAP = 1;
export const PART_COORDS = 2;
export const PART_PIECES = 4;
export const PART_SQUARES = 8;
export const PART_MARKS = 16;
export const PART_PROMOTION = 32;

export const NO_PARTS: RenderParts = 0;
export const ALL_PARTS: RenderParts =
	PART_WRAP | PART_COORDS | PART_PIECES | PART_SQUARES | PART_MARKS | PART_PROMOTION;

export const SQUARES_ONLY: RenderParts = PART_SQUARES;
export const MARKS_ONLY: RenderParts = PART_MARKS;
export const PIECES_AND_SQUARES: RenderParts = PART_PIECES | PART_SQUARES;

/** Union of two part sets. */
export function mergeParts(a: RenderParts, b: RenderParts): RenderParts {
	return a | b;
}

/** Which render parts an options bag dirties.
 *
 * Only keys whose value is !== undefined count as present -- callers routinely
 * spread bags carrying explicit undefined. Options that render nothing
 * (sideToMove, the handler and enabled-flag bags) are absent by falling through.
 */
export function dirtyParts(options: BoardOptions): RenderParts {
	// Every layer is positioned by orientation, so nothing below can narrow it.
	if (options.orientation !== undefined) {
		return ALL_PARTS;
	}

	let parts = NO_PARTS;

	// Squares read state.pieces for their check and target classes, so a position
	// change dirties them too.
	if (options.position !== undefined) {
		parts |= PIECES_AND_SQUARES;
	}
	// checkSide/lastMove/selected drive square classes directly; moves does so
	// through targets and showTargets.
	if (
		options.checkSide !== undefined ||
		options.lastMove !== undefined ||
		options.selected !== undefined ||
		options.moves !== undefined
	) {
		parts |= PART_SQUARES;
	}
	if (options.coordinates !== undefined) {
		parts |= PART_COORDS;
	}
	// applyWrapState is the only reader of locked.
	if (options.locked !== undefined) {
		parts |= PART_WRAP;
	}
	if (options.marks !== undefined) {
		parts |= PART_MARKS;
	}
	if (options.promotion !== undefined) {
		parts |= PART_PROMOTION;
	}

	return parts;
}
