# Cutting the anim-off update cost

quadrum loses the `update-throughput-anim-off` scenario to chessground. This spec is the
plan to win it, derived from a CPU profile rather than from reading the code and guessing.

Written 2026-08-18. Status: **spec, not a record** — per the convention in
[`performance-improvement-plan.md`](performance-improvement-plan.md), this file is never edited once
its work starts; `performance-improvement-plan.md` is where the outcome gets written.

---

## Where we stand

The gated metric is `update-total-script-ms`, and quadrum sits at **1.53×** chessground on
it. The scenario's two timing brackets are *disjoint*, not nested — the script bracket
covers `setPosition` + `flush`, the layout bracket covers a separate `forceLayout` — so the
honest end-to-end figure is script + reflow, where quadrum is **≈1.25×**. chessground pays
proportionally more of its cost in the reflow, where the two are level (1.020).

So: the reflow is already a tie, and **all of the loss is in script**. That is the only
thing this spec attacks.

## Evidence

A CDP sampling profiler (`Profiler.setSamplingInterval` at 50 µs) over 40,000 anim-off
updates, driving each subject's own `frame-<subject>.html` directly — no iframe, no sibling
stylesheet. The bench app was rebuilt with `--minify false` so frames carry real names.

Run at **throttle 1, not CI's 4**: throttling is implemented by parking the thread, which
smears sample attribution. Wall-clock magnitude is not what the run is for; the breakdown is.
It reproduces the loss directionally — quadrum **285.9 ms** vs chessground **238.9 ms**, a
**1.20×** unthrottled against CI's ≈1.25× — which is close enough that the breakdown is
describing the same phenomenon the gate measures.

The harness is a one-off and is not committed. It is ~130 lines: launch, mount one board,
loop `setPosition`/`flush`, fold profile nodes by `functionName@file:line`, print self time.
Anyone reproducing this should rebuild it, and should re-run `pnpm --filter quadrum-bench
build` afterwards — an unminified `dist` left in place silently poisons every later
measurement.

### quadrum — 306.1 ms profiled, 4124 samples

| self ms | % | function |
| --- | --- | --- |
| 64.4 | 21.0 | `renderPieces` |
| 42.8 | 14.0 | `writeTranslate` |
| 41.2 | 13.5 | `fenToPieces` |
| 28.7 | 9.4 | `writeSquareAttr` |
| 16.0 | 5.2 | `renderSquares` (squaresView) |
| 15.7 | 5.1 | `isHeld` |
| 11.8 | 3.9 | `contains` (native) |
| 11.1 | 3.6 | garbage collector |
| 10.0 | 3.3 | `render` (board dispatch) |
| 8.4 | 2.7 | `fileIndex` |
| 6.4 | 2.1 | `rankIndex` |
| 5.6 | 1.8 | `applyOptions` |
| 5.3 | 1.7 | `renderSquares` (board wrapper) |
| 4.5 | 1.5 | `update` |
| 3.7 / 3.3 / 2.8 / 2.5 | 1.2 / 1.1 / 0.9 / 0.8 | `createPieceEl` / `recordFor` / `placePieceEl` / `pieceOf` |

### chessground — 265.0 ms profiled, 3604 samples

`render$1` 76.1 (28.7%), `read` 34.0 (12.8%), `redrawNow` 33.3 (12.6%), `translate` 25.1
(9.5%), `isPieceNode` 17.8 (6.7%), anon@888 12.4 (4.7%), GC 10.4 (3.9%), then a tail under
5 ms. Its work is concentrated in one big function, so per-phase comparison against it is
indicative only — the profile cannot attribute what the compiler inlined.

### Grouped, correctly

`writeSquareAttr` and `writeTranslate` are reached through `placeSquare`, which
`placePieceEl` drives. `placePieceEl` runs once per piece per render (32) and once per
*decorated* square (typically 2–4), so ~90% of both belongs to the **piece pass**, not the
squares pass.

| Group | ms | % | Notes |
| --- | --- | --- | --- |
| **Piece pass** | **≈190** | **62%** | `renderPieces` + the whole placement chain + held tests |
| FEN parse | 41.2 | 13.5% | vs chessground's `read` at 34.0 — only ~21% worse |
| Board plumbing | 20.2 | 6.6% | `render` + `applyOptions` + `update` + `dirtyParts` |
| Squares pass | 21.3 | 7.0% | `renderSquares` ×2 |
| GC | 11.1 | 3.6% | |
| Native DOM mutation | 8.0 | 2.6% | `appendChild`/`removeChild`/`createElement`/`add` |

**The piece pass is the whole story.** Everything below is ordered by recoverable
milliseconds per unit of risk.

---

## The workstreams

### W1 — Stop re-placing pieces that did not move

