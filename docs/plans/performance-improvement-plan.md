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
| [`bench-trust-and-update-tail.md`](bench-trust-and-update-tail.md) | Gate sensitivity calibration, sub-resolution win rendering, stale profiler attribution | **In progress** — this branch. |

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

---

## Published numbers

The README headline block is generated from `apps/bench/results/latest.json` by the
nightly CI. It is regenerated from mint #78 (post-W3, post-#77), the latest at the time
this document was updated. Mint #75 (pre-W3) and mint #78 are the two in play; **absolute
milliseconds are not comparable between them** (different runners: AMD EPYC 9V45 vs Intel
Xeon Platinum 8573C). Ratios are durable across runner changes.

---

## Open items

Ranked by what is actually blocking.

**1. Anim-off gate sensitivity is weak.** The committed baseline's `update-throughput-anim-off`
sensitivity is **1.813** — only a **+81% regression** is detectable in the gated metric. The
baseline was minted on a favourable run and the wide interval reflects true measurement noise
on a vsync-locked scenario. This programme's `bench-trust-and-update-tail.md` (W1–W2) adds a
warning band so weak gates are visible at mint time rather than discovered during a PR run.
The gate still gates; the warning is a notice that it is near its useless limit.

**2. Anim-off metric moved from frame-interval to frame-script per-frame work.** The frame-interval
metrics are vsync-locked in headless and cannot move with the library. The new
`update-throughput-anim-on` headline metric measures per-frame script time instead, which does move
with a regression. The scenario stays ungated (the 3-repetition interval is wide), but the number
can now serve as an advisory signal of an anim-on regression the gate alone would miss.

**3. The bundle-size tolerance is still relaxed.** `DEFAULT_BUNDLE_TOLERANCE` in
`.github/scripts/bench-report.mjs` is `0.12`; the spec calls for an absolute `+2%` gate
(`0.02`). This was widened temporarily and has not been put back.

**4. The bench runner leaks its preview server.** When a run errors out,
`apps/bench/runner/server.ts` leaves its `vite preview` process alive holding a port. As
of 2026-08-16 all 20 ports in the 5473–5492 range were held by orphans, the oldest ~15
hours, which makes the runner unusable locally until they are killed by hand. The runner
needs to tear the server down on the error path.

**5. Release PR #22 has been open since 2026-08-12** (`quadrum@0.3.0`,
`quadrum-react@0.3.0`). Everything since has shipped under `0.2.2`.

**6. `origin/docs/update-path-churn-plan` is a stale remote branch** whose spec is already
merged. Safe to delete.

**7. CPU-model heterogeneity across mints.** Mint #75 ran on AMD EPYC 9V45, mint #78 on Intel
Xeon Platinum 8573C. `engine-arrow-tick` halved in absolute terms for both subjects (26.8 → 14.9 ms
quadrum, 27.3 → 15.9 ms chessground) while the ratio moved only 4%. The `bench-trust-and-update-tail.md`
spec (W4) adds CPU-model recording and a notice when the runner changes, so future drifts can be
diagnosed without hand-diffing baseline.json.

---

## Not started

- **Lazy mount** — the unbuilt half of `arrow-diff-and-lazy-mount.md`: defer render work
  until a board is actually visible.
- One test failure observed in a much earlier session that has never reproduced. Its name
  was not captured, so there is nothing actionable here beyond a note that it happened.
