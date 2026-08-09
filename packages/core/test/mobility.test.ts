import { premoveTargets } from "../src/model/mobility";
import { fenToPieces } from "../src/model/position";

describe("mobility", () => {
	it("returns empty array for empty square", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/8");
		const targets = premoveTargets(pieces, "e4");
		expect(targets).toEqual([]);
	});

	it("knight on b1 from initial position returns a3, c3 and the friendly d2", () => {
		const pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const targets = premoveTargets(pieces, "b1");
		// d2 holds White's own pawn, and is offered anyway — Nb1-d2 is a normal
		// premove betting that pawn is gone by the time the reply lands.
		expect(targets.sort()).toEqual(["a3", "c3", "d2"]);
	});

	it("white pawn on e2 initial returns e3, e4, d3, f3", () => {
		const pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const targets = premoveTargets(pieces, "e2");
		expect(targets.sort()).toEqual(["d3", "e3", "e4", "f3"]);
	});

	it("black pawn on e7 initial returns e6, e5, d6, f6", () => {
		const pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const targets = premoveTargets(pieces, "e7");
		expect(targets.sort()).toEqual(["d6", "e5", "e6", "f6"]);
	});

	it("bishop on d4 empty board returns full diagonals", () => {
		const pieces = fenToPieces("8/8/8/8/3B4/8/8/8");
		const targets = premoveTargets(pieces, "d4");
		expect(targets.sort()).toEqual([
			"a1", "b2", "c3", "e5", "f6", "g7", "h8",
			"a7", "b6", "c5", "e3", "f2", "g1",
		].sort());
	});

	it("rook ray offers the friendly-occupied square, then stops on it", () => {
		// uppercase P — a white pawn, friendly to the white rook on d4.
		// A premove onto your own piece is legal: you are betting the opponent
		// captures that pawn before the premove runs. What occupancy decides is
		// only that the ray cannot continue past d2.
		const pieces = fenToPieces("8/8/8/8/3R4/8/3P4/8");
		const targets = premoveTargets(pieces, "d4");
		expect(targets).toContain("d3");
		expect(targets).toContain("d2");
		expect(targets).not.toContain("d1");
	});

	it("knight may premove onto a friendly-occupied square", () => {
		// white knight d4, white pawn e6 — one knight-move away
		const pieces = fenToPieces("8/8/4P3/8/3N4/8/8/8");
		const targets = premoveTargets(pieces, "d4");
		expect(targets).toContain("e6");
	});

	it("rook ray meets enemy piece and includes it", () => {
		const pieces = fenToPieces("8/8/8/8/3R4/8/3p4/8");
		const targets = premoveTargets(pieces, "d4");
		// d2 is black pawn, should be included
		expect(targets).toContain("d2");
	});

	it("white king on e1 with rook h1 includes g1 castling", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/4K2R");
		const targets = premoveTargets(pieces, "e1");
		expect(targets).toContain("g1");
	});

	it("white king on e1 without rook h1 does not include g1", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/4K3");
		const targets = premoveTargets(pieces, "e1");
		expect(targets).not.toContain("g1");
	});

	it("white king on e1 with rook on a1 includes c1 castling", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/R3K3");
		const targets = premoveTargets(pieces, "e1");
		expect(targets).toContain("c1");
	});

	it("king can move to adjacent squares", () => {
		const pieces = fenToPieces("8/8/8/8/3K4/8/8/8");
		const targets = premoveTargets(pieces, "d4");
		expect(targets.sort()).toEqual([
			"c3", "c4", "c5", "d3", "d5", "e3", "e4", "e5",
		].sort());
	});

	it("never returns the origin square", () => {
		const pieces = fenToPieces("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
		const targets = premoveTargets(pieces, "e2");
		expect(targets).not.toContain("e2");
	});

	// The king sits on d1, three files from the rook on a1, deliberately: with the
	// king on b1 the rook square is also an ordinary adjacent step, so a1 would be
	// offered either way and the test could not tell king-takes-rook apart from a
	// one-square king move onto a friendly piece.
	it("chess960 king-takes-rook offers the distant own rook's square", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/R2K4");
		const targets = premoveTargets(pieces, "d1", { chess960: true });
		expect(targets).toContain("a1");
	});

	it("without the chess960 flag the distant own rook's square is not offered", () => {
		const pieces = fenToPieces("8/8/8/8/8/8/8/R2K4");
		const targets = premoveTargets(pieces, "d1");
		expect(targets).not.toContain("a1");
	});

	it("queen combines rook and bishop rays", () => {
		const pieces = fenToPieces("8/8/8/8/3Q4/8/8/8");
		const targets = premoveTargets(pieces, "d4");
		// Should have rook rays (verticals/horizontals) and bishop rays (diagonals)
		expect(targets).toContain("d8");
		expect(targets).toContain("a4");
		expect(targets).toContain("h4");
		expect(targets).toContain("a7");
	});
});
