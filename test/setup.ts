/**
 * jsdom does not implement PointerEvent. quadrum's input layer is pointer-only,
 * so tests need a constructible stand-in that carries the pointer fields the
 * library actually reads.
 */
if (typeof globalThis.PointerEvent === "undefined") {
	class PointerEventShim extends MouseEvent {
		readonly pointerId: number;
		readonly pointerType: string;
		readonly isPrimary: boolean;
		readonly width: number;
		readonly height: number;
		readonly pressure: number;

		constructor(type: string, params: PointerEventInit = {}) {
			super(type, params);
			this.pointerId = params.pointerId ?? 1;
			this.pointerType = params.pointerType ?? "mouse";
			this.isPrimary = params.isPrimary ?? true;
			this.width = params.width ?? 1;
			this.height = params.height ?? 1;
			this.pressure = params.pressure ?? 0.5;
		}
	}

	globalThis.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

// jsdom stubs these as undefined on Element; the drag path calls them.
if (typeof Element !== "undefined") {
	Element.prototype.setPointerCapture ??= function setPointerCapture(): void {};
	Element.prototype.releasePointerCapture ??= function releasePointerCapture(): void {};
	Element.prototype.hasPointerCapture ??= function hasPointerCapture(): boolean {
		return false;
	};
}

// React 19 gates act() support on this global. Without it every render in the
// react package logs "not configured to support act(...)" to stderr.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
