/**
 * Per-subject frame isolation.
 *
 * Each adapter lives in its own same-origin iframe, created once and reused
 * for every repetition. Two properties matter and both are load-bearing:
 *
 * 1. Separate documents mean separate style engines. One library's stylesheet
 *    structurally cannot influence the other's selector matching or style
 *    recalc, so a CSS change on one side can never move the other's number.
 *
 * 2. Both frames stay alive simultaneously. The harness therefore keeps its
 *    tight ABBA interleaving with no page loads and no stylesheet churn in the
 *    middle of a measurement -- which is what protects the comparison from
 *    monotonic drift (thermal, GC ramp, a neighbouring process). Isolating by
 *    running the subjects on separate pages, or by tearing styles down between
 *    them, would have traded a contamination risk for a drift bias.
 *
 * Same-origin means the parent reaches into each frame by direct property
 * access: no postMessage, no serialization, and one shared `performance.now()`
 * timebase across both frames.
 */

import type { AdapterFactory, AdapterId, BenchFrameWindow } from "./types";
import { DEFAULT_ORDER } from "../adapters/registry";

const FRAME_PAGES: Readonly<Record<AdapterId, string>> = {
	quadrum: "/frame-quadrum.html",
	chessground: "/frame-chessground.html",
};

export interface BenchFrame {
	readonly id: AdapterId;
	readonly iframe: HTMLIFrameElement;
	readonly window: Window;
	readonly document: Document;
	/** The adapter factory, loaded and owned by this frame. */
	readonly factory: AdapterFactory;
	/**
	 * Convert a point in this frame's client space to top-level viewport
	 * coordinates.
	 *
	 * `getBoundingClientRect()` inside an iframe is relative to that frame's
	 * own viewport, but CDP `Input.dispatchMouseEvent` takes top-viewport
	 * coordinates. Anything driving real browser input must go through here or
	 * it lands at the wrong place by the iframe's offset.
	 */
	toViewport(point: { x: number; y: number }): { x: number; y: number };
}

export type BenchFrames = ReadonlyMap<AdapterId, BenchFrame>;

let framesPromise: Promise<BenchFrames> | null = null;

/**
 * Create (once) and return the per-adapter frames, mounted into `container`.
 * Idempotent: later calls return the same frames regardless of the container.
 */
export function ensureFrames(container: HTMLElement): Promise<BenchFrames> {
	if (!framesPromise) {
		framesPromise = createFrames(container).catch((error: unknown) => {
			// Never cache a failed boot: a transient load error would otherwise
			// poison every subsequent run in this page.
			framesPromise = null;
			throw error;
		});
	}
	return framesPromise;
}

async function createFrames(container: HTMLElement): Promise<BenchFrames> {
	const frames = new Map<AdapterId, BenchFrame>();

	// Booted in parallel, then awaited together -- neither subject's frame gets
	// a warmer or colder browser than the other.
	const booted = await Promise.all(
		DEFAULT_ORDER.map((id) => bootFrame(id, container)),
	);

	for (const frame of booted) {
		frames.set(frame.id, frame);
	}

	return frames;
}

async function bootFrame(
	id: AdapterId,
	container: HTMLElement,
): Promise<BenchFrame> {
	const iframe = document.createElement("iframe");
	iframe.className = "bench-subject-frame";
	iframe.dataset.adapter = id;
	iframe.setAttribute("title", `${id} subject frame`);
	// No sandbox attribute: sandboxing would give the frame an opaque origin,
	// and the parent must reach into it directly to drive the adapter.
	iframe.src = FRAME_PAGES[id];

	const loaded = new Promise<void>((resolve, reject) => {
		iframe.addEventListener("load", () => resolve(), { once: true });
		iframe.addEventListener(
			"error",
			() => reject(new Error(`frame failed to load: ${FRAME_PAGES[id]}`)),
			{ once: true },
		);
	});

	container.appendChild(iframe);
	await loaded;

	const frameWindow = iframe.contentWindow as BenchFrameWindow | null;
	const frameDocument = iframe.contentDocument;

	if (!frameWindow || !frameDocument) {
		throw new Error(`frame ${id} has no same-origin document`);
	}

	// The module script may still be evaluating when `load` fires for the
	// document, so wait for the entry to publish its factory.
	const factory = await waitForFactory(id, frameWindow);

	// Applied from here rather than in the frame HTML so both frames are
	// guaranteed identical by construction, not by two files agreeing.
	frameDocument.documentElement.style.margin = "0";
	frameDocument.body.style.margin = "0";

	return {
		id,
		iframe,
		window: frameWindow,
		document: frameDocument,
		factory,
		toViewport(point) {
			const rect = iframe.getBoundingClientRect();
			return { x: rect.left + point.x, y: rect.top + point.y };
		},
	};
}

const FACTORY_TIMEOUT_MS = 10_000;

async function waitForFactory(
	id: AdapterId,
	frameWindow: BenchFrameWindow,
): Promise<AdapterFactory> {
	const deadline = performance.now() + FACTORY_TIMEOUT_MS;

	while (!frameWindow.__benchFrame) {
		if (performance.now() > deadline) {
			throw new Error(
				`frame ${id} did not install __benchFrame within ${FACTORY_TIMEOUT_MS}ms`,
			);
		}
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
	}

	const factory = frameWindow.__benchFrame.factory;

	// A frame loading the wrong adapter would silently benchmark one library
	// against itself, which is the single most damaging failure this file can
	// have. Fail loudly instead.
	if (factory.id !== id) {
		throw new Error(
			`frame ${id} loaded adapter "${factory.id}" -- frame entries are crossed`,
		);
	}

	return factory;
}

/**
 * Get one frame, or throw. Frames are created together, so a miss is a bug
 * rather than a condition to recover from.
 */
export function getFrame(frames: BenchFrames, id: AdapterId): BenchFrame {
	const frame = frames.get(id);
	if (!frame) {
		throw new Error(`no frame for adapter: ${id}`);
	}
	return frame;
}
