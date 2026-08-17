/**
 * Subject versions, in a module that imports no library code and no CSS.
 *
 * The parent page needs these for the results JSON, but it must not import
 * either adapter to get them: doing so would pull both libraries' stylesheets
 * into the parent bundle and undo the frame isolation for anything the parent
 * itself measures or probes.
 *
 * Each adapter imports its own constant from here, so there is exactly one
 * place to update on a version bump.
 */

/** Mirrors packages/core/package.json. */
export const QUADRUM_VERSION = "0.2.2";

/** Mirrors the exact pin in apps/bench/package.json. */
export const CHESSGROUND_VERSION = "10.1.1";
