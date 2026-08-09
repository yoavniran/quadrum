import { test, expect } from "./fixtures/test";

/**
 * The Chess960 position puts the king on f1 with rooks on b1 and h1. Neither
 * rook is reachable by a king move, and the standard castling rule only fires
 * for a king on the e-file -- so b1 and h1 become destinations if and only if
 * the Chess960 toggle is on. That makes them the single variable.
 *
 * The assertions name those two squares rather than counting targets: the
 * premove table deliberately offers own-occupied squares (a premove bets the
 * opponent vacates them), so the king's total is dominated by its own men and
 * a count would be measuring the wrong thing.
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

	test("with the flag off neither rook is a destination", async ({ board }) => {
		await board.clickSquare("f1");
		await expect(board.targets()).not.toHaveCount(0);
		await expect(board.targetOn("b1")).toHaveCount(0);
		await expect(board.targetOn("h1")).toHaveCount(0);
	});

	test("with the flag on the king may take either of its own rooks", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("f1");

		await expect(board.targetOn("b1")).toHaveCount(1);
		await expect(board.targetOn("h1")).toHaveCount(1);
		// A castling target sits on a friendly piece — the board says so rather
		// than calling it a capture.
		await expect(board.square("h1")).toHaveClass(/friendly/);
	});

	test("toggling the flag back off withdraws the castling targets", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("f1");
		await expect(board.targetOn("h1")).toHaveCount(1);

		await board.setToggle("Chess960 castling", false);
		await board.clickSquare("f1");
		await expect(board.targetOn("h1")).toHaveCount(0);
	});

	test("the flag does not change what an ordinary piece may do", async ({ board }) => {
		await board.setToggle("Chess960 castling", true);
		await board.clickSquare("e2");
		await expect(board.square("e3")).toHaveClass(/target/);
		await expect(board.square("e4")).toHaveClass(/target/);
	});
});
