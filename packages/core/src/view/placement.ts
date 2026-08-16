// Eliminates DOM read-back of el.style.transform and el.dataset.square.
// Under 4x Chromium throttle, a style.transform read costs ~28us per 32-element pass
// because the getter must serialize the inline style; a WeakMap lookup is ~0.2us.
// The write-guarding comparison is worth keeping, but read-avoidance must be JS-side.

export interface Placement {
	square: string | null;
	transform: string | null;
	/** Last translate written, as numbers. NaN means "no translate written yet",
	 *  and compares false against everything, so the first write always lands. */
	tx: number;
	ty: number;
}

// Kept on the element under a private symbol rather than in a module-level
// WeakMap. Both are collected with the node, but a WeakMap read hashes the key
// on every lookup and the piece pass alone does one per piece per write --
// upwards of 64 an update, none of which is a property access the engine can
// inline. The symbol keeps it invisible to consumers, to `for...in` and to
// JSON, and cloneNode does not copy it, so a clone correctly re-derives.
const RECORD = Symbol("quadrum.placement");

interface RecordCarrier {
	[RECORD]?: Placement;
}

function recordFor(el: HTMLElement): Placement {
	const carrier = el as HTMLElement & RecordCarrier;
	let record = carrier[RECORD];
	if (!record) {
		record = { square: null, transform: null, tx: NaN, ty: NaN };
		carrier[RECORD] = record;
	}
	return record;
}

function writeSquareAttr(el: HTMLElement, record: Placement, square: string): void {
	if (record.square === square) {
		return;
	}
	el.dataset.square = square;
	record.square = square;
}

/** Writes `data-square` only when it differs from what we last wrote. */
export function setSquareAttr(el: HTMLElement, square: string): void {
	writeSquareAttr(el, recordFor(el), square);
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
	// The numeric form no longer describes the element. Left stale, a later
	// setTranslate to the coordinates this string happens to have replaced would
	// compare equal and skip a write the element genuinely needs.
	record.tx = NaN;
	record.ty = NaN;
}

/**
 * Writes a `translate(x%, y%)` only when the coordinates differ from what we
 * last wrote.
 *
 * Every transform this library writes has that one shape, and the string form
 * forced the caller to build it before the guard could reject it -- 32 template
 * strings per update on the piece pass alone, almost all of them immediately
 * discarded by a comparison that two number checks answer for free. The string
 * is now built only on the writes that actually happen.
 */
export function setTranslate(el: HTMLElement, x: number, y: number): void {
	writeTranslate(el, recordFor(el), x, y);
}

function writeTranslate(el: HTMLElement, record: Placement, x: number, y: number): void {
	if (record.tx === x && record.ty === y) {
		return;
	}
	const transform = `translate(${x * 100}%, ${y * 100}%)`;
	el.style.transform = transform;
	record.tx = x;
	record.ty = y;
	// Keep the string form authoritative too, so a setTransform writing the same
	// translate is still elided.
	record.transform = transform;
}

/**
 * The two writes that always travel together, sharing one record lookup.
 *
 * Placing a piece sets `data-square` and a translate, and doing that through
 * the two single-purpose functions looked the record up twice for the same
 * element -- 64 lookups an update on the piece pass, half of them redundant.
 */
export function placeSquare(el: HTMLElement, square: string, x: number, y: number): void {
	const record = recordFor(el);
	writeSquareAttr(el, record, square);
	writeTranslate(el, record, x, y);
}
