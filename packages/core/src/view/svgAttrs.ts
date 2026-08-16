// Attribute mirroring for SVG elements. The mark render path writes many attributes per
// arrow per tick and currently guards each one with getAttribute. That read is a DOM
// crossing, and on this path the value has almost always genuinely changed, so the guard
// buys nothing and costs a crossing. Mirroring the last value written in JS turns the
// guard into a Map.get.

const ATTRS = Symbol("quadrum.attrs");

interface Mirrored {
	[ATTRS]?: Map<string, string | null>;
}

function getMirror(el: SVGElement): Map<string, string | null> {
	const mirrored = el as unknown as Mirrored;
	if (!mirrored[ATTRS]) {
		mirrored[ATTRS] = new Map();
	}
	return mirrored[ATTRS];
}

export function setAttr(el: SVGElement, name: string, value: string): void {
	const mirror = getMirror(el);
	const cached = mirror.get(name);
	if (cached === value) {
		return;
	}
	el.setAttribute(name, value);
	mirror.set(name, value);
}

export function removeAttr(el: SVGElement, name: string): void {
	const mirror = getMirror(el);
	const cached = mirror.get(name);
	if (cached === null) {
		return;
	}
	el.removeAttribute(name);
	mirror.set(name, null);
}

export function forgetAttrs(el: SVGElement): void {
	const mirrored = el as unknown as Mirrored;
	delete mirrored[ATTRS];
}
