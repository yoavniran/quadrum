import type { Mark, Pen } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "./layout";
import { squareToPoint } from "../model/squares";

/** SVG coordinates carry no meaning past a fraction of a unit; trimming them
 *  keeps the emitted markup readable and diffable. */
function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/** Ids must be unique within the document, and a page can hold several boards.
 *  A plain counter is enough: the ids are internal and never referenced from
 *  outside the SVG that owns them. */
let gradientSeq = 0;

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
 * Empties the SVG layers, keeping the marks layer's <defs> element itself but
 * emptying its contents -- the per-arrow fade gradients are rebuilt from the
 * marks on every render. Iterates a snapshot rather than draining `firstChild`:
 * <defs> is always the first child, so a `while (firstChild)` drain that skips
 * it never terminates.
 */
function clearLayers(dom: BoardDom): void {
	const defs = dom.marks.querySelector("defs");
	for (const child of Array.from(dom.marks.childNodes)) {
		if (child !== defs) {
			dom.marks.removeChild(child);
		}
	}
	if (defs) {
		for (const child of Array.from(defs.childNodes)) {
			defs.removeChild(child);
		}
	}
	for (const child of Array.from(dom.heads.childNodes)) {
		dom.heads.removeChild(child);
	}
	for (const child of Array.from(dom.badges.childNodes)) {
		dom.badges.removeChild(child);
	}
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
 */
function describeMark(
	el: SVGElement,
	kind: "arrow" | "circle" | "badge" | null,
	mark: Mark,
	penKey: string,
	part?: "shaft" | "head",
): void {
	if (kind) {
		el.setAttribute("data-mark", kind);
	}
	if (part) {
		el.setAttribute("data-mark-part", part);
	}
	el.setAttribute("data-from", mark.from);
	if (mark.to) {
		el.setAttribute("data-to", mark.to);
	}
	el.setAttribute("data-pen", penKey);
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

	const id = `qd-fade-${++gradientSeq}`;
	const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
	gradient.setAttribute("id", id);
	gradient.setAttribute("gradientUnits", "userSpaceOnUse");
	gradient.setAttribute("x1", String(round(segment.x1)));
	gradient.setAttribute("y1", String(round(segment.y1)));
	gradient.setAttribute("x2", String(round(segment.x2)));
	gradient.setAttribute("y2", String(round(segment.y2)));

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
	return `url(#${id})`;
}

export function renderMarks(dom: BoardDom, state: BoardState, current: Mark | null): void {
	if (!state.marks.enabled) {
		clearLayers(dom);
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

	clearLayers(dom);

	// Render all marks. Within a layer the DOM order is the paint order, so the
	// user's marks land on top of the automatic ones.
	for (const mark of [...auto.values(), ...user.values()]) {
		const pen = resolvePen(state, mark);
		const penKey = mark.pen ?? "green";
		const fromPoint = squareToPoint(mark.from, state.orientation);
		const fromCenter = { x: fromPoint.x * 100 + 50, y: fromPoint.y * 100 + 50 };

		if (mark.svg) {
			// Badge
			const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
			g.setAttribute("transform", `translate(${fromPoint.x * 100}, ${fromPoint.y * 100})`);
			g.innerHTML = mark.svg;
			describeMark(g, "badge", mark, penKey);
			dom.badges.appendChild(g);
		} else if (mark.to) {
			// Arrow
			const toPoint = squareToPoint(mark.to, state.orientation);
			const toCenter = { x: toPoint.x * 100 + 50, y: toPoint.y * 100 + 50 };

			// An arrow straddles the pieces, so it is cut into two polygons in two
			// layers: the part inside the destination square passes ABOVE them and
			// the rest BELOW. The split is by square, not at the neck -- a head
			// alone on top leaves the shaft under it to be swallowed by the piece's
			// base, which reads as a triangle floating free of its arrow. Both
			// pieces are cut from one set of coordinates and overlap, so they
			// cannot come apart the way the original <line>-plus-<polygon> did.
			const dx = toCenter.x - fromCenter.x;
			const dy = toCenter.y - fromCenter.y;
			const dist = Math.sqrt(dx * dx + dy * dy) || 1;
			const ux = dx / dist;
			const uy = dy / dist;
			// perpendicular
			const nx = -uy;
			const ny = ux;

			const width = mark.width ?? pen.width;
			const headWidth = width * 2.6;
			const headLength = headWidth * 0.9;
			// The tail sits on the origin square's centre, not short of it: the
			// piece is what should hide it, and it does, because the marks layer
			// paints under the pieces (see quadrum.css). Backing the geometry off
			// instead leaves a gap on an empty origin square and still shows a
			// stub next to a narrow piece.
			const baseX = fromCenter.x;
			const baseY = fromCenter.y;
			const neckX = toCenter.x - ux * headLength;
			const neckY = toCenter.y - uy * headLength;
			const half = width / 2;
			const headHalf = headWidth / 2;

			// Where the ray crosses into the destination square, measured back from
			// its centre: 50 for a straight arrow, ~70.7 for a diagonal, ~55.9 for
			// a knight's. Always at most half the distance between two distinct
			// squares, so the under-the-pieces shaft is never degenerate.
			const enter = 50 / Math.max(Math.abs(ux), Math.abs(uy));

			// Two shapes that merely touch along an edge antialias into a hairline
			// seam, so they overlap by a unit instead. The overlap is buried under
			// the over-the-pieces polygon, which is opaque and at least as wide as
			// the shaft everywhere it covers it.
			const SEAM = 1;
			// The over-the-pieces cut starts at the square boundary -- or further
			// back, if the head alone would not fit inside the square. No standard
			// pen is that wide, but a custom one could be.
			const overLength = Math.max(enter, headLength + SEAM);
			const overX = toCenter.x - ux * overLength;
			const overY = toCenter.y - uy * overLength;
			const lapX = overX + ux * SEAM;
			const lapY = overY + uy * SEAM;

			const shaft = [
				[baseX + nx * half, baseY + ny * half],
				[lapX + nx * half, lapY + ny * half],
				[lapX - nx * half, lapY - ny * half],
				[baseX - nx * half, baseY - ny * half],
			];

			// Stub plus head as one outline: everything the arrow puts inside the
			// destination square, in one shape above the piece standing there.
			const head = [
				[overX + nx * half, overY + ny * half],
				[neckX + nx * half, neckY + ny * half],
				[neckX + nx * headHalf, neckY + ny * headHalf],
				[toCenter.x, toCenter.y],
				[neckX - nx * headHalf, neckY - ny * headHalf],
				[neckX - nx * half, neckY - ny * half],
				[overX - nx * half, overY - ny * half],
			];

			const paint = (
				pts: number[][],
				part: "shaft" | "head",
				layer: SVGSVGElement,
				fill: string,
				opacity: number | null,
			): void => {
				const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
				polygon.setAttribute(
					"points",
					pts.map(([x, y]) => `${round(x!)},${round(y!)}`).join(" "),
				);
				polygon.setAttribute("fill", fill);
				if (opacity !== null) {
					polygon.setAttribute("opacity", String(opacity));
				}
				polygon.setAttribute("stroke-linejoin", "round");
				// The shaft is the mark; the head only ever a part of it.
				describeMark(polygon, part === "shaft" ? "arrow" : null, mark, penKey, part);
				layer.appendChild(polygon);
			};

			// What sits over the pieces cannot be translucent: at any opacity below
			// 1 the piece under it shows through the fill, which reads as the piece
			// covering the arrow -- the exact opposite of the intent. The shaft
			// stays translucent so the board reads through it, and fades up to full
			// opacity as it approaches the boundary, so the two halves meet at the
			// same tone instead of stepping visibly mid-arrow.
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
			paint(shaft, "shaft", dom.marks, fade ?? pen.color, fade ? null : pen.opacity);
			paint(head, "head", dom.heads, pen.color, 1);
		} else {
			// Circle
			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
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
}
