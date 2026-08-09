# quadrum

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

### Patch Changes

- f46b028: Fix three rendering and input defects found by the new browser end-to-end suite:

  - `renderPieces` left the previous element in the DOM when a square changed occupant
    (capture, promotion, or a new position), so the square ended up with two pieces on it
    and the stale one never left.
  - The promotion picker was rebuilt on every render, and since pointer movement triggers
    renders, the cell was swapped out between press and release and could never be clicked.
    An unchanged request is now a no-op.
  - A press on a promotion cell also reached the board's move layer and played a move to
    whatever square the cell sat over. The picker now swallows raw pointer events, and
    `play` no-ops instead of throwing when the origin square is empty.

  Marks also carry `data-mark`, `data-from`, `data-to` and `data-pen` attributes, so a
  rendered arrow or circle can be identified from the DOM.

- d387a07: Three input and rendering fixes:

  - `premoveTargets` no longer withholds squares occupied by your own pieces. A premove
    answers a reply that has not arrived, so own-occupancy does not rule a square out —
    the bet is that the opponent captures that piece. Occupancy now only decides where a
    ray stops, never whether its final square is offered.
  - A selection whose piece has since gone — erased by the consumer, or swapped out with
    the position — is dropped instead of wedging the board. Previously every later press
    read as "play from the selected square", returned early, and never armed a drag or
    picked a new selection.
  - The in-check highlight works again when `checkSide` is a colour. Both a square and a
    colour are strings, so the `typeof === "string"` test matched the colour case too and
    dropped the highlight entirely.
