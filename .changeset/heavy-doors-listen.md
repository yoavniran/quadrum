---
"quadrum": minor
"quadrum-react": minor
---

Publish `dist/` only, and carry an explicit MIT notice in it.

The tarballs shipped `src/` alongside `dist/`, so every module travelled twice — once as TypeScript and once compiled, with the sourcemaps already embedding the same source a third time. `files` is now `dist` (plus core's `assets/`, which is a real published export), which takes `quadrum` from 359 kB unpacked across 81 files to 263 kB across 60, and `quadrum-react` to 28 kB across 11. Sourcemaps keep their embedded `sourcesContent`, so stepping into the original TypeScript still works.

With `src/` unpublished, the undocumented `"source"` export condition that pointed at it is gone too. Nothing resolves it by default; only a consumer who had deliberately opted into a `source` condition in their bundler or `customConditions` is affected, and removing that opt-in restores normal `dist/` resolution. The public `exports` subpaths (`quadrum`, `quadrum/fen`, `quadrum/mobility`, `quadrum/premove`, `quadrum/assets/quadrum.css`, `quadrum-react`) are unchanged, as are their types and runtime behaviour.

Separately, `dist/` now carries an SPDX notice via a tsup banner, and the shipped `assets/quadrum.css` carries one directly. The licence was stated in `package.json`, the per-package `LICENSE` and the README, but nowhere in the code itself — so a file read on its own, which is how vendored or copied code is usually met, said nothing about its terms.
