---
"quadrum-react": minor
---

Add a `clearMarksOnPress` prop, and fix `apiRef` never being populated.

Core wipes the user's marks on any non-mark press, gated by `marks.clearOnPress`. The React
bindings never plumbed that option through — it was missing from `<Board>`'s props *and*
from `useBoard`'s `update()` call — so no consumer could switch it off. Marks survived a
position change and were still gone, because the press had already cleared them: the two
triggers are independent, and the press fires first.

`apiRef` was assigned in an effect whose dependencies are a ref and a ref — neither ever
changes identity — so it ran once, after the first commit, while the board was still null,
and never again. The imperative handle was null for the life of every board. It is now
assigned on each commit and released on unmount.
