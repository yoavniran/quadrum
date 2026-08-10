/**
 * The seam. Every adapter, scenario, harness and runner module imports from here
 * and nothing else defines a shared shape. Keep it free of runtime code so the
 * Node-side runner can import it under type stripping.
 */

export type AdapterId = "quadrum" | "chessground";
export type BenchColor = "white" | "black";
/** "a1".."h8". Deliberately a plain string: bench code must not depend on
 *  quadrum's `Square` template type, or the two libraries stop being symmetric. */
export type BenchSquare = string;
export type ArrowColor = "green" | "red" | "blue" | "yellow";

export interface BenchArrow {
	readonly from: BenchSquare;
	readonly to: BenchSquare;
	readonly color: ArrowColor;
}

/** Everything a board needs at mount. No field is optional and there is no
 *  adapter-specific escape hatch: that is what stops one library being quietly
 *  mounted with fewer features than the other. */
export interface MountOptions {
	/** FEN placement field only (the first space-delimited group). */
	readonly placement: string;
	readonly orientation: BenchColor;
	readonly coordinates: boolean;
	readonly animate: boolean;
	readonly animationMs: number;
	/** Drag and move handling bound. False for pure-render scenarios. */
	readonly interactive: boolean;
	/** Edge length in CSS px. Both frames are pinned to this exact box. */
	readonly sizePx: number;
}

/** One position update, carrying everything a real app passes every time. */
export interface PositionUpdate {
	readonly placement: string;
	readonly lastMove: readonly [BenchSquare, BenchSquare] | null;
	readonly sideToMove: BenchColor;
}

export interface BoardAdapter {
	readonly id: AdapterId;
	/** The element the library was mounted into. The adapter never replaces it. */
	readonly host: HTMLElement;
	/** Apply one position, including every call a real app makes for that update. */
	setPosition(update: PositionUpdate): void;
	/** Replace the engine-arrow layer. MUST NOT re-apply the position. */
	setArrows(arrows: readonly BenchArrow[]): void;
	/**
	 * Resize the host box and do whatever the library needs to stay CORRECT
	 * afterwards -- chessground must redraw its cached rect here. The contract is
	 * "leave the board correct and interactive", not "call the same methods".
	 */
	resize(px: number): void;
	/**
	 * Make the DOM reflect the most recent setPosition/setArrows call.
	 *
	 * This exists because the two libraries differ on WHEN they render, and that
	 * difference would otherwise wreck the comparison instead of appearing in it.
	 * quadrum renders synchronously, so its flush is a no-op. chessground debounces
	 * its redraw into a requestAnimationFrame, so without a forced flush its
	 * setPosition returns having done no DOM work at all -- the timed region would
	 * measure nothing, and a 100-update loop would coalesce into a single render of
	 * the final position while quadrum honestly rendered all 100.
	 *
	 * It therefore belongs INSIDE the timed region of every synchronous scenario,
	 * and must NOT be called in frame-driven scenarios, where the library's own
	 * scheduling is part of what is being measured.
	 */
	flush(): void;
	/** Live piece nodes, for mutation and count assertions. */
	pieceElements(): readonly Element[];
	/**
	 * Live arrow shape nodes. Per-adapter because the two libraries draw arrows
	 * with different SVG primitives (quadrum polygons, chessground lines), so a
	 * single shared selector silently found zero on both.
	 */
	arrowElements(): readonly Element[];
	/** Viewport centre of a square, computed from live geometry. */
	squareCenter(square: BenchSquare): { x: number; y: number };
	/** The element that must receive synthesized pointer events. */
	pointerTarget(): HTMLElement;
	/**
	 * The rect the library will actually use to map a viewport point to a square.
	 *
	 * This is the honest form of the post-resize correctness check. Comparing
	 * squareCenter() to the live board rect proves nothing, because both adapters
	 * compute squareCenter from a fresh getBoundingClientRect -- the assertion
	 * passes whether or not the library's own geometry was refreshed, which makes
	 * it exactly the vacuous guard that would let a real cost be hoisted out of
	 * the timed region.
	 *
	 * quadrum reads the rect live on every gesture, so it returns the live rect.
	 * chessground memoizes it in state.dom.bounds (Dom.bounds, types.d.ts) and
	 * only clears the memo on redrawAll, so it returns that memo -- stale, and
	 * detectably so, if the adapter's resize() skips the redraw a real app must do.
	 */
	hitTestRect(): DOMRectReadOnly;
	/** True once the library has entered its drag state. */
	isDragging(): boolean;
	/** The transform currently written on the dragged node, or null. */
	draggedTransform(): string | null;
	destroy(): void;
}

export interface AdapterFactory {
	readonly id: AdapterId;
	readonly label: string;
	readonly version: string;
	/** Construction + first render. Exactly what scenario 1 times. */
	mount(host: HTMLElement, options: MountOptions): BoardAdapter;
}

export type MetricUnit = "ms" | "count" | "bytes" | "ratio" | "percent";
export type MetricDirection = "lower" | "higher";

