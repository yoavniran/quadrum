/**
 * Deterministic arrow frames simulating engine top-3 lines.
 */

import type { BenchArrow } from "../core/types";
import { ALL_SQUARES } from "./squares";

/**
 * Generate 100 deterministic arrow frames using a seeded LCG.
 * Each frame holds exactly 3 arrows.
 */
export const ARROW_FRAMES: readonly (readonly BenchArrow[])[] = (() => {
	const frames: (readonly BenchArrow[])[] = [];
	let seed = 0x5eed;

	const lcg = (): number => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed;
	};

	const colors: readonly ("green" | "red" | "blue")[] = [
		"green",
		"red",
		"blue",
	];

	for (let frameIdx = 0; frameIdx < 100; frameIdx++) {
		const arrows: BenchArrow[] = [];
		for (let arrowIdx = 0; arrowIdx < 3; arrowIdx++) {
			let from: string;
			let to: string;

			do {
				from = ALL_SQUARES[(lcg() % ALL_SQUARES.length) as unknown as number];
				to = ALL_SQUARES[(lcg() % ALL_SQUARES.length) as unknown as number];
			} while (from === to);

			arrows.push({
				from: from as any,
				to: to as any,
				color: colors[arrowIdx],
			});
		}
		frames.push(arrows);
	}

	return frames;
})();

/**
 * The number of arrow frames.
 */
export const ARROW_FRAME_COUNT = ARROW_FRAMES.length;
