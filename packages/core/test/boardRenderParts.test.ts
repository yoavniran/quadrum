import { createBoard } from "../src/board";

describe("Board render parts routing", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("setAutoMarks leaves piece elements untouched", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		const piecesBefore = Array.from(container.querySelectorAll("qd-piece"));
		board.setAutoMarks([
			{ from: "e2", to: "e4", pen: "green" },
		]);
		const piecesAfter = Array.from(container.querySelectorAll("qd-piece"));

		expect(piecesBefore.length).toBe(piecesAfter.length);
		piecesBefore.forEach((el, i) => {
			expect(el).toBe(piecesAfter[i]);
		});
	});

	it("setUserMarks leaves piece elements untouched", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		const piecesBefore = Array.from(container.querySelectorAll("qd-piece"));
		board.setUserMarks([
			{ from: "d2", to: "d4", pen: "red" },
		]);
		const piecesAfter = Array.from(container.querySelectorAll("qd-piece"));

		expect(piecesBefore.length).toBe(piecesAfter.length);
		piecesBefore.forEach((el, i) => {
			expect(el).toBe(piecesAfter[i]);
		});
	});

	it("update with sideToMove only leaves piece elements untouched", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		const piecesBefore = Array.from(container.querySelectorAll("qd-piece"));
		board.update({ sideToMove: "black" });
		const piecesAfter = Array.from(container.querySelectorAll("qd-piece"));

		expect(piecesBefore.length).toBe(piecesAfter.length);
		piecesBefore.forEach((el, i) => {
			expect(el).toBe(piecesAfter[i]);
		});
	});

	it("update with position correctly re-renders pieces", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		// Move white pawn from e2 to e4
		board.update({
			position: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
		});

		const placement = board.placement();
		expect(placement).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

		const pieces = Array.from(container.querySelectorAll("qd-piece"));
		expect(pieces.length).toBe(32);
	});

	it("update with orientation re-renders every layer", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
			orientation: "white",
		});

		const piecesBefore = Array.from(container.querySelectorAll("qd-piece"));
		board.update({ orientation: "black" });
		const piecesAfter = Array.from(container.querySelectorAll("qd-piece"));

		// Pieces are repositioned, not recreated (same object identity)
		expect(piecesBefore.length).toBe(piecesAfter.length);
		piecesBefore.forEach((el, i) => {
			expect(el).toBe(piecesAfter[i]);
		});

		// Verify the board orientation changed (set on the wrap/container element)
		expect((container as HTMLElement).dataset.orientation).toBe("black");
	});

	it("marks are still rendered after updates", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		board.setAutoMarks([
			{ from: "e2", to: "e4", pen: "green" },
		]);

		const marksLayer = container.querySelector(".qd-marks") as SVGSVGElement;
		const polygons = marksLayer?.querySelectorAll("polygon");
		expect(polygons && polygons.length > 0).toBe(true);
	});

	it("coordinates can be toggled via update", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
			coordinates: true,
		});

		let coordsElement = container.querySelector("qd-coords");
		expect(coordsElement?.classList.contains("hidden")).toBe(false);

		board.update({ coordinates: false });

		coordsElement = container.querySelector("qd-coords");
		expect(coordsElement?.classList.contains("hidden")).toBe(true);

		board.update({ coordinates: true });

		coordsElement = container.querySelector("qd-coords");
		expect(coordsElement?.classList.contains("hidden")).toBe(false);
	});

	it("select marks a square without disturbing piece element identity", () => {
		const board = createBoard(container, {
			position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		});

		const piecesBefore = Array.from(container.querySelectorAll("qd-piece"));
		board.select("e4");
		const piecesAfter = Array.from(container.querySelectorAll("qd-piece"));

		expect(piecesBefore.length).toBe(piecesAfter.length);
		piecesBefore.forEach((el, i) => {
			expect(el).toBe(piecesAfter[i]);
		});

		// Verify the selected square has the "active" class
		const e4Square = Array.from(container.querySelectorAll("qd-square")).find(
			(sq) => (sq as HTMLElement).dataset.square === "e4",
		);
		expect(e4Square?.classList.contains("active")).toBe(true);
	});
});
