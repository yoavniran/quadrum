import { useState } from "react";
import { Board } from "quadrum-react";
import { INITIAL_PLACEMENT } from "quadrum";
import type { Color } from "quadrum";

const EMPTY_PLACEMENT = "8/8/8/8/8/8/8/8";

export function App() {
	const [position, setPosition] = useState(INITIAL_PLACEMENT);
	const [orientation, setOrientation] = useState<Color>("white");

	const flipOrientation = () => {
		setOrientation(orientation === "white" ? "black" : "white");
	};

	const resetPosition = () => {
		setPosition(INITIAL_PLACEMENT);
	};

	const clearPosition = () => {
		setPosition(EMPTY_PLACEMENT);
	};

	// onPositionChanged is the state loop: quadrum applies the move optimistically
	// and reports the new placement, and echoing it back keeps React the source of truth
	return (
		<div className="app-container">
			<h1>quadrum</h1>
			<p>Free-move chess board with no rules</p>

			<Board
				className="demo-board"
				position={position}
				orientation={orientation}
				free
				coordinates
				animationDuration={200}
				onPositionChanged={setPosition}
			/>

			<div className="button-row">
				<button aria-label="Flip board" onClick={flipOrientation}>
					Flip
				</button>
				<button aria-label="Reset to initial position" onClick={resetPosition}>
					Reset
				</button>
				<button aria-label="Clear all pieces" onClick={clearPosition}>
					Clear
				</button>
			</div>

			<code className="fen-readout">{position}</code>
		</div>
	);
}
