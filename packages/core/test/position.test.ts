import { fenToPieces, piecesToFen, clonePieces, samePieces, kingSquare, INITIAL_PLACEMENT } from "../src/model/position";

describe("position", () => {
	it("INITIAL_PLACEMENT is the expected FEN placement", () => {
		expect(INITIAL_PLACEMENT).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
	});

	it("fenToPieces parses INITIAL_PLACEMENT with 32 pieces", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);
		expect(pieces.size).toBe(32);
	});

	// Pieces are interned: one shared frozen object per FEN character, so a parse
	// allocates none. The sharing is only sound while nothing mutates a Piece in
	// place, and freeze() is what enforces that against consumer code as well --
	// without it a caller could edit one square's piece and silently change every
	// other square holding the same kind, on every board in the process.
	it("fenToPieces returns one shared frozen instance per piece kind", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);
		const a2 = pieces.get("a2")!;
		const h2 = pieces.get("h2")!;

		expect(a2).toEqual({ color: "white", role: "pawn" });
		expect(h2).toBe(a2);
		expect(Object.isFrozen(a2)).toBe(true);
		// Colour must not collapse: same role, different instance.
		expect(pieces.get("a7")).not.toBe(a2);
	});

	it("fenToPieces shares instances across separate parses", () => {
		expect(fenToPieces(INITIAL_PLACEMENT).get("e1")).toBe(
			fenToPieces("4k3/8/8/8/8/8/8/4K3").get("e1"),
		);
	});

	it("fenToPieces has correct pieces on initial position", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);

		// White pieces
		const e1 = pieces.get("e1");
		expect(e1).toEqual({ color: "white", role: "king" });

		const d8 = pieces.get("d8");
		expect(d8).toEqual({ color: "black", role: "queen" });

		const a2 = pieces.get("a2");
		expect(a2).toEqual({ color: "white", role: "pawn" });
	});

	it("fenToPieces accepts full FEN with side-to-move and castling", () => {
		const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
		const pieces = fenToPieces(fen);
		expect(pieces.size).toBe(32);
	});

	it("fenToPieces ignores tilde suffix", () => {
		const placement = "8/8/8/4k3/8/8/4K3/8";
		const withTilde = placement + "~";
		const pieces1 = fenToPieces(placement);
		const pieces2 = fenToPieces(withTilde);
		expect(samePieces(pieces1, pieces2)).toBe(true);
	});

	it("piecesToFen round-trips initial placement", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);
		const fen = piecesToFen(pieces);
		expect(fen).toBe(INITIAL_PLACEMENT);
	});

	it("piecesToFen round-trips empty board", () => {
		const fen = "8/8/8/8/8/8/8/8";
		const pieces = fenToPieces(fen);
		const result = piecesToFen(pieces);
		expect(result).toBe(fen);
	});

	it("piecesToFen round-trips sparse position", () => {
		const fen = "8/8/8/4k3/8/8/4K3/8";
		const pieces = fenToPieces(fen);
		const result = piecesToFen(pieces);
		expect(result).toBe(fen);
	});

	it("fenToPieces throws on too few ranks", () => {
		expect(() => fenToPieces("8/8/8/8/8/8/8")).toThrow(/quadrum:/);
	});

	it("fenToPieces throws on rank summing to 9", () => {
		expect(() => fenToPieces("9/8/8/8/8/8/8/8")).toThrow(/quadrum:/);
	});

	it("fenToPieces throws on unknown letter", () => {
		expect(() => fenToPieces("8/8/8/4x3/8/8/8/8")).toThrow(/quadrum:/);
	});

	it("fenToPieces throws on too many ranks", () => {
		expect(() => fenToPieces("8/8/8/8/8/8/8/8/8")).toThrow(/quadrum:/);
	});

	it("clonePieces produces an independent Map", () => {
		const original = fenToPieces(INITIAL_PLACEMENT);
		const cloned = clonePieces(original);

		expect(cloned).not.toBe(original);
		expect(samePieces(original, cloned)).toBe(true);

		// Mutate the clone
		cloned.set("a1", { color: "white", role: "queen" });

		// Original should be unchanged
		expect(original.get("a1")).toEqual({ color: "white", role: "rook" });
	});

	it("samePieces returns true for identical positions", () => {
		const pieces1 = fenToPieces(INITIAL_PLACEMENT);
		const pieces2 = fenToPieces(INITIAL_PLACEMENT);
		expect(samePieces(pieces1, pieces2)).toBe(true);
	});

	it("samePieces returns false for different sizes", () => {
		const pieces1 = fenToPieces(INITIAL_PLACEMENT);
		const pieces2 = fenToPieces("8/8/8/8/8/8/8/8");
		expect(samePieces(pieces1, pieces2)).toBe(false);
	});

	it("samePieces returns false for different pieces", () => {
		const pieces1 = fenToPieces(INITIAL_PLACEMENT);
		const pieces2 = fenToPieces("8/8/8/4k3/8/8/4K3/8");
		expect(samePieces(pieces1, pieces2)).toBe(false);
	});

	it("kingSquare finds white king", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);
		const sq = kingSquare(pieces, "white");
		expect(sq).toBe("e1");
	});

	it("kingSquare finds black king", () => {
		const pieces = fenToPieces(INITIAL_PLACEMENT);
		const sq = kingSquare(pieces, "black");
		expect(sq).toBe("e8");
	});

	it("kingSquare returns null when king is absent", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/8");
		const sq = kingSquare(pieces, "white");
		expect(sq).toBeNull();
	});
});