**≈83 ms · 27% · low risk · do this first**

`renderPieces` PASS 1 walks `state.pieces` and, for each survivor, calls:

```ts
placePieceEl(existing, square, state.orientation);
```

unconditionally. But `existing` was obtained as `els.get(square)` — **the element is already
at that square by construction.** The only thing that can change a survivor's placement is
an orientation flip. Every call therefore runs `fileIndex`, `rankIndex`, `recordFor`,
`writeSquareAttr` and `writeTranslate` only for the guards inside `placement.ts` to reject
the write. In the steady state ~30 of 32 pieces survive, so that is ~1.2M rejected write
attempts across the profiled run.

The guards were the right fix for the *writes* (#38 — compare against a record, never read
the DOM back). They just sit one level too deep: the cheapest write to elide is the one
whose call never happens.

Recoverable: `writeTranslate` 42.8 + `writeSquareAttr` 28.7 + `fileIndex` 8.4 +
`rankIndex` 6.4 + `recordFor` 3.3 + `placePieceEl` 2.8 = 92.4 ms, discounted to **≈83 ms**
for the share the squares pass still needs.

**Design — placement epoch.** A naive `if (orientation unchanged) skip` is the cheap
version and is *probably* correct today, but it is fragile: it silently assumes nothing
ever moves a piece element out of band. Prefer an explicit epoch:

- A per-board counter, bumped whenever anything invalidates placement wholesale —
  orientation flip, and any future path that writes a transform outside `placeSquare`.
- Stamp the epoch into the existing `Placement` record (it is already fetched, already on
  the element under `Symbol("quadrum.placement")`, and already carries `square`).
- A survivor is skipped when `record.square === square && record.epoch === epoch`. Two
  number/string compares against one property read, versus the current six-function chain.
- **The skip elides the placement only, never the bookkeeping.** A skipped survivor still
  gets its `ALIVE` tick stamp and still increments `survivors` — otherwise PASS 2 reads it
  as vacated and removes a live element, exactly the stranded-element failure the long
  comments in PASS 3 exist to prevent. W3 later restates the same bookkeeping, so getting
  this wording right here is load-bearing twice.

The epoch makes the invariant *enforced* rather than *assumed*, and it gives the animation
path a one-line way to opt out if it ever needs to.

**What the epoch cannot see.** The epoch only guards writers that go through
`placement.ts`. A future `el.style.transform = ...` write anywhere else bypasses the record
and the epoch silently — the record goes stale and W1 skips a piece that has visually
moved. Today every writer is routed correctly (`board.ts` animation uses `setTransform`,
drag uses `placePieceAtPoint` → `setTranslate`), but the rule being enforced is **"no
transform or `data-square` writes on piece elements outside `placement.ts`"**, and it
should be enforced as a rule, not as a fact about today's callers: an
`no-restricted-syntax`/`no-restricted-properties` lint entry scoped to `packages/core/src`,
or failing that a dev-mode assertion. Tests cover today's paths; the lint covers tomorrow's.

**Invariant to assert in tests:** a survivor element mapped at square S is visually at S.
Today this holds — the animation cleanup restores the final transform through `setTransform`
(which updates the record), and held elements are skipped by PASS 1 outright and re-placed on
release. Both need a regression test, because W1 converts them from *incidental* truths into
*load-bearing* ones.

**Tests:** extend `piecesViewReuse.test.ts` — orientation flip re-places every piece;
interrupted animation followed by an update leaves pieces at correct transforms; drag
release re-places the dropped piece; a position update that moves one piece writes a
transform on exactly one element (spy on `style.transform`).

---

### W2 — `isHeld` fast path

**27.5 ms · 9.0% · near-zero risk**

```ts
const flag = (el as HTMLElement & FlagCarrier)[HELD];
return flag === undefined ? el.classList.contains("held") : flag;
```

`grep -rn markHeld packages/core/src/` returns only `input/moveInput.ts:82` and `:144` — the
flag is written **only during a real drag**. On a view-only board it is never set, so every
`isHeld` falls through to native `classList.contains("held")`: 32 pieces × 40,000 updates =
1.28M cross-binding DOM calls that always answer false. That is `isHeld` 15.7 + `contains`
11.8 = **27.5 ms**.

The comment above `HELD` already states the intent — *"the render path must not ask the
DOM"* — the initialisation is just missing. Set `[HELD] = false` in `createPieceEl`.

The documented fallback survives intact: `cloneNode` does not copy symbols, so a cloned or
consumer-supplied element still has `undefined` and still consults the class, which is
exactly the case the fallback exists for.

**Tests:** `piecesView.test.ts` — a `cloneNode`d element carrying `class="held"` still reads
as held; a freshly created element reads as not held without touching `classList`.

