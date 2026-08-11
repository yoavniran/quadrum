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
export async function buildApp(cwd: string): Promise<void> {
	const proc = spawn("pnpm", ["exec", "vite", "build"], {
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
	const proc = spawn("pnpm", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
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
		proc.kill();
		throw new Error(
			`Failed to start preview server at ${url} after ${attempts} attempts: ${lastError.message}\n${output}`,
		);
	}

	const stop = async (): Promise<void> => {
		return new Promise((resolve) => {
			if (exitCode !== null) {
				resolve();
				return;
			}
			proc.kill("SIGTERM");
			const timeout = setTimeout(() => {
				proc.kill("SIGKILL");
				resolve();
			}, 5000);
			proc.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	};

	return { url, stop };
}
