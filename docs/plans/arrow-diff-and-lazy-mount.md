# Plan: make the render path incremental

Status: planned, not implemented. Supersedes the first draft of this document,
which was written against the pre-isolation benchmark and mis-ranked the work.

## Where we actually stand

Measured 2026-08-11 from `run-1786461855102` — the 31-repetition run minted as
`apps/bench/results/baseline.json` — at throttle 4× on a **cross-origin-isolated
page**, so `performance.now()` resolves at 5µs instead of the 100µs clamp that made
three of these rows unreadable two runs ago.

The "15 rep" column is `run-1786453934016`, an earlier run **with identical code**.
It is kept here because the disagreement between the two columns is itself one of
this document's findings.

| Scenario | Metric | 31 rep (authoritative) | 15 rep | Swing |
| --- | --- | --- | --- | --- |
| update-throughput-anim-off | Script | **28.67× — chessground wins** | 27.80× | +3% |
| update-throughput-anim-off | Layout | 5.00× — chessground wins | 23.75× | **−79%** |
| engine-arrow-tick | Script | **16.00× — chessground wins** | 9.58× | **+67%** |
| engine-arrow-tick | Layout | 1.86× — chessground wins | 4.00× | **−54%** |
| mount | Layout | 1.55× — chessground wins | 1.37× | +13% |
| mount | Script | **0.65× — quadrum wins** ✅ | 0.74× | −12% |
| mount | element count | 1.33× (56 vs 42) | 1.33× | — |
| drag-latency | p95 | 0.88× — quadrum wins ✅ | 0.90× | −2% |
| resize-storm | Layout | 0.08× — quadrum wins ✅ | 0.29× | **−72%** |
| memory | retained nodes | 0 vs 0 — parity | parity | — |
| memory | heap delta | 0.81× — quadrum wins ✅ | (not recorded) | — |
| bundle-size | every row | 0.73×–0.83× — quadrum wins ✅ | 0.73×–0.83× | — |

### Only some of these numbers are reproducible

Every ratio quadrum loses has a **floor-bound denominator**. The medians behind
them:

| Metric | quadrum | chessground |
| --- | --- | --- |
| `update-layout-ms` | 0.075 ms (15 ticks) | 0.015 ms (**3 ticks**) |
| `update-script-ms` | 0.430 ms (real) | 0.015 ms (**3 ticks**) |
| `arrow-tick-script-ms` | 0.720 ms (real) | 0.045 ms (**9 ticks**) |
| `arrow-tick-layout-ms` | 0.065 ms (13 ticks) | 0.035 ms (**7 ticks**) |

quadrum's numbers are measurements. chessground's are integer counts of the 5µs
tick. One tick of movement in a 3-tick denominator is a 33% swing — which is
exactly the ±54–79% seen above.

The Layout family is worse still: p95 runs 0.65–0.81 ms against medians of
0.015–0.075 ms. Those distributions are bimodal, so the median measures *how often
the browser skipped layout entirely*, not how much layout cost.

**So: the direction of every finding below is sound, and the magnitude of every
losing ratio is `real ÷ quantized`.** Two rows survive intact — `update Script`
(27.80 → 28.67, +3%) and everything on `mount`, whose medians of 1.6 ms and 1.05 ms
sit hundreds of ticks clear of the floor. Those are the two rows to plan against.

### The gate was minted on the unreproducible ones

`makeBaseline`'s 8% CI guard passed on all five gated metrics and certified
stability it cannot see. Bootstrapping the median of a quantized distribution
resamples the same tick nearly every time, so the interval comes back near-zero-width
*however far that median moves between runs* — and the guard only ever inspected
quadrum's interval.

| Gated metric | Ratio | Gate fires above | chessground CI width |
| --- | --- | --- | --- |
| `update-layout-ms` | 5.00× | 5.75× | **0.0000** |
| `arrow-tick-script-ms` | 16.00× | 18.40× | **0.0000** |
| `mount-layout-ms` | 1.55× | 1.78× | 0.0175 |

