import { test, expect } from "./fixtures/test";

test.describe("orientation", () => {
	test("Flip turns the board and reverses the coordinates", async ({ board }) => {
		const files = board.page.locator("qd-coords.files qd-coord");
		const ranks = board.page.locator("qd-coords.ranks qd-coord");
		await expect(files.first()).toHaveText("a");
		await expect(ranks.first()).toHaveText("8");

		await board.press("Flip board");

		await expect(board.wrap).toHaveAttribute("data-orientation", "black");
		await expect(files.first()).toHaveText("h");
		await expect(ranks.first()).toHaveText("1");
	});

	test("a piece is drawn on the opposite side after flipping", async ({ board }) => {
		const beforeBox = await board.piece("a1").boundingBox();
		await board.press("Flip board");
		await expect(board.wrap).toHaveAttribute("data-orientation", "black");

		await expect(async () => {
			const afterBox = await board.piece("a1").boundingBox();
			expect(afterBox!.x).toBeGreaterThan(beforeBox!.x);
			expect(afterBox!.y).toBeLessThan(beforeBox!.y);
		}).toPass();
	});

	test("moves still land on the intended square when the board is flipped", async ({ board }) => {
		await board.press("Flip board");
		await expect(board.wrap).toHaveAttribute("data-orientation", "black");

		// squareCenter re-reads the orientation, so this is e7→e5 in board terms
		// even though the pixels are mirrored.
		await board.drag("e7", "e5");
		await expect(board.piece("e5")).toBeVisible();
		await expect(board.piece("e7")).toHaveCount(0);
		await expect(board.readout("last-move")).toHaveText("e7e5");
	});
});
