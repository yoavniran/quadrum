# Project status

Living rollup of what has landed and what is still open. The other files in this
folder are **specs, not records** — each was written before its work started and is
never edited afterwards, so none of them says what actually shipped. This file is the
one that does, and it is the one to update.

Last updated: 2026-08-19 · `main` at `558cc2a` · published version `quadrum@0.2.2`

---

## The specs in this folder

| Spec | Covers | Status |
| --- | --- | --- |
| [`benchmarks-vs-chessground.md`](benchmarks-vs-chessground.md) | `apps/bench`, the runner, the CI gate, the README headline block | **Delivered** — M0–M5 all landed. The gate has since been tuned beyond what the spec describes; see *Open items 2 and 3*. |
| [`update-path-node-churn.md`](update-path-node-churn.md) | Allocation and DOM churn on the position-update path | **Delivered** — landed across #28, #31, #33, #38, #40, #46. |
| [`arrow-diff-and-lazy-mount.md`](arrow-diff-and-lazy-mount.md) | Arrow diffing and deferring work until a board is visible | **Partially delivered** — the arrow half landed (#42, #49); lazy mount has not been started. |
| [`update-path-render-cost.md`](update-path-render-cost.md) | Position-update rendering cost and per-frame layout | **Delivered, partly** — planned ~10% improvement on a stale 1.53× basis; the headline metric moved from a strict CI loss to **parity** across #73–#77. The planned percentage was measured against a baseline that no longer existed by the time the work ran, so the honest statement is the parity move, not a percentage. |
| [`bench-trust-and-update-tail.md`](bench-trust-and-update-tail.md) | Gate sensitivity calibration, sub-resolution win rendering, stale profiler attribution, the anim-off tail | **Delivered** — W1, W3–W7 landed as reporting and tooling changes; W2 cut update-path allocation by 58% and moved the per-update p95, see *The anim-off tail (W2) in detail* below. |

---

## Performance programme — what landed

Every entry is on `main` unless marked otherwise.

| PR | Change |
| --- | --- |
| #20 | Skip redundant work on the coords, pieces and marks paths |
| #28 | Render only the layers a mutation dirtied |
| #31 | Reuse piece elements across a move |
| #33 | Pool highlight squares instead of churning them |
| #38 | Compare against a written-value record rather than reading the DOM |
| #40 | Shrink the render-parts table to fit the bundle gate |
| #42 | Recycle mark nodes and pool fade gradients |
| #46 | Cut per-update allocations on the position path |
| #73 | Tail-call optimise the piece render to amortize the layout cost across pieces instead of per-update |
| **#77** | **Drive the piece pass from a changed-square hint, extract pairing tail into a separate function — see "#77 in detail" below** |
| **#49** | **Hand off mark nodes and own gradients per shaft — open, see below** |

### #49 in detail (branch `perf/engine-arrow-tick`)

Four levers on the arrow path: direct mark-node handoff within a single render
(removing ~78 DOM ops per tick of park/unpark churn), owner-keyed gradients replacing a
content-keyed cache that missed 100% of the time on a moving arrow, a write-through
attribute mirror (`view/svgAttrs.ts`) replacing `getAttribute`-guarded writes, and
allocation-free point-string building.

Measured locally: `engine-arrow-tick` total script time **11.90 ms → 8.41 ms (~29% faster)**,
stable across runs. On CI the scenario gates at **ratio 0.988 vs a 1.931 threshold** — the
win is real and confirmed. The absolute drop is the durable claim; the ratio moves with
chessground's own drift between runs, so it is not worth quoting to three digits.

**Pooling is bounded and leak-free** (audited 2026-08-16): mark node pools cap at 32 per
kind, the gradient parked list at 8, `byOwner` is fully swept on every render with no
early-return path that can skip it, and there are no event listeners on the marks path at
all. `MarkPools.drain()` and `GradientRegistry.drain()` have no callers, but that is dead
code rather than a leak — the cache hangs off a `WeakMap` keyed by `BoardDom`, so it dies
with the board at both teardown sites. Two regression tests pin the bounds (`2e25484`).

### #77 in detail (W3 of `update-path-render-cost.md`)

Two mechanisms: drive the piece pass from a changed-square hint instead of re-walking every
square on the board, and extract the pairing tail of `renderPieces` into a separate
`applyPairing` function so the two can be optimised independently.

**The strong evidence is local:** interleaved A/B on `update-throughput-anim-off`, three
pairs, no overlap: **6.07 → 4.63 ms** (24% faster). The mint delta is not the evidence
— mints #75 and #78 overlap heavily and would not prove it alone, though they move in the
right direction.

**The mint movement on the headline:** anim-off ratio `1.305× [1.036, 1.516]` → `1.107×
[0.729, 1.539]`. The pre-W3 CI **excluded 1** (strict loss); the post-W3 CI **includes it**
(parity). That is the claim the data supports — the win is real on the local run, and the
gate moved from red to green on the same scenario, but the interval is still wide.

**Bundle cost:** `11 540 → 11 874 B` brotli, **+334 B (+2.9%)** — under the gate and
honestly stated rather than left for a reader to diff two baselines.

### The anim-off tail (W2) in detail

The spec asked whether the anim-off tail is GC pressure or scheduler noise, and required
that the answer come from an allocation profile rather than from reading the code. Both
halves of that turned out to matter.

**The harness was wrong first.** `HeapProfiler.startSampling` takes
`includeObjectsCollectedByMajorGC` and `includeObjectsCollectedByMinorGC`, and both
default to **false** — V8 then drops every sampled object the GC later collected, so the
profile reports only what *survived*. That is the exact inverse of a GC-pressure question:
short-lived garbage, the thing being hunted, is invisible. The first profile duly reported
0.07 MB over three rounds and showed the update path as essentially allocation-free. That
reading would have been published as an acquittal.

Two self-consistency checks — sampling-interval independence (1024 B vs 128 B) and
scaling with round count — both looked healthy and **did not catch it**. What caught it
was an independent calibration: allocate a known quantity (1000 throwaway 32-entry Maps)
and check the profiler reports it. Under the defaults it reported 64 kB; with the flags
on, 3.80 MB — a 60× gap. The real profile went from 0.07 MB to **20.77 MB**. The flags and
the calibration figure are now pinned in a comment in `apps/bench/runner/heap-profile.ts`
so the harness cannot silently regress to reporting survivors.

**The verdict: GC, and none of the suspects.** With a profiler that could see garbage, the
convicted allocator was the **iterator protocol**, not any of the allocations the spec
named as suspects. `for...of` over a `Map` allocates a `{value, done}` result object per
entry and, when the loop destructures, a `[key, value]` pair array as well; `for...of`
over an array pays the result object too. Ranked by self-bytes over three rounds:

| function | before | after | change |
| --- | --- | --- | --- |
| `changedSquares` | ~3.0 MB | — | eliminated |
| `applyPairing` | 1.45 MB | 713 kB | −51% |
| `renderPieces` | 1.90 MB | 1.19 MB | −37% |
| `renderSquares` iterator objects | ~250 kB | — | eliminated |
| **quadrum `update` subtree** | **6.78 MB** | **2.85 MB** | **−58%** |

`changedSquares` alone was 44% of the update subtree. The fix is `Map.prototype.forEach`
and indexed `for` loops in the convicted walks — same walks, same order, same output, no
state kept between calls. **No cache was introduced: the FEN-parse cache rejection
stands.** chessground, unchanged throughout, held at 2.2–2.6 MB across the same runs and
serves as the control; quadrum went from ~2.9× chessground's per-update allocation to
roughly parity.

`fenToPieces` is the largest remaining allocator (`set` 407 kB, `split` 174 kB) and was
deliberately left alone — it is exactly the site whose caching fix the spec rejects, and
the non-caching alternative is a larger rewrite than this item justifies.

**What the timing shows, and what it does not.** Local A/B/A on
`update-throughput-anim-off`, 15 repetitions per arm, fixed → ablated → fixed, with
chessground as an unchanged control in every arm:

| metric | fixed | ablated | fixed (repeat) |
| --- | --- | --- | --- |
| per-update script p95, quadrum | 0.166 ms | 0.300 ms | 0.150 ms |
| per-update script p95, ÷ chessground | 0.561 | 0.690 | 0.429 |
| total script median, quadrum | 2.94 ms | 4.15 ms | 2.74 ms |
| total script median, ÷ chessground | 0.902 | 0.994 | 0.775 |

The ablated arm sits outside both fixed arms on every script row, in the same direction,
against a control measured alongside it — so **the p95 tail did come down**, and it is not
drift. The single-pair comparison would not have shown this honestly: chessground's own
numbers moved 20–30% between the first two arms, which is why the third arm exists.

Two things these local numbers do **not** support. First, the **half-width did not close
on the laptop**: quadrum's per-update p95 interval was 0.211 / 0.260 / 0.245 ms across the
three arms — flat. The spec asked for p95 *and* half-width to close toward chessground's;
here, only the p95 did. (This held for the laptop A/B/A and was written up as the finding.
A later CI mint measured the durable quantity and found otherwise — see the correction
below.) Second, the spread between the two fixed arms is nearly as large as the effect on the
total-script ratio (0.902 vs 0.775), so the direction is solid but **no magnitude should be
quoted from these local numbers**. `update-total-layout-ms` did not move at all
(ratio 0.85 / 0.86 / 0.84), as expected — nothing here touches the DOM-write path.

None of these numbers feed the gate. The committed baseline is CI hardware and is not
comparable to a laptop; a re-mint on CI is what would move the gated figure.

**Correction — mint #84: on CI, the half-width did close.** The re-mint after W5/W6 landed
(31 repetitions, same as mint #78) put `update-throughput-anim-off`'s ratio confidence
interval at **[0.808, 1.200]**, against **[0.729, 1.539]** at mint #78 — a half-width of
**±0.196 against ±0.405, roughly halved**. W1's sensitivity figure moved with it, from
**+81% to +46%**, taking the scenario below the warning threshold: it now detects a
regression a little under half the size of the smallest one it could see before.

This does not make the paragraph above wrong about what it measured. The laptop reading was
quadrum's *absolute* p95 interval in milliseconds; the mint's is the *ratio* interval, which
is the quantity that survives a runner change and the only one the gate consults. They are
different numbers, and the ratio is the better measurement of the two — so the spec's ask,
that the half-width close, is met on the measurement that counts, and was simply not
visible at 15 repetitions on a noisy laptop.

Two things this still does not license. The interval **contains 1.0**, so anim-off is
formally **parity with chessground, not a win**, and must not be published as one despite
the point estimate crossing to quadrum's side (1.107 → 0.922). And chessground's own
absolute median moved (10.19 → 11.50 ms) across a runner change to AMD EPYC 7763 — the
cross-mint comparison holds for ratios only, which is exactly the failure W4's recorded
`env.cpuModel` exists to make visible.

---

## Published numbers

The README headline block is generated from `apps/bench/results/latest.json` by the
nightly CI. It currently comes from the scheduled run of 2026-08-19 on AMD EPYC 7763,
post-W1–W7 and post-mint #84. Three runner generations are now in play across the runs this
document cites — AMD EPYC 9V45, Intel Xeon Platinum 8573C, AMD EPYC 7763 — so **absolute
milliseconds are not comparable between them**. Ratios are durable across runner changes,
and since W4 each run records its `env.cpuModel` so the change is visible rather than
inferred.

---

## Open items

Ranked by what is actually blocking. Verified against the tree at mint #84.

**1. Phase F's size pass is still unbuilt** (the gate half is done). Phase F of
`update-path-node-churn.md` has two halves: restore the bundle gate, and audit what the
four phases actually cost in bytes. The gate is restored — `DEFAULT_BUNDLE_TOLERANCE` is
back to `0.02`, verified inert on the committed run (the bundle sits at −0.1%, and all
eight scenario verdicts were byte-identical to what `0.12` produced) while failing a
synthetic +3%, where the old cap passed a 1.3 kB jump untouched. The audit is not done:
measuring each phase's contribution to the bundle in isolation, and looking for shared
machinery across the three pools (pieces, squares, marks). The current bundle sits **244
brotli bytes** under the restored cap, so the audit is what buys headroom back if a later
phase needs it — that margin is a constraint on the next feature, not a comfort.

**2. `origin/ci/auto-changeset` is unmerged work awaiting a decision.** It adds
`write-auto-changeset.mjs` to `release.yml` to backfill changesets for source-touching
commits that shipped without one — written against changesets machinery this repo does not
run, since main releases through release-please. So it cannot land as written. The problem
it describes may still be live under release-please: seven consecutive `perf(core)` PRs
merged past the changeset warning, leaving the pending release describing a packaging
change and none of the work that actually moved what consumers run. Either retarget it at
release-please or delete it deliberately; leaving it is the one option that decides nothing.
Its tip is `b7c37b5`.

### Closed since this section was last written

- **Anim-off gate sensitivity was weak** (was +81% detectable). Mint #84 brought it to
  **+46%**, below W1's warning threshold, and W1 now surfaces the figure at mint time
  rather than leaving it to be discovered during a PR run. See the correction above.
- **The anim-off metric moved from frame-interval to per-frame script time** (W6). The
  frame-interval metrics are vsync-locked in headless and cannot move with the library.
  Mint #84 produced the metric's first real reading, **1.622** — the old `1.000` was the
  dead vsync-locked metric pinned at parity by construction, so the two are not comparable
  and this is not a regression. The scenario stays correctly ungated (sensitivity 1.44).
- **The bench runner leaked its preview server.** `apps/bench/runner/server.ts` now signals
  the child's whole process group on the start-failure path, and registers `exit`/`SIGINT`/
  `SIGTERM` handlers as a backstop so a crash or Ctrl-C cannot orphan a server holding a
  port. Group-signalling is the part that matters: `pnpm exec` means the spawned process is
  pnpm and vite is its child, so signalling the pid alone reaped the wrapper and orphaned
  the server — which is what produced the 20 held ports.
- **Release PR #22** is closed.
- **The stale remote branches are gone.** `docs/update-path-render-cost` (byte-identical to
  main), `docs/update-path-churn-plan` (a superseded draft; main's version of the spec is
  485 lines ahead) and `changeset-release/main` (a bot artifact carrying no human work) are
  deleted. `release-please--branches--main` was deliberately kept — it carries open release
  PR #74.
- **CPU-model heterogeneity across mints** is now recorded rather than inferred (W4). Every
  run carries `env.cpuModel`, and the report raises a notice when the runner changes. Three
  generations have been seen so far (AMD EPYC 9V45, Intel Xeon Platinum 8573C, AMD EPYC
  7763); the underlying hazard is unchanged — absolute milliseconds never survive a runner
  change, ratios do — but it is now visible at the point of comparison.

---

## Not started

- **Lazy mount** — the unbuilt half of `arrow-diff-and-lazy-mount.md`: defer render work
  until a board is actually visible.
- One test failure observed in a much earlier session that has never reproduced. Its name
  was not captured, so there is nothing actionable here beyond a note that it happened.
