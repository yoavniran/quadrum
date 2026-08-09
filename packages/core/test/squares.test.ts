import { FILES, RANKS, ALL_SQUARES, isSquare, fileIndex, rankIndex, squareAt, squareToPoint, pointToSquare, clientToPoint, sameSquare, squareToIndices, squareTopLeft, squareAtPixel } from "../src/model/squares";

describe("squares", () => {
	it("FILES contains a through h", () => {
		expect(FILES).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
	});

	it("RANKS contains 1 through 8", () => {
		expect(RANKS).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
	});

	it("ALL_SQUARES has 64 entries in file-major order", () => {
		expect(ALL_SQUARES).toHaveLength(64);
		expect(ALL_SQUARES[0]).toBe("a1");
		expect(ALL_SQUARES[1]).toBe("a2");
		expect(ALL_SQUARES[7]).toBe("a8");
		expect(ALL_SQUARES[8]).toBe("b1");
		expect(ALL_SQUARES[63]).toBe("h8");
	});

	it("isSquare accepts valid squares", () => {
		expect(isSquare("a1")).toBe(true);
		expect(isSquare("h8")).toBe(true);
		expect(isSquare("e4")).toBe(true);
	});

	it("isSquare rejects invalid squares", () => {
		expect(isSquare("i1")).toBe(false);
		expect(isSquare("a9")).toBe(false);
		expect(isSquare("")).toBe(false);
		expect(isSquare(5)).toBe(false);
		expect(isSquare(null)).toBe(false);
	});

	it("fileIndex maps a-h to 0-7", () => {
		expect(fileIndex("a1")).toBe(0);
		expect(fileIndex("h8")).toBe(7);
		expect(fileIndex("d4")).toBe(3);
	});

	it("rankIndex maps 1-8 to 0-7", () => {
		expect(rankIndex("a1")).toBe(0);
		expect(rankIndex("h8")).toBe(7);
		expect(rankIndex("e4")).toBe(3);
	});

	it("squareAt returns null out of range", () => {
		expect(squareAt(-1, 0)).toBeNull();
		expect(squareAt(8, 0)).toBeNull();
		expect(squareAt(0, -1)).toBeNull();
		expect(squareAt(0, 8)).toBeNull();
	});

	it("squareAt returns correct square in range", () => {
		expect(squareAt(0, 0)).toBe("a1");
		expect(squareAt(7, 7)).toBe("h8");
		expect(squareAt(4, 3)).toBe("e4");
	});

	it("squareToPoint for white orientation", () => {
		const a1 = squareToPoint("a1", "white");
		expect(a1.x).toBe(0);
		expect(a1.y).toBe(7);

		const h8 = squareToPoint("h8", "white");
		expect(h8.x).toBe(7);
		expect(h8.y).toBe(0);

		// rank 4 is the 5th row from the top when white is at the bottom
		const e4 = squareToPoint("e4", "white");
		expect(e4.x).toBe(4);
		expect(e4.y).toBe(4);
	});

	it("squareToPoint for black orientation", () => {
		const a1 = squareToPoint("a1", "black");
		expect(a1.x).toBe(7);
		expect(a1.y).toBe(0);

		const h8 = squareToPoint("h8", "black");
		expect(h8.x).toBe(0);
		expect(h8.y).toBe(7);

		const e4 = squareToPoint("e4", "black");
		expect(e4.x).toBe(3);
		expect(e4.y).toBe(3);
	});

	it("pointToSquare round-trips for white orientation", () => {
		for (const square of ALL_SQUARES) {
			const point = squareToPoint(square, "white");
			const result = pointToSquare(point.x, point.y, "white");
			expect(result).toBe(square);
		}
	});

	it("pointToSquare round-trips for black orientation", () => {
		for (const square of ALL_SQUARES) {
			const point = squareToPoint(square, "black");
			const result = pointToSquare(point.x, point.y, "black");
			expect(result).toBe(square);
		}
	});

	it("pointToSquare returns null for out-of-range coordinates", () => {
		expect(pointToSquare(-0.1, 0, "white")).toBeNull();
		expect(pointToSquare(8.1, 0, "white")).toBeNull();
		expect(pointToSquare(0, -0.1, "white")).toBeNull();
		expect(pointToSquare(0, 8.1, "white")).toBeNull();
	});

	it("clientToPoint with a standard rect", () => {
		const rect = { left: 0, top: 0, width: 800, height: 800 } as DOMRect;

		const point = clientToPoint(0, 0, rect);
		expect(point.x).toBe(0);
		expect(point.y).toBe(0);

		const point2 = clientToPoint(800, 800, rect);
		expect(point2.x).toBe(8);
		expect(point2.y).toBe(8);

		const point3 = clientToPoint(400, 400, rect);
		expect(point3.x).toBe(4);
		expect(point3.y).toBe(4);
	});

	it("clientToPoint accounts for rect offset", () => {
		const rect = { left: 100, top: 200, width: 800, height: 800 } as DOMRect;

		const point = clientToPoint(100, 200, rect);
		expect(point.x).toBe(0);
		expect(point.y).toBe(0);

		const point2 = clientToPoint(900, 1000, rect);
		expect(point2.x).toBe(8);
		expect(point2.y).toBe(8);
	});

	it("sameSquare compares squares or null", () => {
		expect(sameSquare("a1", "a1")).toBe(true);
		expect(sameSquare("a1", "a2")).toBe(false);
		expect(sameSquare(null, null)).toBe(true);
		expect(sameSquare("a1", null)).toBe(false);
		expect(sameSquare(null, "a1")).toBe(false);
	});

	it("squareToIndices maps corners", () => {
		expect(squareToIndices("a1")).toEqual({ file: 0, rank: 0 });
		expect(squareToIndices("h8")).toEqual({ file: 7, rank: 7 });
		expect(squareToIndices("e4")).toEqual({ file: 4, rank: 3 });
	});

	it("squareToIndices rejects malformed keys", () => {
		expect(squareToIndices("")).toBeNull();
		expect(squareToIndices("z9")).toBeNull();
		expect(squareToIndices("a0")).toBeNull();
	});

	it("squareTopLeft: white: a1 bottom-left, h8 top-right", () => {
		const size = 800;
		expect(squareTopLeft("a1", "white", size)).toEqual({ x: 0, y: 700 });
		expect(squareTopLeft("h8", "white", size)).toEqual({ x: 700, y: 0 });
		expect(squareTopLeft("a8", "white", size)).toEqual({ x: 0, y: 0 });
	});

	it("squareTopLeft: black: mirrored", () => {
		const size = 800;
		expect(squareTopLeft("a1", "black", size)).toEqual({ x: 700, y: 0 });
		expect(squareTopLeft("h8", "black", size)).toEqual({ x: 0, y: 700 });
	});

	it("squareTopLeft: null for malformed", () => {
		expect(squareTopLeft("zz", "white", 800)).toBeNull();
	});

	it("squareAtPixel: white: inverts squareTopLeft (square centre)", () => {
		const size = 800;
		for (const sq of ["a1", "h8", "e4", "d5"]) {
			const pos = squareTopLeft(sq, "white", size)!;
			expect(squareAtPixel(pos.x + 50, pos.y + 50, "white", size)).toBe(sq);
		}
	});

	it("squareAtPixel: black: inverts squareTopLeft", () => {
		const size = 800;
		for (const sq of ["a1", "h8", "e4"]) {
			const pos = squareTopLeft(sq, "black", size)!;
			expect(squareAtPixel(pos.x + 50, pos.y + 50, "black", size)).toBe(sq);
		}
	});

	it("squareAtPixel: returns null outside the board", () => {
		const size = 800;
		expect(squareAtPixel(-1, 10, "white", size)).toBeNull();
		expect(squareAtPixel(10, size, "white", size)).toBeNull();
		expect(squareAtPixel(size + 5, 10, "white", size)).toBeNull();
	});
});
