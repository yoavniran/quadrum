/**
 * Runtime piece-art parity. No committed assets. Read the already-loaded
 * chessground CSS's computed background-image off throwaway probe elements
 * and mirror it onto qd-piece via an injected stylesheet.
 *
 * Note: no chessground bytes are committed to this repo; the art is read from
 * the installed dev-only dependency at runtime. See CLEANROOM.md.
 *
 * With the subjects isolated in separate frames this reads BETTER than it did
 * on a shared page: the probe runs in chessground's frame, where its
 * stylesheet lives, and only the handful of derived `background-image`
 * declarations cross into quadrum's frame. quadrum's document never receives
 * chessground's stylesheet, so it cannot pay for selectors it does not use.
 */

import type { BenchFrames } from "../../core/frames";
import { getFrame } from "../../core/frames";

const ROLES = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
const COLORS = ["white", "black"] as const;

const SHARED_PIECE_CSS =
	"background-size: contain; background-position: center; background-repeat: no-repeat;";

let applied = false;

/**
 * Apply piece-art parity. Reads chessground's piece CSS in its own frame and
 * mirrors it onto quadrum pieces in theirs. Idempotent.
 */
export async function applyPieceArtParity(frames: BenchFrames): Promise<void> {
	if (applied) return;
	applied = true;

	try {
		const chessground = getFrame(frames, "chessground");
		const quadrum = getFrame(frames, "quadrum");

		const art = readChessgroundArt(chessground.document);

		let css = "";
		for (const [key, value] of art) {
			const [color, role] = key.split(".");
			css += `qd-piece.${color}.${role} { background-image: ${value}; }\n`;
		}
		css += `qd-piece { ${SHARED_PIECE_CSS} }\n`;

		injectStyle(quadrum.document, css);
		injectStyle(
			chessground.document,
			`.cg-wrap piece { ${SHARED_PIECE_CSS} }\n`,
		);
	} catch (error) {
		// A failed parity pass must not be remembered as done: the next run
		// would then silently measure mismatched piece art.
		applied = false;
		throw error;
	}
}

/**
 * Read every role/colour background-image from chessground's own document.
 * Throws if any piece has no art, since a missing background would make
 * quadrum paint less than chessground on every subsequent scenario.
 */
function readChessgroundArt(doc: Document): Map<string, string> {
	const view = doc.defaultView;
	if (!view) {
		throw new Error("chessground frame has no window; cannot read piece art");
	}

	const probe = doc.createElement("div");
	probe.className = "cg-wrap";
	probe.style.position = "fixed";
	probe.style.left = "-9999px";
	probe.style.top = "0";
	probe.style.width = "80px";
	probe.style.height = "80px";

	const board = doc.createElement("cg-board");
	probe.appendChild(board);

	try {
		doc.body.appendChild(probe);

		const art = new Map<string, string>();

		for (const role of ROLES) {
			for (const color of COLORS) {
				const piece = doc.createElement("piece");
				piece.className = `${role} ${color}`;
				board.appendChild(piece);

				const bg = view.getComputedStyle(piece).backgroundImage;
				if (!bg || bg === "none") {
					throw new Error(`missing piece art for ${color} ${role}`);
				}

				art.set(`${color}.${role}`, bg);
			}
		}

		return art;
	} finally {
		// Always remove the probe
		probe.remove();
	}
}

function injectStyle(doc: Document, css: string): void {
	const style = doc.createElement("style");
	style.setAttribute("data-bench", "piece-art");
	style.textContent = css;
	doc.head.appendChild(style);
}
