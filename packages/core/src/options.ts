import type { Color, Mark, MovePair, Pen, Pens, Square } from "./types";
import { fenToPieces } from "./model/position";
import type { Pieces, Targets } from "./types";
import type {
	MovePlayedHandler,
	SelectHandler,
	PositionChangedHandler,
	MarksChangedHandler,
	PromoteHandler,
} from "./types";

export interface MoveOptions {
	free?: boolean;
	side?: Color | "both";
	targets?: Targets;
	showTargets?: boolean;
	onPlayed?: MovePlayedHandler | null;
}

export interface SelectOptions {
	enabled?: boolean;
	onSelect?: SelectHandler | null;
}

export interface DragOptions {
	enabled?: boolean;
	threshold?: number;
	removeOffBoard?: boolean;
}

export interface MarkOptions {
	enabled?: boolean;
	user?: Mark[];
	auto?: Mark[];
	pens?: Record<string, Partial<Pen>>;
	onChange?: MarksChangedHandler | null;
}

export interface AnimateOptions {
	enabled?: boolean;
	duration?: number;
}

export interface PromotionOptions {
	enabled?: boolean;
	onPromote?: PromoteHandler | null;
}

export interface BoardOptions {
	position?: string;
	orientation?: Color;
	sideToMove?: Color;
	checkSide?: Color | Square | null;
	lastMove?: MovePair | null;
	selected?: Square | null;
	coordinates?: boolean;
	locked?: boolean;
	moves?: MoveOptions;
	select?: SelectOptions;
	drag?: DragOptions;
	marks?: MarkOptions;
	animate?: AnimateOptions;
	promotion?: PromotionOptions;
	onPositionChanged?: PositionChangedHandler | null;
}

export interface BoardState {
	pieces: Pieces;
	orientation: Color;
	sideToMove: Color;
	checkSide: Color | Square | null;
	lastMove: MovePair | null;
	selected: Square | null;
	coordinates: boolean;
	locked: boolean;
	moves: Required<Omit<MoveOptions, "onPlayed">> & { onPlayed: MovePlayedHandler | null };
	select: { enabled: boolean; onSelect: SelectHandler | null };
	drag: Required<DragOptions>;
	marks: {
		enabled: boolean;
		user: Mark[];
		auto: Mark[];
		pens: Pens;
		onChange: MarksChangedHandler | null;
	};
	animate: Required<AnimateOptions>;
	promotion: { enabled: boolean; onPromote: PromoteHandler | null };
	onPositionChanged: PositionChangedHandler | null;
}

export const DEFAULT_PENS: Pens = {
	green: { color: "#15781B", width: 10, opacity: 1 },
	red: { color: "#882020", width: 10, opacity: 1 },
	blue: { color: "#003088", width: 10, opacity: 1 },
	yellow: { color: "#e68f00", width: 10, opacity: 1 },
};

export function defaultState(): BoardState {
	return {
		pieces: new Map(),
		orientation: "white",
		sideToMove: "white",
		checkSide: null,
		lastMove: null,
		selected: null,
		coordinates: true,
		locked: false,
		moves: {
			free: false,
			side: "both",
			targets: new Map(),
			showTargets: true,
			onPlayed: null,
		},
		select: {
			enabled: true,
			onSelect: null,
		},
		drag: {
			enabled: true,
			threshold: 3,
			removeOffBoard: false,
		},
		marks: {
			enabled: true,
			user: [],
			auto: [],
			pens: { ...DEFAULT_PENS },
			onChange: null,
		},
		animate: {
			enabled: true,
			duration: 200,
		},
		promotion: {
			enabled: false,
			onPromote: null,
		},
		onPositionChanged: null,
	};
}

