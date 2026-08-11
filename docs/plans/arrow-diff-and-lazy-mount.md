# Plan: arrow-layer diffing and lazy mount layers

Status: planned, not implemented. Follows from the 2026-08-10 full benchmark run
(31 repetitions, throttle 4×), which quadrum lost in exactly two places:

| Scenario | Metric | Ratio (quadrum ÷ chessground) |
| --- | --- | --- |
| engine-arrow-tick | Script | 6.00× — chessground wins |
| mount | Layout | 1.56× — chessground wins |
| mount | element count | 56 vs 42 (1.33×) |

**Measurement caveat that shapes both work items:** that run predates the
COOP/COEP timer-isolation fix. `performance.now()` was clamped to 100µs, and
chessground's single-arrow-tick median (0.10 ms) sat exactly at the quantization
floor — the true arrow-tick ratio is somewhere in 3–12×, not a precise 6×.
**Re-measure on an isolated run before starting, and again after each item lands.**
The direction of the loss is real either way; the magnitude from the old run is not
a number to optimize against.

---

## Item 1 — diff the marks layer instead of rebuilding it

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
tick, several times per second. The typical tick changes *one* arrow's
destination — or nothing at all — yet quadrum pays full teardown + rebuild + a
gradient allocation per translucent arrow, while chessground syncs its shapes
incrementally. That is the entire 6× (really 3–12×) gap; nothing else in the tick
path differs.

### Design

Make `renderMarks` a keyed diff. The identity key already exists: `markKey(mark)`
(`from+to` for arrows, `from` for square marks) — it is what the current code uses
to collapse duplicates and to let the in-progress `current` mark supersede a
same-key user mark, so paint semantics keep using it unchanged.

**Reconciliation model** — small-N keyed diff, no virtual DOM:

