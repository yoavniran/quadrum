import type { Mark, Pen, Color } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "./layout";
import type { MarkNodeKind, MarkPools } from "./markPool";
import type { GradientRegistry } from "./markGradients";
import { squareToPoint } from "../model/squares";
import { createMarkPools } from "./markPool";
import { createGradientRegistry } from "./markGradients";

/** SVG coordinates carry no meaning past a fraction of a unit; trimming them
 *  keeps the emitted markup readable and diffable. */
function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Writes an attribute only when the value actually differs. A `setAttribute`
 *  call is a DOM write even when the value is unchanged, and the mutate paths
 *  below exist specifically so that a render whose inputs didn't move for a
 *  given mark costs nothing. */
function setAttributeIfChanged(el: SVGElement, name: string, value: string): void {
	if (el.getAttribute(name) !== value) {
		el.setAttribute(name, value);
	}
}

/** Removes an attribute only if it is present, for the same reason as
 *  `setAttributeIfChanged`. */
function removeAttributeIfPresent(el: SVGElement, name: string): void {
	if (el.hasAttribute(name)) {
		el.removeAttribute(name);
	}
}

/** Assigns a unique board sequence number on creation, so that gradient ids stay
 *  unique across multiple boards on the same page while remaining stable across
 *  renders within the same board. */
let boardSeq = 0;

/** Tracks the nodes and inputs for a rendered mark, so a render can diff against
 *  the previous one and mutate only what changed. */
interface RenderedMark {
	// The DOM nodes created for this mark.
	shaft?: SVGElement;
	head?: SVGElement;
	circle?: SVGElement;
	badge?: SVGElement;
	// The inputs they were rendered from, enough that "inputs identical" implies
	// "the DOM would come out the same".
	penColor: string;
	penOpacity: number;
	penWidth: number;
	from: string;
	to?: string;
	width?: number;
	svg?: string;
	orientation: string;
	kind: "arrow" | "circle" | "badge" | null;
}

/** Per-board cache for gradients and render metadata. Keyed by BoardDom so the
 *  cache dies with the board and the module stays stateless from the caller's view. */
interface MarksCache {
	drewSomething: boolean;
	// Owns every fade gradient: minting, content-keyed reuse, and the post-render
	// sweep that parks the ones this render stopped referencing.
	gradients: GradientRegistry;
	// Nodes shed by the diff are parked here instead of destroyed, so a render
	// that replaces one mark wholesale -- the engine-tick case -- mutates
	// attributes rather than creating elements.
	pools: MarkPools;
	// Maps mark keys to their rendered nodes and inputs, for keyed diffing.
	renderedMarks: Map<string, RenderedMark>;
}

const caches = new WeakMap<BoardDom, MarksCache>();

function getCache(dom: BoardDom): MarksCache {
	let cache = caches.get(dom);
	if (!cache) {
		cache = {
			drewSomething: false,
			gradients: createGradientRegistry(boardSeq++),
			pools: createMarkPools(),
			renderedMarks: new Map(),
		};
		caches.set(dom, cache);
	}
	return cache;
}

/** Parks every node a retired mark owned, so the next mark that needs one of the
 *  same shape mutates it instead of creating one. A full pool hands the node back
 *  for disposal, which is the only path that still touches the tree. */
function retire(cache: MarksCache, rendered: RenderedMark): void {
	const parts: [MarkNodeKind, SVGElement | undefined][] = [
		["shaft", rendered.shaft],
		["head", rendered.head],
		["circle", rendered.circle],
		["badge", rendered.badge],
	];
	for (const [kind, node] of parts) {
		if (node && !cache.pools.release(kind, node)) {
			node.remove();
		}
	}
}

/** An idle node of the given shape, or a fresh one. A recycled node arrives with
 *  its stamps stripped and every other attribute stale, so callers must write the
 *  full attribute set -- which is why the paint helpers below are shared by the
 *  create and the mutate path rather than being duplicated. */
