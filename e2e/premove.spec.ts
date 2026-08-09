import { test, expect } from "./fixtures/test";

test.describe("premoves", () => {
	test.beforeEach(async ({ board }) => {
		await board.setMode("Premove");
	});

	test("a premove is queued rather than played, and drawn as an arrow", async ({ board }) => {
		await board.clickSquare("e2");
		await board.clickSquare("e4");

		await expect(board.readout("premoves")).toHaveText("e2e4");
		await expect(board.arrow("e2", "e4")).toBeVisible();
		await expect(board.arrow("e2", "e4")).toHaveAttribute("data-pen", "blue");
		// The board shows the projection: the pawn has visibly gone to e4.
		await expect(board.piece("e4")).toBeVisible();
		await expect(board.piece("e2")).toHaveCount(0);
	});

	test("premoves stack, each chosen against the projection of the last", async ({ board }) => {
		await board.drag("e2", "e4");
		await board.drag("e4", "e5");

		await expect(board.readout("premoves")).toHaveText("e2e4 e4e5");
		await expect(board.piece("e5")).toBeVisible();
		await expect(board.arrow("e2", "e4")).toBeVisible();
		await expect(board.arrow("e4", "e5")).toBeVisible();
	});

	test("a second piece can be premoved alongside the first", async ({ board }) => {
		await board.drag("e2", "e4");
		await board.drag("g1", "f3");

		await expect(board.readout("premoves")).toHaveText("e2e4 g1f3");
		await expect(board.piece("e4")).toBeVisible();
		await expect(board.piece("f3")).toBeVisible();
	});

	test("playing the queue applies it and leaves no premoves behind", async ({ board }) => {
		await board.drag("e2", "e4");
		await board.drag("g1", "f3");

		await board.press("Play queued premoves");

		await expect(board.readout("premoves")).toHaveText("—");
		await expect(board.marks()).toHaveCount(0);
		await expect(board.piece("e4")).toBeVisible();
		await expect(board.piece("f3")).toBeVisible();
		await expect(board.readout("placement")).toContainText("4P3");
	});

	test("discarding the queue puts the pieces back", async ({ board }) => {
		await board.drag("e2", "e4");
		await expect(board.piece("e4")).toBeVisible();

		await board.press("Discard queued premoves");

		await expect(board.readout("premoves")).toHaveText("—");
		await expect(board.piece("e2")).toBeVisible();
		await expect(board.piece("e4")).toHaveCount(0);
		await expect(board.readout("placement")).toHaveText(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
		);
	});

	test("the queue buttons are disabled while nothing is queued", async ({ board }) => {
		const play = board.page.getByRole("button", { name: "Play queued premoves" });
		await expect(play).toBeDisabled();

		await board.drag("e2", "e4");
		await expect(play).toBeEnabled();
	});

	test("leaving premove mode drops the queue", async ({ board }) => {
		await board.drag("e2", "e4");
		await expect(board.readout("premoves")).toHaveText("e2e4");

		await board.setMode("Free");
		await expect(board.readout("premoves")).toHaveText("—");
		await expect(board.piece("e2")).toBeVisible();
	});
});
