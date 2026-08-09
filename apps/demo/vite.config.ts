import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Resolve the workspace packages through their "source" export condition, so
		// the demo compiles their TypeScript directly: HMR against src, and no
		// `pnpm build` needed before `pnpm dev`. Published consumers get dist/.
		// Vite's defaults are listed explicitly because this REPLACES them.
		conditions: ["source", "module", "browser", "development|production"],
		// Two React copies produce an "Invalid hook call" crash.
		dedupe: ["react", "react-dom"]
	}
});