The previous run's `update-layout-ms` was 23.75×, four times over the threshold this
baseline set. The gate as minted would have failed a nightly that nobody caused,
which is the fastest way to teach everyone to ignore it. Fixing that is Item 0.

**The headline finding is the first row, and it is not the one this document was
originally written about.** Position updates — "the scenario a real analysis board
spends most of its time in", per the scenario's own description — are quadrum's
worst loss by a wide margin, and the scenario's `expectation` field claims it is
*expected to favour quadrum*. That expectation is falsified in the direction that
matters. It was invisible before only because chessground's median sat under the
old 100µs quantization floor and rendered as `0.00`. It is also the **only** losing
row that reproduced across both runs, which makes it the safest thing to plan
against.

The second finding is the good news that explains the mount row: **mount Script is
a quadrum win (0.65×) while mount Layout is a loss (1.55×)**. quadrum's mount
*code* is faster than chessground's; it loses on mount only because it creates 33%
more DOM for the browser to lay out. That is precisely the diagnosis lazy layers
were proposed against, now confirmed by a number rather than assumed — and
confirmed on the one scenario whose timings are clear of the floor.

### Read the update ratio honestly

28.67× is a ratio of medians, and the two distributions are not the same shape:

- chessground: median 0.015 ms, p95 0.60 ms — a **40× spread**. Most iterations do
  almost nothing; a few do real work.
- quadrum: median 0.430 ms, p95 0.97 ms — a **2.3× spread**. Every iteration pays
  the same cost.

That shape difference is itself the finding — quadrum does uniform work per update
because it re-renders everything, while chessground's cost tracks how much actually
changed. But comparing the medians of two distributions this differently shaped and
calling the result "how much slower" is wrong twice over: once for the shape, and
once because the denominator is three timer ticks.

Total elapsed time to replay 100 positions is the honest number. It is
shape-independent, it is what a consumer actually experiences, and summing 100
quantized samples cuts the relative quantization error by √100. Estimated from the
medians and tails, that gap is nearer **7–10×** than 28.67×. Still a bad loss; not
a 29× one. Item 0 makes the benchmark publish it directly rather than leaving a
reader to infer it.

---

## Item 0 — fix the instrument before using it

**Priority: first, and blocking. Not because it improves quadrum — it does not —
but because without it Items 1 and 2 cannot be shown to have worked.**

An earlier draft of this document listed these as "Reporting fixes" that "can land
at any point". That was wrong. `update-layout-ms` moved 79% and
`arrow-tick-script-ms` moved 67% between two runs of identical code. Landing Item 1
against instruments with that much drift means the measurement afterwards cannot
distinguish a real improvement from the noise, in either direction — which is the
failure mode where you ship a regression and record it as a win.

Six changes, none of which alters a measured value:

1. **Publish total elapsed time, and headline the throughput scenarios on it.** Sum
   the kept per-iteration samples into `update-total-script-ms` /
   `update-total-layout-ms` and `arrow-tick-total-*`, and move `headlineMetric` onto
   the script total for both scenarios. This is the fix for the floor, not a
   presentational nicety: a sum of 100 quantized samples has √100 less relative
   quantization error than any one of them, and it is the number a consumer feels.
   `mount` keeps `mount-layout-ms` — its medians are hundreds of ticks clear of the
   floor and it is the only timing scenario that was already trustworthy.
2. **Make the baseline refuse a floor-bound gate.** `makeBaseline` checked only
   quadrum's CI, and a bootstrap CI cannot see quantization — resampling a median
   pinned to one tick returns that tick, so the interval is near-zero-width however
   far the median roams. Add: the same 8% rule applied to chessground; a minimum
   central value of 20 ticks (0.1 ms, the point where one tick of movement is a 5%
   swing, comfortably inside the 15% gate tolerance) for any `ms` metric; and an
   outright rejection of a zero-width interval on a non-degenerate sample. The
   zero-median carve-out for genuine invariants (retained nodes) stays.
