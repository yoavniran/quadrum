import type { Mark, Square } from "../types";
import type { BoardState } from "../options";
import { markKey } from "../view/marksView";

export interface MarkContext {
	state(): BoardState;
	setCurrent(mark: Mark | null): void;
	commit(marks: Mark[]): void;
}

export interface MarkModifiers {
	button: number;
	shiftKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

export function penForModifiers(mods: MarkModifiers): string {
	const modA = (mods.shiftKey || mods.ctrlKey) && mods.button === 2;
	const modB = mods.altKey || mods.metaKey;
	const index = (modA ? 1 : 0) + (modB ? 2 : 0);
	return ["green", "red", "blue", "yellow"][index]!;
}

export function toggleMark(marks: Mark[], next: Mark): Mark[] {
	const key = markKey(next);
	const existing = marks.findIndex((m) => markKey(m) === key);

	if (existing === -1) {
		// Not present: append
		return [...marks, next];
	}

	const existingMark = marks[existing]!;
	if ((existingMark.pen ?? "green") === (next.pen ?? "green")) {
		// Same pen: remove
		return marks.filter((_, i) => i !== existing);
	}

	// Different pen: replace in place (remove then append)
	const without = marks.filter((_, i) => i !== existing);
	return [...without, next];
}

export interface MarkController {
	press(square: Square | null, event: PointerEvent): void;
	drag(square: Square | null): void;
	release(square: Square | null): void;
	cancel(): void;
}

export function createMarkController(ctx: MarkContext): MarkController {
	let originSquare: Square | null = null;
	let originPen: string | null = null;

	return {
		press(square: Square | null, event: PointerEvent) {
			if (!ctx.state().marks.enabled) return;

			originSquare = square;
			originPen = penForModifiers({
				button: event.button,
				shiftKey: event.shiftKey,
				ctrlKey: event.ctrlKey,
				altKey: event.altKey,
				metaKey: event.metaKey,
			});

			if (originSquare !== null) {
				ctx.setCurrent({
					from: originSquare,
					pen: originPen,
				});
			}
		},

		drag(square: Square | null) {
			if (!ctx.state().marks.enabled || originSquare === null || originPen === null) return;

			if (square !== null && square !== originSquare) {
				// Arrow mark
				ctx.setCurrent({
					from: originSquare,
					to: square,
					pen: originPen,
				});
			} else {
				// Back to circle (or null if off board)
				ctx.setCurrent({
					from: originSquare,
					pen: originPen,
				});
			}
		},

		release(square: Square | null) {
			if (!ctx.state().marks.enabled || originSquare === null || originPen === null) return;

			let current: Mark | null = null;
			if (square !== null && square !== originSquare) {
				current = {
					from: originSquare,
					to: square,
					pen: originPen,
				};
			} else if (originSquare !== null) {
				current = {
					from: originSquare,
					pen: originPen,
				};
			}

			if (current) {
				const updated = toggleMark(ctx.state().marks.user, current);
				ctx.commit(updated);
			}

			ctx.setCurrent(null);
			originSquare = null;
			originPen = null;
		},

		cancel() {
			ctx.setCurrent(null);
			originSquare = null;
			originPen = null;
		},
	};
}
