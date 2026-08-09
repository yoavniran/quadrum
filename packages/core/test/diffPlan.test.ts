import { planDiff } from "../src/model/diffPlan";
import { fenToPieces, clonePieces } from "../src/model/position";

describe("diffPlan", () => {
	it("quiet move e2->e4 produces one move", () => {
		const before = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const after = fenToPieces("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(1);
		expect(plan.moves[0]).toEqual({ piece: { color: "white", role: "pawn" }, from: "e2", to: "e4" });
		expect(plan.fades).toHaveLength(0);
		expect(plan.appears).toHaveLength(0);
	});

	it("capture produces one move and one fade", () => {
		// white pawn e4 takes the black pawn on d5
		const before = fenToPieces("8/8/8/3p4/4P3/8/8/8");
		const after = fenToPieces("8/8/8/3P4/8/8/8/8");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(1);
		expect(plan.moves[0]).toEqual({ piece: { color: "white", role: "pawn" }, from: "e4", to: "d5" });
		expect(plan.fades).toHaveLength(1);
		expect(plan.fades[0]).toEqual({ piece: { color: "black", role: "pawn" }, square: "d5" });
	});

	it("castling produces two moves", () => {
		// black castles queenside: king e8->c8 AND rook a8->d8
		const before = fenToPieces("r3k2r/8/8/8/8/8/8/R3K2R");
		const after = fenToPieces("2kr3r/8/8/8/8/8/8/R3K2R");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(2);
		expect(plan.fades).toHaveLength(0);
		expect(plan.appears).toHaveLength(0);
	});

	it("en passant produces one move and one fade", () => {
		// White pawn on e5, black pawn on d5, white captures en passant to d6
		const before = fenToPieces("8/8/8/3pP3/8/8/8/8");
		const after = fenToPieces("8/8/3P4/8/8/8/8/8");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(1);
		expect(plan.moves[0]).toEqual({ piece: { color: "white", role: "pawn" }, from: "e5", to: "d6" });
		expect(plan.fades).toHaveLength(1);
		expect(plan.fades[0]).toEqual({ piece: { color: "black", role: "pawn" }, square: "d5" });
	});

	it("promotion produces fade and appear, no move", () => {
		// White pawn on b7 promotes to queen on b8
		const before = fenToPieces("8/1P6/8/8/8/8/8/8");
		const after = fenToPieces("1Q6/8/8/8/8/8/8/8");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(0);
		expect(plan.fades).toHaveLength(1);
		expect(plan.fades[0]).toEqual({ piece: { color: "white", role: "pawn" }, square: "b7" });
		expect(plan.appears).toHaveLength(1);
		expect(plan.appears[0]).toBe("b8");
	});

	it("identical before and after produces empty plan", () => {
		const before = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const after = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");

		const plan = planDiff(before, after);

		expect(plan.moves).toHaveLength(0);
		expect(plan.fades).toHaveLength(0);
		expect(plan.appears).toHaveLength(0);
	});

	it("opts.exclude removes dragged square from vanished", () => {
		const before = fenToPieces("8/8/8/3p4/4P3/8/8/8");
		const after = fenToPieces("8/8/8/3P4/8/8/8/8");

		// e4 is the square the user is dragging from. Its piece is already
		// under the pointer, so it must not be animated: excluding it from
		// `vanished` leaves nothing to pair the arriving pawn with.
		const plan = planDiff(before, after, { exclude: "e4" });

		expect(plan.moves).toHaveLength(0);
		expect(plan.appears).toEqual(["d5"]);
		// the captured black pawn still fades
		expect(plan.fades).toHaveLength(1);
		expect(plan.fades[0]).toEqual({ piece: { color: "black", role: "pawn" }, square: "d5" });
	});

	it("does not mutate input Maps", () => {
		const before = fenToPieces("8/8/8/3p4/4P3/8/8/8");
		const after = fenToPieces("8/8/8/4P3/8/8/8/8");

		const beforeClone = clonePieces(before);
		const afterClone = clonePieces(after);

		planDiff(before, after);

		// Verify originals are unchanged
		for (const [sq, piece] of beforeClone) {
			expect(before.get(sq)).toEqual(piece);
		}
		for (const [sq, piece] of afterClone) {
			expect(after.get(sq)).toEqual(piece);
		}
	});

	it("pairs pieces by color and role", () => {
		// Two white rooks: one moves from a1 to a3, one from h1 to h3
		const before = fenToPieces("8/8/8/8/8/8/8/R6R");
		const after = fenToPieces("R6R/8/8/8/8/8/8/8");

		const plan = planDiff(before, after);

		// Should be two moves, not a mix of fades and appears
		expect(plan.moves).toHaveLength(2);
		expect(plan.fades).toHaveLength(0);
		expect(plan.appears).toHaveLength(0);
	});
});
