import { fenToPieces, premoveTargets } from "quadrum";
import type { Color, Square, Targets } from "quadrum";

export interface TargetOptions {
	chess960?: boolean;
}

/**
 * Destinations for every piece of `side`, keyed by origin.
 *
 * quadrum is rules-agnostic: it never computes where a piece may go, it only
 * draws what it is handed. A real application passes legal moves from a rules
 * engine; this demo has no engine, so it uses the library's own piece-mobility
 * table as a stand-in. That is not chess legality — it ignores check, pins and
 * turn order — but it is enough to exercise the targeted-move path, and it is
 * exactly the table a premove uses.
 */
export function buildTargets(placement: string, side: Color, opts: TargetOptions = {}): Targets {
	const pieces = fenToPieces(placement);
	const targets: Targets = new Map();

	for (const [square, piece] of pieces) {
		if (piece.color !== side) continue;
		const dests = premoveTargets(pieces, square as Square, { chess960: opts.chess960 });
		if (dests.length) {
			targets.set(square as Square, dests);
		}
	}

	return targets;
}
