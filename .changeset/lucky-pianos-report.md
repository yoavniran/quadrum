---
"quadrum": minor
"quadrum-react": minor
---

Report every completed click through a new `select.onTap` handler (`onSquareTap` on
the React `<Board>`), empty squares included. Selection cannot stand in for this: it
only lands on squares a piece can move *from*, so a press on an empty square reports
`null`. A consumer that edits the position rather than playing it — stamping a piece
down, erasing a square — needs the square actually pressed, whatever is standing on it.
