# quadrum

A small, MIT-licensed, **zero-dependency** chess **board renderer** for the web.

quadrum draws a chess board and the pieces on it, animates moves, and handles selection,
click-to-move, dragging and hand-drawn arrows and circles. It does **not** know the rules
of chess: legal destinations are handed in by the consumer, which keeps it usable with any
rules engine (chess.js, a server, a variant) and keeps the library small.

It exists because [chessground](https://github.com/lichess-org/chessground) is GPL-3.0,
which many applications cannot ship. quadrum is a clean-room MIT alternative.

> **Status: pre-alpha.** The API is settled, but expect breaking changes before 1.0.

```bash
npm install quadrum
```

```ts
import { createBoard } from "quadrum";
import "quadrum/assets/quadrum.css";

const board = createBoard(document.getElementById("board")!, {
	position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
	orientation: "white",
	moves: {
		targets: new Map([["e2", ["e3", "e4"]]]),
		onPlayed: (from, to) => console.log(from, to),
	},
});

board.update({ position: nextFen, lastMove: ["e2", "e4"] });
```

Subpath entries: `quadrum/fen`, `quadrum/mobility`, `quadrum/premove`, and
`quadrum/assets/quadrum.css`.

**The shipped CSS is structural only** — no colours, no square painting, no piece art. That
is deliberate: theming is the application's job, and quadrum's DOM is plain and light-DOM so
ordinary CSS can reach it. See the demo app in the repository for a worked example
(`apps/demo/src/board-chrome.css`).

Using React? See [`quadrum-react`](https://www.npmjs.com/package/quadrum-react).

Full documentation: <https://github.com/yoavniran/quadrum>

MIT © Yoav Niran
