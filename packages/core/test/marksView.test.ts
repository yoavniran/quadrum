import { renderMarks } from "../src/view/marksView";
import { GRADIENT_POOL_CAPACITY } from "../src/view/markGradients";
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

		// Nothing is drawn any more. The shed nodes stay parked in their layer rather
		// than being detached -- that is what makes the next render free -- so what has
		// to hold is that nothing is findable and nothing paints, not that the layers
		// are empty.
		for (const layer of [dom.marks, dom.heads, dom.badges]) {
			expect(layer.querySelectorAll("[data-mark], [data-mark-part]").length).toBe(0);
			for (const parked of Array.from(layer.children)) {
				if (parked.tagName !== "defs") {
					expect(parked.getAttribute("display")).toBe("none");
				}
			}
		}

		// defs survives, holding no more than the parked gradients.
		const defs = dom.marks.querySelector("defs");
		expect(defs).not.toBeNull();
		expect(defs!.childElementCount).toBeLessThanOrEqual(GRADIENT_POOL_CAPACITY);
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

	describe("UNIT-004: gradient cache", () => {
		it("rendering the same translucent arrow twice yields the same gradient element", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});

			// First render.
			render(dom, state);
			const firstGradient = dom.marks.querySelector("defs linearGradient");
			expect(firstGradient).not.toBeNull();

			// Second render with same mark.
			render(dom, state);
			const secondGradient = dom.marks.querySelector("defs linearGradient");

			// Must be the same element object.
			expect(secondGradient).toBe(firstGradient);
		});

		it("the shaft polygon's fill attribute is byte-identical across two renders", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});

			// First render.
			render(dom, state);
			const firstShaft = dom.marks.querySelector("polygon[data-mark='arrow'][data-mark-part='shaft']");
			const firstFill = firstShaft?.getAttribute("fill");

			// Second render.
			render(dom, state);
			const secondShaft = dom.marks.querySelector("polygon[data-mark='arrow'][data-mark-part='shaft']");
			const secondFill = secondShaft?.getAttribute("fill");

			expect(firstFill).toBe(secondFill);
		});

		it("<defs> child count is constant across 100 renders of the same mark set", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});

			// First render to establish baseline.
			render(dom, state);
			const defs = dom.marks.querySelector("defs");
			const initialCount = defs?.childNodes.length ?? 0;

			// Render 100 more times.
			for (let i = 0; i < 100; i++) {
				render(dom, state);
			}

			const finalCount = defs?.childNodes.length ?? 0;
			expect(finalCount).toBe(initialCount);
		});

		it("moving an arrow repeatedly recycles gradients instead of minting them", () => {
			const dom = buildDom(container);
			const defs = dom.marks.querySelector("defs")!;

			const state1 = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});
			render(dom, state1);

			const minted = Array.from(defs.querySelectorAll("linearGradient"));
			expect(minted.length).toBe(1);

			// Moving the arrow retires one mark key and creates another, but the shed
			// shaft is handed straight to the new mark rather than parked and
			// re-acquired. The shaft therefore keeps its identity across the move, and
			// gradients are owned by their shaft, so the very same element is
			// re-pointed at the new segment. No second element is ever minted, however
			// many times the arrow moves.
			for (const to of ["e5", "e6", "e7", "e8", "e5", "e3"] as const) {
				const next = applyOptions(defaultState(), {
					marks: { enabled: true, auto: [{ from: "e2", to, pen: "red" }], user: [] },
				});
				render(dom, next);

				const settled = Array.from(defs.querySelectorAll("linearGradient"));
				expect(settled.length).toBe(1);
				expect(settled[0]).toBe(minted[0]);
			}
		});

		it("an axis-aligned arrow gets a gradient in user space along its own axis", () => {
			const dom = buildDom(container);
			const defs = dom.marks.querySelector("defs")!;

			// Along a file and along a rank: under the SVG default `objectBoundingBox`
			// these have a degenerate zero-width or zero-height box and the fade would
			// silently not render at all, which is why the units are pinned.
			const cases = [
				{ from: "e2", to: "e7", axis: "file" },
				{ from: "b4", to: "g4", axis: "rank" },
			] as const;

			for (const { from, to, axis } of cases) {
				render(
					dom,
					applyOptions(defaultState(), {
						marks: { enabled: true, auto: [{ from, to, pen: "red" }], user: [] },
					}),
				);

				const shaft = dom.marks.querySelector(`polygon[data-from="${from}"][data-to="${to}"]`)!;
				const fill = shaft.getAttribute("fill")!;
				expect(fill).toMatch(/^url\(#qd-fade-/);

				const gradient = defs.querySelector(`#${fill.slice(5, -1)}`)!;
				expect(gradient.getAttribute("gradientUnits")).toBe("userSpaceOnUse");
				expect(gradient.hasAttribute("gradientTransform")).toBe(false);

				const x1 = Number(gradient.getAttribute("x1"));
				const y1 = Number(gradient.getAttribute("y1"));
				const x2 = Number(gradient.getAttribute("x2"));
				const y2 = Number(gradient.getAttribute("y2"));

				// The ramp runs along the shaft, so the constant coordinate is the one
				// perpendicular to the arrow and the other must actually vary.
				if (axis === "file") {
					expect(x1).toBe(x2);
					expect(y1).not.toBe(y2);
				} else {
					expect(y1).toBe(y2);
					expect(x1).not.toBe(x2);
				}
			}
		});

		it("removing the only translucent arrow leaves its gradient referenced by nothing", () => {
			const dom = buildDom(container);
			const defs = dom.marks.querySelector("defs")!;

			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});
			render(dom, state);

			expect(defs.querySelectorAll("linearGradient").length).toBeGreaterThan(0);

			// Render with no marks.
			const emptyState = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [], user: [] },
			});
			render(dom, emptyState);

			// The gradient is parked, not deleted: it stays in `defs` so the next
			// translucent arrow can rewrite it instead of creating one. What matters is
			// that nothing points at it any more, and that the pool bounds how many can
			// accumulate.
			expect(defs.querySelectorAll("linearGradient").length).toBeLessThanOrEqual(
				GRADIENT_POOL_CAPACITY,
			);
			expect(dom.marks.querySelectorAll("[data-mark]").length).toBe(0);
			for (const shaft of Array.from(dom.marks.querySelectorAll("polygon"))) {
				expect(shaft.getAttribute("display")).toBe("none");
			}
		});

		it("two boards on the same page never collide on a gradient id", () => {
			const container1 = document.createElement("div");
			const container2 = document.createElement("div");

			const dom1 = buildDom(container1);
			const dom2 = buildDom(container2);

			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "red" }], user: [] },
			});

			render(dom1, state);
			render(dom2, state);

			const defs1 = dom1.marks.querySelector("defs");
			const defs2 = dom2.marks.querySelector("defs");

			const gradient1 = defs1?.querySelector("linearGradient");
			const gradient2 = defs2?.querySelector("linearGradient");

			expect(gradient1?.id).not.toBe(gradient2?.id);
		});

		it("an opaque pen (opacity === 1) still creates no gradient at all", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens: {
						green: { color: "#00ff00", opacity: 1, width: 3 },
					},
					auto: [{ from: "e2", to: "e4", pen: "green" }],
					user: [],
				},
			});

			render(dom, state);
			const defs = dom.marks.querySelector("defs");
			const gradients = defs?.querySelectorAll("linearGradient");

			expect(gradients?.length).toBe(0);
		});

		it("D2 regression: gradient ids stay unique across a sweep that frees an index", () => {
			const dom = buildDom(container);
			const defs = dom.marks.querySelector("defs")!;
			const pens = { red: { color: "#ff0000", opacity: 0.5, width: 3 } };

			// First render: two translucent arrows, minting gradient indices 0 and 1.
			const stateAB = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens,
					auto: [
						{ from: "e2", to: "e4", pen: "red" },
						{ from: "a1", to: "a3", pen: "red" },
					],
					user: [],
				},
			});
			render(dom, stateAB);

			// Second render: drop the first arrow. Its gradient is swept, freeing an
			// index while the second arrow's gradient (index 1) is still alive.
			const stateBOnly = applyOptions(defaultState(), {
				marks: { enabled: true, pens, auto: [{ from: "a1", to: "a3", pen: "red" }], user: [] },
			});
			render(dom, stateBOnly);

			// Third render: add a new, geometrically distinct translucent arrow. A
			// non-monotonic counter (e.g. `gradients.size`) would reissue the freed
			// index and collide with the surviving arrow's gradient.
			const stateBAndC = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens,
					auto: [
						{ from: "a1", to: "a3", pen: "red" },
						{ from: "e2", to: "e5", pen: "red" },
					],
					user: [],
				},
			});
			render(dom, stateBAndC);

			const ids = Array.from(defs.querySelectorAll("linearGradient")).map((g) => g.id);
			expect(new Set(ids).size).toBe(ids.length);
		});
	});

	describe("UNIT-005: keyed mark diff", () => {
		it("zero-DOM hot path: rendering the same non-empty mark set twice records zero mutations", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
			});

			// First render to populate cache.
			render(dom, state);

			// Second render with identical mark set.
			const mutations: MutationRecord[] = [];
			const observer = new MutationObserver((records) => {
				mutations.push(...records);
			});
			observer.observe(dom.marks, { childList: true, subtree: true, attributes: true });
			observer.observe(dom.heads, { childList: true, subtree: true, attributes: true });
			observer.observe(dom.badges, { childList: true, subtree: true, attributes: true });

			render(dom, state);

			observer.disconnect();

			expect(mutations.length).toBe(0);
		});

		it("node identity preserved across a change: A's nodes unchanged, B's nodes updated", () => {
			const dom = buildDom(container);
			const stateAB = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens: {
						green: { color: "#00ff00", opacity: 1, width: 3 },
						red: { color: "#ff0000", opacity: 0.5, width: 3 },
					},
					auto: [
						{ from: "e2", to: "e4", pen: "green" },
						{ from: "a1", to: "a3", pen: "red" },
					],
					user: [],
				},
			});

			// First render with A and B.
			render(dom, stateAB);
			const aShaft = dom.marks.querySelector('polygon[data-from="e2"][data-to="e4"]') as SVGElement;
			const bShaft = dom.marks.querySelector('polygon[data-from="a1"][data-to="a3"]') as SVGElement;
			const aPoints = aShaft?.getAttribute("points");
			const bPoints = bShaft?.getAttribute("points");

			// Second render with A unchanged and B′ (B's width changed).
			const stateABPrime = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens: {
						green: { color: "#00ff00", opacity: 1, width: 3 },
						red: { color: "#ff0000", opacity: 0.5, width: 5 },
					},
					auto: [
						{ from: "e2", to: "e4", pen: "green" },
						{ from: "a1", to: "a3", pen: "red" },
					],
					user: [],
				},
			});

			render(dom, stateABPrime);

			const aShaftAfter = dom.marks.querySelector('polygon[data-from="e2"][data-to="e4"]');
			const bShaftAfter = dom.marks.querySelector('polygon[data-from="a1"][data-to="a3"]');

			// A's shaft is the same object with same points.
			expect(aShaftAfter).toBe(aShaft);
			expect(aShaftAfter?.getAttribute("points")).toBe(aPoints);

			// B's shaft is the same object but different points (due to width change).
			expect(bShaftAfter).toBe(bShaft);
			expect(bShaftAfter?.getAttribute("points")).not.toBe(bPoints);
		});

		it("removal: B's nodes are parked and stop matching any mark selector", () => {
			const dom = buildDom(container);
			const stateAB = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					auto: [
						{ from: "e2", to: "e4", pen: "green" },
						{ from: "a1", to: "a3", pen: "red" },
					],
					user: [],
				},
			});

			// Render with A and B.
			render(dom, stateAB);
			const bShaft = dom.marks.querySelector('polygon[data-from="a1"]');

			// Render with only A.
			const stateA = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
			});

			render(dom, stateA);

			// B's shaft keeps its parent -- un-parenting is the mutation the pool exists
			// to avoid -- but it stops painting and stops answering mark selectors.
			expect(bShaft?.getAttribute("display")).toBe("none");
			expect(bShaft?.hasAttribute("data-mark")).toBe(false);
			// B's marks are gone.
			expect(dom.marks.querySelectorAll('polygon[data-from="a1"]').length).toBe(0);
		});

		it("order: user marks follow auto marks in every layer", () => {
			const dom = buildDom(container);
			const stateAutoOnly = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
			});

			// Render with only auto mark.
			render(dom, stateAutoOnly);

			// Render with auto and user mark on same square.
			const stateWithUser = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					auto: [{ from: "e2", to: "e4", pen: "green" }],
					user: [{ from: "e2", to: "e5", pen: "blue" }],
				},
			});

			render(dom, stateWithUser);

			const autoShaftAfter = dom.marks.querySelector('polygon[data-from="e2"][data-to="e4"]');
			const userShaftAfter = dom.marks.querySelector('polygon[data-from="e2"][data-to="e5"]');

			// Both marks are present.
			expect(autoShaftAfter).toBeDefined();
			expect(userShaftAfter).toBeDefined();

			// Auto mark comes before user mark in DOM order.
			const autoIndex = Array.from(dom.marks.querySelectorAll("polygon[data-mark='arrow']")).indexOf(
				autoShaftAfter as SVGElement,
			);
			const userIndex = Array.from(dom.marks.querySelectorAll("polygon[data-mark='arrow']")).indexOf(
				userShaftAfter as SVGElement,
			);

			expect(autoIndex).toBeLessThan(userIndex);
		});

		it("`current` supersedes: in-progress mark replaces same-key user mark", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens: {
						green: { color: "#00ff00", opacity: 1, width: 3 },
						red: { color: "#ff0000", opacity: 1, width: 3 },
					},
					auto: [],
					user: [{ from: "e2", to: "e4", pen: "green" }],
				},
			});

			// Render with user mark (green).
			render(dom, state);
			const userShaft = dom.marks.querySelector('polygon[data-from="e2"]') as SVGElement;
			const greenFill = userShaft?.getAttribute("fill");

			// Render with current mark on same key (red).
			const current = { from: "e2", to: "e4", pen: "red" };
			render(dom, state, current);

			const shaftAfter = dom.marks.querySelector('polygon[data-from="e2"]') as SVGElement;
			const redFill = shaftAfter?.getAttribute("fill");

			// Should be the same element, just with updated attributes.
			expect(shaftAfter).toBe(userShaft);
			// Fill color should have changed from green to red.
			expect(redFill).toContain("#ff0000");
			expect(greenFill).not.toBe(redFill);
		});

		it("orientation flip updates polygon points in place", () => {
			const dom = buildDom(container);
			const stateWhite = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
				orientation: "white",
			});

			// Render from white's perspective.
			render(dom, stateWhite);
			const shaft = dom.marks.querySelector('polygon[data-from="e2"]') as SVGElement;
			const pointsWhite = shaft?.getAttribute("points");

			// Flip orientation.
			const stateBlack = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
				orientation: "black",
			});

			render(dom, stateBlack);

			const shaftAfter = dom.marks.querySelector('polygon[data-from="e2"]') as SVGElement;
			const pointsBlack = shaftAfter?.getAttribute("points");

			// Same element, different points.
			expect(shaftAfter).toBe(shaft);
			expect(pointsBlack).not.toBe(pointsWhite);
		});

		it("kind change: arrow becomes circle leaves no stale node", () => {
			const dom = buildDom(container);
			const stateArrow = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", to: "e4", pen: "green" }], user: [] },
			});

			// Render arrow.
			render(dom, stateArrow);
			const arrowShaft = dom.marks.querySelector('polygon[data-from="e2"]');

			// Same key, change to circle (remove `to`).
			const stateCircle = applyOptions(defaultState(), {
				marks: { enabled: true, auto: [{ from: "e2", pen: "green" }], user: [] },
			});

			render(dom, stateCircle);

			// The old arrow polygon is parked: still parented, but invisible and stripped
			// of the stamps, so nothing can find it and nothing paints it.
			expect(arrowShaft?.getAttribute("display")).toBe("none");
			expect(arrowShaft?.hasAttribute("data-from")).toBe(false);
			// New circle is present.
			const circle = dom.marks.querySelector('circle[data-from="e2"]');
			expect(circle).toBeDefined();
			// Only one mark on e2.
			expect(dom.marks.querySelectorAll('[data-from="e2"]').length).toBe(1);
		});

		it("D1 regression: an auto mark and a user mark sharing a key keep independent cache entries", () => {
			const dom = buildDom(container);
			const state = applyOptions(defaultState(), {
				marks: {
					enabled: true,
					pens: {
						blue: { color: "#0000ff", opacity: 1, width: 3 },
						green: { color: "#00ff00", opacity: 1, width: 3 },
					},
					auto: [{ from: "e2", to: "e4", pen: "blue" }],
					user: [{ from: "e2", to: "e4", pen: "green" }],
				},
			});

			render(dom, state);

			// Both arrows must exist -- keying the cache by `markKey` alone (with no
			// source qualifier) makes the user entry overwrite the auto one, so only
			// one node ends up tracked and the other is orphaned in the DOM.
			const shafts = dom.marks.querySelectorAll('polygon[data-from="e2"][data-to="e4"]');
			expect(shafts.length).toBe(2);
			expect(shafts[0]?.getAttribute("data-pen")).toBe("blue");
			expect(shafts[1]?.getAttribute("data-pen")).toBe("green");

			// Render again, unchanged: if the auto entry was orphaned, the next
			// render would find the user's node under the auto key and mutate it
			// with the auto mark's inputs -- painting the user's arrow blue.
			render(dom, state);
			const shaftsAfter = dom.marks.querySelectorAll('polygon[data-from="e2"][data-to="e4"]');
			expect(shaftsAfter.length).toBe(2);
			expect(shaftsAfter[0]).toBe(shafts[0]);
			expect(shaftsAfter[1]).toBe(shafts[1]);
			expect(shaftsAfter[0]?.getAttribute("data-pen")).toBe("blue");
			expect(shaftsAfter[1]?.getAttribute("data-pen")).toBe("green");
		});
	});

	describe("retention under churn", () => {
		const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

		/** An engine tick: every key differs from the previous render's, which is the
		 *  case the node handoff and the owner-keyed gradients are built for. */
		function tick(i: number): BoardState {
			const marks = [
				{ from: `${FILES[i % 8]}2`, to: `${FILES[(i + 1) % 8]}4`, pen: "green" },
				{ from: `${FILES[(i + 2) % 8]}7`, to: `${FILES[(i + 3) % 8]}5`, pen: "blue" },
				{ from: `${FILES[(i + 4) % 8]}3` },
			];
			return applyOptions(defaultState(), {
				marks: { enabled: true, auto: marks as any, user: [] },
			});
		}

		function census(): number {
			return container.querySelectorAll("*").length;
		}

		it("holds a flat node census across hundreds of engine ticks", () => {
			const dom = buildDom(container);

			// Let the pools reach steady state before sampling.
			for (let i = 0; i < 20; i++) {
				render(dom, tick(i));
			}
			const settled = census();

			for (let i = 20; i < 400; i++) {
				render(dom, tick(i));
			}

			// Nothing accumulates: retired nodes are either handed to the mark being
			// painted, parked in a capacity-capped pool, or removed outright.
			expect(census()).toBe(settled);
		});

		it("keeps gradients bounded by the pool capacity when every arrow retires", () => {
			const dom = buildDom(container);

			for (let i = 0; i < 200; i++) {
				render(dom, tick(i));
			}

			// Drop to no marks at all. Every owner goes unreferenced in one sweep, so
			// this is the worst case for the parked pool.
			render(dom, applyOptions(defaultState(), { marks: { enabled: true, auto: [], user: [] } }));

			// `defs` is minted lazily by the first gradient, so it only exists now.
			const defs = container.querySelector("defs")!;
			expect(defs.querySelectorAll("linearGradient").length).toBeLessThanOrEqual(GRADIENT_POOL_CAPACITY);
		});
	});
});
