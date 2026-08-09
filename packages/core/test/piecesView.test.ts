import { renderPieces } from "../src/view/piecesView";
import { defaultState, applyOptions } from "../src/options";
import type { Square } from "../src/types";

describe("renderPieces", () => {
	function render(board: HTMLElement, els: Map<Square, HTMLElement>, position: string): void {
		renderPieces(board, els, applyOptions(defaultState(), { position }));
	}

	it("retires the old element when a square changes occupant", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");
		render(board, els, "8/8/8/8/8/8/4n3/8");

		// Overwriting the map entry alone used to orphan the pawn in the DOM,
		// leaving two pieces claiming e2 with the stale one never leaving.
		const on = board.querySelectorAll("qd-piece[data-square='e2']");
		expect(on.length).toBe(1);
		expect(on[0]!.classList.contains("knight")).toBe(true);
	});

	it("keeps the element when the same piece merely moves", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");
		const original = els.get("e2");

		render(board, els, "8/8/8/8/4P3/8/8/8");
		expect(board.querySelectorAll("qd-piece").length).toBe(1);
		expect(els.get("e2")).toBeUndefined();
		expect(els.get("e5")).not.toBe(original);
	});

	it("leaves a held element to the drag layer", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");
		els.get("e2")!.classList.add("held");

		render(board, els, "8/8/8/8/8/8/4n3/8");
		expect(board.querySelector("qd-piece.held")).not.toBeNull();
	});

	it("does not duplicate a held element on an unrelated redraw", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");
		const held = els.get("e2")!;
		held.classList.add("held");

		// Any redraw during a drag -- an engine tick, a hover, a mark -- used to
		// build a second element for the held square and overwrite the map entry
		// with it. The original then stayed in the DOM as a ghost, and the drag
		// layer, which looks itself up through the map, never took `held` back off.
		render(board, els, "8/8/8/8/8/8/4P3/8");

		expect(board.querySelectorAll("qd-piece").length).toBe(1);
		expect(els.get("e2")).toBe(held);
	});
});
