/**
 * Build + preview server control for the headless runner.
 * Benchmarks always run against the production build; the dev server resolves
 * quadrum from TypeScript source while chessground is prebuilt, comparing
 * build pipelines, not renderers.
 */

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

/** Try one specific port; resolves null if it is taken. */
async function tryPort(port: number): Promise<number | null> {
	const server = createServer();

	try {
		const bound = await new Promise<boolean>((resolve, reject) => {
			server.once("error", (e: NodeJS.ErrnoException) => {
				if (e.code === "EADDRINUSE") {
					resolve(false);
				} else {
					reject(e);
				}
			});
			server.listen(port, "127.0.0.1", () => resolve(true));
		});

		if (!bound) {
			return null;
		}

		const address = server.address();

		if (!address || typeof address !== "object") {
			throw new Error("Failed to get port from server");
		}

		return address.port;
	} finally {
		// Await the close: returning while the socket is still bound leaves a race
		// where vite preview --strictPort finds the port occupied by this probe.
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

/**
 * Find a free port, preferring the given one and walking upward from it.
 *
 * The walk matters: an orphaned preview server from an aborted run holds the
 * preferred port, and hard-failing there turns a stale process into a dead
 * benchmark suite that no amount of re-running fixes.
 */
export async function findFreePort(preferred: number): Promise<number> {
	for (let offset = 0; offset < 20; offset++) {
		const port = await tryPort(preferred + offset);

		if (port !== null) {
			return port;
		}
	}

	throw new Error(`No free port in ${preferred}-${preferred + 19}`);
}

/**
 * Build the app using Vite.
 */
export async function buildApp(cwd: string, extraArgs: readonly string[] = []): Promise<void> {
	const proc = spawn("pnpm", ["exec", "vite", "build", ...extraArgs], {
		cwd,
		stdio: "inherit",
	});
	const [code] = await once(proc, "exit");
	if (code !== 0) {
		throw new Error(`vite build exited with code ${code}`);
	}
}

/**
 * Start the Vite preview server on a given port.
 * Returns the server URL and a stop function.
 */
export async function startPreview(
	cwd: string,
	port: number,
): Promise<{ url: string; stop: () => Promise<void> }> {
	// --host 127.0.0.1 is not optional. Left to itself vite preview binds "localhost",
	// which on macOS resolves to ::1 first, so polling (and Playwright navigating)
	// 127.0.0.1 is refused by a server that is otherwise perfectly healthy.
	const args = ["exec", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"];
	// `detached` puts the child in its own process group so we can signal the whole
	// group later. `pnpm exec` makes vite a *grandchild*, and signalling pnpm alone
	// leaves vite alive holding the port -- the orphans that eventually exhaust the
	// whole range and take the runner down with them.
	const proc = spawn("pnpm", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
	});

	const url = `http://127.0.0.1:${port}/`;

	let exitCode: number | null = null;
	proc.once("exit", (code) => {
		exitCode = code;
	});

	// Drain both pipes. They are piped rather than inherited so preview chatter
	// stays out of the benchmark console, but an undrained pipe fills its buffer
	// and blocks the child -- so keep the tail for diagnosing a failed start.
	let output = "";
	const capture = (chunk: Buffer): void => {
		output = (output + chunk.toString()).slice(-2000);
	};
	proc.stdout?.on("data", capture);
	proc.stderr?.on("data", capture);

	const attempts = 40;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < attempts; attempt++) {
		// A preview server that died is never going to answer; fail immediately
		// with its own output rather than polling a corpse for ten seconds.
		if (exitCode !== null) {
			throw new Error(`vite preview exited with code ${exitCode} before serving\n${output}`);
		}

		try {
			const res = await fetch(url);

			if (res.ok) {
				// Must be cleared: an earlier connection refusal is expected while
				// the server boots, and leaving it set fails an otherwise good start.
				lastError = null;
				break;
			}

			lastError = new Error(`responded ${res.status}`);
		} catch (e) {
			lastError = e as Error;
		}

		// Sleep on EVERY miss, not just thrown ones -- a non-ok response with no
		// delay burns the whole retry budget in a few milliseconds.
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	if (lastError) {
		killGroup(proc, "SIGKILL");
		throw new Error(
			`Failed to start preview server at ${url} after ${attempts} attempts: ${lastError.message}\n${output}`,
		);
	}

	const stop = async (): Promise<void> => {
		detachBailout();

		return new Promise((resolve) => {
			if (exitCode !== null) {
				resolve();
				return;
			}
			killGroup(proc, "SIGTERM");
			const timeout = setTimeout(() => {
				killGroup(proc, "SIGKILL");
				resolve();
			}, 5000);
			proc.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	};

	// A crash or a Ctrl-C skips the runner's `finally`, and the preview server
	// outlives the run holding its port. These handlers are the backstop; `stop`
	// removes them so a normal shutdown does not accumulate listeners.
	const detachBailout = registerBailout(proc);

	return { url, stop };
}

/**
 * Signal the child's whole process group.
 *
 * `pnpm exec` means the process we spawned is pnpm and vite is its child, so
 * signalling the pid alone reaps the wrapper and orphans the server. Negating the
 * pid targets the group, which `detached: true` made the child the leader of.
 */
function killGroup(proc: { pid?: number }, signal: NodeJS.Signals): void {
	if (proc.pid === undefined) {
		return;
	}

	try {
		process.kill(-proc.pid, signal);
	} catch {
		// ESRCH: the group is already gone, which is the outcome we wanted.
	}
}

/** Kills `proc`'s group if this process goes down without running its cleanup. */
function registerBailout(proc: { pid?: number }): () => void {
	const onExit = (): void => killGroup(proc, "SIGKILL");
	const onSignal = (signal: NodeJS.Signals) => (): void => {
		killGroup(proc, "SIGKILL");
		process.exit(signal === "SIGINT" ? 130 : 143);
	};

	const onSigint = onSignal("SIGINT");
	const onSigterm = onSignal("SIGTERM");

	process.on("exit", onExit);
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);

	return () => {
		process.off("exit", onExit);
		process.off("SIGINT", onSigint);
		process.off("SIGTERM", onSigterm);
	};
}
