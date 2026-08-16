/**
 * CLI wrapper around auto-changeset.mjs, used by release.yml.
 *
 *   node write-auto-changeset.mjs
 *     -> inspects every commit since the last version bump, and writes
 *        `.changeset/auto-release-notes.md` if any of them changed published
 *        source without adding a changeset. Prints what it decided, and appends
 *        the same to $GITHUB_STEP_SUMMARY when running in Actions.
 *
 * The file is written into the working tree and never committed by this script.
 * `changesets/action` runs `changeset version` immediately afterwards, which
 * consumes it -- so it exists only for the length of one job, and what lands in
 * the version PR is the changelog entry, not the changeset.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { planAutoChangeset, renderAutoChangeset } from "./auto-changeset.mjs";

const OUTPUT_PATH = ".changeset/auto-release-notes.md";

/** Record and field separators that cannot occur in a commit message. */
const RECORD = String.fromCharCode(0x1e);
const FIELD = String.fromCharCode(0x1f);

function git(args) {
	return execFileSync("git", args, { encoding: "utf8" });
}

/**
 * The commit the last release was cut at.
 *
 * `changeset version` is the only thing that rewrites a package CHANGELOG, so
 * the newest commit touching one is exactly the point after which changes are
 * unreleased. Falling back to the root commit is the first-release case, where
 * everything in history is unreleased by definition.
 */
function lastReleaseCommit() {
	const versioned = git(["log", "-1", "--format=%H", "--", "packages/core/CHANGELOG.md", "packages/react/CHANGELOG.md"]).trim();

	return versioned || git(["rev-list", "--max-parents=0", "HEAD"]).trim().split("\n")[0];
}

/** Commits after `since`, oldest first, each with the files it changed. */
function commitsSince(since) {
	const log = git(["log", "--reverse", `--format=${RECORD}%H${FIELD}%s${FIELD}%b`, `${since}..HEAD`]);

	return log
		.split(RECORD)
		.slice(1)
		.map((record) => {
			const [sha, subject, body] = record.split(FIELD);
			// --name-only on the commit itself: a squash-merged PR is one commit, so
			// its file list is the PR's file list.
			const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha.trim()])
				.split("\n")
				.filter(Boolean);

			return { sha: sha.trim(), subject: subject.trim(), body: (body ?? "").trim(), files };
		});
}

function report(lines) {
	const text = lines.join("\n");

	console.log(text);

	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
	}
}

const since = lastReleaseCommit();
const commits = commitsSince(since);
const plan = planAutoChangeset(commits);

if (!plan) {
	report([`### Auto changeset`, "", `Nothing to generate: no published source changed without a changeset since \`${since.slice(0, 7)}\`.`]);
} else {
	writeFileSync(OUTPUT_PATH, renderAutoChangeset(plan));

	report([
		`### Auto changeset`,
		"",
		`Generated a **${plan.bump}** for ${plan.packages.map((name) => `\`${name}\``).join(", ")}, covering ${plan.commits.length} commit(s) that changed published source without one:`,
		"",
		...plan.commits.map(({ subject, sha }) => `- ${subject} (\`${sha.slice(0, 7)}\`)`),
	]);
}
