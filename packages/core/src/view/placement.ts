// Eliminates DOM read-back of el.style.transform and el.dataset.square.
// Under 4x Chromium throttle, a style.transform read costs ~28us per 32-element pass
// because the getter must serialize the inline style; a WeakMap lookup is ~0.2us.
// The write-guarding comparison is worth keeping, but read-avoidance must be JS-side.

export interface Placement {
	square: string | null;
	transform: string | null;
}

const placements = new WeakMap<HTMLElement, Placement>();

function recordFor(el: HTMLElement): Placement {
	let record = placements.get(el);
	if (!record) {
		record = { square: null, transform: null };
		placements.set(el, record);
	}
	return record;
}

/** Writes `data-square` only when it differs from what we last wrote. */
export function setSquareAttr(el: HTMLElement, square: string): void {
	const record = recordFor(el);
	if (record.square === square) {
		return;
	}
	el.dataset.square = square;
	record.square = square;
}

/** Removes `data-square` and records that the element now has none. */
export function clearSquareAttr(el: HTMLElement): void {
	const record = recordFor(el);
	if (record.square === null) {
		return;
	}
	el.removeAttribute("data-square");
	record.square = null;
}

/** Writes `style.transform` only when it differs from what we last wrote. */
export function setTransform(el: HTMLElement, transform: string): void {
	const record = recordFor(el);
	if (record.transform === transform) {
		return;
	}
	el.style.transform = transform;
	record.transform = transform;
}
