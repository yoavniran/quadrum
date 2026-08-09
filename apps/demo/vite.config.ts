import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	resolve: {
		// Two React copies produce an "Invalid hook call" crash.
		dedupe: ["react", "react-dom"]
	}
});
