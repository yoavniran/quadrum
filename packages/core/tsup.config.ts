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
	// The licence notice for dist/, which is the only JavaScript that ships. It is
	// applied here rather than by header comments in src/, because esbuild only keeps
	// comments it recognises as legal (`/*!`, `@license`, `@preserve`) -- a plain
	// `// SPDX-License-Identifier` would be stripped from the bundle anyway. The
	// hand-written `assets/quadrum.css` ships as-is and carries its own header.
	banner: {
		js: "/*! quadrum | SPDX-License-Identifier: MIT | Copyright (c) 2026 Yoav Niran */",
	},
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
