---
"quadrum": patch
---

Three input and rendering fixes:

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
