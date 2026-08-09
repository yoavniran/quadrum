import { describe, expect, it } from "vitest";
import {
	castlingAllowed,
	premoveDests,
	premovePromotes,
	projectPremoves,
	type PremoveIntent,
} from "../src/premove";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** The placement field alone — the rest of a projected FEN is deliberately fake. */
function placement(fen: string): string {
	return fen.split(" ")[0];
}

describe("projectPremoves", () => {
	it("returns the position untouched when nothing is queued", () => {
		// identity matters: a changed string would re-render both boards every tick
		expect(projectPremoves(START, [], "w")).toBe(START);
	});

	it("walks a stack of pre-moves in order", () => {
		const queue: PremoveIntent[] = [
			{ from: "e2", to: "e4" },
			{ from: "g1", to: "f3" },
			{ from: "f1", to: "c4" },
		];
		expect(placement(projectPremoves(START, queue, "w"))).toBe(
			"rnbqkbnr/pppppppp/8/8/2B1P3/5N2/PPPP1PPP/RNBQK2R",
		);
	});

	it("hands the board back to the premoving side", () => {
		expect(projectPremoves(START, [{ from: "e2", to: "e4" }], "w").split(" ")[1]).toBe("w");
		expect(projectPremoves(START, [{ from: "e7", to: "e5" }], "b").split(" ")[1]).toBe("b");
	});

	it("drags the rook along when the king castles", () => {
		const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
		expect(placement(projectPremoves(fen, [{ from: "e1", to: "g1" }], "w"))).toBe(
			"r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1",
		);
		expect(placement(projectPremoves(fen, [{ from: "e1", to: "c1" }], "w"))).toBe(
			"r3k2r/pppppppp/8/8/8/8/PPPPPPPP/2KR3R",
		);
		expect(placement(projectPremoves(fen, [{ from: "e8", to: "c8" }], "b"))).toBe(
			"2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R",
		);
	});

	it("removes the pawn taken en passant, which is not on the destination square", () => {
		const fen = "rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3";
		expect(placement(projectPremoves(fen, [{ from: "d5", to: "c6" }], "w"))).toBe(
			"rnbqkbnr/pp1ppppp/2P5/8/8/8/PPP1PPPP/RNBQKBNR",
		);
	});

	it("leaves an ordinary diagonal capture alone", () => {
		const fen = "rnbqkbnr/pp1ppppp/8/2p5/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3";
		expect(placement(projectPremoves(fen, [{ from: "d4", to: "c5" }], "w"))).toBe(
			"rnbqkbnr/pp1ppppp/8/2P5/8/8/PPP1PPPP/RNBQKBNR",
		);
	});

	it("swaps in the chosen piece on promotion", () => {
		const fen = "8/P7/8/8/8/8/8/K6k w - - 0 1";
		expect(placement(projectPremoves(fen, [{ from: "a7", to: "a8", promotion: "knight" }], "w"))).toBe(
			"N7/8/8/8/8/8/8/K6k",
		);
	});

	it("ignores a pre-move whose piece is no longer there", () => {
		// the queue is projected against a board that may already have moved on
		expect(placement(projectPremoves(START, [{ from: "e4", to: "e5" }], "w"))).toBe(
			placement(START),
		);
	});
});

describe("premoveDests", () => {
	it("offers every pawn and knight move from the start, for one side only", () => {
		const dests = premoveDests(START, "w", true);
		expect(dests.get("e2")).toEqual(expect.arrayContaining(["e3", "e4"]));
		expect(dests.get("g1")).toEqual(expect.arrayContaining(["f3", "h3"]));
		expect(dests.has("e7")).toBe(false);
	});

	it("offers a pawn capture onto an empty square — the recapture being bet on", () => {
		// the whole point of a pre-move: d5xe6 is illegal now, legal after ...e6
		const fen = "rnbqkbnr/pppp1ppp/8/3P4/8/8/PPP1PPPP/RNBQKBNR w KQkq - 0 3";
		expect(premoveDests(fen, "w", true).get("d5")).toContain("e6");
	});

	it("includes castling when the rights are there, and not otherwise", () => {
		const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
		expect(premoveDests(fen, "w", true).get("e1")).toContain("g1");
		expect(premoveDests(fen, "w", false).get("e1")).not.toContain("g1");
	});

	it("drops the king-takes-own-rook spelling of castling, which chess.js cannot play", () => {
		const fen = "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1";
		const kingDests = premoveDests(fen, "w", true).get("e1") ?? [];
		expect(kingDests).not.toContain("h1");
		expect(kingDests).not.toContain("a1");
		expect(kingDests).toContain("c1");
	});

	it("offers destinations from every piece type", () => {
		const dests = premoveDests(START, "w", true);
		// Pawns can move forward from the second rank
		expect(dests.get("e2")).toBeDefined();
		expect(dests.get("e2")).toContain("e3");
		// Knights have valid destinations
		expect(dests.get("g1")).toBeDefined();
		expect(dests.get("g1")).toContain("f3");
	});
});

describe("premovePromotes", () => {
	const fen = "8/P7/8/8/8/8/7p/K6k w - - 0 1";

	it("spots a pawn reaching the last rank, for either colour", () => {
		expect(premovePromotes(fen, "a7" as any, "a8" as any)).toBe(true);
		expect(premovePromotes(fen, "h2" as any, "h1" as any)).toBe(true);
	});

	it("says no for a non-pawn, an empty square, or a short step", () => {
		expect(premovePromotes(fen, "a1" as any, "a2" as any)).toBe(false);
		expect(premovePromotes(fen, "d4" as any, "d5" as any)).toBe(false);
		expect(premovePromotes("8/8/P7/8/8/8/8/K6k w - - 0 1", "a6" as any, "a7" as any)).toBe(false);
	});
});

describe("castlingAllowed", () => {
	it("reads the rights field per colour", () => {
		expect(castlingAllowed(START, "w")).toBe(true);
		expect(castlingAllowed(START, "b")).toBe(true);
		expect(castlingAllowed("8/8/8/8/8/8/8/K6k w Kk - 0 1", "w")).toBe(true);
		expect(castlingAllowed("8/8/8/8/8/8/8/K6k w k - 0 1", "w")).toBe(false);
		expect(castlingAllowed("8/8/8/8/8/8/8/K6k w - - 0 1", "b")).toBe(false);
	});
});