3. **Honour the `statistic` a metric declares.** `05-drag-latency.ts` emits
   `drag-latency-p95-ms` and `drag-latency-median-ms` from the same sample array,
   tagged `"p95"` and `"median"` — but `compareSubjects` always ratios `.median` and
   never reads `statistic`, so both rows render byte-identically (1.990 / 2.260 in
   the baseline run). `apps/bench/README.md` promises that "latency scenarios
   headline p95, because the tail is what a user feels"; the renderer does not
   deliver it. The published p95 row carries the median ratio, 0.88×, where the p95
   ratio is 0.96×. **The current behaviour flatters quadrum**, which is precisely
   why it gets fixed now rather than when it stops doing so.
4. **Render sub-resolution values as such.** The resize Script row shows quadrum at
   0.00 ms — genuinely below the 5µs floor, because quadrum's resize does no
   scripted work — and renders `0.00× — quadrum wins`. That reads like a division
   bug. Render "below timer resolution" instead, keeping the win marker, since the
   direction is known even when the magnitude is not.
5. **Cap `update-throughput-anim-on` at 3 repetitions.** All 31 repetitions returned
   identical values with zero-width CIs — 16.665 ms interval, 0 dropped, 100
   completed, both subjects. That is the synthetic headless frame clock, already
   flagged advisory and already ungated. Three passes prove the same thing at a
   twelfth of the ~2.5 minutes a run currently spends re-confirming a constant.
6. **Record the heap-delta win.** 22,968 B vs 28,480 B, 0.81× to quadrum. Correctly
   not gated — GC scheduling is nondeterministic — but it belongs in the full table.

### Consequence, and it is intended

Changes 1 and 2 together invalidate the committed `apps/bench/results/baseline.json`:
it was minted against `update-layout-ms` and `arrow-tick-script-ms`, and it would now
be refused for exactly the reason it should have been refused the first time. The
baseline must be re-minted by a dispatched run **after** Item 0 lands and **before**
Item 1 is measured. Do not hand-edit it, and do not weaken a rule to keep it minting.

---

## Item 1 — stop re-rendering everything on every update

**Priority: highest of the library items. This is the ~28× row, the only losing row
that reproduced across both runs, and the cheapest of the three to fix.**

### The problem

`Board.render()` (`packages/core/src/board.ts:471`) is monolithic. Every position
update runs the whole thing:

```ts
private render(): void {
	applyWrapState(this._dom, this._state);
	renderCoords(this._dom, this._state);        // <- wipes and rebuilds 16 labels
	renderPieces(this._dom.board, this._pieceEls, this._state);
	this.renderSquares();
	this.renderMarks(null);                       // <- clears and rebuilds 3 SVG layers
	this.renderPromotion();
}
```

Three of those do full teardown-and-rebuild work that is unnecessary on a position
update:

1. **`renderCoords` rebuilds the coordinate labels on every single update.** It
   opens with `dom.ranks.innerHTML = ""; dom.files.innerHTML = "";` and then
   creates 16 fresh `<qd-coord>` elements. Coordinates depend only on
   `orientation` and the `coordinates` flag — neither of which a position update
   touches. This is 16 element destructions + 16 creations + 2 innerHTML wipes per
   move, and it dirties the coord containers' layout every time, which is a direct
   contributor to the Layout number as well as the Script one.
2. **`renderMarks` clears and rebuilds all three SVG layers on every update** —
   even when there are no marks at all, which is exactly the case in this
   scenario. `clearLayers` empties the marks SVG, the `<defs>` contents, the heads
   SVG and the badges SVG regardless.
3. **`renderPieces` touches all 32 pieces even though one moved.** The keyed diff
   is real — it correctly reuses elements — but for every surviving piece it still
   calls `placePieceEl`, which writes `el.dataset.square` and a freshly
   interpolated `el.style.transform` string. Writing an identical transform to 32
   elements is 64 attribute writes per update, all of which invalidate style. It
   also allocates an array per piece to sniff the role:
   `Array.from(existing.classList).find(...)`.

