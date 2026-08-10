# Benchmarks: quadrum vs chessground

Design document for `apps/bench`. Written before the code, kept in step with it.

## Why this exists

quadrum's README makes six **structural** claims against chessground — cached bounding rect,
`set position` wiping arrows, view-only not rebinding, brushes cached by key, arrow opacity on
the stem, imperative dest hints. Every one is a correctness argument, and until now there was
not a single number anywhere in the repo to go with them.

chessground runs lichess. It is fast, and everybody knows it. The honest pitch is therefore
*"as fast where it's fast, structurally better where it's weak, with numbers"* — and that
sentence was unsupportable without this app.

`CLEANROOM.md` settles the licence question up front: chessground may be installed as a
**development-only** dependency of a benchmark harness that is never published. Running a
program to measure it is not reading its source, and no harness code derives from it.

## Six decisions that drive everything else

1. **Vanilla TS, no React.** `apps/demo` is React because it is the e2e fixture. A reconciler
   between the Run button and `performance.now()` is noise, and it would muddy the animated
   update scenario outright.
2. **Benchmarks run against `vite build` + `vite preview`, never the dev server.** Under
   `pnpm dev` quadrum resolves through the `source` condition — raw TS, per-module esbuild, no
   tree-shaking — while chessground is a prebuilt minified ESM package. Timing those against
   each other measures build pipelines, not renderers. This is the single easiest way to
   publish a wrong number, so it is enforced in code: `assertProductionBuild()` throws under
   `import.meta.env.DEV` unless `?allow-dev` is passed, and the mode is recorded in the JSON.
3. **Piece-art parity, given to quadrum at runtime.** quadrum ships structural CSS only; the
   demo paints Unicode glyphs on `qd-piece::after` at `font-size: 9cqw`. Glyph shaping and SVG
   rasterisation are different work, and the `cqw` binding would re-shape 32 text runs on every
   *resize* — a cost chessground never pays, producing a **wrong-signed** result on the marquee
   scenario. So both boards get chessground's cburnett art.

   **But no chessground bytes are committed to this repo.** Its art is GPL base64 inside its
   CSS; copying it into an MIT repo is a real licensing problem. `adapters/shared/piece-art.ts`
   instead mounts twelve throwaway probe `<piece>` elements, reads the computed
   `background-image` off each, and injects the same values onto `qd-piece` at runtime. Perfect
   parity, zero GPL bytes on disk. It throws loudly if any of the twelve is missing — silent
   partial parity is worse than a hard failure.

   The rejected alternative, "compare each library as it ships", measures *themes*; quadrum has
   no theme, so it would compare against CSS the author wrote. The shipped-CSS question is real,
   but it is a **bundle-size** question and is answered there, in two rows.
4. **The headless runner is a plain Node script driving Playwright**, not a Playwright config or
   project. `testDir: "./e2e"` is shared, so bench specs would land in the functional gate.
   Playwright's value is assertions, retries, parallelism and fixtures — and a benchmark wants
   the opposite of all four. **A retried benchmark is a cherry-picked benchmark.**
5. **One scenario measures one adapter at a time.** The harness owns warmup, interleaving and
   repetition, so no scenario can special-case quadrum. `core/harness.ts` contains no
   adapter-specific branching at all, by construction.
6. **No root `BENCHMARKS.md`.** Full methodology lives in `apps/bench/README.md`; the root
   README carries only a generated, marker-delimited headline block.

## The adapter seam

`src/core/types.ts` is the one file every module imports and no module duplicates.

`MountOptions` has **no adapter-specific escape hatch** — `placement`, `orientation`,
`coordinates`, `animate`, `animationMs`, `interactive`, `sizePx`, all required. That is what
stops a silent discount like mounting quadrum with marks and coordinates off while chessground
gets its defaults.

Three load-bearing rules the adapters must obey:

- **`resize()` is not normalised.** chessground's calls `api.redrawAll()` after the style write;
  quadrum's does not, because it reads geometry live and does not need to. The contract is
  *"leave the board correct and interactive"*, not *"call the same number of methods"* — a real
  app that skips `redrawAll()` ships a bug where clicks land on the wrong square. Hiding that
  cost would delete the very difference this exercise exists to measure. The guard against the
  reverse abuse — inflating chessground with a needless call — is the resize scenario's
  post-resize click-accuracy assertion, which runs for **both** adapters. Correctness gates
  timing, never the other way round.
