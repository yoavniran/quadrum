/**
 * CLI wrapper around release-report.mjs, used by release.yml.
 *
 *   node write-release-report.mjs pending <changeset-status.json>
 *     -> appends `version`, `title` and `commit` to $GITHUB_OUTPUT, plus
 *        `packages` as JSON so the summary step can read it back.
 *
 *   node write-release-report.mjs summary
 *     -> appends the run summary to $GITHUB_STEP_SUMMARY, reading the pending
 *        description and the changesets action's outputs from the environment.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { describePendingRelease, renderReleaseSummary } from "./release-report.mjs";

const [mode, statusPath] = process.argv.slice(2);

/** Multi-line values need heredoc syntax; single-line ones must not use it. */
function writeOutputs(entries) {
	const target = process.env.GITHUB_OUTPUT;
	if (!target) throw new Error("GITHUB_OUTPUT is not set -- this script only runs inside GitHub Actions");

	const lines = Object.entries(entries).map(([key, value]) =>
		String(value).includes("\n") ? `${key}<<__EOF__\n${value}\n__EOF__` : `${key}=${value}`,
	);

	appendFileSync(target, `${lines.join("\n")}\n`);
}

function parseJson(value, fallback) {
	if (!value) return fallback;

	try {
		return JSON.parse(value);
	} catch {
		// The release action's outputs are not worth failing a publish over.
		return fallback;
	}
}

if (mode === "pending") {
	if (!statusPath) throw new Error("usage: write-release-report.mjs pending <changeset-status.json>");

	const status = JSON.parse(readFileSync(statusPath, "utf8"));
	const { version, title, commit, packages } = describePendingRelease(status);

	writeOutputs({ version, title, commit, packages: JSON.stringify(packages) });
} else if (mode === "summary") {
	const target = process.env.GITHUB_STEP_SUMMARY;
	if (!target) throw new Error("GITHUB_STEP_SUMMARY is not set -- this script only runs inside GitHub Actions");

	appendFileSync(
		target,
		renderReleaseSummary({
			pendingPackages: parseJson(process.env.PENDING_PACKAGES, []),
			pendingVersion: process.env.PENDING_VERSION ?? "",
			published: process.env.PUBLISHED === "true",
			publishedPackages: parseJson(process.env.PUBLISHED_PACKAGES, []),
			prNumber: process.env.PR_NUMBER || null,
		}),
	);
} else {
	throw new Error(`unknown mode "${mode}" -- expected "pending" or "summary"`);
}
