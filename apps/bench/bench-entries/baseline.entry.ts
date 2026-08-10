/**
 * Empty entry whose only job is to measure Rollup's own preamble.
 * Without subtracting it, both subjects carry an identical constant that
 * flatters the smaller one's ratio.
 */

let subject = "";

/**
 * Touch the subject and return a no-op teardown.
 */
export function mountAndDrive(host: HTMLElement): () => void {
	subject = host.tagName;
	return () => {
		// no-op
	};
}
