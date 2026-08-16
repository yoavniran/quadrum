/**
 * Pure functions behind the automatic changeset, used by release.yml.
 *
 * The problem this exists for: changesets are hand-written, and `ci.yml`'s
 * changeset job only *warns* when published source moves without one. Seven
 * consecutive `perf(core)` PRs took that warning and merged anyway, so the
 * pending release described a packaging change and none of the work that
 * actually changed what consumers run.
 *
 * So this is a floor, not a replacement. A hand-written changeset still wins:
 * any commit that brought its own is skipped here, and its prose reaches the
 * changelog untouched. This only covers what would otherwise ship undescribed.
 *
 * Nothing here touches the filesystem, the environment or git; the CLI wrapper
 * (`write-auto-changeset.mjs`) does all of that, which is what makes the commit
 * classification testable without a repository.
 */

/**
 * Published paths, by the package that publishes them.
 *
 * Deliberately narrow: `src` and the README are the bytes that go in the
 * tarball. `test/`, `tsconfig*` and the tsup config change what is built, not
 * what is shipped, and a release note for them tells a consumer nothing.
 */
export const PUBLISHED_PATHS = {
	quadrum: ["packages/core/src/", "packages/core/README.md"],
	"quadrum-react": ["packages/react/src/", "packages/react/README.md"],
};

/** Conventional-commit types that mean more than a patch. */
const MINOR_TYPES = new Set(["feat"]);

const BUMP_RANK = { patch: 0, minor: 1, major: 2 };

/**
 * The bump one commit implies.
 *
 * Every commit that touches published bytes is at least a patch -- the file
 * list, not the subject line, is what decides that a consumer's installed code
 * changed. The subject only *escalates*: `feat` to minor, a `!` marker or a
 * `BREAKING CHANGE` trailer to major. A `chore(core)` that edits `src` is still
 * a patch, because the shipped bytes moved regardless of what it was called.
 *
 * @param {{ subject: string, body?: string }} commit
 * @returns {"patch" | "minor" | "major"}
 */
export function bumpForCommit({ subject, body = "" }) {
	// `type(scope)!: subject` and `type!: subject` are both breaking.
	if (/^[a-z]+(\([^)]*\))?!:/.test(subject) || /(^|\n)BREAKING[ -]CHANGE:/.test(body)) {
		return "major";
	}

	const type = /^([a-z]+)(\([^)]*\))?:/.exec(subject)?.[1];

	return type && MINOR_TYPES.has(type) ? "minor" : "patch";
}

/**
 * The larger of two bumps.
 *
 * @param {"patch" | "minor" | "major"} a
 * @param {"patch" | "minor" | "major"} b
 * @returns {"patch" | "minor" | "major"}
 */
export function maxBump(a, b) {
	return BUMP_RANK[b] > BUMP_RANK[a] ? b : a;
}

/**
 * The packages whose published paths a file list touches.
 *
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function packagesTouched(files) {
	return Object.entries(PUBLISHED_PATHS)
		.filter(([, prefixes]) => files.some((file) => prefixes.some((prefix) => file.startsWith(prefix))))
		.map(([name]) => name);
}

/**
 * Whether a commit wrote its own changeset.
 *
 * `.changeset/README.md` and `config.json` are the directory's own furniture,
 * not release notes -- a PR that edits the config has not described itself.
 *
 * @param {readonly string[]} files
 * @returns {boolean}
 */
export function wroteOwnChangeset(files) {
	return files.some((file) => /^\.changeset\/.+\.md$/.test(file) && file !== ".changeset/README.md");
}

/**
 * Build the release plan for a range of commits, or null when nothing in the
 * range shipped undescribed.
 *
 * @param {readonly {sha: string, subject: string, body?: string, files: readonly string[]}[]} commits
 * @returns {{ bump: "patch" | "minor" | "major", packages: string[], commits: {sha: string, subject: string}[] } | null}
 */
export function planAutoChangeset(commits) {
	/** @type {{sha: string, subject: string}[]} */
	const covered = [];
	const packages = new Set();
	/** @type {"patch" | "minor" | "major"} */
	let bump = "patch";

	for (const commit of commits) {
		const touched = packagesTouched(commit.files);

		// A commit that described itself is already in the release; describing it
		// again here would duplicate the entry and could disagree with its prose.
		if (touched.length === 0 || wroteOwnChangeset(commit.files)) {
			continue;
		}

		touched.forEach((name) => packages.add(name));
		bump = maxBump(bump, bumpForCommit(commit));
		covered.push({ sha: commit.sha, subject: commit.subject });
	}

	return covered.length > 0 ? { bump, packages: [...packages], commits: covered } : null;
}

/**
 * Render a plan as changeset markdown.
 *
 * The body becomes the CHANGELOG entry verbatim, so it says outright that it
 * was generated: a reader who finds a bare list of commit subjects where the
 * other entries carry prose should know why, rather than assume the author
 * stopped caring.
 *
 * @param {{ bump: string, packages: readonly string[], commits: readonly {sha: string, subject: string}[] }} plan
 * @returns {string}
 */
export function renderAutoChangeset(plan) {
	const frontmatter = plan.packages.map((name) => `"${name}": ${plan.bump}`).join("\n");
	const entries = plan.commits.map(({ subject, sha }) => `- ${subject} (\`${sha.slice(0, 7)}\`)`).join("\n");

	return `---\n${frontmatter}\n---\n\nChanges that shipped without a changeset of their own. Generated at release time from the commits below; see each one for detail.\n\n${entries}\n`;
}
