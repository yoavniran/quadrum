import { createMoveController } from "../src/input/moveInput";
import type { MoveContext } from "../src/input/moveInput";
import { defaultState, applyOptions } from "../src/options";
import type { BoardState } from "../src/options";
import type { Piece, Square } from "../src/types";
import type { BoardDom } from "../src/view/layout";

interface FakeContext {
	ctx: MoveContext;
	played: Array<[Square, Square]>;
	deleted: Square[];
	placed: Array<[Square, Piece]>;
	setSelectedCalls: (Square | null)[];
	hoverCalls: (Square | null)[];
}

// Read live state through ctx.state(), never a snapshot: release() reads the
// selection back after press() has set it.
function createFakeContext(options: Record<string, unknown> = {}): FakeContext {
	let state: BoardState = defaultState();
	state = applyOptions(state, { position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" });

	const played: Array<[Square, Square]> = [];
	const deleted: Square[] = [];
	const placed: Array<[Square, Piece]> = [];
	const setSelectedCalls: (Square | null)[] = [];
	const hoverCalls: (Square | null)[] = [];

	state = applyOptions(state, options);

	const ctx: MoveContext = {
		state: () => state,
		dom: () => ({ board: document.createElement("qd-board") } as unknown as BoardDom),
		pieceEls: () => new Map(),
		setHover: (square: Square | null) => {
			hoverCalls.push(square);
		},
		setSelected: (square: Square | null) => {
			setSelectedCalls.push(square);
			state = applyOptions(state, { selected: square });
		},
		play: (from: Square, to: Square) => {
			played.push([from, to]);
		},
		deletePiece: (square: Square) => {
			deleted.push(square);
		},
		placePiece: (square: Square, piece: Piece) => {
			placed.push([square, piece]);
		},
		redraw: () => {},
	};

	return { ctx, played, deleted, placed, setSelectedCalls, hoverCalls };
}

describe("moveInput", () => {
	it("click to select then click a target plays the move", () => {
		const { ctx, played } = createFakeContext({
			moves: {
				targets: new Map([["e2", ["e4"]]]),
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		// Click e2 to select
		controller.press("e2", {} as PointerEvent, point);
		controller.release("e2", point);
		expect(played).toEqual([]);

		// Click e4 to play the move
		controller.press("e4", {} as PointerEvent, point);
		controller.release("e4", point);
		expect(played).toEqual([["e2", "e4"]]);
	});

	it("drag past the threshold plays the move from the real origin", () => {
		const { ctx, played } = createFakeContext({
			moves: {
				targets: new Map([["e2", ["e4"]]]),
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.drag("e4", point, 10);
		controller.release("e4", point);

		expect(played).toEqual([["e2", "e4"]]);
	});

	it("a click that never crosses the drag threshold plays nothing in free mode", () => {
		const { ctx, played } = createFakeContext({
			moves: {
				free: true,
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.release("e2", point);

		expect(played).toEqual([]);
	});

	it("clicking an already-selected piece deselects it", () => {
		const { ctx } = createFakeContext({
			moves: {
				free: true,
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		// First click selects e2
		controller.press("e2", {} as PointerEvent, point);
		controller.release("e2", point);
		expect(ctx.state().selected).toBe("e2");

		// Second click on e2 deselects it
		controller.press("e2", {} as PointerEvent, point);
		controller.release("e2", point);
		expect(ctx.state().selected).toBeNull();
	});

	it("dragging off the board deletes the piece when removeOffBoard is set", () => {
		const { ctx, deleted } = createFakeContext({
			drag: {
				removeOffBoard: true,
			},
			moves: {
				free: true,
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.drag(null, point, 10);
		controller.release(null, point);

		expect(deleted).toEqual(["e2"]);
	});

	it("dragging off the board without removeOffBoard keeps the piece", () => {
		const { ctx, deleted } = createFakeContext({
			drag: {
				removeOffBoard: false,
			},
			moves: {
				free: true,
			},
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.drag(null, point, 10);
		controller.release(null, point);

		expect(deleted).toEqual([]);
	});

	it("a spare piece drop places the real piece", () => {
		const { ctx, placed } = createFakeContext();

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };
		const piece = { color: "white", role: "queen" } as const;

		controller.startSpare(piece, point);
		controller.drag("d4", point, 10);
		controller.release("d4", point);

		expect(placed).toEqual([["d4", { color: "white", role: "queen" }]]);
	});

	it("dragSparePiece → pointermove → pointerup over a square places the piece", () => {
		const { ctx, placed } = createFakeContext();

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };
		const piece = { color: "black", role: "knight" } as const;

		controller.startSpare(piece, point);
		controller.drag("f6", point, 5);
		controller.release("f6", point);

		expect(placed).toEqual([["f6", { color: "black", role: "knight" }]]);
	});

	it("a spare piece drag released off the board places nothing", () => {
		const { ctx, placed } = createFakeContext();

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };
		const piece = { color: "white", role: "rook" } as const;

		controller.startSpare(piece, point);
		controller.drag(null, point, 10);
		controller.release(null, point);

		expect(placed).toEqual([]);
	});

	it("a locked board ignores press, drag and release", () => {
		const { ctx, played, setSelectedCalls, deleted, placed } = createFakeContext({
			locked: true,
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.drag("e4", point, 10);
		controller.release("e4", point);

		expect(played).toEqual([]);
		expect(setSelectedCalls).toEqual([]);
		expect(deleted).toEqual([]);
		expect(placed).toEqual([]);
	});

	it("a selection left on an emptied square does not swallow the next press", () => {
		// A consumer that edits the position (a board editor) can erase the
		// piece under the current selection between two presses. The stale
		// selection used to eat every press after that — free mode makes every
		// square a target, so the press read as "play from the selection", the
		// play no-opped for want of a piece, and no drag ever armed again.
		const { ctx, played, setSelectedCalls } = createFakeContext({
			moves: { free: true },
			selected: "e5", // empty in the start position
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);

		expect(played).toEqual([]);
		expect(setSelectedCalls).toEqual(["e2"]);
		expect(controller.dragging).toBe(true);
	});

	it("reports a completed click through onTap, empty squares included", () => {
		const tapped: (Square | null)[] = [];
		const { ctx } = createFakeContext({
			select: { onTap: (square: Square | null) => tapped.push(square) },
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		// e5 is empty, so selection never lands there — only a tap reports it.
		controller.press("e5", {} as PointerEvent, point);
		controller.release("e5", point);

		expect(tapped).toEqual(["e5"]);
	});

	it("does not report a tap when the press became a drag", () => {
		const tapped: (Square | null)[] = [];
		const { ctx } = createFakeContext({
			moves: { targets: new Map([["e2", ["e4"]]]) },
			select: { onTap: (square: Square | null) => tapped.push(square) },
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		controller.drag("e4", point, 10);
		controller.release("e4", point);

		expect(tapped).toEqual([]);
	});

	it("reports the square under a dragged piece, and drops it on release", () => {
		const { ctx, hoverCalls } = createFakeContext({
			moves: { targets: new Map([["e2", ["e3", "e4"]]]) },
		});

		const controller = createMoveController(ctx);
		const point = { x: 0.5, y: 0.5 };

		controller.press("e2", {} as PointerEvent, point);
		// below the threshold: nothing is being dragged yet, so nothing hovers
		controller.drag("e3", point, 1);
		expect(hoverCalls).toEqual([]);

		controller.drag("e3", point, 10);
		controller.drag("e4", point, 20);
		// back over its own square -- there is no drop to preview there
		controller.drag("e2", point, 30);
		expect(hoverCalls).toEqual(["e3", "e4", null]);

		controller.release("e4", point);
		expect(hoverCalls[hoverCalls.length - 1]).toBeNull();
	});
});
