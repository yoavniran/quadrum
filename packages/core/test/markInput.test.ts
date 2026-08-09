import { penForModifiers, toggleMark, createMarkController } from "../src/input/markInput";
import { defaultState, applyOptions } from "../src/options";
import type { MarkContext, MarkModifiers } from "../src/input/markInput";
import type { Mark } from "../src/types";

describe("markInput", () => {
	describe("penForModifiers", () => {
		it("button 2 with no modifiers returns green", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };
			expect(penForModifiers(mods)).toBe("green");
		});

		it("button 2 with shift returns red", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false };
			expect(penForModifiers(mods)).toBe("red");
		});

		it("button 2 with ctrl returns red", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: false, ctrlKey: true, altKey: false, metaKey: false };
			expect(penForModifiers(mods)).toBe("red");
		});

		it("button 2 with alt returns blue", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: false, ctrlKey: false, altKey: true, metaKey: false };
			expect(penForModifiers(mods)).toBe("blue");
		});

		it("button 2 with meta returns blue", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: false, ctrlKey: false, altKey: false, metaKey: true };
			expect(penForModifiers(mods)).toBe("blue");
		});

		it("button 2 with shift and alt returns yellow", () => {
			const mods: MarkModifiers = { button: 2, shiftKey: true, ctrlKey: false, altKey: true, metaKey: false };
			expect(penForModifiers(mods)).toBe("yellow");
		});

		it("button 0 with shift returns green (shift is not a trigger on left button)", () => {
			const mods: MarkModifiers = { button: 0, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false };
			expect(penForModifiers(mods)).toBe("green");
		});

		it("button 0 with alt returns blue", () => {
			const mods: MarkModifiers = { button: 0, shiftKey: false, ctrlKey: false, altKey: true, metaKey: false };
			expect(penForModifiers(mods)).toBe("blue");
		});
	});

	describe("toggleMark", () => {
		it("appends a new mark", () => {
			const marks: Mark[] = [];
			const next = toggleMark(marks, { from: "e2" });
			expect(next).toHaveLength(1);
			// toggleMark appends the mark as given; it does not inject a default pen.
			// The pen is resolved at render time, so an absent pen re-colours for free.
			expect(next[0]).toEqual({ from: "e2" });
		});

		it("removes an identical mark", () => {
			const marks: Mark[] = [{ from: "e2" }];
			const next = toggleMark(marks, { from: "e2" });
			expect(next).toEqual([]);
		});

		it("replaces a mark with the same key but different pen", () => {
			const marks: Mark[] = [{ from: "e2", pen: "green" }];
			const next = toggleMark(marks, { from: "e2", pen: "red" });
			expect(next).toHaveLength(1);
			expect(next[0]).toEqual({ from: "e2", pen: "red" });
		});

		it("removes based on markKey (from+to or from only)", () => {
			const marks: Mark[] = [{ from: "e2", to: "e4" }];
			const next = toggleMark(marks, { from: "e2", to: "e4" });
			expect(next).toEqual([]);
		});

		it("different from/to is a different mark", () => {
			const marks: Mark[] = [{ from: "e2", to: "e4" }];
			const next = toggleMark(marks, { from: "e2", to: "e5" });
			expect(next).toHaveLength(2);
		});
	});

	describe("markController", () => {
		it("press and release on same square commits a circle", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			let committedMarks: Mark[] = [];

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: () => {},
				commit: (marks) => { committedMarks = marks; },
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.release("e2");

			expect(committedMarks).toHaveLength(1);
			expect(committedMarks[0]).toEqual({ from: "e2", pen: "green" });
		});

		it("press on one square and release on another commits an arrow", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			let committedMarks: Mark[] = [];

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: () => {},
				commit: (marks) => { committedMarks = marks; },
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.release("e4");

			expect(committedMarks).toHaveLength(1);
			expect(committedMarks[0]).toEqual({ from: "e2", to: "e4", pen: "green" });
		});

		it("second identical draw erases the mark", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			state.marks.user = [{ from: "e2" }];
			let committedMarks = [...state.marks.user];

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: () => {},
				commit: (marks) => { committedMarks = marks; },
			};

			const controller = createMarkController(ctx);

			// Draw the same mark again
			controller.press("e2", new PointerEvent("pointerdown"));
			controller.release("e2");

			expect(committedMarks).toEqual([]);
		});

		it("does nothing when marks.enabled is false", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: false } });
			let currentMark: Mark | null = { from: "e2" };
			let committedMarks = state.marks.user;

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: (mark) => { currentMark = mark; },
				commit: (marks) => { committedMarks = marks; },
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.release("e4");

			// untouched: the seeded value, exactly as it was before press/release
			expect(currentMark).toEqual({ from: "e2" });
			expect(committedMarks).toEqual([]);
		});

		it("drag updates current to an arrow", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			let currentMark: Mark | null = null;

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: (mark) => { currentMark = mark; },
				commit: () => {},
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.drag("e4");

			expect(currentMark).toEqual({ from: "e2", to: "e4", pen: "green" });
		});

		it("drag back to origin updates current to a circle", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			let currentMark: Mark | null = null;

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: (mark) => { currentMark = mark; },
				commit: () => {},
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.drag("e4");
			controller.drag("e2");

			expect(currentMark).toEqual({ from: "e2", pen: "green" });
		});

		it("cancel clears current", () => {
			const state = applyOptions(defaultState(), { marks: { enabled: true } });
			let currentMark: Mark | null = { from: "e2" };

			const ctx: MarkContext = {
				state: () => state,
				setCurrent: (mark) => { currentMark = mark; },
				commit: () => {},
			};

			const controller = createMarkController(ctx);

			controller.press("e2", new PointerEvent("pointerdown"));
			controller.cancel();

			expect(currentMark).toBeNull();
		});
	});
});
