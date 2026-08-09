---
"quadrum": patch
---

Fix three rendering and input defects found by the new browser end-to-end suite:

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
