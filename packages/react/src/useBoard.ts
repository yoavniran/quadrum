import { useLayoutEffect, useRef, useState } from "react";
import { createBoard } from "quadrum";
import type { Board, BoardOptions } from "quadrum";
import type {
	MarksChangedHandler,
	MovePlayedHandler,
	PositionChangedHandler,
	PromoteHandler,
	SelectHandler,
	SquareTapHandler,
} from "quadrum";

interface Handlers {
	onPlayed?: MovePlayedHandler | null;
	onSelect?: SelectHandler | null;
	onTap?: SquareTapHandler | null;
	onPositionChanged?: PositionChangedHandler | null;
	onMarksChange?: MarksChangedHandler | null;
	onPromote?: PromoteHandler | null;
}

/**
 * Mounts a quadrum board into an element and keeps it in sync with `options`.
 *
 * Handlers are read through a ref, so a consumer passing fresh arrow functions
 * on every render causes zero `update()` calls. The update effect depends on
 * leaf values rather than on the identity of the option groups, for the same
 * reason: `<Board>` rebuilds those group literals every render.
 */
export function useBoard(options: BoardOptions): {
	ref: React.RefCallback<HTMLElement>;
	api: React.RefObject<Board | null>;
} {
	const [element, setElement] = useState<HTMLElement | null>(null);
	const boardRef = useRef<Board | null>(null);
	const handlersRef = useRef<Handlers>({});
	const optionsRef = useRef<BoardOptions>(options);

	// Refreshed every render; never a dependency of anything.
	optionsRef.current = options;
	handlersRef.current = {
		onPlayed: options.moves?.onPlayed,
		onSelect: options.select?.onSelect,
		onTap: options.select?.onTap,
		onPositionChanged: options.onPositionChanged,
		onMarksChange: options.marks?.onChange,
		onPromote: options.promotion?.onPromote,
	};

	// Create the board when the element attaches; unmount when it detaches.
	useLayoutEffect(() => {
		if (!element) return;

		const initial = optionsRef.current;

		boardRef.current = createBoard(element, {
			...initial,
			moves: {
				...initial.moves,
				onPlayed: (from, to, meta) => handlersRef.current.onPlayed?.(from, to, meta),
			},
			select: {
				...initial.select,
				onSelect: (square) => handlersRef.current.onSelect?.(square),
				onTap: (square) => handlersRef.current.onTap?.(square),
			},
			marks: {
				...initial.marks,
				onChange: (marks) => handlersRef.current.onMarksChange?.(marks),
			},
			promotion: {
				...initial.promotion,
				onPromote: (from, to, role) => handlersRef.current.onPromote?.(from, to, role),
			},
			onPositionChanged: (placement) => handlersRef.current.onPositionChanged?.(placement),
		});

		return () => {
			boardRef.current?.unmount();
			boardRef.current = null;
		};
	}, [element]);

	const {
		position,
		orientation,
		sideToMove,
		checkSide,
		lastMove,
		selected,
		coordinates,
		locked,
		moves,
		select,
		drag,
		marks,
		animate,
		promotion,
	} = options;

	// Push non-handler option changes down. Handlers are deliberately omitted:
	// they were bound once at construction and read live from the ref.
	useLayoutEffect(() => {
		const board = boardRef.current;
		if (!board) return;

		board.update({
			position,
			orientation,
			sideToMove,
			checkSide,
			lastMove,
			selected,
			coordinates,
			locked,
			moves: {
				free: moves?.free,
				side: moves?.side,
				targets: moves?.targets,
				showTargets: moves?.showTargets,
			},
			select: { enabled: select?.enabled },
			drag: {
				enabled: drag?.enabled,
				threshold: drag?.threshold,
				removeOffBoard: drag?.removeOffBoard,
			},
			marks: {
				enabled: marks?.enabled,
				user: marks?.user,
				auto: marks?.auto,
				pens: marks?.pens,
			},
			animate: { enabled: animate?.enabled, duration: animate?.duration },
			promotion: { enabled: promotion?.enabled },
		});
	}, [
		element,
		position,
		orientation,
		sideToMove,
		checkSide,
		lastMove,
		selected,
		coordinates,
		locked,
		moves?.free,
		moves?.side,
		moves?.targets,
		moves?.showTargets,
		select?.enabled,
		drag?.enabled,
		drag?.threshold,
		drag?.removeOffBoard,
		marks?.enabled,
		marks?.user,
		marks?.auto,
		marks?.pens,
		animate?.enabled,
		animate?.duration,
		promotion?.enabled,
	]);

	return { ref: setElement, api: boardRef };
}