function take(cache: MarksCache, kind: MarkNodeKind, tag: string, layer: SVGSVGElement): SVGElement {
	const pooled = cache.pools.acquire(kind);
	if (pooled) {
		return pooled;
	}
	const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
	layer.appendChild(node);
	return node;
}

/** Check if the given RenderedMark's inputs are identical to the new ones. */
function inputsIdentical(
	rendered: RenderedMark,
	penColor: string,
	penOpacity: number,
	penWidth: number,
	mark: Mark,
	orientation: string,
	kind: "arrow" | "circle" | "badge" | null,
): boolean {
	return (
		rendered.penColor === penColor &&
		rendered.penOpacity === penOpacity &&
		rendered.penWidth === penWidth &&
		rendered.from === mark.from &&
		rendered.to === mark.to &&
		rendered.width === mark.width &&
		rendered.svg === mark.svg &&
		rendered.orientation === orientation &&
		rendered.kind === kind
	);
}

export function markKey(mark: Mark): string {
	return mark.to ? `${mark.from}${mark.to}` : mark.from;
}

/** Collapses one source's marks by key, last one winning, preserving order. */
function byKey(marks: readonly Mark[]): Map<string, Mark> {
	const collapsed = new Map<string, Mark>();

	for (const mark of marks) {
		collapsed.set(markKey(mark), mark);
	}

	return collapsed;
}

export function resolvePen(state: BoardState, mark: Mark): Pen {
	const penKey = mark.pen ?? "green";
	return state.marks.pens[penKey] ?? state.marks.pens.green;
}

/**
 * Stamp a rendered mark with what it represents. The SVG is otherwise anonymous
 * -- a bare <line>/<circle> among others -- which leaves application CSS and
 * tests with nothing to select on. `data-mark` is the shape, `data-from`/`data-to`
 * the squares, `data-pen` the pen key.
 *
 * Exactly one element per mark carries `data-mark`, so `[data-mark]` counts
 * marks and not shapes. An arrow is drawn as two polygons that straddle the
 * piece layer, and the second one is a *part* of that one mark: it takes
 * `data-mark-part` instead, and is found with `[data-mark-part="head"]`. Styling
 * a whole arrow therefore means selecting both.
 *
 * Every write goes through `setAttributeIfChanged`/`removeAttributeIfPresent` so
 * this is safe to call from a mutate path too: a surviving node whose stamp
 * hasn't moved costs nothing.
 */
function describeMark(
	el: SVGElement,
	kind: "arrow" | "circle" | "badge" | null,
	mark: Mark,
	penKey: string,
	part?: "shaft" | "head",
): void {
	if (kind) {
		setAttributeIfChanged(el, "data-mark", kind);
	} else {
		removeAttributeIfPresent(el, "data-mark");
	}
	if (part) {
		setAttributeIfChanged(el, "data-mark-part", part);
	} else {
		removeAttributeIfPresent(el, "data-mark-part");
	}
	setAttributeIfChanged(el, "data-from", mark.from);
	if (mark.to) {
		setAttributeIfChanged(el, "data-to", mark.to);
	} else {
		removeAttributeIfPresent(el, "data-to");
	}
	setAttributeIfChanged(el, "data-pen", penKey);
}

/**
 * Registers a gradient that ramps the pen's colour from its own opacity up to
 * fully opaque along the given segment, and returns the `fill` value for it.
 *
 * An arrow's translucent half and its opaque half would otherwise meet in a
 * visible tone step partway along the shaft. The ramp is on `stop-opacity`, not
 * on an element `opacity`, because the latter would scale the gradient's own
 * alpha instead of replacing it. `userSpaceOnUse` puts the coordinates in the
 * same 800x800 space as the marks themselves, so the segment can be given in
 * board units.
 *
 * Gradients are cached by content (pen and coordinates), so identical geometry
 * across renders reuses the same element and the same fill URL -- and a miss
 * recycles a parked element rather than creating one.
 */