`renderSquares` is fine and should be left alone — it only creates elements for
decorated squares (last move, selection, check, targets, hover), so it does ~2–4
element operations per update, and those genuinely changed.

### Design

**1a — gate `renderCoords` on its inputs.** Track the last-rendered
`(orientation, coordinates)` pair; return immediately when neither changed. Rebuild
only on a flip or a toggle. This alone removes 32 element operations per update and
is a handful of lines.

**1b — early-out `renderMarks` when there is nothing to draw and nothing drawn.**
Before `clearLayers`, if the desired mark set is empty and the previous render was
also empty, return without touching the DOM. This is the cheap 80% of Item 2 and
should land with Item 1, not wait for the full diff — it is what makes the
*update* scenario stop paying for a mark layer it never uses. Item 2 then handles
the case where marks actually exist and change.

**1c — make `placePieceEl` idempotent at the call site.** Compare against the
square the element already carries (`el.dataset.square`) and skip both writes when
the piece has not moved. Also cache the piece's colour/role on the element
(`el.dataset.piece = "wn"`, or a `WeakMap<HTMLElement, Piece>`) instead of
re-deriving it from `classList` with an array allocation per piece per render.

**1d — consider splitting `render()` into targeted entry points.** The above three
fixes get the win without restructuring, and should be done first and measured. If
the remaining gap justifies it, the deeper change is for the mutators to call only
what they invalidate (`setPosition` → pieces + squares; `setOrientation` →
everything; `setMarks` → marks) rather than every path funnelling into one
`render()`. That is a larger blast radius — it is easy to miss an invalidation and
ship a stale-render bug — so it is explicitly staged *after* 1a–1c, gated on
measurement.

### Tests

- **`renderCoords` no-ops:** render twice with the same orientation; the 16
  `<qd-coord>` elements are the *same objects* after the second render. Flipping
  orientation replaces/updates them and the labels reverse.
- **`renderMarks` no-ops on empty:** with no marks, a second render does not touch
  the SVG layers (spy on `clearLayers`, or assert child-node identity of `<defs>`).
- **`renderPieces` idempotence:** apply the same placement twice; no `style` or
  `dataset` write lands on an unmoved piece (spy via a `Proxy` on style, or assert
  a mutation-observer records zero attribute changes for unmoved pieces).
- **No regressions in the existing suites** — particularly the drag tests, since
  `placePieceEl` is on the drag path and `held` pieces are deliberately skipped by
  `renderPieces` today. That skip must survive.

### Acceptance

Stated against `update-total-script-ms` — the Item 0 metric — because the
per-iteration median ratio is not reproducible enough to accept against. Baseline
that total on the re-minted post-Item-0 run before starting, so there is a
like-for-like number to compare to.

- `update-throughput-anim-off`: total-script ratio under 3×. Parity is not a
  realistic target — chessground's cost genuinely tracks the size of the change, and
  quadrum will still do a fixed sweep over 32 pieces — but an order of magnitude is
  available here for very little risk.
- The per-iteration Script and Layout rows should move in the same direction. Treat
  them as corroboration, not as acceptance: a total that improves while the
  per-iteration median does not is plausible (the median is quantized); a total that
  does *not* improve is a failed item whatever the median says.
- No change to `drag-latency` or `resize-storm` (both already wins; both touch
  `placePieceEl`).

---

## Item 2 — diff the marks layer instead of rebuilding it

**Priority: second. This is the arrow-tick row.** Item 1b removes the cost when
marks are *absent*; this removes it when they are *present and changing*, which is
the engine-analysis case quadrum was built for and names itself after.

The size of the loss is genuinely uncertain. The pre-isolation run put it at 6.00×
with chessground at the 100µs quantization floor; the two isolated runs since
disagree with each other, at **9.58×** and **16.00×** Script. All three share the
same defect — chessground's denominator is 9 timer ticks — so the honest statement
is "somewhere around 10–16×, and the instrument cannot currently do better." What
is not in doubt is the direction, the mechanism, or that this is worse than the
6.00× first believed.

