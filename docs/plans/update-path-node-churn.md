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

## The gatability criterion — a decision that needs an outside opinion

This section is written to be self-contained, because it is the one open question
in this plan that is a judgement call rather than an engineering task. It states
the mechanism, the measurement that refuted the first proposal, the numbers, how
to reproduce them, what is still uncertain, and the three options.

### What the gate does, in code

Two separate rules are in play, and conflating them is the mistake this section
exists to correct.

**Rule 1 — admission.** `assessGatability` in `.github/scripts/bench-report.mjs`
decides whether a scenario is *allowed* to fail a build. It tests **each subject
separately** against `MAX_GATED_CI_HALF_WIDTH` (0.08):

```js
// Rule 1: quadrum's CI half-width must not exceed 8% of its central value.
const qHalfWidth = (q.ci95[1] - q.ci95[0]) / 2;
const qRelative = Math.abs(safeRatio(qHalfWidth, q.value));

if (Number.isFinite(qRelative) && q.value !== 0 && qRelative > MAX_GATED_CI_HALF_WIDTH) {
	tooNoisy.push(`${scenario.id}/${metric.key}: quadrum CI half-width …`);
}
// Rule 2 repeats this verbatim for chessground.
```

A scenario failing either check is **demoted at mint** to reported-only: it still
appears in the PR comment, it can never fail a build.

**Rule 2 — the verdict.** `gateScenario` decides pass/warn/fail for an admitted
scenario:

```js
const threshold = base.ratio * (1 + limits.tolerance);   // tolerance 0.15

// Failing on the LOWER bound is deliberately asymmetric: noise buys a warn,
// never a red X.
if (exceeds(metric.comparison.ratioCi95[0], threshold)) {
	return { status: "fail", … };
}
if (exceeds(metric.comparison.ratio, threshold)) {
	return { status: "warn", … };   // does not block
}
return { status: "pass", … };
```

**The consequence that drives everything below:** failure requires the ratio's CI
*lower* bound to clear the threshold. A wider interval pushes that bound down, so
**noise here can only produce false passes — never false failures.**

### The problem

`update-throughput-anim-off` is the worst scenario in the suite (ratio 4.74, the
one this whole plan exists to fix) and it is demoted. The blocker is Rule 1
applied to *chessground*: 9.0% at the previous mint, 8.4% at this one. quadrum's
own is 6.3% and passes. chessground is a pinned, unchanging dependency — nothing
this repo ships moves that number, so Phases B–D could land perfectly and the
scenario would stay demoted.

### The first proposal, and its refutation

An earlier revision of this section proposed assessing Rule 1 on the **ratio's**
CI half-width instead of each subject's, reasoning that machine drift loads on
both subjects and cancels out of the ratio. **Measured against the minted
baseline run, that is false.** Per-repetition figures (n=61):

| Scenario | quadrum | chessground | **ratio** |
| --- | --- | --- | --- |
| mount | 2.4% | 1.3% | **2.9%** |
| update-throughput-anim-off | 5.9% | 8.8% | **13.8%** |
| engine-arrow-tick | 3.0% | 4.1% | **4.7%** |
| drag-latency | 0.33% | 0.25% | **0.38%** |
| resize-storm | 7.1% | 1.3% | **5.7%** |

The ratio is **wider than either subject in four of five scenarios**. The cause is
that the two subjects' per-repetition noise is uncorrelated:

| Scenario | corr(q,c) | cv quadrum | cv chessground | cv ratio | predicted |
| --- | --- | --- | --- | --- | --- |
| mount | −0.090 | 5.14% | 5.72% | 7.69% | 8.02% |
| update-throughput-anim-off | −0.252 | 15.32% | 23.02% | 31.57% | 30.70% |
| engine-arrow-tick | −0.130 | 11.01% | 15.04% | 19.28% | 19.76% |
| drag-latency | +0.057 | 1.11% | 0.89% | 1.38% | 1.38% |
| resize-storm | −0.052 | 51.62% | 4.73% | 52.06% | 52.08% |

