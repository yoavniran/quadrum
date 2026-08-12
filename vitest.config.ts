import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			// The packages publish dist/ only, so the suites read their src/ from
			// here. Order matters: a string alias matches as a prefix, so the bare
			// "quadrum" entry must come last or it swallows every subpath above it
			// -- including "quadrum/assets/quadrum.css", which apps/bench's adapter
			// imports.
			"quadrum/assets/quadrum.css": r("./packages/core/assets/quadrum.css"),
			"quadrum/fen": r("./packages/core/src/fen.ts"),
			"quadrum/mobility": r("./packages/core/src/mobility.ts"),
			"quadrum/premove": r("./packages/core/src/premove.ts"),
			"quadrum-react": r("./packages/react/src/index.ts"),
			quadrum: r("./packages/core/src/index.ts"),
		},
		dedupe: ["react", "react-dom"],
	},
	test: {
		globals: true,
		environment: "jsdom",
		// The apps/bench entry is deliberate: stats.ts and the harness's
		// interleave/discard logic decide what the published benchmark numbers ARE,
		// so an off-by-one in a percentile silently changes the headline table.
		// The last entry covers release.yml's helper scripts, which live next to
		// the workflow that uses them rather than inside a package.
		include: [
			"packages/*/test/**/*.test.{ts,tsx}",
			"apps/bench/test/**/*.test.ts",
			".github/scripts/*.test.mjs",
		],
		setupFiles: [r("./test/setup.ts")],
		// The default worker-thread pool hangs indefinitely with jsdom on this
		// setup; forks are marginally slower to start and reliably terminate.
		pool: "forks",
		testTimeout: 10000,
	},
});
