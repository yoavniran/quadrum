export type Color = "white" | "black";
export type Role = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn";
export type FileLetter = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";
export type RankNumber = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
export type Square = `${FileLetter}${RankNumber}`;

export interface Piece {
	color: Color;
	role: Role;
}

/** Live board occupancy. Absent key === empty square. */
export type Pieces = Map<Square, Piece>;

/** Legal destinations per origin square, supplied by the consumer. */
export type Targets = Map<Square, Square[]>;

export type MovePair = [Square, Square];

export interface Point {
	x: number;
	y: number;
}

/** A drawing style. `width`/`opacity` are in SVG units of the 800x800 viewBox. */
export interface Pen {
	color: string;
	width: number;
	opacity: number;
}

export type Pens = Record<string, Pen>;

/**
 * A board annotation. `to` present -> arrow; `to` absent -> circle on `from`;
 * `svg` present -> raw SVG badge drawn at `from` (in a <g> translated to that
 * square's origin, 100 units per square).
 */
export interface Mark {
	from: Square;
	to?: Square;
	/** key into `marks.pens`; defaults to "green" */
	pen?: string;
	/** per-mark line width override, SVG units */
	width?: number;
	/** raw SVG markup for a badge */
	svg?: string;
}

export interface MoveMeta {
	captured: Piece | null;
	promotion?: Role;
}

export type MovePlayedHandler = (from: Square, to: Square, meta: MoveMeta) => void;
export type SelectHandler = (square: Square | null) => void;
export type PositionChangedHandler = (placement: string) => void;
export type MarksChangedHandler = (marks: Mark[]) => void;
export type PromoteHandler = (from: Square, to: Square, role: Role) => void;
