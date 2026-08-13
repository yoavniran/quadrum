# Kill the node churn: update path and arrow layer

## Context

The 61-rep benchmark (main @ `e1130fc`) leaves quadrum losing three scenarios to
chessground, all on the same render path:

| Scenario | quadrum | chessground | ratio |
| --- | --- | --- | --- |
| Mount (layout) | 1.21 ms | 0.98 ms | 1.23× |
| 100 updates, anim off (total script) | 30.6 ms | 6.4 ms | 4.80× |
| Engine arrow tick (total script) | 50.4 ms | 15.5 ms | 3.25× |

The secondary metrics already pointed at layout: quadrum's update-total-layout is
26.6 ms vs chessground's 8.1 ms. A profiling session (CPU profile at 4× CDP
throttle on the production bench page, unminified build, plus a MutationObserver
census over the same scenarios) confirmed the mechanism. This plan is the fix.

## What the profile actually showed

All numbers below are from one bench-page comparison run per scenario (harness
defaults: 100 iterations, both adapters, ~300 timed iterations per adapter
including warmup passes). Profiles and censuses are reproducible with the same
method; the shapes, not the exact milliseconds, are the findings.

### Scenario: 100 position updates, animation off

**DOM mutation census (300 quadrum updates):** 489 `qd-piece` created / 399
removed, 567 `qd-square` created / 561 removed — roughly **1.3 piece elements and
1.9 highlight squares created and destroyed per update**. chessground's census
over the same run: 159 `piece` created / 69 removed and only 6 `square` elements
ever created — it repositions two persistent highlight elements with style writes
(561 of them) instead of replacing them.

**CPU self-time (quadrum side):** `renderPieces` 18.7 ms, `fenToPieces` 11.3 ms,
`pieceOf` 11.1 ms, plus 35.9 ms of GC — the FEN re-parse, the map clone in
`applyOptions`, and `pieceOf`'s per-piece string split allocate on every update
for all 32 pieces.

**Root causes, in code:**

1. `renderPieces` keys elements **by square** (`Map<Square, HTMLElement>`). A
   piece moving e2→e4 finds no element at e4, so it creates a new `qd-piece` and
   removes the one at e2. Every single move is a structural DOM change, which
   dirties layout — that is the 26.6 ms layout column. The engine already knows
   better: `planDiff` (used by the animation path) computes moves as moves.
2. `renderSquares` rebuilds the lastMove highlights as fresh `qd-square`
   elements each update and removes the old ones — two more creates + two
   removes per update.
3. `pieceOf` re-derives the piece from `dataset.piece` with a `split("-")` per
   piece per render — 32 allocations per update to answer a question the code
   asked itself when it created the element.

### Scenario: engine arrow tick

**DOM mutation census (300 quadrum ticks):** 1800 `polygon`, 900
`linearGradient`, 900 `g` created — and nearly all removed again. That is **6
polygons + 3 gradients + 3 groups created and destroyed per tick**. chessground
creates zero per-tick elements; its shape sync mutates in place.

**CPU self-time (quadrum side):** `renderPieces` **28.6 ms** — on a scenario
where no piece ever moves. `setAutoMarks` funnels into the full `render()`, so
every arrow tick re-reconciles 32 pieces, the squares, the coords memo and the
promotion layer. The SVG work itself: `setAttribute` 28.4 ms, `createElementNS`
17.5 ms, `fadeToOpaque` 10.0 ms (it builds a fresh `linearGradient` + stops per
arrow per tick), `computeArrowGeometry` 6.4 ms.

**Root causes, in code:**

1. `Board.setAutoMarks` / `setUserMarks` / `commit` all call `this.render()` —
   the whole pipeline — for a marks-only change.
2. `renderMarks`' keyed diff reuses a node only when the mark **key** survives
   into the next frame. Engine ticks replace the arrow set wholesale, so no key
   ever matches: the old nodes are removed and new ones created, every tick. The
   mutate-in-place path exists but is unreachable in exactly the scenario it was
   written for.
3. `fadeToOpaque` gradient reuse is keyed off the rendered mark, which dies with
   the tick — so the gradient cache never hits either.

### Scenario: mount

quadrum wins mount **script** (0.85 vs 1.40 ms) with fewer elements (34 vs 42)
but loses mount **layout** (1.21 vs 0.98 ms). `quadrum.css` declares no
containment anywhere; every absolutely-positioned 12.5%-sized child is laid out
against `qd-board` inside the page's layout tree. Lower confidence than the two
findings above — this one is an experiment, not a diagnosis.

## The plan

Four phases, ordered by expected impact ÷ risk. Each is independently landable
and independently measurable with the bench page.

