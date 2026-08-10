# quadrum-react

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
