import { defineConfig, devices } from "@playwright/test";

// Not 5173: the demo's own `pnpm dev` uses that, and a developer with it already
// open would otherwise have the suite silently drive their session.
const PORT = 5273;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 2 : undefined,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

	use: {
		baseURL: BASE_URL,
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			// The viewport is pinned AFTER the device spread, not in the top-level
			// `use`: a device descriptor carries its own viewport (Desktop Chrome is
			// 1280x720) and would win. At 720 the board's bottom rank falls below
			// the fold and every gesture on rank 1 silently misses.
			use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
		},
	],

	webServer: {
		command: `pnpm --filter quadrum-demo dev --port ${PORT} --strictPort`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