- **`setArrows()` calls the auto-shape API alone and never re-applies the FEN.** chessground's
  `set({fen})` wipes `drawable.shapes`, so folding them together would make the arrow scenario
  secretly measure a full position diff. The arrow scenario asserts the piece count is unchanged
  across the whole loop, which is exactly the assertion that fails if an adapter cheats this way.
- **`setPosition()` always carries `lastMove` and side-to-move**, because a real app always does.

## Measurement methodology

- **Warmup → ABBA interleave → discard.** One warmup pass per adapter, thrown away. Passes run
  `Q,C,C,Q` so monotonic drift (thermal, GC ramp, another process starting) loads equally on both
  rather than on whichever went second. The sequence reversed equals itself — that symmetry is
  asserted in `test/harness.test.ts`. The first `discardFirst` iterations are dropped *after the
  fact* and retained in the JSON under `discarded`, so the drop stays auditable.
- **Median, never mean.** One GC pause turns a mean into fiction. Latency scenarios headline p95,
  because the tail is what a user feels; the statistic per scenario is fixed by the registry so
  it cannot be chosen after seeing the data.
- **Three timing levels.** `timeScript()` (the call only), `timeToLayout()` (call plus a forced
  `offsetWidth` *and* a piece `getBoundingClientRect()`, so a transform-only change cannot be
  deferred), `timeToPaint()` (double-rAF). **`scriptMs` is published beside the layout number on
  every scenario** — the gap between them is exactly where a motivated author would hide, so it
  is shown rather than differenced away.
- **`PerformanceObserver` as counterweight.** `longtask` totals per timed region catch work we
  caused but bracketed out.
- **Dropped frames measured against an empirically-derived interval** — the median of 60 idle rAF
  deltas, never a hardcoded 16.67. `updatesCompleted` ships alongside, so a library that falls
  behind and forces the harness to skip positions is not scored as "zero dropped frames". Under
  headless every frame metric carries `advisory: "synthetic frame clock"`.
- **CPU throttled 4× via CDP**, recorded in the JSON. Unthrottled, both libraries finish a
  200-position replay inside timer noise and the difference that matters to a mid-range Android
  disappears.
- **Parity is asserted, not assumed.** `guards.assertParity()` checks equal piece counts, board
  rects within 0.5px, identical computed `background-size`, and coordinates hidden on both — and
  records what it saw even when it passes. Any failed assertion invalidates the whole comparison
  and the console renderer suppresses its numbers.
- **Memory is a retention invariant, not a byte count.** `performance.memory` is bucketed to 20MB
  and cannot force GC, so the scenario is `runnerOnly`. The runner injects CDP hooks:
  `HeapProfiler.collectGarbage` ×3, `Runtime.getHeapUsage`, and `Nodes`/`JSEventListeners` from
  `Performance.getMetrics`. The verdict is `retainedNodes === 0 && retainedListeners === 0` after
  teardown, cross-checked for linearity at two cycle counts. Heap bytes are reported and **never**
  gated — *"quadrum uses 30% less memory"* would be the least defensible line in the whole table.
  Without the hooks the scenario returns an explanatory failing assertion and **no metrics**; it
  never fabricates a number.
- **Bundle size on realistic entries, CSS in two rows.** Three lib-mode builds — quadrum entry,
  chessground entry, empty baseline whose bytes are subtracted to remove Rollup's preamble. The
  entries are *the adapter surface a real app uses*, not `export *`, which is meaningless against
  subpath exports and pessimistic against a single entry. CSS gets **two** rows: "library CSS"
  (which flatters quadrum and means little alone) and "CSS + art needed for a working board".
  quadrum ships no art; that cost falls on the consumer either way, and pretending it is zero
  would be the most obvious lie available here.

## Workload data

`data/game.ts` is **200 deterministic placements generated by a seeded LCG, not a real game.**
Each step relocates one piece and captures whatever it lands on, resetting if the board thins
below six pieces. This is a deliberate deviation from the original plan, on two grounds: the
bench app must not take a chess-rules dependency, and what matters to a *renderer* is DOM churn
per update, not legality. The file says so in its header, the README says so, and the caveat
travels with the results JSON. Every placement is asserted to round-trip through `fenToPieces`.

## The eight scenarios

