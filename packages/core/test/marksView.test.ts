import { renderMarks } from "../src/view/marksView";
import { buildDom } from "../src/view/layout";
import { defaultState, applyOptions } from "../src/options";
import type { BoardState } from "../src/options";

describe("renderMarks", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
	});

	function render(dom: ReturnType<typeof buildDom>, state: BoardState, current: any = null): void {
		renderMarks(dom, state, current);
	}

	it("with no marks, a second render touches no DOM", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });

		render(dom, state);

		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => {
			mutations.push(...records);
		});
		observer.observe(container, { childList: true, subtree: true, attributes: true });

		// Second render with no marks.
		render(dom, state);

		observer.disconnect();

		expect(mutations.length).toBe(0);
	});

	it("with marks disabled on a board that never drew, touches no DOM", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { marks: { enabled: false, auto: [], user: [] } });

		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => {
			mutations.push(...records);
		});
		observer.observe(container, { childList: true, subtree: true, attributes: true });

		render(dom, state);

		observer.disconnect();

		expect(mutations.length).toBe(0);
	});

	it("a board that drew and then goes empty still clears its layers", () => {
		const dom = buildDom(container);

		// First render with a mark.
		const stateWithMark = applyOptions(defaultState(), {
			marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
		});
		render(dom, stateWithMark);

		// Verify mark was rendered.
		expect(dom.marks.querySelectorAll("[data-mark]").length).toBeGreaterThan(0);

		// Second render with no marks.
		const stateEmpty = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });
		render(dom, stateEmpty);

		// Layers should be empty now.
		expect(dom.marks.querySelectorAll("[data-mark]").length).toBe(0);
		expect(dom.heads.childNodes.length).toBe(0);
		expect(dom.badges.childNodes.length).toBe(0);

		// defs should still be present but empty.
		const defs = dom.marks.querySelector("defs");
		expect(defs).not.toBeNull();
		expect(defs!.childNodes.length).toBe(0);
	});

	it("after clearing to empty, a further render touches nothing", () => {
		const dom = buildDom(container);

		// First render with a mark.
		const stateWithMark = applyOptions(defaultState(), {
			marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
		});
		render(dom, stateWithMark);

		// Second render with no marks.
		const stateEmpty = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });
		render(dom, stateEmpty);

		// Third render, also empty.
		const mutations: MutationRecord[] = [];
		const observer = new MutationObserver((records) => {
			mutations.push(...records);
		});
		observer.observe(container, { childList: true, subtree: true, attributes: true });

		render(dom, stateEmpty);

		observer.disconnect();

		expect(mutations.length).toBe(0);
	});

	it("a current mark on an otherwise empty board still draws", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });

		const currentMark = { from: "e2", to: "e4", pen: "green" };
		render(dom, state, currentMark);

		// Should have a mark rendered.
		expect(dom.marks.querySelectorAll("[data-mark]").length).toBeGreaterThan(0);
	});

	it("skips clearLayers outright when there is nothing to clear", () => {
		const dom = buildDom(container);
		const state = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });

		render(dom, state);

		// Clearing empty layers produces no mutation records, so a MutationObserver
		// cannot tell a skipped clear from a clear that found nothing. A sentinel
		// can: `clearLayers` would take it out, the early-out leaves it alone.
		const sentinel = document.createElementNS("http://www.w3.org/2000/svg", "g");
		dom.marks.appendChild(sentinel);
		dom.heads.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "g"));

		render(dom, state);

		expect(sentinel.parentNode).toBe(dom.marks);
		expect(dom.heads.childNodes.length).toBe(1);
	});

	it("two boards do not share the flag", () => {
		const container1 = document.createElement("div");
		const container2 = document.createElement("div");

		const dom1 = buildDom(container1);
		const dom2 = buildDom(container2);

		const state = applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } });

		// Render dom1 (no marks).
		render(dom1, state);

		// Render dom1 again (should touch nothing).
		let mutations = 0;
		const observer1 = new MutationObserver(() => {
			mutations++;
		});
		observer1.observe(container1, { childList: true, subtree: true, attributes: true });
		render(dom1, state);
		observer1.disconnect();
		expect(mutations).toBe(0);

		// Render dom2 with marks (first render, should draw).
		const stateWithMark = applyOptions(defaultState(), {
			marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
		});
		render(dom2, stateWithMark);

		// dom2 should have marks.
		expect(dom2.marks.querySelectorAll("[data-mark]").length).toBeGreaterThan(0);

		// dom1 should still have no marks.
		expect(dom1.marks.querySelectorAll("[data-mark]").length).toBe(0);
	});
});
