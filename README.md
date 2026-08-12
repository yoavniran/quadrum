<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img src="docs/assets/logo-light.png" alt="quadrum" width="160">
  </picture>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/quadrum"><img src="https://img.shields.io/npm/v/quadrum?label=quadrum&color=blue" alt="quadrum on npm"></a>
  <a href="https://www.npmjs.com/package/quadrum-react"><img src="https://img.shields.io/npm/v/quadrum-react?label=quadrum-react&color=blue" alt="quadrum-react on npm"></a>
  <a href="https://github.com/yoavniran/quadrum/actions/workflows/ci.yml"><img src="https://github.com/yoavniran/quadrum/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/quadrum?color=green" alt="MIT licence"></a>
</p>

# Quadrum

A small, MIT-licensed, **zero-dependency** chess **board renderer** for the web, with
first-party React bindings.

quadrum draws a chess board and the pieces on it, animates moves, handles selection,
click-to-move, dragging and hand-drawn arrows and circles. It does **not** know the rules
of chess: legal destinations are handed in by the consumer, which keeps it usable with
any rules engine (chess.js, a server, a variant) and keeps the library small.

> **Status: early.** Published on npm and in use, but still pre-1.0 — the API is
> settled in shape and may still shift in detail before it is frozen.

## Why it exists

