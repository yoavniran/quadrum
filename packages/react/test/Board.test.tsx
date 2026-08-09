import { act } from "react";
import { createRoot } from "react-dom/client";
import { Board } from "../src/Board";
import type { Board as BoardApi, MovePlayedHandler } from "quadrum";

describe("Board", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		document.body.removeChild(container);
	});

	it("mounting renders 32 qd-piece elements for the initial position", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" animationDuration={0} />,
			);
		});

		const pieces = container.querySelectorAll("qd-piece");
		expect(pieces).toHaveLength(32);
	});

	it("unmounting empties the container", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" animationDuration={0} />,
			);
		});

		await act(async () => {
			root.unmount();
		});

		expect(container.children).toHaveLength(0);
	});

	it("changing the position prop updates the pieces", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" animationDuration={0} />,
			);
		});

		const initialPieces = container.querySelectorAll("qd-piece").length;
		expect(initialPieces).toBe(32);

		await act(async () => {
			root.render(
				<Board position="8/8/8/8/8/8/8/8" animationDuration={0} />,
			);
		});

		const updatedPieces = container.querySelectorAll("qd-piece").length;
		expect(updatedPieces).toBe(0);
	});

	it("changing onMove callback identity does not recreate the board", async () => {
		const root = createRoot(container);
		const handler1: MovePlayedHandler = () => {};
		const handler2: MovePlayedHandler = () => {};

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					onMove={handler1}
					animationDuration={0}
				/>,
			);
		});

		const boardBefore = container.querySelector("qd-board");

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					onMove={handler2}
					animationDuration={0}
				/>,
			);
		});

		const boardAfter = container.querySelector("qd-board");

		expect(boardAfter).toBe(boardBefore);
	});

	it("with clearMarksOnPositionChange, user marks are cleared when position changes", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					userMarks={[{ from: "e2", to: "e4" }]}
					clearMarksOnPositionChange={true}
					animationDuration={0}
				/>,
			);
		});

		await act(async () => {
			root.render(
				<Board
					position="8/8/8/8/8/8/8/8"
					userMarks={[{ from: "e2", to: "e4" }]}
					clearMarksOnPositionChange={true}
					animationDuration={0}
				/>,
			);
		});

		// After position change, marks should be cleared (setUserMarks was called)
		// We can't directly assert the board's internal state, but the position change
		// should trigger the clearMarksOnPositionChange effect
		const svgMarks = container.querySelectorAll(".qd-marks > *");
		// The marks SVG should only have the <defs> element, not the arrows/circles
		expect(svgMarks.length).toBeLessThanOrEqual(1);
	});

	it("with clearMarksOnPositionChange, user marks are preserved across re-render with same position", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					userMarks={[{ from: "e2", to: "e4" }]}
					clearMarksOnPositionChange={true}
					animationDuration={0}
				/>,
			);
		});

		const marksAfterFirst = container.querySelectorAll(".qd-marks > *").length;

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					userMarks={[{ from: "e2", to: "e4" }]}
					clearMarksOnPositionChange={true}
					animationDuration={0}
				/>,
			);
		});

		const marksAfterSecond = container.querySelectorAll(".qd-marks > *").length;
		expect(marksAfterSecond).toBe(marksAfterFirst);
	});

	it("apiRef is populated once the board exists, and released on unmount", async () => {
		// Regression: the sync effect had a static dependency array, so it ran only
		// after the first commit -- before the element (and therefore the board)
		// existed -- and never again. The documented imperative handle was null for
		// the whole life of every board.
		const root = createRoot(container);
		const apiRef: React.RefObject<BoardApi | null> = { current: null };

		await act(async () => {
			root.render(<Board apiRef={apiRef} animationDuration={0} />);
		});

		expect(apiRef.current).not.toBeNull();
		expect(typeof apiRef.current?.state).toBe("function");

		await act(async () => {
			root.unmount();
		});

		expect(apiRef.current).toBeNull();
	});

	it("clearMarksOnPress reaches core, on mount and on a later update", async () => {
		// Regression: the prop existed nowhere in the React layer, so a consumer
		// could not stop a press from wiping their marks. Both halves are pinned
		// because only the update path was missing -- a mount-only test passed
		// while the toggle stayed dead for the whole life of the component.
		const root = createRoot(container);
		const apiRef: React.RefObject<BoardApi | null> = { current: null };

		await act(async () => {
			root.render(<Board apiRef={apiRef} clearMarksOnPress={false} animationDuration={0} />);
		});

		expect(apiRef.current?.state().marks.clearOnPress).toBe(false);

		await act(async () => {
			root.render(<Board apiRef={apiRef} clearMarksOnPress={true} animationDuration={0} />);
		});

		expect(apiRef.current?.state().marks.clearOnPress).toBe(true);
	});

	it("marksEnabled prop is accepted and passed through", async () => {
		const root = createRoot(container);

		await act(async () => {
			root.render(
				<Board
					position="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
					marksEnabled={false}
					dragEnabled={true}
					animateEnabled={true}
					promotionEnabled={true}
					animationDuration={0}
				/>,
			);
		});

		// Board should be created successfully with all the enabled props
		const pieces = container.querySelectorAll("qd-piece");
		expect(pieces).toHaveLength(32);
	});
});
