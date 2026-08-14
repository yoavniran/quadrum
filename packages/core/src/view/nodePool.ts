export interface NodePool<T extends Element> {
	/** An idle node, or null when the pool is empty. */
	acquire(): T | null;
	/** Returns true if the node was kept; false when the pool is at capacity and
	 *  the caller must dispose of it. */
	release(node: T): boolean;
	/** Returns every idle node and empties the pool. */
	drain(): T[];
	readonly size: number;
}

export function createNodePool<T extends Element>(capacity: number): NodePool<T> {
	if (!Number.isInteger(capacity) || capacity <= 0) {
		throw new RangeError("capacity must be a positive integer");
	}

	const idle: T[] = [];

	return {
		acquire(): T | null {
			return idle.pop() ?? null;
		},
		release(node: T): boolean {
			// Bounds the leak if a wrapper skips unmount
			if (idle.length >= capacity) {
				return false;
			}
			if (!idle.includes(node)) {
				idle.push(node);
			}
			return true;
		},
		drain(): T[] {
			return idle.splice(0);
		},
		get size(): number {
			return idle.length;
		},
	};
}
