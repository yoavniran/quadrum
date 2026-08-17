/**
 * chessground BoardAdapter for the benchmark.
 */

// @lichess-org/chessground, not the bare `chessground` name: lichess moved
// publishing to the scoped package at v10 and the unscoped one is deprecated on
// npm, frozen at 9.2.1. Benchmarking the abandoned name would have measured a
// version nobody installs today.
import { Chessground } from "@lichess-org/chessground";
import type { Config } from "@lichess-org/chessground/config";
import type { DrawShape } from "@lichess-org/chessground/draw";

import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

import type {
	AdapterFactory,
	BoardAdapter,
	MountOptions,
	PositionUpdate,
	BenchArrow,
	BenchSquare,
} from "../../core/types";
import { squareFraction } from "../../data/squares";

/**
 * chessground adapter factory.
 * Version mirrors the exact pin in package.json.
 */
export const chessgroundAdapter: AdapterFactory = {
	id: "chessground",
	label: "chessground",
	version: "10.1.1",

	mount(host: HTMLElement, options: MountOptions): BoardAdapter {
		host.style.width = `${options.sizePx}px`;
		host.style.height = `${options.sizePx}px`;

		const api = Chessground(
			host,
			{
				fen: options.placement,
				orientation: options.orientation,
				coordinates: options.coordinates,
				animation: {
					enabled: options.animate,
					duration: options.animationMs,
				},
				draggable: { enabled: options.interactive },
				selectable: { enabled: options.interactive },
				// movable.color is REQUIRED for dragging, and omitting it is exactly how
				// this adapter first straw-manned chessground: isDraggable() is false
				// unless the piece's colour is movable, so every synthesized drag
				// silently did nothing and chessground "lost" a scenario it never
				// actually entered.
				movable: { free: options.interactive, color: "both" },
				drawable: { enabled: true },
			} satisfies Config,
		);

		return {
			id: "chessground",
			host,

			setPosition(u: PositionUpdate): void {
				const config: Record<string, unknown> = {
					fen: u.placement,
					turnColor: u.sideToMove,
				};
				if (u.lastMove) {
					config.lastMove = [u.lastMove[0], u.lastMove[1]];
				}
				api.set(config as Partial<Config>);
			},

			setArrows(arrows: readonly BenchArrow[]): void {
				// CRITICAL: api.setAutoShapes ONLY, never api.set({fen}).
				// api.set({fen}) clears drawable.shapes, so folding them together
				// would make the arrow scenario secretly measure a full position diff.
				api.setAutoShapes(
					arrows.map(
						(a) =>
							({
								orig: a.from,
								dest: a.to,
								brush: a.color,
							} as DrawShape),
					),
				);
			},

			resize(px: number): void {
				host.style.width = `${px}px`;
				host.style.height = `${px}px`;
				// chessground caches its bounding rect.
				// An app that skips this ships a bug where clicks land on the wrong square.
				// This cost is real and is deliberately inside the timed region.
				api.redrawAll();
			},

			flush(): void {
				// chessground debounces state.dom.redraw into a requestAnimationFrame,
				// so api.set() returns having touched no DOM. redrawNow is the public
				// (types.d.ts Dom) synchronous form of the very same render the rAF
				// would run -- it does not do extra or different work, it just does it
				// now, so the render cost lands in the timed region where it belongs.
				api.state.dom.redrawNow();
			},

			pieceElements(): readonly Element[] {
				return Array.from(host.querySelectorAll("cg-board piece"));
			},

			arrowElements(): readonly Element[] {
				// Determined empirically from the rendered DOM. Arrow bodies are <line>
				// and custom shapes <polygon>; the arrowhead <path> lives in <defs> and
				// is excluded because it is a template, not a drawn arrow.
				return Array.from(host.querySelectorAll("svg line, svg polygon")).filter(
					(el) => !el.closest("defs"),
				);
			},

			squareCenter(sq: BenchSquare): { x: number; y: number } {
				const boardEl =
					(host.querySelector("cg-board") as HTMLElement) || host;
				const rect = boardEl.getBoundingClientRect();
				const orientation = api.state.orientation;
				const frac = squareFraction(sq, orientation);
				return {
					x: rect.left + rect.width * frac.x,
					y: rect.top + rect.height * frac.y,
				};
			},

			pointerTarget(): HTMLElement {
				return (
					(host.querySelector("cg-board") as HTMLElement) || host
				);
			},

			hitTestRect(): DOMRectReadOnly {
				// Dom.bounds is a Memo<DOMRectReadOnly> (types.d.ts): calling it
				// returns the CACHED rect and recomputes only after redrawAll clears
				// the memo. That cache is what every hit test reads, so this is the
				// geometry that decides which square a click lands on.
				return api.state.dom.bounds();
			},

			isDragging(): boolean {
				// state.draggable.current is the library's own public record of an
				// in-progress drag (DragCurrent in drag.d.ts). Preferred over a CSS
				// class guessed from the rendered DOM, which is not part of the
				// public surface and would silently report "never dragged" if it
				// were ever renamed.
				return api.state.draggable.current !== undefined;
			},

			draggedTransform(): string | null {
				const current = api.state.draggable.current;

				if (!current) {
					return null;
				}

				// DragCurrent.element is typed as the node or a lazy getter for it.
				const el =
					typeof current.element === "function" ? current.element() : current.element;

				return el ? getComputedStyle(el).transform || null : null;
			},

			destroy(): void {
				api.destroy();
				host.innerHTML = "";
				host.removeAttribute("style");
			},
		};
	},
};