### Phase A — dirty-flag the render pipeline

`render()` today is all-or-nothing. Split it into addressable parts and make
every public mutator request only what it dirtied:

- `update(options)` computes which state groups changed while applying options
  (position/orientation → pieces + squares; marks → marks; coordinates →
  coords; everything → the current full render as fallback).
- `setAutoMarks`, `setUserMarks`, `commit` render **marks only**.
- `select`/hover paths render **squares only** (they already go through
  `renderSquares`, keep it that way).
- `redraw()` and `refresh()` keep the full pipeline — they are the escape hatch.

Expected effect: removes `renderPieces`+`renderSquares` from every arrow tick
(~30 ms of the 50 ms total), removes `renderMarks` from every position update.
Risk: low — this is routing, not new rendering logic; the full render stays as
the fallback for any path that is unsure.

**Landed** in `0ba3865` (PR #28), re-baselined in `f5ffce8` (PR #30) from a
61-repetition `workflow_dispatch` run. Outcome against the prediction:

| Scenario | ratio before | ratio after | note |
| --- | --- | --- | --- |
| engine-arrow-tick | 3.252 | **1.911** | −41% |
| update-throughput-anim-off | 4.796 | 4.743 | flat, as expected |
| mount | 1.230 | 1.286 | inside the noise band |
| bundle-size | 0.869 | 0.882 | +155 brotli bytes |

The whole runner was ~25% slower on the re-mint (chessground's own absolutes
rose 18–31% across every scenario), so only the ratios are comparable.
Normalising quadrum's arrow-tick by chessground's 1.33× machine factor,
like-for-like the tick went 66.8 → 39.3 ms: **~27.5 ms saved**, against this
phase's predicted ~30 ms. The profile's diagnosis was correct and the fix landed
the size it was scoped to.

`update-throughput-anim-off` staying flat is the expected result, not a miss:
the bench update loop passes `position` on every update, which dirties pieces
*and* squares, so routing sends it to exactly the work it was already doing.
That scenario is Phase B's and Phase C's to win.

`mount` is unaffected by construction — the first render dirties every layer.
Three measurements of the same code now exist (1.230 at 61 reps, 1.386 and 1.294
at 7 reps), so the scenario's own noise band is roughly ±8% against a 15%
tolerance.

### Phase B — piece-identity diffing on the no-animation update path

Stop treating a move as destroy+create:

- On `update()` with a position change and animation off, run the existing
  `planDiff(before, after)` and apply it structurally: **moves** re-transform
  the existing element (style write only, zero structural mutation), **appears**
  create, **fades** remove. Fall back to the current full `renderPieces`
  reconcile whenever the diff is degenerate (orientation flip, first render,
  drag in progress — same exclusions the animation path already handles).
- Replace `pieceOf`'s dataset parsing with a `WeakMap<HTMLElement, Piece>`
  written at creation. The dataset stamp stays (it is public DOM surface and the
  e2e tests read it); it just stops being the lookup.
- The piece-element map stays keyed by square (the drag layer and the rest of
  the code look elements up by square); the diff just moves entries instead of
  replacing them.

Expected effect: a typical update becomes ~2 style writes + 2 square-highlight
writes with **no structural DOM change**, so the forced layout after it has
nothing to lay out. This is the bulk of both the 4.80× script gap (element
creation + GC pressure) and the 3.3× layout gap. Risk: medium — the drag-layer
`held` interplay and capture/promotion edge cases need the unit tests written
first (the current `renderPieces` comments document exactly which ghosts to
fear).

### Phase C — persistent highlight squares

`renderSquares` keeps a pool of `qd-square` elements instead of
creating/removing per update. An element that leaves the decoration set is
hidden (class toggle), not removed; one that enters reuses a pooled node and
gets a transform + `className` write — chessground-style, 6 elements for the
lifetime of the board instead of 2 per update. Pool is torn down in `unmount()`
so the memory-leak invariant (0 retained nodes) holds. Risk: low.

### Phase D — arrow layer: node recycling and a pen-keyed gradient cache

- Give `renderMarks` a **recycle pool**: nodes shed by the diff go to the pool
  instead of `remove()`; new marks draw from the pool and mutate
  (`points`/`fill`/`transform` attribute writes) instead of `createElementNS`.
  The keyed diff stays — same-key mutate-in-place is still the cheapest path —
  the pool just catches the wholesale-replacement case the engine-tick scenario
  exercises. Pool cleared on `unmount()`.
- Key the fade gradients by **pen** (one `linearGradient` per pen for the
  board's lifetime, oriented per-arrow with `gradientTransform`) instead of per
  rendered mark, so 100 ticks with 2 pens build 2 gradients, not 300.

Expected effect: per-tick element creation drops from ~12 nodes to ~0; the
remaining cost is attribute writes and geometry, where the profile shows
chessground's own budget lives. Risk: medium — SVG gradient orientation via
`gradientTransform` needs a visual check in the demo, not just numbers.

### Phase E (experiment) — containment for mount layout

Add `contain: layout style` to `qd-board` and `contain: strict` (or `content`)
to the mark SVGs, then measure mount + resize + drag on the bench page. Adopt
only what moves mount layout without regressing resize-storm (quadrum's biggest
win — do not trade it away) or breaking the promotion overlay's paint order.
If containment does nothing, accept mount at 1.23× for now; Phase B may already
shrink it since mount's first render also pays per-element layout.

## What "done" means

Measured on the bench page (local, production build, 4× throttle), same method
as the profile:

- `update-total-script-ms` ratio ≤ 1.5 (from 4.74) and `update-total-layout-ms`
  within 1.5× of chessground (from 3.3×).
- `arrow-tick-total-script-ms` ratio ≤ 1.5 (from 1.91 after Phase A).
- Per-update mutation census shows ~0 created/removed elements on a plain move.
- No regression in the scenarios quadrum wins: drag-latency, resize-storm,
  memory-leak stays 0/0.
- `pnpm typecheck && pnpm test && pnpm test:e2e` green; new unit tests cover the
  structural-diff path (move reuses element, capture retires exactly one,
  orientation flip falls back to full reconcile, held pieces untouched, pools
  drained on unmount).

Then: a full `workflow_dispatch` bench run at 61 reps, and a re-mint.

### Bundle size is deliberately relaxed until Phase D lands

Phase A cost 155 brotli bytes for what is essentially routing, and only fit
under the +2% absolute gate after two rewrites driven purely by size — a
bitmask instead of a boolean record, then a branch chain instead of a lookup
table. Phases B, C and D each add more shipped code than Phase A did (a
`WeakMap` and a structural diff, a square pool, a node pool plus a gradient
cache), and 200 bytes of headroom between them is not a budget, it is a
guarantee that size pressure will distort the implementations.

So `DEFAULT_BUNDLE_TOLERANCE` is raised from 2% to 12% for the duration of this
plan. The gate still exists — a 12% jump is still a red X, and a *deleted*
bundle scenario is still a hard fail — it simply stops being the binding
constraint on how these phases are written. **Phase F below restores it.**
Performance is the thing being bought here; bytes are the thing being spent, and
the accounting happens once at the end rather than four times mid-flight.

### Phase F — the size pass, after D

With all four phases landed and measured, revisit size as its own exercise:
measure each phase's contribution to the bundle in isolation, look for shared
machinery across the three pools (pieces, squares, marks), and restore
`DEFAULT_BUNDLE_TOLERANCE` to 0.02 against a freshly minted baseline. Whatever
the bundle weighs at that point is the honest cost of the performance, and it
gets locked in tightly again.

### The re-gating promise is not reachable, and the ratio does not rescue it

An earlier draft of this plan claimed that fixing the update path would shrink
`update-throughput-anim-off`'s noise enough for the next mint to re-gate it. That
is not reachable as the rule is written. `assessGatability` in
`.github/scripts/bench-report.mjs` tests **each subject's** CI half-width against
an 8% cap, and the blocker is *chessground's*: 9.0% at the previous mint, 8.4% at
this one. quadrum's own is 6.3% and already passes. Nothing shipped in this repo
moves the denominator, so Phases B and C could land perfectly and the scenario
would stay demoted.

A previous revision of this section proposed assessing gatability on the
**ratio's** CI half-width instead, on the premise that machine drift loads on
both subjects and cancels out of the ratio. **That was measured against the
minted baseline run and it is false.** The per-repetition figures, recomputed
from `baseline-run.json` (n=61, the same values the shipped pipeline pools, and
reproducing its per-subject numbers to within half a point):

| Scenario | quadrum | chessground | ratio |
| --- | --- | --- | --- |
| mount | 2.4% | 1.3% | 2.9% |
| update-throughput-anim-off | 5.9% | 8.8% | **13.8%** |
| engine-arrow-tick | 3.0% | 4.1% | 4.7% |
| drag-latency | 0.33% | 0.25% | 0.38% |
| resize-storm | 7.1% | 1.3% | 5.7% |

The ratio is **wider than either subject** in four of five scenarios. The reason
is that the two subjects' per-repetition noise is uncorrelated — Pearson r
between quadrum's and chessground's per-repetition values is −0.09, −0.25,
−0.13, +0.06 and −0.05 across those scenarios, i.e. indistinguishable from zero.
With r ≈ 0 the quotient's spread is `sqrt(cv_q² + cv_c²)`: the noises compound
rather than cancel. Observed ratio spread matches that prediction to within a
percentage point in every case (e.g. `update-throughput-anim-off`: 31.6% observed
vs 30.7% predicted).

This does **not** undermine the ratio-based gate, and the distinction matters.
The ratio's justification is *between-run*: two different GitHub runners differ
by 2–3× in absolute speed, and dividing cancels that. Within a single run on a
single machine that factor is essentially constant, so it contributes no variance
to cancel; what is left is independent per-repetition jitter, which division
compounds. The gate is comparing ratios across runs, where the cancellation is
real. The admission test is looking within one run, where it is not.

**The criterion is aimed at the wrong risk.** The gate fails only when the
ratio's CI *lower* bound exceeds the threshold. A wider interval therefore pushes
that bound *down* and makes a failure strictly **less** likely — noise can only
produce false passes here, never false failures. The 8% cap is guarding against a
failure mode the lower-bound rule already eliminates, and the price it charges is
excluding the single most important scenario in the suite from the gate entirely.

What noise actually costs is *sensitivity*, and that is worth stating per
scenario rather than hiding behind a binary gated/demoted flag. Solving
`R * (1 - halfWidth) > 1.15` for the smallest detectable regression `R`:

| Scenario | gated | ratio CI half-width | smallest regression it catches |
| --- | --- | --- | --- |
| bundle-size | yes | 0.0% | +15% |
| memory-leak | yes | 0.0% | +15% |
| mount | yes | 2.8% | +18% |
| engine-arrow-tick | yes | 7.4% | +24% |
| resize-storm | no | 9.1% | +27% |
| update-throughput-anim-off | no | 14.6% | +35% |

A demoted scenario catches nothing, however tight its interval. Gating
`update-throughput-anim-off` at its current noise would catch any regression
above +35% — blunt, but a doubling of the update path would not pass unnoticed,
which is exactly the failure this plan exists to prevent recurring.

Tightening it further is not affordable. The headline metric carries no
within-repetition samples: it is one aggregate per repetition, already the total
of 100 updates, so its noise is entirely between-repetition drift across fresh
browser processes and no iteration count touches it. Interval width falls as
`1/sqrt(reps)`, so reaching 8% on the ratio would need roughly 3× the
repetitions — about 180, or some three hours of runner time per run.

**Decision for this plan:** keep the per-subject criterion, and stop treating
re-gating `update-throughput-anim-off` as an outcome Phases B–D can deliver. The
options, in preference order, are (1) drop the CI-width admission test for
ratio-gated scenarios and publish the smallest-detectable-regression column
above instead, so every scenario gates at whatever sensitivity it honestly has;
(2) raise the cap to 10%, which admits this scenario now at +35% sensitivity and
changes nothing else; (3) leave it demoted and rely on the reported-only number
under human review. Option 1 is the honest one and is a change to
`assessGatability` plus the report renderer, not to any measurement. It is
independent of Phases B–D and should land on its own.

## Sequencing and risk notes

- Order: A → B → C → D → F, with E measured alongside. A first because it makes
  B–D measurable in isolation (an arrow tick that still runs `renderPieces` hides
  Phase D's effect); F last because a size pass over four phases at once can find
  shared machinery that four separate size passes cannot.
- The animation path shares `planDiff` and the piece-element map with Phase B —
  its tests (glide/fade/appear, interrupted animation cleanup) are the
  regression net and must stay green after every phase.
- Nothing here changes public API, CSS class names, or the DOM contract the e2e
  suite and the bench adapters read (`qd-piece`, `dataset.square`,
  `dataset.piece` all survive).
- CLEANROOM: all chessground numbers above are black-box measurements (profiles
  and mutation counts of a running page); no chessground source was read.

## Method appendix (reproducing the profile)

Unminified production build so profile frames keep names, preview server, CDP:

```
pnpm --filter quadrum-bench exec vite build --minify false
pnpm --filter quadrum-bench exec vite preview --port 5473 --strictPort
```

Then a Playwright script: `Emulation.setCPUThrottlingRate {rate: 4}`,
`Profiler.setSamplingInterval {interval: 100}` around
`window.__bench.run(<scenario>)`, and a second run wrapped in a
`MutationObserver` (childList + style/class attributes, subtree of body)
counting created/removed nodes by tag. Self-time aggregated per
`functionName@line` from the profile's `samples`/`timeDeltas`.
