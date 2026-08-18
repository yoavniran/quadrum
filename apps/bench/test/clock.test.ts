import { describe, it, expect } from "vitest";
import { frameScriptMs } from "../src/core/clock";

describe("frameScriptMs", () => {
	it("sums synchronous and deferred halves", () => {
		const syncMs = 2.5;
		const rafTimestamp = 1000;
		const enteredAt = 1005;

		const result = frameScriptMs(syncMs, rafTimestamp, enteredAt);

		expect(result).toBeCloseTo(7.5); // 2.5 + (1005 - 1000)
	});

	it("clamps deferred time to 0 when enteredAt < rafTimestamp", () => {
		const syncMs = 2.5;
		const rafTimestamp = 1000;
		const enteredAt = 998; // Before the frame started (unusual but possible at boundaries)

		const result = frameScriptMs(syncMs, rafTimestamp, enteredAt);

		expect(result).toBeCloseTo(2.5); // Just the sync half, deferred clamped to 0
	});

	it("handles zero synchronous time", () => {
		const syncMs = 0;
		const rafTimestamp = 1000;
		const enteredAt = 1003;

		const result = frameScriptMs(syncMs, rafTimestamp, enteredAt);

		expect(result).toBeCloseTo(3); // Only deferred time
	});

	it("handles zero deferred time", () => {
		const syncMs = 2;
		const rafTimestamp = 1000;
		const enteredAt = 1000; // Entered exactly at frame start

		const result = frameScriptMs(syncMs, rafTimestamp, enteredAt);

		expect(result).toBeCloseTo(2); // Only sync time
	});
});
