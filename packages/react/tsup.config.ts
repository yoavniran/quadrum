import { defineConfig } from "tsup";

export default defineConfig({
	entry: { index: "src/index.ts" },
	format: ["esm"],
	// Declarations come from `tsc -p tsconfig.build.json`, not tsup: tsup's dts
	// builds on rollup-plugin-dts, which is pinned to the TypeScript 5.x compiler
	// API and crashes against this repo's TypeScript 7.
	dts: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	// `quadrum` and `react` are peers — they must resolve to the consumer's copy,
	// never be inlined here. Two React copies produce "Invalid hook call".
	external: ["react", "react-dom", "react/jsx-runtime", "quadrum"],
});