With correlation ≈ 0 the quotient's spread is `sqrt(cv_q² + cv_c²)` — the noises
**compound** rather than cancel. Observed matches that prediction to within a
percentage point in every scenario.

**This does not undermine the ratio-based gate**, and the distinction matters.
The ratio's justification is *between-run*: two GitHub runners differ 2–3× in
absolute speed and dividing cancels that. Within a single run on one machine that
factor is essentially constant, contributing no variance to cancel; what remains
is independent per-repetition jitter, which division compounds. The gate compares
ratios across runs, where the cancellation is real. Rule 1 looks within one run,
where it is not.

### Three different quantities are called "the ratio CI"

A reviewer will otherwise conclude one of the tables above is wrong. They are
measuring different things, and each is correct for its purpose:

1. **`ratioCi95` as shipped** (in `baseline.json`, used by Rule 2 and by the
   sensitivity table below). A deliberately conservative worst-case combination —
   `compareSubjects` pairs each subject's optimistic bound against the other's
   pessimistic one (`qLo/cHi`, `qHi/cLo`). It is *designed* to be wider than
   either part, so it cannot be used to test the cancellation claim.
2. **The paired per-repetition bootstrap** (the 13.8% above). Bootstrap over the
   61 per-repetition ratios. This is the quantity that would show cancellation if
   cancellation existed, which is why the refutation uses it.
3. **Each subject's own `ci95`** (used by Rule 1). Bootstrap over that subject's
   pooled samples.

### Noise costs sensitivity, not correctness

Since a wide interval can only cause false passes, the honest thing to publish is
what each scenario can still detect. Solving `R * (1 − halfWidth) > 1.15` for the
smallest detectable regression `R`, using the shipped `ratioCi95`:

| Scenario | gated | ratio | ratio CI half-width | smallest regression it catches |
| --- | --- | --- | --- | --- |
| bundle-size | yes | 0.882 | 0.0% | +15% |
| memory-leak | yes | 1.000 | 0.0% | +15% |
| update-throughput-anim-on | no | 1.000 | 0.0% | +15% |
| drag-latency | no | 0.971 | 0.5% | +16% |
| mount | yes | 1.286 | 2.8% | +18% |
| engine-arrow-tick | yes | 1.911 | 7.4% | +24% |
| resize-storm | no | 0.087 | 9.1% | +27% |
| update-throughput-anim-off | **no** | 4.743 | 14.6% | **+35%** |

A demoted scenario catches nothing, however tight its interval. Gating
`update-throughput-anim-off` at its current noise would catch any regression above
+35% — blunt, but a doubling of the update path would not pass unnoticed, which is
precisely the failure this plan exists to prevent recurring.

### Tightening it is not affordable

The headline metric `update-total-script-ms` carries **no per-iteration samples**:
it is one total per repetition, already the sum over 100 updates. Its noise is
therefore entirely between-repetition drift across fresh browser processes, and
no `iterations` count touches it.

```
quadrum      median 39.580 ms   between-repetition spread 15.32%   min/max 29.820 / 53.495
chessground  median  8.345 ms   between-repetition spread 23.02%   min/max  5.070 / 14.345
```

Interval width falls as `1/sqrt(reps)`, so reaching 8% on the ratio needs roughly
3× the repetitions — about 180, some three hours of runner time per run. Reaching
8% on chessground alone needs ~68 reps, which would sit one bad run from demotion
again.

### Open questions a reviewer should press on

These are stated as uncertain rather than settled:

1. **The correlations are slightly negative, not merely zero** (−0.05 to −0.25).
   Zero is what the independence argument predicts; consistently negative hints at
   something structural in the ABBA interleave, where the two subjects alternate
   within a repetition and one may systematically absorb a cost the other sheds.
   It does not change the conclusion — negative correlation makes the ratio
   *worse*, not better — but it may mean something that has not been chased down.
