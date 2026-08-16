import type { Piece, Role, Square, Color, Point } from "../types";
import type { BoardState } from "../options";
import { ALL_SQUARES, fileIndex, rankIndex } from "../model/squares";
import { setSquareAttr, setTranslate } from "./placement";

const ROLES: readonly string[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];

function isRole(value: string | undefined): value is Role {
	return value !== undefined && ROLES.includes(value);
}

// Weak registry of HTMLElement -> Piece. Eliminates per-piece string parsing on
// every render. Entries are written by createPieceEl and populated on fallback
// hits in pieceOf, allowing old or cloned elements to still work.
const pieceRegistry = new WeakMap<HTMLElement, Piece>();

export function createPieceEl(piece: Piece): HTMLElement {
	const el = document.createElement("qd-piece");
	el.classList.add(piece.color, piece.role);
	el.dataset.piece = `${piece.color}-${piece.role}`;
	pieceRegistry.set(el, piece);
	return el;
}

export function pieceOf(el: HTMLElement): Piece | null {
	// Registry is the fast path: one WeakMap lookup.
	const registered = pieceRegistry.get(el);
	if (registered) {
		return registered;
	}

	// Fallback for elements not in the registry (cloneNode or pre-stamp elements).
	// Try dataset first: one attribute read, no classList walk.
	const stamp = el.dataset.piece;
	if (stamp) {
		const parts = stamp.split("-");
		const color = parts[0];
		const role = parts[1];
		if ((color === "white" || color === "black") && isRole(role)) {
			const piece: Piece = { color, role };
			pieceRegistry.set(el, piece);
			return piece;
		}
	}

	// Fall back to classList derivation for an element built before the stamp
	// existed, then back-fill both the registry and the stamp.
	const colorFromClass = el.classList.contains("white") ? "white" : el.classList.contains("black") ? "black" : null;
	const roleFromClass = colorFromClass ? Array.from(el.classList).find((c) => ROLES.includes(c)) : undefined;

	if (!colorFromClass || !isRole(roleFromClass)) {
		return null;
	}

	el.dataset.piece = `${colorFromClass}-${roleFromClass}`;
	const piece: Piece = { color: colorFromClass, role: roleFromClass };
	pieceRegistry.set(el, piece);
	return piece;
}

// Inlined rather than calling squareToPoint, which returns a fresh {x, y} that
// is read twice and dropped. This runs once per piece per render, so the object
// was 32 allocations an update for two numbers.
function placeAt(el: HTMLElement, square: Square, orientation: Color, offset?: Point): void {
	const file = fileIndex(square);
	const rank = rankIndex(square);
	const white = orientation === "white";

	setTranslate(
		el,
		(white ? file : 7 - file) + (offset?.x ?? 0),
		(white ? 7 - rank : rank) + (offset?.y ?? 0),
	);
}

export function placePieceEl(el: HTMLElement, square: Square, orientation: Color, offset?: Point): void {
	setSquareAttr(el, square);
	placeAt(el, square, orientation, offset);
}

export function placePieceAtPoint(el: HTMLElement, point: Point): void {
	// Centred on the pointer rather than on a square, hence the half-square shift.
	setTranslate(el, point.x - 0.5, point.y - 0.5);
}

