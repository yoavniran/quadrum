/**
 * Tiny append-only log pane with bounded growth.
 */

/**
 * Create a log element and log function.
 * Maintains at most 500 lines to prevent unbounded growth.
 */
export function createLog(): {
	element: HTMLElement;
	log: (message: string) => void;
	clear: () => void;
} {
	const element = document.createElement("pre");
	element.className = "bench-log";

	return {
		element,
		log(message: string) {
			const timestamp = (performance.now() / 1000).toFixed(2);
			const line = `[${timestamp}s] ${message}\n`;
			element.textContent += line;

			// Cap at 500 lines to prevent unbounded growth
			const lines = element.textContent.split("\n");
			if (lines.length > 500) {
				element.textContent = lines.slice(-500).join("\n");
			}

			// Scroll to bottom
			element.scrollTop = element.scrollHeight;
		},
		clear() {
			element.textContent = "";
		},
	};
}
