import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			quadrum: r("./packages/core/src/index.ts"),
		},
		dedupe: ["react", "react-dom"],
	},
	test: {
		globals: true,
		environment: "jsdom",
		include: ["packages/*/test/**/*.test.{ts,tsx}"],
		setupFiles: [r("./test/setup.ts")],
		// The default worker-thread pool hangs indefinitely with jsdom on this
		// setup; forks are marginally slower to start and reliably terminate.
		pool: "forks",
		testTimeout: 10000,
	},
});
