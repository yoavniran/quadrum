import type { Color, Mark, Piece, Square } from "./types";
import type { BoardOptions, BoardState } from "./options";
import {
	defaultState,
	applyOptions,
} from "./options";
import { piecesToFen, samePieces } from "./model/position";
import { squareToPoint, clientToPoint } from "./model/squares";
import { planDiff } from "./model/diffPlan";
import type { BoardDom } from "./view/layout";
import {
	buildDom,
	renderCoords,
	applyWrapState,
	destroyDom,
} from "./view/layout";
import type { MarkContext } from "./input/markInput";
import type { MoveContext } from "./input/moveInput";
import { createMarkController } from "./input/markInput";
import { createMoveController } from "./input/moveInput";
import {
	renderPieces,
} from "./view/piecesView";
import {
	renderSquares,
} from "./view/squaresView";
import {
	renderMarks,
} from "./view/marksView";
import {
	renderPromotion,
} from "./view/promotionView";
import {
	bindGestures,
	startExternalGesture,
} from "./input/gestures";
import { createAnimator } from "./view/animator";

export class Board implements MoveContext, MarkContext {
	private container: HTMLElement;
	private _state: BoardState;
	private _dom: BoardDom;
	private _pieceEls: Map<Square, HTMLElement> = new Map();
	private squareEls: Map<Square, HTMLElement> = new Map();
	/** The square a drag is currently over. Lives outside `_state` because it
	 *  changes on every pointermove and concerns only the square layer. */
	private hoverSquare: Square | null = null;
	private animator = createAnimator();
	private gestureBinding: ReturnType<typeof bindGestures>;
	private moveController: ReturnType<typeof createMoveController>;
	private markController: ReturnType<typeof createMarkController>;
	private promotionRequest: { from: Square; to: Square; color: Color } | null =
		null;
	private fadingEls: HTMLElement[] = [];
	/** Cleanup for the animation currently in flight, or null when none is.
	 *  Cancelling an animation must still run it: the cleanup is what removes the
	 *  cloned fade elements and strips the transient gliding/appearing state. */
	private finishAnimation: (() => void) | null = null;

	constructor(container: HTMLElement, options?: BoardOptions) {
		this.container = container;
		this._state = defaultState();

		this._dom = buildDom(container);

		// Apply initial options
		if (options) {
			this._state = applyOptions(this._state, options);
		}

		// Bind gestures ONCE in constructor
		this.gestureBinding = bindGestures(
			this._dom,
			() => this._state.orientation,
			{
				onPress: (info) => {
					if (info.kind === "mark") {
						this.markController.press(info.square, info.event);
					} else {
						// Reaching for a piece ends whatever the drawings were
						// working through, so the board doesn't accumulate arrows
						// from three positions ago.
						if (
							this._state.marks.enabled &&
							this._state.marks.clearOnPress &&
							this._state.marks.user.length > 0
						) {
							this.commit([]);
						}
						this.moveController.press(info.square, info.event, info.point);
					}
				},
				onDrag: (info) => {
					if (info.kind === "mark") {
						this.markController.drag(info.square);
					} else {
						this.moveController.drag(info.square, info.point, info.distance);
					}
				},
				onRelease: (info) => {
					if (info.kind === "mark") {
						this.markController.release(info.square);
					} else {
						this.moveController.release(info.square, info.point);
					}
				},
				onCancel: () => {
					this.markController.cancel();
					this.moveController.cancel();
				},
			},
		);

		this.moveController = createMoveController(this);
		this.markController = createMarkController(this);

		this.render();
	}

	// MoveContext implementation
	state(): BoardState {
		return this._state;
	}

	dom(): BoardDom {
		return this._dom;
	}

	pieceEls(): Map<Square, HTMLElement> {
		return this._pieceEls;
	}

	setHover(square: Square | null): void {
		if (this.hoverSquare === square) return;
		this.hoverSquare = square;
		// Squares only: this fires on every pointermove, and a full render would
		// churn the piece layer underneath the drag for nothing.
		this.renderSquares();
	}

	setSelected(square: Square | null): void {
		this._state = applyOptions(this._state, { selected: square });
		this.render();
		if (this._state.select.onSelect) {
			this._state.select.onSelect(square);
		}
	}

