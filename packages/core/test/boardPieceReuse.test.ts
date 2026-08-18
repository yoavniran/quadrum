import { createBoard } from "../src/board";
import { markHeld } from "../src/view/piecesView";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const E2_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";
const E2_E5_BLACK = "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR";
const CAPTURE = "rnbqkbnr/pppppppp/8/8/4p3/8/PPPPPPPP/RNBQKBNR";
const CAPTURE_DONE = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR";

describe("Board piece reuse and animation", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	describe("element survives plain update", () => {
		it("element at e2 is reused when pawn moves to e4 with animation off", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });
			const initialEl = board.pieceEls().get("e2");
			expect(initialEl).toBeDefined();

			board.update({ position: E2_E4 });

			const movedEl = board.pieceEls().get("e4");
			expect(movedEl).toBe(initialEl);
		});
	});

	describe("animation path glides correct element", () => {
		it("animation uses reused element and glides it", async () => {
			vi.useFakeTimers();

			const board = createBoard(container, { position: START, animate: { enabled: true, duration: 200 } });
			const initialEl = board.pieceEls().get("e2");
			expect(initialEl).toBeDefined();

			board.update({ position: E2_E4 });

			const movedEl = board.pieceEls().get("e4");
			expect(movedEl).toBe(initialEl);
			expect(movedEl?.classList.contains("gliding")).toBe(true);

			vi.runAllTimers();
			await Promise.resolve();

			expect(movedEl?.classList.contains("gliding")).toBe(false);

			vi.useRealTimers();
		});
	});

	describe("interrupted animation cleanup", () => {
		it("second update cancels first animation and leaves no transient classes", async () => {
			vi.useFakeTimers();

			const board = createBoard(container, { position: START, animate: { enabled: true, duration: 200 } });

			board.update({ position: E2_E4 });
			vi.advanceTimersByTime(100);

			// Interrupt with another update
			board.update({ position: E2_E5_BLACK });

			vi.advanceTimersByTime(250);
			await Promise.resolve();

			// No element should have gliding, appearing, or vanishing classes
			for (const el of board.pieceEls().values()) {
				expect(el.classList.contains("gliding")).toBe(false);
				expect(el.classList.contains("appearing")).toBe(false);
				expect(el.classList.contains("vanishing")).toBe(false);
			}

			// No vanishing elements should remain in DOM
			const vanishingEls = container.querySelectorAll(".vanishing");
			expect(vanishingEls.length).toBe(0);

			vi.useRealTimers();
		});
	});

	describe("held element during move", () => {
		it("held element is not disturbed by position update", () => {
			const board = createBoard(container, { position: CAPTURE, animate: { enabled: false } });
			const capturedEl = board.pieceEls().get("e4");
			expect(capturedEl).toBeDefined();

			// Mark it held (as drag layer does)
			markHeld(capturedEl!, true);

			// Move another piece; the held element should survive
			board.update({ position: CAPTURE_DONE });

			expect(board.pieceEls().get("e4")).toBe(capturedEl);
			expect(capturedEl?.classList.contains("held")).toBe(true);
			expect(capturedEl?.parentNode).toBeTruthy();
		});
	});

	describe("unmount cleanup", () => {
		it("unmount leaves no qd-piece descendants", () => {
			const board = createBoard(container, { position: START });
			expect(container.querySelectorAll("qd-piece").length).toBeGreaterThan(0);

			board.unmount();

			expect(container.querySelectorAll("qd-piece").length).toBe(0);
		});
	});

	describe("refresh cleanup", () => {
		it("refresh clears piece elements map and rebuilds", () => {
			const board = createBoard(container, { position: START });
			const beforeEls = board.pieceEls().get("e2");

			board.refresh();

			const afterEls = board.pieceEls().get("e2");
			expect(afterEls).not.toBe(beforeEls);
			expect(afterEls).toBeDefined();
		});
	});

	describe("fast path (changed hint via update)", () => {
		it("quiet move reuses moving piece element", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });
			const initialEl = board.pieceEls().get("e2");

			board.update({ position: E2_E4 });

			expect(board.pieceEls().get("e4")).toBe(initialEl);
		});

		it("update leaves the board's child element count correct", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });
			const initialChildCount = board.dom().board.children.length;

			board.update({ position: E2_E4 });

			expect(board.dom().board.children.length).toBe(initialChildCount);
		});

		it("capture via update removes exactly the captured element", () => {
			const board = createBoard(container, { position: CAPTURE, animate: { enabled: false } });
			const initialChildCount = board.dom().board.children.length;
			const capturedEl = board.pieceEls().get("e4");
			const captoringEl = board.pieceEls().get("e2");

			board.update({ position: CAPTURE_DONE });

			expect(board.pieceEls().get("e4")).toBe(captoringEl);
			expect(capturedEl?.parentNode).toBeNull();
			expect(board.dom().board.children.length).toBe(initialChildCount - 1);
		});

		it("castle renders both pieces correctly", () => {
			const board = createBoard(container, { position: "r3k2r/8/8/8/8/8/8/R3K2R", animate: { enabled: false } });
			const kingEl = board.pieceEls().get("e1");
			const h1RookEl = board.pieceEls().get("h1");

			// Kingside castle: king e1->g1, rook h1->f1
			board.update({ position: "r3k2r/8/8/8/8/8/8/R4RK1" });

			expect(board.pieceEls().get("g1")).toBe(kingEl);
			expect(board.pieceEls().get("f1")).toBe(h1RookEl);
		});

		it("promotion replaces pawn element with queen element", () => {
			const board = createBoard(container, { position: "8/4P3/8/8/8/8/8/8", animate: { enabled: false } });
			const pawnEl = board.pieceEls().get("e7");

			board.update({ position: "4Q3/8/8/8/8/8/8/8" });

			expect(board.pieceEls().get("e8")).not.toBe(pawnEl);
			expect(pawnEl?.parentNode).toBeNull();
		});

		it("orientation flip re-places every piece", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });
			const e2El = board.pieceEls().get("e2");
			const initialTransform = e2El?.style.transform;

			board.update({ orientation: "black" });

			expect(e2El?.style.transform).not.toBe(initialTransform);
		});

		it("several consecutive updates all render correctly", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });

			board.update({ position: E2_E4 });
			expect(board.pieceEls().get("e4")).toBeDefined();

			board.update({ position: E2_E5_BLACK });
			expect(board.pieceEls().get("e5")).toBeDefined();

			board.update({ position: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR" });
			expect(board.pieceEls().get("e4")).toBeDefined();
			expect(board.pieceEls().get("e5")).toBeDefined();
		});

		it("update with no visual changes still renders nothing", () => {
			const board = createBoard(container, { position: START, animate: { enabled: false } });
			const initialChildCount = board.dom().board.children.length;

			board.update({ sideToMove: "black" });

			expect(board.dom().board.children.length).toBe(initialChildCount);
		});

		it("update with animation enabled still renders and animates correctly", async () => {
			vi.useFakeTimers();

			const board = createBoard(container, { position: START, animate: { enabled: true, duration: 200 } });
			const initialEl = board.pieceEls().get("e2");

			board.update({ position: E2_E4 });

			expect(board.pieceEls().get("e4")).toBe(initialEl);

			vi.runAllTimers();
			await Promise.resolve();

			vi.useRealTimers();
		});
	});
});
