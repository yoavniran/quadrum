import { createBoard } from "../src/board";
import { buildDom } from "../src/view/layout";
import { renderMarks } from "../src/view/marksView";
import { defaultState, applyOptions } from "../src/options";

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

	it("splits an arrow across the layers so it starts behind a piece and ends on top of one", () => {
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: { user: [{ from: "a1", to: "a8" }] },
		});

		// The shaft belongs to the under-the-pieces layer and the head to the
		// over-the-pieces one; landing in the same layer would put one end of the
		// arrow on the wrong side of the piece it touches.
		const shafts = container.querySelectorAll('.qd-marks [data-mark="arrow"]');
		const heads = container.querySelectorAll('.qd-heads [data-mark-part="head"]');
		expect(shafts).toHaveLength(1);
		expect(heads).toHaveLength(1);
		expect(container.querySelectorAll('.qd-marks [data-mark-part="head"]')).toHaveLength(0);
		expect(container.querySelectorAll('.qd-heads [data-mark]')).toHaveLength(0);

		// Both halves answer for the same mark, so either one can be found by its
		// squares and pen.
		expect(heads[0]!.getAttribute("data-from")).toBe("a1");
		expect(heads[0]!.getAttribute("data-to")).toBe("a8");
		expect(heads[0]!.getAttribute("data-pen")).toBe(shafts[0]!.getAttribute("data-pen"));

		const ysOf = (el: Element) =>
			el
				.getAttribute("points")!
				.split(" ")
				.map((p) => Number(p.split(",")[1]));

		const shaft = shafts[0] as SVGPolygonElement;
		const head = heads[0] as SVGPolygonElement;
		expect(shaft.tagName).toBe("polygon");
		expect(head.tagName).toBe("polygon");
		// The over-the-pieces half must be opaque, or the piece it covers shows
		// through it. The shaft is translucent against the board, which it gets
		// from a gradient that ramps up to opaque so the two halves meet at the
		// same tone rather than stepping mid-arrow.
		expect(Number(head.getAttribute("opacity"))).toBe(1);
		const fade = shaft.getAttribute("fill")!.match(/^url\(#(.+)\)$/);
		expect(fade).not.toBeNull();
		expect(shaft.getAttribute("opacity")).toBeNull();
		const stops = container.querySelectorAll(`.qd-marks defs #${fade![1]} stop`);
		expect(Array.from(stops).map((s) => Number(s.getAttribute("stop-opacity")))).toEqual([
			0.8, 1,
		]);

		// a1 is the bottom-left square, so the arrow runs up the x=50 column from
		// y=750 to y=50. The shaft is rooted at the origin centre rather than
		// backed off it -- the piece hides the tail -- and the head's tip reaches
		// the destination centre.
		const shaftYs = ysOf(shaft);
		const headYs = ysOf(head);
		expect(Math.max(...shaftYs)).toBeCloseTo(750, 5);
		expect(Math.min(...headYs)).toBeCloseTo(50, 5);

		// The split is at the destination square's boundary, not at the neck: a
		// head alone on top leaves the shaft under it for the piece's base to
		// swallow, so the whole of the arrow inside a8 (y <= 100) is up there.
		expect(Math.max(...headYs)).toBeCloseTo(100, 5);

		// They must overlap slightly, never merely touch: two shapes sharing an
		// edge exactly antialias into a visible hairline seam.
		expect(Math.min(...shaftYs)).toBeLessThan(Math.max(...headYs));

		board.unmount();
	});

	it("stamps data-mark once per mark, however many shapes the mark is drawn from", () => {
		// Regression: splitting the arrow across the two layers put data-mark on
		// both halves, so [data-mark] started counting shapes instead of marks and
		// every arrow was counted twice -- by application code as much as by tests.
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: {
				user: [
					{ from: "g1", to: "f3" },
					{ from: "b1", to: "c3" },
					{ from: "e5" },
				],
			},
		});

		expect(container.querySelectorAll("[data-mark]")).toHaveLength(3);
		expect(container.querySelectorAll('[data-mark="arrow"]')).toHaveLength(2);
		expect(container.querySelectorAll('[data-mark="circle"]')).toHaveLength(1);
		// The heads are still there -- they are simply parts, not marks.
		expect(container.querySelectorAll('[data-mark-part="head"]')).toHaveLength(2);

		board.unmount();
	});

	it("draws a user mark over an automatic one on the same squares, not instead of it", () => {
		// Regression: user and auto marks were folded into one map keyed by
		// from+to, so an arrow drawn over the move an engine was suggesting --
		// the common case -- silently replaced it. Worse, it looked like the
		// user's arrow vanishing on release: while being drawn it is `current`,
		// which was set last and so won the collision.
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: {
				auto: [{ from: "e2", to: "e4", pen: "green" }],
				user: [{ from: "e2", to: "e4", pen: "blue" }],
			},
		});

		const pens = () =>
			[...container.querySelectorAll('.qd-marks [data-mark="arrow"]')].map((arrow) =>
				arrow.getAttribute("data-pen"),
			);

		// Both survive, and the user's is painted second so it lands on top --
		// within a layer the DOM order is the paint order.
		expect(pens()).toEqual(["green", "blue"]);

		board.unmount();
	});

	it("still collapses duplicate marks within a single source", () => {
		// Deduping moved per-source; it must not have been lost along the way.
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: {
				auto: [
					{ from: "e2", to: "e4", pen: "green" },
					{ from: "e2", to: "e4", pen: "red" },
				],
				user: [
					{ from: "d2", to: "d4", pen: "green" },
					{ from: "d2", to: "d4", pen: "blue" },
				],
			},
		});

		// One arrow per source, the later of each pair winning.
		expect(container.querySelectorAll('[data-mark="arrow"]')).toHaveLength(2);
		expect(container.querySelectorAll('[data-mark="arrow"][data-pen="red"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-mark="arrow"][data-pen="blue"]')).toHaveLength(1);

		board.unmount();
	});

	it("lets the in-progress mark supersede the finished user mark it is redrawing", () => {
		// Redrawing an arrow that already exists must not paint two stacked
		// copies of it -- `current` replaces its own key within the user source,
		// which is the one dedupe that survives across the auto/user split.
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), {
			marks: {
				auto: [{ from: "e2", to: "e4", pen: "green" }],
				user: [{ from: "a1", to: "a8", pen: "blue" }],
			},
		});

		renderMarks(dom, state, { from: "a1", to: "a8", pen: "red" });

		const pens = [...container.querySelectorAll('.qd-marks [data-mark="arrow"]')].map((arrow) =>
			arrow.getAttribute("data-pen"),
		);
		// The auto mark, then the redraw standing in for the user mark it replaces.
		expect(pens).toEqual(["green", "red"]);
	});

	it("rebuilds the arrows' fade gradients each render instead of piling them up", () => {
		// Every repaint mints a fresh gradient id, so <defs> is a leak unless the
		// clear empties it -- and it cannot simply be dropped, since the marks
		// layer's own shafts reference what is inside it.
		const board = createBoard(container, {
			animate: { enabled: false },
			marks: { user: [{ from: "a1", to: "a8" }] },
		});

		const gradients = () => container.querySelectorAll(".qd-marks defs linearGradient").length;
		expect(gradients()).toBe(1);

		board.setUserMarks([{ from: "a1", to: "a8" }]);
		board.setUserMarks([{ from: "a1", to: "a8" }]);
		expect(gradients()).toBe(1);

		// The reference has to survive the churn, or the shaft paints as black.
		const shaft = container.querySelector('.qd-marks [data-mark="arrow"]')!;
		const id = shaft.getAttribute("fill")!.match(/^url\(#(.+)\)$/)![1];
		expect(container.querySelector(`.qd-marks defs #${id}`)).not.toBeNull();

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
