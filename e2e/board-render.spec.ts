import { test, expect } from "./fixtures/test";

test.describe("board rendering", () => {
	test("draws the initial position with all 32 pieces", async ({ board }) => {
		await expect(board.pieces()).toHaveCount(32);
		expect(await board.pieceDescription("e1")).toContain("king");
		expect(await board.pieceDescription("e1")).toContain("white");
		expect(await board.pieceDescription("d8")).toContain("black");
		expect(await board.pieceDescription("d8")).toContain("queen");
	});

	test("shows rank and file coordinates", async ({ board }) => {
		const files = board.page.locator("qd-coords.files qd-coord");
		const ranks = board.page.locator("qd-coords.ranks qd-coord");
		await expect(files).toHaveCount(8);
		await expect(ranks).toHaveCount(8);
		await expect(files.first()).toHaveText("a");
		await expect(ranks.first()).toHaveText("8");
	});

	test("Clear empties the board and Reset restores it", async ({ board }) => {
		await board.press("Clear all pieces");
		await expect(board.pieces()).toHaveCount(0);

		await board.press("Reset to initial position");
		await expect(board.pieces()).toHaveCount(32);
		await expect(board.readout("placement")).toHaveText(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		);
	});

	test("square geometry matches what the board drew", async ({ board }) => {
		// a1 is bottom-left and h8 top-right on a white-facing board. If the
		// page object's arithmetic drifted from quadrum's, every other spec's
		// clicks would land on the wrong square, so pin it directly.
		const a1 = await board.squareCenter("a1");
		const h8 = await board.squareCenter("h8");
		expect(a1.x).toBeLessThan(h8.x);
		expect(a1.y).toBeGreaterThan(h8.y);
	});
});
