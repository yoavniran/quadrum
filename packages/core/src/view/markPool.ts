import type { NodePool } from "./nodePool";
import { createNodePool } from "./nodePool";

export const MARK_POOL_CAPACITY = 32;

export type MarkNodeKind = "shaft" | "head" | "circle" | "badge";

const KINDS = ["shaft", "head", "circle", "badge"] as const;

/** The descriptive stamps `describeMark` writes; all of them are stripped when a
 *  node is parked. */
const STAMPS = ["data-mark", "data-mark-part", "data-from", "data-to", "data-pen"] as const;

export interface MarkPools {
	acquire(kind: MarkNodeKind): SVGElement | null;
	release(kind: MarkNodeKind, node: SVGElement): boolean;
	drain(): void;
}

export function createMarkPools(): MarkPools {
	const pools: Record<MarkNodeKind, NodePool<SVGElement>> = {
		shaft: createNodePool<SVGElement>(MARK_POOL_CAPACITY),
		head: createNodePool<SVGElement>(MARK_POOL_CAPACITY),
		circle: createNodePool<SVGElement>(MARK_POOL_CAPACITY),
		badge: createNodePool<SVGElement>(MARK_POOL_CAPACITY),
	};

	return {
		acquire(kind: MarkNodeKind): SVGElement | null {
			const node = pools[kind].acquire();
			if (node && node.hasAttribute("display")) {
				node.removeAttribute("display");
			}
			return node;
		},

		release(kind: MarkNodeKind, node: SVGElement): boolean {
			// A parked node keeps its parent layer, so it has to stop answering the
			// selectors the suites count marks with -- `[data-mark]` must match live
			// marks only. Removing an absent attribute is still a DOM write, hence
			// the guard.
			for (const name of STAMPS) {
				if (node.hasAttribute(name)) {
					node.removeAttribute(name);
				}
			}

			// SVG elements do not honour the `hidden` property, so hiding a parked
			// node has to go through the presentation attribute.
			node.setAttribute("display", "none");

			// A badge holds caller-supplied markup, which must not survive into
			// whichever mark reuses the node next.
			if (kind === "badge") {
				node.textContent = "";
			}

			return pools[kind].release(node);
		},

		drain(): void {
			for (const kind of KINDS) {
				const drained = pools[kind].drain();
				for (const node of drained) {
					node.remove();
				}
			}
		},
	};
}
