import type { Piece, Square, Point } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "../view/layout";
import { createPieceEl, placePieceEl, placePieceAtPoint } from "../view/piecesView";
import { ALL_SQUARES } from "../model/squares";

export interface MoveContext {
	state(): BoardState;
	dom(): BoardDom;
	pieceEls(): Map<Square, HTMLElement>;
	setSelected(square: Square | null): void;
	play(from: Square, to: Square): void;
	deletePiece(square: Square): void;
	placePiece(square: Square, piece: Piece): void;
	redraw(): void;
}

export interface MoveController {
	press(square: Square | null, event: PointerEvent, point: Point): void;
	drag(square: Square | null, point: Point, distance: number): void;
	release(square: Square | null, point: Point): void;
	cancel(): void;
	startSpare(piece: Piece, point: Point): void;
	readonly dragging: boolean;
}

export function createMoveController(ctx: MoveContext): MoveController {
	let isDragging = false;
	let draggedSquare: Square | null = null;
	let dragThresholdPassed = false;
	let sparePieceEl: HTMLElement | null = null;
	let sparePiece: Piece | null = null;
	let traceEl: HTMLElement | null = null;
	// The selection as it stood *before* the current press. release() needs it
	// to tell "clicked a piece that was already selected" (deselect) from
	// "this press is what selected it" (keep the selection).
	let selectedAtPress: Square | null = null;

	const canMoveFrom = (square: Square | null): boolean => {
		if (square === null) return false;

		const state = ctx.state();
		const piece = state.pieces.get(square);
		if (!piece) return false;

		if (state.moves.free) return true;

		if (
			state.moves.side !== "both" &&
			state.moves.side !== piece.color
		) return false;

		if (!state.moves.free && !state.moves.targets.has(square)) {
			return false;
		}

		return true;
	};

	const targetsFor = (square: Square | null): Square[] => {
		if (square === null) return [];

		const state = ctx.state();
		if (state.moves.free) {
			// All squares except the origin
			return ALL_SQUARES.filter((sq) => sq !== square);
		}

		return state.moves.targets.get(square) ?? [];
	};

	const cleanup = () => {
		if (draggedSquare !== null && traceEl) {
			traceEl.remove();
			traceEl = null;

			const el = ctx.pieceEls().get(draggedSquare);
			if (el) {
				el.classList.remove("held");
			}
		}

		if (sparePieceEl) {
			sparePieceEl.remove();
			sparePieceEl = null;
			sparePiece = null;
		}

		isDragging = false;
		draggedSquare = null;
		dragThresholdPassed = false;
	};

	return {
		press(square: Square | null, _event: PointerEvent, _point: Point) {
			if (ctx.state().locked) return;

			const state = ctx.state();
			selectedAtPress = state.selected;
			const targets = state.selected ? targetsFor(state.selected) : [];

			// Check if this is a legal target of the current selection
			if (state.selected && square !== null && targets.includes(square)) {
				ctx.play(state.selected, square);
				return;
			}

			// Check if we can move from this square
			if (canMoveFrom(square)) {
				ctx.setSelected(square);
				draggedSquare = square;
				isDragging = true;
			} else {
				ctx.setSelected(null);
			}
		},

		drag(_square: Square | null, point: Point, distance: number) {
			if (ctx.state().locked) return;

			if (!isDragging) return;

			const state = ctx.state();

			// Check if we've crossed the threshold
			if (!dragThresholdPassed && distance > state.drag.threshold) {
				if (!state.drag.enabled) return;

				dragThresholdPassed = true;

				if (draggedSquare !== null) {
					// Add class held to the piece element
					const el = ctx.pieceEls().get(draggedSquare);
					if (el) {
						el.classList.add("held");

						// Create trace element
						const piece = state.pieces.get(draggedSquare);
						if (piece) {
							traceEl = createPieceEl(piece);
							traceEl.classList.add("trace");
							placePieceEl(traceEl, draggedSquare, state.orientation);
							ctx.dom().board.appendChild(traceEl);
						}
					}
				}
			}

			// If we've passed the threshold, update the position
			if (dragThresholdPassed) {
				if (draggedSquare !== null && ctx.pieceEls().has(draggedSquare)) {
					const el = ctx.pieceEls().get(draggedSquare);
					if (el) {
						placePieceAtPoint(el, point);
					}
				} else if (sparePieceEl) {
					// Update spare piece position
					placePieceAtPoint(sparePieceEl, point);
				}
			}
		},

		release(square: Square | null, _point: Point) {
			if (ctx.state().locked) return;

			const state = ctx.state();

			// Snapshot before cleanup() nulls these closure variables. Reading
			// them *after* the call is what made drag-to-move and spare-piece
			// drops silently no-op: cleanup() sets them to null, and TypeScript
			// keeps the earlier narrowing across an opaque call, so nothing
			// flagged it.
			const spare = sparePiece;
			const hadSpareEl = sparePieceEl !== null;
			const wasDragging = isDragging;
			const dragged = draggedSquare;
			const moved = dragThresholdPassed;

			// Handle spare piece
			if (hadSpareEl && spare) {
				cleanup();

				if (square !== null) {
					ctx.placePiece(square, spare);
				}
				return;
			}

			// A press that never crossed the drag threshold is a click, not a
			// move. press() already set the selection; a *second* press on a
			// target square is what plays the move.
			if (!wasDragging || dragged === null || !moved) {
				cleanup();

				if (selectedAtPress === square && ctx.state().selected === square) {
					ctx.setSelected(null);
				}
				return;
			}

			// We were dragging a board piece
			cleanup();

			const targets = targetsFor(dragged);
			const isLegalTarget =
				state.moves.free ||
				(square !== null && targets.includes(square));

			if (isLegalTarget && square !== null) {
				ctx.play(dragged, square);
			} else if (square === null && state.drag.removeOffBoard) {
				ctx.deletePiece(dragged);
			} else {
				ctx.redraw();
			}
		},

		cancel() {
			if (ctx.state().locked) return;

			cleanup();
			ctx.redraw();
		},

		startSpare(piece: Piece, point: Point) {
			if (ctx.state().locked) return;

			sparePiece = piece;
			sparePieceEl = createPieceEl(piece);
			placePieceAtPoint(sparePieceEl, point);
			ctx.dom().board.appendChild(sparePieceEl);

			isDragging = true;
			dragThresholdPassed = true;
			draggedSquare = null;
		},

		get dragging(): boolean {
			return isDragging;
		},
	};
}
