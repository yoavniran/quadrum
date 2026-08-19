/**
 * Browser timing primitives. No imports except type-only.
 */

let sink: unknown = undefined;

/**
 * Request a single animation frame and return the high-precision timestamp.
 */
export function nextFrame(): Promise<number> {
	return new Promise((resolve) => {
		requestAnimationFrame(resolve);
	});
}

/**
 * Request a single animation frame and return both the frame timestamp and the
 * entry time (when our callback was called after any rAF callbacks the library
 * registered). The frame timestamp is when the frame started; the entry time is
 * when we entered. The difference measures the library's deferred rAF work in
 * that frame.
 */
export function nextFrameEntry(): Promise<{ timestamp: number; enteredAt: number }> {
	return new Promise((resolve) => {
		requestAnimationFrame((timestamp) => {
			resolve({ timestamp, enteredAt: performance.now() });
		});
	});
}

/**
 * Calculate frame script time as the sum of synchronous work (t1 - t0) and the
 * deferred half of the library's rAF work. The deferred part is the time between
 * the frame start (rafTimestamp) and when our rAF callback entered (enteredAt),
 * clamped to 0 if our callback entered before the frame timestamp (can happen
 * at frame boundaries).
 */
export function frameScriptMs(syncMs: number, rafTimestamp: number, enteredAt: number): number {
	const deferredMs = Math.max(0, enteredAt - rafTimestamp);
	return syncMs + deferredMs;
}

/**
 * Wait for the browser to paint. Calls nextFrame twice so the browser has
 * painted between the two calls.
 */
export async function nextPaint(): Promise<void> {
	await nextFrame();
	await nextFrame();
}

/**
 * Settle post-paint tasks: call nextPaint, then a 0ms setTimeout to let
 * post-paint microtasks flush.
 */
export async function settle(): Promise<void> {
	await nextPaint();
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Force a layout by reading offsetWidth and getBoundingClientRect.
 * Assigns to module-level sink so reads cannot be optimized away.
 */
export function forceLayout(root: Element): void {
	sink = (root as HTMLElement).offsetWidth;
	if (root.firstElementChild) {
		sink = root.firstElementChild.getBoundingClientRect();
	}
}

/**
 * Time a synchronous function's execution.
 */
export function timeScript<T>(fn: () => T): { ms: number; value: T } {
	const start = performance.now();
	const value = fn();
	const ms = performance.now() - start;
	return { ms, value };
}

/**
 * Time a function and force layout afterward, returning both the elapsed time
 * and the function's result.
 */
export function timeToLayout<T>(
	root: Element,
	fn: () => T,
): { ms: number; value: T } {
	const start = performance.now();
	const value = fn();
	forceLayout(root);
	const ms = performance.now() - start;
	return { ms, value };
}

/**
 * Time a function asynchronously, await nextPaint, then return elapsed time
 * and the function's result.
 */
export async function timeToPaint<T>(
	fn: () => T,
): Promise<{ ms: number; value: T }> {
	const start = performance.now();
	const value = fn();
	await nextPaint();
	const ms = performance.now() - start;
	return { ms, value };
}

/**
 * Observe long tasks using PerformanceObserver.
 * Returns {stop()} which reports total ms and count.
 * On browsers without longtask support, returns a stub reporting 0/0.
 */
export function observeLongTasks(): {
	stop(): { totalMs: number; count: number };
} {
	let totalMs = 0;
	let count = 0;
	let observer: PerformanceObserver | null = null;

	try {
		observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				if (entry.entryType === "longtask") {
					totalMs += entry.duration;
					count += 1;
				}
			}
		});
		observer.observe({ entryTypes: ["longtask"] });
	} catch {
		// Firefox/Safari don't support longtask; return a stub
	}

	return {
		stop(): { totalMs: number; count: number } {
			if (observer) {
				observer.disconnect();
			}
			return { totalMs, count };
		},
	};
}

/**
 * Measure the median frame interval over a series of requestAnimationFrame calls.
 * Samples must be >= 1.
 */
export async function measureFrameInterval(samples: number = 60): Promise<number> {
	const deltas: number[] = [];
	let lastTime = await nextFrame();

	for (let i = 0; i < samples; i++) {
		const now = await nextFrame();
		deltas.push(now - lastTime);
		lastTime = now;
	}

	// Inline median to avoid importing stats
	const sorted = [...deltas].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

// Use sink's side effects to prevent optimization of layout-forcing reads
sink;
export { sink };