- Keep a `Map<string, RenderedMark>` on the renderer (owned by `Board`, passed
  alongside `BoardDom`, or held in a `WeakMap<BoardDom, …>` so the module stays
  stateless from the caller's view). `RenderedMark` records the nodes created for
  that key (shaft polygon, head polygon, circle, badge `<g>`) **and the inputs
  they were rendered from**: pen, geometry inputs (from, to, orientation), kind,
  and for badges the raw `svg` string.
- Per render, build the desired mark list exactly as today (auto map, user map,
  auto drawn first, `current` supersedes). Then:
  - **key present + inputs identical** → do nothing. This is the hot path for an
    engine tick where the top lines are stable — it must touch zero DOM.
  - **key present + inputs changed** → mutate the existing nodes with
    `setAttribute` (points, fill, class, `data-*` stamps from `describeMark`).
    Never re-create a node whose key survived.
  - **key absent** → create, exactly as today's builder does.
  - **key gone** → `.remove()` the recorded nodes.
- **Paint order:** appending only new nodes breaks the auto-before-user ordering
  that clear-and-rebuild got for free. Enforce order explicitly: iterate the
  desired list in draw order and use `insertBefore(node, nextRenderedSibling)`
  (or re-append in order — with ≤ a dozen marks, re-appending existing nodes is
  cheap and moves, not re-creates, them; measure which reads better). The
  existing test `user marks layer over automatic ones on the same squares` (#5)
  is the guard.

**Gradients** — stop allocating per render:

- Replace `qd-fade-${++gradientSeq}` with a content-derived cache key:
  `(pen, x1, y1, x2, y2)` — pen resolves color+opacity, the coordinates are the
  userSpaceOnUse endpoints (already deterministic in the 800×800 viewBox from
  `squareToPoint`). Cache `Map<string, SVGLinearGradientElement>` living in the
  marks `<defs>`.
- On a render, mark which gradients were referenced; remove unreferenced ones at
  the end (or leave a small LRU — but removal is trivial since the cache map is
  the source of truth). Bounded, no seq counter, and a stable arrow keeps a
  stable gradient id — which is itself a diff win because the polygon's `fill`
  URL doesn't change.

**Invalidation triggers** (when the diff must not trust the cache):

- **Orientation flip** invalidates every geometry — either fold orientation into
  each `RenderedMark`'s recorded inputs (it falls out naturally: geometry inputs
  include orientation, so a flip mutates every node in place) or nuke the cache
  and rebuild once. In-place mutation is preferred; a flip is rare either way.
- **`destroy()` / `buildDom` re-entry** must drop the cache (the `WeakMap` keying
  on `BoardDom` handles this for free).
- **Badges** compare by the raw `svg` string; on change, reset `innerHTML` on the
  existing `<g>`. Do not attempt to diff inside user-provided SVG.

**Call sites:** `board.ts` calls `renderMarks` at lines 251 and 478 through the
private wrapper at line 500 — signature can stay identical if the cache is a
`WeakMap` internal to `marksView.ts`, which also keeps this change invisible to
`packages/react`.

### Tests

Unit (vitest, jsdom — extend the existing marksView tests):

- **Node identity is preserved:** render marks A+B, capture element refs, render
  A+B′ (B's destination moved) — A's polygons are the *same objects*, B's
  polygons are the same objects with updated `points`.
- **Removal:** render A+B then A — B's shaft, head, and badge nodes are detached;
  no orphan gradients remain in `<defs>` for pens only B used.
- **Gradient reuse:** two renders of the same translucent arrow reference the
  same gradient element; `<defs>` child count stays constant across 100 renders.
- **Order:** auto + user mark on the same squares — user's nodes come after
  auto's in every layer, including after a render that only added the user mark.
- **`current` supersedes:** in-progress mark replaces the same-key user mark and
  the user mark's nodes return when `current` clears.
- **Orientation flip** updates every polygon's `points` in place.

Existing e2e/visual specs must pass unchanged — the rendered output is intended
to be byte-identical except for gradient ids (any spec asserting on `qd-fade-N`
ids needs the assertion loosened to `qd-fade-*`; grep first).

### Acceptance

- All existing core tests green; new identity/ordering tests green.
- Isolated benchmark, `engine-arrow-tick`: Script ratio at or under ~1.5× on the
  stable-arrows tick pattern (the bench's tick workload mutates arrows every
  tick, so parity is not automatic; the realistic target is "same order of
  magnitude", not zero).

---

## Item 2 — lazy mount layers

### The problem

`buildDom` (`packages/core/src/view/layout.ts`) eagerly creates, for every board:

- 3 SVG layers — marks (with `<defs>`), heads, badges — even when the consumer
  never draws a mark;
- 2 `qd-coords` containers plus 16 `qd-coord` labels via `renderCoords`, even
  when `coordinates: false` (they are built and then hidden with a class);
- `qd-overlay`, even when the board is not interactive.

That is 56 elements against chessground's 42 for an equivalent non-interactive,
uncoordinated board, and it is most of the mount Layout loss (1.56× on the
pre-isolation run): more nodes created, more boxes for the first forced layout.

### Design

Create each layer on first need, not at mount:

- **`BoardDom` shape:** keep the interface but make the four lazy members
  accessor-backed: `marks`, `heads`, `badges`, `overlay` become lazy getters that
  create-and-insert on first access, plus cheap `hasMarks()`-style peek functions
  (or nullable `marksOrNull`) so read-only paths (like `destroyDom`, hit-testing,
  `renderMarks` with an empty mark list) can check without triggering creation.
  A plain nullable-fields struct (`marks: SVGSVGElement | null`) is the
  alternative; getters keep the ~30 existing usage sites unchanged, so start
  there and fall back to nullable fields only if the getter indirection reads
  badly in profiles or code review.
- **Insertion order is a contract:** layers must land in the fixed z-order
  (board, marks, heads, badges, ranks, files, overlay) regardless of creation
  order. Give each layer a slot index and insert with
  `insertBefore(el, firstExistingLaterSlot)`.
- **Coordinates:** `renderCoords` becomes the creator — when
  `state.coordinates` is false and the containers don't exist, do nothing (16
  labels + 2 containers saved); when true, create containers if missing and fill
  them. The hidden-class dance goes away for the never-enabled case but must
  still work for toggling coordinates off after they existed (keep hiding rather
  than destroying — toggling is interactive-path, not mount-path).
- **Overlay:** create when the board becomes interactive (`applyWrapState` knows
  `state.locked`). Verify nothing positions itself relative to the overlay's
  mere existence in CSS.
- **Marks trio:** created by `renderMarks` on the first non-empty mark list.
  With item 1's diff in place, the empty→empty render touches nothing and the
  empty→non-empty render creates the layers plus the marks.

**Risks to check before coding:**

- CSS selectors that assume presence (e.g. sibling combinators or
  `:nth-child`-ish rules in `quadrum.css`) — grep the stylesheet; z-order comes
  from explicit `z-index`/order classes today, but confirm.
- e2e/component specs that count children of `.qd-wrap` or query `.qd-marks`
  on a bare board — they will need to assert absence instead.
- The bench's own element-count parity guard records total element count per
  board; after this lands the recorded number drops and the mount comparison is
  the point, so nothing to change there — but the bench README's element-count
  discussion should be updated with the new number.
- `destroyDom` iterates `wrap.firstChild` — already layer-agnostic, fine.

### Tests

- Unit: mounting with `coordinates: false, interactive: false` and no marks
  creates exactly board + wrap classes — no SVG layers, no coords, no overlay.
- Unit: first `setAutoMarks` creates the three SVG layers in the correct
  z-order even when the overlay already exists (out-of-order creation).
- Unit: enabling coordinates after mount creates and fills the containers;
  disabling hides them without destroying.
- E2E: existing suites unchanged except any spec asserting bare-board children.

### Acceptance

- Element count for the bench's mount configuration drops from 56 to ~40.
- Isolated benchmark, `mount`: Layout ratio ≤ ~1.2×.
- No regression in `update-*`, `engine-arrow-tick`, `drag-latency` (layers exist
  by then, so the getters are a one-branch cost).

---

## Sequencing

1. Re-run the full benchmark on the timer-isolated bench (already landed) to get
   true baselines for both losses.
2. Item 1 (arrow diffing) first — it is the larger, unambiguous loss and is
   self-contained in `marksView.ts`.
3. Item 2 (lazy layers) second — it touches `BoardDom`'s shape and therefore has
   the wider blast radius; land it with the selector/CSS audit done up front.
4. Full benchmark after each item; update `results/baseline.json` via the
   rebaseline checklist in `apps/bench/README.md` only after both land.
