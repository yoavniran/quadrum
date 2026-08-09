import type { Square } from "../types";
import type { BoardState } from "../options";
import { kingSquare } from "../model/position";
import { isSquare } from "../model/squares";
import { placePieceEl } from "./piecesView";

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

	// Update/create elements
	for (const [sq, classList] of classes) {
		let el = els.get(sq);
		if (!el) {
			el = document.createElement("qd-square");
			el.dataset.square = sq;
			board.appendChild(el);
			els.set(sq, el);
		}
		el.className = classList.join(" ");
		placePieceEl(el, sq, state.orientation);
	}

	// Remove elements not in classes map
	for (const [sq, el] of els) {
		if (!classes.has(sq)) {
			board.removeChild(el);
			els.delete(sq);
		}
	}
}
