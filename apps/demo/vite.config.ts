import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const pkg = (p: string) => fileURLToPath(new URL(`../../packages/${p}`, import.meta.url));

export default defineConfig({
	plugins: [react()],
	resolve: {
		// The workspace packages publish dist/ only, so the demo points at their
		// TypeScript source itself: HMR against src, and no `pnpm build` needed
		// before `pnpm dev`. Published consumers resolve dist/ normally.
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
		},
		// Two React copies produce an "Invalid hook call" crash.
		dedupe: ["react", "react-dom"]
	}
});
