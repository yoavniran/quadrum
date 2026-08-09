import { test, expect } from "./fixtures/test";

/**
 * The Chess960 position puts the king on f1 with rooks on b1 and h1. Nothing
 * about that king is castleable under the standard rule -- that one only fires
 * on the e-file -- and every square around it is occupied by its own men. So
 * the Chess960 toggle is the single variable: off, the king has no destination
 * at all; on, it may take either of its own rooks.
 */
test.describe("chess960", () => {
	test.beforeEach(async ({ board }) => {
		await board.press("Load Chess960 position");
		await board.setMode("Targeted");
	});

	test("the position loads with the king off the e-file", async ({ board }) => {
		await expect(board.readout("placement")).toHaveText(
			"nrbbqknr/pppppppp/8/8/8/8/PPPPPPPP/NRBBQKNR",
		);
		expect(await board.pieceDescription("f1")).toContain("king");
		expect(await board.pieceDescription("b1")).toContain("rook");
		expect(await board.pieceDescription("h1")).toContain("rook");
	});

	test("with the flag off the king is boxed in", async ({ board }) => {
		await board.clickSquare("f1");
		await expect(board.targets()).toHaveCount(0);
	});

	test("with the flag on the king may take either of its own rooks", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("f1");

		await expect(board.targets()).toHaveCount(2);
		await expect(board.square("b1")).toHaveClass(/target/);
		await expect(board.square("h1")).toHaveClass(/target/);
		// A castling target sits on a friendly piece — the board says so rather
		// than calling it a capture.
		await expect(board.square("h1")).toHaveClass(/friendly/);
	});

	test("toggling the flag back off withdraws the castling targets", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("f1");
		await expect(board.targets()).toHaveCount(2);

		await board.setToggle("Chess960 castling", false);
		await board.clickSquare("f1");
		await expect(board.targets()).toHaveCount(0);
	});

	test("the flag does not change what an ordinary piece may do", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("e2");
		await expect(board.square("e3")).toHaveClass(/target/);
		await expect(board.square("e4")).toHaveClass(/target/);
	});
});
