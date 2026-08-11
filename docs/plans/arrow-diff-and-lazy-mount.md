# Plan: make the render path incremental

Status: planned, not implemented. Supersedes the first draft of this document,
which was written against the pre-isolation benchmark and mis-ranked the work.

## Where we actually stand

Measured 2026-08-11, `run-1786453934016`: 15 repetitions, throttle 4×, and — the
part that changes the conclusions — a **cross-origin-isolated page**, so
`performance.now()` resolves at 5µs instead of the 100µs clamp that made three of
these rows unreadable last time.

| Scenario | Metric | Ratio (quadrum ÷ chessground) | Was |
| --- | --- | --- | --- |
| update-throughput-anim-off | Script | **27.80× — chessground wins** | unmeasurable (`—`) |
| update-throughput-anim-off | Layout | **23.75× — chessground wins** | unmeasurable (`—`) |
| engine-arrow-tick | Script | **9.58× — chessground wins** | 6.00× (at the timer floor) |
| engine-arrow-tick | Layout | 4.00× — chessground wins | unmeasurable |
| mount | Layout | 1.37× — chessground wins | 1.56× |
| mount | element count | 1.33× (56 vs 42) | 1.33× |
| mount | Script | **0.74× — quadrum wins** ✅ | unmeasurable |
| drag-latency | p95 | 0.90× — quadrum wins ✅ | 0.90× |
| resize-storm | Layout | 0.29× — quadrum wins ✅ | 0.31× |
| memory | retained nodes | 0 vs 0 — parity | parity |
| bundle-size | every row | 0.73×–0.83× — quadrum wins ✅ | (rendered INVALID) |

**The headline finding is the first row, and it is not the one this document was
originally written about.** Position updates — "the scenario a real analysis board
spends most of its time in", per the scenario's own description — are quadrum's
worst loss by a wide margin, and the scenario's `expectation` field claims it is
*expected to favour quadrum*. That expectation is now falsified in the direction
that matters. It was invisible before only because chessground's 0.03 ms median
sat under the old 100µs quantization floor and rendered as `0.00`.

The second finding is the good news that explains the mount row: **mount Script is
a quadrum win (0.74×) while mount Layout is a loss (1.37×)**. quadrum's mount
*code* is faster than chessground's; it loses on mount only because it creates 33%
more DOM for the browser to lay out. That is precisely the diagnosis lazy layers
were proposed against, now confirmed by a number rather than assumed.

### Read the update ratio honestly

27.80× is the ratio of medians, and the two distributions are not the same shape:

- chessground: median 0.03 ms, p95 0.72 ms — a **24× spread**. Most iterations do
  almost nothing; a few do real work.
- quadrum: median 0.70 ms, p95 1.18 ms — a **1.7× spread**. Every iteration pays
  the same cost.

That shape difference is itself the finding — quadrum does uniform work per update
because it re-renders everything, while chessground's cost tracks how much actually
changed. But it also means the median ratio is not the number a user experiences.
Total time to replay 100 positions is, and estimated from the medians and tails
that gap is nearer **7–10×** than 27.8×. Still a bad loss; not a 28× one. See
"Reporting fixes" below — the benchmark should publish the total directly rather
than leave a reader to infer it.

---

## Item 1 — stop re-rendering everything on every update

**Priority: highest. This is the 27.8× row, and it is the cheapest of the three to
fix.**

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

- `update-throughput-anim-off`: Script ratio under 3×, Layout under 3×. Parity is
  not a realistic target — chessground's cost genuinely tracks the size of the
  change, and quadrum will still do a fixed sweep over 32 pieces — but an order of
  magnitude is available here for very little risk.
- No change to `drag-latency` or `resize-storm` (both already wins; both touch
  `placePieceEl`).

---

## Item 2 — diff the marks layer instead of rebuilding it

**Priority: second. This is the 9.58× arrow-tick row.** Item 1b removes the cost
when marks are *absent*; this removes it when they are *present and changing*,
which is the engine-analysis case quadrum was built for and names itself after.

The pre-isolation run put this at 6.00× with the caveat that chessground's 0.10 ms
sat at the quantization floor and the true ratio was somewhere in 3–12×. It
resolves at **9.58× Script / 4.00× Layout** — the top of that band, so the concern
was warranted and the loss is worse than it first appeared.

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

