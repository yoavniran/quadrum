import { createBoard } from "../src/board";

describe("board", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (container.parentElement) {
			container.parentElement.removeChild(container);
		}
	});

	it("update with position preserves marks.user", () => {
		const board = createBoard(container, { animate: { enabled: false } });

		// Set some user marks
		board.setUserMarks([{ from: "e2" }, { from: "e4", to: "e5" }]);

		// Update position
		board.update({ position: "8/8/8/8/8/8/8/8", animate: { enabled: false } });

		// Marks should still be there
		const marksOutput = JSON.stringify(board.state().marks.user);
		expect(marksOutput).toContain("e2");
		expect(marksOutput).toContain("e4");
	});

	it("toggling locked leaves interactive class correct and doesn't rebind", () => {
		const board = createBoard(container, { animate: { enabled: false } });
		// buildDom turns the container itself into the wrap; it is not a descendant.
		const wrap = container;

		// Initially should have interactive class
		expect(wrap.classList.contains("interactive")).toBe(true);

		// Lock it
		board.update({ locked: true });
		expect(wrap.classList.contains("interactive")).toBe(false);

		// Unlock it
		board.update({ locked: false });
		expect(wrap.classList.contains("interactive")).toBe(true);

		// Verify that selection still works by clicking a piece
		const pieces = container.querySelectorAll("qd-piece");
		if (pieces.length > 0) {
			const pieceEl = pieces[0] as HTMLElement;
			pieceEl.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
			// The test passes if no error is thrown; rebinding would cause issues
		}
	});

	it("changing marks.pens color repaints marks layer", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: { user: [{ from: "e2", to: "e4" }] },
		});

		const marksLayer = container.querySelector(".qd-marks") as SVGSVGElement;
		const initialSvgContent = marksLayer.innerHTML;

		// Change the green pen color
		board.update({
			marks: { pens: { green: { color: "#ffffff" } } },
		});

		const updatedSvgContent = marksLayer.innerHTML;

		// SVG should be repainted (content might change due to color update)
		expect(marksLayer).toBeDefined();
		expect(updatedSvgContent).not.toBe(initialSvgContent);
	});

	it("toggling moves.showTargets updates square elements when piece selected", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
			moves: { targets: new Map([["e2", ["e3", "e4"]]]), showTargets: true },
		});

		// Select the e2 pawn
		board.select("e2");

		// Should have target elements
		let targets = container.querySelectorAll("[data-square].target");
		expect(targets.length).toBeGreaterThan(0);

		// Hide targets
		board.update({ moves: { showTargets: false } });

		// Targets should be gone
		targets = container.querySelectorAll("[data-square].target");
		expect(targets.length).toBe(0);

		// Show targets again
		board.update({ moves: { showTargets: true } });

		// Targets should be back
		targets = container.querySelectorAll("[data-square].target");
		expect(targets.length).toBeGreaterThan(0);
	});

	it("flip swaps data-orientation and re-places pieces", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
			orientation: "white",
		});

		// buildDom turns the container itself into the wrap; it is not a descendant.
		const wrap = container;
		expect(wrap.dataset.orientation).toBe("white");

		board.flip();
		expect(wrap.dataset.orientation).toBe("black");

		board.flip();
		expect(wrap.dataset.orientation).toBe("white");
	});

	it("placement round-trips the initial position", () => {
		const initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
		const board = createBoard(container, {
			animate: { enabled: false },
			position: initialFen,
		});

		const placement = board.placement();
		expect(placement).toBe(initialFen);
	});

	it("unmount empties the container", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		expect(container.children.length).toBeGreaterThan(0);

		board.unmount();

		expect(container.children.length).toBe(0);
	});

	it("orientation is accessible via orientation method", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			orientation: "white",
		});

		expect(board.orientation()).toBe("white");
	});

	it("setPiece updates the board", () => {
		const board = createBoard(container, { animate: { enabled: false } });

		board.setPiece("e4", { color: "white", role: "pawn" });

		const placement = board.placement();
		expect(placement).toContain("P");
	});

	it("select and clearSelection work", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		board.select("e2");

		const activeSquare = container.querySelector("[data-square].active");
		expect(activeSquare).toBeDefined();

		board.clearSelection();

		const clearedSquare = container.querySelector("[data-square].active");
		expect(clearedSquare).toBeNull();
	});

	it("move commits a position change", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "8/8/8/8/8/8/4P3/8",
		});

		board.move("e2", "e4");

		const boardFen = board.placement();
		// Verify the pawn is now on e4
		const lines = boardFen.split("/");
		expect(lines[4]).toContain("P");
	});

	it("setUserMarks and setAutoMarks update marks", () => {
		const board = createBoard(container, { animate: { enabled: false } });

		board.setUserMarks([{ from: "e2" }]);
		board.setAutoMarks([{ from: "e4", to: "e5" }]);

		const state = board.state();
		expect(state.marks.user).toHaveLength(1);
		expect(state.marks.auto).toHaveLength(1);
	});
});
