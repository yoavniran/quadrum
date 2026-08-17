/**
 * Parity assertions run before every timed region.
 */

import type { Assertion, BoardAdapter } from "./types";

/**
 * Assert that two adapters are in parity before a timed region.
 * Returns one Assertion per check; even passing assertions record observed values
 * so the run is auditable.
 */
export function assertParity(a: BoardAdapter, b: BoardAdapter): Assertion[] {
	const assertions: Assertion[] = [];

	// Check 1: equal piece count
	const aPieces = a.pieceElements().length;
	const bPieces = b.pieceElements().length;
	assertions.push({
		label: "equal piece count",
		passed: aPieces === bPieces,
		detail: `a: ${aPieces}, b: ${bPieces}`,
	});

	// Check 2: board boxes match within 0.5px
	const aRect = a.host.getBoundingClientRect();
	const bRect = b.host.getBoundingClientRect();
	const widthDiff = Math.abs(aRect.width - bRect.width);
	const heightDiff = Math.abs(aRect.height - bRect.height);
	assertions.push({
		label: "board boxes match within 0.5px",
		passed: widthDiff <= 0.5 && heightDiff <= 0.5,
		detail: `width diff: ${widthDiff.toFixed(2)}px, height diff: ${heightDiff.toFixed(2)}px`,
	});

	// Check 3: identical piece background-size
	const aPieceEl = a.pieceElements()[0];
	const bPieceEl = b.pieceElements()[0];
	if (aPieceEl && bPieceEl) {
		// Each subject lives in its own frame, so resolve computed style
		// through the element's OWN view rather than the parent's.
		const aStyle = styleOf(aPieceEl);
		const bStyle = styleOf(bPieceEl);
		const aSize = aStyle.backgroundSize;
		const bSize = bStyle.backgroundSize;
		assertions.push({
			label: "identical piece background-size",
			passed: aSize === bSize,
			detail: `a: ${aSize}, b: ${bSize}`,
		});
	} else {
		assertions.push({
			label: "identical piece background-size",
			passed: true,
			detail: "no pieces",
		});
	}

	// Check 4: coordinates hidden on both or shown on both
	const aCoords = a.host.querySelectorAll("coords, .cg-wrap coords").length;
	const bCoords = b.host.querySelectorAll("coords, .cg-wrap coords").length;
	const coordsParity =
		(aCoords === 0 && bCoords === 0) || (aCoords > 0 && bCoords > 0);
	assertions.push({
		label: "coordinates parity",
		passed: coordsParity,
		detail: `a: ${aCoords}, b: ${bCoords}`,
	});

	return assertions;
}

/**
 * Count the total number of DOM elements under an adapter's host.
 */
export function elementCount(adapter: BoardAdapter): number {
	return adapter.host.querySelectorAll("*").length;
}

/**
 * Create an assertion comparing an observed count to an expected count.
 */
export function countAssertion(
	label: string,
	actual: number,
	expected: number,
): Assertion {
	return {
		label,
		passed: actual === expected,
		detail: `actual: ${actual}, expected: ${expected}`,
	};
}

/**
 * Check if all assertions passed.
 */
export function allPassed(assertions: readonly Assertion[]): boolean {
	return assertions.every((a) => a.passed);
}

/**
 * Computed style resolved via the element's own document view.
 * Elements live in per-subject frames; the parent's `getComputedStyle` is the
 * wrong window for them.
 */
function styleOf(el: Element): CSSStyleDeclaration {
	const view = el.ownerDocument.defaultView;
	if (!view) {
		throw new Error("element has no defaultView; cannot resolve style");
	}
	return view.getComputedStyle(el);
}