- `engine-arrow-tick`: Script ratio at or under ~2×. Parity is not automatic — the
  bench's tick workload mutates arrows every tick, so the zero-DOM hot path does
  not apply to every iteration — but the gradient churn and the rebuild should both
  be gone.

---

## Item 3 — lazy mount layers

**Priority: third. This is the 1.37× mount Layout row and the 56-vs-42 element
count — and the newly visible 0.74× mount Script win confirms the diagnosis.**

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
- `mount`: Layout ratio ≤ ~1.1×. With Script already at 0.74×, closing the DOM-
  volume gap should turn this row into a quadrum win outright.
- No regression in `update-*`, `engine-arrow-tick` or `drag-latency` (the layers
  exist by then, so the getters cost one branch).

---

## Reporting fixes (the benchmark, not the library)

Four things the isolated run exposed about the harness itself. None of them change
a verdict, and the first two are the kind of thing the honesty apparatus exists to
catch — so they should be fixed regardless of whether they currently flatter
quadrum.

1. **The drag scenario's two metric rows are identical, and the ⭐ p95 row
   publishes a median-derived ratio.** `05-drag-latency.ts` builds
   `drag-latency-p95-ms` and `drag-latency-median-ms` from the *same* sample array,
   tagged `statistic: "p95"` and `"median"` — but `compareSubjects`
   (`bench-report.mjs:110`) always ratios `.median` and **never reads
   `statistic`**. So both rows render byte-identically, and the headline metric
   reports 0.90× (the median ratio, 1.89/2.09) where the p95 ratio is 0.96×
   (18.78/19.61). `apps/bench/README.md` states that "latency scenarios headline
   p95, because the tail is what a user feels" — the renderer does not currently
   honour that. Fix: have `compareSubjects` ratio the statistic the metric
   declares, and either drop the duplicate row or make it genuinely median-only.
   Note the direction — the current behaviour flatters quadrum slightly, which is
   exactly why it should be fixed now rather than when it stops doing so.
2. **Publish total replay time for the throughput scenarios.** As analysed above,
   the median ratio (27.8×) is not what a user experiences when the two
   distributions have 24× and 1.7× spreads respectively. Sum-of-samples is
   distribution-shape-independent and is the honest user-facing number for "replay
   100 positions". Add it as a metric next to the per-update median; it will also
   make Item 1's improvement legible in the terms a consumer cares about.
3. **`0.00× — quadrum wins` is a degenerate ratio, not a result.** The resize
   Script row shows quadrum at 0.00 ms — genuinely below even the 5µs floor,
   because quadrum's resize does no scripted work at all. Rendering that as a
   numeric ratio invites the reading that the harness divided by something it
   should not have. Render sub-resolution values as "below timer resolution"
   rather than as a number.
4. **`update-throughput-anim-on` produces no signal under headless and should be
   rep-capped.** Every metric came back exactly 16.67 ms / 0 dropped / 100
   completed with zero-width CIs across all 15 repetitions — the synthetic frame
   clock, already honestly flagged advisory. It is also one of the slowest
   scenarios (frame-bound, ~2.7 s per pass). Give it `repsCap: 3`: enough to prove
   both libraries keep up and drop nothing, without spending ~2.5 minutes a run
   re-confirming a constant. The `repsCap` mechanism already exists from the
   timer-isolation change.

---

## Sequencing

1. **Item 1 (1a–1c) first.** Biggest loss, smallest diff, lowest risk — three
   input gates and an idempotence check. Re-benchmark `update-throughput-anim-off`
   before deciding whether 1d is needed.
2. **Item 2.** Self-contained in `marksView.ts`; the arrow-tick row is the claim
   quadrum's README makes about itself, so this is the one that most needs to be
   true.
3. **Item 3.** Widest blast radius (`BoardDom`'s shape), so last — and with the
   CSS/selector audit done up front.
4. **Reporting fixes** can land at any point and are independent of all three;
   fix #1 before the next published run, since it affects a headline number.
5. Full benchmark after each item. Re-mint `results/baseline.json` via the
   rebaseline checklist in `apps/bench/README.md` only once all three have landed
   — and remember the dispatch default is now 15 repetitions, so type 31 for that
   run.
