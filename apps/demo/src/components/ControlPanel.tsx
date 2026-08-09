import type { DemoBoard, DemoMode } from "../hooks/useDemoBoard";

const MODES: Array<{ value: DemoMode; label: string; hint: string }> = [
	{ value: "free", label: "Free", hint: "Any piece to any square" },
	{ value: "targeted", label: "Targeted", hint: "Only supplied destinations" },
	{ value: "premove", label: "Premove", hint: "Queue moves against a projection" },
];

interface ToggleProps {
	label: string;
	checked: boolean;
	onChange: (next: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
	return (
		<label className="toggle">
			<input
				type="checkbox"
				aria-label={label}
				checked={checked}
				onChange={(e) => onChange(e.currentTarget.checked)}
			/>
			<span>{label}</span>
		</label>
	);
}

export function ControlPanel({ board }: { board: DemoBoard }) {
	return (
		<div className="control-panel">
			<fieldset>
				<legend>Move mode</legend>
				<div role="radiogroup" aria-label="Move mode">
					{MODES.map((mode) => (
						<label key={mode.value} className="toggle" title={mode.hint}>
							<input
								type="radio"
								name="mode"
								aria-label={`${mode.label} mode`}
								checked={board.mode === mode.value}
								onChange={() => board.setMode(mode.value)}
							/>
							<span>{mode.label}</span>
						</label>
					))}
				</div>
			</fieldset>

			<fieldset>
				<legend>Position</legend>
				<button aria-label="Flip board" onClick={board.flip}>Flip</button>
				<button aria-label="Reset to initial position" onClick={() => board.loadPreset("initial")}>
					Reset
				</button>
				<button aria-label="Clear all pieces" onClick={board.clear}>Clear</button>
				<button aria-label="Load Chess960 position" onClick={() => board.loadPreset("chess960")}>
					Chess960 position
				</button>
				<button aria-label="Load promotion position" onClick={() => board.loadPreset("promotion")}>
					Promotion position
				</button>
			</fieldset>

			<fieldset>
				<legend>Options</legend>
				<Toggle label="Chess960 castling" checked={board.chess960} onChange={board.setChess960} />
				<Toggle label="Lock board" checked={board.locked} onChange={board.setLocked} />
				<Toggle label="Enable dragging" checked={board.dragEnabled} onChange={board.setDragEnabled} />
				<Toggle
					label="Remove piece dragged off board"
					checked={board.removeOffBoard}
					onChange={board.setRemoveOffBoard}
				/>
				<Toggle label="Enable marks" checked={board.marksEnabled} onChange={board.setMarksEnabled} />
				<Toggle
					label="Enable promotion picker"
					checked={board.promotionEnabled}
					onChange={board.setPromotionEnabled}
				/>
				<Toggle
					label="Keep marks when position changes"
					checked={board.keepMarksOnMove}
					onChange={board.setKeepMarksOnMove}
				/>
			</fieldset>

			<fieldset>
				<legend>Marks</legend>
				<button aria-label="Clear all marks" onClick={board.clearMarks}>Clear marks</button>
			</fieldset>

			<fieldset>
				<legend>Premoves</legend>
				<button
					aria-label="Play queued premoves"
					disabled={board.premoves.length === 0}
					onClick={board.resolvePremoves}
				>
					Opponent replied
				</button>
				<button
					aria-label="Discard queued premoves"
					disabled={board.premoves.length === 0}
					onClick={board.discardPremoves}
				>
					Discard premoves
				</button>
			</fieldset>
		</div>
	);
}
