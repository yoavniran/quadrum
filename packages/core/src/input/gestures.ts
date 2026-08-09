import type { Square, Color, Point } from "../types";
import type { BoardDom } from "../view/layout";
import { clientToPoint, pointToSquare } from "../model/squares";
import { pointerIntent } from "./pointerIntent";

export type PressKind = "move" | "mark";

export interface GestureInfo {
	kind: PressKind;
	square: Square | null;
	point: Point;
	distance: number;
	event: PointerEvent;
}

export interface GestureHandlers {
	onPress(info: GestureInfo): void;
	onDrag(info: GestureInfo): void;
	onRelease(info: GestureInfo): void;
	onCancel(): void;
}

export interface GestureBinding {
	destroy(): void;
}

interface InternalBinding extends GestureBinding {
	_dom: BoardDom;
	_pressRect: DOMRect | null;
	_pressClientX: number;
	_pressClientY: number;
	_pressKind: PressKind | null;
	_pointerActive: boolean;
	_handlers: GestureHandlers;
	_getOrientation: () => Color;
	_attachDocumentListeners: () => void;
	_detachDocumentListeners: () => void;
	_cleanup: () => void;
}

export function bindGestures(
	dom: BoardDom,
	getOrientation: () => Color,
	handlers: GestureHandlers,
): GestureBinding {
	const binding: InternalBinding = {
		_dom: dom,
		_pressRect: null,
		_pressClientX: 0,
		_pressClientY: 0,
		_pressKind: null,
		_pointerActive: false,
		_handlers: handlers,
		_getOrientation: getOrientation,
		_attachDocumentListeners() {},
		_detachDocumentListeners() {},
		_cleanup() {},
		destroy() {},
	};

	const attachDocumentListeners = () => {
		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
		document.addEventListener("pointercancel", handlePointerCancel);
	};

	const detachDocumentListeners = () => {
		document.removeEventListener("pointermove", handlePointerMove);
		document.removeEventListener("pointerup", handlePointerUp);
		document.removeEventListener("pointercancel", handlePointerCancel);
	};

	const cleanup = () => {
		binding._pointerActive = false;
		binding._pressKind = null;
		binding._pressRect = null;
		detachDocumentListeners();
	};

	const handlePointerDown = (e: PointerEvent) => {
		if (e.isPrimary === false) return;

		// Classify the press: right-click or shift+left-click means annotate;
		// plain left-click means move.
		const intent = pointerIntent({ button: e.button, shiftKey: e.shiftKey });
		if (!intent) return; // Ignore other buttons

		binding._pressKind = intent;

		const rect = dom.board.getBoundingClientRect();
		const point = clientToPoint(e.clientX, e.clientY, rect);
		const square = pointToSquare(point.x, point.y, getOrientation());

		handlers.onPress({
			kind: binding._pressKind,
			square,
			point,
			distance: 0,
			event: e,
		});

		binding._pointerActive = true;
		binding._pressRect = rect;
		binding._pressClientX = e.clientX;
		binding._pressClientY = e.clientY;
		attachDocumentListeners();
	};

	const handlePointerMove = (e: PointerEvent) => {
		if (!binding._pointerActive || !binding._pressRect || binding._pressKind === null) return;

		const point = clientToPoint(e.clientX, e.clientY, binding._pressRect);
		const square = pointToSquare(point.x, point.y, getOrientation());

		const deltaX = e.clientX - binding._pressClientX;
		const deltaY = e.clientY - binding._pressClientY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		handlers.onDrag({
			kind: binding._pressKind,
			square,
			point,
			distance,
			event: e,
		});
	};

	const handlePointerUp = (e: PointerEvent) => {
		if (!binding._pointerActive || !binding._pressRect || binding._pressKind === null) return;

		const point = clientToPoint(e.clientX, e.clientY, binding._pressRect);
		const deltaX = e.clientX - binding._pressClientX;
		const deltaY = e.clientY - binding._pressClientY;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		handlers.onRelease({
			kind: binding._pressKind,
			square: pointToSquare(point.x, point.y, getOrientation()),
			point,
			distance,
			event: e,
		});

		cleanup();
	};

	const handlePointerCancel = () => {
		if (!binding._pointerActive) return;

		handlers.onCancel();
		cleanup();
	};

	const handleContextMenu = (e: Event) => {
		e.preventDefault();
	};

	dom.wrap.addEventListener("pointerdown", handlePointerDown);
	dom.wrap.addEventListener("contextmenu", handleContextMenu);

	binding._attachDocumentListeners = attachDocumentListeners;
	binding._detachDocumentListeners = detachDocumentListeners;
	binding._cleanup = cleanup;
	binding.destroy = () => {
		dom.wrap.removeEventListener("pointerdown", handlePointerDown);
		dom.wrap.removeEventListener("contextmenu", handleContextMenu);
		detachDocumentListeners();
	};

	return binding;
}

export function startExternalGesture(
	binding: GestureBinding,
	event: PointerEvent,
): void {
	const internal = binding as InternalBinding;

	// Read the board rect (caller has already handled the press)
	const rect = internal._dom.board.getBoundingClientRect();

	internal._pressRect = rect;
	internal._pressClientX = event.clientX;
	internal._pressClientY = event.clientY;
	internal._pointerActive = true;
	internal._pressKind = "move";
	internal._attachDocumentListeners();
}
