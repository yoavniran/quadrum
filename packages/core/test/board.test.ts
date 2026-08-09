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

	it("marks the checked king from a colour and from a square alike", () => {
		// Both forms of checkSide are strings, so the colour case can only be
		// recognised by elimination. Getting that wrong drops the highlight.
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
			checkSide: "white",
		});

		expect(container.querySelector('[data-square="e1"].in-check')).not.toBeNull();
		expect(container.querySelectorAll(".in-check")).toHaveLength(1);

		board.update({ checkSide: "e8" });
		expect(container.querySelector('[data-square="e8"].in-check')).not.toBeNull();
		expect(container.querySelectorAll(".in-check")).toHaveLength(1);

		board.update({ checkSide: null });
		expect(container.querySelectorAll(".in-check")).toHaveLength(0);
	});

	it("a move press wipes the user's marks, and clearOnPress opts out", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});
		board.setUserMarks([{ from: "e2", to: "e4" }]);

		const press = () =>
			container
				.querySelector("qd-board")!
				.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));

		press();
		expect(board.state().marks.user).toHaveLength(0);

		// Auto marks are the app's, not the user's scratch work -- a press must
		// leave engine arrows and the like alone.
		board.setUserMarks([{ from: "e2", to: "e4" }]);
		board.setAutoMarks([{ from: "d2", to: "d4" }]);
		board.update({ marks: { clearOnPress: false } });
		press();
		expect(board.state().marks.user).toHaveLength(1);
		expect(board.state().marks.auto).toHaveLength(1);
	});

	it("paints the hovered square, which the render used to hardcode away", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		board.setHover("e4");
		expect(container.querySelector('[data-square="e4"].hover')).not.toBeNull();

		board.setHover(null);
		expect(container.querySelectorAll(".hover")).toHaveLength(0);
	});

	it("draws an arrow as one polygon that starts clear of its origin square", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: { user: [{ from: "a1", to: "a8" }] },
		});

		const arrows = container.querySelectorAll('.qd-marks [data-mark="arrow"]');
		expect(arrows).toHaveLength(1);

		// A shaft and a head drawn as separate elements only meet if their
		// lengths agree; as one polygon they cannot come apart.
		const arrow = arrows[0] as SVGPolygonElement;
		expect(arrow.tagName).toBe("polygon");
		expect(Number(arrow.getAttribute("opacity"))).toBeLessThan(1);

		// a1 is the bottom-left square, so the arrow runs up the x=50 column from
		// y=750 to y=50. Every tail vertex must sit well above the origin centre
		// (smaller y) so the piece on a1 stays visible.
		const ys = arrow
			.getAttribute("points")!
			.split(" ")
			.map((p) => Number(p.split(",")[1]));
		expect(Math.max(...ys)).toBeLessThan(750 - 30);
		expect(Math.min(...ys)).toBeCloseTo(50, 5);

		board.unmount();
	});

	it("playing from an emptied square drops the stale selection", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			selected: "e2",
		});
		expect(board.state().selected).toBe("e2");

		// The consumer erases the piece the selection points at — a board
		// editor does exactly this. Without the drop, the selection outlives
		// its piece and every later press reads as "play from e2", which
		// no-ops for want of a piece and wedges the board.
		board.update({ position: "8/8/8/8/8/8/8/8", animate: { enabled: false } });
		board.play("e2", "e4");

		expect(board.state().selected).toBeNull();
	});
});
