import { defineConfig } from "vite";

// Cross-origin isolation unlocks 5µs performance.now() resolution; without it
// Chromium clamps the timer to 100µs and any sub-0.1ms bracket (a single
// position update) quantizes to 0.0, collapsing medians and making ratios
// non-finite. The bench page loads no cross-origin subresources, so COEP
// costs nothing here.
const isolationHeaders = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
	server: {
		headers: isolationHeaders,
	},
	preview: {
		headers: isolationHeaders,
	},
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
