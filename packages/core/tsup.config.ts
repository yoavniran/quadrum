import { defineConfig } from "tsup";

// One entry per public subpath in package.json's "exports". Keeping them as
// separate entries (rather than one bundle) means a consumer importing only
// `quadrum/fen` never pulls the renderer into their graph.
export default defineConfig({
	entry: {
		index: "src/index.ts",
		fen: "src/fen.ts",
		mobility: "src/mobility.ts",
		premove: "src/premove.ts",
	},
	format: ["esm"],
	// Declarations come from `tsc -p tsconfig.build.json`, not tsup: tsup's dts
	// builds on rollup-plugin-dts, which is pinned to the TypeScript 5.x compiler
	// API and crashes against this repo's TypeScript 7.
	dts: false,
	sourcemap: true,
	clean: true,
	treeshake: true,
	target: "es2022",
	// quadrum has no dependencies, so there is nothing to externalise.
});
