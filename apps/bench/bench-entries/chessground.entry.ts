/**
 * Realistic tree-shaking entry for bundle measurement.
 * Mirror of quadrum.entry.ts, exercising the same adapter surface via chessground.
 * This file is bundled in Vite lib mode purely to measure realistic shipped bytes;
 * it is never imported by the app.
 */

import { Chessground } from "chessground";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";

/**
 * Mount a board and exercise the adapter surface.
 * Returns a teardown closure.
 */
export function mountAndDrive(host: HTMLElement): () => void {
	const api = Chessground(
		host,
		{
			fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			orientation: "white",
			coordinates: true,
			animation: { enabled: true, duration: 200 },
			draggable: { enabled: true },
			selectable: { enabled: true },
			movable: { free: true },
			drawable: { enabled: true },
		} satisfies Config,
	);

	api.set({
		fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
		turnColor: "white",
	});

	api.setAutoShapes([
		{
			orig: "e2",
			dest: "e4",
			brush: "green",
		} satisfies DrawShape,
	]);

	const fen = api.getFen();
	if (fen.length === 0) {
		throw new Error("unexpected: empty FEN");
	}

	return () => {
		api.destroy();
	};
}
