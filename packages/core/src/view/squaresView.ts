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

	const classes = new Map<Square, string[]>();

	// Build class lists
	if (state.lastMove) {
		for (const sq of state.lastMove) {
			const c = classes.get(sq) ?? [];
			c.push("recent");
			classes.set(sq, c);
		}
	}

	if (deco.selected) {
		const c = classes.get(deco.selected) ?? [];
		c.push("active");
		classes.set(deco.selected, c);
	}

	if (checkSquare) {
		const c = classes.get(checkSquare) ?? [];
		c.push("in-check");
		classes.set(checkSquare, c);
	}

	for (const sq of deco.targets) {
		const c = classes.get(sq) ?? [];
		c.push("target");

		const piece = state.pieces.get(sq);
		if (piece) {
			const selectedPiece = deco.selected ? state.pieces.get(deco.selected) : undefined;
			if (selectedPiece && piece.color === selectedPiece.color) {
				c.push("friendly");
			} else if (piece.color !== selectedPiece?.color) {
				c.push("capture");
			}
		}

		classes.set(sq, c);
	}

	if (deco.hover) {
		const c = classes.get(deco.hover) ?? [];
		c.push("hover");
		classes.set(deco.hover, c);
	}

	// Release elements for squares no longer decorated.
	// Collect stale squares first to avoid mutating the map during iteration.
	const staleSquares: Square[] = [];
	for (const sq of els.keys()) {
		if (!classes.has(sq)) {
			staleSquares.push(sq);
		}
	}

	// Idle pooled element must NOT carry a data-square attribute; the e2e suite
	// asserts an undecorated square has zero matching elements.
	for (const sq of staleSquares) {
		const el = els.get(sq)!;
		els.delete(sq);
		clearSquareAttr(el);
		el.className = "";
		el.hidden = true;
		const kept = pool.release(el);
		if (!kept) {
			board.removeChild(el);
		}
	}

	// Acquire or create elements for newly decorated squares.
	// Release runs before acquire so a square that just lost its decoration is
	// immediately reusable by one that just gained it — the steady state of a
	// move then allocates nothing.
	for (const [sq, classList] of classes) {
		let el: HTMLElement | undefined = els.get(sq);
		if (!el) {
			// A pooled element is still a child of the board — re-appending it
			// would re-insert it, which is the structural mutation this pool
			// exists to avoid.
			el = pool.acquire() ?? undefined;
			if (!el) {
				el = document.createElement("qd-square");
				board.appendChild(el);
			}
			els.set(sq, el);
		}
		if (el.hidden) {
			el.hidden = false;
		}
		setSquareAttr(el, sq);
		const className = classList.join(" ");
		if (el.className !== className) {
			el.className = className;
		}
		placePieceEl(el, sq, state.orientation);
	}
}
