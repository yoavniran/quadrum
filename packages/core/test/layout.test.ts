import { buildDom, renderCoords, destroyDom, applyWrapState } from "../src/view/layout";
import { defaultState, applyOptions } from "../src/options";
import type { BoardState } from "../src/options";

describe("lazy layers", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
	});

	it("buildDom creates only wrap and board, no optional layers", () => {
		const dom = buildDom(container);

		// Check that wrap and board exist
		expect(dom.wrap).toBe(container);
		expect(dom.board).toBeTruthy();
		expect(dom.board.parentNode).toBe(container);

		// Check that peeks return null (layers not created)
		expect(dom.marksOrNull).toBeNull();
		expect(dom.headsOrNull).toBeNull();
		expect(dom.badgesOrNull).toBeNull();
		expect(dom.ranksOrNull).toBeNull();
		expect(dom.filesOrNull).toBeNull();
		expect(dom.overlayOrNull).toBeNull();

		// Only board should be a child of wrap (2 elements: wrap and its innerHTML which is just board)
		const children = Array.from(container.children);
		expect(children.length).toBe(1);
		expect(children[0]).toBe(dom.board);
	});

	it("getters create layers on first access", () => {
		const dom = buildDom(container);

		// Access marks getter
		const marks = dom.marks;
		expect(marks).toBeTruthy();
		expect(marks.getAttribute("class")).toBe("qd-marks");
		expect(dom.marksOrNull).toBe(marks);

		// Access heads getter
		const heads = dom.heads;
		expect(heads).toBeTruthy();
		expect(heads.getAttribute("class")).toBe("qd-heads");
		expect(dom.headsOrNull).toBe(heads);
	});

	it("getters return same instance on repeated access", () => {
		const dom = buildDom(container);

		const marks1 = dom.marks;
		const marks2 = dom.marks;
		expect(marks1).toBe(marks2);

		const heads1 = dom.heads;
		const heads2 = dom.heads;
		expect(heads1).toBe(heads2);
	});

	it("marks layer is created with defs child", () => {
		const dom = buildDom(container);

		const marks = dom.marks;
		const defs = marks.querySelector("defs");
		expect(defs).toBeTruthy();
	});

	it("layers are inserted in correct z-order regardless of creation order", () => {
		const dom = buildDom(container);

		// Access overlay first (last in slot order)
		const overlay = dom.overlay;
		expect(container.children[1]).toBe(overlay);

		// Then access marks (first in layer slot order)
		const marks = dom.marks;
		expect(container.children[1]).toBe(marks);
		expect(container.children[2]).toBe(overlay);

		// Then access heads (between marks and badges)
		const heads = dom.heads;
		expect(container.children[1]).toBe(marks);
		expect(container.children[2]).toBe(heads);
		expect(container.children[3]).toBe(overlay);
	});

	it("bare board with coordinates false and locked has minimal elements", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		const state = applyOptions(defaultState(), {
			coordinates: false,
			locked: true,
			marks: { auto: [], user: [] },
		});

		applyWrapState(dom, state);
		renderCoords(dom, state);

		// Should have wrap, board, and no layers created
		const children = Array.from(dom.wrap.children);
		expect(children.length).toBe(1); // Only board
		expect(children[0]).toBe(dom.board);
		expect(dom.marksOrNull).toBeNull();
		expect(dom.headsOrNull).toBeNull();
		expect(dom.badgesOrNull).toBeNull();
		expect(dom.ranksOrNull).toBeNull();
		expect(dom.filesOrNull).toBeNull();
		expect(dom.overlayOrNull).toBeNull();
	});

	it("enabling coordinates creates ranks and files layers", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		const state = applyOptions(defaultState(), {
			coordinates: true,
		});

		renderCoords(dom, state);

		expect(dom.ranksOrNull).toBeTruthy();
		expect(dom.filesOrNull).toBeTruthy();
		expect(dom.ranksOrNull?.getAttribute("class")).toBe("ranks");
		expect(dom.filesOrNull?.getAttribute("class")).toBe("files");
	});

	it("disabling coordinates on fresh board does not create layers", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		const state = applyOptions(defaultState(), {
			coordinates: false,
		});

		renderCoords(dom, state);

		// Layers should not be created
		expect(dom.ranksOrNull).toBeNull();
		expect(dom.filesOrNull).toBeNull();
	});

	it("destroyDom does not create layers and handles boards that created nothing", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		// Don't access any getters, so nothing is created
		expect(() => {
			destroyDom(dom);
		}).not.toThrow();

		// Wrap should be cleaned up
		expect(dom.wrap.className).not.toContain("qd-wrap");
		expect(dom.wrap.dataset.orientation).toBeUndefined();
	});

	it("locked board does not create overlay in applyWrapState", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		const state = applyOptions(defaultState(), { locked: true });

		applyWrapState(dom, state);

		expect(dom.overlayOrNull).toBeNull();
		expect(dom.wrap.classList.contains("interactive")).toBe(false);
	});

	it("interactive board creates overlay in applyWrapState", () => {
		const container = document.createElement("div");
		const dom = buildDom(container);

		const state = applyOptions(defaultState(), { locked: false });

		applyWrapState(dom, state);

		expect(dom.overlayOrNull).toBeTruthy();
		expect(dom.wrap.classList.contains("interactive")).toBe(true);
	});

	it("minimal bare board has ≤42 elements total", () => {
		const container = document.createElement("div");
		buildDom(container);

		// Count all elements in the container tree
		function countAllElements(el: Element): number {
			let count = 1; // Count the element itself
			for (const child of el.children) {
				count += countAllElements(child);
			}
			return count;
		}

		const elementCount = countAllElements(container);
		// Bare board should have: wrap (the container) + board = 2 elements minimum
		// With lazy loading, no marks, heads, badges, ranks, files, or overlay should be created
		expect(elementCount).toBeLessThanOrEqual(42);
		expect(elementCount).toBe(2); // wrap (container) + board
	});
});

