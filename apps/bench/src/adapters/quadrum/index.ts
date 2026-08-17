/**
 * quadrum BoardAdapter for the benchmark.
 */

import { createBoard } from "quadrum";
import type { Square, Mark, BoardOptions } from "quadrum";
import "quadrum/assets/quadrum.css";

import type {
	AdapterFactory,
	BoardAdapter,
	MountOptions,
	PositionUpdate,
	BenchArrow,
	BenchSquare,
} from "../../core/types";
import { squareFraction } from "../../data/squares";
import { QUADRUM_VERSION } from "../versions";

/**
 * quadrum adapter factory.
 */
export const quadrumAdapter: AdapterFactory = {
	id: "quadrum",
	label: "quadrum",
	version: QUADRUM_VERSION,

	mount(host: HTMLElement, options: MountOptions): BoardAdapter {
		host.style.width = `${options.sizePx}px`;
		host.style.height = `${options.sizePx}px`;

		const board = createBoard(host, {
			position: options.placement,
			orientation: options.orientation,
			coordinates: options.coordinates,
			animate: {
				enabled: options.animate,
				duration: options.animationMs,
			},
			drag: { enabled: options.interactive },
			select: { enabled: options.interactive },
			moves: { free: options.interactive },
			marks: { enabled: true },
		});

		return {
			id: "quadrum",
			host,

			setPosition(u: PositionUpdate): void {
				const updateOptions: BoardOptions = {
					position: u.placement,
					sideToMove: u.sideToMove,
				};
				if (u.lastMove) {
					updateOptions.lastMove = u.lastMove as [Square, Square];
				}
				board.update(updateOptions);
			},

			setArrows(arrows: readonly BenchArrow[]): void {
				board.setAutoMarks(
					arrows.map(
						(a) =>
							({
								from: a.from as Square,
								to: a.to as Square,
								pen: a.color,
							}) satisfies Mark,
					),
				);
			},

			resize(px: number): void {
				host.style.width = `${px}px`;
				host.style.height = `${px}px`;
				// quadrum reads geometry live; no redraw needed.
				// Adding redraw here would fake away the very difference being measured.
			},

			flush(): void {
				// Deliberately empty. quadrum renders synchronously inside update(),
				// so the DOM is already correct by the time setPosition returns. This
				// is the asymmetry flush() exists to expose, not an omission.
			},

			pieceElements(): readonly Element[] {
				return Array.from(host.querySelectorAll("qd-piece"));
			},

			arrowElements(): readonly Element[] {
				// Determined empirically from the rendered DOM: quadrum draws arrow
				// bodies as <polygon> inside svg.qd-marks, with the heads split into
				// the over-the-pieces svg.qd-heads layer.
				return Array.from(host.querySelectorAll(".qd-marks polygon, .qd-heads polygon"));
			},

			squareCenter(sq: BenchSquare): { x: number; y: number } {
				const boardEl =
					(host.querySelector("qd-board") as HTMLElement) || host;
				const rect = boardEl.getBoundingClientRect();
				const frac = squareFraction(sq, board.orientation());
				return {
					x: rect.left + rect.width * frac.x,
					y: rect.top + rect.height * frac.y,
				};
			},

			pointerTarget(): HTMLElement {
				return (
					(host.querySelector("qd-board") as HTMLElement) || host
				);
			},

			hitTestRect(): DOMRectReadOnly {
				// quadrum caches nothing: input/gestures.ts reads the board's
				// getBoundingClientRect on every gesture, so the live rect IS the
				// geometry it hit-tests against, and there is no memo to invalidate.
				const boardEl = (host.querySelector("qd-board") as HTMLElement) || host;

				return boardEl.getBoundingClientRect();
			},

			isDragging(): boolean {
				return host.querySelector("qd-piece.held") !== null;
			},

			draggedTransform(): string | null {
				const held = host.querySelector("qd-piece.held");
				if (!held) return null;
				return getComputedStyle(held as HTMLElement).transform || null;
			},

			destroy(): void {
				board.unmount();
				host.innerHTML = "";
				host.removeAttribute("style");
			},
		};
	},
};