export function renderPieces(board: HTMLElement, els: Map<Square, HTMLElement>, state: BoardState): void {
	const seen = new Set<Square>();

	// PASS 1: Survivors. For each piece in state, if the square already has
	// an element with a matching piece, keep it. Only mark as seen if we kept it.
	// Skip held elements.
	for (const [square, piece] of state.pieces) {
		const existing = els.get(square);

		// A held element belongs to the drag layer: it is positioned against the
		// pointer and handed back on release. Building a replacement for it here
		// strands the original in the DOM -- the ghost that trails a drag -- and
		// overwrites the map entry the drag layer looks itself up by, so `held`
		// never comes off and the stray never leaves. Skip it outright, exactly
		// as the removal pass below does.
		if (existing?.classList.contains("held")) {
			seen.add(square);
			continue;
		}

		if (existing) {
			const occupant = pieceOf(existing);
			if (occupant && occupant.color === piece.color && occupant.role === piece.role) {
				// The survivor keeps its element. Write only what actually differs:
				// an unconditional write costs a style recalc per piece per render,
				// which is the whole point of this pass. The comparison is made against
				// a JS-side record rather than by reading the DOM back. An orientation
				// flip moves every piece without any of them changing square.
				setSquareAttr(existing, square);
				placeAt(existing, square, state.orientation);
				seen.add(square);
				continue;
			}
		}

		// This square needs a new element (capture, promotion, or first appearance).
		// Don't handle it here; let the residual pass deal with it.
	}

	// Every piece survived in place: `vacated` and `needed` are both provably empty,
	// so the two residual passes would walk `els` and `state.pieces` again to build
	// nothing. `seen` is a subset of both key sets, so equal sizes means equal sets.
	if (seen.size === state.pieces.size && seen.size === els.size) {
		return;
	}

	// PASS 2: Residual matching. Collect elements that don't have survivors
	// (vacated) and squares that don't have survivors (needed). Match them by
	// piece identity, ordered by distance like planDiff does.

	interface Pair {
		vacatedSq: Square;
		// Carried on the pair rather than looked up from `els` when the move is
		// applied. The moves are applied in a loop that also rewrites `els`, so a
		// chain -- something moving into a square that is itself vacating, which is
		// every castle and every recapture -- would otherwise hand the second move
		// the element the first one just parked there.
		vacatedEl: HTMLElement;
		neededSq: Square;
		distance: number;
		vacatedIdx: number;
		neededIdx: number;
	}

	const vacated: Array<[Square, HTMLElement]> = [];
	const needed: Square[] = [];

	for (const [square, el] of els) {
		if (!seen.has(square) && !el.classList.contains("held")) {
			vacated.push([square, el]);
		}
	}

	for (const square of state.pieces.keys()) {
		if (!seen.has(square)) {
			needed.push(square);
		}
	}

	// Build valid pairs (same color and role).
	const pairs: Pair[] = [];

	for (const [vacatedSq, vacatedEl] of vacated) {
		const vacatedPiece = pieceOf(vacatedEl);
		if (!vacatedPiece) continue;
		const vacatedIdx = ALL_SQUARES.indexOf(vacatedSq);

		for (const neededSq of needed) {
			const neededPiece = state.pieces.get(neededSq);
			if (!neededPiece) continue;
			const neededIdx = ALL_SQUARES.indexOf(neededSq);

			if (
				vacatedPiece.color === neededPiece.color &&
				vacatedPiece.role === neededPiece.role
			) {
				const vf = fileIndex(vacatedSq);
				const vr = rankIndex(vacatedSq);
				const nf = fileIndex(neededSq);
				const nr = rankIndex(neededSq);

				const distance = Math.sqrt((vf - nf) * (vf - nf) + (vr - nr) * (vr - nr));

				pairs.push({
					vacatedSq,
					vacatedEl,
					neededSq,
					distance,
					vacatedIdx,
					neededIdx,
				});
			}
		}
	}

	// Sort pairs: distance ascending, then vacatedIdx, then neededIdx.
	// This matches planDiff's ordering so the animation sees the same moves.
	pairs.sort((a, b) => {
		if (a.distance !== b.distance) {
			return a.distance - b.distance;
		}
		if (a.vacatedIdx !== b.vacatedIdx) {
			return a.vacatedIdx - b.vacatedIdx;
		}
		return a.neededIdx - b.neededIdx;
	});

	// Greedy selection only -- nothing is applied yet. Applying moves inside this
	// loop would rewrite `els` while later pairs still needed to read it.
	const usedVacated = new Set<Square>();
	const usedNeeded = new Set<Square>();
	const moves: Array<{ el: HTMLElement; to: Square }> = [];

	for (const pair of pairs) {
		if (usedVacated.has(pair.vacatedSq) || usedNeeded.has(pair.neededSq)) {
			continue;
		}
		moves.push({ el: pair.vacatedEl, to: pair.neededSq });
		usedVacated.add(pair.vacatedSq);
		usedNeeded.add(pair.neededSq);
	}

	// PASS 3: apply. Every vacated square leaves the map before any destination
	// enters it. A square can be both a source and a destination -- a recapture
	// vacates the captured piece's square and needs it for the capturer, and a
	// castle chains two moves through adjacent squares -- so interleaving the
	// deletes with the sets would let one move's delete undo another's set and
	// strand a live element with no map entry, invisible to every later render.
	for (const [vacatedSq] of vacated) {
		els.delete(vacatedSq);
	}

	for (const [vacatedSq, el] of vacated) {
		if (!usedVacated.has(vacatedSq) && el.parentNode === board) {
			board.removeChild(el);
		}
	}

	for (const move of moves) {
		placePieceEl(move.el, move.to, state.orientation);
		els.set(move.to, move.el);
	}

	for (const neededSq of needed) {
		if (!usedNeeded.has(neededSq)) {
			const piece = state.pieces.get(neededSq);
			if (piece) {
				const newEl = createPieceEl(piece);
				placePieceEl(newEl, neededSq, state.orientation);
				board.appendChild(newEl);
				els.set(neededSq, newEl);
			}
		}
	}
}
