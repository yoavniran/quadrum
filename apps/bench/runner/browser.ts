/**
 * Playwright + CDP control for the headless runner.
 */

import { chromium } from "@playwright/test";
import type { Browser, Page, CDPSession } from "@playwright/test";

/**
 * Launch a Chromium browser with performance-friendly flags.
 */
export async function launch(headed: boolean): Promise<Browser> {
	return chromium.launch({
		headless: !headed,
		args: [
			"--disable-background-timer-throttling",
			"--disable-renderer-backgrounding",
			"--disable-backgrounding-occluded-windows",
			// Headless has no real vsync; this forces every compositor stage to complete
			// per frame so paint-adjacent numbers are less understated
			"--run-all-compositor-stages-before-draw",
		],
	});
}

/**
 * Open a page and set up CDP profiling hooks.
 */
export async function openPage(
	browser: Browser,
	url: string,
	throttleRate: number,
): Promise<{
	page: Page;
	cdp: CDPSession;
	dispose: () => Promise<void>;
}> {
	const context = await browser.newContext({
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 1,
	});
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);

	await cdp.send("Performance.enable");
	await cdp.send("HeapProfiler.enable");
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttleRate });

	await page.goto(url, { waitUntil: "load" });

	const dispose = async (): Promise<void> => {
		await cdp.detach();
		await context.close();
	};

	return { page, cdp, dispose };
}

/**
 * Install CDP-backed measurement hooks into the page.
 * exposeFunction must be called before the page navigates, but the wiring
 * evaluate runs after load to ensure __bench exists.
 */
export async function installHooks(page: Page, cdp: CDPSession): Promise<void> {
	// Expose the three measurement functions to the page
	await page.exposeFunction("__benchCollectGarbage", async () => {
		for (let i = 0; i < 3; i++) {
			await cdp.send("HeapProfiler.collectGarbage");
		}
	});

	await page.exposeFunction("__benchHeapUsed", async () => {
		const result = await cdp.send("Runtime.getHeapUsage");
		return (result as any).usedSize || 0;
	});

	await page.exposeFunction("__benchDomCounters", async () => {
		const result = await cdp.send("Performance.getMetrics");
		const metrics = (result as any).metrics || [];
		let nodes = 0;
		let listeners = 0;
		for (const m of metrics) {
			if (m.name === "Nodes") nodes = m.value;
			if (m.name === "JSEventListeners") listeners = m.value;
		}
		return { nodes, listeners };
	});

	// Real, browser-generated mouse input. chessground ignores synthesized events
	// (see BenchHooks.mouse), so a drag gesture can only be driven from here.
	await page.exposeFunction(
		"__benchMouse",
		async (action: "down" | "move" | "up", x: number, y: number) => {
			if (action === "move") {
				await page.mouse.move(x, y);
			} else if (action === "down") {
				await page.mouse.move(x, y);
				await page.mouse.down();
			} else {
				await page.mouse.move(x, y);
				await page.mouse.up();
			}
		},
	);

	// Wire the bindings into the bench API
	await page.evaluate((): void => {
		const w = (globalThis as any);
		if (w.__bench) {
			w.__bench.setHooks({
				collectGarbage: w.__benchCollectGarbage,
				heapUsed: w.__benchHeapUsed,
				domCounters: w.__benchDomCounters,
				mouse: w.__benchMouse,
			});
		}
	});
}

/**
 * Get browser name and version.
 */
export async function browserInfo(
	browser: Browser,
): Promise<{ name: string; version: string }> {
	const version = browser.version();
	return { name: "chromium", version };
}