The obvious existing choice, [chessground](https://github.com/lichess-org/chessground), is
GPL-3.0, which many applications cannot ship. quadrum is a clean-room MIT alternative —
the rules that were followed, and which of them you can verify yourself, are written down
in **[CLEANROOM.md](./CLEANROOM.md)**.
It also fixes a handful of structural problems that force chessground consumers to write workarounds:

| Problem | quadrum's answer |
| --- | --- |
| Piece positions come from a **cached** bounding rect, so a resize silently misaligns clicks until the consumer forces a redraw | Pieces are laid out in **percentages** (`12.5%` + `translate(x*100%, y*100%)`). Resizing is handled by the browser; there is nothing to invalidate |
| Setting a new position silently wipes the user's arrows | `update({ position })` never touches user marks. Clearing them is the consumer's explicit policy |
| Toggling "view only" updates state but leaves input dead until a redraw | Pointer handlers are bound **once**; the lock is a guard inside the handler, so it always works |
| Arrow colours are cached by brush key, so a theme swap leaves stale colours | Pen colour is read at render time |
| Arrow opacity applies to the stem but not the head | Opacity is applied to a group wrapping both |
| Destination hints are drawn imperatively at selection time | They are part of the normal declarative render pass |

### Performance

Measured against [chessground](https://github.com/lichess-org/chessground) 9.2.1, installed as a
dev-only dependency of the benchmark app and never shipped.

<!-- bench:headline:start -->
_No published run yet. The table below is generated from a scheduled benchmark run and spliced in
between these markers; it will appear after the first nightly run lands._
<!-- bench:headline:end -->

Absolute milliseconds on a throttled shared runner are not desktop numbers; the ratios are the
durable part. The benchmarks are written and run by quadrum's author — full statement of interest,
methodology, every scenario, dispersion and raw samples:
**[apps/bench/README.md](apps/bench/README.md)**.

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
pnpm test:e2e    # playwright, real browser (see below)
pnpm dev         # serve apps/demo at http://localhost:5173
```

### Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`type(scope): subject`), with the allowed types and a 72-character subject limit set in
`commitlint.config.js`. `pnpm install` installs a `commit-msg` hook that checks the
message as you commit; CI re-checks every commit in a PR *and* the PR title, since a
squash merge keeps the title and discards the commits.

Note what this does **not** do: the changelog is generated by changesets from the files
in `.changeset/`, not from commit messages. A `feat:` prefix will not bump a version or
write a changelog entry — that is the changeset's job (see below). The convention is
there for a readable history, not for release automation.

### End-to-end tests

`e2e/` drives the demo app in Chromium with Playwright. It is shallow and wide: one or
two tests per feature across movement, orientation, targets, marks (arrows, circles,
pens), premoves, chess960 castling and the promotion picker.

Every gesture is a **real** one — `page.mouse` presses, moves and releases at real pixel
coordinates, and clicks on the demo's own controls. Nothing in the suite calls quadrum's
API or pokes React state, because the layer being tested *is* pointer handling and
percentage layout, and jsdom can observe neither.

```bash
pnpm test:e2e      # headless; starts the demo on :5273 itself
pnpm test:e2e:ui   # Playwright's UI mode, for writing or debugging a spec
```

Requires the browser once: `pnpm exec playwright install chromium`. The suite also runs
as its own CI job on every PR.

### The demo app

`apps/demo` is the demo and the e2e fixture: a board with free / targeted / premove
modes, chess960 castling, a promotion picker, arrows and circles, and toggles for lock,
drag, off-board removal and mark behaviour, plus readouts for placement, last move, move
count, marks and the premove queue. It is the only place quadrum runs in a real browser,
so run it whenever you change rendering, layout or input.

Every control carries an accessible name, and the demo's readouts are `data-testid`
nodes — both exist so the e2e suite can drive and read the app the way a person would.

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
`tsc --emitDeclarationOnly`; the output lands in each package's `dist/`. The published
tarballs are that `dist/` (JS, declarations and sourcemaps) plus core's
`assets/quadrum.css` — no `src/`. Sourcemaps keep their embedded `sourcesContent`, so a
consumer still debugs the original TypeScript without it being shipped twice.

In-repo, nothing depends on `dist/` being fresh: `quadrum` and `quadrum-react` are mapped
to their own `src/` by `paths` in `tsconfig.base.json` and by a matching `resolve.alias`
in `vitest.config.ts` and each app's Vite config. So `pnpm typecheck`, `pnpm test` and
`pnpm dev` all work against TypeScript source with no `dist/` present, and can never read
a stale build. The one exception is deliberate: `packages/react/tsconfig.build.json`
clears `paths`, so its declaration emit resolves `quadrum` to core's built `dist/*.d.ts`
the way a consumer does.

Releases are driven by [changesets](https://github.com/changesets/changesets): add one
with `pnpm changeset` in any PR that changes published code. CI posts a warning — not a
failure — on a PR that touches `packages/*/src` without one, because a comment fix or a
behaviour-preserving refactor legitimately has nothing to announce. On merge to `main`,
`.github/workflows/release.yml` opens a "Version Packages" PR; merging *that* publishes to
npm via trusted publishing (OIDC — no token) and tags a GitHub release.

That PR is titled `chore: version packages 0.2.0` — it names the version it would release,
so the queued release is legible from the PR list without opening anything. The version has
to be computed *before* `changeset version` runs, because the changesets action takes the
title as a static input; `.github/scripts/release-report.mjs` derives it from
`changeset status`, which builds the same release plan and only reports it. The same script
writes the run summary: a table of every package's old → new version on a version-PR run,
and of what actually reached npm on a publish run.

Two settings exist purely to keep 0.x releases from over-bumping, and are worth
understanding before changing either. `quadrum-react` peer-depends on `quadrum` as
`>=0.1.0 <1`, not `^0.1.0`, because a caret on a 0.x version only admits 0.1.x — so a
routine `0.1.0 → 0.2.0` minor on core would fall *out* of the binding's declared range.
Changesets reads that as a breaking change to `quadrum-react` and bumps it **major**; the
`linked` pair then drags core up with it, and a pile of minor and patch changesets
silently versions both packages **1.0.0**. The widened range keeps every 0.x minor in
range, and `onlyUpdatePeerDependentsWhenOutOfRange` stops changesets bumping the binding
for a peer change that is not actually breaking. The `<1` bound is deliberate: the real
1.0.0 *does* fall out of range, so that one transition still bumps both to 1.0.0, which is
correct. After 1.0.0 the whole problem disappears, since `^1.x` admits every 1.x minor.

### Publishing setup

Everything below is **account and repository configuration** — none of it lives in the
repo, and the release workflow cannot succeed until it is done. It is a one-time list.

**1. Let Actions open pull requests.** Repo Settings → Actions → General → Workflow
permissions → tick *"Allow GitHub Actions to create and approve pull requests"*.

This defaults to **off**, and it is the first thing that breaks. `release.yml` already
requests `pull-requests: write`, but that permission is not sufficient — the repo toggle
overrides it. Without it the workflow pushes `changeset-release/main` and then fails with
`GitHub Actions is not permitted to create or approve pull requests`.

**2. Claim the names on npm.** An npm account with 2FA enabled, and the names `quadrum`
and `quadrum-react` unregistered.

**3. Publish 0.1.0 by hand, once.** Trusted publishing is configured on a package's
settings page, and a package that has never been published has no settings page — so the
first release cannot be automated. Core goes first, since `quadrum-react` peer-depends on
it:

```bash
npm login
pnpm build
cd packages/core && npm publish
cd ../react && npm publish
```

**4. Point each package at this workflow.** On npmjs.com, for each of `quadrum` and
`quadrum-react`: Settings → Trusted publishers → GitHub Actions, with repository
`yoavniran/quadrum` and workflow `release.yml`.

After this every later release is automatic, and **no `NPM_TOKEN` secret is needed** —
OIDC replaces it. Do not add one. Optionally then set the packages to *"Require
two-factor authentication and disallow tokens"*: trusted publishing keeps working,
because it does not authenticate with a token.

Trusted publishing needs npm ≥ 11.5.1 and Node ≥ 22.14 — `release.yml` installs
`npm@latest` rather than trusting whatever the runner image ships.

## License

MIT — see [`LICENSE`](./LICENSE).
