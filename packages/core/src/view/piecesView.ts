import type { Piece, Role, Square, Color, Point } from "../types";
import type { BoardState } from "../options";
import { fileIndex, rankIndex, squareIndex } from "../model/squares";
import { isPlacedAt, placeSquare, setTranslate, outOfBandWrites } from "./placement";

const ROLES: readonly string[] = ["king", "queen", "rook", "bishop", "knight", "pawn"];

function isRole(value: string | undefined): value is Role {
	return value !== undefined && ROLES.includes(value);
}

// What piece an element holds, remembered on the element itself. Eliminates
// per-piece string parsing on every render. Written by createPieceEl and on
// fallback hits in pieceOf, so old or cloned elements still work.
//
// A private symbol rather than a WeakMap for the same reason as the placement
// record: this is read once per piece per render, and a property access is
// something the engine can inline where a WeakMap lookup is not.
const PIECE = Symbol("quadrum.piece");

// Monotonic across renders, so a stamp from an earlier render never reads as
// alive in this one.
let renderTick = 0;

interface PieceCarrier {
	[PIECE]?: Piece;
}

// Held-by-the-drag-layer, and which render last saw an element alive.
//
// `held` is also a class, because the stylesheet and the e2e suite both select
// on it, but the render path must not ask the DOM: renderPieces consults it
// once per piece, and classList.contains is a binding call across into the DOM
// where this is a property read.
const HELD = Symbol("quadrum.held");
const ALIVE = Symbol("quadrum.alive");

// The board's placement era, kept on the board element. A survivor whose record
// carries the current era's epoch is provably already placed -- skipping it
// elides the whole fileIndex/rankIndex/placeSquare chain, which is the single
// largest cost of an anim-off update. The era bumps on anything that
// invalidates placement wholesale (today: an orientation flip), and individual
// elements fall out of it whenever a transform is written outside placeSquare.
// Eras start at 1 so a fresh record (epoch 0) never reads as placed.
const ERA = Symbol("quadrum.placementEra");

interface Era {
	epoch: number;
	orientation: Color;
	outOfBandWriteWatermark: number;
}

interface EraCarrier {
	[ERA]?: Era;
}

interface FlagCarrier {
	[HELD]?: boolean;
	[ALIVE]?: number;
}

export function markHeld(el: HTMLElement, held: boolean): void {
	el.classList.toggle("held", held);
	(el as HTMLElement & FlagCarrier)[HELD] = held;
}

export function isHeld(el: HTMLElement): boolean {
	// The class is authoritative for an element the flag never reached -- one
	// built by cloneNode, or handed in by a consumer.
	const flag = (el as HTMLElement & FlagCarrier)[HELD];
	return flag === undefined ? el.classList.contains("held") : flag;
}

function remember(el: HTMLElement, piece: Piece): Piece {
	(el as HTMLElement & PieceCarrier)[PIECE] = piece;
	return piece;
}

export function createPieceEl(piece: Piece): HTMLElement {
	const el = document.createElement("qd-piece");
	el.classList.add(piece.color, piece.role);
	el.dataset.piece = `${piece.color}-${piece.role}`;
	// Initialised, not lazily discovered: without this every isHeld on a board
	// that never drags falls through to classList.contains -- a cross-binding
	// DOM call per piece per render that always answers false. The classList
	// fallback still covers elements this constructor never saw (cloneNode does
	// not copy symbols).
	(el as HTMLElement & FlagCarrier)[HELD] = false;
	remember(el, piece);
	return el;
}

export function pieceOf(el: HTMLElement): Piece | null {
	// The remembered piece is the fast path: one property read.
	const registered = (el as HTMLElement & PieceCarrier)[PIECE];
	if (registered) {
		return registered;
	}

	// Fallback for elements not in the registry (cloneNode or pre-stamp elements).
	// Try dataset first: one attribute read, no classList walk.
	const stamp = el.dataset.piece;
	if (stamp) {
		const parts = stamp.split("-");
		const color = parts[0];
		const role = parts[1];
		if ((color === "white" || color === "black") && isRole(role)) {
			return remember(el, { color, role });
		}
	}

	// Fall back to classList derivation for an element built before the stamp
	// existed, then back-fill both the registry and the stamp.
	const colorFromClass = el.classList.contains("white") ? "white" : el.classList.contains("black") ? "black" : null;
	const roleFromClass = colorFromClass ? Array.from(el.classList).find((c) => ROLES.includes(c)) : undefined;

	if (!colorFromClass || !isRole(roleFromClass)) {
		return null;
	}

	el.dataset.piece = `${colorFromClass}-${roleFromClass}`;
	return remember(el, { color: colorFromClass, role: roleFromClass });
}

