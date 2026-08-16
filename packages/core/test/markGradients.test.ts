import { createGradientRegistry } from "../src/view/markGradients";

describe("createGradientRegistry", () => {
	let defs: SVGElement;

	beforeEach(() => {
		defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
	});

	it("fills a gradient and appends it to defs", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill = registry.fill(defs, owner, "red", 0.5, { x1: 10, y1: 20, x2: 30, y2: 40 });

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

	it("returns the same URL for the same owner with identical inputs without adding a second gradient", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill1 = registry.fill(defs, owner, "blue", 0.7, { x1: 5, y1: 10, x2: 15, y2: 25 });
		const fill2 = registry.fill(defs, owner, "blue", 0.7, { x1: 5, y1: 10, x2: 15, y2: 25 });

		expect(fill1).toBe(fill2);
		expect(defs.children.length).toBe(1);
	});

	it("the same owner with different coordinates returns the same url and mutates coordinates", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill1 = registry.fill(defs, owner, "green", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry.fill(defs, owner, "green", 0.5, { x1: 0, y1: 0, x2: 20, y2: 20 });

		expect(fill1).toBe(fill2);
		expect(defs.children.length).toBe(1);

		const gradient = defs.children[0] as SVGElement;
		expect(gradient.getAttribute("x2")).toBe("20");
		expect(gradient.getAttribute("y2")).toBe("20");
	});

	it("two different owners produce two different ids", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill1 = registry.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry.fill(defs, owner2, "blue", 0.6, { x1: 0, y1: 0, x2: 10, y2: 10 });

		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(fill2).toBe("url(#qd-fade-0-1)");
		expect(defs.children.length).toBe(2);
	});

	it("rounds coordinates to 2 decimals in attributes", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner, "red", 0.5, { x1: 10.001, y1: 20.001, x2: 30, y2: 40 });

		const gradient = defs.children[0] as SVGElement;
		expect(gradient.getAttribute("x1")).toBe("10");
		expect(gradient.getAttribute("y1")).toBe("20");
	});

	it("includes boardSeq in the gradient id to avoid collisions", () => {
		const registry1 = createGradientRegistry(0);
		const registry2 = createGradientRegistry(1);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill1 = registry1.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry2.fill(defs, owner2, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });

		expect(fill1).toContain("qd-fade-0-");
		expect(fill2).toContain("qd-fade-1-");
	});

	it("a parked gradient stays in defs and is reused by a new owner", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		// Render 1: owner1 fills with one gradient, which marks owner1 as referenced
		const fill1 = registry.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(defs.children.length).toBe(1);

		// End render 1: sweep keeps the gradient live because owner1 is referenced
		registry.sweep();
		expect(defs.children.length).toBe(1);

		// Render 2: owner2 fills with different parameters, creating a new gradient
		const fill2 = registry.fill(defs, owner2, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });
		expect(fill2).toBe("url(#qd-fade-0-1)");
		expect(defs.children.length).toBe(2);

		// End render 2: sweep marks both as referenced, so both stay
		registry.sweep();
		expect(defs.children.length).toBe(2);

		// Render 3: same owner1 reuses its gradient
		const fill3 = registry.fill(defs, owner1, "red", 0.5, { x1: 10, y1: 10, x2: 20, y2: 20 });
		expect(fill3).toBe("url(#qd-fade-0-0)");
		expect(defs.children.length).toBe(2);
	});

	it("does not write stop attributes on a recycled gradient with unchanged color and opacity", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		// First fill creates the gradient
		registry.fill(defs, owner1, "blue", 0.6, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const gradient = defs.children[0] as SVGElement;
		const stop0 = gradient.querySelector("stop[offset='0']") as SVGElement;

		registry.sweep();

		// Reuse with the same color and opacity
		registry.fill(defs, owner2, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });

		// No setAttr should have been called on the stop elements
		const setSpy = vi.spyOn(stop0, "setAttribute");
		registry.fill(defs, owner2, "blue", 0.6, { x1: 6, y1: 6, x2: 16, y2: 16 });
		expect(setSpy.mock.calls.length).toBe(0);
	});

	it("retain(owner) keeps an owner's gradient live across a sweep", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		registry.retain(owner);
		registry.sweep();

		// Gradient should still be in defs because it was retained
		expect(defs.children.length).toBe(1);
	});

	it("retain on an owner the registry has never seen is a no-op", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		expect(() => {
			registry.retain(owner2);
		}).not.toThrow();

		registry.sweep();
		expect(defs.children.length).toBe(1);
	});

	it("colour and opacity changes for the same owner rewrite the stops", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const gradient = defs.children[0] as SVGElement;

		registry.fill(defs, owner, "blue", 0.7, { x1: 0, y1: 0, x2: 10, y2: 10 });

		// Same gradient element
		expect(defs.children.length).toBe(1);
		expect(defs.children[0]).toBe(gradient);

		const stops = gradient.querySelectorAll("stop");
		expect(stops[0].getAttribute("stop-color")).toBe("blue");
		expect(stops[0].getAttribute("stop-opacity")).toBe("0.7");
	});

	it("drains all gradients and removes them from the DOM", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		registry.fill(defs, owner2, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });

		expect(defs.children.length).toBe(2);

		registry.drain();

		expect(defs.children.length).toBe(0);
	});

	it("increments the gradient index counter monotonically", () => {
		const registry = createGradientRegistry(0);
		const owner1 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner2 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
		const owner3 = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		const fill1 = registry.fill(defs, owner1, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const fill2 = registry.fill(defs, owner2, "blue", 0.6, { x1: 5, y1: 5, x2: 15, y2: 15 });
		const fill3 = registry.fill(defs, owner3, "green", 0.7, { x1: 10, y1: 10, x2: 20, y2: 20 });

		expect(fill1).toBe("url(#qd-fade-0-0)");
		expect(fill2).toBe("url(#qd-fade-0-1)");
		expect(fill3).toBe("url(#qd-fade-0-2)");
	});

	it("a second fill with identical arguments performs no setAttribute on the gradient", () => {
		const registry = createGradientRegistry(0);
		const owner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");

		registry.fill(defs, owner, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });
		const gradient = defs.children[0] as SVGElement;

		const setSpy = vi.spyOn(gradient, "setAttribute");
		registry.fill(defs, owner, "red", 0.5, { x1: 0, y1: 0, x2: 10, y2: 10 });

		expect(setSpy.mock.calls.length).toBe(0);
	});
});