export interface Metric {
	readonly key: string;
	readonly label: string;
	readonly unit: MetricUnit;
	readonly direction: MetricDirection;
	readonly value: number;
	/** Per-iteration samples, kept so the runner can re-aggregate across runs. */
	readonly samples?: readonly number[];
	/** Iterations dropped as warmup, retained so the drop stays auditable. */
	readonly discarded?: readonly number[];
	/** Set when the number is advisory rather than a hard measurement. */
	readonly advisory?: string;
}

/** A correctness gate. Any failure invalidates the whole comparison. */
export interface Assertion {
	readonly label: string;
	readonly passed: boolean;
	readonly detail?: string;
}

export interface ScenarioOptions {
	readonly sizePx: number;
	readonly iterations: number;
	readonly warmupIterations: number;
	readonly discardFirst: number;
}

export interface ScenarioRunResult {
	readonly adapter: AdapterId;
	readonly metrics: readonly Metric[];
	readonly assertions: readonly Assertion[];
}

export interface ScenarioContext {
	/** A clean, empty, correctly sized host for this adapter. Never shared. */
	readonly host: HTMLElement;
	readonly factory: AdapterFactory;
	readonly options: ScenarioOptions;
	log(message: string): void;
	readonly signal: AbortSignal;
	/** CDP-backed hooks, present only under the headless runner. */
	readonly hooks: BenchHooks;
}

export interface BenchHooks {
	collectGarbage?: () => Promise<void>;
	heapUsed?: () => Promise<number>;
	/** Node count and listener count from Performance.getMetrics. */
	domCounters?: () => Promise<{ nodes: number; listeners: number }>;
	/**
	 * Drive real, browser-generated mouse input at viewport coordinates.
	 *
	 * This exists because the two libraries disagree about synthesized events:
	 * quadrum acts on a dispatched PointerEvent, chessground does not act on a
	 * dispatched MouseEvent at all. Verified empirically -- with every
	 * precondition satisfied (draggable enabled, movable.color "both", a piece on
	 * the square, bounds correct, the listener demonstrably reached) a
	 * synthesized mousedown leaves state.draggable.current undefined, while the
	 * same gesture from the runner's mouse enters the drag immediately.
	 *
	 * So an in-page synthesized gesture cannot measure this scenario: it would
	 * report chessground as never having dragged, which is a fact about
	 * synthetic events, not about chessground. Input therefore comes from the
	 * runner, and any scenario needing it is runnerOnly.
	 */
	mouse?: (action: "down" | "move" | "up", x: number, y: number) => Promise<void>;
}

export interface Scenario {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	/** Mandatory: who this scenario is expected to favour, and why. Printed in
	 *  the report so scenario selection cannot quietly become cherry-picking. */
	readonly expectation: string;
	/** What both libraries were configured to do. */
	readonly parity: string;
	/** The observable end state that stops the clock -- must be common to both. */
	readonly endCondition: string;
	/** True when only the headless runner can produce real numbers. */
	readonly runnerOnly?: boolean;
	/**
	 * The one metric key this scenario contributes to the headline table.
	 *
	 * Fixed here rather than chosen by the renderer, because "which number is
	 * the headline" is exactly the choice a motivated author makes after seeing
	 * the results. It is part of the scenario definition, in git, and changing
	 * it is a reviewable diff.
	 */
	readonly headlineMetric: string;
	readonly defaults: ScenarioOptions;
	/** One adapter, one pass. The harness owns interleaving and repetition. */
	run(ctx: ScenarioContext): Promise<ScenarioRunResult>;
}

export interface ScenarioComparison {
	readonly scenarioId: string;
	readonly options: ScenarioOptions;
	readonly byAdapter: Partial<Record<AdapterId, ScenarioRunResult>>;
	/** quadrum / chessground per metric key, normalised so lower is always
	 *  better for quadrum. */
	readonly ratios: Record<string, number>;
	readonly valid: boolean;
	readonly durationMs: number;
}

export interface BenchEnv {
	readonly userAgent: string;
	readonly devicePixelRatio: number;
	readonly hardwareConcurrency: number;
	readonly deviceMemory: number | null;
	readonly mode: "development" | "production";
	readonly quadrumVersion: string;
	readonly chessgroundVersion: string;
}

/**
 * Everything the runner needs to know about a scenario without importing it.
 *
 * The prose fields travel with the numbers all the way into the JSON on
 * purpose: `parity` and `endCondition` are the two things benchmarks lie about
 * most, so they are structured data a reader gets for free rather than
 * documentation that can drift away from the code that produced the result.
 */
export interface ScenarioMeta {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	readonly expectation: string;
	readonly parity: string;
	readonly endCondition: string;
	readonly runnerOnly: boolean;
	readonly headlineMetric: string;
	readonly gated: boolean;
}

export interface BenchApi {
	list(): ScenarioMeta[];
	run(scenarioId: string, options?: Partial<ScenarioOptions>): Promise<ScenarioComparison>;
	env(): BenchEnv;
	setHooks(hooks: BenchHooks): void;
}

declare global {
	interface Window {
		__bench: BenchApi;
	}
}