### The problem

`renderMarks` (`packages/core/src/view/marksView.ts`) is a full clear-and-rebuild
on every render:

1. `clearLayers` empties the marks SVG (keeping the `<defs>` element but emptying
   its contents), the heads SVG, and the badges SVG.
2. Every mark is re-created from scratch: two `<polygon>`s per arrow (shaft under
   the pieces in `dom.marks`, head over them in `dom.heads`, split at the square
   boundary with a 1-unit seam overlap), circles in `dom.marks`, badge `<g>`
   elements filled via `innerHTML`.
3. Every translucent arrow allocates a fresh gradient:
   `<linearGradient id="qd-fade-${++gradientSeq}" gradientUnits="userSpaceOnUse">`.
   The sequence is unbounded and the old gradient is garbage every frame.

An engine-analysis consumer calls `setAutoMarks` with 3–5 arrows on every engine
tick, several times per second. The typical tick changes *one* arrow's destination
— or nothing at all — yet quadrum pays full teardown, rebuild, and a gradient
allocation per translucent arrow, while chessground syncs its shapes
incrementally.

### Design

Make `renderMarks` a keyed diff. The identity key already exists: `markKey(mark)`
(`from+to` for arrows, `from` for square marks) — it is what the current code uses
to collapse duplicates and to let the in-progress `current` mark supersede a
same-key user mark, so paint semantics keep using it unchanged.

**Reconciliation model** — small-N keyed diff, no virtual DOM:

- Keep a `Map<string, RenderedMark>` in a `WeakMap<BoardDom, …>`, so the module
  stays stateless from the caller's view and the cache dies with the DOM.
  `RenderedMark` records the nodes created for that key (shaft polygon, head
  polygon, circle, badge `<g>`) **and the inputs they were rendered from**: pen,
  geometry inputs (from, to, orientation), kind, and for badges the raw `svg`
  string.
- Per render, build the desired mark list exactly as today (auto map, user map,
  auto drawn first, `current` supersedes). Then:
  - **key present + inputs identical** → do nothing. This is the hot path for an
    engine tick whose top lines are stable — it must touch zero DOM.
  - **key present + inputs changed** → mutate the existing nodes with
    `setAttribute` (points, fill, class, the `data-*` stamps from `describeMark`).
    Never re-create a node whose key survived.
  - **key absent** → create, exactly as today's builder does.
  - **key gone** → `.remove()` the recorded nodes.
- **Paint order:** appending only new nodes breaks the auto-before-user ordering
  that clear-and-rebuild got for free. Enforce it explicitly: iterate the desired
  list in draw order and `insertBefore(node, nextRenderedSibling)`. With ≤ a dozen
  marks, re-appending existing nodes in order is also acceptable — it moves nodes
  rather than re-creating them — so measure which reads better. The existing test
  from #5 (`user marks layer over automatic ones on the same squares`) is the
  guard.

**Gradients** — stop allocating per render:

- Replace `qd-fade-${++gradientSeq}` with a content-derived cache key:
  `(pen, x1, y1, x2, y2)` — pen resolves colour+opacity, and the coordinates are
  the deterministic `userSpaceOnUse` endpoints from `squareToPoint` in the 800×800
  viewBox. Cache `Map<string, SVGLinearGradientElement>` living in the marks
  `<defs>`.
- Track which gradients a render referenced and remove the unreferenced ones at
  the end. Bounded, no sequence counter, and a stable arrow keeps a stable gradient
  id — itself a diff win, because the polygon's `fill` URL then does not change.

**Invalidation triggers:**

- **Orientation flip** invalidates every geometry. It falls out naturally if
  orientation is part of each `RenderedMark`'s recorded inputs: a flip mutates
  every node's points in place. Preferred over cache-nuking; a flip is rare either
  way.
