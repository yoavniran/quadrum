# quadrum-bench

Side-by-side benchmarks of [quadrum](../../packages/core) against
[chessground](https://github.com/lichess-org/chessground) 9.2.1 — a visual page you can watch and
a headless runner that emits reproducible JSON.

This package is private. It is never published, and chessground is a **development-only**
dependency of it.

---

## Statement of interest — read this first

**These benchmarks were written and are run by quadrum's author.** They have not been reviewed by
chessground's maintainers. That is a real conflict, and no amount of methodology removes it — so
the honest response is to make the whole thing falsifiable and say plainly where the bias would
enter.

chessground is a mature, widely deployed, genuinely fast renderer. It runs lichess. **Its GPL
licence — not its quality — is quadrum's reason for existing.** If you are choosing between the
two and the licence is not a problem for you, "chessground is fast and battle-tested" is a
completely sound conclusion to reach from this page.

Corrections are welcome as issues, and the single most useful one you can file is a flaw in the
chessground adapter (`src/adapters/chessground/index.ts`, ~80 lines, deliberately short so it can
be read in one sitting). **If you use chessground, please review that file.** Every non-obvious
call in it carries a comment citing the behaviour it exists for.

Everything here is re-runnable by a skeptic:

```sh
pnpm install
pnpm --filter quadrum-bench exec playwright install chromium
pnpm bench                       # 7 repetitions, all scenarios, JSON + console table
```

Per `../../CLEANROOM.md` §Benchmarks: this is **black-box measurement only**. No chessground
source is read, and no code here derives from it. The adapter is written strictly from the public
`.d.ts` types and the published README. No chessground bytes (including its piece art) are
committed to this MIT repository.

---

## What is measured

| # | Scenario | Headline metric | Gated | Expected to favour |
| --- | --- | --- | --- | --- |
| 1 | Mount a full board | `mount-layout-ms` | ✅ | quadrum, slightly |
| 2 | 100 position updates, animation off | `update-total-script-ms` | ✅ | quadrum |
| 3 | 100 position updates, animation on | `frame-interval-p95` | — | neither; parity expected |
| 4 | Engine arrow re-draw, per tick | `arrow-tick-total-script-ms` | ✅ | quadrum |
| 5 | Drag latency, p95 | `drag-latency-p95-ms` | — | **chessground** |
| 6 | Resize storm, 50 resizes | `resize-layout-ms` | — | quadrum, by construction |
| 7 | Retention after teardown | `retained-nodes` | ✅ (as `=== 0`) | neither; parity expected |
| 8 | Bundle size, min+brotli | `bundle-brotli-bytes` | ✅ (absolute, +2%) | quadrum |

Scenario 4 headlines **total elapsed time over the whole loop** rather than per-iteration metrics.
Per-iteration medians sit 3–9 ticks above the 5µs timer floor (chessground at 0.045 ms / 9 ticks),
so the ratio is `real ÷ quantized`, swinging 9.58× → 16.00× between two identical runs against a
15% gate tolerance. Summing 100 quantized samples cuts the relative quantization error by √100,
keeping both subjects well clear of the floor. That makes the ratio trustworthy. Scenario 2 uses
the same approach. Both headline the total; per-iteration metrics still ship in the full table.

Every scenario declares its own `expectation`, `parity` and `endCondition` in
`src/scenarios/*.ts`, and those three sentences travel with the numbers into the results JSON and
into every rendered table. They are data, not documentation, precisely because they are the three
things a benchmark is most likely to be quietly wrong about.

The set deliberately includes scenarios quadrum is expected to lose (5) and to draw (3, 7). A
suite that only contains its author's wins is a brochure.

**Scenario 6 is reported and never gated.** quadrum cannot lose it: it caches no geometry, so
there is nothing for a resize to invalidate. Gating a result you cannot lose is theatre.

---

## Methodology

### The build

Benchmarks always run against `vite build` + `vite preview`, **never the dev server**. Under
`pnpm dev` quadrum resolves through the `source` condition — raw TS, per-module esbuild, no
tree-shaking — while chessground is a prebuilt minified ESM package that Vite pre-bundles. Timing
those against each other measures build pipelines, not renderers.

This is the single easiest way to publish a wrong number, so it is structurally impossible rather
than merely discouraged: the page API refuses to run under `import.meta.env.DEV` unless
`--allow-dev` is passed, and the mode is recorded in the JSON.

### Position-replay workload

Scenarios 1–4 and 6 replay 200 half-moves from three real classical games: Kasparov–Topalov 1999 (87 moves), Kasparov–Morozevich 2001 (86 moves, including promotions and castling), and the first 27 moves of Karpov–Kasparov 1990. Real games provide realistic piece displacements, capture cadence, and special moves — far better than a synthetic seeded generator that produced teleporting pieces and no castling or promotion in the workload. `apps/bench/scripts/generate-game-data.mjs` regenerates the position set from `source-games.pgn` when needed.

### Piece-art parity

quadrum ships structural CSS only; the demo app paints pieces as Unicode glyphs sized in `cqw`.
Glyph shaping and SVG-background rasterisation are different work, and the `cqw` binding re-shapes
32 text runs on every resize — a cost chessground never pays, which would produce a
**wrong-signed** result on scenario 6.

So one shared `src/adapters/shared/piece-art.css` paints the same art on both `qd-piece` and
`cg-piece`, and the demo's chrome is never imported. `guards.assertParity()` then checks, before
every timed region, that the computed `background-size` on a sampled piece is identical on both
boards, that piece counts match, that the board rects agree within 0.5px, and that coordinates are
off on both.

Comparing each library "as it ships" was rejected: it measures *themes*, and quadrum has no theme,
so it would compare chessground against CSS I wrote. The shipped-CSS question is real, and it is a
bundle-size question — answered in scenario 8, with two CSS rows.

### Timing

- **Warmup → ABBA interleave → discard.** One warmup pass per adapter, thrown away. Repetitions
  run `Q,C,C,Q` so that monotonic drift — thermal, GC ramp, another process starting — loads
  equally on both rather than on whichever went second. Discarded iterations are retained in the
  JSON under `discarded`, so the drop is auditable.
- **Median, never mean.** One GC pause turns a mean into fiction. p95, IQR, stddev and MAD ship
  alongside. Latency scenarios headline p95, because the tail is what a user feels.
- **Three timing levels, declared per scenario.** `timeScript()` (the call alone),
  `timeToLayout()` (the call plus a forced `offsetWidth` *and* a piece's `getBoundingClientRect()`,
  so a transform-only change cannot be deferred out of the bracket), `timeToPaint()` (double-rAF).
  **`scriptMs` is recorded on every scenario next to the layout number** — the gap between them is
  exactly where a motivated author would hide, so it is published rather than differenced away.
- **`PerformanceObserver` as a counterweight.** `longtask` totals are recorded per timed region,
  catching work we caused that fell outside our own brackets.
- **Dropped frames measured against an empirically-derived interval** — the median of 60 idle rAF
  deltas taken during warmup, never a hardcoded 16.67. `updatesCompleted` ships too: a library that
  falls behind and forces the harness to skip positions must not score as "zero dropped frames".
  Under headless there is no real vsync, so these carry `advisory` and are never gated.
  The launch flag `--run-all-compositor-stages-before-draw` forces every compositor stage to
  complete per frame so paint-adjacent numbers are less understated.
- **CPU throttled 4× via CDP**, recorded in the JSON. Unthrottled, both libraries finish a
  200-position replay inside timer noise and the difference that matters on a mid-range Android
  disappears. Runs at different throttle rates are never merged — the gate throws rather than
  compare them.
- **Drag latency (scenario 5) is paced at 8 ms per waypoint** — the 125 Hz report rate of a
  standard mouse — rather than dispatched as fast as the CDP channel allows. Real pointing device
  input rates are far slower than synchronous CDP roundtrips, and the pacing produces more
  representative measurements.
- **The page is cross-origin isolated (COOP `same-origin` + COEP `require-corp`), and the JSON
  records it.** Isolation is what buys `performance.now()` its 5µs resolution; without it Chromium
  clamps the timer to 100µs, and any bracket under 0.1 ms — a single position update on a fast
  library — quantizes to 0.0. That collapses medians to zero, makes ratios against them
  non-finite, and understates the faster subject in exactly the scenarios where it is fastest.
  The headers are set in `vite.config.ts` for both dev and preview; `env.crossOriginIsolated`
  in the results JSON says which floor a run was measured against, and the runner both warns on
  the console and appends a caveat to the JSON when a run was not isolated.
- **Headline metrics stay clear of the timer floor.** Scenarios 2 and 4 headline *total elapsed time*
  rather than per-iteration medians, because per-iteration medians sit 3–9 ticks above the 5µs floor
  (chessground's update-layout at 0.015 ms = 3 ticks). A one-tick movement in a 3-tick denominator
  is a 33% swing, making the per-iteration ratio `real ÷ quantized` and non-reproducible between
  runs. Summing 100 quantized samples cuts the relative error by √100, keeping both subjects well
  clear of the floor and making the headline ratio trustworthy. One tick of movement in a 20-tick
  sample is 5% — inside the gate's 15% tolerance with room to spare.
- **Per-scenario repetition caps.** A scenario may declare `repsCap`, the maximum number of
  process repetitions worth spending on it; the runner skips it in later repetitions of a broad
  (`all`/`gated`) sweep. An explicitly requested single scenario is exempt. Today only
  `memory-leak` is capped (at 5): its verdict is an invariant — retention is zero or it is not —
  so it does not sharpen with more repetitions, and its forced GCs at every read point are the
  most expensive seconds in a full run. Cross-run aggregation already pools by scenario id, so a
  scenario that appears in fewer repetitions simply pools fewer samples.

### Future work

CDP `Tracing` -based paint attribution (`Tracing.start` with the rendering categories) would give
real per-frame paint numbers in place of the advisory rAF-derived ones; deliberately not done yet
because it adds a second measurement pipeline whose overhead itself needs validating.

### Memory

`performance.memory` is bucketed to 20MB and cannot force a collection, so scenario 7 is
runner-only. The runner drives CDP directly: `HeapProfiler.collectGarbage` ×3, then `Nodes` and
`JSEventListeners` from `Performance.getMetrics`. **Those counters are live and global**, so they
are only read *after* the forced GC — read before, ordinary garbage reports as retention.

The verdict is `retainedNodes === 0 && retainedListeners === 0` after `destroy()`, cross-checked
for linearity at two cycle counts. **Heap bytes are reported and never gated on**; "quadrum uses
30% less memory" would be the least defensible line in the whole table.

### Bundle size

Three lib-mode Vite builds — a quadrum entry, a chessground entry, and an empty baseline that is
subtracted to remove the Rollup preamble. The entries are *the adapter surface a real app uses*
(mount, update, arrows, drag, destroy), not `export *`, which is meaningless against quadrum's
subpath exports and pessimistic against chessground's single entry. Raw, gzip and brotli all ship.

**CSS gets two rows.** "Library CSS" (`quadrum.css` vs `chessground.base.css`) flatters quadrum
and means little on its own. "CSS + art needed for a working board" prices what you actually have
to ship. quadrum provides no piece art; that cost falls on the consumer either way, and pretending
it is zero would be the most obvious lie available here.

### `resize()` is deliberately not normalised

The chessground adapter calls `api.redrawAll()` after its style writes. The quadrum adapter does
not, because it does not need to — it reads `getBoundingClientRect()` fresh per gesture and caches
no geometry.

The adapter contract is *"leave the board correct and interactive"*, not *"call the same number of
methods"*. An app that skips `redrawAll()` after a resize ships a bug where clicks land on the
wrong square, and hiding that cost would delete the very difference this exercise exists to
measure.

The guard against the reverse abuse — inflating chessground with calls it does not need — is
scenario 6's post-resize click-accuracy assertion, which runs against **both** adapters. It is not
vacuous: deleting `api.redrawAll()` from the chessground adapter makes the hit-test rect drift
120px from the host box and invalidates the run. **Correctness gates timing; never the reverse.**

The review rule that follows from this, and the one to hold any PR here to:

> **Any call inside an adapter method must be one a real app would make at that moment.**

---

## Running it

```sh
pnpm --filter quadrum-bench dev        # visual page: both boards, scenario picker, live table
pnpm bench                             # full headless run -> results/latest.json
pnpm bench --scenario mount --runs 3
pnpm bench --scenario gated            # only the blocking scenarios
pnpm bench --compare results/baseline.json
pnpm bench --headed                    # real vsync; the frame metrics stop being advisory
```

Pass the flags straight through, with **no `--` separator**. `pnpm run` forwards a `--`
verbatim into the nested workspace script, so the runner would receive it as an argument;
it now tolerates one rather than dying on it, but the plain form is the documented one.

`--runs` is between-process repetition (a fresh browser each time); `--iterations` is within-page.
Both are recorded. `--runs` defaults to 7 — odd, so the median is a real sample.

### Reporting

```sh
node ../../.github/scripts/write-bench-report.mjs summarize results/latest.json
node ../../.github/scripts/write-bench-report.mjs gate results/latest.json results/baseline.json
node ../../.github/scripts/write-bench-report.mjs check results/latest.json --readme ../../README.md
```

All the decisions live in `.github/scripts/bench-report.mjs`, which is pure and unit-tested;
`write-bench-report.mjs` does the I/O. So "would this gate have passed?" is always answerable from
a JSON file, with no browser and no CI.

---

## The regression gate

```
threshold      = baseline.ratio * (1 + tolerance)     // tolerance 0.15
inconclusive   if chessground's own absolute drifted beyond 2.5x from baseline
fail           if observed.ci95[0] > threshold        // the LOWER bound
warn           if observed.ratio   > threshold
pass           otherwise
```

The comparison is **ratio-based** (`quadrum ÷ chessground`, normalised so lower is always better
for quadrum). A runner's speed multiplier applies to both subjects, measured seconds apart in the
same context, so it cancels to first order: absolute timings swing 2–3× across GitHub runners
while the A/B ratio holds to a few percent. An absolute `>10% slower` gate would fire on the
runner's mood.

Two guards against the ratio's own failure modes: **bundle size is gated absolutely** (+2%),
catching a regression that hits both subjects, and the **environment sanity check** returns
`inconclusive` — neutral, not pass, not fail — when chessground's absolute has moved too far to
trust the run at all.

Failing on the *lower* CI bound is deliberately asymmetric. False failures destroy trust in a gate
far faster than false passes destroy a codebase, so noise buys a warning, never a red X.

Other rules, each of which exists because of a specific way this could be gamed:

- A scenario in the baseline but **missing from the results** is a **fail**. That is how you would
  delete an inconvenient benchmark.
- A scenario in the results but not the baseline is **advisory** — adding a scenario must never
  break `main`.
- A scenario may only be gated at all if its CI half-width is under **8% of its median** on the
  baseline run. `makeBaseline` throws otherwise, naming the offenders.
- A PR that touches **both** `results/baseline.json` and `packages/*/src` fails unless it carries
  the `bench-rebaseline` label. A regression riding in with its own baseline update is the one
  diff that is invisible to every other check in the repo.
- A `bench-override` label downgrades `fail` to `warn` — and prints the label and the requester
  into the step summary, so the override is on the record.
- On a failure, CI re-runs **only the failing scenarios** at `repetitions: 25` and fails only if
  the second pass agrees. The cost is paid only on failure, and it removes the incentive to hit
  "re-run job", which is itself a laundering vector.

---

## Rebaseline checklist

The baseline is committed at `results/baseline.json` and updated **only by a human PR**. There is
no auto-rebaselining bot: a gate that records whatever happened is a ratchet, which is the same as
having no gate.

1. Confirm the change is a *deliberate* trade, not a regression you are tired of arguing with.
   Write the trade down in the PR description.
2. Run the benchmark from a **`workflow_dispatch`** on `main`, **type `31` into the `repetitions`
   field**, and **tick `mint_baseline`**. The dispatch default is 15, which is right for "show me
   where we stand" and too loose for the number every later run is gated against. Not locally — a
   laptop baseline gates a CI runner forever after.
3. The `mint-baseline` job runs `write-bench-report.mjs baseline` for you and opens a PR with the
   new `results/baseline.json` and, beside it, `results/baseline-run.json` — the full record it was
   derived from. If the job fails, a gated scenario is too noisy to gate; fix the noise, do not
   widen the tolerance.
4. Diff the baseline. Every changed ratio needs a sentence in the PR saying why it moved.
5. If the PR also touches `packages/*/src`, add the **`bench-rebaseline`** label — and expect a
   reviewer to read the source diff and the ratio diff together, which is the entire point.
6. Never rebaseline and refresh the published README block in the same PR. The two jobs are
   separate for this reason: `mint-baseline` never writes `README.md` or `latest.json`.

Ticking `mint_baseline` is opt-in and the PR is still merged by a human, so the no-auto-rebaselining
rule holds. What it removes is only the step in the middle — download the artifact, find the JSON,
run the CLI on your laptop — which is where a dispatch run's evidence used to go to die.

**Keeping a run without rebaselining.** A dispatch that leaves `mint_baseline` unticked still
uploads its full JSON as a build artifact, retained 30 days. That is the right home for a "where do
we stand" run. Only reach for the checklist above when you actually intend to move the gate — and
when you want a durable before/after around a performance fix, mint the *before* deliberately, so
`baseline-run.json` is in git to diff the after against.

---

## Publishing

The headline block in the root README is generated between
`<!-- bench:headline:start -->` / `<!-- bench:headline:end -->` markers. Five mechanisms keep it
from rotting into a marketing claim:

- The block is **generated** from `results/latest.json`, never hand-written.
- A **drift check** in CI regenerates it and fails if the README differs — a number that is not in
  the JSON breaks the build.
- The **date comes from `run.startedAt`**, so it cannot be freshened without a run that happened.
- **Staleness** warns at 45 days and fails at 120.
- A **completeness check** fails if the rendered scenario set differs from the results set. There
  is no supported way to publish with the losing rows removed.

And, upstream of all of them: `run.publishable` is false for anything but a scheduled or
`main`-push run on a clean tree, and `renderHeadlineTable` **throws** on a non-publishable run. PR
runs are noisy and re-runnable; letting one write the README would allow re-rolling until the
numbers flattered quadrum. Every raw sample ships in the JSON, so an implausibly tight
distribution is visible to anyone who looks.

---

## Layout

```
src/core/       harness, clock, stats, parity guards, env
src/adapters/   quadrum/ · chessground/ · shared/ (parity CSS)
src/scenarios/  registry + one file per scenario
src/ui/         the visual page
src/bench-api.ts   window.__bench = { list, run, env } -- the only runner contract
runner/         Playwright + CDP driver, bundle sizing, console report
bench-entries/  the three lib-mode entries scenario 8 builds
results/        latest.json (published run) · baseline.json (gate baseline)
test/           unit tests for stats, harness and the game data
```

Unit tests run under the root vitest config (`pnpm test`). `stats.ts` and the interleave/discard
logic decide what the published numbers *are* — an off-by-one in a percentile silently changes the
headline — so they sit under the same gate as the library itself.
