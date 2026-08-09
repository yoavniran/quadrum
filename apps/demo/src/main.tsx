import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "quadrum/assets/quadrum.css";
import "./board-chrome.css";
import "./demo.css";

import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
	throw new Error("Root element with id 'root' not found");
}

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>
);
