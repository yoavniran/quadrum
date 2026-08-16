import { setAttr, forgetAttrs } from "./svgAttrs";

export const GRADIENT_POOL_CAPACITY = 8;

export interface GradientSegment {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

interface Entry {
	gradient: SVGElement;
	fill: string;
	stop0: SVGElement;
	stop1: SVGElement;
	color: string;
	opacity: number;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface GradientRegistry {
	/** `url(#id)` for a gradient ramping `color` from `opacity` to 1 along `segment`,
	 *  owned by `owner` — the shaft element it paints. */
	fill(defs: SVGElement, owner: SVGElement, color: string, opacity: number, segment: GradientSegment): string;
	/** Re-marks the gradient owned by `owner` as still in use this render. */
	retain(owner: SVGElement): void;
	/** Ends a render: every gradient not referenced since the last sweep is parked. */
	sweep(): void;
	/** Drops every gradient, parked or live, and removes it from the DOM. */
	drain(): void;
}

export function createGradientRegistry(boardSeq: number): GradientRegistry {
	// Gradients owned by shaft elements
	const byOwner = new Map<SVGElement, Entry>();
	// Referenced owners in the current render
	let referenced = new Set<SVGElement>();
	// Monotonic counter for minting gradient ids
	let nextIndex = 0;
	// Parked gradients available for reuse, stored as Entry objects
	const parked: Entry[] = [];

	function round(n: number): number {
		return Math.round(n * 100) / 100;
	}

	return {
		fill(defs: SVGElement, owner: SVGElement, color: string, opacity: number, segment: GradientSegment): string {
			// Round coordinates
			const x1 = round(segment.x1);
			const y1 = round(segment.y1);
			const x2 = round(segment.x2);
			const y2 = round(segment.y2);

			// Mark owner as referenced in current render
			referenced.add(owner);

			// Look for existing entry
			const existing = byOwner.get(owner);
			if (existing && existing.gradient.parentNode === defs) {
				// Entry exists and its gradient is still in defs, rewrite what changed
				if (existing.color !== color) {
					setAttr(existing.stop0, "stop-color", color);
					setAttr(existing.stop1, "stop-color", color);
					existing.color = color;
				}
				if (existing.opacity !== opacity) {
					setAttr(existing.stop0, "stop-opacity", String(opacity));
					existing.opacity = opacity;
				}
				if (existing.x1 !== x1) {
					setAttr(existing.gradient, "x1", String(x1));
					existing.x1 = x1;
				}
				if (existing.y1 !== y1) {
					setAttr(existing.gradient, "y1", String(y1));
					existing.y1 = y1;
				}
				if (existing.x2 !== x2) {
					setAttr(existing.gradient, "x2", String(x2));
					existing.x2 = x2;
				}
				if (existing.y2 !== y2) {
					setAttr(existing.gradient, "y2", String(y2));
					existing.y2 = y2;
				}
				return existing.fill;
			}

			// Miss: acquire or create a new gradient
			let entry: Entry;
			let isNew = false;

			if (parked.length > 0) {
				entry = parked.pop()!;
				const gradient = entry.gradient;
				if (gradient.parentNode !== defs) {
					defs.appendChild(gradient);
				}
			} else {
				// Create a new gradient element
				const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
				const id = `qd-fade-${boardSeq}-${nextIndex++}`;
				gradient.setAttribute("id", id);
				gradient.setAttribute("gradientUnits", "userSpaceOnUse");
				defs.appendChild(gradient);

				// Create stops
				const stop0 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
				stop0.setAttribute("offset", "0");
				gradient.appendChild(stop0);

				const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
				stop1.setAttribute("offset", "1");
				gradient.appendChild(stop1);

				entry = {
					gradient,
					fill: `url(#${id})`,
					stop0,
					stop1,
					color: "",
					opacity: -1,
					x1: -Infinity,
					y1: -Infinity,
					x2: -Infinity,
					y2: -Infinity,
				};
				isNew = true;
			}

			// Write all attributes for new gradients, just differences for recycled ones
			if (isNew) {
				setAttr(entry.stop0, "stop-color", color);
				setAttr(entry.stop0, "stop-opacity", String(opacity));
				setAttr(entry.stop1, "stop-color", color);
				setAttr(entry.stop1, "stop-opacity", "1");
				setAttr(entry.gradient, "x1", String(x1));
				setAttr(entry.gradient, "y1", String(y1));
				setAttr(entry.gradient, "x2", String(x2));
				setAttr(entry.gradient, "y2", String(y2));
			} else {
				// Recycled: only write what differs from before it was parked
				if (entry.color !== color) {
					setAttr(entry.stop0, "stop-color", color);
					setAttr(entry.stop1, "stop-color", color);
				}
				if (entry.opacity !== opacity) {
					setAttr(entry.stop0, "stop-opacity", String(opacity));
				}
				if (entry.x1 !== x1) {
					setAttr(entry.gradient, "x1", String(x1));
				}
				if (entry.y1 !== y1) {
					setAttr(entry.gradient, "y1", String(y1));
				}
				if (entry.x2 !== x2) {
					setAttr(entry.gradient, "x2", String(x2));
				}
				if (entry.y2 !== y2) {
					setAttr(entry.gradient, "y2", String(y2));
				}
			}

			// Update entry with final values
			entry.color = color;
			entry.opacity = opacity;
			entry.x1 = x1;
			entry.y1 = y1;
			entry.x2 = x2;
			entry.y2 = y2;

			byOwner.set(owner, entry);
			return entry.fill;
		},

		retain(owner: SVGElement): void {
			referenced.add(owner);
		},

		sweep(): void {
			const owners = Array.from(byOwner.keys());
			for (const owner of owners) {
				if (!referenced.has(owner)) {
					const entry = byOwner.get(owner)!;

					// A parked gradient stays inside `defs`. Nothing references it, so it
					// paints nothing, and leaving it there is what makes recycling free:
					// detaching and re-appending would be two structural mutations per
					// reuse, which is the cost this pool exists to avoid.
					if (parked.length < GRADIENT_POOL_CAPACITY) {
						parked.push(entry);
						forgetAttrs(entry.gradient);
						forgetAttrs(entry.stop0);
						forgetAttrs(entry.stop1);
					} else {
						entry.gradient.remove();
						forgetAttrs(entry.gradient);
						forgetAttrs(entry.stop0);
						forgetAttrs(entry.stop1);
					}

					byOwner.delete(owner);
				}
			}

			referenced.clear();
		},

		drain(): void {
			for (const entry of byOwner.values()) {
				entry.gradient.remove();
				forgetAttrs(entry.gradient);
				forgetAttrs(entry.stop0);
				forgetAttrs(entry.stop1);
			}
			byOwner.clear();

			for (const entry of parked) {
				entry.gradient.remove();
				forgetAttrs(entry.gradient);
				forgetAttrs(entry.stop0);
				forgetAttrs(entry.stop1);
			}
			parked.length = 0;
		},
	};
}
