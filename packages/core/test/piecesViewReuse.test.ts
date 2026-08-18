import type { Piece, Square } from "../src/types";
import { createPieceEl, markHeld, pieceOf, placePieceAtPoint, renderPieces } from "../src/view/piecesView";
import { setTransform } from "../src/view/placement";
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
			markHeld(heldEl!, true);

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

	// W1 converts "a survivor element mapped at square S is visually at S" from
	// an incidental truth into a load-bearing one: the placement epoch skips the
	// whole placement chain for survivors, so every path that moves an element
	// out of band (drag, animation) must invalidate the record for the next
	// render to correct it.
	describe("placement epoch", () => {
		it("a position update that moves one piece writes a transform on exactly one element", async () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const mutations: MutationRecord[] = [];
			const observer = new MutationObserver((records) => {
				mutations.push(...records);
			});
			observer.observe(board, { attributes: true, attributeFilter: ["style"], subtree: true });

			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			renderPieces(board, els, afterMove);

			await Promise.resolve();
			observer.disconnect();

			const touched = new Set(mutations.map((m) => m.target));
			expect(touched.size).toBe(1);
			expect(touched.has(els.get("e4")!)).toBe(true);
		});

		it("an out-of-band setTransform is corrected by the next render", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const el = els.get("e2")!;
			const settled = el.style.transform;

			setTransform(el, "translate(0%, 0%)");
			renderPieces(board, els, state);

			expect(el.style.transform).toBe(settled);
		});

		it("a released drag is re-placed by the next render", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");

			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const el = els.get("e2")!;
			const settled = el.style.transform;

			// Mid-drag: held, positioned against the pointer, skipped by renders.
			markHeld(el, true);
			placePieceAtPoint(el, { x: 3.5, y: 3.5 });
			renderPieces(board, els, state);
			expect(el.style.transform).not.toBe(settled);

			// Release: the drag write cleared the record's epoch, so the next
			// render must run the full placement chain and put it back.
			markHeld(el, false);
			renderPieces(board, els, state);
			expect(el.style.transform).toBe(settled);
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

	describe("fast path (changed hint)", () => {
		it("a correct hint renders the same DOM as no hint", () => {
			const state1 = defaultState();
			state1.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els1: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els1, state1);

			const board2 = document.createElement("div");
			document.body.appendChild(board2);
			const state2 = defaultState();
			state2.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els2: Map<Square, HTMLElement> = new Map();
			renderPieces(board2, els2, state2);

			// Move pawn e2 -> e4 on board1 with hint
			const afterMove1 = defaultState();
			afterMove1.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			const changed: Square[] = ["e2", "e4"];
			renderPieces(board, els1, afterMove1, changed);

			// Same move on board2 without hint
			const afterMove2 = defaultState();
			afterMove2.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			renderPieces(board2, els2, afterMove2);

			// Compare DOM structure
			expect(board.children.length).toBe(board2.children.length);
			const squares1 = Array.from(board.children).map((el) => (el as any).dataset.square);
			const squares2 = Array.from(board2.children).map((el) => (el as any).dataset.square);
			expect(squares1).toEqual(squares2);

			board2.remove();
		});

		it("a hint keeps unchanged elements by identity", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const a7El = els.get("a7");

			// Move e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			const changed: Square[] = ["e2", "e4"];
			renderPieces(board, els, afterMove, changed);

			expect(els.get("a7")).toBe(a7El);
		});

		it("a hint does not remove unchanged pieces", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const initialSize = els.size;

			// Move e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			const changed: Square[] = ["e2", "e4"];
			renderPieces(board, els, afterMove, changed);

			expect(els.size).toBe(initialSize);
		});

		it("a hinted capture removes exactly the captured element", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4p3/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const capturedEl = els.get("e4");
			const captoringEl = els.get("e2");

			// White pawn e2 captures black pawn e4
			const afterCapture = defaultState();
			afterCapture.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			const changed: Square[] = ["e2", "e4"];
			renderPieces(board, els, afterCapture, changed);

			expect(els.get("e4")).toBe(captoringEl);
			expect(capturedEl?.parentNode).toBeNull();
			expect(els.has("e2")).toBe(false);
		});

		it("a hinted move reuses the moving element", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const movedEl = els.get("e2");

			// Move e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			const changed: Square[] = ["e2", "e4"];
			renderPieces(board, els, afterMove, changed);

			expect(els.get("e4")).toBe(movedEl);
		});

		it("guard 2: orientation flip with hint passed falls back and re-places", () => {
			const state = defaultState();
			state.orientation = "white";
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const e2El = els.get("e2");
			const whiteTransform = e2El?.style.transform;

			// Flip to black
			const flipped = defaultState();
			flipped.orientation = "black";
			flipped.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const changed: Square[] = Array.from(flipped.pieces.keys());
			renderPieces(board, els, flipped, changed);

			// Every element should be re-placed due to orientation change
			expect(e2El?.style.transform).not.toBe(whiteTransform);
		});

		it("guard 3: an out-of-band write on a square the hint calls unchanged is still corrected", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			// e1 is the square the hint will NOT mention. Stranding it here is what
			// a released drag does: the transform is written outside placeSquare, so
			// only the out-of-band counter can tell the next render to look.
			const strandedEl = els.get("e1")!;
			const settled = strandedEl.style.transform;
			setTransform(strandedEl, "translate(50%, 50%)");
			expect(strandedEl.style.transform).not.toBe(settled);

			// A legitimate hint for a real move elsewhere: e2 -> e4, e1 untouched.
			const after = defaultState();
			after.pieces = fenToPieces("4k3/8/8/8/4P3/8/8/4K3");
			renderPieces(board, els, after, ["e4", "e2"]);

			// Only guard 3 can catch this: e1 is absent from the hint, so a
			// restricted PASS 1 never revisits it, and the occupancy arithmetic of
			// guard 4 accepts the hint as correct -- which it is.
			expect(strandedEl.style.transform).toBe(settled);
			expect(els.get("e4")).toBeDefined();
			expect(els.has("e2")).toBe(false);
		});

		it("guard 4: deliberately wrong hint still renders correctly via fallback", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			// Move e2 -> e4
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("4k3/8/8/8/4P3/8/8/4K3");
			// Deliberately wrong hint: omit e2 (the source)
			const wrongHint: Square[] = ["e4"];
			renderPieces(board, els, afterMove, wrongHint);

			// Should still render correctly despite wrong hint
			expect(els.get("e4")?.dataset.square).toBe("e4");
			expect(els.get("e2")).toBeUndefined();
		});

		it("an empty hint with unchanged position renders nothing", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const initialSize = els.size;
			const initialChildCount = board.children.length;

			// Empty hint, unchanged position
			const unchanged = defaultState();
			unchanged.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			renderPieces(board, els, unchanged, []);

			expect(els.size).toBe(initialSize);
			expect(board.children.length).toBe(initialChildCount);
		});

		it("a held element on a hinted changed square is not replaced", () => {
			const state = defaultState();
			state.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const el = els.get("e2");
			markHeld(el!, true);

			// Unchanged position but e2 in hint
			const unchanged = defaultState();
			unchanged.pieces = fenToPieces("4k3/8/8/8/8/8/4P3/4K3");
			const changed: Square[] = ["e2"];
			renderPieces(board, els, unchanged, changed);

			expect(els.get("e2")).toBe(el);
		});

		it("no hint at all behaves exactly as before", () => {
			const state = defaultState();
			state.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
			const els: Map<Square, HTMLElement> = new Map();
			renderPieces(board, els, state);

			const initialSize = els.size;

			// Move without hint
			const afterMove = defaultState();
			afterMove.pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");
			renderPieces(board, els, afterMove);

			expect(els.size).toBe(initialSize);
		});
	});
});
