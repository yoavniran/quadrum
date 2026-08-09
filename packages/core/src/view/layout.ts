import type { BoardState } from "../options";

export interface BoardDom {
	wrap: HTMLElement;
	board: HTMLElement;
	marks: SVGSVGElement;
	badges: SVGSVGElement;
	ranks: HTMLElement;
	files: HTMLElement;
	overlay: HTMLElement;
}

export function buildDom(container: HTMLElement): BoardDom {
	container.innerHTML = "";
	container.classList.add("qd-wrap");

	const board = document.createElement("qd-board");
	const marks = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	marks.setAttribute("class", "qd-marks");
	marks.setAttribute("viewBox", "0 0 800 800");
	marks.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "defs"));

	const badges = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	badges.setAttribute("class", "qd-badges");
	badges.setAttribute("viewBox", "0 0 800 800");

	const ranks = document.createElement("qd-coords");
	ranks.setAttribute("class", "ranks");

	const files = document.createElement("qd-coords");
	files.setAttribute("class", "files");

	const overlay = document.createElement("qd-overlay");

	container.appendChild(board);
	container.appendChild(marks);
	container.appendChild(badges);
	container.appendChild(ranks);
	container.appendChild(files);
	container.appendChild(overlay);

	return { wrap: container, board, marks, badges, ranks, files, overlay };
}

export function renderCoords(dom: BoardDom, state: BoardState): void {
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

	if (state.coordinates) {
		dom.ranks.classList.remove("hidden");
		dom.files.classList.remove("hidden");
	} else {
		dom.ranks.classList.add("hidden");
		dom.files.classList.add("hidden");
	}
}

export function applyWrapState(dom: BoardDom, state: BoardState): void {
	if (state.locked) {
		dom.wrap.classList.remove("interactive");
	} else {
		dom.wrap.classList.add("interactive");
	}

	dom.wrap.dataset.orientation = state.orientation;
}

export function destroyDom(dom: BoardDom): void {
	dom.wrap.classList.remove("qd-wrap");
	delete dom.wrap.dataset.orientation;

	while (dom.wrap.firstChild) {
		dom.wrap.removeChild(dom.wrap.firstChild);
	}
}
