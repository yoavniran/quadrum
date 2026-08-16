# Project status

Living rollup of what has landed and what is still open. The other files in this
folder are **specs, not records** — each was written before its work started and is
never edited afterwards, so none of them says what actually shipped. This file is the
one that does, and it is the one to update.

Last updated: 2026-08-16 · `main` at `6109221` · published version `quadrum@0.2.2`

---

## The specs in this folder

| Spec | Covers | Status |
| --- | --- | --- |
| [`benchmarks-vs-chessground.md`](benchmarks-vs-chessground.md) | `apps/bench`, the runner, the CI gate, the README headline block | **Delivered** — M0–M5 all landed. The gate has since been tuned beyond what the spec describes; see *Open items 2 and 3*. |
| [`update-path-node-churn.md`](update-path-node-churn.md) | Allocation and DOM churn on the position-update path | **Delivered** — landed across #28, #31, #33, #38, #40, #46. |
| [`arrow-diff-and-lazy-mount.md`](arrow-diff-and-lazy-mount.md) | Arrow diffing and deferring work until a board is visible | **Partially delivered** — the arrow half landed (#42, #49); lazy mount has not been started. |

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

---

## Published numbers

The README headline block is generated from `apps/bench/results/latest.json` by the
nightly. It currently reflects `cc918e1` and is therefore **stale by #46, #48 and #49** —
it still prints `2.70×` for `update-throughput-anim-off` and `1.42×` for
`engine-arrow-tick`, both of which have since improved substantially. This corrects
itself on the next nightly that runs after those land; no action needed beyond landing
them.

---

## Open items

Ranked by what is actually blocking.

**1. #49 is blocked by the benchmark gate.** `engine-arrow-tick` passes comfortably; the
failure is `update-throughput-anim-off` at ratio 1.341 (CI 1.041–1.708) against a 0.921
threshold, and the 25-repetition confirm pass agreed. #49 does not touch the position
path, so this is either a genuine second-order interaction or the baseline problem in
item 2 — **undiagnosed, and it needs diagnosing before the branch can land.**

**2. The `update-throughput-anim-off` baseline is too tight to be useful.** `main` passes
it at ratio 0.910 against a 0.921 threshold — a 1.2% margin on a scenario whose own
confidence interval spans roughly ±20%, and whose reported sensitivity is "≥ +36%". A gate
that can only detect a 36% regression but sits 1.2% from firing will red-X `main` on
noise alone. The baseline was minted on a favourable run and should be re-minted, or the
scenario dropped from the gated set until it can be measured tightly enough to gate.

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

---

## Not started

- **Lazy mount** — the unbuilt half of `arrow-diff-and-lazy-mount.md`: defer render work
  until a board is actually visible.
- One test failure observed in a much earlier session that has never reproduced. Its name
  was not captured, so there is nothing actionable here beyond a note that it happened.
