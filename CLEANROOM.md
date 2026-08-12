# Clean-room process

quadrum is an MIT-licensed chess board renderer. It exists in part to replace
[`chessground`](https://github.com/lichess-org/chessground) (GPL-3.0) in applications that
cannot ship GPL code. A permissive licence on a file is only worth what the provenance
behind it is worth, so quadrum is developed **clean-room**: no chessground source is
consulted during implementation.

This document is published so the claim can be examined rather than taken on faith. It
records the rules that were followed and what may be checked against the code. It is a
statement of process by quadrum's author, not legal advice, and not a warranty — the
warranty disclaimer in [`LICENSE`](./LICENSE) governs.

## Rules followed during implementation

1. **No chessground source is read, opened, copied, or referenced** while writing
   quadrum code. Not the repository, not the published bundle, not a vendored copy in
   `node_modules`.
2. The only permitted inputs are:
   - a **written design document** describing *behaviour* and *architecture* — what the
     board should do — never chessground's implementation. It is held in the author's
     private application repository, which is where the need for quadrum arose;
   - **observed public behaviour** of a chess board in a browser (what any user sees);
   - **chess domain facts** (piece movement, FEN grammar) — not copyrightable;
   - **MIT-licensed code already owned by this project's author**, from that same private
     application: its own `userShapes`, `pointerButtons` and `dragMove` modules, used as
     the behavioural reference for mark-drawing and drag semantics.
3. **API naming is deliberately quadrum's own** (`createBoard`/`update`/`position`/
   `sideToMove`/`marks`/…). Where a chessground term appears in the design document it
   appears only in a translation table, to describe a migration path for consumers,
   never as a shape to copy.
4. **DOM vocabulary is quadrum's own** (`qd-wrap`, `qd-board`, `qd-piece`, `qd-square`,
   `qd-coords`, and the state classes `target`/`recent`/`active`/`in-check`/`held`/
   `gliding`/`vanishing`/`trace`). No `cg-*` compatibility layer exists or will be
   added; a consumer migrating has to restyle deliberately, which is the point.
5. **The architecture diverges structurally by design**: percentage-based piece layout
   (no cached bounding-rect pixel math), two delegated pointer listeners bound once, a
   pure animation-planning function, and a declarative render pass for destination hints.
   These are the same divergences the README lists as quadrum's reasons to exist — they
   are not incidental, and each one is a place the two codebases cannot be aligned.

## What can be verified

Rules 3, 4 and 5 are checkable against this repository by anyone, without trusting the
author: the public API is in [`packages/core/src/index.ts`](./packages/core/src/index.ts),
the DOM vocabulary in [`packages/core/assets/quadrum.css`](./packages/core/assets/quadrum.css)
and the `view/` modules, and the layout and animation strategies in
[`packages/core/src/view`](./packages/core/src/view). Rules 1 and 2 are statements about
process, which no artifact can prove; they are recorded here so that they are on the
record and falsifiable in the ordinary way — by anyone who finds a passage in quadrum
that reads like chessground and says so, ideally as an issue.

## Benchmarks

Comparative benchmarks install `chessground` as a **development-only** dependency of
[`apps/bench`](./apps/bench), a private package that is never published. Running a
program to measure it is not reading its source, and no benchmark harness code derives
from it. The benchmark README carries its own statement of interest, since those numbers
are produced by quadrum's author about a competing project.
