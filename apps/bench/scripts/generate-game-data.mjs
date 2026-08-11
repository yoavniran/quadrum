/**
 * Generate `apps/bench/src/data/game.ts` from a PGN file of real games.
 *
 * This bench app is a RENDER workload, not a legal chess engine. It must not
 * take a chess-rules dependency (chess.js is only for code generation, resolved
 * at the CALLER's directory). What matters for a renderer is DOM churn per
 * update, not legality. Real games provide realistic move distances, capture
 * cadence, and special moves (castling, promotion) — far better than a
 * synthetic seeded generator that teleported pieces and produced no special moves.
 *
 * Regenerate from any directory that has chess.js installed (chess.js resolves
 * against the caller's cwd, never against this repo):
 *   node apps/bench/scripts/generate-game-data.mjs \
 *     apps/bench/scripts/source-games.pgn \
 *     apps/bench/src/data/game.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

// Resolve chess.js from the caller's directory (quadrum doesn't have it)
const require = createRequire(pathToFileURL(process.cwd() + "/"));
const { Chess } = require("chess.js");

const [pgnPath, outputPath] = process.argv.slice(2);

if (!pgnPath || !outputPath) {
	console.error("Usage: node generate-game-data.mjs <pgn-path> <output-ts-path>");
	process.exit(1);
}

// Read and parse the PGN
const pgnText = readFileSync(pgnPath, "utf-8");
const games = pgnText.split(/\n(?=\[Event )/);

if (games.length !== 3) {
	throw new Error(`Expected 3 games, got ${games.length}`);
}

// Segment definitions: (label, max half-moves)
const segments = [
	{ label: "Kasparov–Topalov, Hoogovens 1999", maxHalfMoves: 87 },
	{ label: "Kasparov–Morozevich, Astana 2001", maxHalfMoves: 86 },
	{ label: "Karpov–Kasparov, World Championship 1990 (first 27)", maxHalfMoves: 27 },
];

const GAME_SEGMENTS = [];
const positions = [];
let totalHalfMoves = 0;

for (let gameIdx = 0; gameIdx < games.length; gameIdx++) {
	const chess = new Chess();
	chess.loadPgn(games[gameIdx].trim());

	const moves = chess.history({ verbose: true });
	const segment = segments[gameIdx];
	const halfMovesToUse = Math.min(moves.length, segment.maxHalfMoves);

	GAME_SEGMENTS.push({
		label: segment.label,
		halfMoves: halfMovesToUse,
	});

	// Replay each half-move and emit a position
	const gameChess = new Chess();
	for (let i = 0; i < halfMovesToUse; i++) {
		const move = moves[i];
		gameChess.move(move.san);

		const fen = gameChess.fen();
		const placement = fen.split(" ")[0]; // FEN placement field only
		const lastMove = [move.from, move.to];
		// sideToMove AFTER the move: if move.color is 'b', it's white's turn now
		const sideToMove = move.color === "b" ? "white" : "black";

		positions.push({
			placement,
			lastMove,
			sideToMove,
		});
	}

	totalHalfMoves += halfMovesToUse;
}

if (totalHalfMoves !== 200) {
	throw new Error(`Expected 200 total half-moves, got ${totalHalfMoves}`);
}

// Generate the TypeScript file
const tsCode = `/**
 * Real-game position replay workload: three classical games spliced to 200 half-moves.
 *
 * Games:
 * 1. Kasparov–Topalov, Hoogovens 1999 (Kasparov's Immortal) — all 87 half-moves
 * 2. Kasparov–Morozevich, Astana 2001 — all 86 half-moves (includes promotions and castling)
 * 3. Karpov–Kasparov, World Championship 1990 (KK5) — first 27 half-moves only
 *
 * This replaces the old seeded-LCG position generator. Real games provide realistic move
 * distances, capture cadence, castling and promotion in the workload — the LCG produced
 * teleporting pieces and no special moves, badly understating real-world DOM churn.
 *
 * A segment boundary (start of a new game) is a board-reset diff — the next entry's
 * placement differs completely from the previous one, exactly like a real app loading a
 * new game.
 *
 * Regenerate with scripts/generate-game-data.mjs from scripts/source-games.pgn — run it
 * from any directory that has chess.js installed; see that script's header.
 */

import type { PositionUpdate } from "../core/types";

export const GAME_SEGMENTS = [
${GAME_SEGMENTS.map((seg) => `	{ label: "${seg.label}", halfMoves: ${seg.halfMoves} },`).join("\n")}
] as const;

export const GAME_POSITIONS: readonly PositionUpdate[] = [
${positions.map((p) => `	{ placement: "${p.placement}", lastMove: ["${p.lastMove[0]}", "${p.lastMove[1]}"], sideToMove: "${p.sideToMove}" },`).join("\n")}
];

export const GAME_POSITION_COUNT = GAME_POSITIONS.length;
`;

writeFileSync(outputPath, tsCode);
console.log(`Generated ${outputPath} with ${positions.length} positions`);
