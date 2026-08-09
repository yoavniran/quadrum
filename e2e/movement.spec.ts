import { test, expect } from "./fixtures/test";

test.describe("movement (free mode)", () => {
	test("click a piece then click a destination moves it", async ({ board }) => {
		await board.clickSquare("e2");
		await expect(board.square("e2")).toHaveClass(/active/);

		await board.clickSquare("e4");
		await expect(board.piece("e4")).toBeVisible();
		await expect(board.piece("e2")).toHaveCount(0);
		await expect(board.readout("last-move")).toHaveText("e2e4");
	});

	test("dragging a piece moves it", async ({ board }) => {
		await board.drag("g1", "f3");
		await expect(board.piece("f3")).toBeVisible();
		await expect(board.piece("g1")).toHaveCount(0);
		expect(await board.pieceDescription("f3")).toContain("knight");
	});

	test("clicking the same piece twice deselects and moves nothing", async ({ board }) => {
		await board.clickSquare("d2");
		await expect(board.square("d2")).toHaveClass(/active/);

		await board.clickSquare("d2");
		await expect(board.square("d2")).toHaveCount(0);
		await expect(board.piece("d2")).toBeVisible();
		await expect(board.readout("move-count")).toHaveText("0");
	});

	test("moving onto an occupied square captures", async ({ board }) => {
		await board.drag("d1", "d7");
		await expect(board.pieces()).toHaveCount(31);
		expect(await board.pieceDescription("d7")).toContain("queen");
	});

	test("a dragged piece stays put when dropped off the board", async ({ board }) => {
		await board.dragOffBoard("b1");
		await expect(board.piece("b1")).toBeVisible();
		await expect(board.pieces()).toHaveCount(32);
	});

	test("with remove-off-board on, dragging a piece off deletes it", async ({ board }) => {
		await board.setToggle("Remove piece dragged off board", true);
		await board.dragOffBoard("b1");
		await expect(board.piece("b1")).toHaveCount(0);
		await expect(board.pieces()).toHaveCount(31);
	});

	test("a locked board refuses every move", async ({ board }) => {
		await board.setToggle("Lock board", true);

		await board.clickSquare("e2");
		await expect(board.square("e2")).toHaveCount(0);

		await board.clickSquare("e4");
		await board.drag("g1", "f3");

		await expect(board.piece("e2")).toBeVisible();
		await expect(board.piece("g1")).toBeVisible();
		await expect(board.readout("move-count")).toHaveText("0");
	});

	test("with dragging disabled a drag does nothing but clicking still works", async ({ board }) => {
		await board.setToggle("Enable dragging", false);

		await board.drag("e2", "e4");
		await expect(board.piece("e2")).toBeVisible();
		await expect(board.piece("e4")).toHaveCount(0);

		// The press half of that drag left e2 selected, so one click completes it.
		await board.clickSquare("e4");
		await expect(board.piece("e4")).toBeVisible();
	});

	test("the last move is highlighted on both squares", async ({ board }) => {
		await board.clickSquare("e2");
		await board.clickSquare("e4");
		await expect(board.square("e2")).toHaveClass(/recent/);
		await expect(board.square("e4")).toHaveClass(/recent/);
	});
});
