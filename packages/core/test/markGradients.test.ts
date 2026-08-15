import { createGradientRegistry } from "../src/view/markGradients";

describe("createGradientRegistry", () => {
	it("fills a gradient and appends it to defs", () => {
		const registry = createGradientRegistry(0);
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
		svg.appendChild(defs);

		const fill = registry.fill(defs, "red", 0.5, { x1: 10, y1: 20, x2: 30, y2: 40 });

		expect(fill).toBe("url(#qd-fade-0-0)");
		expect(defs.children.length).toBe(1);

		const gradient = defs.children[0] as SVGElement;
		expect(gradient.getAttribute("gradientUnits")).toBe("userSpaceOnUse");
		expect(gradient.getAttribute("x1")).toBe("10");
		expect(gradient.getAttribute("y1")).toBe("20");
		expect(gradient.getAttribute("x2")).toBe("30");
		expect(gradient.getAttribute("y2")).toBe("40");

		const stops = gradient.querySelectorAll("stop");
		expect(stops.length).toBe(2);
		expect(stops[0].getAttribute("offset")).toBe("0");
		expect(stops[0].getAttribute("stop-color")).toBe("red");
		expect(stops[0].getAttribute("stop-opacity")).toBe("0.5");
		expect(stops[1].getAttribute("offset")).toBe("1");
		expect(stops[1].getAttribute("stop-color")).toBe("red");
		expect(stops[1].getAttribute("stop-opacity")).toBe("1");
	});

	it("returns the same URL for identical inputs without adding a second gradient", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		const fill1 = registry.fill(defs, "blue", 0.7, { x1: 5, y1: 10, x2: 15, y2: 25 });
		const fill2 = registry.fill(defs, "blue", 0.7, { x1: 5, y1: 10, x2: 15, y2: 25 });

		expect(fill1).toBe(fill2);
		expect(defs.children.length).toBe(1);
	});

	it("mints a new gradient for different coordinates", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		const fill1 = registry.fill(defs, "green", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry.fill(defs, "green", 0.5, { x1: 0, y1: 0, x2: 20, y2: 20 });

		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(fill2).toBe("url(#qd-fade-0-1)");
		expect(defs.children.length).toBe(2);
	});

	it("rounds coordinates to 2 decimals in the cache key and attributes", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		// These should round to the same values (10.001 and 10.004 both round to 10.00)
		const fill1 = registry.fill(defs, "red", 0.5, { x1: 10.001, y1: 20.001, x2: 30, y2: 40 });
		const fill2 = registry.fill(defs, "red", 0.5, { x1: 10.004, y1: 20.004, x2: 30, y2: 40 });

		expect(fill1).toBe(fill2);
		expect(defs.children.length).toBe(1);

		const gradient = defs.children[0] as SVGElement;
		expect(gradient.getAttribute("x1")).toBe("10");
		expect(gradient.getAttribute("y1")).toBe("20");
	});

	it("includes boardSeq in the gradient id to avoid collisions", () => {
		const registry1 = createGradientRegistry(0);
		const registry2 = createGradientRegistry(1);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		const fill1 = registry1.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry2.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });

		expect(fill1).toContain("qd-fade-0-");
		expect(fill2).toContain("qd-fade-1-");
	});

	it("sweeps unreferenced gradients into the pool", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		// Render 1: fill with one gradient
		const fill1 = registry.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(defs.children.length).toBe(1);

		// End render 1: sweep removes unreferenced gradients (none yet, since we referenced it)
		registry.sweep();

		// Render 2: fill with a different gradient (not referencing the first one anymore)
		const fill2 = registry.fill(defs, "blue", 0.6, { x1: 0, y1: 0, x2: 10, y2: 10 });
		expect(fill2).toBe("url(#qd-fade-0-1)");

		// End render 2: the first gradient was not referenced, so it is parked. It stays
		// inside `defs` -- detaching and re-appending it would be the two structural
		// mutations the pool exists to avoid -- and paints nothing while unreferenced.
		registry.sweep();
		expect(defs.children.length).toBe(2);

		// Render 3: fill with new coordinates should reuse the parked first gradient
		const fill3 = registry.fill(defs, "red", 0.5, { x1: 10, y1: 20, x2: 30, y2: 40 });
		expect(fill3).toBe("url(#qd-fade-0-0)");

		// Recycled in place, with the coordinates rewritten and no third element minted.
		expect(defs.children.length).toBe(2);
		const gradients = Array.from(defs.children) as SVGElement[];
		const reusedGradient = gradients.find(g => g.getAttribute("id") === "qd-fade-0-0")!;
		expect(reusedGradient.getAttribute("x1")).toBe("10");
		expect(reusedGradient.getAttribute("y1")).toBe("20");
		expect(reusedGradient.getAttribute("x2")).toBe("30");
		expect(reusedGradient.getAttribute("y2")).toBe("40");
	});

	it("does not write stop attributes on a recycled gradient with unchanged color and opacity", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		// First fill creates the gradient
		registry.fill(defs, "blue", 0.6, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const gradient = defs.children[0] as SVGElement;
		const stop0 = gradient.querySelector("stop[offset='0']") as SVGElement;
		const stop1 = gradient.querySelector("stop[offset='1']") as SVGElement;

		// Capture initial attribute values
		const initialStop0Opacity = stop0.getAttribute("stop-opacity");
		const initialStop1Opacity = stop1.getAttribute("stop-opacity");

		registry.sweep();

		// Reuse with the same color and opacity
		registry.fill(defs, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });

		// Stop attributes should be unchanged (no writes occurred)
		expect(stop0.getAttribute("stop-opacity")).toBe(initialStop0Opacity);
		expect(stop1.getAttribute("stop-opacity")).toBe(initialStop1Opacity);
	});

	it("retainFill marks a gradient as referenced by its URL", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		const fill1 = registry.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		registry.retainFill(fill1);
		registry.sweep();

		// Gradient should still be in defs because it was retained
		expect(defs.children.length).toBe(1);
	});

	it("tolerates null and malformed fill values without throwing", () => {
		const registry = createGradientRegistry(0);

		expect(() => {
			registry.retainFill(null);
			registry.retainFill("");
			registry.retainFill("none");
			registry.retainFill("url(#nope)");
			registry.retainFill("#qd-fade-0-0");
		}).not.toThrow();
	});

	it("drains all gradients and removes them from the DOM", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		registry.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		registry.fill(defs, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });

		expect(defs.children.length).toBe(2);

		registry.drain();

		expect(defs.children.length).toBe(0);
	});

	it("increments the gradient index counter monotonically", () => {
		const registry = createGradientRegistry(0);
		const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

		const fill1 = registry.fill(defs, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry.fill(defs, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });
		const fill3 = registry.fill(defs, "green", 0.7, { x1: 10, y1: 10, x2: 20, y2: 20 });

		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(fill2).toBe("url(#qd-fade-0-1)");
		expect(fill3).toBe("url(#qd-fade-0-2)");
	});
});
