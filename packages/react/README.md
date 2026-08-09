# quadrum-react

React bindings for [`quadrum`](https://www.npmjs.com/package/quadrum), the MIT,
zero-dependency chess board renderer.

> **Status: pre-alpha.** The API is settled, but expect breaking changes before 1.0.

```bash
npm install quadrum quadrum-react
```

`quadrum` and `react` are peer dependencies — you install them yourself, so there is never a
second copy of either.

```tsx
import { Board } from "quadrum-react";
import "quadrum/assets/quadrum.css";

<Board
	position={fen}
	orientation="white"
	targets={legalDests}
	lastMove={lastMove}
	onMove={(from, to) => play(from, to)}
/>;
```

The package exposes a controlled `<Board>` component and the `useBoard` hook it is built on;
reach for `useBoard` when you need the imperative board handle.

Unlike chessground, setting a new `position` never clears the user's arrows and circles —
opt into that with `clearMarksOnPositionChange`.

Board visuals (squares, piece art, coordinates) are **not** shipped: quadrum's CSS is
structural only and theming is the application's job. See `apps/demo/src/board-chrome.css` in
the repository for a worked example.

Full documentation: <https://github.com/yoavniran/quadrum>

MIT © Yoav Niran
