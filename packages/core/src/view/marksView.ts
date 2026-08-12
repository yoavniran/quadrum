import type { Mark, Pen, Color } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "./layout";
import { squareToPoint } from "../model/squares";

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
	gradients: Map<string, SVGLinearGradientElement>;
	boardSeq: number;
	// Monotonic per-board counter for minting gradient ids. Never decreases, so an
	// id can never be reused while an earlier gradient sharing it is still alive --
	// unlike `gradients.size`, which drops when the post-render sweep deletes
	// entries and can then reissue an id that a surviving gradient still holds.
	nextGradientIndex: number;
	// Tracks which gradient cache keys are referenced in the current render, so
	// unreferenced ones can be cleaned up afterwards.
	referencedGradientKeys?: Set<string>;
	// Maps mark keys to their rendered nodes and inputs, for keyed diffing.
	renderedMarks: Map<string, RenderedMark>;
}

const caches = new WeakMap<BoardDom, MarksCache>();

function getCache(dom: BoardDom): MarksCache {
	let cache = caches.get(dom);
	if (!cache) {
		cache = {
			drewSomething: false,
			gradients: new Map(),
			boardSeq: boardSeq++,
			nextGradientIndex: 0,
			renderedMarks: new Map(),
		};
		caches.set(dom, cache);
	}
	return cache;
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
 * across renders reuses the same element and the same fill URL.
 */
function fadeToOpaque(
	dom: BoardDom,
	pen: Pen,
	segment: { x1: number; y1: number; x2: number; y2: number },
): string | null {
	const defs = dom.marks.querySelector("defs");
	if (!defs) {
		return null;
	}

	const cache = getCache(dom);
	const x1Rounded = round(segment.x1);
	const y1Rounded = round(segment.y1);
	const x2Rounded = round(segment.x2);
	const y2Rounded = round(segment.y2);

	// Cache key: pen colour, opacity, and the four rounded coordinates.
	const cacheKey = `${pen.color}|${pen.opacity}|${x1Rounded},${y1Rounded},${x2Rounded},${y2Rounded}`;

	// Track this key as referenced if tracking is active.
	if (cache.referencedGradientKeys) {
		cache.referencedGradientKeys.add(cacheKey);
	}

	// Check if this content is already cached.
	const existing = cache.gradients.get(cacheKey);
	if (existing && existing.parentNode === defs) {
		return `url(#${existing.id})`;
	}

	// Create a new gradient element for this content. The index comes from a
	// counter that only ever increments -- `gradients.size` looks equivalent but
	// isn't, because the post-render sweep deletes entries and shrinks it, which
	// can reissue an id that an earlier, still-live gradient holds.
	const id = `qd-fade-${cache.boardSeq}-${cache.nextGradientIndex++}`;
	const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
	gradient.setAttribute("id", id);
	gradient.setAttribute("gradientUnits", "userSpaceOnUse");
	gradient.setAttribute("x1", String(x1Rounded));
	gradient.setAttribute("y1", String(y1Rounded));
	gradient.setAttribute("x2", String(x2Rounded));
	gradient.setAttribute("y2", String(y2Rounded));

	for (const [offset, opacity] of [
		["0", pen.opacity],
		["1", 1],
	] as const) {
		const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
		stop.setAttribute("offset", offset);
		stop.setAttribute("stop-color", pen.color);
		stop.setAttribute("stop-opacity", String(opacity));
		gradient.appendChild(stop);
	}

	defs.appendChild(gradient);
	cache.gradients.set(cacheKey, gradient);
	return `url(#${id})`;
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

export function renderMarks(dom: BoardDom, state: BoardState, current: Mark | null): void {
	const cache = getCache(dom);

	// A board that has never drawn has nothing to clear, so `undefined` counts as
	// "nothing drawn" here just as `false` does.
	if (!state.marks.enabled) {
		if (!cache.drewSomething) {
			return;
		}
		// Mark all existing marks for removal since marks are disabled.
		for (const rendered of cache.renderedMarks.values()) {
			rendered.shaft?.remove();
			rendered.head?.remove();
			rendered.circle?.remove();
			rendered.badge?.remove();
		}
		cache.renderedMarks.clear();
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

	// Track which gradient cache keys are referenced by this render, so unreferenced
	// ones can be cleaned up afterwards.
	cache.referencedGradientKeys = new Set<string>();

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

			// Still need to track gradient references if it's an arrow with fade.
			if (kind === "arrow" && pen.opacity < 1 && rendered.shaft) {
				const fill = rendered.shaft.getAttribute("fill");
				if (fill && fill.startsWith("url(#")) {
					// Extract the gradient key from the URL and mark as referenced.
					const gradientId = fill.slice(5, -1);
					for (const [cacheKey, gradient] of cache.gradients) {
						if (gradient.id === gradientId) {
							cache.referencedGradientKeys!.add(cacheKey);
							break;
						}
					}
				}
			}
		} else if (kind === "badge") {
			// For badges, compare by svg string and update innerHTML if changed.
			if (rendered?.badge && rendered.svg === mark.svg) {
				badge = rendered.badge;
			} else {
				// Remove old badge if kind changed.
				if (rendered?.badge) {
					rendered.badge.remove();
				}
				const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
				const fromPoint = squareToPoint(mark.from, state.orientation);
				g.setAttribute("transform", `translate(${fromPoint.x * 100}, ${fromPoint.y * 100})`);
				g.innerHTML = mark.svg!;
				describeMark(g, "badge", mark, penKey);
				dom.badges.appendChild(g);
				badge = g;
			}
		} else if (kind === "arrow" && rendered?.kind === "arrow" && rendered.shaft && rendered.head) {
			// Arrow with reuse: mutate the existing polygons in place, writing only
			// the attributes that actually changed so a partial change (e.g. only
			// the pen) doesn't spray writes across geometry that didn't move.
			const geo = computeArrowGeometry(dom, mark, pen, state.orientation);

			setAttributeIfChanged(rendered.shaft, "points", geo.shaftPoints);
			setAttributeIfChanged(rendered.shaft, "fill", geo.fade ?? pen.color);
			if (geo.fade) {
				removeAttributeIfPresent(rendered.shaft, "opacity");
			} else {
				setAttributeIfChanged(rendered.shaft, "opacity", String(pen.opacity));
			}
			setAttributeIfChanged(rendered.shaft, "stroke-linejoin", "round");
			describeMark(rendered.shaft, "arrow", mark, penKey, "shaft");

			// The create branch also paints the head -- fill, full opacity and the
			// same line join -- so a pen change on a surviving arrow must repaint it
			// too, or the head keeps the previous pen's colour.
			setAttributeIfChanged(rendered.head, "points", geo.headPoints);
			setAttributeIfChanged(rendered.head, "fill", pen.color);
			setAttributeIfChanged(rendered.head, "opacity", "1");
			setAttributeIfChanged(rendered.head, "stroke-linejoin", "round");
			describeMark(rendered.head, null, mark, penKey, "head");

			shaft = rendered.shaft;
			head = rendered.head;
		} else if (kind === "circle" && rendered?.kind === "circle" && rendered.circle) {
			// Circle with reuse: same idea as the arrow mutate path above.
			const fromPoint = squareToPoint(mark.from, state.orientation);
			const fromCenter = { x: fromPoint.x * 100 + 50, y: fromPoint.y * 100 + 50 };
			const r = 50 - (mark.width ?? pen.width) / 2;

			setAttributeIfChanged(rendered.circle, "cx", String(fromCenter.x));
			setAttributeIfChanged(rendered.circle, "cy", String(fromCenter.y));
			setAttributeIfChanged(rendered.circle, "r", String(r));
			setAttributeIfChanged(rendered.circle, "stroke", pen.color);
			setAttributeIfChanged(rendered.circle, "stroke-width", String(mark.width ?? pen.width));
			setAttributeIfChanged(rendered.circle, "opacity", String(pen.opacity));
			describeMark(rendered.circle, "circle", mark, penKey);

			circle = rendered.circle;
		} else {
			// Kind changed or first creation: create new nodes.
			if (rendered) {
				rendered.shaft?.remove();
				rendered.head?.remove();
				rendered.circle?.remove();
				rendered.badge?.remove();
			}

			const fromPoint = squareToPoint(mark.from, state.orientation);
			const fromCenter = { x: fromPoint.x * 100 + 50, y: fromPoint.y * 100 + 50 };

			if (kind === "arrow") {
				const geo = computeArrowGeometry(dom, mark, pen, state.orientation);

				// Create shaft polygon.
				shaft = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
				shaft.setAttribute("points", geo.shaftPoints);
				shaft.setAttribute("fill", geo.fade ?? pen.color);
				if (!geo.fade) {
					shaft.setAttribute("opacity", String(pen.opacity));
				}
				shaft.setAttribute("stroke-linejoin", "round");
				describeMark(shaft, "arrow", mark, penKey, "shaft");
				dom.marks.appendChild(shaft);

				// Create head polygon.
				head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
				head.setAttribute("points", geo.headPoints);
				head.setAttribute("fill", pen.color);
				head.setAttribute("opacity", "1");
				head.setAttribute("stroke-linejoin", "round");
				describeMark(head, null, mark, penKey, "head");
				dom.heads.appendChild(head);
			} else {
				// Circle
				circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
				circle.setAttribute("cx", String(fromCenter.x));
				circle.setAttribute("cy", String(fromCenter.y));
				circle.setAttribute("r", String(50 - (mark.width ?? pen.width) / 2));
				circle.setAttribute("fill", "none");
				circle.setAttribute("stroke", pen.color);
				circle.setAttribute("stroke-width", String(mark.width ?? pen.width));
				circle.setAttribute("opacity", String(pen.opacity));
				describeMark(circle, "circle", mark, penKey);
				dom.marks.appendChild(circle);
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

	// Remove marks whose keys are no longer in the desired set.
	for (const [key, rendered] of cache.renderedMarks) {
		if (!desiredKeys.has(key)) {
			rendered.shaft?.remove();
			rendered.head?.remove();
			rendered.circle?.remove();
			rendered.badge?.remove();
		}
	}

	// Update the cache with the new rendered marks.
	cache.renderedMarks = newRenderedMarks;

	// Enforce paint order last, once every mark's final node is known. Appending
	// only new nodes would put a mark that's added on a later render at the end
	// of the layer regardless of where it belongs in draw order (auto under
	// user); this re-threads the sibling chain to match draw order, moving only
	// the nodes that are actually out of place.
	enforceOrder(dom.marks, marksLayerOrder);
	enforceOrder(dom.heads, headsLayerOrder);
	enforceOrder(dom.badges, badgesLayerOrder);

	// Clean up unreferenced gradients.
	const defsElement = dom.marks.querySelector("defs");
	if (defsElement && cache.referencedGradientKeys) {
		const keysToRemove: string[] = [];
		for (const [key, gradient] of cache.gradients) {
			if (!cache.referencedGradientKeys.has(key) && gradient.parentNode === defsElement) {
				gradient.remove();
				keysToRemove.push(key);
			}
		}
		for (const key of keysToRemove) {
			cache.gradients.delete(key);
		}
	}

	// Record what this render actually left behind.
	cache.drewSomething = hasMarks;
	cache.referencedGradientKeys = undefined;
}
