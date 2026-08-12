import type { BoardState } from "../options";
import type { Color } from "../types";

export interface BoardDom {
	wrap: HTMLElement;
	board: HTMLElement;
	marks: SVGSVGElement;
	/** The over-the-pieces half of the marks layer -- arrowheads only. An arrow
	 *  straddles the piece layer: its tail hides behind the piece it starts from
	 *  while its head lands on top of the piece it points at, and one SVG cannot
	 *  be on both sides of the pieces at once. */
	heads: SVGSVGElement;
	badges: SVGSVGElement;
	ranks: HTMLElement;
	files: HTMLElement;
	overlay: HTMLElement;
	marksOrNull: SVGSVGElement | null;
	headsOrNull: SVGSVGElement | null;
	badgesOrNull: SVGSVGElement | null;
	ranksOrNull: HTMLElement | null;
	filesOrNull: HTMLElement | null;
	overlayOrNull: HTMLElement | null;
}

interface CoordsMemo {
	/** The orientation the labels in the DOM were built for, or `null` while no
	 *  labels have ever been built. This is deliberately not the requested
	 *  orientation: a board with coordinates off builds nothing, so it must
	 *  remember that its labels are still owed rather than that they are current. */
	builtOrientation: Color | null;
	coordinates: boolean;
}

const coordsMemos = new WeakMap<BoardDom, CoordsMemo>();

// Slot order: board, marks, heads, badges, ranks, files, overlay
const slotOrder = ["marks", "heads", "badges", "ranks", "files", "overlay"] as const;
type LayerKey = typeof slotOrder[number];

interface LayerState {
	marks: SVGSVGElement | null;
	heads: SVGSVGElement | null;
	badges: SVGSVGElement | null;
	ranks: HTMLElement | null;
	files: HTMLElement | null;
	overlay: HTMLElement | null;
}

function createMarksLayer(state: LayerState, wrap: HTMLElement): SVGSVGElement {
	const marks = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	marks.setAttribute("class", "qd-marks");
	marks.setAttribute("viewBox", "0 0 800 800");
	marks.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "defs"));
	insertLayerAtSlot(state, wrap, marks, "marks");
	return marks;
}

function createHeadsLayer(state: LayerState, wrap: HTMLElement): SVGSVGElement {
	const heads = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	heads.setAttribute("class", "qd-heads");
	heads.setAttribute("viewBox", "0 0 800 800");
	insertLayerAtSlot(state, wrap, heads, "heads");
	return heads;
}

function createBadgesLayer(state: LayerState, wrap: HTMLElement): SVGSVGElement {
	const badges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	badges.setAttribute("class", "qd-badges");
	badges.setAttribute("viewBox", "0 0 800 800");
	insertLayerAtSlot(state, wrap, badges, "badges");
	return badges;
}

function createRanksLayer(state: LayerState, wrap: HTMLElement): HTMLElement {
	const ranks = document.createElement("qd-coords");
	ranks.setAttribute("class", "ranks");
	insertLayerAtSlot(state, wrap, ranks, "ranks");
	return ranks;
}

function createFilesLayer(state: LayerState, wrap: HTMLElement): HTMLElement {
	const files = document.createElement("qd-coords");
	files.setAttribute("class", "files");
	insertLayerAtSlot(state, wrap, files, "files");
	return files;
}

function createOverlayLayer(state: LayerState, wrap: HTMLElement): HTMLElement {
	const overlay = document.createElement("qd-overlay");
	insertLayerAtSlot(state, wrap, overlay, "overlay");
	return overlay;
}

/** Insert a layer before the first later slot that exists, or append if none exist.
 *  Layers arrive in whatever order the board happens to need them, so the slot
 *  table -- not the arrival order -- is what fixes paint order. */
function insertLayerAtSlot(state: LayerState, wrap: HTMLElement, element: Element, slot: LayerKey): void {
	const slotIndex = slotOrder.indexOf(slot);

	// Find the first slot after this one that already exists
	for (let i = slotIndex + 1; i < slotOrder.length; i++) {
		const laterSlot = slotOrder[i];
		const laterElement = (state as Record<LayerKey, Element | null>)[laterSlot];
		if (laterElement && laterElement.parentNode === wrap) {
			wrap.insertBefore(element, laterElement);
			return;
		}
	}

	// No later slot exists, append at the end
	wrap.appendChild(element);
}

