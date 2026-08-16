# quadrum-react

## 0.3.0

### Minor Changes

- 6047a42: Publish `dist/` only, and carry an explicit MIT notice in it.

  The tarballs shipped `src/` alongside `dist/`, so every module travelled twice — once as TypeScript and once compiled, with the sourcemaps already embedding the same source a third time. `files` is now `dist` (plus core's `assets/`, which is a real published export), which takes `quadrum` from 359 kB unpacked across 81 files to 263 kB across 60, and `quadrum-react` to 28 kB across 11. Sourcemaps keep their embedded `sourcesContent`, so stepping into the original TypeScript still works.

  With `src/` unpublished, the undocumented `"source"` export condition that pointed at it is gone too. Nothing resolves it by default; only a consumer who had deliberately opted into a `source` condition in their bundler or `customConditions` is affected, and removing that opt-in restores normal `dist/` resolution. The public `exports` subpaths (`quadrum`, `quadrum/fen`, `quadrum/mobility`, `quadrum/premove`, `quadrum/assets/quadrum.css`, `quadrum-react`) are unchanged, as are their types and runtime behaviour.

  Separately, `dist/` now carries an SPDX notice via a tsup banner, and the shipped `assets/quadrum.css` carries one directly. The licence was stated in `package.json`, the per-package `LICENSE` and the README, but nowhere in the code itself — so a file read on its own, which is how vendored or copied code is usually met, said nothing about its terms.

## 0.2.0

### Minor Changes

- d387a07: Report every completed click through a new `select.onTap` handler (`onSquareTap` on
  the React `<Board>`), empty squares included. Selection cannot stand in for this: it
  only lands on squares a piece can move _from_, so a press on an empty square reports
  `null`. A consumer that edits the position rather than playing it — stamping a piece
  down, erasing a square — needs the square actually pressed, whatever is standing on it.
- ee488f7: Raise the supported Node floor to 24. `engines.node` was `>=20`; CI, the release
  workflow and the whole workspace already targeted 24, so this makes the declared
  range match what is actually built and tested against.
- 856ebf4: Add a `clearMarksOnPress` prop, and fix `apiRef` never being populated.

  Core wipes the user's marks on any non-mark press, gated by `marks.clearOnPress`. The React
  bindings never plumbed that option through — it was missing from `<Board>`'s props _and_
  from `useBoard`'s `update()` call — so no consumer could switch it off. Marks survived a
  position change and were still gone, because the press had already cleared them: the two
  triggers are independent, and the press fires first.

  `apiRef` was assigned in an effect whose dependencies are a ref and a ref — neither ever
  changes identity — so it ran once, after the first commit, while the board was still null,
  and never again. The imperative handle was null for the life of every board. It is now
  assigned on each commit and released on unmount.

### Patch Changes

- b730fef: Widen the `quadrum` peer dependency from `^0.1.0` to `>=0.1.0 <1`. A caret on a 0.x
  version admits only 0.1.x, so every routine minor release of the core package fell out of
  the binding's declared range and read as a breaking change — which is not true of a 0.x
  minor, and which pushed both packages to a 1.0.0 nobody asked for. The `<1` bound is kept
  so the eventual real 1.0.0 still registers as the breaking change it is.
