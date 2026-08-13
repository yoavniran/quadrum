import { createBoard } from "../src/board";

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
			capturedEl!.classList.add("held");

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
});
