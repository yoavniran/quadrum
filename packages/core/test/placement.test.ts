import { setSquareAttr, clearSquareAttr, setTransform } from "../src/view/placement";

describe("placement", () => {
	it("setSquareAttr writes data-square the first time", () => {
		const el = document.createElement("qd-piece");
		setSquareAttr(el, "a1");
		expect(el.dataset.square).toBe("a1");
	});

	it("second setSquareAttr with the same value performs no DOM write", () => {
		const el = document.createElement("qd-piece");
		setSquareAttr(el, "a1");
		// Remove the attribute behind the mirror's back
		el.removeAttribute("data-square");
		// Call setSquareAttr with the same value
		setSquareAttr(el, "a1");
		// Attribute should still be absent — the guard worked
		expect(el.dataset.square).toBeUndefined();
	});

	it("setSquareAttr with a different value writes", () => {
		const el = document.createElement("qd-piece");
		setSquareAttr(el, "a1");
		setSquareAttr(el, "b2");
		expect(el.dataset.square).toBe("b2");
	});

	it("setTransform behaves the same way as setSquareAttr", () => {
		const el = document.createElement("qd-piece");
		setTransform(el, "translate(10%, 20%)");
		expect(el.style.transform).toBe("translate(10%, 20%)");

		// Remove transform behind the mirror's back
		el.style.transform = "";
		// Call setTransform with the same value
		setTransform(el, "translate(10%, 20%)");
		// Transform should still be absent
		expect(el.style.transform).toBe("");

		// Different value writes
		setTransform(el, "translate(30%, 40%)");
		expect(el.style.transform).toBe("translate(30%, 40%)");
	});

	it("clearSquareAttr removes the attribute, and a following setSquareAttr with the previously-set value writes it back", () => {
		const el = document.createElement("qd-piece");
		setSquareAttr(el, "a1");
		expect(el.dataset.square).toBe("a1");

		clearSquareAttr(el);
		expect(el.dataset.square).toBeUndefined();

		// Setting the same value again should write because it was cleared
		setSquareAttr(el, "a1");
		expect(el.dataset.square).toBe("a1");
	});

	it("records are per-element: two elements do not share state", () => {
		const el1 = document.createElement("qd-piece");
		const el2 = document.createElement("qd-piece");

		setSquareAttr(el1, "a1");
		setSquareAttr(el2, "b2");

		expect(el1.dataset.square).toBe("a1");
		expect(el2.dataset.square).toBe("b2");

		// Changing el1 should not affect el2
		setSquareAttr(el1, "c3");
		expect(el1.dataset.square).toBe("c3");
		expect(el2.dataset.square).toBe("b2");
	});
});
