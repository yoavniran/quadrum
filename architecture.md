# quadrum — architecture

quadrum renders a chess board. It does not know the rules of chess. Legal destinations,
promotion policy and turn order are supplied by the consumer, which keeps the library
small and usable with any engine (chess.js, a server, a variant).

## Layout of the repo

```
packages/core     quadrum         — the renderer, zero dependencies
packages/react    quadrum-react   — <Board> + useBoard
apps/demo         quadrum-demo    — tier-1 demo: a free-move 2D board
test/setup.ts     jsdom shims shared by both packages' suites
```

`apps/demo` supplies its own board chrome (`src/board-chrome.css`): checkerboard, piece
glyphs, square decorations, coordinate placement, cursors. None of that is the library's
to ship — see "No theme" below — so every consumer authors an equivalent, and the demo is
the worked example. Its pieces are Unicode glyphs on `qd-piece::after`, so the repo carries
no binary art and no font licence.

Both packages publish a real build (`dist/`, ESM + declarations) but resolve to `src/`
inside the repo, via a `"source"` export condition that `tsconfig.base.json` and the
demo's Vite config opt into. Consumers get compiled JS; the repo never reads a stale
`dist/`.

## The core package

```
src/
  board.ts        the Board class — the only stateful thing in the library
  options.ts      BoardOptions (partial, user-facing) → BoardState (total, internal)
  types.ts        Square, Piece, Mark, Pen, handler signatures
  model/          pure functions, no DOM
    squares.ts    algebraic square ↔ (x, y) point, per orientation
    position.ts   FEN placement ↔ Pieces map
    mobility.ts   premove target table (optional, opt-in)
    diffPlan.ts   old position + new position → moves / fades / appears
  view/           DOM writers, no state of their own
    layout.ts     builds the element skeleton once; wrap-level classes and coords
    piecesView.ts creates and positions <qd-piece>
    squaresView.ts square decorations (target, recent, active, in-check, hover)
    marksView.ts  arrows, circles and badges into the two SVG layers
    promotionView.ts the promotion chooser overlay
    animator.ts   a single rAF loop with an easing function
  input/          pointer handling, no DOM writes of its own
    gestures.ts   binds pointer events once; normalises them into press/drag/release
    moveInput.ts  select, click-to-move, drag-to-move, promotion
    markInput.ts  right-drag arrows and circles
```

### State flow

`BoardOptions` is a deep-partial patch. `applyOptions(state, options)` folds it into a
new total `BoardState` — cloning the pieces map and each option group rather than
aliasing, so callers may treat the returned state as wholly theirs. `Board.update()`
applies the patch, plans an animation against the previous pieces, and re-renders.

Rendering is a full declarative pass: every render writes squares, pieces, marks and the
promotion overlay from the current state. Nothing is drawn imperatively at interaction
time, which is what keeps target hints, pen colours and lock state from going stale.

### Geometry — percentages, never measurements

A piece is `12.5%` wide and tall and positioned with
`transform: translate(x * 100%, y * 100%)`. **No render path reads layout.** Resizing is
handled entirely by the browser; there is nothing to invalidate and no cached rect to go
stale. Bounding rects are read exactly once per pointer gesture, in `gestures.ts`, to map
a client coordinate onto a square.

Orientation is a pure function of the square:

| orientation | x | y |
| --- | --- | --- |
| white | `fileIndex` | `7 - rankIndex` |
| black | `7 - fileIndex` | `rankIndex` |

Both SVG layers use `viewBox="0 0 800 800"`, i.e. 100 units per square, so mark geometry
is written in square-relative units and scales with the board for free.

### Input

`bindGestures` binds pointer handlers to the wrap **once**, at construction, and never
rebinds. Everything conditional — `locked`, `moves.free`, `select.enabled`,
`marks.enabled` — is a guard read inside the handler from live state. This is why
toggling `locked` takes effect immediately with no redraw.

`Board` implements `MoveContext` and `MarkContext`: the two controllers see the board
only through a narrow interface (`state()`, `setCurrent()`, `commit()`, …), so they stay
testable without a DOM board.

### Animation

`planDiff(before, after, opts)` pairs vanished and appeared pieces by colour and role
into `moves`, leaving the unpaired ones as `fades` and `appears`. `opts.exclude` drops
the square a drag started from — that piece is already under the pointer and must not be
animated. A single `Animator` drives all of it from one rAF loop.

## The React package

`useBoard(ref, options)` owns the imperative board's lifetime. Two effects, and the split
between them is the whole design:

- **Construction** (deps: `[element]`) creates the board once and nests *stable wrapper*
  callbacks into the option groups. The wrappers read the latest handlers from a ref, so
  a consumer passing inline arrow functions never recreates the board.
- **Update** (deps: the individual *leaf* option values, never the option-group objects
  and never the handlers) calls `board.update()`. Depending on group identity would fire
  an update on every render, because `<Board>` rebuilds those objects each time.

`<Board>` is a controlled component over that hook. `update({ position })` never clears
user marks; a consumer that wants lichess-style clearing opts in with
`clearMarksOnPositionChange`.

## Deliberate non-goals

- **No rules.** No legality checking, no check detection, no move generation. The
  optional `quadrum/mobility` subpath offers a *premove* table only, and in chess960 it
  intentionally returns friendly-occupied squares (king-takes-rook): the consumer must
  not filter them and the board must never optimistically apply them.
- **No theme.** The shipped CSS is structural only. The DOM is light-DOM and plainly
  named so ordinary application CSS can reach it.
- **No framework coupling in core.** React lives in its own package.

## Running it

See the Development section of [`README.md`](./README.md) — `pnpm install`, `pnpm test`,
`pnpm typecheck`, `pnpm build`. `pnpm dev` serves `apps/demo` through Vite, which compiles
the packages' TypeScript source directly (via the `source` condition) and is the standing
proof that a real bundler can consume them. CI runs typecheck, tests, `pnpm build` and a
demo build on every PR; see the Building and releasing section of the README.
