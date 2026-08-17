import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

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
		// Same as apps/demo: point the workspace packages at their own src/ so the
		// benchmark measures the CURRENT source, never a stale dist/. chessground is
		// left to normal resolution, which is what a real consumer gets.
		//
		// Order matters -- Vite matches a string alias as a prefix, so the bare
		// "quadrum" entry must come last or it swallows every subpath above it.
		alias: {
			"quadrum/assets/quadrum.css": pkg("core/assets/quadrum.css"),
			"quadrum/fen": pkg("core/src/fen.ts"),
			"quadrum/mobility": pkg("core/src/mobility.ts"),
			"quadrum/premove": pkg("core/src/premove.ts"),
			"quadrum-react": pkg("react/src/index.ts"),
			quadrum: pkg("core/src/index.ts")
		}
	},
	build: {
		// The runner always drives the production build. Sourcemaps stay on so a
		// long-task attribution can be traced back to a real function.
		target: "esnext",
		sourcemap: true,
		rollupOptions: {
			// Three pages, and the split is the isolation mechanism. Each frame
			// page imports exactly ONE adapter, so Rollup emits one CSS bundle
			// per subject and neither library's stylesheet can reach the
			// other's document. Collapsing these back into a single entry would
			// silently restore the shared-stylesheet contamination.
			input: {
				index: page("index.html"),
				"frame-quadrum": page("frame-quadrum.html"),
				"frame-chessground": page("frame-chessground.html")
			}
		}
	}
});