---

### W3 — Diff-driven PASS 1

**up to ~32 ms · 10% · medium risk · the structural one**

`renderPieces` self time is 64.4 ms (21%) — the loop itself: a Map iteration over 32 entries
plus a hashed `els.get(square)` per entry, 1.28M times. W1 removes the *work inside* the
loop; only a diff removes the loop.

A typical move changes 2–4 of 32 squares. `board.update()` already holds `before`
(`this._state.pieces`) and the freshly parsed `after`, and `model/diffPlan.ts` already
computes exactly this — it is just wired only to the animated path.

**Design.** Compute the changed-square set once in `update()` and pass it to `renderPieces`
as an optional hint. PASS 1 visits only changed squares; the survivor bookkeeping
(`ALIVE` stamps, the `survivors === pieces.size && survivors === els.size` early exit) has to
be restated in terms of "unchanged squares are survivors by definition" rather than counted.

**Why it is riskier than it sounds.** The survivor count drives the early exit, and PASS 2's
`vacated` scan walks all of `els` looking for missing `ALIVE` stamps. Both need reworking
together, and getting it wrong strands elements in the DOM invisibly — the exact failure
class the long comments in PASS 3 exist to prevent. `boardPieceReuse.test.ts` and
`piecesViewReuse.test.ts` are the safety net and both must be extended, not merely kept
green.

**Do W1 and W2 first**, re-profile, and re-scope W3 against the new numbers. With the
placement chain gone, `renderPieces` self time may look different enough to change the
design.

---

### W4 — Stop allocating in `renderSquares`

**≈16 ms + a share of GC · ~5% · low risk**

Per call, `renderSquares` builds a `Map<Square, string[]>`, a fresh `string[]` per decorated
square, plus `staleSquares` and `freshSquares` arrays — for a steady state of two decorated
squares (the last-move highlight). 40,000 calls at ~133 ns is 16 ms of self time, and it is a
visible contributor to the 11.1 ms of GC.