// Inlined rather than calling squareToPoint, which returns a fresh {x, y} that
// is read twice and dropped. This runs once per piece per render, so the object
// was 32 allocations an update for two numbers.
export function placePieceEl(el: HTMLElement, square: Square, orientation: Color, offset?: Point, epoch = 0): void {
	const file = fileIndex(square);
	const rank = rankIndex(square);
	const white = orientation === "white";

	placeSquare(
		el,
		square,
		(white ? file : 7 - file) + (offset?.x ?? 0),
		(white ? 7 - rank : rank) + (offset?.y ?? 0),
		epoch,
	);
}

export function placePieceAtPoint(el: HTMLElement, point: Point): void {
	// Centred on the pointer rather than on a square, hence the half-square shift.
	setTranslate(el, point.x - 0.5, point.y - 0.5);
}

interface Pair {
	vacatedSq: Square;
	// Carried on the pair rather than looked up from `els` when the move is
	// applied. The moves are applied in a loop that also rewrites `els`, so a
	// chain -- something moving into a square that is itself vacating, which is
	// every castle and every recapture -- would otherwise hand the second move
	// the element the first one just parked there.
	vacatedEl: HTMLElement;
	neededSq: Square;
	distance: number;
	vacatedIdx: number;
	neededIdx: number;
}

function applyPairing(board: HTMLElement, els: Map<Square, HTMLElement>, state: BoardState, epoch: number, needed: Square[], vacated: Array<[Square, HTMLElement]>): void {
	// Build valid pairs (same color and role).
	const pairs: Pair[] = [];

	for (const [vacatedSq, vacatedEl] of vacated) {
		const vacatedPiece = pieceOf(vacatedEl);
		if (!vacatedPiece) continue;
		const vacatedIdx = squareIndex(vacatedSq);

		for (const neededSq of needed) {
			const neededPiece = state.pieces.get(neededSq);
			if (!neededPiece) continue;
			const neededIdx = squareIndex(neededSq);

			if (
				vacatedPiece.color === neededPiece.color &&
				vacatedPiece.role === neededPiece.role
			) {
				const vf = fileIndex(vacatedSq);
				const vr = rankIndex(vacatedSq);
				const nf = fileIndex(neededSq);
				const nr = rankIndex(neededSq);

				const distance = Math.sqrt((vf - nf) * (vf - nf) + (vr - nr) * (vr - nr));

				pairs.push({
					vacatedSq,
					vacatedEl,
					neededSq,
					distance,
					vacatedIdx,
					neededIdx,
				});
			}
		}
	}

	// Sort pairs: distance ascending, then vacatedIdx, then neededIdx.
	// This matches planDiff's ordering so the animation sees the same moves.
	pairs.sort((a, b) => {
		if (a.distance !== b.distance) {
			return a.distance - b.distance;
		}
		if (a.vacatedIdx !== b.vacatedIdx) {
			return a.vacatedIdx - b.vacatedIdx;
		}
		return a.neededIdx - b.neededIdx;
	});

	// Greedy selection only -- nothing is applied yet. Applying moves inside this
	// loop would rewrite `els` while later pairs still needed to read it.
	const usedVacated = new Set<Square>();
	const usedNeeded = new Set<Square>();
	const moves: Array<{ el: HTMLElement; to: Square }> = [];

	for (const pair of pairs) {
		if (usedVacated.has(pair.vacatedSq) || usedNeeded.has(pair.neededSq)) {
			continue;
		}
		moves.push({ el: pair.vacatedEl, to: pair.neededSq });
		usedVacated.add(pair.vacatedSq);
		usedNeeded.add(pair.neededSq);
	}

	// PASS 3: apply. Every vacated square leaves the map before any destination
	// enters it. A square can be both a source and a destination -- a recapture
	// vacates the captured piece's square and needs it for the capturer, and a
	// castle chains two moves through adjacent squares -- so interleaving the
	// deletes with the sets would let one move's delete undo another's set and
	// strand a live element with no map entry, invisible to every later render.
	for (const [vacatedSq] of vacated) {
		els.delete(vacatedSq);
	}

	for (const [vacatedSq, el] of vacated) {
		if (!usedVacated.has(vacatedSq) && el.parentNode === board) {
			board.removeChild(el);
		}
	}

	for (const move of moves) {
		placePieceEl(move.el, move.to, state.orientation, undefined, epoch);
		els.set(move.to, move.el);
	}

	for (const neededSq of needed) {
		if (!usedNeeded.has(neededSq)) {
			const piece = state.pieces.get(neededSq);
			if (piece) {
				const newEl = createPieceEl(piece);
				placePieceEl(newEl, neededSq, state.orientation, undefined, epoch);
				board.appendChild(newEl);
				els.set(neededSq, newEl);
			}
		}
	}
}

