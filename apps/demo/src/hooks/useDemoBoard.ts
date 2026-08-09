import { useCallback, useMemo, useState } from "react";
import { projectPremoves } from "quadrum/premove";
import type { PremoveIntent } from "quadrum/premove";
import type {
	Color,
	Mark,
	MoveMeta,
	MovePair,
	MovePlayedHandler,
	Role,
	Square,
	Targets,
} from "quadrum";
import { PRESETS, applyMove } from "../lib/positions";
import type { PresetName } from "../lib/positions";
import { buildTargets } from "../lib/targets";

/**
 * How the board decides what a move means.
 * - `free`   — no rules, any piece to any square.
 * - `targeted` — only destinations the demo hands in are playable.
 * - `premove`  — moves are queued against a projection of the board rather than
 *   played, and are applied together when the opponent finally replies.
 */
export type DemoMode = "free" | "targeted" | "premove";

export interface DemoBoard {
	mode: DemoMode;
	setMode: (mode: DemoMode) => void;
	/** The placement handed to the board — the projection while premoves are queued. */
	displayPlacement: string;
	orientation: Color;
	flip: () => void;
	loadPreset: (preset: PresetName) => void;
	clear: () => void;
	targets: Targets | undefined;
	lastMove: MovePair | null;
	moveCount: number;
	userMarks: Mark[];
	setUserMarks: (marks: Mark[]) => void;
	clearMarks: () => void;
	autoMarks: Mark[];
	premoves: PremoveIntent[];
	resolvePremoves: () => void;
	discardPremoves: () => void;
	chess960: boolean;
	setChess960: (on: boolean) => void;
	locked: boolean;
	setLocked: (on: boolean) => void;
	dragEnabled: boolean;
	setDragEnabled: (on: boolean) => void;
	removeOffBoard: boolean;
	setRemoveOffBoard: (on: boolean) => void;
	marksEnabled: boolean;
	setMarksEnabled: (on: boolean) => void;
	promotionEnabled: boolean;
	setPromotionEnabled: (on: boolean) => void;
	lastPromotion: string;
	keepMarksOnMove: boolean;
	setKeepMarksOnMove: (on: boolean) => void;
	onPositionChanged: (placement: string) => void;
	onMove: MovePlayedHandler;
	onPromote: (from: Square, to: Square, role: Role) => void;
}

const PREMOVE_PEN = "blue";

export function useDemoBoard(): DemoBoard {
	const [mode, setModeState] = useState<DemoMode>("free");
	// The real board. In premove mode this stays put while moves queue on top.
	const [placement, setPlacement] = useState<string>(PRESETS.initial);
	const [orientation, setOrientation] = useState<Color>("white");
	const [lastMove, setLastMove] = useState<MovePair | null>(null);
	const [moveCount, setMoveCount] = useState(0);
	const [userMarks, setUserMarks] = useState<Mark[]>([]);
	const [premoves, setPremoves] = useState<PremoveIntent[]>([]);
	const [chess960, setChess960] = useState(false);
	const [locked, setLocked] = useState(false);
	const [dragEnabled, setDragEnabled] = useState(true);
	const [removeOffBoard, setRemoveOffBoard] = useState(false);
	const [marksEnabled, setMarksEnabled] = useState(true);
	const [keepMarksOnMove, setKeepMarksOnMove] = useState(false);
	const [promotionEnabled, setPromotionEnabled] = useState(false);
	const [lastPromotion, setLastPromotion] = useState("—");

	// projectPremoves takes and returns a full FEN; only the placement matters here.
	const displayPlacement = useMemo(() => {
		if (premoves.length === 0) return placement;
		const projected = projectPremoves(`${placement} w - - 0 1`, premoves, "w");
		return projected.split(" ")[0] ?? placement;
	}, [placement, premoves]);

	const targets = useMemo<Targets | undefined>(() => {
		if (mode === "free") return undefined;
		return buildTargets(displayPlacement, "white", { chess960 });
	}, [mode, displayPlacement, chess960]);

	const autoMarks = useMemo<Mark[]>(
		() => premoves.map((mv) => ({ from: mv.from, to: mv.to, pen: PREMOVE_PEN })),
		[premoves],
	);

	const setMode = useCallback((next: DemoMode) => {
		setModeState(next);
		// A queue only means anything in premove mode; leaving it behind would
		// keep projecting onto a board that is now played directly.
		setPremoves([]);
	}, []);

	const resetTo = useCallback((next: string) => {
		setPlacement(next);
		setPremoves([]);
		setLastMove(null);
		setMoveCount(0);
	}, []);

	const loadPreset = useCallback(
		(preset: PresetName) => resetTo(PRESETS[preset]),
		[resetTo],
	);

	const clear = useCallback(() => resetTo(PRESETS.empty), [resetTo]);

	const flip = useCallback(() => {
		setOrientation((current) => (current === "white" ? "black" : "white"));
	}, []);

	const clearMarks = useCallback(() => setUserMarks([]), []);

	const resolvePremoves = useCallback(() => {
		setPlacement(displayPlacement);
		setPremoves([]);
	}, [displayPlacement]);

	const discardPremoves = useCallback(() => setPremoves([]), []);

	// The state loop for played moves: quadrum applies the move optimistically
	// and reports the placement, and echoing it back keeps React authoritative.
	// In premove mode nothing is played, so this must not run.
	const onPositionChanged = useCallback(
		(next: string) => {
			if (mode === "premove") return;
			setPlacement(next);
		},
		[mode],
	);

	const onMove = useCallback(
		(from: Square, to: Square, meta: MoveMeta) => {
			setLastMove([from, to]);
			setMoveCount((n) => n + 1);

			if (mode === "premove") {
				setPremoves((queue) => [...queue, { from, to }]);
				return;
			}

			// A targeted board reports the move but not the new position — that is
			// the rules source's job, and here that is us. (A free board echoes the
			// placement through onPositionChanged instead, so leave it alone.)
			if (mode === "targeted") {
				setPlacement((current) => applyMove(current, from, to, meta.promotion));
			}
		},
		[mode],
	);

	const onPromote = useCallback((from: Square, to: Square, role: Role) => {
		setLastPromotion(`${from}${to}=${role}`);
	}, []);

	return {
		mode,
		setMode,
		displayPlacement,
		orientation,
		flip,
		loadPreset,
		clear,
		targets,
		lastMove,
		moveCount,
		userMarks,
		setUserMarks,
		clearMarks,
		autoMarks,
		premoves,
		resolvePremoves,
		discardPremoves,
		chess960,
		setChess960,
		locked,
		setLocked,
		dragEnabled,
		setDragEnabled,
		removeOffBoard,
		setRemoveOffBoard,
		marksEnabled,
		setMarksEnabled,
		keepMarksOnMove,
		setKeepMarksOnMove,
		promotionEnabled,
		setPromotionEnabled,
		lastPromotion,
		onPositionChanged,
		onMove,
		onPromote,
	};
}
