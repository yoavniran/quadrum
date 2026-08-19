# quadrum-react

## [0.3.1](https://github.com/yoavniran/quadrum/compare/quadrum-react@0.3.0...quadrum-react@0.3.1) (2026-08-19)


### Chores

* **quadrum-react:** Synchronize quadrum versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * quadrum bumped to 0.3.1
  * peerDependencies
    * quadrum bumped from >=0.1.0 <1 to >=0.3.1

## [0.3.0](https://github.com/yoavniran/quadrum/compare/quadrum-react@0.2.0...quadrum-react@0.3.0) (2026-08-17)


### ⚠ BREAKING CHANGES

* The tarballs shipped `src/` alongside `dist/`, so every module travelled twice -- once as TypeScript and once compiled, with the sourcemaps already embedding the same source a third time. `files` is now `dist` (plus core's `assets/`, which is a real published export), which takes `quadrum` from 359 kB unpacked across 81 files to 263 kB across 60, and `quadrum-react` to 28 kB across 11. Sourcemaps keep their embedded `sourcesContent`, so stepping into the original TypeScript still works.

### Features

* initial commit — quadrum board renderer ([10dc6de](https://github.com/yoavniran/quadrum/commit/10dc6def290f0cc11ddbd4cc8a8eca24b8dc544d))
* report every tap through select.onTap, and fix three input bugs ([77c4280](https://github.com/yoavniran/quadrum/commit/77c4280ecfb1041df60a900729d24011d87e558f))


### Bug fixes

* let react consumers stop a press from wiping their marks ([7f434ca](https://github.com/yoavniran/quadrum/commit/7f434ca4bdea94eb712465e4471d0faaa62126fd))


### Performance

* **core:** recycle mark nodes and pool fade gradients ([#42](https://github.com/yoavniran/quadrum/issues/42)) ([cbf9bbe](https://github.com/yoavniran/quadrum/commit/cbf9bbe984bca16ffdf13e5cbe4be3ac77533af3))


### Packaging

* stop 0.x minors versioning both packages as 1.0.0 ([2cf2d52](https://github.com/yoavniran/quadrum/commit/2cf2d52ab117991d32d1cc21d2280f3769f534aa))


### CI

* replace changesets with release-please ([#54](https://github.com/yoavniran/quadrum/issues/54)) ([318da5d](https://github.com/yoavniran/quadrum/commit/318da5d60211d4fda192959ed647ed122cceead9))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * quadrum bumped to 0.3.0
  * peerDependencies
    * quadrum bumped from >=0.1.0 <1 to >=0.3.0

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
