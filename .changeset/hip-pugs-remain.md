---
"quadrum": patch
---

Keep a hand-drawn mark and an automatic one on the same squares instead of replacing one with the other.

Auto marks (`marks.auto`) and user marks (`marks.user`) were folded into a single map keyed by from+to before rendering, so whichever came second silently dropped the other. Naming the same pair of squares is the common case — drawing over the move an engine is suggesting — and the collision read as the user's arrow disappearing the moment it was released: while it is being drawn it is the in-progress mark, which was set last and therefore won.

The two sources are now deduped separately and painted auto-first, so a hand-drawn mark layers over an automatic one rather than replacing it. Deduping within a single source is unchanged, and the in-progress mark still supersedes the finished user mark it is redrawing.
