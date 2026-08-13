// Board.render() used to re-run the entire pipeline (wrap, coords, pieces,
// squares, marks, promotion) for every mutation. Profiling showed an arrow-only
// change unnecessarily re-reconciling 32 unmoved piece elements. This table
// lets each call site render only the layers it dirtied.

import type { BoardOptions } from "../options";

export interface RenderParts {
	readonly wrap: boolean;
	readonly coords: boolean;
	readonly pieces: boolean;
	readonly squares: boolean;
	readonly marks: boolean;
	readonly promotion: boolean;
}

export const ALL_PARTS: RenderParts = {
	wrap: true,
	coords: true,
	pieces: true,
	squares: true,
	marks: true,
	promotion: true,
};

export const NO_PARTS: RenderParts = {
	wrap: false,
	coords: false,
	pieces: false,
	squares: false,
	marks: false,
	promotion: false,
};

export function mergeParts(a: RenderParts, b: RenderParts): RenderParts {
	return {
		wrap: a.wrap || b.wrap,
		coords: a.coords || b.coords,
		pieces: a.pieces || b.pieces,
		squares: a.squares || b.squares,
		marks: a.marks || b.marks,
		promotion: a.promotion || b.promotion,
	};
}

export const SQUARES_ONLY: RenderParts = {
	wrap: false,
	coords: false,
	pieces: false,
	squares: true,
	marks: false,
	promotion: false,
};

export const MARKS_ONLY: RenderParts = {
	wrap: false,
	coords: false,
	pieces: false,
	squares: false,
	marks: true,
	promotion: false,
};

export const PIECES_AND_SQUARES: RenderParts = {
	wrap: false,
	coords: false,
	pieces: true,
	squares: true,
	marks: false,
	promotion: false,
};

// Maps each known option key to the parts it dirties.
const DIRTY_MAP: Record<keyof BoardOptions, RenderParts> = {
	orientation: ALL_PARTS,
	position: PIECES_AND_SQUARES,
	checkSide: SQUARES_ONLY,
	lastMove: SQUARES_ONLY,
	selected: SQUARES_ONLY,
	coordinates: {
		wrap: false,
		coords: true,
		pieces: false,
		squares: false,
		marks: false,
		promotion: false,
	},
	locked: {
		wrap: true,
		coords: false,
		pieces: false,
		squares: false,
		marks: false,
		promotion: false,
	},
	moves: SQUARES_ONLY,
	marks: MARKS_ONLY,
	promotion: {
		wrap: false,
		coords: false,
		pieces: false,
		squares: false,
		marks: false,
		promotion: true,
	},
	sideToMove: NO_PARTS,
	select: NO_PARTS,
	drag: NO_PARTS,
	animate: NO_PARTS,
	onPositionChanged: NO_PARTS,
};

// Which option keys are known and safe.
const KNOWN_KEYS = new Set(Object.keys(DIRTY_MAP));

/** Which render parts an options bag dirties.
 *
 * Only keys whose value is !== undefined count as present. Failing to ALL_PARTS
 * on an unknown key is deliberate: a new option that renders nothing is a silent
 * bug, a new option that over-renders is merely slow.
 */
export function dirtyParts(options: BoardOptions): RenderParts {
	let result: RenderParts = NO_PARTS;

	for (const key of Object.keys(options)) {
		const value = (options as Record<string, unknown>)[key];

		// Skip keys explicitly set to undefined.
		if (value === undefined) {
			continue;
		}

		// Unknown key: bail to ALL_PARTS.
		if (!KNOWN_KEYS.has(key)) {
			return ALL_PARTS;
		}

		result = mergeParts(result, DIRTY_MAP[key as keyof BoardOptions]);
	}

	return result;
}
