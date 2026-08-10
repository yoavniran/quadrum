# quadrum

## 0.2.2

### Patch Changes

- a0c9023: Keep a hand-drawn mark and an automatic one on the same squares instead of replacing one with the other.

  Auto marks (`marks.auto`) and user marks (`marks.user`) were folded into a single map keyed by from+to before rendering, so whichever came second silently dropped the other. Naming the same pair of squares is the common case — drawing over the move an engine is suggesting — and the collision read as the user's arrow disappearing the moment it was released: while it is being drawn it is the in-progress mark, which was set last and therefore won.

  The two sources are now deduped separately and painted auto-first, so a hand-drawn mark layers over an automatic one rather than replacing it. Deduping within a single source is unchanged, and the in-progress mark still supersedes the finished user mark it is redrawing.

## 0.2.1

### Patch Changes

- e295c43: Split an arrow across the piece layer so it starts behind the piece it comes from and
  lands on top of the piece it points at, instead of having its head cut off by that
  piece's base. The part inside the destination square is drawn into a new `.qd-heads`
  layer above the pieces; the shaft stays in `.qd-marks` below them and fades up to full
  opacity as it approaches the boundary, so the two halves meet at the same tone rather
  than stepping visibly mid-arrow.

  Only one of those shapes carries `data-mark`. `[data-mark]` therefore still selects one
  element per mark rather than one per shape, and the head — which belongs to the same
  mark, and repeats its `data-from`, `data-to` and `data-pen` — is found with
  `[data-mark-part="head"]`. Styling a whole arrow means selecting both.

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
