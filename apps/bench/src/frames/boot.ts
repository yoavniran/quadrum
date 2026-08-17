/**
 * Shared boot for the per-adapter frame pages.
 *
 * Each subject runs inside its own same-origin iframe, and each frame page
 * imports exactly ONE adapter. That is the whole point: the two libraries'
 * stylesheets are not merely unmatched in the other's document, they are
 * absent from it. Selector matching, style recalc and the cascade are
 * per-document, so neither subject can pay a cost created by the other's CSS.
 *
 * Running the adapter *inside* the frame (rather than only parking its host
 * there) also keeps `document` -- which both libraries reach for globally when
 * creating elements -- pointing at the frame's own document. Elements are
 * therefore never created in one document and adopted into another, which is
 * work no real consumer does.
 */

import "../adapters/shared/board-frame.css";
import type { AdapterFactory, BenchFrameWindow } from "../core/types";

/**
 * Publish this frame's adapter to the parent harness.
 * Called by each frame entry after it has imported its one adapter.
 */
export function installFrame(factory: AdapterFactory): void {
	document.documentElement.setAttribute("data-bench-frame", factory.id);
	(window as BenchFrameWindow).__benchFrame = { factory };
}