function fadeToOpaque(
	dom: BoardDom,
	pen: Pen,
	segment: { x1: number; y1: number; x2: number; y2: number },
): string | null {
	// Access marks getter to ensure layer exists (we're about to append to it)
	const defs = dom.marks.querySelector("defs");
	if (!defs) {
		return null;
	}

	return getCache(dom).gradients.fill(defs, pen.color, pen.opacity, segment);
}

/** The shaft points, head points and (optional) fade for an arrow, computed once
 *  and consumed by both the create and mutate branches -- the two used to carry
 *  their own copy of this geometry, and the mutate branch's copy had already
 *  drifted (it never set the head's fill/opacity/stroke-linejoin). */
interface ArrowGeometry {
	shaftPoints: string;
	headPoints: string;
	fade: string | null;
}

function computeArrowGeometry(dom: BoardDom, mark: Mark, pen: Pen, orientation: Color): ArrowGeometry {
	const fromPoint = squareToPoint(mark.from, orientation);
	const fromCenter = { x: fromPoint.x * 100 + 50, y: fromPoint.y * 100 + 50 };
	const toPoint = squareToPoint(mark.to!, orientation);
	const toCenter = { x: toPoint.x * 100 + 50, y: toPoint.y * 100 + 50 };

	const dx = toCenter.x - fromCenter.x;
	const dy = toCenter.y - fromCenter.y;
	const dist = Math.sqrt(dx * dx + dy * dy) || 1;
	const ux = dx / dist;
	const uy = dy / dist;
	const nx = -uy;
	const ny = ux;

	const width = mark.width ?? pen.width;
	const headWidth = width * 2.6;
	const headLength = headWidth * 0.9;
	const baseX = fromCenter.x;
	const baseY = fromCenter.y;
	const neckX = toCenter.x - ux * headLength;
	const neckY = toCenter.y - uy * headLength;
	const half = width / 2;
	const headHalf = headWidth / 2;

	const enter = 50 / Math.max(Math.abs(ux), Math.abs(uy));
	const SEAM = 1;
	const overLength = Math.max(enter, headLength + SEAM);
	const overX = toCenter.x - ux * overLength;
	const overY = toCenter.y - uy * overLength;
	const lapX = overX + ux * SEAM;
	const lapY = overY + uy * SEAM;

	const shaftPts = [
		[baseX + nx * half, baseY + ny * half],
		[lapX + nx * half, lapY + ny * half],
		[lapX - nx * half, lapY - ny * half],
		[baseX - nx * half, baseY - ny * half],
	];

	const headPts = [
		[overX + nx * half, overY + ny * half],
		[neckX + nx * half, neckY + ny * half],
		[neckX + nx * headHalf, neckY + ny * headHalf],
		[toCenter.x, toCenter.y],
		[neckX - nx * headHalf, neckY - ny * headHalf],
		[neckX - nx * half, neckY - ny * half],
		[overX - nx * half, overY - ny * half],
	];

	const fadeLength = Math.min(70, Math.max(0, dist - overLength) * 0.6);
	const fade =
		pen.opacity < 1 && fadeLength > 0
			? fadeToOpaque(dom, pen, {
					x1: overX - ux * fadeLength,
					y1: overY - uy * fadeLength,
					x2: overX,
					y2: overY,
				})
			: null;

	return {
		shaftPoints: shaftPts.map(([x, y]) => `${round(x!)},${round(y!)}`).join(" "),
		headPoints: headPts.map(([x, y]) => `${round(x!)},${round(y!)}`).join(" "),
		fade,
	};
}

/** Writes an arrow's full attribute set onto its two polygons. Shared by the
 *  create and the mutate path: a recycled node is indistinguishable from a fresh
 *  one here, and the two used to carry separate copies of this that had already
 *  drifted apart. Every write is guarded, so a surviving arrow whose inputs
 *  didn't move still costs nothing. */