	play(from: Square, to: Square): void {
		if (this._state.locked) return;

		const fromPiece = this._state.pieces.get(from);
		const toPiece = this._state.pieces.get(to);

		// No piece to move. Without this, the `fromPiece!` below writes
		// `undefined` into the pieces map and the next render throws.
		//
		// Drop the selection on the way out: the only way to reach here is a
		// selection pointing at a square whose piece has since gone — the
		// consumer erased it, or swapped the position under us. Leaving it
		// standing wedges the board, because every later press reads as "play
		// from the selected square", lands here, and returns without ever
		// arming a drag or picking a new selection.
		if (!fromPiece) {
			if (this._state.selected !== null) {
				this._state = applyOptions(this._state, { selected: null });
				this.render();
			}
			return;
		}

		// Check for chess960 king-takes-rook
		if (
			toPiece &&
			toPiece.color === fromPiece.color
		) {
			// Just fire the handler, don't mutate
			if (this._state.moves.onPlayed) {
				this._state.moves.onPlayed(from, to, { captured: null });
			}
			return;
		}

		// Check for promotion
		if (
			this._state.promotion.enabled &&
			fromPiece?.role === "pawn" &&
			((fromPiece.color === "white" && to.charCodeAt(1) === 56) ||
				(fromPiece.color === "black" && to.charCodeAt(1) === 49))
		) {
			// Hold the move for promotion
			this.promotionRequest = {
				from,
				to,
				color: fromPiece.color,
			};
			// Render to show current state with picker
			this.render();
			return;
		}

		// Apply the move optimistically
		const captured = toPiece || null;
		this._state.pieces.delete(from);
		this._state.pieces.set(to, fromPiece);

		// Clear selection
		this._state = applyOptions(this._state, { selected: null });
		this.render();

		if (this._state.moves.onPlayed) {
			this._state.moves.onPlayed(from, to, { captured });
		}

		// Fire onPositionChanged on a free/editor board
		if (this._state.moves.free) {
			if (this._state.onPositionChanged) {
				this._state.onPositionChanged(this.placement());
			}
		}
	}

	deletePiece(square: Square): void {
		if (this._state.locked) return;

		this._state.pieces.delete(square);
		this.render();

		if (this._state.onPositionChanged) {
			this._state.onPositionChanged(this.placement());
		}
	}

	placePiece(square: Square, piece: Piece): void {
		if (this._state.locked) return;

		this._state.pieces.set(square, piece);
		this.render();

		if (this._state.onPositionChanged) {
			this._state.onPositionChanged(this.placement());
		}
	}

	redraw(): void {
		this.render();
	}

	// MarkContext implementation
	setCurrent(mark: Mark | null): void {
		this.renderMarks(mark);
	}

	commit(marks: Mark[]): void {
		this._state = applyOptions(this._state, { marks: { user: marks } });
		this.render();

		if (this._state.marks.onChange) {
			this._state.marks.onChange(marks);
		}
	}

	// Public API
	update(options: BoardOptions): void {
		const before = this._state.pieces;

		// Apply options (rule 1: applies every option)
		this._state = applyOptions(this._state, options);

		// Handle animation (rule 5)
		// Compare by value, not identity: applyOptions *always* clones the
		// pieces map, so an identity check is unconditionally true and would
		// cancel an in-flight animation on every single update().
		if (
			this._state.animate.enabled &&
			!samePieces(before, this._state.pieces)
		) {
			// Settle the outgoing animation before cancelling it. Its cleanup is the
			// only thing that removes the cloned .vanishing elements and clears the
			// gliding/appearing state, so dropping it leaks a piece node per capture
			// and leaves half-faded pieces stuck at their interrupted opacity --
			// which is what happens to any board updated faster than one animation
			// duration.
			this.settleAnimation();
			this.animator.cancel();

			const plan = planDiff(before, this._state.pieces, {
				exclude: this.moveController.dragging ? null : undefined,
			});

			// Render at final positions immediately
			this.render();

			// Prepare animation data for moves
			const moveData = plan.moves.map((move) => {
				const fromPoint = squareToPoint(move.from, this._state.orientation);
				const toPoint = squareToPoint(move.to, this._state.orientation);
				const offsetX = fromPoint.x - toPoint.x;
				const offsetY = fromPoint.y - toPoint.y;
				const el = this._pieceEls.get(move.to);

				if (el) {
					el.classList.add("gliding");
					el.style.transform = `translate(${(toPoint.x + offsetX) * 100}%, ${
						(toPoint.y + offsetY) * 100
					}%)`;
				}

				return { el, toPoint, offsetX, offsetY };
			});

			// Prepare fade elements
			const fadeEls: HTMLElement[] = [];
			plan.fades.forEach((fade) => {
				const sourceEl = this._pieceEls.get(fade.square);
				if (sourceEl) {
					const fadeEl = sourceEl.cloneNode(true) as HTMLElement;
					fadeEl.classList.add("vanishing");
					this._dom.board.appendChild(fadeEl);
					fadeEls.push(fadeEl);
					this.fadingEls.push(fadeEl);
				}
			});

			// Prepare appear elements
			const appearEls = plan.appears
				.map((square) => this._pieceEls.get(square))
				.filter((el): el is HTMLElement => el !== undefined);

			appearEls.forEach((el) => {
				el.classList.add("appearing");
			});

			// Restores every element this animation touched to its settled state.
			// Shared by normal completion and cancellation so an interrupted
			// animation leaves exactly what a completed one does.
			const cleanup = (): void => {
				moveData.forEach(({ el, toPoint }) => {
					if (el) {
						el.classList.remove("gliding");
						el.style.transform = `translate(${toPoint.x * 100}%, ${toPoint.y * 100}%)`;
					}
				});

				appearEls.forEach((el) => {
					el.classList.remove("appearing");
					el.style.removeProperty("opacity");
				});

				fadeEls.forEach((el) => {
					el.remove();

					const index = this.fadingEls.indexOf(el);

					if (index !== -1) {
						this.fadingEls.splice(index, 1);
					}
				});

				this.finishAnimation = null;
			};

			this.finishAnimation = cleanup;

			// Run single animation for all pieces
			this.animator.run(
				this._state.animate.duration,
				(progress) => {
					// Update moves
					moveData.forEach(({ el, toPoint, offsetX, offsetY }) => {
						if (el) {
							el.style.transform = `translate(${
								(toPoint.x + offsetX * (1 - progress)) * 100
							}%, ${(toPoint.y + offsetY * (1 - progress)) * 100}%)`;
						}
					});

					// Update fades
					fadeEls.forEach((el) => {
						el.style.opacity = String(1 - progress);
					});

					// Update appears (should go from 0 to 1)
					appearEls.forEach((el) => {
						el.style.opacity = String(progress);
					});
				},
				cleanup,
			);
		} else {
			this.render();
		}
	}

