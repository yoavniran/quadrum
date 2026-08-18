# Trusting the numbers: gate sensitivity, the update tail, and stale attribution

The update-path performance programme is delivered — the anim-off headline moved from a
strict CI loss to parity across #73 and #77. What is left is not a losing scenario; it is
that some of the *measurements* are now weaker than the code they measure. This spec
attacks the top items, in order of how much a wrong number would cost.

Written 2026-08-18. Status: **spec, not a record** — per the convention in
[`performance-improvement-plan.md`](performance-improvement-plan.md), this file is never
edited once its work starts; `performance-improvement-plan.md` is where the outcome gets
written.

---

## Where we stand

Two baselines were minted the same day, both at 31 repetitions, before and after W3
(PR #77):

| scenario | mint #75 (pre-W3) | mint #78 (post-W3) |
| --- | --- | --- |
| mount | 0.789× [0.774, 0.805] | 0.835× [0.823, 0.846] |
| update-throughput-anim-off | 1.305× [1.036, 1.516] | 1.107× [0.729, 1.539] |
| engine-arrow-tick | 0.982× | 0.937× [0.798, 1.040] |
| drag-latency p95 | 0.981× | 0.975× [0.970, 0.981] |
| resize-storm | 0.071× | 0.069× |
| bundle-size | 0.947× (11 540 B) | 0.975× (11 874 B) |

The anim-off CI includes 1 for the first time — the pre-W3 interval [1.036, 1.516]
excluded it, i.e. was strictly a loss. The stronger evidence for W3 itself is the local
interleaved A/B in #77 (medians 6.07 → 4.63 ms, three pairs, no overlap); the mint delta
alone would not prove it, because the two mints' intervals overlap heavily. That overlap
is the first problem this spec is about.

## Evidence

### 1. The gate is nearly blind on its flagship scenario

`detectableRegression` (bench-report.mjs) derives each gated scenario's sensitivity from
the baseline's ratio CI half-width. Mint #78:

| scenario | sensitivity | meaning |
| --- | --- | --- |
| mount | 1.166 | catches a +17% regression |
| drag-latency | 1.157 | +16% |
| engine-arrow-tick | 1.320 | +32% |
| **update-throughput-anim-off** | **1.813** | **only a +81% regression is detectable** |

The demotion cap (`MAX_GATED_DETECTABLE_REGRESSION = 1.0`, i.e. sensitivity 2.0) kept the
scenario gated — but a real +50% regression on the exact metric the whole update-path
programme optimised would sail through today's gate. Nothing warns at mint time that a
scenario landed in the top half of the allowed band; the number is written into
`baseline.json` and read by nobody.

### 2. The blindness comes from quadrum's own tail

Per-rep spread in mint #78, `update-total-script-ms`, n=31 each:

|  | median | CI95 | p95 |
| --- | --- | --- | --- |
| quadrum | 11.29 ms | 8.99–14.25 | **23.26 ms** |
| chessground | 10.19 ms | 9.26–12.34 | 17.15 ms |

quadrum's median CI is ±23%; chessground's is ±15% on the same runner in the same
interleaved run — so this is not purely shared-runner noise, quadrum's distribution has a
heavier tail. Locally the committed profiler (403 ms window over 3 rounds, both subjects
plus scaffolding) shows the garbage collector at 27.5 ms self, 6.8% — the second-largest
self-time entry after the bench's own `forceLayout`. GC pauses landing inside a handful
of reps is exactly the shape that widens a CI without moving the median. Unattributed as
yet: that is what the allocation profile in W2 is for.

Tightening the tail fixes the gate's blindness at the source; buying more repetitions
only averages over it.

### 3. The profiler's watchlist predates W3

`profile.ts` `WATCH_PATTERNS` still describes the pre-W3 shape of the code. W3 extracted
the pairing tail of `renderPieces` into `applyPairing` (6.4 ms self in the local profile —
now the largest quadrum entry) and added `changedSquares` (3.9 ms self) and
`outOfBandWrites`; none are watched, while `renderPieces` itself is down to 0.8 ms self.
Anyone reading the watchlist today would conclude the piece pass costs ~1 ms when its
real attributed self time is ~11 ms across the three functions. The tool built to prevent
misattribution is now the thing misattributing.

### 4. Absolute numbers silently stopped being comparable across mints

Mint #75 ran on an AMD EPYC 9V45 runner, mint #78 on an Intel Xeon Platinum 8573C.
`engine-arrow-tick` halved in absolute terms for *both* subjects (26.8 → 14.9 ms quadrum,
27.3 → 15.9 ms chessground) — the ratio moved 4%. The README already says ratios are the
durable part, and `env.cpuModel` is recorded in every run — but nothing compares it, so a
future "regression" that is actually a runner change would be investigated by hand before
anyone thinks to look at the CPU field.

### 5. Two published claims are honest but fragile

- **resize-storm 0.069×** is consistent across both mints, but quadrum's median is
  0.055 ms — a few timer quanta. The ratio is real (chessground pays 0.79 ms of layout,
  quadrum pays none); "14× faster" is not the claim the data supports, "quadrum does no
  layout work on resize" is. The renderer has a "below timer resolution" notion for
  parity rows already; a sub-resolution *win* renders as a bare ratio.
- **update-anim-on** is vsync-saturated: every timing metric reads 16.67 ms for both
  subjects at n=3, already flagged advisory and ungated. It measures that neither
  library drops frames in headless — fine — but it can never move. The one number that
  could move is script time *per frame* (headroom below the frame budget), which the
  scenario does not record.

### 6. W3's bundle cost

11 540 → 11 874 B brotli, +334 B (+2.9%). Under the gate, honest, and worth stating in
the record file rather than leaving readers to diff two baselines.

---

## Work items

Sized against the evidence above. W1/W3/W4 are measurement-trust items in the bench and
scripts only — no library code. W2 is the one product-code item. W5/W6 are publication
honesty. Order is priority order; only W2 depends on nothing landing first (though W3
makes its profiles easier to read, so W3 before W2 is the sensible sequence).

### W1 — Mint-time sensitivity budget · small · low risk

`baseline` mode currently demotes a gated scenario only past sensitivity 2.0 and says
nothing below that. Add a warning band: any gated scenario minted with sensitivity above
half the demotion cap (> 1.5) prints a loud notice naming the scenario, its sensitivity,
and the remedy (re-mint on a quieter run, or accept and say so). Surface every gated
scenario's sensitivity in the gate's step summary so the number is seen on every PR, not
only at mint time. Pure `bench-report.mjs` + tests; the thresholds live next to
`MAX_GATED_DETECTABLE_REGRESSION`.

Acceptance: unit tests covering both sides of the band; the step summary for a run
against mint #78 shows anim-off at +81% detectable; no gate verdict changes.

### W2 — Attribute and cut the anim-off tail · medium · medium risk

The only item touching `packages/core`. Take an allocation profile (CDP sampling heap
profiler, same harness discipline as `profile.ts`) over the anim-off loop and attribute
the GC pressure. Known candidates from reading the path: per-update `Map` construction in
FEN parsing, the `needed`/`vacated`/pair arrays in the piece pass, and string
concatenation in transforms. Fix what the profile convicts — not what reading the code
suspects — with the same reuse discipline as #46 (caller-owned buffers, module scratch
that never escapes).

