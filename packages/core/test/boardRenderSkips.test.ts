// Companion to boardRenderParts.test.ts. That file proves the routing changed
// no behaviour; this one proves it actually skips work. The distinction matters:
// renderPieces already keys its elements by square and reuses them when nothing
// moved, so element identity survives a full render too -- an identity assertion
// alone would pass just as happily against the unrouted pipeline.

import type { renderPieces as RenderPieces } from "../src/view/piecesView";
import type { renderCoords as RenderCoords } from "../src/view/layout";

const calls = { pieces: 0, coords: 0 };

vi.mock("../src/view/piecesView", async () => {
	const actual = await vi.importActual<typeof import("../src/view/piecesView")>(
		"../src/view/piecesView",
	);
	const renderPieces: typeof RenderPieces = (...args) => {
		calls.pieces += 1;
		return actual.renderPieces(...args);
	};
	return { ...actual, renderPieces };
});

vi.mock("../src/view/layout", async () => {
	const actual = await vi.importActual<typeof import("../src/view/layout")>(
		"../src/view/layout",
	);
	const renderCoords: typeof RenderCoords = (...args) => {
		calls.coords += 1;
		return actual.renderCoords(...args);
	};
	return { ...actual, renderCoords };
});

const { createBoard } = await import("../src/board");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

describe("Board render parts skip unrelated layers", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		calls.pieces = 0;
		calls.coords = 0;
	});

	afterEach(() => {
		container.remove();
	});

	it("setAutoMarks does not touch the piece layer", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;

		board.setAutoMarks([{ from: "e2", to: "e4", pen: "green" }]);

		expect(calls.pieces).toBe(0);
	});

	it("setUserMarks does not touch the piece layer", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;

		board.setUserMarks([{ from: "d2", to: "d4", pen: "red" }]);

		expect(calls.pieces).toBe(0);
	});

	it("a sideToMove-only update renders nothing at all", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;
		calls.coords = 0;

		board.update({ sideToMove: "black" });

		expect(calls.pieces).toBe(0);
		expect(calls.coords).toBe(0);
	});

	it("selecting a square does not touch the piece or coordinate layers", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;
		calls.coords = 0;

		board.select("e2");

		expect(calls.pieces).toBe(0);
		expect(calls.coords).toBe(0);
	});

	it("a position update still renders the piece layer", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;

		board.update({ position: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR" });

		expect(calls.pieces).toBe(1);
	});

	it("an orientation update renders every layer", () => {
		const board = createBoard(container, { position: START });
		calls.pieces = 0;
		calls.coords = 0;

		board.update({ orientation: "black" });

		expect(calls.pieces).toBe(1);
		expect(calls.coords).toBe(1);
	});
});
