/**
 * Conventional Commits, enforced locally by .husky/commit-msg and in CI by the
 * `commits` job in .github/workflows/ci.yml.
 *
 * These messages are the release input, not just a house style. release-please
 * reads every commit that lands on main: the type picks the version bump, the
 * subject becomes the CHANGELOG line, and the paths it touched decide which of
 * the two packages it belongs to. A subject written carelessly is published
 * carelessly, and a `chore:` where a `fix:` belonged releases nothing at all.
 */
export default {
	extends: ["@commitlint/config-conventional"],
	rules: {
		// The types config-conventional allows, minus `improvement` and plus the
		// ones this repo actually uses. Listing them explicitly means a typo like
		// `chores:` fails instead of quietly becoming a new category.
		"type-enum": [
			2,
			"always",
			[
				"feat", // a user-facing capability
				"fix", // a defect repaired
				"perf", // faster or lighter, same behaviour
				"refactor", // behaviour-preserving restructure
				"docs", // README, architecture.md, comments
				"test", // specs only, no shipped code
				"build", // tsup, tsconfig, what goes in the tarball
				"ci", // workflows and release automation
				"chore", // housekeeping that fits nothing above
				"revert",
			],
		],

		// Subjects stay lower-case after the colon, matching the rest of the
		// history. config-conventional bans sentence/start/pascal/upper case;
		// this is that rule stated outright so the intent is obvious.
		"subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],

		// 72 leaves room for git log's 4-space indent inside an 80-column terminal.
		"header-max-length": [2, "always", 72],

		// Bodies wrap; a wall of text in one line is unreadable in `git log`.
		// Warning rather than error -- a pasted stack trace is a fair exception.
		"body-max-line-length": [1, "always", 100],
	},
	ignores: [
		// Merge commits are machine-written and do not follow the convention.
		// release-please's own release commit needs no exemption: its title
		// pattern in release-please-config.json is `chore: release X.Y.Z`,
		// which is a conforming message on purpose.
		(message) => message.startsWith("Merge "),

		// Dependabot's messages, which .github/dependabot.yml already shapes into
		// `chore(deps): ...` / `ci(deps): ...`. They are exempt from the rest --
		// specifically header-max-length, since "bump @commitlint/config-conventional
		// from 21.2.0 to 21.2.1" blows past 72 with a name that long and the bot
		// cannot be told to shorten it. The prefix is checked here rather than the
		// author, because the `commits` job also lints the PR *title*, where no
		// author is available.
		(message) => /^(chore|ci)\(deps(-dev)?\)(!)?: /.test(message),
	],
};
