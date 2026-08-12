import type { Piece, Role, Square, Color, Point } from "../types";
import type { BoardState } from "../options";
import { squareToPoint } from "../model/squares";

const ROLES: readonly string[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];

function isRole(value: string | undefined): value is Role {
	return value !== undefined && ROLES.includes(value);
}

export function createPieceEl(piece: Piece): HTMLElement {
	const el = document.createElement("qd-piece");
	el.classList.add(piece.color, piece.role);
	el.dataset.piece = `${piece.color}-${piece.role}`;
	return el;
}

export function pieceOf(el: HTMLElement): Piece | null {
	// The stamp is the fast path: one attribute read, no classList walk.
	const stamp = el.dataset.piece;
	if (stamp) {
		const [color, role] = stamp.split("-");
		if ((color === "white" || color === "black") && isRole(role)) {
			return { color, role };
		}
	}

	// Fall back to classList derivation for an element built before the stamp
	// existed, then stamp it so the next read takes the fast path.
	const color = el.classList.contains("white") ? "white" : el.classList.contains("black") ? "black" : null;
	const role = color ? Array.from(el.classList).find((c) => ROLES.includes(c)) : undefined;

	if (!color || !isRole(role)) {
		return null;
	}

	el.dataset.piece = `${color}-${role}`;
	return { color, role };
}

function pieceTransform(square: Square, orientation: Color, offset?: Point): string {
	const point = squareToPoint(square, orientation);
	const x = point.x + (offset?.x ?? 0);
	const y = point.y + (offset?.y ?? 0);
	return `translate(${x * 100}%, ${y * 100}%)`;
}

export function placePieceEl(el: HTMLElement, square: Square, orientation: Color, offset?: Point): void {
	el.dataset.square = square;
	el.style.transform = pieceTransform(square, orientation, offset);
}

export function placePieceAtPoint(el: HTMLElement, point: Point): void {
	el.style.transform = `translate(${(point.x - 0.5) * 100}%, ${(point.y - 0.5) * 100}%)`;
}

export function renderPieces(board: HTMLElement, els: Map<Square, HTMLElement>, state: BoardState): void {
	const seen = new Set<Square>();

	for (const [square, piece] of state.pieces) {
		seen.add(square);
		const existing = els.get(square);

		// A held element belongs to the drag layer: it is positioned against the
		// pointer and handed back on release. Building a replacement for it here
		// strands the original in the DOM -- the ghost that trails a drag -- and
		// overwrites the map entry the drag layer looks itself up by, so `held`
		// never comes off and the stray never leaves. Skip it outright, exactly
		// as the removal pass below does.
		if (existing?.classList.contains("held")) {
			continue;
		}

		if (existing) {
			const occupant = pieceOf(existing);
			if (occupant && occupant.color === piece.color && occupant.role === piece.role) {
				// The survivor keeps its element. Write only what actually differs:
				// an unconditional write costs a style recalc per piece per render,
				// which is the whole point of this pass. The transform is compared
				// rather than inferred from the square, because an orientation flip
				// moves every piece without any of them changing square.
				const transform = pieceTransform(square, state.orientation);
				if (existing.dataset.square !== square) {
					existing.dataset.square = square;
				}
				if (existing.style.transform !== transform) {
					existing.style.transform = transform;
				}
				continue;
			}
		}

		// The square kept its identity in the map but changed occupant -- a
		// capture, a promotion, or a wholly new position. Retire the old element
		// as well as replacing the map entry: overwriting the entry alone orphans
		// it in the DOM forever, so the square ends up with two pieces on it and
		// the stale one never leaves.
		if (existing && existing.parentNode === board) {
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
