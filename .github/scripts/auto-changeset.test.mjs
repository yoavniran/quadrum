import { bumpForCommit, maxBump, packagesTouched, wroteOwnChangeset, planAutoChangeset, renderAutoChangeset } from "./auto-changeset.mjs";

/** A commit as `write-auto-changeset.mjs` reads it out of `git log`. */
function commit({ sha = "0123456789abcdef", subject = "fix(core): a thing", body = "", files = ["packages/core/src/board.ts"] } = {}) {
	return { sha, subject, body, files };
}

describe("bumpForCommit", () => {
	it("treats any published change as at least a patch, whatever it was called", () => {
		// The file list decides that a consumer's installed code moved; the subject
		// only escalates. A `chore(core)` that edits src still ships new bytes.
		expect(bumpForCommit({ subject: "chore(core): tidy the mark cache" })).toBe("patch");
		expect(bumpForCommit({ subject: "perf(core): pool highlight squares" })).toBe("patch");
		expect(bumpForCommit({ subject: "not a conventional subject at all" })).toBe("patch");
	});

	it("escalates a feature to minor", () => {
		expect(bumpForCommit({ subject: "feat: add premove hints" })).toBe("minor");
		expect(bumpForCommit({ subject: "feat(react): expose the board ref" })).toBe("minor");
	});

	it("escalates a breaking change to major, marked either way", () => {
		expect(bumpForCommit({ subject: "feat!: drop the source condition" })).toBe("major");
		expect(bumpForCommit({ subject: "refactor(core)!: rename setPosition" })).toBe("major");
		expect(bumpForCommit({ subject: "fix: tighten types", body: "BREAKING CHANGE: types are stricter" })).toBe("major");
	});

	it("does not read a bang from the middle of a subject as a breaking marker", () => {
		// "fix: it works!" is not a major version. The marker is positional.
		expect(bumpForCommit({ subject: "fix: stop the flicker!" })).toBe("patch");
	});
});

describe("maxBump", () => {
	it("keeps the largest bump in a range", () => {
		expect(maxBump("patch", "minor")).toBe("minor");
		expect(maxBump("major", "minor")).toBe("major");
		expect(maxBump("patch", "patch")).toBe("patch");
	});
});

describe("packagesTouched", () => {
	it("maps published paths to the package that publishes them", () => {
		expect(packagesTouched(["packages/core/src/view/marksView.ts"])).toEqual(["quadrum"]);
		expect(packagesTouched(["packages/react/README.md"])).toEqual(["quadrum-react"]);
		expect(packagesTouched(["packages/core/src/a.ts", "packages/react/src/b.ts"])).toEqual(["quadrum", "quadrum-react"]);
	});

	it("ignores paths that change what is built but not what is shipped", () => {
		// A test, a tsconfig or the bench app cannot change a consumer's install,
		// and a changelog entry for one tells them nothing.
		expect(packagesTouched(["packages/core/test/board.test.ts"])).toEqual([]);
		expect(packagesTouched(["packages/core/tsup.config.ts", "packages/core/tsconfig.json"])).toEqual([]);
		expect(packagesTouched(["apps/bench/runner/run.ts", "docs/plans/x.md", ".github/workflows/ci.yml"])).toEqual([]);
	});
});

describe("wroteOwnChangeset", () => {
	it("recognises a hand-written changeset", () => {
		expect(wroteOwnChangeset([".changeset/heavy-doors-listen.md"])).toBe(true);
	});

	it("does not count the directory's own furniture as release notes", () => {
		// Editing the config or the README has not described anything.
		expect(wroteOwnChangeset([".changeset/config.json"])).toBe(false);
		expect(wroteOwnChangeset([".changeset/README.md"])).toBe(false);
	});
});

describe("planAutoChangeset", () => {
	it("covers commits that changed published source with no changeset", () => {
		const plan = planAutoChangeset([
			commit({ sha: "aaaaaaa1", subject: "perf(core): reuse piece elements across a move" }),
			commit({ sha: "bbbbbbb2", subject: "feat(react): expose the board ref", files: ["packages/react/src/Board.tsx"] }),
		]);

		expect(plan.bump).toBe("minor");
		expect(plan.packages).toEqual(["quadrum", "quadrum-react"]);
		expect(plan.commits.map((c) => c.sha)).toEqual(["aaaaaaa1", "bbbbbbb2"]);
	});

	it("leaves a commit that described itself alone", () => {
		// The hand-written entry is the better one and is already in the release.
		// Describing it again here would duplicate it, and could contradict it.
		const plan = planAutoChangeset([
			commit({
				subject: "fix: let user marks layer over automatic ones",
				files: ["packages/core/src/view/marksView.ts", ".changeset/tidy-pugs-shave.md"],
			}),
		]);

		expect(plan).toBe(null);
	});

	it("returns null when nothing published moved", () => {
		const plan = planAutoChangeset([
			commit({ subject: "ci: add the benchmark workflow", files: [".github/workflows/bench.yml"] }),
			commit({ subject: "test(core): pin mark retention under churn", files: ["packages/core/test/marksView.test.ts"] }),
			commit({ subject: "docs: write the status rollup", files: ["docs/plans/performance-improvement-plan.md"] }),
		]);

		expect(plan).toBe(null);
	});

	it("bumps only the package whose bytes actually moved", () => {
		// The two are `linked` in the changesets config, so they release together
		// anyway -- but the frontmatter must still say which one changed.
		const plan = planAutoChangeset([commit({ files: ["packages/core/src/board.ts"] })]);

		expect(plan.packages).toEqual(["quadrum"]);
	});

	it("takes the largest bump across the range, not the last one", () => {
		const plan = planAutoChangeset([
			commit({ subject: "feat: add premove hints" }),
			commit({ subject: "fix: correct the hint colour" }),
		]);

		expect(plan.bump).toBe("minor");
	});
});

describe("renderAutoChangeset", () => {
	it("renders frontmatter and a commit list", () => {
		const md = renderAutoChangeset({
			bump: "patch",
			packages: ["quadrum"],
			commits: [{ sha: "b51c911abcdef", subject: "perf(core): cut per-update allocations on the position path (#46)" }],
		});

		expect(md).toMatch(/^---\n"quadrum": patch\n---\n/);
		expect(md).toContain("perf(core): cut per-update allocations on the position path (#46) (`b51c911`)");
	});

	it("says outright that it was generated", () => {
		// This text becomes the CHANGELOG entry. A reader who finds bare commit
		// subjects among hand-written prose should know why.
		const md = renderAutoChangeset({ bump: "patch", packages: ["quadrum"], commits: [{ sha: "abc1234", subject: "fix: x" }] });

		expect(md).toMatch(/without a changeset of their own/);
	});
});
