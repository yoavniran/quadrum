// Pointer button → intent mapping. Right-click or shift + left-click means annotate;
// plain left-click means move. This rule is written once so both the 2D and 3D
// board agree on what each button does.

import type { PressKind } from "./gestures";

/** The part of a pointer event that decides what the press is for. */
export interface PointerButtonMap {
	button: number;
	shiftKey?: boolean;
	ctrlKey?: boolean;
}

/**
 * Map a pointer event's button and modifiers to an intent: move, mark, or ignore.
 * Returns "move" for plain left-click, "mark" for right-click or shift+left-click,
 * and null for buttons that should be ignored (middle, etc.).
 */
export function pointerIntent(press: PointerButtonMap): PressKind | null {
	if (press.button === 2) {
		// Right button: annotate
		return "mark";
	} else if (press.button === 0 && press.shiftKey) {
		// Left + shift: annotate
		return "mark";
	} else if (press.button === 0) {
		// Plain left: move
		return "move";
	}
	// Ignore middle button and anything else
	return null;
}
