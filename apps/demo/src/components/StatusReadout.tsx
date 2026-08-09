import type { Mark } from "quadrum";
import type { DemoBoard } from "../hooks/useDemoBoard";

/** `e2e4:green` for an arrow, `d4:red` for a circle — stable and easy to read back. */
function describeMark(mark: Mark): string {
	const squares = mark.to ? `${mark.from}${mark.to}` : mark.from;
	return `${squares}:${mark.pen ?? "green"}`;
}

/**
 * Everything the board is doing, in text. The board's own DOM is the primary
 * subject of assertions; this exists for the state that has no visual form —
 * the premove queue, the move counter, the placement string.
 */
export function StatusReadout({ board }: { board: DemoBoard }) {
	return (
		<dl className="status-readout">
			<dt>Placement</dt>
			<dd data-testid="placement">{board.displayPlacement}</dd>

			<dt>Last move</dt>
			<dd data-testid="last-move">{board.lastMove ? board.lastMove.join("") : "—"}</dd>

			<dt>Moves</dt>
			<dd data-testid="move-count">{board.moveCount}</dd>

			<dt>Marks</dt>
			<dd data-testid="marks">
				{board.userMarks.length ? board.userMarks.map(describeMark).join(" ") : "—"}
			</dd>

			<dt>Last promotion</dt>
			<dd data-testid="last-promotion">{board.lastPromotion}</dd>

			<dt>Premove queue</dt>
			<dd data-testid="premoves">
				{board.premoves.length
					? board.premoves.map((mv) => `${mv.from}${mv.to}`).join(" ")
					: "—"}
			</dd>
		</dl>
	);
}
