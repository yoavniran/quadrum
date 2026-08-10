/**
 * Runtime piece-art parity. No committed assets. Read the already-loaded
 * chessground CSS's computed background-image off throwaway probe elements
 * and mirror it onto qd-piece via an injected stylesheet.
 *
 * Note: no chessground bytes are committed to this repo; the art is read from
 * the installed dev-only dependency at runtime. See CLEANROOM.md.
 */

let applied = false;

/**
 * Apply piece-art parity. Reads chessground's piece CSS and mirrors it onto
 * quadrum pieces. Idempotent.
 */
export async function applyPieceArtParity(): Promise<void> {
	if (applied) return;
	applied = true;

	const roles = ["pawn", "knight", "bishop", "rook", "queen", "king"];
	const colors = ["white", "black"];

	// Build an off-screen probe
	const probe = document.createElement("div");
	probe.className = "cg-wrap";
	probe.style.position = "fixed";
	probe.style.left = "-9999px";
	probe.style.top = "0";
	probe.style.width = "80px";
	probe.style.height = "80px";

	const board = document.createElement("cg-board");
	probe.appendChild(board);

	try {
		document.body.appendChild(probe);

		const artMap: Map<string, string> = new Map();

		// For each role/color combination, read the background-image
		for (const role of roles) {
			for (const color of colors) {
				const piece = document.createElement("piece");
				piece.className = `${role} ${color}`;
				board.appendChild(piece);

				const bg = getComputedStyle(piece).backgroundImage;
				if (!bg || bg === "none") {
					throw new Error(
						`missing piece art for ${color} ${role}`,
					);
				}

				artMap.set(`${color}.${role}`, bg);
			}
		}

		// Build CSS text
		let css = "";
		for (const [key, value] of artMap) {
			const [color, role] = key.split(".");
			css += `qd-piece.${color}.${role} { background-image: ${value}; }\n`;
		}

		// Shared styles for both quadrum and chessground pieces
		css += `qd-piece { background-size: contain; background-position: center; background-repeat: no-repeat; }\n`;
		css += `.cg-wrap piece { background-size: contain; background-position: center; background-repeat: no-repeat; }\n`;

		// Inject via a style element
		const style = document.createElement("style");
		style.setAttribute("data-bench", "piece-art");
		style.textContent = css;
		document.head.appendChild(style);
	} finally {
		// Always remove the probe
		probe.remove();
	}
}
