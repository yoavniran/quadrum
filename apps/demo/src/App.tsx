import { Board } from "quadrum-react";
import { useDemoBoard } from "./hooks/useDemoBoard";
import { ControlPanel } from "./components/ControlPanel";
import { StatusReadout } from "./components/StatusReadout";

export function App() {
	const board = useDemoBoard();

	return (
		<div className="app-container">
			<header>
				<h1>quadrum</h1>
				<p>A rules-agnostic chess board renderer</p>
			</header>

			<main>
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