export function buildDom(container: HTMLElement): BoardDom {
	container.innerHTML = "";
	container.classList.add("qd-wrap");

	const board = document.createElement("qd-board");
	container.appendChild(board);

	// The slot table belongs to this board, not to the container element: a
	// container that is built twice has just had its children wiped above, so a
	// table shared by container would hand the second board the first one's
	// detached layers.
	const state: LayerState = { marks: null, heads: null, badges: null, ranks: null, files: null, overlay: null };

	return {
		wrap: container,
		board,
		get marks(): SVGSVGElement {
			if (!state.marks) {
				state.marks = createMarksLayer(state, container);
			}
			return state.marks;
		},
		get heads(): SVGSVGElement {
			if (!state.heads) {
				state.heads = createHeadsLayer(state, container);
			}
			return state.heads;
		},
		get badges(): SVGSVGElement {
			if (!state.badges) {
				state.badges = createBadgesLayer(state, container);
			}
			return state.badges;
		},
		get ranks(): HTMLElement {
			if (!state.ranks) {
				state.ranks = createRanksLayer(state, container);
			}
			return state.ranks;
		},
		get files(): HTMLElement {
			if (!state.files) {
				state.files = createFilesLayer(state, container);
			}
			return state.files;
		},
		get overlay(): HTMLElement {
			if (!state.overlay) {
				state.overlay = createOverlayLayer(state, container);
			}
			return state.overlay;
		},
		get marksOrNull(): SVGSVGElement | null {
			return state.marks ?? null;
		},
		get headsOrNull(): SVGSVGElement | null {
			return state.heads ?? null;
		},
		get badgesOrNull(): SVGSVGElement | null {
			return state.badges ?? null;
		},
		get ranksOrNull(): HTMLElement | null {
			return state.ranks ?? null;
		},
		get filesOrNull(): HTMLElement | null {
			return state.files ?? null;
		},
		get overlayOrNull(): HTMLElement | null {
			return state.overlay ?? null;
		},
	};
}

export function renderCoords(dom: BoardDom, state: BoardState): void {
	const memo = coordsMemos.get(dom);

	if (!state.coordinates) {
		if (memo && !memo.coordinates) {
			return;
		}
		// Labels are never built or rebuilt while they are off -- an orientation
		// flip on a coordinate-less board must stay free, and the memo keeps
		// owing the labels so that re-enabling still builds them for the
		// orientation in force at that point.
		dom.ranksOrNull?.classList.add("hidden");
		dom.filesOrNull?.classList.add("hidden");
		coordsMemos.set(dom, { builtOrientation: memo?.builtOrientation ?? null, coordinates: false });
		return;
	}

	if (memo && memo.coordinates && memo.builtOrientation === state.orientation) {
		return;
	}

	// Rebuild labels if orientation changed (or this is the first render with coordinates enabled).
	if (!memo || memo.builtOrientation !== state.orientation) {
		dom.ranks.innerHTML = "";
		dom.files.innerHTML = "";

		const rankLabels = state.orientation === "white" ? ["8", "7", "6", "5", "4", "3", "2", "1"] : ["1", "2", "3", "4", "5", "6", "7", "8"];
		const fileLabels = state.orientation === "white" ? ["a", "b", "c", "d", "e", "f", "g", "h"] : ["h", "g", "f", "e", "d", "c", "b", "a"];

		for (const label of rankLabels) {
			const el = document.createElement("qd-coord");
			el.textContent = label;
			dom.ranks.appendChild(el);
		}

		for (const label of fileLabels) {
			const el = document.createElement("qd-coord");
			el.textContent = label;
			dom.files.appendChild(el);
		}
	}

	if (!memo || !memo.coordinates) {
		dom.ranks.classList.remove("hidden");
		dom.files.classList.remove("hidden");
	}

	coordsMemos.set(dom, { builtOrientation: state.orientation, coordinates: true });
}

export function applyWrapState(dom: BoardDom, state: BoardState): void {
	if (state.locked) {
		dom.wrap.classList.remove("interactive");
	} else {
		dom.wrap.classList.add("interactive");
		// The overlay hosts the promotion picker, so an interactive board needs
		// it up front. `void` because the getter's whole job is its side effect,
		// and a bare property read is the kind of statement a minifier drops.
		void dom.overlay;
	}

	dom.wrap.dataset.orientation = state.orientation;
}

export function destroyDom(dom: BoardDom): void {
	dom.wrap.classList.remove("qd-wrap");
	delete dom.wrap.dataset.orientation;

	// Use peeks to avoid creating layers that don't exist yet
	while (dom.wrap.firstChild) {
		dom.wrap.removeChild(dom.wrap.firstChild);
	}
}
