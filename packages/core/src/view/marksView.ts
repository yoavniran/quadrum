import type { Mark, Pen } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "./layout";
import { squareToPoint } from "../model/squares";

/** SVG coordinates carry no meaning past a fraction of a unit; trimming them
 *  keeps the emitted markup readable and diffable. */
function round(n: number): number {
	return Math.round(n * 100) / 100;
}

export function markKey(mark: Mark): string {
	return mark.to ? `${mark.from}${mark.to}` : mark.from;
}

export function resolvePen(state: BoardState, mark: Mark): Pen {
	const penKey = mark.pen ?? "green";
	return state.marks.pens[penKey] ?? state.marks.pens.green;
}

/**
 * Empties both SVG layers, preserving the marks layer's <defs>. Iterates a
 * snapshot rather than draining `firstChild`: <defs> is always the first child,
 * so a `while (firstChild)` drain that skips it never terminates.
 */
function clearLayers(dom: BoardDom): void {
	const defs = dom.marks.querySelector("defs");
	for (const child of Array.from(dom.marks.childNodes)) {
		if (child !== defs) {
			dom.marks.removeChild(child);
		}
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
 */
function describeMark(
	el: SVGElement,
	kind: "arrow" | "circle" | "badge",
	mark: Mark,
	penKey: string,
): void {
	el.setAttribute("data-mark", kind);
	el.setAttribute("data-from", mark.from);
	if (mark.to) {
		el.setAttribute("data-to", mark.to);
	}
	el.setAttribute("data-pen", penKey);
}

export function renderMarks(dom: BoardDom, state: BoardState, current: Mark | null): void {
	if (!state.marks.enabled) {
		clearLayers(dom);
		return;
	}

	// Combine marks with current winning on equal key
	const keyToMark = new Map<string, Mark>();

	for (const mark of state.marks.user) {
		keyToMark.set(markKey(mark), mark);
	}

	for (const mark of state.marks.auto) {
		keyToMark.set(markKey(mark), mark);
	}

	if (current) {
		keyToMark.set(markKey(current), current);
	}

	clearLayers(dom);

	// Render all marks
	for (const mark of keyToMark.values()) {
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

			// One continuous polygon -- shaft and head share the same outline --
			// rather than a <line> plus a detached <polygon>. Drawn separately the
			// two only meet if their lengths agree exactly, and any disagreement
			// shows as a gap or an overshoot at the neck; as one path they cannot
			// come apart, and the fill needs no opaque stroke to hide the seam.
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

			const points = [
				[baseX + nx * half, baseY + ny * half],
				[neckX + nx * half, neckY + ny * half],
				[neckX + nx * headHalf, neckY + ny * headHalf],
				[toCenter.x, toCenter.y],
				[neckX - nx * headHalf, neckY - ny * headHalf],
				[neckX - nx * half, neckY - ny * half],
				[baseX - nx * half, baseY - ny * half],
			];

			const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
			polygon.setAttribute(
				"points",
				points.map(([x, y]) => `${round(x!)},${round(y!)}`).join(" "),
			);
			polygon.setAttribute("fill", pen.color);
			polygon.setAttribute("opacity", String(pen.opacity));
			polygon.setAttribute("stroke-linejoin", "round");
			describeMark(polygon, "arrow", mark, penKey);
			dom.marks.appendChild(polygon);
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
