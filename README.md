# quadrum

A small, MIT-licensed, **zero-dependency** chess **board renderer** for the web, with
first-party React bindings.

quadrum draws a chess board and the pieces on it, animates moves, handles selection,
click-to-move, dragging and hand-drawn arrows and circles. It does **not** know the rules
of chess: legal destinations are handed in by the consumer, which keeps it usable with
any rules engine (chess.js, a server, a variant) and keeps the library small.

> **Status: pre-alpha.** The API is settled but nothing is published yet.

## Why it exists

The obvious existing choice, [chessground](https://github.com/lichess-org/chessground), is
GPL-3.0, which many applications cannot ship. quadrum is a clean-room MIT alternative.
It also fixes a handful of structural problems that force chessground consumers to write workarounds:

| Problem | quadrum's answer |
| --- | --- |
| Piece positions come from a **cached** bounding rect, so a resize silently misaligns clicks until the consumer forces a redraw | Pieces are laid out in **percentages** (`12.5%` + `translate(x*100%, y*100%)`). Resizing is handled by the browser; there is nothing to invalidate |
| Setting a new position silently wipes the user's arrows | `update({ position })` never touches user marks. Clearing them is the consumer's explicit policy |
| Toggling "view only" updates state but leaves input dead until a redraw | Pointer handlers are bound **once**; the lock is a guard inside the handler, so it always works |
| Arrow colours are cached by brush key, so a theme swap leaves stale colours | Pen colour is read at render time |
| Arrow opacity applies to the stem but not the head | Opacity is applied to a group wrapping both |
| Destination hints are drawn imperatively at selection time | They are part of the normal declarative render pass |

## Packages

| Package | What it is |
| --- | --- |
| `quadrum` | The renderer. Framework-agnostic, zero dependencies |
| `quadrum-react` | React bindings: a controlled `<Board>` component and a `useBoard` hook |

Subpath entries: `quadrum/fen` (FEN placement read/write), `quadrum/mobility`
(a premove mobility table), `quadrum/assets/quadrum.css` (structural CSS).

## Quick start

```ts
import { createBoard } from "quadrum";
import "quadrum/assets/quadrum.css";

const board = createBoard(document.getElementById("board")!, {
	position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
	orientation: "white",
	moves: {
		targets: new Map([["e2", ["e3", "e4"]]]),
		onPlayed: (from, to) => console.log(from, to),
	},
});

board.update({ position: nextFen, lastMove: ["e2", "e4"] });
```

React:

```tsx
import { Board } from "quadrum-react";
import "quadrum/assets/quadrum.css";

<Board
	position={fen}
	orientation="white"
	targets={legalDests}
	lastMove={lastMove}
	onMove={(from, to) => play(from, to)}
/>;
```

## Styling

The shipped CSS is **structural only** — no colours, no board squares, no piece art. That
is deliberate: theming is the application's job, and quadrum's DOM is plain and
light-DOM so ordinary CSS can reach it.

```
<div class="qd-wrap interactive" data-orientation="white">
  <qd-board>
    <qd-square class="recent" data-square="e4"></qd-square>
    <qd-piece class="white rook" data-square="h1"></qd-piece>
  </qd-board>
  <svg class="qd-marks" viewBox="0 0 800 800">…</svg>
  <svg class="qd-badges" viewBox="0 0 800 800">…</svg>
  <qd-coords class="ranks">…</qd-coords>
  <qd-coords class="files">…</qd-coords>
  <qd-overlay></qd-overlay>
</div>
```

Paint the board itself as the background of `qd-board`, and piece art as
`background-image` on `qd-piece.white.rook` and friends.

State classes: `qd-square` carries `target` (`+capture` / `+friendly`), `recent`,
`active`, `in-check`, `hover`; `qd-piece` carries `held` (dragging), `gliding`
(animating), `vanishing` (captured), `trace` (drag origin), `appearing`.

## Development

```bash
pnpm install
pnpm test        # vitest, jsdom
pnpm typecheck   # tsc across both packages
pnpm dev         # serve apps/demo at http://localhost:5173
```

### The demo app

`apps/demo` is the tier-1 demo: a free-move 2D board where any piece can be dragged or
clicked to any square, plus Flip / Reset / Clear and a live placement readout. It is the
only place quadrum runs in a real browser, so run it whenever you change rendering,
layout or input.

```bash
pnpm dev                             # dev server with HMR
pnpm --filter quadrum-demo build     # production build into apps/demo/dist
pnpm --filter quadrum-demo preview   # serve that build
```

The demo authors every board *visual* itself in `src/board-chrome.css` — checkerboard,
piece glyphs (Unicode, no image assets), square decorations, coordinates, cursors —
because quadrum's own CSS is structural only. Copy that file as the starting point for a
new consumer.

## Building and releasing

`pnpm build` bundles both packages with tsup (ESM only) and emits declarations with
`tsc --emitDeclarationOnly`; the output lands in each package's `dist/`. That is what npm
consumers get.

In-repo, nothing depends on `dist/` being fresh: each package's `exports` map carries a
`"source"` condition pointing at `src/`, and both `tsconfig.base.json`
(`customConditions`) and the demo's Vite config resolve it. So `pnpm typecheck`,
`pnpm test` and `pnpm dev` all work against TypeScript source with no `dist/` present,
and can never read a stale build.

Releases are driven by [changesets](https://github.com/changesets/changesets): add one
with `pnpm changeset` in any PR that changes published code. On merge to `main`,
`.github/workflows/release.yml` opens a "Version Packages" PR; merging *that* publishes to
npm via trusted publishing (OIDC — no token) and tags a GitHub release.

## License

MIT — see [`LICENSE`](./LICENSE).
