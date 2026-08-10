import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		// Same as apps/demo: resolve the workspace packages through their "source"
		// export condition so the benchmark measures the CURRENT src/, never a stale
		// dist/. chessground has no "source" condition and falls through to
		// module/browser, which is what a real consumer gets.
		// Vite's defaults are listed explicitly because this REPLACES them.
		conditions: ["source", "module", "browser", "development|production"]
	},
	build: {
		// The runner always drives the production build. Sourcemaps stay on so a
		// long-task attribution can be traced back to a real function.
		target: "esnext",
		sourcemap: true
	}
});
