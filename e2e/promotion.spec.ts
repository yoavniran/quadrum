import { test, expect } from "./fixtures/test";

test.describe("promotion", () => {
	test.beforeEach(async ({ board }) => {
		await board.press("Load promotion position");
		await board.setToggle("Enable promotion picker", true);
	});

	test("a pawn reaching the last rank opens the picker instead of moving", async ({ board }) => {
		await board.drag("e7", "e8");

		await expect(board.promotionPicker()).toBeVisible();
		await expect(board.promotionChoice("queen")).toBeVisible();
		await expect(board.promotionChoice("knight")).toBeVisible();
		// The move is held, not played: the pawn has not left e7 yet.
		await expect(board.piece("e8")).toHaveCount(0);
		await expect(board.readout("move-count")).toHaveText("0");
	});

	test("picking a piece completes the move with that piece", async ({ board }) => {
		await board.drag("e7", "e8");
		await board.promotionChoice("knight").click();

		await expect(board.promotionPicker()).toHaveCount(0);
		expect(await board.pieceDescription("e8")).toContain("knight");
		await expect(board.piece("e7")).toHaveCount(0);
		await expect(board.readout("last-promotion")).toHaveText("e7e8=knight");
	});

	test("picking the queen is the ordinary case", async ({ board }) => {
		await board.clickSquare("e7");
		await board.clickSquare("e8");
		await board.promotionChoice("queen").click();

		expect(await board.pieceDescription("e8")).toContain("queen");
		await expect(board.readout("last-promotion")).toHaveText("e7e8=queen");
	});

	test("clicking the backdrop cancels and leaves the pawn where it was", async ({ board }) => {
		await board.drag("e7", "e8");
		await expect(board.promotionPicker()).toBeVisible();

		// a1 is far from the picker column, so this lands on the backdrop.
		const away = await board.squareCenter("a1");
		await board.page.mouse.click(away.x, away.y);

		await expect(board.promotionPicker()).toHaveCount(0);
		expect(await board.pieceDescription("e7")).toContain("pawn");
		await expect(board.piece("e8")).toHaveCount(0);
		await expect(board.readout("last-promotion")).toHaveText("—");
	});

	test("a black pawn promotes on the first rank", async ({ board }) => {
		await board.drag("e2", "e1");
		await expect(board.promotionPicker()).toBeVisible();

		await board.promotionChoice("rook").click();
		expect(await board.pieceDescription("e1")).toContain("black");
		expect(await board.pieceDescription("e1")).toContain("rook");
	});

	test("with the picker disabled the pawn just moves", async ({ board }) => {
		await board.setToggle("Enable promotion picker", false);
		await board.drag("e7", "e8");

		await expect(board.promotionPicker()).toHaveCount(0);
		expect(await board.pieceDescription("e8")).toContain("pawn");
	});
});
