import { expect, type Locator, type Page } from "@playwright/test";

export type Square = string;
export type Orientation = "white" | "black";

export interface DragOptions {
	/** Mouse button; right-drag is how a mark is drawn. */
	button?: "left" | "right";
	/** Held for the whole gesture — the pen colour is picked from these. */
	modifiers?: Array<"Shift" | "Control" | "Alt" | "Meta">;
	/** Intermediate mouse moves. More than one is what makes it a drag, not a click. */
	steps?: number;
}

const FILES = "abcdefgh";

/**
 * Drives the demo board the way a person does: real mouse presses, moves and
 * releases at real pixel coordinates, and real clicks on real controls. Nothing
 * here calls into quadrum or React — the only thing it reads out of the page is
 * geometry (where the board is) and rendered DOM (what the board drew).
 */
export class BoardPage {
	readonly board: Locator;
	readonly wrap: Locator;

	constructor(readonly page: Page) {
		this.board = page.locator("qd-board");
		this.wrap = page.locator(".qd-wrap");
	}

	async goto(): Promise<void> {
		await this.page.goto("/");
		await expect(this.board).toBeVisible();
	}

	// ---------------------------------------------------------------- geometry

	/** Which way the board is facing, read off the wrap quadrum stamps it on. */
	async orientation(): Promise<Orientation> {
		const value = await this.wrap.getAttribute("data-orientation");
		return value === "black" ? "black" : "white";
	}

	/**
	 * Pixel centre of a square. Mirrors quadrum's own squareToPoint: a white-facing
	 * board puts a1 bottom-left, a black-facing one puts it top-right.
	 */
	async squareCenter(square: Square): Promise<{ x: number; y: number }> {
		const box = await this.board.boundingBox();
		if (!box) throw new Error("board has no bounding box — is it visible?");

		const orientation = await this.orientation();
		const file = FILES.indexOf(square[0]!);
		const rank = Number(square[1]) - 1;
		if (file < 0 || rank < 0 || rank > 7) throw new Error(`not a square: ${square}`);

		const col = orientation === "white" ? file : 7 - file;
		const row = orientation === "white" ? 7 - rank : rank;
		const size = box.width / 8;

		return {
			x: box.x + col * size + size / 2,
			y: box.y + row * size + size / 2,
		};
	}

	/** A point comfortably outside the board, for drag-off-board gestures. */
	async offBoardPoint(): Promise<{ x: number; y: number }> {
		const box = await this.board.boundingBox();
		if (!box) throw new Error("board has no bounding box");
		return { x: box.x + box.width / 2, y: box.y + box.height + 60 };
	}

	// ------------------------------------------------------------- interaction

	async clickSquare(square: Square): Promise<void> {
		const point = await this.squareCenter(square);
		await this.page.mouse.click(point.x, point.y);
	}

	/**
	 * Press, move across the board in steps, release. The intermediate moves
	 * matter: quadrum only treats a gesture as a drag once it passes a 3px
	 * threshold, so a single jump-and-release would be classified as a click.
	 */
	async drag(from: Square, to: Square, options: DragOptions = {}): Promise<void> {
		const start = await this.squareCenter(from);
		const end = await this.squareCenter(to);
		await this.dragPoints(start, end, options);
	}

	async dragOffBoard(from: Square, options: DragOptions = {}): Promise<void> {
		const start = await this.squareCenter(from);
		const end = await this.offBoardPoint();
		await this.dragPoints(start, end, options);
	}

	private async dragPoints(
		start: { x: number; y: number },
		end: { x: number; y: number },
		{ button = "left", modifiers = [], steps = 8 }: DragOptions,
	): Promise<void> {
		const { mouse, keyboard } = this.page;

		for (const key of modifiers) await keyboard.down(key);
		try {
			await mouse.move(start.x, start.y);
			await mouse.down({ button });
			// Nudge clear of the drag threshold before the long move, so the
			// board has entered the dragging state by the time we travel.
			await mouse.move(start.x + 6, start.y + 6);
			await mouse.move(end.x, end.y, { steps });
			await mouse.up({ button });
		} finally {
			for (const key of modifiers.slice().reverse()) await keyboard.up(key);
		}
	}

	/**
	 * Draw a mark the way quadrum expects one: right-button drag from one square
	 * to another for an arrow, or a right-button click for a circle. Modifiers
	 * select the pen.
	 */
	async drawArrow(from: Square, to: Square, modifiers: DragOptions["modifiers"] = []): Promise<void> {
		await this.drag(from, to, { button: "right", modifiers });
	}

	async drawCircle(square: Square, modifiers: DragOptions["modifiers"] = []): Promise<void> {
		const point = await this.squareCenter(square);
		const { mouse, keyboard } = this.page;
		for (const key of modifiers) await keyboard.down(key);
		try {
			await mouse.move(point.x, point.y);
			await mouse.down({ button: "right" });
			await mouse.up({ button: "right" });
		} finally {
			for (const key of (modifiers ?? []).slice().reverse()) await keyboard.up(key);
		}
	}

	// ----------------------------------------------------------------- readers

	piece(square: Square): Locator {
		return this.page.locator(
			`qd-piece[data-square="${square}"]:not(.trace):not(.vanishing)`,
		);
	}

	/**
	 * All pieces currently on the board. Excludes the transient elements quadrum
	 * adds for gestures and animation: the one held under the cursor, the faded
	 * trace it leaves behind, and the clone that fades out over a capture.
	 */
	pieces(): Locator {
		return this.page.locator("qd-piece[data-square]:not(.held):not(.trace):not(.vanishing)");
	}

	square(square: Square): Locator {
		return this.page.locator(`qd-square[data-square="${square}"]`);
	}

	targets(): Locator {
		return this.page.locator("qd-square.target");
	}

	arrow(from: Square, to: Square): Locator {
		return this.page.locator(`[data-mark="arrow"][data-from="${from}"][data-to="${to}"]`);
	}

	circle(square: Square): Locator {
		return this.page.locator(`[data-mark="circle"][data-from="${square}"]`);
	}

	marks(): Locator {
		return this.page.locator("[data-mark]");
	}

	promotionPicker(): Locator {
		return this.page.locator("qd-promotion");
	}

	promotionChoice(role: string): Locator {
		return this.page.locator(`qd-promotion [data-role="${role}"]`);
	}

	readout(name: string): Locator {
		return this.page.getByTestId(name);
	}

	/** The colour+role a piece element carries, e.g. "white pawn". */
	async pieceDescription(square: Square): Promise<string> {
		const className = await this.piece(square).getAttribute("class");
		return (className ?? "").split(/\s+/).filter((c) => c && c !== "held").join(" ");
	}

	// ---------------------------------------------------------------- controls

	async setMode(mode: "Free" | "Targeted" | "Premove"): Promise<void> {
		await this.page.getByRole("radio", { name: `${mode} mode` }).check();
	}

	async setToggle(label: string, on: boolean): Promise<void> {
		const box = this.page.getByRole("checkbox", { name: label });
		if (on) {
			await box.check();
		} else {
			await box.uncheck();
		}
	}

	async press(label: string): Promise<void> {
		await this.page.getByRole("button", { name: label }).click();
	}
}