export function renderPieces(board: HTMLElement, els: Map<Square, HTMLElement>, state: BoardState, changed?: readonly Square[] | null): void {
	const tick = ++renderTick;
	const needed: Square[] = [];
	const vacated: Array<[Square, HTMLElement]> = [];

	const carrier = board as HTMLElement & EraCarrier;
	let era = carrier[ERA];
	let eraCreatedOrBumped = false;

	if (!era) {
		era = { epoch: 1, orientation: state.orientation, outOfBandWriteWatermark: 0 };
		carrier[ERA] = era;
		eraCreatedOrBumped = true;
	} else if (era.orientation !== state.orientation) {
		era.epoch++;
		era.orientation = state.orientation;
		eraCreatedOrBumped = true;
	}

	const epoch = era.epoch;
	const writeCount = outOfBandWrites();
	// Read the watermark before overwriting it: the guard below needs the count as
	// this board's *previous* render left it. The store has to happen here rather
	// than beside the guard, so that every path out of this function -- fast, early
	// exit, full scan -- leaves it current.
	const writesAtLastRender = era.outOfBandWriteWatermark;
	era.outOfBandWriteWatermark = writeCount;

	// Fast path: guards all hold.
	if (
		changed !== null &&
		changed !== undefined &&
		!eraCreatedOrBumped &&
		writesAtLastRender === writeCount
	) {
		// Guard 4: occupancy arithmetic check. Pre-walk changed to verify the
		// els/position invariant holds.
		let occupiedInChanged = 0;
		let elsInChanged = 0;

		for (const sq of changed) {
			if (state.pieces.has(sq)) occupiedInChanged++;
			if (els.has(sq)) elsInChanged++;
		}

		if (els.size === elsInChanged + (state.pieces.size - occupiedInChanged)) {
			// Restricted PASS 1: walk changed only.
			for (const sq of changed) {
				const piece = state.pieces.get(sq);
				if (!piece) continue;

				const existing = els.get(sq);

				if (existing && isHeld(existing)) {
					(existing as HTMLElement & FlagCarrier)[ALIVE] = tick;
					continue;
				}

				if (existing) {
					const occupant = pieceOf(existing);
					if (occupant === piece || (occupant && occupant.color === piece.color && occupant.role === piece.role)) {
						if (!isPlacedAt(existing, sq, epoch)) {
							placePieceEl(existing, sq, state.orientation, undefined, epoch);
						}
						(existing as HTMLElement & FlagCarrier)[ALIVE] = tick;
						continue;
					}
				}

				needed.push(sq);
			}

			// Restricted PASS 2: walk changed only. Unchanged squares are never
			// stamped alive, so an unrestricted scan would remove them all.
			for (const sq of changed) {
				const el = els.get(sq);
				if (el && (el as HTMLElement & FlagCarrier)[ALIVE] !== tick && !isHeld(el)) {
					vacated.push([sq, el]);
				}
			}

			if (needed.length === 0 && vacated.length === 0) {
				return;
			}

			applyPairing(board, els, state, epoch, needed, vacated);
			return;
		}
	}

	// Full scan fallback.
	let survivors = 0;

	for (const [square, piece] of state.pieces) {
		const existing = els.get(square);

		if (existing && isHeld(existing)) {
			(existing as HTMLElement & FlagCarrier)[ALIVE] = tick;
			survivors++;
			continue;
		}

		if (existing) {
			const occupant = pieceOf(existing);
			if (occupant === piece || (occupant && occupant.color === piece.color && occupant.role === piece.role)) {
				if (!isPlacedAt(existing, square, epoch)) {
					placePieceEl(existing, square, state.orientation, undefined, epoch);
				}
				(existing as HTMLElement & FlagCarrier)[ALIVE] = tick;
				survivors++;
				continue;
			}
		}

		needed.push(square);
	}

	// Every piece survived in place: `vacated` is provably empty too, so the
	// residual passes would walk `els` to build nothing. Survivors are distinct
	// elements of `els`, so an equal count means every entry survived.
	if (survivors === state.pieces.size && survivors === els.size) {
		return;
	}

	for (const [square, el] of els) {
		if ((el as HTMLElement & FlagCarrier)[ALIVE] !== tick && !isHeld(el)) {
			vacated.push([square, el]);
		}
	}

	applyPairing(board, els, state, epoch, needed, vacated);
}
