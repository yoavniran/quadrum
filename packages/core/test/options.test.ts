import { defaultState, applyOptions, DEFAULT_PENS } from "../src/options";
import type { Piece, Pieces, Square } from "../src/types";

describe("options", () => {
	it("defaultState has correct defaults", () => {
		const state = defaultState();

		expect(state.orientation).toBe("white");
		expect(state.sideToMove).toBe("white");
		expect(state.checkSide).toBeNull();
		expect(state.lastMove).toBeNull();
		expect(state.selected).toBeNull();
		expect(state.coordinates).toBe(true);
		expect(state.locked).toBe(false);

		expect(state.moves.free).toBe(false);
		expect(state.moves.side).toBe("both");
		expect(state.moves.targets.size).toBe(0);
		expect(state.moves.showTargets).toBe(true);
		expect(state.moves.onPlayed).toBeNull();

		expect(state.select.enabled).toBe(true);
		expect(state.select.onSelect).toBeNull();

		expect(state.drag.enabled).toBe(true);
		expect(state.drag.threshold).toBe(3);
		expect(state.drag.removeOffBoard).toBe(false);

		expect(state.marks.enabled).toBe(true);
		expect(state.marks.user).toEqual([]);
		expect(state.marks.auto).toEqual([]);
		expect(state.marks.onChange).toBeNull();

		expect(state.animate.enabled).toBe(true);
		expect(state.animate.duration).toBe(200);

		expect(state.promotion.enabled).toBe(false);
		expect(state.promotion.onPromote).toBeNull();

		expect(state.pieces.size).toBe(0);
		expect(state.onPositionChanged).toBeNull();
	});

	it("DEFAULT_PENS has four colors", () => {
		expect(Object.keys(DEFAULT_PENS)).toHaveLength(4);
		expect(DEFAULT_PENS.green).toBeDefined();
		expect(DEFAULT_PENS.red).toBeDefined();
		expect(DEFAULT_PENS.blue).toBeDefined();
		expect(DEFAULT_PENS.yellow).toBeDefined();
	});

	it("DEFAULT_PENS have correct colors and dimensions", () => {
		expect(DEFAULT_PENS.green.color).toBe("#15781B");
		expect(DEFAULT_PENS.green.width).toBe(10);
		expect(DEFAULT_PENS.green.opacity).toBe(0.8);

		expect(DEFAULT_PENS.red.color).toBe("#882020");
		expect(DEFAULT_PENS.blue.color).toBe("#003088");
		expect(DEFAULT_PENS.yellow.color).toBe("#e68f00");
	});

	it("applyOptions parses position string", () => {
		const state = defaultState();
		const next = applyOptions(state, { position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" });

		expect(next.pieces.size).toBe(32);
		expect(next.pieces.get("e1")).toEqual({ color: "white", role: "king" });
	});

	it("applyOptions returns a new state object", () => {
		const state = defaultState();
		const next = applyOptions(state, {});

		expect(state).not.toBe(next);
		// pieces is cloned unconditionally: board.ts mutates it in place on the
		// move and drag paths, so sharing it would write through to the state the
		// caller still holds.
		expect(state.pieces).not.toBe(next.pieces);
	});

	// The groups are cloned lazily. Each one is only ever assigned through inside
	// its own `options.<group> !== undefined` branch, so an untouched group is
	// safe to alias -- and an ordinary position update touches none of them, which
	// is where the six wasted allocations per update were being paid.
	it("applyOptions clones only the groups the bag touches", () => {
		const state = defaultState();
		const next = applyOptions(state, { marks: { enabled: false } });

		expect(next.marks).not.toBe(state.marks);
		expect(next.marks.enabled).toBe(false);
		// Untouched, so aliased rather than copied.
		expect(next.moves).toBe(state.moves);
		expect(next.select).toBe(state.select);
		expect(next.drag).toBe(state.drag);
		expect(next.animate).toBe(state.animate);
		expect(next.promotion).toBe(state.promotion);
	});

	it("applyOptions does not write through an aliased group to the previous state", () => {
		const state = defaultState();
		const before = state.marks.enabled;

		// Two hops, neither touching marks, then one that does. If the lazy alias
		// let a later write land on the original object, `state` would see it.
		const a = applyOptions(state, { orientation: "black" });
		const b = applyOptions(a, { selected: "e4" });
		applyOptions(b, { marks: { enabled: !before } });

		expect(state.marks.enabled).toBe(before);
	});

	it("applyOptions does not mutate input state", () => {
		const state = defaultState();
		const original = { ...state };

		applyOptions(state, { orientation: "black" });

		expect(state.orientation).toBe("white");
		expect(state.moves).toEqual(original.moves);
	});

	it("applyOptions with undefined group leaves state untouched", () => {
		const state = defaultState();
		state.moves.showTargets = false;

		const next = applyOptions(state, { moves: undefined });

		expect(next.moves.showTargets).toBe(false);
	});

	it("applyOptions with partial group overwrites only given keys", () => {
		const state = defaultState();
		const next = applyOptions(state, { moves: { showTargets: false } });

		expect(next.moves.showTargets).toBe(false);
		expect(next.moves.free).toBe(false);
		expect(next.moves.side).toBe("both");
	});

	it("applyOptions merges pens per key", () => {
		const state = defaultState();
		const next = applyOptions(state, {
			marks: { pens: { green: { color: "#ffffff" } } },
		});

		expect(next.marks.pens.green.color).toBe("#ffffff");
		expect(next.marks.pens.green.width).toBe(10);
		expect(next.marks.pens.green.opacity).toBe(0.8);

		expect(next.marks.pens.red.color).toBe("#882020");
	});

	it("preserves marks.user when position changes", () => {
		const state = defaultState();
		state.marks.user = [{ from: "e2" }, { from: "e4", to: "e5" }];

		const next = applyOptions(state, { position: "8/8/8/8/8/8/8/8" });

		expect(next.marks.user).toEqual([{ from: "e2" }, { from: "e4", to: "e5" }]);
	});

	it("clears marks.user when explicitly set to empty", () => {
		const state = defaultState();
		state.marks.user = [{ from: "e2" }, { from: "e4", to: "e5" }];

		const next = applyOptions(state, { marks: { user: [] } });

		expect(next.marks.user).toEqual([]);
	});

	it("preserves marks.user across multiple updates", () => {
		let state = defaultState();
		state = applyOptions(state, { position: "8/8/8/8/8/8/8/8" });
		state.marks.user = [{ from: "e2" }];

		state = applyOptions(state, { orientation: "black" });
		expect(state.marks.user).toEqual([{ from: "e2" }]);

		state = applyOptions(state, { position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR" });
		expect(state.marks.user).toEqual([{ from: "e2" }]);
	});

	it("applies multiple option fields at once", () => {
		const state = defaultState();
		const next = applyOptions(state, {
			orientation: "black",
			coordinates: false,
			locked: true,
		});

		expect(next.orientation).toBe("black");
		expect(next.coordinates).toBe(false);
		expect(next.locked).toBe(true);
	});

	describe("parsed position", () => {
		it("accepts an already-parsed Pieces map", () => {
			const pieces: Pieces = new Map<Square, Piece>([
				["e4", { color: "white", role: "pawn" }],
				["e8", { color: "black", role: "king" }],
			]);

			const state = applyOptions(defaultState(), { position: pieces });

			expect(state.pieces.size).toBe(2);
			expect(state.pieces.get("e4")).toEqual({ color: "white", role: "pawn" });
		});

		it("clones the supplied map, so the caller keeps ownership", () => {
			const pieces: Pieces = new Map<Square, Piece>([
				["e4", { color: "white", role: "pawn" }],
			]);

			const state = applyOptions(defaultState(), { position: pieces });
			pieces.delete("e4");
			pieces.set("a1", { color: "black", role: "rook" });

			expect(state.pieces.get("e4")).toEqual({ color: "white", role: "pawn" });
			expect(state.pieces.has("a1")).toBe(false);
		});

		it("still parses a FEN placement string", () => {
			const state = applyOptions(defaultState(), { position: "8/8/8/8/8/8/4P3/8" });

			expect(state.pieces.size).toBe(1);
			expect(state.pieces.get("e2")).toEqual({ color: "white", role: "pawn" });
		});
	});
});
