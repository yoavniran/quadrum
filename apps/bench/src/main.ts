/**
 * Benchmark page entry point.
 */

import { createLayout } from "./ui/layout";
import { installBenchApi } from "./bench-api";

/**
 * State for the current run.
 */
let currentAbort: AbortController | null = null;

/**
 * Main initialization.
 */
function main(): void {
	// Find the root element
	const root = document.getElementById("app");
	if (!root) {
		throw new Error('Root element "#app" not found');
	}

	// Read allowDev flag from URL
	const allowDev = new URLSearchParams(location.search).has("allow-dev");

	// Create the log first so early errors are visible
	const log = (() => {
		const preEl = document.createElement("pre");
		preEl.className = "bench-log";
		preEl.style.position = "fixed";
		preEl.style.bottom = "0";
		preEl.style.right = "0";
		preEl.style.zIndex = "9999";
		preEl.style.width = "400px";
		preEl.style.maxHeight = "300px";
		document.body.appendChild(preEl);

		return (message: string) => {
			const timestamp = (performance.now() / 1000).toFixed(2);
			const line = `[${timestamp}s] ${message}\n`;
			preEl.textContent += line;

			const lines = preEl.textContent.split("\n");
			if (lines.length > 100) {
				preEl.textContent = lines.slice(-100).join("\n");
			}

			preEl.scrollTop = preEl.scrollHeight;
		};
	})();

	try {
		// Create layout
		const layout = createLayout(root, {
			async onRun(scenarioId: string): Promise<void> {
				layout.controls.setBusy(true);
				layout.results.clear();
				layout.boards.innerHTML = "";

				log(`Running scenario: ${scenarioId}`);

				try {
					currentAbort = new AbortController();

					const comparison = await api.run(scenarioId);

					layout.results.render(comparison);

					// Log the key ratios
					const ratios = Object.entries(comparison.ratios);
					if (ratios.length > 0) {
						log("Ratios:");
						for (const [key, ratio] of ratios) {
							if (Number.isFinite(ratio)) {
								log(
									`  ${key}: ${ratio.toFixed(2)}× ${ratio < 0.95 ? "(win)" : ratio > 1.05 ? "(loss)" : "(parity)"}`,
								);
							}
						}
					}

					log(`Scenario completed: ${scenarioId}`);
				} catch (error) {
					const message =
						error instanceof Error
							? error.message
							: String(error);
					log(`ERROR: ${message}`);
				} finally {
					layout.controls.setBusy(false);
					currentAbort = null;
				}
			},

			onCancel(): void {
				if (currentAbort) {
					currentAbort.abort();
					log("Cancel requested — the current pass will finish");
				}
			},
		});

		// Install the API
		const api = installBenchApi({
			container: layout.boards,
			allowDev,
			log,
		});

		// Log initial environment
		const env = api.env();
		log("Environment:");
		log(
			`  Browser: ${env.userAgent.substring(0, 60)}...`,
		);
		log(`  Device pixel ratio: ${env.devicePixelRatio}`);
		log(`  Hardware concurrency: ${env.hardwareConcurrency}`);
		log(`  Device memory: ${env.deviceMemory || "unknown"} GB`);
		log(`  Mode: ${env.mode}`);
		log(`  quadrum: ${env.quadrumVersion}`);
		log(`  chessground: ${env.chessgroundVersion}`);
		log("Ready. Select a scenario and click Run.");
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);
		console.error("Fatal error:", message);
		alert(`Fatal error: ${message}`);
	}
}

// Run on DOM ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", main);
} else {
	main();
}
