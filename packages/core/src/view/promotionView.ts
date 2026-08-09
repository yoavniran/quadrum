import type { Role, Color, Square } from "../types";
import type { BoardDom } from "./layout";
import { squareToPoint } from "../model/squares";

export interface PromotionRequest { from: Square; to: Square; color: Color }

export const PROMOTION_ROLES: readonly Role[] = ["queen", "rook", "bishop", "knight"];

const listenerMap = new WeakMap<HTMLElement, EventListener>();

export function renderPromotion(
	dom: BoardDom,
	req: PromotionRequest | null,
	orientation: Color,
	onPick: (role: Role | null) => void,
): void {
	// Clear existing promotion picker and listeners
	const existing = dom.overlay.querySelector("qd-promotion") as HTMLElement | null;
	if (existing) {
		const backdrop = existing.querySelector("[data-backdrop]") as HTMLElement | null;
		if (backdrop) {
			const handler = listenerMap.get(backdrop);
			if (handler) {
				backdrop.removeEventListener("click", handler);
			}
		}
		const cells = existing.querySelectorAll("[data-role]");
		for (const cell of cells) {
			const handler = listenerMap.get(cell as HTMLElement);
			if (handler) {
				(cell as HTMLElement).removeEventListener("click", handler);
			}
		}
		dom.overlay.removeChild(existing);
	}

	if (!req) {
		return;
	}

	const picker = document.createElement("qd-promotion");
	const backdrop = document.createElement("div");
	backdrop.dataset.backdrop = "";

	const point = squareToPoint(req.to, orientation);

	// Determine if we're on the top or bottom of the board
	const isTopRow = point.y < 4;

	// Create cells moving toward the middle
	for (let i = 0; i < 4; i++) {
		const role = PROMOTION_ROLES[i];
		const cell = document.createElement("qd-piece");
		cell.classList.add(req.color, role);
		cell.dataset.role = role;

		// Position cells: if top row, go down; if bottom row, go up
		const cellY = isTopRow ? point.y + i : point.y - i;

		cell.style.position = "absolute";
		cell.style.top = "0";
		cell.style.left = "0";
		cell.style.width = "12.5%";
		cell.style.height = "12.5%";
		cell.style.transform = `translate(${point.x * 100}%, ${cellY * 100}%)`;

		const cellHandler = (e: Event) => {
			onPick(role);
			e.stopPropagation();
		};
		listenerMap.set(cell, cellHandler);
		cell.addEventListener("click", cellHandler);

		picker.appendChild(cell);
	}

	const backdropHandler = () => {
		onPick(null);
	};
	listenerMap.set(backdrop, backdropHandler);
	backdrop.addEventListener("click", backdropHandler);
	picker.appendChild(backdrop);

	dom.overlay.appendChild(picker);
}
