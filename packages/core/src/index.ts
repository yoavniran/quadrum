// Board
export { createBoard, Board } from "./board";

// Types
export type {
	Color,
	Role,
	FileLetter,
	RankNumber,
	Square,
	Piece,
	Pieces,
	Targets,
	MovePair,
	Point,
	Pen,
	Pens,
	Mark,
	MoveMeta,
	MovePlayedHandler,
	SelectHandler,
	PositionChangedHandler,
	MarksChangedHandler,
	PromoteHandler,
} from "./types";

// Options and state
export type {
	MoveOptions,
	SelectOptions,
	DragOptions,
	MarkOptions,
	AnimateOptions,
	PromotionOptions,
	BoardOptions,
	BoardState,
} from "./options";
export { DEFAULT_PENS } from "./options";

// Position (FEN)
export {
	fenToPieces,
	piecesToFen,
	INITIAL_PLACEMENT,
	kingSquare,
} from "./model/position";

// Mobility (premove targets)
export { premoveTargets } from "./model/mobility";
export type { MobilityOptions } from "./model/mobility";

// Squares (coordinates and geometry)
export {
	isSquare,
	ALL_SQUARES,
	squareToPoint,
	pointToSquare,
	squareToIndices,
	squareTopLeft,
	squareAtPixel,
} from "./model/squares";

// Input (pointer intent mapping)
export { pointerIntent } from "./input/pointerIntent";
export type { PointerButtonMap } from "./input/pointerIntent";