Each declares an `expectation` naming who it should favour and why, a `parity` note on how both
were configured, and an `endCondition` that is an **observable end state common to both** — never
"the function returned". A scenario without a shared end condition does not ship.

| # | Scenario | Expected to favour | Gated |
| --- | --- | --- | --- |
| 1 | Mount a full board | quadrum | yes |
| 2 | 100 updates, animation off | quadrum | yes |
| 3 | 100 updates, animation on | neither | no — headless has no real vsync |
| 4 | Engine arrow re-draw per tick | quadrum (by design) | yes |
| 5 | Drag latency, p95 | **chessground, if anything** | no — p95 from small n |
| 6 | Resize storm | quadrum, heavily | no — **cannot be lost by construction** |
| 7 | Retention after teardown | parity (invariant) | yes, as `=== 0` |
| 8 | Bundle size | quadrum; CSS row less so | yes, absolute +2% |

Scenarios 5 and 6 are the honesty load-bearers in that table: one is a scenario quadrum is
expected to *lose*, and the other is excluded from gating precisely because it cannot be lost —
**gating something you cannot lose is theatre.**

## Regression gate

Ratio-based, `quadrum ÷ chessground`, normalised so lower always means quadrum is better. The
runner's speed multiplier applies to both subjects measured seconds apart in the same context, so
it cancels to first order; absolute timings swing 2–3× across CI runners while the A/B ratio holds
to a few percent. Two guards against the ratio's own failure modes: bundle size is gated
absolutely (catching a regression that hits both), and an environment sanity check marks a run
*inconclusive* — neutral, not pass, not fail — if chessground's own absolute has drifted beyond a
threshold.

Failure is on the CI **lower** bound, deliberately asymmetric: noise buys a warn, never a red X,
because false failures destroy trust in a gate faster than false passes destroy a codebase.

Baseline is committed and updated only by a human PR. An auto-rebaselining bot turns the gate into
a ratchet that records whatever happened, which is the same as having no gate. A scenario present
in the baseline but missing from results is a **fail** — that is how you would delete an
inconvenient benchmark.

## Honesty guardrails

The author owns quadrum. Ordered by how easily each happens *by accident*:

1. Dev-server asymmetry → production build enforced in code.
2. Chrome asymmetry → runtime art parity plus computed-style assertions; the demo's chrome is
   never imported.
3. Stopping the clock early → layout-forcing reads, and `scriptMs` published beside `layoutMs`.
4. Measuring different work → a shared, declared `endCondition` per scenario.
5. Hoisting a real cost out of the timed region → correctness assertions that fail if the hoisted
   call was genuinely necessary. **Deleting `redrawAll()` from the chessground adapter must make
   the resize scenario's click-accuracy assertion fail.** That non-vacuity check is part of the
   verification checklist, not a nice-to-have.
6. Cherry-picked scenarios → mandatory `expectation`, every registry scenario rendered, and a set
   that deliberately includes one quadrum is expected to lose.
7. Straw-manning the opponent → a short chessground adapter written strictly from public types,
   with a comment citing the behaviour behind every non-obvious call. A chessground user is
   explicitly invited to review it. The whole claim is falsifiable by anyone running `pnpm bench`.
8. Re-roll laundering → `publishable` is false for anything but a clean scheduled/push run, and
   raw samples ship, so an implausibly tight distribution is visible.
9. Statistical selectivity → the statistic is fixed by the registry; all of
   min/median/mean/p95/stddev/MAD ship regardless.
10. Hardware flattery → throttle factor and CPU model in the caption, and plain prose saying these
    are not desktop numbers.
11. Bundle size → realistic entries, two-row CSS.
12. Undisclosed interest → the app itself, on screen, opens with: *chessground is a mature, widely
    deployed library; its GPL licence — not its quality — is quadrum's reason for existing.*

## Status

- **M0–M3 built**: the seam, harness, both adapters, runtime art parity, all eight scenarios, the
  visual page, the Node runner with CDP throttling and hooks, the three lib-mode entries, and
  unit tests for the statistics and interleave/discard logic that decide what the published
  numbers are.
- **M4–M5 outstanding**: `.github/scripts/bench-report.mjs` and its tests,
  `apps/bench/README.md` (the full methodology and conflict-of-interest document), `bench.yml`,
  minting `baseline.json`, and splicing the README headline block.

No numbers are published anywhere until M4–M5 land and a clean scheduled run produces them.
