import { test, expect } from "./fixtures/test";

test.describe("arrows and circles", () => {
	test("right-drag draws an arrow between two squares", async ({ board }) => {
		await board.drawArrow("e2", "e4");
		await expect(board.arrow("e2", "e4")).toBeVisible();
		await expect(board.readout("marks")).toHaveText("e2e4:green");
	});

	test("right-click draws a circle on a square", async ({ board }) => {
		await board.drawCircle("d4");
		await expect(board.circle("d4")).toBeVisible();
		await expect(board.readout("marks")).toHaveText("d4:green");
	});

	test("drawing the same mark again removes it", async ({ board }) => {
		await board.drawCircle("d4");
		await expect(board.circle("d4")).toBeVisible();

		await board.drawCircle("d4");
		await expect(board.circle("d4")).toHaveCount(0);
		await expect(board.readout("marks")).toHaveText("—");
	});

	test("arrows and circles accumulate independently", async ({ board }) => {
		await board.drawArrow("g1", "f3");
		await board.drawCircle("e5");
		await board.drawArrow("b1", "c3");
		await expect(board.marks()).toHaveCount(3);
		await expect(board.arrow("g1", "f3")).toBeVisible();
		await expect(board.arrow("b1", "c3")).toBeVisible();
		await expect(board.circle("e5")).toBeVisible();
	});

	test("modifiers pick the pen colour", async ({ board }) => {
		await board.drawArrow("a1", "a4");
		await board.drawArrow("b1", "b4", ["Shift"]);
		await board.drawArrow("c1", "c4", ["Alt"]);
		await board.drawArrow("d1", "d4", ["Shift", "Alt"]);

		await expect(board.arrow("a1", "a4")).toHaveAttribute("data-pen", "green");
		await expect(board.arrow("b1", "b4")).toHaveAttribute("data-pen", "red");
		await expect(board.arrow("c1", "c4")).toHaveAttribute("data-pen", "blue");
		await expect(board.arrow("d1", "d4")).toHaveAttribute("data-pen", "yellow");
	});

	test("redrawing a mark with a different pen recolours it", async ({ board }) => {
		await board.drawCircle("h4");
		await expect(board.circle("h4")).toHaveAttribute("data-pen", "green");

		await board.drawCircle("h4", ["Shift"]);
		await expect(board.circle("h4")).toHaveCount(1);
		await expect(board.circle("h4")).toHaveAttribute("data-pen", "red");
	});

	test("shift + left-drag also draws, instead of moving a piece", async ({ board }) => {
		await board.drag("e2", "e4", { button: "left", modifiers: ["Shift"] });
		await expect(board.arrow("e2", "e4")).toBeVisible();
		await expect(board.piece("e2")).toBeVisible();
		await expect(board.readout("move-count")).toHaveText("0");
	});

	test("Clear marks removes every mark", async ({ board }) => {
		await board.drawArrow("e2", "e4");
		await board.drawCircle("d5");
		await expect(board.marks()).toHaveCount(2);

		await board.press("Clear all marks");
		await expect(board.marks()).toHaveCount(0);
	});

	test("turning marks off hides them and refuses new ones", async ({ board }) => {
		await board.drawCircle("d4");
		await expect(board.marks()).toHaveCount(1);

		await board.setToggle("Enable marks", false);
		await expect(board.marks()).toHaveCount(0);

		await board.drawCircle("e4");
		await expect(board.marks()).toHaveCount(0);
	});

	test("a move clears marks by default, and keeps them when asked", async ({ board }) => {
		await board.drawCircle("d4");
		await board.clickSquare("e2");
		await board.clickSquare("e3");
		await expect(board.marks()).toHaveCount(0);

		await board.setToggle("Keep marks when position changes", true);
		await board.drawCircle("d5");
		await board.clickSquare("g1");
		await board.clickSquare("f3");
		await expect(board.circle("d5")).toBeVisible();
	});
});
