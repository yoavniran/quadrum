/**
 * quadrum's frame entry. Imports quadrum and quadrum's CSS, nothing else.
 */

import { quadrumAdapter } from "../adapters/quadrum/index";
import { installFrame } from "./boot";

installFrame(quadrumAdapter);