describe("renderCoords", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
	});

	function render(dom: ReturnType<typeof buildDom>, state: BoardState): void {
		renderCoords(dom, state);
	}

	it("renders twice with same state leaves coord elements as same objects", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { coordinates: true });

		render(dom, state);
		const firstRankCoords = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const firstFileCoords = Array.from(dom.files.querySelectorAll("qd-coord"));

		render(dom, state);
		const secondRankCoords = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const secondFileCoords = Array.from(dom.files.querySelectorAll("qd-coord"));

		// Elements should be identical objects
		expect(firstRankCoords.length).toBe(8);
		expect(firstFileCoords.length).toBe(8);
		for (let i = 0; i < 8; i++) {
			expect(secondRankCoords[i]).toBe(firstRankCoords[i]);
			expect(secondFileCoords[i]).toBe(firstFileCoords[i]);
		}
	});

	it("keeps class lists untouched when state is unchanged", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { coordinates: true });

		render(dom, state);
		dom.ranks.classList.add("custom-class");
		dom.files.classList.add("custom-class");
		const ranksClassBefore = dom.ranks.className;
		const filesClassBefore = dom.files.className;

		render(dom, state);
		expect(dom.ranks.className).toBe(ranksClassBefore);
		expect(dom.files.className).toBe(filesClassBefore);
	});

	it("rebuilds labels when orientation flips", () => {
		const dom = buildDom(container);
		const whiteState = applyOptions(defaultState(), { orientation: "white", coordinates: true });

		render(dom, whiteState);
		// Both label sets have to be read before the flip: the flip replaces the
		// elements, so a query afterwards returns the black labels either way.
		const whiteRankCoords = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const whiteFileCoords = Array.from(dom.files.querySelectorAll("qd-coord"));
		expect(whiteRankCoords[0]!.textContent).toBe("8");
		expect(whiteFileCoords[0]!.textContent).toBe("a");

		const blackState = applyOptions(defaultState(), { orientation: "black", coordinates: true });
		render(dom, blackState);
		const blackRankCoords = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const blackFileCoords = Array.from(dom.files.querySelectorAll("qd-coord"));

		expect(blackRankCoords[0]!.textContent).toBe("1");
		expect(blackFileCoords[0]!.textContent).toBe("h");

		// Elements should be different objects after rebuild
		expect(blackRankCoords[0]).not.toBe(whiteRankCoords[0]);
	});

	it("toggles hidden class without rebuilding when coordinates changes to false", () => {
		const dom = buildDom(container);
		const stateOn = applyOptions(defaultState(), { coordinates: true });

		render(dom, stateOn);
		const ranksCoordsBefore = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsBefore = Array.from(dom.files.querySelectorAll("qd-coord"));

		expect(dom.ranks.classList.contains("hidden")).toBe(false);
		expect(dom.files.classList.contains("hidden")).toBe(false);

		const stateOff = applyOptions(defaultState(), { coordinates: false });
		render(dom, stateOff);

		const ranksCoordsAfter = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsAfter = Array.from(dom.files.querySelectorAll("qd-coord"));

		// Elements should be identical (no rebuild)
		expect(ranksCoordsAfter.length).toBe(8);
		expect(filesCoordsAfter.length).toBe(8);
		for (let i = 0; i < 8; i++) {
			expect(ranksCoordsAfter[i]).toBe(ranksCoordsBefore[i]);
			expect(filesCoordsAfter[i]).toBe(filesCoordsBefore[i]);
		}

		// Hidden class should be added
		expect(dom.ranks.classList.contains("hidden")).toBe(true);
		expect(dom.files.classList.contains("hidden")).toBe(true);
	});

	it("toggles back removes hidden class without rebuilding", () => {
		const dom = buildDom(container);
		// Start with coordinates enabled to create the layers
		const stateOn = applyOptions(defaultState(), { coordinates: true });

		render(dom, stateOn);
		const ranksCoordsBefore = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsBefore = Array.from(dom.files.querySelectorAll("qd-coord"));

		expect(dom.ranks.classList.contains("hidden")).toBe(false);

		// Then disable coordinates -- hidden class added, elements unchanged
		const stateOff = applyOptions(defaultState(), { coordinates: false });
		render(dom, stateOff);

		const ranksCoordsOffended = Array.from(dom.ranksOrNull!.querySelectorAll("qd-coord"));
		const filesCoordsOffended = Array.from(dom.filesOrNull!.querySelectorAll("qd-coord"));

		for (let i = 0; i < 8; i++) {
			expect(ranksCoordsOffended[i]).toBe(ranksCoordsBefore[i]);
			expect(filesCoordsOffended[i]).toBe(filesCoordsBefore[i]);
		}

		expect(dom.ranksOrNull!.classList.contains("hidden")).toBe(true);
		expect(dom.filesOrNull!.classList.contains("hidden")).toBe(true);

		// Re-enable coordinates -- hidden class removed, elements still unchanged
		render(dom, stateOn);

		const ranksCoordsAfter = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsAfter = Array.from(dom.files.querySelectorAll("qd-coord"));

		for (let i = 0; i < 8; i++) {
			expect(ranksCoordsAfter[i]).toBe(ranksCoordsBefore[i]);
			expect(filesCoordsAfter[i]).toBe(filesCoordsBefore[i]);
		}

		// Hidden class should be removed
		expect(dom.ranks.classList.contains("hidden")).toBe(false);
		expect(dom.files.classList.contains("hidden")).toBe(false);
	});

	it("does not create coord containers when orientation flips with coordinates off", () => {
		const dom = buildDom(container);

		render(dom, applyOptions(defaultState(), { orientation: "white", coordinates: false }));
		// A memo keyed on the requested orientation would treat this flip as a
		// rebuild and conjure both containers on a board that shows no labels --
		// exactly the mount cost this pass exists to remove.
		render(dom, applyOptions(defaultState(), { orientation: "black", coordinates: false }));

		expect(dom.ranksOrNull).toBeNull();
		expect(dom.filesOrNull).toBeNull();
	});

	it("builds labels for the current orientation when coordinates are switched on late", () => {
		const dom = buildDom(container);

		render(dom, applyOptions(defaultState(), { orientation: "white", coordinates: false }));
		render(dom, applyOptions(defaultState(), { orientation: "black", coordinates: false }));
		// The flip above built nothing, so the memo still owes its labels. If it
		// had recorded "black" as built, this render would early-out and the
		// board would come up with no labels at all.
		render(dom, applyOptions(defaultState(), { orientation: "black", coordinates: true }));

		const ranks = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		expect(ranks.length).toBe(8);
		expect(ranks[0]!.textContent).toBe("1");
		expect(dom.ranks.classList.contains("hidden")).toBe(false);
	});

	it("gives a rebuilt board its own layers", () => {
		const first = buildDom(container);
		const firstMarks = first.marks;

		// buildDom wipes the container, so any slot table shared by container
		// would hand the second board the first one's now-detached layers.
		const second = buildDom(container);
		expect(second.marksOrNull).toBeNull();
		expect(second.marks).not.toBe(firstMarks);
		expect(second.marks.parentNode).toBe(container);
	});

	it("does not share memo between different boards", () => {
		const container1 = document.createElement("div");
		const container2 = document.createElement("div");

		const dom1 = buildDom(container1);
		const dom2 = buildDom(container2);

		const state = applyOptions(defaultState(), { coordinates: true });

		// Render dom1
		render(dom1, state);
		const dom1RankCoords = Array.from(dom1.ranks.querySelectorAll("qd-coord"));

		// Render dom2 -- should rebuild, not reuse dom1's memo
		render(dom2, state);
		const dom2RankCoords = Array.from(dom2.ranks.querySelectorAll("qd-coord"));

		// Should have 8 coords on dom2
		expect(dom2RankCoords.length).toBe(8);
		// Elements should be different
		expect(dom2RankCoords[0]).not.toBe(dom1RankCoords[0]);
	});
});
