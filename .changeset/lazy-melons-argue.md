---
"quadrum": patch
---

Split an arrow across the piece layer so it starts behind the piece it comes from and
lands on top of the piece it points at, instead of having its head cut off by that
piece's base. The part inside the destination square is drawn into a new `.qd-heads`
layer above the pieces; the shaft stays in `.qd-marks` below them and fades up to full
opacity as it approaches the boundary, so the two halves meet at the same tone rather
than stepping visibly mid-arrow.

Only one of those shapes carries `data-mark`. `[data-mark]` therefore still selects one
element per mark rather than one per shape, and the head — which belongs to the same
mark, and repeats its `data-from`, `data-to` and `data-pen` — is found with
`[data-mark-part="head"]`. Styling a whole arrow means selecting both.
