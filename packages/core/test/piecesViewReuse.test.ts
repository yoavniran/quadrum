import type { Piece, Square } from "../src/types";
import { createPieceEl, markHeld, pieceOf, renderPieces } from "../src/view/piecesView";
import { defaultState } from "../src/options";
import { fenToPieces } from "../src/model/position";

describe("piecesView reuse and registry", () => {
	let board: HTMLElement;

	beforeEach(() => {
		board = document.createElement("div");
		document.body.appendChild(board);
	});

	afterEach(() => {
		board.remove();
	});

	describe("move reuses element", () => {
		it("move updates element identity, square, and transform but not child count", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const pawnEl = els.get("e2");
			expect(pawnEl).toBeDefined();

			const initialChildCount = board.children.length;

			// Move pawn e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

			renderPieces(board, els, afterMove);

			const movedEl = els.get("e4");
			expect(movedEl).toBe(pawnEl);
			expect(movedEl?.dataset.square).toBe("e4");
			expect(board.children.length).toBe(initialChildCount);
		});

		// A square that is both a source and a destination in the same render is the
		// case that breaks a matcher which applies its moves as it selects them: the
		// second move reads the map entry the first one just overwrote, relocates the
		// wrong element, and leaves the right one in the DOM forever.
		it("a chain through a shared square moves each element exactly once", () => {
			const state = defaultState();
			state.pieces = new Map<Square, Piece>([
				["a1", { color: "white", role: "rook" }],
				["e1", { color: "white", role: "rook" }],
			]);

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const fromA1 = els.get("a1");
			const fromE1 = els.get("e1");

			// a1 -> e1 while e1 -> h1: e1 is vacated and needed in the same render.
			const after = defaultState();
			after.pieces = new Map<Square, Piece>([
				["e1", { color: "white", role: "rook" }],
				["h1", { color: "white", role: "rook" }],
			]);

			renderPieces(board, els, after);

			expect(board.children.length).toBe(2);
			expect(new Set([els.get("e1"), els.get("h1")])).toEqual(new Set([fromA1, fromE1]));
			expect(board.querySelectorAll("[data-square=\"e1\"]").length).toBe(1);
			expect(els.get("e1")?.dataset.square).toBe("e1");
			expect(els.get("h1")?.dataset.square).toBe("h1");
		});
	});

	describe("zero structural mutation on move", () => {
		it("move produces no childList mutations", async () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const mutations: MutationRecord[] = [];
			const observer = new MutationObserver((records) => {
				mutations.push(...records);
			});

			observer.observe(board, { childList: true, subtree: true });

			// Move pawn e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

			renderPieces(board, els, afterMove);

			await Promise.resolve();

			observer.disconnect();
			const childListMutations = mutations.filter((m) => m.type === "childList");
			expect(childListMutations).toHaveLength(0);
		});
	});

	describe("capture retires exactly one element", () => {
		it("capture removes captured piece element and preserves captor", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4p3/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const initialChildCount = board.children.length;
			const e4El = els.get("e4");
			const e2El = els.get("e2");

			// White pawn e2 captures black pawn e4
			const afterCapture = defaultState();
			afterCapture.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

			renderPieces(board, els, afterCapture);

			expect(board.children.length).toBe(initialChildCount - 1);
			expect(els.get("e4")).toBe(e2El);
			expect(e4El?.parentNode).toBeNull();
		});
	});

	describe("orientation flip", () => {
		it("flip transforms every element without creating or removing", () => {
			const state = defaultState();
			state.orientation = "white";
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const initialChildCount = board.children.length;
			const transforms = new Map<HTMLElement, string>();
			for (const el of els.values()) {
				transforms.set(el, el.style.transform);
			}

			// Flip to black
			state.orientation = "black";
			renderPieces(board, els, state);

			expect(board.children.length).toBe(initialChildCount);
			for (const [el, oldTransform] of transforms) {
				// Verify element is still there
				expect(els.has(el.dataset.square as Square)).toBe(true);
				// Verify transform changed (orientation affects position)
				expect(el.style.transform).not.toBe(oldTransform);
			}
		});
	});

	describe("promotion refuses reuse", () => {
		it("promotion creates new element for queen, removes pawn element", () => {
			const state = defaultState();
			state.pieces = fenToPieces("8/4P3/8/8/8/8/8/8");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const pawnEl = els.get("e7");
			expect(pawnEl).toBeDefined();

			// Promote pawn to queen on e8
			const afterPromotion = defaultState();
			afterPromotion.pieces = fenToPieces("4Q3/8/8/8/8/8/8/8");

			renderPieces(board, els, afterPromotion);

			const queenEl = els.get("e8");
			expect(queenEl).not.toBe(pawnEl);
			expect(pawnEl?.parentNode).toBeNull();
			expect(queenEl).toBeDefined();
		});
	});

	describe("held elements", () => {
		it("held element is not moved, removed, or matched to vacated pool", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const heldEl = els.get("e2");
			expect(heldEl).toBeDefined();
			heldEl!.classList.add("held");

			// Move the pawn e2 -> e4 while holding it
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

			renderPieces(board, els, afterMove);

			// Held element should still be in DOM at original square map entry
			expect(els.get("e2")).toBe(heldEl);
			expect(heldEl?.classList.contains("held")).toBe(true);
			expect(heldEl?.parentNode).toBe(board);
		});

		// Survivors are stamped with the render's tick as PASS 1 walks the new
		// position. A held piece whose square is not in that position is never
		// walked, so it carries no stamp and would read as vacated -- removed out
		// from under the drag. This is the case the separate held test guards.
		it("keeps a held element on a square the new position does not list", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const heldEl = els.get("e2")!;
			markHeld(heldEl, true);
			expect(heldEl.classList.contains("held")).toBe(true);

			// The pawn has left e2 and is not yet anywhere else: exactly what the
			// state looks like mid-drag once the caller has removed it.
			const lifted = defaultState();
			lifted.pieces = fenToPieces("4k3/8/8/8/8/8/8/4K3");

			renderPieces(board, els, lifted);

			expect(els.get("e2")).toBe(heldEl);
			expect(heldEl.parentNode).toBe(board);
		});

		it("markHeld(false) hands the element back to the render path", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const el = els.get("e2")!;
			markHeld(el, true);
			markHeld(el, false);

			const lifted = defaultState();
			lifted.pieces = fenToPieces("4k3/8/8/8/8/8/8/4K3");

			renderPieces(board, els, lifted);

			expect(els.has("e2")).toBe(false);
			expect(el.parentNode).toBeNull();
		});
	});

	describe("pieceOf", () => {
		it("returns correct piece from registry", () => {
			const piece: Piece = { color: "white", role: "pawn" };
			const el = createPieceEl(piece);

			const result = pieceOf(el);
			expect(result).toEqual(piece);
		});

		it("returns correct piece from cloned element with dataset stamp", () => {
			const piece: Piece = { color: "white", role: "pawn" };
			const el = createPieceEl(piece);
			const cloned = el.cloneNode(true) as HTMLElement;

			const result = pieceOf(cloned);
			expect(result).toEqual(piece);
		});

		it("returns correct piece from element with classes only, backfills stamp and registry", () => {
			const el = document.createElement("qd-piece");
			el.classList.add("black", "queen");

			const result = pieceOf(el);
			expect(result).toEqual({ color: "black", role: "queen" });
			expect(el.dataset.piece).toBe("black-queen");
			// Verify it backfilled the registry
			expect(pieceOf(el)).toBe(result);
		});

		it("returns null for malformed element", () => {
			const el = document.createElement("qd-piece");
			expect(pieceOf(el)).toBeNull();
		});

		it("returns null for element with invalid color in dataset", () => {
			const el = document.createElement("qd-piece");
			el.dataset.piece = "red-pawn";
			expect(pieceOf(el)).toBeNull();
		});

		it("returns null for element with invalid role in dataset", () => {
			const el = document.createElement("qd-piece");
			el.dataset.piece = "white-dragon";
			expect(pieceOf(el)).toBeNull();
		});
	});
});
