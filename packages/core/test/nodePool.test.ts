import { createNodePool } from "../src/view/nodePool";

describe("createNodePool", () => {
	it("acquires nodes LIFO", () => {
		const pool = createNodePool<HTMLElement>(3);
		const n1 = document.createElement("div");
		const n2 = document.createElement("div");

		pool.release(n1);
		pool.release(n2);

		expect(pool.acquire()).toBe(n2);
		expect(pool.acquire()).toBe(n1);
	});

	it("returns null when pool is empty", () => {
		const pool = createNodePool<HTMLElement>(3);
		expect(pool.acquire()).toBe(null);
	});

	it("returns true when release succeeds", () => {
		const pool = createNodePool<HTMLElement>(2);
		const n = document.createElement("div");
		expect(pool.release(n)).toBe(true);
	});

	it("returns false and stores nothing when pool is at capacity", () => {
		const pool = createNodePool<HTMLElement>(1);
		const n1 = document.createElement("div");
		const n2 = document.createElement("div");

		pool.release(n1);
		const result = pool.release(n2);

		expect(result).toBe(false);
		expect(pool.size).toBe(1);
		expect(pool.acquire()).toBe(n1);
		expect(pool.acquire()).toBe(null);
	});

	it("does not store a node twice", () => {
		const pool = createNodePool<HTMLElement>(3);
		const n = document.createElement("div");

		pool.release(n);
		pool.release(n);

		expect(pool.size).toBe(1);
		expect(pool.acquire()).toBe(n);
		expect(pool.acquire()).toBe(null);
	});

	it("drains all nodes and empties the pool", () => {
		const pool = createNodePool<HTMLElement>(5);
		const n1 = document.createElement("div");
		const n2 = document.createElement("div");
		const n3 = document.createElement("div");

		pool.release(n1);
		pool.release(n2);
		pool.release(n3);

		const drained = pool.drain();

		expect(drained).toHaveLength(3);
		expect(drained).toContain(n1);
		expect(drained).toContain(n2);
		expect(drained).toContain(n3);
		expect(pool.size).toBe(0);
	});

	it("throws RangeError for zero capacity", () => {
		expect(() => createNodePool<HTMLElement>(0)).toThrow(RangeError);
	});

	it("throws RangeError for negative capacity", () => {
		expect(() => createNodePool<HTMLElement>(-1)).toThrow(RangeError);
	});

	it("throws RangeError for non-integer capacity", () => {
		expect(() => createNodePool<HTMLElement>(1.5)).toThrow(RangeError);
	});
});
