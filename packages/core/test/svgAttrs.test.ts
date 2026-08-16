import { setAttr, removeAttr, forgetAttrs } from "../src/view/svgAttrs";

describe("svgAttrs", () => {
	let el: SVGElement;

	beforeEach(() => {
		el = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
	});

	it("first setAttr writes the attribute", () => {
		setAttr(el, "x", "1");
		expect(el.getAttribute("x")).toBe("1");
	});

	it("repeating the same setAttr value three times issues exactly one setAttribute", () => {
		const set = vi.spyOn(el, "setAttribute");
		setAttr(el, "x", "1");
		setAttr(el, "x", "1");
		setAttr(el, "x", "1");
		expect(set.mock.calls.length).toBe(1);
	});

	it("changing the value issues a second setAttribute", () => {
		const set = vi.spyOn(el, "setAttribute");
		setAttr(el, "x", "1");
		setAttr(el, "x", "2");
		expect(set.mock.calls.length).toBe(2);
		expect(el.getAttribute("x")).toBe("2");
	});

	it("removeAttr after setAttr issues exactly one removeAttribute", () => {
		const remove = vi.spyOn(el, "removeAttribute");
		setAttr(el, "x", "1");
		removeAttr(el, "x");
		expect(remove.mock.calls.length).toBe(1);
		expect(el.getAttribute("x")).toBeNull();
	});

	it("a second consecutive removeAttr issues no further removeAttribute", () => {
		const remove = vi.spyOn(el, "removeAttribute");
		setAttr(el, "x", "1");
		removeAttr(el, "x");
		removeAttr(el, "x");
		expect(remove.mock.calls.length).toBe(1);
	});

	it("removeAttr on a pristine element issues exactly one removeAttribute", () => {
		const remove = vi.spyOn(el, "removeAttribute");
		removeAttr(el, "x");
		expect(remove.mock.calls.length).toBe(1);
	});

	it("re-setting a value that was previously removed writes again", () => {
		const set = vi.spyOn(el, "setAttribute");
		setAttr(el, "x", "1");
		removeAttr(el, "x");
		setAttr(el, "x", "1");
		expect(set.mock.calls.length).toBe(2);
		expect(el.getAttribute("x")).toBe("1");
	});

	it("forgetAttrs makes the next identical setAttr write again", () => {
		const set = vi.spyOn(el, "setAttribute");
		setAttr(el, "x", "1");
		forgetAttrs(el);
		setAttr(el, "x", "1");
		expect(set.mock.calls.length).toBe(2);
	});

	it("forgetAttrs on a pristine element does not throw", () => {
		expect(() => forgetAttrs(el)).not.toThrow();
	});

	it("two elements keep independent mirrors", () => {
		const el2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const set1 = vi.spyOn(el, "setAttribute");
		const set2 = vi.spyOn(el2, "setAttribute");

		setAttr(el, "x", "1");
		setAttr(el2, "x", "1");

		expect(set1.mock.calls.length).toBe(1);
		expect(set2.mock.calls.length).toBe(1);
	});

	it("the mirror is invisible to Object.keys", () => {
		setAttr(el, "x", "1");
		expect(Object.keys(el).length).toBe(0);
	});

	it("a cloneNode of a mirrored element writes on its first setAttr", () => {
		const set = vi.spyOn(el, "setAttribute");
		setAttr(el, "x", "1");
		set.mockClear();

		const cloned = el.cloneNode(true) as SVGElement;
		const setCloned = vi.spyOn(cloned, "setAttribute");
		setAttr(cloned, "x", "1");

		expect(setCloned.mock.calls.length).toBe(1);
		expect(set.mock.calls.length).toBe(0);
	});
});
