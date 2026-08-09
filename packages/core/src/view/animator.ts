export function easeOutCubic(t: number): number {
	return 1 - Math.pow(1 - t, 3);
}

export interface Animator {
	run(duration: number, onFrame: (progress: number) => void, onDone: () => void): void;
	cancel(): void;
	readonly running: boolean;
}

export function createAnimator(): Animator {
	let animationId: number | null = null;
	let isRunning = false;

	return {
		run(duration: number, onFrame: (progress: number) => void, onDone: () => void): void {
			// Cancel any in-flight animation
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
				animationId = null;
			}

			if (duration <= 0) {
				onFrame(1);
				onDone();
				return;
			}

			isRunning = true;
			const startTime = performance.now();

			const tick = (currentTime: number) => {
				const elapsed = currentTime - startTime;
				const progress = Math.min(elapsed / duration, 1);

				onFrame(easeOutCubic(progress));

				if (progress === 1) {
					isRunning = false;
					onDone();
				} else {
					animationId = requestAnimationFrame(tick);
				}
			};

			animationId = requestAnimationFrame(tick);
		},

		cancel(): void {
			if (animationId !== null) {
				cancelAnimationFrame(animationId);
				animationId = null;
			}
			isRunning = false;
		},

		get running(): boolean {
			return isRunning;
		},
	};
}
