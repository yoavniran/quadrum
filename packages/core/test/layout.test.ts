import { buildDom, renderCoords } from "../src/view/layout";
import { defaultState, applyOptions } from "../src/options";
import type { BoardState } from "../src/options";

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
		const stateOff = applyOptions(defaultState(), { coordinates: false });

		render(dom, stateOff);
		const ranksCoordsBefore = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsBefore = Array.from(dom.files.querySelectorAll("qd-coord"));

		expect(dom.ranks.classList.contains("hidden")).toBe(true);

		const stateOn = applyOptions(defaultState(), { coordinates: true });
		render(dom, stateOn);

		const ranksCoordsAfter = Array.from(dom.ranks.querySelectorAll("qd-coord"));
		const filesCoordsAfter = Array.from(dom.files.querySelectorAll("qd-coord"));

		// Elements should be identical
		for (let i = 0; i < 8; i++) {
			expect(ranksCoordsAfter[i]).toBe(ranksCoordsBefore[i]);
			expect(filesCoordsAfter[i]).toBe(filesCoordsBefore[i]);
		}

		// Hidden class should be removed
		expect(dom.ranks.classList.contains("hidden")).toBe(false);
		expect(dom.files.classList.contains("hidden")).toBe(false);
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
