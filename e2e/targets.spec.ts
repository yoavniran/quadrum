import { test, expect } from "./fixtures/test";

test.describe("targeted moves", () => {
	test.beforeEach(async ({ board }) => {
		await board.setMode("Targeted");
	});

	test("selecting a piece shows only its supplied destinations", async ({ board }) => {
		await board.clickSquare("e2");

		// A pawn on its home square: one and two forward, plus the two diagonals
		// the premove table always offers.
		await expect(board.targets()).toHaveCount(4);
		await expect(board.square("e3")).toHaveClass(/target/);
		await expect(board.square("e4")).toHaveClass(/target/);
		await expect(board.square("d3")).toHaveClass(/target/);
		await expect(board.square("f3")).toHaveClass(/target/);
		await expect(board.square("e5")).toHaveCount(0);
	});

	test("a destination that was not offered is refused", async ({ board }) => {
		await board.clickSquare("e2");
		await board.clickSquare("e5");

		await expect(board.piece("e2")).toBeVisible();
		await expect(board.piece("e5")).toHaveCount(0);
		await expect(board.readout("move-count")).toHaveText("0");
	});

	test("an offered destination is played", async ({ board }) => {
		await board.clickSquare("b1");
		await expect(board.square("c3")).toHaveClass(/target/);

		await board.clickSquare("c3");
		await expect(board.piece("c3")).toBeVisible();
		await expect(board.readout("last-move")).toHaveText("b1c3");
	});

	test("a piece with no supplied targets cannot be picked up", async ({ board }) => {
		// Only white's moves are handed in, so a black piece has no entry at all.
		await board.clickSquare("e7");
		await expect(board.square("e7")).toHaveCount(0);
		await expect(board.targets()).toHaveCount(0);
	});

	test("a capturable destination is marked as a capture", async ({ board }) => {
		// Set the capture up in free mode, then come back to targeted.
		await board.setMode("Free");
		await board.drag("d7", "d3");
		await board.setMode("Targeted");

		await board.clickSquare("c2");
		await expect(board.square("d3")).toHaveClass(/capture/);

		await board.clickSquare("d3");
		expect(await board.pieceDescription("d3")).toContain("white");
	});

	test("dragging obeys the supplied targets too", async ({ board }) => {
		await board.drag("g1", "e5");
		await expect(board.piece("g1")).toBeVisible();
		await expect(board.piece("e5")).toHaveCount(0);

		await board.drag("g1", "f3");
		await expect(board.piece("f3")).toBeVisible();
	});
});