function paintArrow(
	shaft: SVGElement,
	head: SVGElement,
	geo: ArrowGeometry,
	mark: Mark,
	pen: Pen,
	penKey: string,
): void {
	setAttributeIfChanged(shaft, "points", geo.shaftPoints);
	setAttributeIfChanged(shaft, "fill", geo.fade ?? pen.color);
	if (geo.fade) {
		// The gradient carries the pen's alpha in its stops, so an element opacity
		// would scale it a second time. A recycled node may still hold one.
		removeAttributeIfPresent(shaft, "opacity");
	} else {
		setAttributeIfChanged(shaft, "opacity", String(pen.opacity));
	}
	setAttributeIfChanged(shaft, "stroke-linejoin", "round");
	describeMark(shaft, "arrow", mark, penKey, "shaft");

	setAttributeIfChanged(head, "points", geo.headPoints);
	setAttributeIfChanged(head, "fill", pen.color);
	setAttributeIfChanged(head, "opacity", "1");
	setAttributeIfChanged(head, "stroke-linejoin", "round");
	describeMark(head, null, mark, penKey, "head");
}

/** As `paintArrow`, for a circle mark. */
function paintCircle(circle: SVGElement, mark: Mark, pen: Pen, orientation: Color, penKey: string): void {
	const fromPoint = squareToPoint(mark.from, orientation);
	const width = mark.width ?? pen.width;

	setAttributeIfChanged(circle, "cx", String(fromPoint.x * 100 + 50));
	setAttributeIfChanged(circle, "cy", String(fromPoint.y * 100 + 50));
	setAttributeIfChanged(circle, "r", String(50 - width / 2));
	setAttributeIfChanged(circle, "fill", "none");
	setAttributeIfChanged(circle, "stroke", pen.color);
	setAttributeIfChanged(circle, "stroke-width", String(width));
	setAttributeIfChanged(circle, "opacity", String(pen.opacity));
	describeMark(circle, "circle", mark, penKey);
}

/** As `paintArrow`, for a badge mark. The `svg` payload is only rewritten when it
 *  actually changed -- it is the one thing here that costs a parse. */
function paintBadge(badge: SVGElement, mark: Mark, orientation: Color, penKey: string, svgChanged: boolean): void {
	const fromPoint = squareToPoint(mark.from, orientation);
	setAttributeIfChanged(badge, "transform", `translate(${fromPoint.x * 100}, ${fromPoint.y * 100})`);
	if (svgChanged) {
		badge.innerHTML = mark.svg ?? "";
	}
	describeMark(badge, "badge", mark, penKey);
}

/** Places `node` so its next sibling is `before` (i.e. immediately in front of
 *  `before`, or last if `before` is null), but only if it isn't already there.
 *  `insertBefore` is a DOM write even when the position doesn't change, and the
 *  common case -- an engine tick that doesn't reorder anything -- must cost
 *  nothing. */
function placeBefore(layer: SVGSVGElement, node: SVGElement, before: Node | null): void {
	if (node.nextSibling !== before) {
		layer.insertBefore(node, before);
	}
}

/** Enforces draw order within one layer for the given nodes (already in the
 *  desired draw order, with gaps for marks that don't populate this layer).
 *  Walking from the end backwards means every node's `before` anchor is either
 *  the next node in the list or the end of the layer, so a node already in the
 *  right place relative to its neighbours is never moved. */
function enforceOrder(layer: SVGSVGElement, nodes: readonly (SVGElement | undefined)[]): void {
	let anchor: Node | null = null;
	for (let i = nodes.length - 1; i >= 0; i--) {
		const node = nodes[i];
		if (!node) {
			continue;
		}
		placeBefore(layer, node, anchor);
		anchor = node;
	}
}

function orderLayer(layer: SVGSVGElement | null, nodes: readonly (SVGElement | undefined)[]): void {
	if (!layer) {
		return;
	}
	enforceOrder(layer, nodes);
}