export function applyOptions(state: BoardState, options: BoardOptions): BoardState {
	// Start with a shallow clone
	const next: BoardState = {
		...state,
		// Cloned, not aliased: callers treat the returned state as wholly theirs.
		pieces: new Map(state.pieces),
		moves: { ...state.moves },
		select: { ...state.select },
		drag: { ...state.drag },
		marks: { ...state.marks },
		animate: { ...state.animate },
		promotion: { ...state.promotion },
	};

	// Apply simple fields
	if (options.orientation !== undefined) {
		next.orientation = options.orientation;
	}
	if (options.sideToMove !== undefined) {
		next.sideToMove = options.sideToMove;
	}
	if (options.checkSide !== undefined) {
		next.checkSide = options.checkSide;
	}
	if (options.lastMove !== undefined) {
		next.lastMove = options.lastMove;
	}
	if (options.selected !== undefined) {
		next.selected = options.selected;
	}
	if (options.coordinates !== undefined) {
		next.coordinates = options.coordinates;
	}
	if (options.locked !== undefined) {
		next.locked = options.locked;
	}

	// Handle position
	if (options.position !== undefined) {
		next.pieces = fenToPieces(options.position);
	}

	// Handle moves group
	if (options.moves !== undefined) {
		const moves = options.moves;
		if (moves.free !== undefined) {
			next.moves.free = moves.free;
		}
		if (moves.side !== undefined) {
			next.moves.side = moves.side;
		}
		if (moves.targets !== undefined) {
			next.moves.targets = moves.targets;
		}
		if (moves.showTargets !== undefined) {
			next.moves.showTargets = moves.showTargets;
		}
		if (moves.onPlayed !== undefined) {
			next.moves.onPlayed = moves.onPlayed;
		}
	}

	// Handle select group
	if (options.select !== undefined) {
		const select = options.select;
		if (select.enabled !== undefined) {
			next.select.enabled = select.enabled;
		}
		if (select.onSelect !== undefined) {
			next.select.onSelect = select.onSelect;
		}
	}

	// Handle drag group
	if (options.drag !== undefined) {
		const drag = options.drag;
		if (drag.enabled !== undefined) {
			next.drag.enabled = drag.enabled;
		}
		if (drag.threshold !== undefined) {
			next.drag.threshold = drag.threshold;
		}
		if (drag.removeOffBoard !== undefined) {
			next.drag.removeOffBoard = drag.removeOffBoard;
		}
	}

	// Handle marks group
	if (options.marks !== undefined) {
		const marks = options.marks;
		if (marks.enabled !== undefined) {
			next.marks.enabled = marks.enabled;
		}
		if (marks.user !== undefined) {
			next.marks.user = marks.user;
		}
		if (marks.auto !== undefined) {
			next.marks.auto = marks.auto;
		}
		if (marks.onChange !== undefined) {
			next.marks.onChange = marks.onChange;
		}
		if (marks.pens !== undefined) {
			// Deep merge: DEFAULT_PENS + current pens + new partials
			const merged: Pens = {};
			for (const key in DEFAULT_PENS) {
				merged[key] = { ...DEFAULT_PENS[key] };
			}
			for (const key in state.marks.pens) {
				const base: Pen = merged[key] ?? DEFAULT_PENS[key] ?? {
					color: "#000000",
					width: 10,
					opacity: 1,
				};
				merged[key] = { ...base, ...state.marks.pens[key] };
			}
			for (const key in marks.pens) {
				const base: Pen = merged[key] ?? DEFAULT_PENS[key] ?? {
					color: "#000000",
					width: 10,
					opacity: 1,
				};
				merged[key] = { ...base, ...marks.pens[key] };
			}
			next.marks.pens = merged;
		}
	}

	// Handle animate group
	if (options.animate !== undefined) {
		const animate = options.animate;
		if (animate.enabled !== undefined) {
			next.animate.enabled = animate.enabled;
		}
		if (animate.duration !== undefined) {
			next.animate.duration = animate.duration;
		}
	}

	// Handle promotion group
	if (options.promotion !== undefined) {
		const promotion = options.promotion;
		if (promotion.enabled !== undefined) {
			next.promotion.enabled = promotion.enabled;
		}
		if (promotion.onPromote !== undefined) {
			next.promotion.onPromote = promotion.onPromote;
		}
	}

	// Handle onPositionChanged
	if (options.onPositionChanged !== undefined) {
		next.onPositionChanged = options.onPositionChanged;
	}

	return next;
}