The pooling work (#33) already removed the *DOM* churn here; this is the JS churn left
behind. Options, cheapest first: build the class string directly instead of an array per
square (the array's only consumer is `classList.join(" ")`); reuse a module-scoped `Map` and
clear it; hoist the two scratch arrays.

**Tests:** `squarePool.test.ts` covers the pooling; add a case asserting that reusing scratch
state across two renders does not leak decorations from the first into the second — the
obvious failure mode of a hoisted buffer.

---

### W5 — Let a caller pass an already-parsed position

**up to 41 ms for callers who opt in · additive API · no effect on the gate**

`fenToPieces` is 41.2 ms (13.5%) against chessground's `read` at 34.0 — **only ~21% worse**,
and it is already an indexed `charCodeAt` walk with interned pieces and a precomputed
`ALL_SQUARES` table. There is little left to win inside it, and this is explicitly **not** a
target for micro-optimisation.

The structural win is not parsing at all. An app driving the board from a chess engine
already holds the position in a structured form and is round-tripping it through a FEN string
purely to satisfy the API. Accepting a `Pieces` map on `BoardOptions.position` alongside the
string removes the parse for those callers entirely.

Two things to be explicit about:

- **This does not move the benchmark.** The bench adapter feeds FEN strings, as it should —
  that is what the scenario measures, and changing the adapter to feed parsed maps would be
  straightforwardly dishonest. W5 is a real-app win, listed here because the profile is what
  surfaced it, and it must not be counted toward the gate.
- **A parse cache keyed on the FEN string is rejected.** It would move the benchmark
  substantially (the bench replays 100 positions in a loop) while doing nothing for an app
  that never repeats a position. That is gaming the measurement, and it is the exact failure
  the honesty guardrails in [`benchmarks-vs-chessground.md`](benchmarks-vs-chessground.md)
  exist to catch.
- **A consumer-supplied `Pieces` map degrades the survivor fast path unless interned on
  ingest.** PASS 1's cheap check is `occupant === piece`, which holds because `fenToPieces`
  returns interned piece objects — the same 12 frozen `{color, role}` instances every parse.
  A map built by the caller carries its own objects, so identity fails and every survivor
  check for exactly the callers W5 serves falls to the two-string field comparison. Still
  correct, just slower where W5 promised faster. Fix at the boundary: when `position` is a
  map, re-key each entry through the same interning table `fenToPieces` uses (12 lookups of
  a `color-role` key per update — trivial next to the parse being removed). Interning on
  ingest also keeps a second invariant: state never holds caller-owned mutable objects.

---

### W6 — Micro-cleanups

**small · trivial**

- `ALL_SQUARES.indexOf(square)` in `renderPieces` PASS 2 and in `planDiff` is a linear scan
  of 64 strings, called per vacated × per needed. Cold in the anim-off steady state (PASS 2
  barely runs), hot on the animated path. Replace with a lookup table — `squares.ts` already
  has the shape for it.
- `renderPieces` PASS 2 builds an O(vacated × needed) pair list, sorts it, then greedily
  selects. Fine at chess sizes; noted only so the next reader does not have to re-derive that
  it is intentional.

---

## Projection

| After | script ratio | end-to-end ratio |
| --- | --- | --- |
| today | 1.53× | ≈1.25× |
| W1 + W2 | ≈1.02× | ≈0.93× |
| W1 + W2 + W4 | ≈0.96× | ≈0.90× |
| plus W3 at estimate | ≈0.86× | ≈0.85× |

These are projections off a single unthrottled profile on one machine, not measurements.
The reflow half is assumed unchanged at 1.020 — none of this work touches it. Treat the
ordering as reliable and the absolute figures as indicative until CI says otherwise.

W1 + W2 alone are projected to flip the gated metric. They are also the two lowest-risk
items, which is the whole reason they are first.

---

## Sequencing and verification

One PR per workstream, in order **W2, W1, W4, W3**, with W5 and W6 independent. W2 leads
because it is a one-line change with a test — it lands the measurement protocol cheaply
before W1 uses it on something larger.

**W0 — precondition: make the win certifiable.** The published verdict is CI-based: a row
only says "quadrum wins" when the ratio's 95% interval excludes 1.0. `update-total-script-ms`
contributes **one value per repetition** — no per-iteration samples — so the nightly ratio
interval was [0.86, 1.53] wide at 15 reps. The default is now 31 reps, which helps, but n=31
is still coarse next to the scenarios that pool samples (mount certifies a 0.85× win from
n=600; drag from n=19,050), and the projected endpoint here is ≈0.93× — a 7% edge that n=31
may well leave inside the noise band. Before W1 lands, make the update scenario record
per-update (or per-iteration-batch) samples so the metric pools like mount does. Otherwise
the endpoint of this entire spec is a README row that still says "parity" about a win we
paid for. This also fixes the local `--compare` check below, which inherits the same power.

1. `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` — the e2e suite must be **unchanged**.
   Both W1 and W3 alter when the board writes to the DOM, and e2e is the only check that
   watches real pixels.
2. Re-run the profiler on the branch. Confirm the targeted functions actually left the
   profile. A change that improves the wall clock without removing its target from the
   breakdown has done something other than what it claims, and needs explaining before it
   lands.
3. `pnpm bench --scenario update-throughput-anim-off --compare results/baseline.json`
   locally, then read the CI run. **Rebuild the bench app minified first.**

**Baseline protocol.** The gate only fails on regression, so an improving PR passes against
the stale baseline without touching it — no `bench-rebaseline` label needed, and none should
be requested. Re-mint **once**, after the last of W1/W2/W4 lands (and after W0, so the new
baseline carries the pooled samples), so the improvement is locked in against future
regressions. Minting earlier means re-minting repeatedly, and every
mint is a chance to ratchet in a number nobody checked.

One caveat that predates this work and still applies: the current committed baseline was
minted from a run whose gate failed, and it straddles three simultaneous changes (quadrum
0.2.2 → 0.3.0, chessground 9.2.1 → `@lichess-org/chessground` 10.1.1, and per-subject iframe
isolation). Deltas against it are directional at best. The re-mint at the end of this work is
also the fix for that.

---

## Not targets, and why

- **`fenToPieces`** — 21% behind chessground on a function that is already tight. See W5.
- **The reflow half** — already at parity (1.020). Nothing here touches layout.
- **`update-throughput-anim-on`** — reports a ratio of exactly 1.000, both subjects at
  16.67 ms with zero dropped frames. It is measuring the headless synthetic frame clock, not
  either library. Degenerate, ungated, and a separate problem.
- **Bundle size.** `renderParts.ts` records that the bitmask and branch-chain forms were
  chosen over a record (~175 brotli bytes) and a keyed table (~115 more). W1's epoch and W3's
  diff hint both add code to the hottest module in the library. The bundle gate is absolute
  at +2% and every one of these PRs must clear it — if a change cannot pay for its own bytes,
  it does not land.

## Risks

- **W1 and W3 both narrow when the DOM gets written.** The failure mode is not a crash; it is
  a piece that renders in the wrong place under a path nobody tested. The mitigation is the
  explicit invariant in W1 plus e2e staying green, and it is why W3 is sequenced last and
  re-scoped after a fresh profile.
- **The profile is one machine, unthrottled.** CI runs throttled 4× on shared hardware where
  the mix shifts. Every projection above is provisional until a CI run confirms it.
