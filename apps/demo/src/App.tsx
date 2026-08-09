import { Board } from "quadrum-react";
import { useDemoBoard } from "./hooks/useDemoBoard";
import { ControlPanel } from "./components/ControlPanel";
import { StatusReadout } from "./components/StatusReadout";

export function App() {
	const board = useDemoBoard();

	return (
		<div className="app-container">
			<header>
				{/* Decorative: the <h1> right below already says "quadrum", so an
				    alt here would just make a screen reader announce it twice. */}
				<img className="app-logo" src="/logo.png" alt="" width={72} height={67} />
				<h1>quadrum</h1>
				<p>A rules-agnostic chess board renderer</p>
			</header>

			<main>
				{/* Two separate triggers wipe marks, and the press fires first — so
				    "keep my marks" has to turn off both or the toggle does nothing. */}
				<Board
					className="demo-board"
					position={board.displayPlacement}
					orientation={board.orientation}
					free={board.mode === "free"}
					targets={board.targets}
					showTargets={board.mode !== "free"}
					lastMove={board.lastMove}
					locked={board.locked}
					dragEnabled={board.dragEnabled}
					removeOffBoard={board.removeOffBoard}
					marksEnabled={board.marksEnabled}
					userMarks={board.userMarks}
					autoMarks={board.autoMarks}
					onMarksChange={board.setUserMarks}
					clearMarksOnPositionChange={!board.keepMarksOnMove}
					clearMarksOnPress={!board.keepMarksOnMove}
					coordinates
					animationDuration={120}
					promotionEnabled={board.promotionEnabled}
					onPromote={board.onPromote}
					onMove={board.onMove}
					onPositionChanged={board.onPositionChanged}
				/>

				<aside>
					<ControlPanel board={board} />
					<StatusReadout board={board} />
				</aside>
			</main>
		</div>
	);
}
