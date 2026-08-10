/**
 * Registry of all board adapters.
 */

import { quadrumAdapter } from "./quadrum/index";
import { chessgroundAdapter } from "./chessground/index";
import type { AdapterFactory, AdapterId } from "../core/types";

import "./shared/board-frame.css";

/**
 * All available adapters.
 */
export const ADAPTERS: readonly AdapterFactory[] = [
	quadrumAdapter,
	chessgroundAdapter,
];

/**
 * All available adapter IDs.
 */
export const ADAPTER_IDS: readonly AdapterId[] = ADAPTERS.map((a) => a.id);

/**
 * Get an adapter by ID.
 * Throws an Error if the ID is not found.
 */
export function getAdapter(id: AdapterId): AdapterFactory {
	const adapter = ADAPTERS.find((a) => a.id === id);
	if (!adapter) {
		throw new Error(
			`unknown adapter: ${id}. Known: ${ADAPTER_IDS.join(", ")}`,
		);
	}
	return adapter;
}

/**
 * Default order of adapters for interleaving.
 * The harness runs ABBA interleaving, so this is only the first pass's order.
 */
export const DEFAULT_ORDER: readonly AdapterId[] = [
	"quadrum",
	"chessground",
];
