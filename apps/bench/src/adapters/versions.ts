/**
 * Subject versions, in a module that imports no library code and no CSS.
 *
 * The parent page needs these for the results JSON, but it must not import
 * either adapter to get them: doing so would pull both libraries' stylesheets
 * into the parent bundle and undo the frame isolation for anything the parent
 * itself measures or probes.
 *
 * Both values are DERIVED, never hand-copied. A benchmark that reports the
 * wrong subject version is publishing an unfalsifiable claim -- the pin is the
 * only thing that makes "quadrum 0.3.0 beat chessground 10.1.1" checkable, and
 * a mirrored constant goes stale silently on the next release.
 */

// quadrum exports "./package.json", so the running version is readable
// directly. Named import: Rollup shakes the rest of the manifest out.
import { version as quadrumVersion } from "quadrum/package.json";
// chessground's exports map has no "./package.json" entry (and its "./*"
// wildcard points into dist/), so its manifest is not importable. The exact
// pin in our own package.json is the next best source, and being exact it is
// the installed version by construction.
import { devDependencies } from "../../package.json";

export const QUADRUM_VERSION: string = quadrumVersion;

export const CHESSGROUND_VERSION: string =
	devDependencies["@lichess-org/chessground"];