- **`destroy()` / `buildDom` re-entry** drops the cache for free via the `WeakMap`.
- **Badges** compare by the raw `svg` string; on change, reset `innerHTML` on the
  existing `<g>`. Do not attempt to diff inside user-provided SVG.

**Call sites:** `board.ts` reaches `renderMarks` through the private wrapper at
line 500 (from lines 251 and 478). Keeping the cache internal to `marksView.ts`
means the signature is unchanged and `packages/react` never sees this.

### Tests

- **Node identity preserved:** render A+B, capture refs, render A+B′ (B's
  destination moved) — A's polygons are the same objects; B's are the same objects
  with updated `points`.
- **Removal:** render A+B then A — B's shaft, head and badge nodes are detached,
  and no orphan gradients remain in `<defs>` for pens only B used.
- **Gradient reuse:** two renders of the same translucent arrow reference the same
  gradient element; `<defs>` child count is constant across 100 renders.
- **Order:** auto + user mark on the same squares — the user's nodes follow the
  auto ones in every layer, including after a render that only added the user mark.
- **`current` supersedes:** the in-progress mark replaces the same-key user mark,
  and the user mark's nodes return when `current` clears.
- **Orientation flip** updates every polygon's `points` in place.

Existing e2e/visual specs must pass unchanged — output is intended to be identical
except for gradient ids. Grep first for any spec asserting on a literal
`qd-fade-N`; such an assertion needs loosening to a pattern.

### Acceptance

- `engine-arrow-tick`: `arrow-tick-total-script-ms` ratio at or under ~2×. Parity is
  not automatic — the bench's tick workload mutates arrows every tick, so the
  zero-DOM hot path does not apply to every iteration — but the gradient churn and
  the rebuild should both be gone.
- Add a scenario variant, or at minimum a unit test, covering the **unchanged-arrows
  tick**: the case the design calls the hot path and promises will touch zero DOM.
  The current bench workload never exercises it, so the acceptance number above
  cannot confirm the property the whole item is built on.

---

## Item 3 — lazy mount layers

**Priority: third. This is the 1.55× mount Layout row and the 56-vs-42 element
count — and the 0.65× mount Script win confirms the diagnosis.**

Worth noting: mount is the **only** scenario here whose acceptance criterion can be
checked today. Both subjects' medians (1.6 ms and 1.05 ms) are hundreds of timer
ticks clear of the floor, so its ratio means what it says, before Item 0 and after.

quadrum's mount code is *faster* than chessground's. It loses the mount scenario
purely on DOM volume: more elements created means more boxes in the first layout.
That is a clean, well-understood problem with a clean fix.

### The problem

`buildDom` (`packages/core/src/view/layout.ts`) eagerly creates, for every board:

- 3 SVG layers — marks (with `<defs>`), heads, badges — even when the consumer
  never draws a mark;
- 2 `qd-coords` containers plus 16 `qd-coord` labels via `renderCoords`, even when
  `coordinates: false` (they are built and then hidden with a class);
- `qd-overlay`, even when the board is not interactive.

56 elements against chessground's 42 for an equivalent non-interactive,
uncoordinated board.

### Design

Create each layer on first need:

- **`BoardDom` shape:** keep the interface but make the four lazy members
  accessor-backed — `marks`, `heads`, `badges`, `overlay` become getters that
  create-and-insert on first access, plus cheap peek helpers (`hasMarks()`, or
  nullable `marksOrNull`) so read-only paths — `destroyDom`, hit-testing,
  `renderMarks` with an empty list after Item 1b — can check without triggering
  creation. Plain nullable fields (`marks: SVGSVGElement | null`) are the
  alternative; getters keep the existing usage sites unchanged, so start there and
  fall back only if the indirection reads badly in review or profiles.
- **Insertion order is a contract:** layers must land in the fixed z-order (board,
  marks, heads, badges, ranks, files, overlay) regardless of creation order. Give
  each a slot index and insert with `insertBefore(el, firstExistingLaterSlot)`.
