import { describe, expect, it } from "vitest";
import { pointerIntent } from "../src/input/pointerIntent";

describe("pointerIntent", () => {
	it("returns 'move' for plain left button", () => {
		expect(pointerIntent({ button: 0 })).toBe("move");
		expect(pointerIntent({ button: 0, shiftKey: false })).toBe("move");
	});

	it("returns 'mark' for right button", () => {
		expect(pointerIntent({ button: 2 })).toBe("mark");
		expect(pointerIntent({ button: 2, shiftKey: false })).toBe("mark");
		expect(pointerIntent({ button: 2, shiftKey: true })).toBe("mark");
	});

	it("returns 'mark' for left button with shift", () => {
		expect(pointerIntent({ button: 0, shiftKey: true })).toBe("mark");
	});

	it("returns null for middle button", () => {
		expect(pointerIntent({ button: 1 })).toBeNull();
		expect(pointerIntent({ button: 1, shiftKey: true })).toBeNull();
	});

	it("returns null for other buttons", () => {
		expect(pointerIntent({ button: 3 })).toBeNull();
		expect(pointerIntent({ button: 4 })).toBeNull();
		expect(pointerIntent({ button: 5 })).toBeNull();
	});

	it("ignores ctrlKey", () => {
		expect(pointerIntent({ button: 0, ctrlKey: true })).toBe("move");
		expect(pointerIntent({ button: 2, ctrlKey: true })).toBe("mark");
	});

	it("handles the combination of shift and ctrl", () => {
		expect(pointerIntent({ button: 0, shiftKey: true, ctrlKey: true })).toBe("mark");
	});
});