export function renderMarks(dom: BoardDom, state: BoardState, current: Mark | null): void {
	const cache = getCache(dom);

	// A board that has never drawn has nothing to clear, so `undefined` counts as
	// "nothing drawn" here just as `false` does.
	if (!state.marks.enabled) {
		if (!cache.drewSomething) {
			return;
		}
		// Marks are disabled, so every rendered mark retires. The nodes are parked
		// rather than destroyed: toggling marks back on is a normal thing for a
		// consumer to do, and it should not have to rebuild the layer.
		for (const rendered of cache.renderedMarks.values()) {
			retire(cache, rendered);
		}
		cache.renderedMarks.clear();
		cache.gradients.sweep();
		cache.drewSomething = false;
		return;
	}

	// Auto and user marks are deduped separately and drawn auto-first, so a
	// hand-drawn mark layers *over* an engine's suggestion instead of replacing
	// it. Both routinely name the same pair of squares -- drawing over the move
	// the engine is proposing is the common case -- and folding them into one
	// map by key silently dropped whichever came first. That read as the user's
	// arrow vanishing the instant it was released: while it is being drawn it is
	// `current`, which was set last and therefore won.
	//
	// Only within one source does a later mark win over an earlier one on the
	// same key.
	const auto = byKey(state.marks.auto);
	const user = byKey(state.marks.user);

	// The in-progress mark supersedes the finished user mark it is redrawing, so
	// a redraw paints one arrow rather than two stacked copies of it.
	if (current) {
		user.set(markKey(current), current);
	}

	// The list has to be built before this decision, so that a `current` mark on
	// an otherwise empty board still counts as something to draw.
	const hasMarks = auto.size > 0 || user.size > 0;
	if (!hasMarks && !cache.drewSomething) {
		return;
	}

	// Build the desired mark list in draw order (auto first, then user), each
	// tagged with its source. An auto mark and a user mark routinely share a
	// `markKey` -- the common case is a hand-drawn arrow over the engine's
	// suggestion for the same move -- so the render cache below is keyed by
	// source too; keying it by `markKey` alone would let the second one
	// rendered silently overwrite the first one's cache entry, orphaning its
	// nodes and then mutating the survivor's nodes with the orphan's inputs on
	// the next render.
	const desiredMarks: { mark: Mark; source: "auto" | "user" }[] = [
		...Array.from(auto.values(), (mark) => ({ mark, source: "auto" as const })),
		...Array.from(user.values(), (mark) => ({ mark, source: "user" as const })),
	];
	const desiredKeys = new Set<string>();

	// Build a new list of rendered marks by diffing against the existing ones.
	const newRenderedMarks = new Map<string, RenderedMark>();

	// Collected in draw order so paint order can be enforced per layer once the
	// diff is done, regardless of which marks were reused, mutated or created.
	const marksLayerOrder: (SVGElement | undefined)[] = [];
	const headsLayerOrder: (SVGElement | undefined)[] = [];
	const badgesLayerOrder: (SVGElement | undefined)[] = [];

	for (const { mark, source } of desiredMarks) {
		const key = `${source}:${markKey(mark)}`;
		desiredKeys.add(key);
		const pen = resolvePen(state, mark);
		const penKey = mark.pen ?? "green";

		// Determine the mark kind.
		const kind = mark.svg ? "badge" : mark.to ? "arrow" : "circle";

		// Check if this key was already rendered.
		const rendered = cache.renderedMarks.get(key);

		let shaft: SVGElement | undefined;
		let head: SVGElement | undefined;
		let circle: SVGElement | undefined;
		let badge: SVGElement | undefined;

		if (rendered && inputsIdentical(rendered, pen.color, pen.opacity, pen.width, mark, state.orientation, kind)) {
			// Key present, inputs identical → reuse without touching DOM.
			newRenderedMarks.set(key, rendered);
			shaft = rendered.shaft;
			head = rendered.head;
			circle = rendered.circle;
			badge = rendered.badge;

			// This path never calls `fadeToOpaque`, so the gradient the surviving
			// shaft still points at has not been marked as referenced -- and the
			// post-render sweep would park it out from under a live arrow.
			if (kind === "arrow" && pen.opacity < 1 && rendered.shaft) {
				cache.gradients.retainFill(rendered.shaft.getAttribute("fill"));
			}
		} else {
			// Something changed. Retire whatever the previous render left that this
			// one cannot reuse, then paint -- onto the surviving node where the kind
			// still matches, onto a parked one otherwise, and onto a fresh element
			// only when the pool is empty.
			if (kind === "arrow") {
				const keep = rendered?.kind === "arrow" && rendered.shaft && rendered.head;
				if (rendered && !keep) {
					retire(cache, rendered);
				}
				shaft = keep ? rendered!.shaft! : take(cache, "shaft", "polygon", dom.marks);
				head = keep ? rendered!.head! : take(cache, "head", "polygon", dom.heads);
				// Geometry is computed after the nodes are settled because it is what
				// registers the fade gradient, and registering one for an arrow we
				// then failed to draw would leave a gradient nothing references.
				paintArrow(shaft, head, computeArrowGeometry(dom, mark, pen, state.orientation), mark, pen, penKey);
			} else if (kind === "circle") {
				const keep = rendered?.kind === "circle" && rendered.circle;
				if (rendered && !keep) {
					retire(cache, rendered);
				}
				circle = keep ? rendered!.circle! : take(cache, "circle", "circle", dom.marks);
				paintCircle(circle, mark, pen, state.orientation, penKey);
			} else {
				const keep = rendered?.kind === "badge" && rendered.badge;
				if (rendered && !keep) {
					retire(cache, rendered);
				}
				badge = keep ? rendered!.badge! : take(cache, "badge", "g", dom.badges);
				// A recycled or newly created node holds no markup, so the payload has
				// to be written; a surviving one only when the payload itself moved.
				paintBadge(badge, mark, state.orientation, penKey, !keep || rendered!.svg !== mark.svg);
			}
		}

		marksLayerOrder.push(shaft ?? circle);
		headsLayerOrder.push(head);
		badgesLayerOrder.push(badge);

		newRenderedMarks.set(key, {
			shaft,
			head,
			circle,
			badge,
			penColor: pen.color,
			penOpacity: pen.opacity,
			penWidth: pen.width,
			from: mark.from,
			to: mark.to,
			width: mark.width,
			svg: mark.svg,
			orientation: state.orientation,
			kind,
		});
	}

	// Retire marks whose keys are no longer in the desired set.
	for (const [key, rendered] of cache.renderedMarks) {
		if (!desiredKeys.has(key)) {
			retire(cache, rendered);
		}
	}

	// Update the cache with the new rendered marks.
	cache.renderedMarks = newRenderedMarks;

	// Enforce paint order last, once every mark's final node is known. Appending
	// only new nodes would put a mark that's added on a later render at the end
	// of the layer regardless of where it belongs in draw order (auto under
	// user); this re-threads the sibling chain to match draw order, moving only
	// the nodes that are actually out of place.
	// Peeking is enough here, and it has to be a peek: every node in these lists
	// was put there by appending to its layer, so a layer with anything to order
	// already exists. A board whose marks are all circles never needs a heads
	// layer, and the getter would conjure one purely to sort nothing.
	orderLayer(dom.marksOrNull, marksLayerOrder);
	orderLayer(dom.headsOrNull, headsLayerOrder);
	orderLayer(dom.badgesOrNull, badgesLayerOrder);

	// Park the gradients this render stopped referencing.
	cache.gradients.sweep();

	// Record what this render actually left behind.
	cache.drewSomething = hasMarks;
}
