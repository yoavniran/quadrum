/**
 * Realistic tree-shaking entry for bundle measurement.
 * Exercises the adapter surface a real app uses, not `export *`.
 * This file is bundled in Vite lib mode purely to measure realistic shipped bytes;
 * it is never imported by the app.
 */

import { createBoard, fenToPieces, INITIAL_PLACEMENT } from "quadrum";
import type { Square, Mark } from "quadrum";

/**
 * Mount a board and exercise the adapter surface.
 * Returns a teardown closure.
 */
export function mountAndDrive(host: HTMLElement): () => void {
	const board = createBoard(host, {
		position: INITIAL_PLACEMENT,
		orientation: "white",
		coordinates: true,
		animate: { enabled: true, duration: 200 },
		drag: { enabled: true },
		select: { enabled: true },
		moves: { free: true },
		marks: { enabled: true },
	});

	board.update({
		position: INITIAL_PLACEMENT,
		sideToMove: "white",
	});

	board.setAutoMarks([
		{
			from: "e2" as Square,
			to: "e4" as Square,
			pen: "green",
		} satisfies Mark,
	]);

	const pieceCount = fenToPieces(INITIAL_PLACEMENT).size;
	if (pieceCount === 0) {
		throw new Error("unexpected: empty position");
	}

	return () => {
		board.unmount();
	};
}
