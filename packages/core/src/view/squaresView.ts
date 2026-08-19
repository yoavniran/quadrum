import type { Square } from "../types";
import type { BoardState } from "../options";
import type { NodePool } from "./nodePool";
import { kingSquare } from "../model/position";
import { isSquare } from "../model/squares";
import { placePieceEl } from "./piecesView";
import { clearSquareAttr, setSquareAttr } from "./placement";

export const SQUARE_POOL_CAPACITY = 64;

export interface SquareDecorations {
	targets: readonly Square[];
	selected: Square | null;
	hover: Square | null;
}

// Scratch state, reused across renders. This runs on every position update and
// every pointermove, for a steady state of about two decorated squares -- a
// fresh Map, a string[] per square and two arrays per call were pure garbage
// (and a visible slice of GC in the update profile). Module-scoped is safe:
// renderSquares never re-enters, and everything here is cleared on entry.
// The class list is built as a string directly; its only consumer ever was a
// join(" ").
const classes = new Map<Square, string>();
const staleSquares: Square[] = [];
const freshSquares: Square[] = [];

function addClass(sq: Square, cls: string): void {
	const existing = classes.get(sq);
	classes.set(sq, existing === undefined ? cls : `${existing} ${cls}`);
}

export function renderSquares(
	board: HTMLElement,
	els: Map<Square, HTMLElement>,
	state: BoardState,
	deco: SquareDecorations,
	pool: NodePool<HTMLElement>,
): void {
	// `checkSide` is either a square ("e1") or a colour ("white"), and both are
	// strings — so the colour case must be recognised by elimination, not by
	// `typeof`. Testing `typeof === "string"` first swallowed every colour and
	// dropped the highlight entirely.
	const checkSquare: Square | null = state.checkSide === null
		? null
		: isSquare(state.checkSide)
			? state.checkSide
			: kingSquare(state.pieces, state.checkSide);

	classes.clear();
	staleSquares.length = 0;
	freshSquares.length = 0;

	// Build class lists
	if (state.lastMove) {
		for (const sq of state.lastMove) {
			addClass(sq, "recent");
		}
	}

	if (deco.selected) {
		addClass(deco.selected, "active");
	}

	if (checkSquare) {
		addClass(checkSquare, "in-check");
	}

	const selectedPiece = deco.selected ? state.pieces.get(deco.selected) : undefined;

	for (const sq of deco.targets) {
		let c = "target";

		const piece = state.pieces.get(sq);
		if (piece) {
			if (selectedPiece && piece.color === selectedPiece.color) {
				c = "target friendly";
			} else if (piece.color !== selectedPiece?.color) {
				c = "target capture";
			}
		}

		addClass(sq, c);
	}

	if (deco.hover) {
		addClass(deco.hover, "hover");
	}

	// Squares that lost their decoration, and squares that gained one.
	// Collected first, because both loops below rewrite `els`.
	// forEach rather than `for...of` over the map keys: the iterator protocol
	// allocates a {value, done} object per square, and these walk every
	// decorated square on every render. An allocation profile of the anim-off
	// loop charged ~250 kB of iterator objects to this function.
	els.forEach((_el, sq) => {
		if (!classes.has(sq)) {
			staleSquares.push(sq);
		}
	});

	classes.forEach((_className, sq) => {
		if (!els.has(sq)) {
			freshSquares.push(sq);
		}
	});

	// Hand a stale element straight to a square that needs one, rather than
	// routing it through the pool.
	//
	// Every position update moves the last-move highlight, so the steady state
	// is exactly this: two elements go stale and two are needed, and they are
	// interchangeable. Releasing them first meant clearing the attribute,
	// blanking the class list and hiding the element, only for the acquire to
	// unhide it and write back a class list that was usually identical -- six
	// DOM writes an element where two are needed, on the hottest path the
	// library has. `hidden` in particular is an attribute mutation, so the
	// hide/unhide pair invalidated style for an element that never stopped
	// being visible.
	const reused = Math.min(staleSquares.length, freshSquares.length);

	for (let i = 0; i < reused; i++) {
		const el = els.get(staleSquares[i])!;
		els.delete(staleSquares[i]);
		els.set(freshSquares[i], el);
	}

	// Idle pooled element must NOT carry a data-square attribute; the e2e suite
	// asserts an undecorated square has zero matching elements.
	for (let i = reused; i < staleSquares.length; i++) {
		const el = els.get(staleSquares[i])!;
		els.delete(staleSquares[i]);
		clearSquareAttr(el);
		el.className = "";
		el.hidden = true;
		const kept = pool.release(el);
		if (!kept) {
			board.removeChild(el);
		}
	}

	for (let i = reused; i < freshSquares.length; i++) {
		// A pooled element is still a child of the board — re-appending it
		// would re-insert it, which is the structural mutation this pool
		// exists to avoid.
		let el = pool.acquire();
		if (!el) {
			el = document.createElement("qd-square");
			board.appendChild(el);
		}
		els.set(freshSquares[i], el);
	}

	classes.forEach((className, sq) => {
		const el = els.get(sq)!;
		if (el.hidden) {
			el.hidden = false;
		}
		setSquareAttr(el, sq);
		if (el.className !== className) {
			el.className = className;
		}
		placePieceEl(el, sq, state.orientation);
	});
}
