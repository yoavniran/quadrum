/**
 * Assembles the page shell.
 */

import { createControls } from "./controls";
import { createResultsTable } from "./results-table";
import { createLog } from "./log";
import "./ui.css";

/**
 * Create the benchmark page layout.
 * Returns all the major components for wiring.
 */
export function createLayout(
	root: HTMLElement,
	handlers: { onRun: (id: string) => void; onCancel: () => void },
): {
	boards: HTMLElement;
	controls: ReturnType<typeof createControls>;
	results: ReturnType<typeof createResultsTable>;
	log: ReturnType<typeof createLog>;
} {
	root.innerHTML = "";

	const app = document.createElement("div");
	app.className = "bench-app";

	// Header
	const header = document.createElement("header");
	header.className = "bench-header";

	const title = document.createElement("h1");
	title.textContent = "quadrum vs chessground";
	header.appendChild(title);

	const description = document.createElement("p");
	description.textContent =
		"Written and run by quadrum's author. chessground is a mature, widely deployed library; its GPL licence — not its quality — is quadrum's reason for existing. Every number here is reproducible with `pnpm bench`; corrections are welcome as issues.";
	header.appendChild(description);

	app.appendChild(header);

	// Controls
	const controls = createControls(handlers);
	app.appendChild(controls.element);

	// Boards container
	const boards = document.createElement("div");
	boards.className = "bench-boards";
	app.appendChild(boards);

	// Results
	const results = createResultsTable();
	app.appendChild(results.element);

	// Log
	const log = createLog();
	app.appendChild(log.element);

	root.appendChild(app);

	return { boards, controls, results, log };
}
