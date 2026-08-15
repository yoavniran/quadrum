import { createMarkPools } from "../src/view/markPool";

describe("createMarkPools", () => {
	it("acquires null from a fresh pool", () => {
		const pools = createMarkPools();
		expect(pools.acquire("shaft")).toBeNull();
		expect(pools.acquire("head")).toBeNull();
		expect(pools.acquire("circle")).toBeNull();
		expect(pools.acquire("badge")).toBeNull();
	});

	it("releases a node into its kind's pool and makes it invisible", () => {
		const pools = createMarkPools();
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		svg.appendChild(shaft);

		shaft.setAttribute("data-mark", "arrow");
		shaft.setAttribute("data-mark-part", "shaft");

		const result = pools.release("shaft", shaft);

		expect(result).toBe(true);
		expect(shaft.parentNode).toBe(svg);
		expect(shaft.getAttribute("display")).toBe("none");
		expect(shaft.hasAttribute("data-mark")).toBe(false);
		expect(shaft.hasAttribute("data-mark-part")).toBe(false);
	});

	it("removes all five data-* stamps when releasing", () => {
		const pools = createMarkPools();
		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		shaft.setAttribute("data-mark", "arrow");
		shaft.setAttribute("data-mark-part", "shaft");
		shaft.setAttribute("data-from", "e4");
		shaft.setAttribute("data-to", "e5");
		shaft.setAttribute("data-pen", "green");

		pools.release("shaft", shaft);

		expect(shaft.hasAttribute("data-mark")).toBe(false);
		expect(shaft.hasAttribute("data-mark-part")).toBe(false);
		expect(shaft.hasAttribute("data-from")).toBe(false);
		expect(shaft.hasAttribute("data-to")).toBe(false);
		expect(shaft.hasAttribute("data-pen")).toBe(false);
	});

	it("removes display attribute on acquire", () => {
		const pools = createMarkPools();
		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		pools.release("shaft", shaft);
		const acquired = pools.acquire("shaft");

		expect(acquired).toBe(shaft);
		expect(acquired!.hasAttribute("display")).toBe(false);
	});

	it("keeps pools independent by kind", () => {
		const pools = createMarkPools();
		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		pools.release("shaft", shaft);
		pools.release("head", head);

		expect(pools.acquire("shaft")).toBe(shaft);
		expect(pools.acquire("head")).toBe(head);
		expect(pools.acquire("shaft")).toBeNull();
		expect(pools.acquire("head")).toBeNull();
	});

	it("clears textContent for badges but not circles", () => {
		const pools = createMarkPools();
		const badge = document.createElementNS("http://www.w3.org/2000/svg", "g");
		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");

		badge.textContent = "X";
		circle.textContent = "content";

		pools.release("badge", badge);
		pools.release("circle", circle);

		expect(badge.textContent).toBe("");
		expect(circle.textContent).toBe("content");
	});

	it("returns false when pool capacity is exceeded", () => {
		const pools = createMarkPools();
		const nodes: SVGElement[] = [];

		// Fill the pool to capacity (32)
		for (let i = 0; i < 32; i++) {
			const node = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
			const result = pools.release("shaft", node);
			expect(result).toBe(true);
			nodes.push(node);
		}

		// Try to add one more
		const extra = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const result = pools.release("shaft", extra);

		expect(result).toBe(false);
	});

	it("does not store a node twice when released multiple times", () => {
		const pools = createMarkPools();
		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		pools.release("shaft", shaft);
		pools.release("shaft", shaft);

		const acquired1 = pools.acquire("shaft");
		const acquired2 = pools.acquire("shaft");

		expect(acquired1).toBe(shaft);
		expect(acquired2).toBeNull();
	});

	it("drains all pools and removes nodes from the DOM", () => {
		const pools = createMarkPools();
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

		const shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		const badge = document.createElementNS("http://www.w3.org/2000/svg", "g");

		svg.appendChild(shaft);
		svg.appendChild(head);
		svg.appendChild(circle);
		svg.appendChild(badge);

		pools.release("shaft", shaft);
		pools.release("head", head);
		pools.release("circle", circle);
		pools.release("badge", badge);

		expect(shaft.parentNode).toBe(svg);
		expect(head.parentNode).toBe(svg);
		expect(circle.parentNode).toBe(svg);
		expect(badge.parentNode).toBe(svg);

		pools.drain();

		expect(shaft.parentNode).toBeNull();
		expect(head.parentNode).toBeNull();
		expect(circle.parentNode).toBeNull();
		expect(badge.parentNode).toBeNull();
	});
});
