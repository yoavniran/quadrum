import { setSquareAttr, clearSquareAttr, placeSquare, setTransform, setTranslate } from "../src/view/placement";

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

	// setTransform and setTranslate write the same property through two different
	// guards, so each has to invalidate the other's record or one of them will
	// skip a write the element genuinely needs.
	describe("setTranslate", () => {
		it("writes on the first call and elides an identical repeat", () => {
			const el = document.createElement("qd-piece");

			setTranslate(el, 3, 4);
			expect(el.style.transform).toBe("translate(300%, 400%)");

			el.style.transform = "";
			setTranslate(el, 3, 4);
			// Elided: the record still says (3, 4), so nothing was rewritten.
			expect(el.style.transform).toBe("");
		});

		it("writes again when either coordinate changes", () => {
			const el = document.createElement("qd-piece");

			setTranslate(el, 3, 4);
			setTranslate(el, 3, 5);
			expect(el.style.transform).toBe("translate(300%, 500%)");
		});

		it("is elided by a setTransform that wrote the same translate", () => {
			const el = document.createElement("qd-piece");

			setTransform(el, "translate(300%, 400%)");
			el.style.transform = "";
			setTranslate(el, 3, 4);

			expect(el.style.transform).toBe("translate(300%, 400%)");
		});

		it("re-writes coordinates that a setTransform has since overwritten", () => {
			const el = document.createElement("qd-piece");

			setTranslate(el, 3, 4);
			// The drag layer parks the element somewhere else by string.
			setTransform(el, "translate(50%, 50%)");
			// Back to where the numeric record still claimed it was. Without the
			// invalidation in setTransform this compares equal and the piece stays
			// stuck at the drag position.
			setTranslate(el, 3, 4);

			expect(el.style.transform).toBe("translate(300%, 400%)");
		});

		// placeSquare shares one record between the two writes, so it has to end up
		// in exactly the state the two separate calls would have left behind --
		// including each guard staying independent of the other.
		it("placeSquare writes both the attribute and the translate", () => {
			const el = document.createElement("qd-piece");

			placeSquare(el, "a1", 3, 4);

			expect(el.dataset.square).toBe("a1");
			expect(el.style.transform).toBe("translate(300%, 400%)");
		});

		it("placeSquare guards each write separately", () => {
			const el = document.createElement("qd-piece");
			placeSquare(el, "a1", 3, 4);

			el.removeAttribute("data-square");
			el.style.transform = "";
			// Same square, moved: only the translate is genuinely new.
			placeSquare(el, "a1", 3, 5);

			expect(el.dataset.square).toBeUndefined();
			expect(el.style.transform).toBe("translate(300%, 500%)");
		});

		it("placeSquare shares its record with the single-purpose writers", () => {
			const el = document.createElement("qd-piece");
			placeSquare(el, "a1", 3, 4);

			el.removeAttribute("data-square");
			el.style.transform = "";
			setSquareAttr(el, "a1");
			setTranslate(el, 3, 4);

			expect(el.dataset.square).toBeUndefined();
			expect(el.style.transform).toBe("");
		});

		it("elides a setTransform repeating the translate it just wrote", () => {
			const el = document.createElement("qd-piece");

			setTranslate(el, 3, 4);
			el.style.transform = "";
			setTransform(el, "translate(300%, 400%)");

			expect(el.style.transform).toBe("");
		});
	});
});
