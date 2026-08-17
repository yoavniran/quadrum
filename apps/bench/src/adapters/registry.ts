/**
 * Adapter metadata for the parent page.
 *
 * This file deliberately imports NO adapter module. Each adapter is loaded by
 * its own frame (see src/frames/), and importing one here would pull that
 * library's code and stylesheet back into the parent bundle -- which is
 * exactly the coupling the frame isolation exists to remove. The parent gets
 * the live factories from `ensureFrames()`, never from here.
 */

import type { AdapterId } from "../core/types";

export const ADAPTER_IDS: readonly AdapterId[] = ["quadrum", "chessground"];

/**
 * Default order of adapters for interleaving.
 * The harness runs ABBA interleaving, so this is only the first pass's order.
 */
export const DEFAULT_ORDER: readonly AdapterId[] = [
	"quadrum",
	"chessground",
];
