import { test as base } from "@playwright/test";
import { BoardPage } from "./boardPage";

/** Every spec starts on a loaded demo page with the board already visible. */
export const test = base.extend<{ board: BoardPage }>({
	board: async ({ page }, use) => {
		const board = new BoardPage(page);
		await board.goto();
		await use(board);
	},
});

export { expect } from "@playwright/test";
