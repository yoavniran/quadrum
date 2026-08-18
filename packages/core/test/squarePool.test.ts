import { renderSquares, SQUARE_POOL_CAPACITY } from "../src/view/squaresView";
import { createNodePool } from "../src/view/nodePool";
import { defaultState, applyOptions } from "../src/options";
import type { Square } from "../src/types";

describe("renderSquares pooling", () => {
	function setup() {
		const board = document.createElement("qd-board");
		const els = new Map<Square, HTMLElement>();
		const pool = createNodePool<HTMLElement>(SQUARE_POOL_CAPACITY);
		return { board, els, pool };
	}

	function render(
		{ board, els, pool }: ReturnType<typeof setup>,
		deco: { targets?: readonly Square[]; selected?: Square | null; hover?: Square | null },
	) {
		renderSquares(
			board,
			els,
			applyOptions(defaultState(), { position: "8/8/8/8/8/8/4P3/8" }),
			{
				targets: deco.targets ?? [],
				selected: deco.selected ?? null,
				hover: deco.hover ?? null,
			},
			pool,
		);
	}

	it("recycles elements instead of creating new ones", () => {
		const ctx = setup();
		render(ctx, { selected: "e2" });
		const el = ctx.els.get("e2")!;

		render(ctx, { selected: "d4" });

		expect(ctx.els.get("d4")).toBe(el);
		expect(ctx.board.querySelectorAll("qd-square").length).toBe(1);
	});

	it("an idle element carries no data-square attribute", () => {
		const ctx = setup();
		render(ctx, { selected: "e2" });
		render(ctx, { targets: [], selected: null, hover: null });

		// The e2e suite asserts an undecorated square has zero matching elements.
		expect(ctx.board.querySelectorAll("qd-square[data-square]").length).toBe(0);
		expect(ctx.board.children.length).toBe(1);
		const parked = ctx.board.querySelector("qd-square") as HTMLElement;
		expect(parked.hidden).toBe(true);
		expect(parked.className).toBe("");
	});

	it("els holds only decorated squares", () => {
		const ctx = setup();
		render(ctx, { selected: "e2" });
		render(ctx, { targets: [], selected: null, hover: null });

		expect(ctx.els.size).toBe(0);
	});

	it("draws down the pool before creating new elements", () => {
		const ctx = setup();
		render(ctx, { targets: ["e2", "d4"] });
		render(ctx, { targets: [] });
		render(ctx, { targets: ["a1", "b2", "c3"] });

		expect(ctx.board.querySelectorAll("qd-square").length).toBe(3);
	});

	// A stale element is handed straight to a square that needs one. Routing it
	// through the pool instead would hide it, blank its class list and strip its
	// attribute, then immediately undo all three -- and every position update
	// moves the last-move highlight, so that churn was paid on the hottest path
	// in the library.
	it("hands a stale element to a fresh square without hiding it", () => {
		const ctx = setup();
		render(ctx, { selected: "e2" });
		const el = ctx.els.get("e2")!;

		const touched: string[] = [];
		const observer = new MutationObserver((records) => {
			for (const record of records) {
				if (record.attributeName) touched.push(record.attributeName);
			}
		});
		observer.observe(el, { attributes: true });

		render(ctx, { selected: "d4" });
		// Deliver synchronously — jsdom queues mutation records as microtasks.
		for (const record of observer.takeRecords()) {
			if (record.attributeName) touched.push(record.attributeName);
		}
		observer.disconnect();

		expect(ctx.els.get("d4")).toBe(el);
		expect(touched).not.toContain("hidden");
		// The class list is identical on both squares, so it must not be rewritten
		// either -- the blank-then-restore was two writes for no change.
		expect(touched).not.toContain("class");
		expect(el.className).toBe("active");
	});

	it("class lists land correctly after element recycle", () => {
		const ctx = setup();
		render(ctx, { selected: "e2" });
		const el = ctx.els.get("e2")!;

		render(ctx, { selected: null, targets: ["e2"] });

		expect(el.classList.contains("active")).toBe(false);
		expect(el.classList.contains("target")).toBe(true);
	});

	// The class map and the stale/fresh arrays are module-scoped scratch reused
	// across renders; the failure mode of a hoisted buffer is the first render's
	// decorations bleeding into the second.
	it("reused scratch state does not leak decorations across renders", () => {
		const ctx = setup();
		render(ctx, { selected: "e2", targets: ["e3", "e4"], hover: "e4" });

		expect(ctx.els.get("e2")!.className).toBe("active");
		expect(ctx.els.get("e3")!.className).toBe("target");
		expect(ctx.els.get("e4")!.className).toBe("target hover");

		render(ctx, { selected: "d4" });

		expect(ctx.els.size).toBe(1);
		expect(ctx.els.get("d4")!.className).toBe("active");
	});
});