- **Coordinates:** `renderCoords` becomes the creator — when `state.coordinates`
  is false and the containers do not exist, do nothing (16 labels + 2 containers
  saved). When true, create if missing and fill. Toggling coordinates *off* after
  they existed keeps hiding rather than destroying — that is an interactive path,
  not a mount path. Composes with Item 1a: the input gate means this runs once.
- **Overlay:** create when the board becomes interactive (`applyWrapState` already
  knows `state.locked`). Confirm nothing in the CSS positions itself relative to
  the overlay's mere existence.
- **Marks trio:** created by `renderMarks` on the first non-empty mark list. With
  Items 1b and 2 in place, empty→empty touches nothing and empty→non-empty creates
  the layers along with the marks.

**Risks to check before coding:**

- CSS selectors that assume presence — sibling combinators or `:nth-child` rules
  in `quadrum.css`. Z-order comes from explicit rules today, but grep and confirm.
- e2e/component specs that count `.qd-wrap` children or query `.qd-marks` on a
  bare board; they will need to assert absence instead.
- The bench's element-count parity guard records total elements per board. The
  recorded number dropping *is* the point, so nothing to change there — but
  `apps/bench/README.md`'s element-count discussion should be updated with the new
  figure.
- `destroyDom` iterates `wrap.firstChild` and is already layer-agnostic.

### Tests

- Mounting with `coordinates: false, interactive: false` and no marks creates
  board + wrap classes only — no SVG layers, no coords, no overlay.
- First `setAutoMarks` creates the three SVG layers in the correct z-order even
  when the overlay already exists (out-of-order creation).
- Enabling coordinates after mount creates and fills the containers; disabling
  hides without destroying.
- Existing e2e suites unchanged except any spec asserting bare-board children.

### Acceptance

- Element count for the bench's mount configuration drops from 56 to ~40.
- `mount`: Layout ratio ≤ ~1.1×. Note this now starts from 1.55×, not the 1.37× an
  earlier draft assumed, so the DOM-volume drop has to carry more than budgeted.
  With Script already at 0.65×, closing that gap should still turn the row into a
  quadrum win outright.
- No regression in `update-*`, `engine-arrow-tick` or `drag-latency` (the layers
  exist by then, so the getters cost one branch).

---

## Sequencing

1. **Item 0 first, and it blocks.** The instrument has to be trustworthy before any
   library change is measured against it. Nothing in Item 0 touches `packages/`.
2. **Re-mint `results/baseline.json`** from a dispatched 31-repetition run once Item
   0 has landed. This is a human step (see the rebaseline checklist in
   `apps/bench/README.md`), and it is mandatory rather than optional: Item 0 changes
   two headline metrics, so the existing baseline no longer describes the same
   measurements. Remember the dispatch default is 15 repetitions — type 31.
3. **Item 1 (1a–1c).** Biggest loss, smallest diff, lowest risk — three input gates
   and an idempotence check. Re-benchmark `update-throughput-anim-off` before
   deciding whether 1d is needed.
4. **Item 2.** Self-contained in `marksView.ts`; the arrow-tick row is the claim
   quadrum's README makes about itself, so this is the one that most needs to be
   true.
5. **Item 3.** Widest blast radius (`BoardDom`'s shape), so last — and with the
   CSS/selector audit done up front.
6. Full benchmark after each item, comparing against the step-2 baseline. Re-mint
   again only once all three have landed.

## What is and is not established

Worth keeping straight, because this document has now been wrong in both directions:

**Established, reproducible.** The update path is quadrum's real loss (~28× on
per-iteration script, stable across two runs, and the mechanism in `Board.render()`
is visible in the source). Mount loses purely on DOM volume, 56 elements against 42,
with quadrum's mount *code* faster. drag, resize, bundle and heap are quadrum wins.
Retained nodes are at parity, zero on both.

**Established in direction, not in magnitude.** The arrow-tick loss — somewhere
around 10–16×, denominator floor-bound. The Layout family generally.

**Not established at all.** That any of the acceptance criteria in Items 1 and 2 can
currently be checked. That is what Item 0 is for.
