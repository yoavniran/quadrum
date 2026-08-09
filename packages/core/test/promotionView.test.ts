import { createBoard } from "../src/board";
import { renderPromotion } from "../src/view/promotionView";
import { buildDom } from "../src/view/layout";
import type { Role } from "../src/types";

describe("promotion picker", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	function picker(): HTMLElement | null {
		return container.querySelector("qd-promotion");
	}

	it("puts the backdrop behind the cells, not over them", () => {
		const dom = buildDom(container);
		renderPromotion(dom, { from: "e7", to: "e8", color: "white" }, "white", () => {});

		const children = Array.from(picker()!.children) as HTMLElement[];
		expect(children[0]!.dataset.backdrop).toBe("");
		expect(children.slice(1).every((el) => el.dataset.role !== undefined)).toBe(true);
	});

	it("leaves an unchanged picker alone instead of rebuilding it", () => {
		const dom = buildDom(container);
		const req = { from: "e7", to: "e8", color: "white" } as const;

		renderPromotion(dom, req, "white", () => {});
		const first = picker();

		// Every board render calls through here — a rebuild would swap the cell
		// out from under a pointer mid-click and make the picker unusable.
		renderPromotion(dom, { ...req }, "white", () => {});
		expect(picker()).toBe(first);

		// A different request does rebuild.
		renderPromotion(dom, { from: "d7", to: "d8", color: "white" }, "white", () => {});
		expect(picker()).not.toBe(first);
	});

	it("swallows pointer events so the board underneath never sees them", () => {
		const dom = buildDom(container);
		const seen: string[] = [];
		for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup"]) {
			dom.wrap.addEventListener(type, () => seen.push(type));
		}

		renderPromotion(dom, { from: "e7", to: "e8", color: "white" }, "white", () => {});
		const cell = picker()!.querySelector("[data-role='knight']") as HTMLElement;

		for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup"]) {
			cell.dispatchEvent(new Event(type, { bubbles: true }));
		}

		expect(seen).toEqual([]);
	});

	it("picking a role reports it once", () => {
		const dom = buildDom(container);
		const picked: Array<Role | null> = [];
		renderPromotion(dom, { from: "e7", to: "e8", color: "white" }, "white", (role) =>
			picked.push(role),
		);

		(picker()!.querySelector("[data-role='rook']") as HTMLElement).click();
		expect(picked).toEqual(["rook"]);
	});

	it("does not throw when the origin square emptied while the picker was open", () => {
		const board = createBoard(container, {
			position: "8/4P3/8/8/8/8/8/8",
			moves: { free: true },
			promotion: { enabled: true },
			animate: { enabled: false },
		});

		board.play("e7", "e8");
		expect(picker()).not.toBeNull();

		// Something else moved the pawn — a server reply, an undo, a new position.
		board.update({ position: "8/8/8/8/8/8/8/8", animate: { enabled: false } });

		expect(() => {
			(picker()!.querySelector("[data-role='queen']") as HTMLElement).click();
		}).not.toThrow();
		expect(board.state().pieces.get("e8")).toBeUndefined();
	});
});
