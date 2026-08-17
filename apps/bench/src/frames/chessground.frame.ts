/**
 * chessground's frame entry. Imports chessground and chessground's CSS,
 * nothing else.
 */

import { chessgroundAdapter } from "../adapters/chessground/index";
import { installFrame } from "./boot";

installFrame(chessgroundAdapter);
