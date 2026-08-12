import { renderPieces, pieceOf, createPieceEl } from "../src/view/piecesView";
import { defaultState, applyOptions } from "../src/options";
import type { Square, Piece } from "../src/types";

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

	it("skips attribute writes when piece does not move", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");

		// Set up a MutationObserver to track attribute writes.
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => {
			mutations.push(...records);
		});
		observer.observe(board, { attributes: true, subtree: true });

		// Second render with same position.
		render(board, els, "8/8/8/8/8/8/4P3/8");

		observer.disconnect();

		// Should have no mutations on the piece element (no attribute writes).
		const attributeMutations = mutations.filter((m) => m.type === "attributes");
		expect(attributeMutations.length).toBe(0);
	});

	it("writes attributes for the piece that lands on a new square", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		render(board, els, "8/8/8/8/8/8/4P3/8");

		// Render with pawn moved to e4. The map is keyed by square, so a move is
		// a removal plus a creation -- the skip-if-unchanged guard must not stop
		// the new element from being positioned.
		render(board, els, "8/8/8/8/4P3/8/8/8");

		const moved = els.get("e4")!;
		expect(moved.dataset.square).toBe("e4");
		expect(moved.style.transform).toBe("translate(400%, 400%)");
		expect(els.get("e2")).toBeUndefined();
		expect(board.querySelectorAll("qd-piece").length).toBe(1);
	});

	it("repositions every piece when orientation flips", () => {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();

		renderPieces(board, els, applyOptions(defaultState(), { position: "8/8/8/8/8/8/4P3/8", orientation: "white" }));
		const pawn = els.get("e2")!;
		const white = pawn.style.transform;

		// No piece changes square on a flip, so a guard keyed on the square alone
		// would leave every transform stale and the board would not turn round.
		renderPieces(board, els, applyOptions(defaultState(), { position: "8/8/8/8/8/8/4P3/8", orientation: "black" }));

		expect(els.get("e2")).toBe(pawn);
		expect(pawn.style.transform).not.toBe(white);
		expect(pawn.style.transform).toBe("translate(300%, 100%)");
	});

	it("pieceOf rounds trips every colour and role pair", () => {
		const pieces: Array<{ color: "white" | "black"; role: string }> = [
			{ color: "white", role: "pawn" },
			{ color: "white", role: "knight" },
			{ color: "white", role: "bishop" },
			{ color: "white", role: "rook" },
			{ color: "white", role: "queen" },
			{ color: "white", role: "king" },
			{ color: "black", role: "pawn" },
			{ color: "black", role: "knight" },
			{ color: "black", role: "bishop" },
			{ color: "black", role: "rook" },
			{ color: "black", role: "queen" },
			{ color: "black", role: "king" },
		];

		for (const piece of pieces) {
			const el = createPieceEl(piece as Piece);
			const resolved = pieceOf(el);
			expect(resolved?.color).toBe(piece.color);
			expect(resolved?.role).toBe(piece.role);
		}
	});

	it("pieceOf resolves legacy element with only classes and stamps it", () => {
		// Create an element the old way (classes only).
		const el = document.createElement("qd-piece");
		el.classList.add("white", "pawn");

		// First call should find it via classList and stamp it.
		const resolved1 = pieceOf(el);
		expect(resolved1?.color).toBe("white");
		expect(resolved1?.role).toBe("pawn");
		expect(el.dataset.piece).toBe("white-pawn");

		// Second call should find it via the stamp.
		const resolved2 = pieceOf(el);
		expect(resolved2?.color).toBe("white");
		expect(resolved2?.role).toBe("pawn");
	});

	it("pieceOf returns null for unresolvable element", () => {
		const el = document.createElement("qd-piece");
		const resolved = pieceOf(el);
		expect(resolved).toBeNull();
	});
});