2. **Only linear correlation was tested, only at the repetition level.** Drift
   that is non-linear, or that lives at a different timescale (within a
   repetition, or across the whole run), would not show up in these numbers.
3. **`resize-storm` is the one scenario where the ratio beats the worst subject**
   (5.7% vs quadrum's 7.1%). That is consistent with independence — chessground's
   cv is tiny there, so the quotient is dominated by quadrum's — but it is the
   single data point that superficially supports the refuted proposal, and a
   reviewer will notice it.
4. **The 8% cap and the 15% tolerance were both chosen by judgement**, not
   derived. If the cap is replaced, the argument for whatever replaces it should
   be better than the argument for 8% was.
5. **n=61 is one run.** Every number here comes from a single minted baseline
   (`run-1786622849122`, `workflow_dispatch`, 2026-08-13). The correlation
   estimates in particular have real sampling error at that n.

### Reproducing every number above

The raw run is committed at `apps/bench/results/baseline-run.json` (the actual
minted baseline, 61 repetitions), and the four scripts that produced these tables
are in `apps/bench/analysis/`. They are standalone Python 3, no dependencies, and
read only committed data:

| Script | What it does |
| --- | --- |
| `ratio-ci-half-widths.py` | Rebuilds per-repetition values for both subjects, forms the paired ratio, and bootstraps a median CI for all three (4000 resamples, fixed seed). Produces the refutation table. Also prints the shipped per-subject numbers alongside, as a check that the reconstruction matches the pipeline. |
| `subject-correlation.py` | Pearson correlation between the two subjects' per-repetition values, with each subject's coefficient of variation, the ratio's observed cv, and the cv predicted by first-order error propagation for a quotient. Produces the correlation table. |
| `variance-split.py` | Splits `update-throughput-anim-off`'s noise into within- and between-repetition components, and reports the scenario's iteration settings. Establishes that more iterations cannot help. |
| `detectable-regression.py` | Inverts the gate rule to the smallest detectable regression per scenario, from the shipped `ratioCi95`. Produces the sensitivity table. |

Run them from that directory: `python3 ratio-ci-half-widths.py`, etc.

**Validation.** `ratio-ci-half-widths.py`'s recomputed per-subject half-widths
reproduce the shipped ones closely (`update-throughput-anim-off`: 5.85% vs 6.31%
stored for quadrum, 8.78% vs 8.45% for chessground) — the reconstruction is
measuring the same thing the pipeline does, so the ratio column sits on the same
footing. The residual difference is bootstrap RNG and the pooling fallback: for
metrics with no per-iteration samples, `poolSamples` falls back to the 61
per-repetition values, which is exactly what these scripts use.

### The decision

Rule 2 is unchanged in all three options. They differ only in which scenarios are
admitted by Rule 1.

1. **Drop the CI-width admission test for ratio-gated scenarios; publish the
   sensitivity column instead.** Every scenario gates at whatever sensitivity it
   honestly has. `update-throughput-anim-off` starts gating at +35%. Cost: a
   change to `assessGatability` and the report renderer, plus tests. No
   measurement changes. Independent of Phases B–D; can land on its own.
2. **Raise the cap to 10%.** One constant. Admits `update-throughput-anim-off`
   (8.4%) and `resize-storm` (8.3%). Cheapest, but it is an arbitrary number
   papering over a rule aimed at the wrong risk, and the next scenario to land at
   10.5% reopens this.
3. **Leave it demoted.** Zero work. A regression on quadrum's worst scenario
   cannot fail a build; it would be caught by reading PR comments.

**Recommendation: option 1**, on the grounds that Rule 1 is guarding against a
failure mode Rule 2's lower-bound test already eliminates, and the sensitivity
column is information the project does not currently have. The counter-argument
worth weighing: option 1 lets scenarios that currently cannot fail a build start
doing so, and widening the blast radius mid-plan has a cost of its own — option 3
now, option 1 during Phase F is a defensible sequence.

Either way, **stop treating re-gating `update-throughput-anim-off` as an outcome
Phases B–D can deliver.** It is not one.

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