	placement(): string {
		return piecesToFen(this._state.pieces);
	}

	orientation(): Color {
		return this._state.orientation;
	}

	flip(): void {
		const newOrientation: Color =
			this._state.orientation === "white" ? "black" : "white";
		this.update({ orientation: newOrientation });
	}

	select(square: Square): void {
		this.setSelected(square);
	}

	clearSelection(): void {
		this.setSelected(null);
	}

	move(from: Square, to: Square): void {
		this.play(from, to);
	}

	setPiece(square: Square, piece: Piece | null): void {
		if (piece === null) {
			this.deletePiece(square);
		} else {
			this.placePiece(square, piece);
		}
	}

	setUserMarks(marks: Mark[]): void {
		this._state = applyOptions(this._state, { marks: { user: marks } });
		this.render();
	}

	setAutoMarks(marks: Mark[]): void {
		this._state = applyOptions(this._state, { marks: { auto: marks } });
		this.render();
	}

	dragSparePiece(piece: Piece, event: PointerEvent): void {
		const rect = this._dom.board.getBoundingClientRect();
		const point = clientToPoint(event.clientX, event.clientY, rect);
		startExternalGesture(this.gestureBinding, event);
		this.moveController.startSpare(piece, point);
	}

	refresh(): void {
		destroyDom(this._dom);
		this._dom = buildDom(this.container);
		this._pieceEls.clear();
		this.squareEls.clear();
		this.render();
	}

	/** Run the in-flight animation's cleanup, if there is one, and forget it. */
	private settleAnimation(): void {
		this.finishAnimation?.();
		this.finishAnimation = null;
	}

	unmount(): void {
		this.settleAnimation();
		this.animator.cancel();
		this.gestureBinding.destroy();
		destroyDom(this._dom);
		// Belt and braces: settleAnimation drains the current animation's clones,
		// this catches anything left by an earlier code path.
		this.fadingEls.forEach((el) => el.remove());
		this.fadingEls = [];
	}

	private render(): void {
		applyWrapState(this._dom, this._state);
		renderCoords(this._dom, this._state);
		renderPieces(this._dom.board, this._pieceEls, this._state);

		this.renderSquares();

		this.renderMarks(null);
		this.renderPromotion();
	}

	private renderSquares(): void {
		const targets =
			this._state.moves.showTargets && this._state.selected
				? this._state.moves.targets.get(this._state.selected) ?? []
				: [];

		renderSquares(
			this._dom.board,
			this.squareEls,
			this._state,
			{
				targets,
				selected: this._state.selected,
				hover: this.hoverSquare,
			},
		);
	}

	private renderMarks(current: Mark | null): void {
		renderMarks(this._dom, this._state, current);
	}

	private renderPromotion(): void {
		const request = this.promotionRequest;
		if (!request) {
			renderPromotion(this._dom, null, this._state.orientation, () => {});
			return;
		}

		renderPromotion(
			this._dom,
			request,
			this._state.orientation,
			(role) => {
				if (role === null) {
					// Cancelled
					this.promotionRequest = null;
					this.renderPromotion();
					return;
				}

				const { from, to } = request;
				this.promotionRequest = null;

				// Apply the move. The origin can legitimately be empty by now --
				// anything that mutated the position while the picker was open
				// leaves nothing to promote -- so drop the request rather than
				// throwing on an absent piece.
				const piece = this._state.pieces.get(from);
				if (!piece) {
					this.renderPromotion();
					return;
				}
				const captured = this._state.pieces.get(to) || null;

				this._state.pieces.delete(from);
				this._state.pieces.set(to, { color: piece.color, role });

				this._state = applyOptions(this._state, { selected: null });
				this.render();

				if (this._state.moves.onPlayed) {
					this._state.moves.onPlayed(from, to, {
						captured,
						promotion: role,
					});
				}

				if (this._state.promotion.onPromote) {
					this._state.promotion.onPromote(from, to, role);
				}

				if (this._state.moves.free) {
					if (this._state.onPositionChanged) {
						this._state.onPositionChanged(this.placement());
					}
				}
			},
		);
	}
}

export function createBoard(
	container: HTMLElement,
	options?: BoardOptions,
): Board {
	return new Board(container, options);
}
