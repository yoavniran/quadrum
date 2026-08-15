import { createNodePool } from "./nodePool";

export const GRADIENT_POOL_CAPACITY = 8;

export interface GradientSegment {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface GradientRegistry {
	/** `url(#id)` for a gradient ramping `color` from `opacity` to 1 along `segment`. */
	fill(defs: SVGElement, color: string, opacity: number, segment: GradientSegment): string;
	/** Re-marks the gradient behind an existing `fill` value as still in use. */
	retainFill(fill: string | null): void;
	/** Ends a render: every gradient not referenced since the last sweep is parked. */
	sweep(): void;
	/** Drops every gradient, parked or live, and removes it from the DOM. */
	drain(): void;
}

export function createGradientRegistry(boardSeq: number): GradientRegistry {
	// Cache: content key -> gradient element
	const cache = new Map<string, SVGElement>();
	// Reverse mapping: gradient id -> content key, for O(1) lookup in retainFill
	const idToKey = new Map<string, string>();
	// Referenced keys in the current render
	let referencedKeys = new Set<string>();
	// Monotonic counter for minting gradient ids
	let nextIndex = 0;
	// Pool of parked gradients
	const gradientPool = createNodePool<SVGElement>(GRADIENT_POOL_CAPACITY);

	function round(n: number): number {
		return Math.round(n * 100) / 100;
	}

	function setAttributeIfChanged(el: SVGElement, name: string, value: string): void {
		if (el.getAttribute(name) !== value) {
			el.setAttribute(name, value);
		}
	}

	return {
		fill(defs: SVGElement, color: string, opacity: number, segment: GradientSegment): string {
			// Round coordinates and build cache key
			const x1 = round(segment.x1);
			const y1 = round(segment.y1);
			const x2 = round(segment.x2);
			const y2 = round(segment.y2);
			const cacheKey = `${color}|${opacity}|${x1},${y1},${x2},${y2}`;

			// Mark as referenced in current render
			referencedKeys.add(cacheKey);

			// Check cache hit
			const existing = cache.get(cacheKey);
			if (existing && existing.parentNode === defs) {
				return `url(#${existing.id})`;
			}

			// Miss: acquire or create a new gradient element
			let gradient = gradientPool.acquire();

			if (!gradient) {
				gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
				const id = `qd-fade-${boardSeq}-${nextIndex++}`;
				gradient.setAttribute("id", id);
				gradient.setAttribute("gradientUnits", "userSpaceOnUse");
				defs.appendChild(gradient);
			} else if (gradient.parentNode !== defs) {
				// Recycled gradient was removed from defs, append it back
				defs.appendChild(gradient);
			}

			const id = gradient.getAttribute("id")!;

			// Write coordinates with change detection
			setAttributeIfChanged(gradient, "x1", String(x1));
			setAttributeIfChanged(gradient, "y1", String(y1));
			setAttributeIfChanged(gradient, "x2", String(x2));
			setAttributeIfChanged(gradient, "y2", String(y2));

			// Ensure exactly two stops
			const stops = gradient.querySelectorAll("stop");
			if (stops.length === 0) {
				// Create both stops
				const stop0 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
				stop0.setAttribute("offset", "0");
				stop0.setAttribute("stop-color", color);
				stop0.setAttribute("stop-opacity", String(opacity));
				gradient.appendChild(stop0);

				const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
				stop1.setAttribute("offset", "1");
				stop1.setAttribute("stop-color", color);
				stop1.setAttribute("stop-opacity", "1");
				gradient.appendChild(stop1);
			} else if (stops.length === 2) {
				// Reuse existing stops, rewrite only changed attributes
				const stop0 = stops[0] as SVGElement;
				const stop1 = stops[1] as SVGElement;

				setAttributeIfChanged(stop0, "stop-color", color);
				setAttributeIfChanged(stop0, "stop-opacity", String(opacity));
				setAttributeIfChanged(stop1, "stop-color", color);
				setAttributeIfChanged(stop1, "stop-opacity", "1");
			}

			// Record in cache and id map
			cache.set(cacheKey, gradient);
			idToKey.set(id, cacheKey);

			return `url(#${id})`;
		},

		retainFill(fill: string | null): void {
			if (!fill || !fill.startsWith("url(#") || !fill.endsWith(")")) {
				return;
			}

			// Extract id from url(#...)
			const id = fill.slice(5, -1);
			const cacheKey = idToKey.get(id);
			if (cacheKey) {
				referencedKeys.add(cacheKey);
			}
		},

		sweep(): void {
			const keysToRemove: string[] = [];

			for (const [key, gradient] of cache) {
				if (!referencedKeys.has(key)) {
					// A parked gradient stays inside `defs`. Nothing references it, so it
					// paints nothing, and leaving it there is what makes recycling free:
					// detaching and re-appending would be two structural mutations per
					// reuse, which is the cost this pool exists to avoid.
					if (!gradientPool.release(gradient)) {
						gradient.remove();
					}
					keysToRemove.push(key);
					const id = gradient.getAttribute("id");
					if (id) {
						idToKey.delete(id);
					}
				}
			}

			for (const key of keysToRemove) {
				cache.delete(key);
			}

			referencedKeys.clear();
		},

		drain(): void {
			for (const gradient of cache.values()) {
				gradient.remove();
			}
			cache.clear();
			idToKey.clear();

			const drained = gradientPool.drain();
			for (const gradient of drained) {
				gradient.remove();
			}
		},
	};
}
