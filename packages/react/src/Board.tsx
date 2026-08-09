import { useEffect, useRef } from "react";
import { useBoard } from "./useBoard";
import type { Board as BoardApi } from "quadrum";
import type {
	Color,
	Mark,
	MarksChangedHandler,
	MovePair,
	MovePlayedHandler,
	Pen,
	PositionChangedHandler,
	PromoteHandler,
	SelectHandler,
	SquareTapHandler,
	Square,
	Targets,
} from "quadrum";

export interface BoardProps {
	position?: string;
	orientation?: Color;
	sideToMove?: Color;
	checkSide?: Color | Square | null;
	lastMove?: MovePair | null;
	selected?: Square | null;
	coordinates?: boolean;
	locked?: boolean;
	targets?: Targets;
	showTargets?: boolean;
	free?: boolean;
	movableSide?: Color | "both";
	selectable?: boolean;
	removeOffBoard?: boolean;
	userMarks?: Mark[];
	autoMarks?: Mark[];
	pens?: Record<string, Partial<Pen>>;
	animationDuration?: number;
	marksEnabled?: boolean;
	dragEnabled?: boolean;
	animateEnabled?: boolean;
	promotionEnabled?: boolean;
	onMove?: MovePlayedHandler | null;
	onSelect?: SelectHandler | null;
	/** Every completed click/tap, empty squares included. See SquareTapHandler. */
	onSquareTap?: SquareTapHandler | null;
	onPositionChanged?: PositionChangedHandler | null;
	onMarksChange?: MarksChangedHandler | null;
	onPromote?: PromoteHandler | null;
	clearMarksOnPositionChange?: boolean;
	apiRef?: React.RefObject<BoardApi | null>;
	className?: string;
}

export function Board({
	position,
	orientation,
	sideToMove,
	checkSide,
	lastMove,
	selected,
	coordinates,
	locked,
	targets,
	showTargets,
	free,
	movableSide,
	selectable,
	removeOffBoard,
	userMarks,
	autoMarks,
	pens,
	animationDuration,
	marksEnabled,
	dragEnabled,
	animateEnabled,
	promotionEnabled,
	onMove,
	onSelect,
	onSquareTap,
	onPositionChanged,
	onMarksChange,
	onPromote,
	clearMarksOnPositionChange = true,
	apiRef,
	className,
}: BoardProps) {
	const { ref, api } = useBoard({
		position,
		orientation,
		sideToMove,
		checkSide,
		lastMove,
		selected,
		coordinates,
		locked,
		moves: {
			free,
			side: movableSide,
			targets,
			showTargets,
			onPlayed: onMove,
		},
		select: {
			enabled: selectable,
			onSelect,
			onTap: onSquareTap,
		},
		drag: {
			enabled: dragEnabled,
			removeOffBoard,
		},
		marks: {
			enabled: marksEnabled,
			user: userMarks,
			auto: autoMarks,
			pens,
			onChange: onMarksChange,
		},
		animate: {
			enabled: animateEnabled,
			duration: animationDuration,
		},
		promotion: {
			enabled: promotionEnabled,
			onPromote,
		},
		onPositionChanged,
	});

	// Track previous position for clearMarksOnPositionChange
	const prevPositionRef = useRef<string | undefined>(position);

	useEffect(() => {
		if (clearMarksOnPositionChange && position !== prevPositionRef.current && position !== undefined) {
			api.current?.setUserMarks([]);
		}
		prevPositionRef.current = position;
	}, [position, clearMarksOnPositionChange, api]);

	// Sync apiRef
	useEffect(() => {
		if (apiRef) {
			apiRef.current = api.current;
		}
	}, [api, apiRef]);

	return <div className={className} ref={ref} />;
}