Success is measured on the *distribution*, not the median: quadrum's p95 and CI half-width
on `update-total-script-ms` should close toward chessground's, and the next mint's
sensitivity should land under the W1 warning band. The median moving is welcome but not
the goal.

Guardrail: no caching keyed on input identity (the FEN-parse cache rejection from the
render-cost spec stands — the bench feeds strings precisely so parsing is paid). If the
tail turns out to be scheduler noise rather than GC, say so in the record file and stop —
that outcome routes the fix to W1's re-mint advice instead, and repetitions, not code,
become the lever.

### W3 — Refresh the profiler watchlist · small · no risk

Add `applyPairing`, `changedSquares`, and `outOfBandWrites` to `WATCH_PATTERNS`; audit
the existing entries against what still exists (`planDiff` in particular). One-line-each
change plus its test. Do this before W2 so W2's profiles attribute the piece pass
correctly.

Acceptance: a profile run on current `main` shows the three new names in the watchlist
table; no watched name fails to match a function in the unminified bundle.

### W4 — Cross-mint comparability guard · small · low risk

Record `cpuModel` into the minted baseline (it is already in the run's `env`; the
baseline keeps only throttle and headless today). At gate time, when the run's CPU model
differs from the baseline's, print a notice into the step summary: ratios remain
comparable, absolute milliseconds do not. Never fail on it — runner heterogeneity is a
fact of shared CI, not an error.

Acceptance: unit test for match and mismatch; gating mint #78's run against a synthetic
EPYC baseline shows the notice.

### W5 — Sub-resolution wins render as what they are · small · no risk

When a scenario's winning median sits below a few timer quanta (the renderer already owns
the resolution constant for parity rows), render the ratio with the qualifier the data
supports — e.g. "quadrum ≈ 0 ms (below timer resolution) — does no layout work here" —
instead of a bare 0.07×. Applies today only to resize-storm. Renderer + tests; the gate
is untouched.

### W6 — Give anim-on a metric that can move · medium · low risk

Add per-frame script time during the animated replay as the scenario's headline
(p95 across frames), keeping the vsync metrics as advisory context. It stays ungated and
headless-advisory — the point is a number with headroom below 16.67 ms that a regression
can actually push, instead of a metric pinned to the frame budget by construction.
Requires touching the scenario and its parity note; both subjects must be bracketed
identically, chessground's rAF-deferred render included in its frame cost the same way
the anim-off scenario already flushes it.

### W7 — Close the books on the render-cost programme · chore · no risk

Update `performance-improvement-plan.md`: the render-cost spec's outcome (planned ~10% on
a stale 1.53× basis; delivered headline loss → parity across #73/#77, W3's actual
mechanism and its +334 B bundle cost), and merge the spec branch
(`docs/update-path-render-cost`) so the record file's link resolves on `main`. No code.

---

## Honesty guardrails

Carried over from the render-cost spec, plus this programme's own:

- **Repetitions buy signal; trimming manufactures it.** No outlier-rejection,
  winsorising, or "warm-up extension" changes to the anim-off statistics to make the CI
  look tighter. The tail is either explained and fixed in the product (W2) or reported
  as runner noise — never edited out of the summary.
- **W1/W4/W5 change what is *said*, never what is *measured*.** Gate verdicts on
  identical inputs must be byte-identical before and after; the tests should assert it.
- **Profile numbers never feed the gate.** W2's allocation profile is attribution
  evidence for choosing what to fix; the bench decides whether it worked.
- **W6 must not be gated in headless.** Frame timing without real vsync is advisory by
  the bench's own documentation; adding a movable metric does not change that.
- The FEN-parse-cache rejection stands verbatim.
