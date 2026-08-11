/**
 * Scenario picker and run button.
 */

import { SCENARIOS } from "../scenarios/registry";

/**
 * Create the controls UI element.
 * Returns the element, a setBusy function, and a getter for the selected scenario ID.
 */
export function createControls(args: {
	onRun: (scenarioId: string) => void;
	onCancel: () => void;
}): {
	element: HTMLElement;
	setBusy: (busy: boolean) => void;
	selectedId: () => string;
} {
	const container = document.createElement("div");
	container.className = "bench-controls";

	// Scenario selector label
	const scenarioLabel = document.createElement("label");
	const scenarioSelect = document.createElement("select");
	scenarioSelect.setAttribute("aria-label", "Select scenario");

	for (const scenario of SCENARIOS) {
		const option = document.createElement("option");
		option.value = scenario.id;
		let text = scenario.title;
		if (scenario.runnerOnly) {
			text += " (runner only)";
			option.disabled = true;
		}
		option.textContent = text;
		scenarioSelect.appendChild(option);
	}

	scenarioLabel.appendChild(scenarioSelect);
	container.appendChild(scenarioLabel);

	// Run button
	const runButton = document.createElement("button");
	runButton.setAttribute("aria-label", "Run selected scenario");
	runButton.textContent = "Run scenario";
	runButton.addEventListener("click", () => {
		args.onRun(scenarioSelect.value);
	});
	container.appendChild(runButton);

	// Cancel button
	const cancelButton = document.createElement("button");
	cancelButton.setAttribute("aria-label", "Cancel current run");
	cancelButton.textContent = "Cancel";
	cancelButton.disabled = true;
	cancelButton.addEventListener("click", () => {
		args.onCancel();
	});
	container.appendChild(cancelButton);

	return {
		element: container,
		setBusy(busy: boolean): void {
			runButton.disabled = busy;
			cancelButton.disabled = !busy;
			runButton.textContent = busy ? "Running…" : "Run scenario";
		},
		selectedId(): string {
			return scenarioSelect.value;
		},
	};
}
