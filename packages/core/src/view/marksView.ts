import type { Mark, Pen } from "../types";
import type { BoardState } from "../options";
import type { BoardDom } from "./layout";
import { squareToPoint } from "../model/squares";

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

			const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
			g.setAttribute("opacity", String(pen.opacity));

			// Shorten the line by ~20 units from the origin and stop before the arrowhead
			const dx = toCenter.x - fromCenter.x;
			const dy = toCenter.y - fromCenter.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const headLength = 30;
			const lineStart = { x: fromCenter.x + (dx / dist) * 20, y: fromCenter.y + (dy / dist) * 20 };
			const lineEnd = { x: toCenter.x - (dx / dist) * headLength, y: toCenter.y - (dy / dist) * headLength };

			const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			line.setAttribute("x1", String(lineStart.x));
			line.setAttribute("y1", String(lineStart.y));
			line.setAttribute("x2", String(lineEnd.x));
			line.setAttribute("y2", String(lineEnd.y));
			line.setAttribute("stroke", pen.color);
			line.setAttribute("stroke-width", String(mark.width ?? pen.width));
			line.setAttribute("stroke-linecap", "round");

			// Arrowhead
			const angle = Math.atan2(dy, dx);
			const arrowSize = 20;
			const p1 = { x: toCenter.x, y: toCenter.y };
			const p2 = { x: toCenter.x - arrowSize * Math.cos(angle - Math.PI / 6), y: toCenter.y - arrowSize * Math.sin(angle - Math.PI / 6) };
			const p3 = { x: toCenter.x - arrowSize * Math.cos(angle + Math.PI / 6), y: toCenter.y - arrowSize * Math.sin(angle + Math.PI / 6) };

			const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
			polygon.setAttribute("points", `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`);
			polygon.setAttribute("fill", pen.color);

			g.appendChild(line);
			g.appendChild(polygon);
			describeMark(g, "arrow", mark, penKey);
			dom.marks.appendChild(g);
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
