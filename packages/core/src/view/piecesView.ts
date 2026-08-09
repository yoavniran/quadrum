import type { Piece, Square, Color, Point } from "../types";
import type { BoardState } from "../options";
import { squareToPoint } from "../model/squares";

export function createPieceEl(piece: Piece): HTMLElement {
	const el = document.createElement("qd-piece");
	el.classList.add(piece.color, piece.role);
	return el;
}

export function placePieceEl(el: HTMLElement, square: Square, orientation: Color, offset?: Point): void {
	el.dataset.square = square;
	const point = squareToPoint(square, orientation);
	const x = point.x + (offset?.x ?? 0);
	const y = point.y + (offset?.y ?? 0);
	el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
}

export function placePieceAtPoint(el: HTMLElement, point: Point): void {
	el.style.transform = `translate(${(point.x - 0.5) * 100}%, ${(point.y - 0.5) * 100}%)`;
}

export function renderPieces(board: HTMLElement, els: Map<Square, HTMLElement>, state: BoardState): void {
	const seen = new Set<Square>();

	for (const [square, piece] of state.pieces) {
		seen.add(square);
		const existing = els.get(square);

		if (existing && !existing.classList.contains("held")) {
			const color = existing.classList.contains("white") ? "white" : "black";
			const role = Array.from(existing.classList).find(c => !["white", "black"].includes(c)) as string | undefined;
			if (color === piece.color && role === piece.role) {
				placePieceEl(existing, square, state.orientation);
				continue;
			}
		}

		// The square kept its identity in the map but changed occupant -- a
		// capture, a promotion, or a wholly new position. Retire the old element
		// as well as replacing the map entry: overwriting the entry alone orphans
		// it in the DOM forever, so the square ends up with two pieces on it and
		// the stale one never leaves. A held element is the drag layer's to own,
		// so leave it be, exactly as the removal pass below does.
		if (existing && !existing.classList.contains("held") && existing.parentNode === board) {
			board.removeChild(existing);
		}

		const newEl = createPieceEl(piece);
		placePieceEl(newEl, square, state.orientation);
		board.appendChild(newEl);
		els.set(square, newEl);
	}

	for (const [square, el] of els) {
		if (!seen.has(square) && !el.classList.contains("held")) {
			board.removeChild(el);
			els.delete(square);
		}
	}
}
