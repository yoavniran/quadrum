import { describePendingRelease, renderReleaseSummary } from "./release-report.mjs";

const linked = {
	releases: [
		{ name: "quadrum", type: "minor", oldVersion: "0.1.0", newVersion: "0.2.0" },
		{ name: "quadrum-react", type: "minor", oldVersion: "0.1.0", newVersion: "0.2.0" },
		{ name: "quadrum-demo", type: "none", oldVersion: "0.0.0", newVersion: "0.0.0" },
	],
};

describe("describePendingRelease", () => {
	it("names the shared version in the title and commit", () => {
		const pending = describePendingRelease(linked);

		expect(pending.version).toBe("0.2.0");
		expect(pending.title).toBe("chore: version packages 0.2.0");
		expect(pending.commit).toBe("chore: version packages 0.2.0");
	});

	it("drops packages that are not being released", () => {
		// quadrum-demo is `ignore`d by changesets and always reports type "none";
		// listing it would claim a release that never happens.
		expect(describePendingRelease(linked).packages).toEqual([
			{ name: "quadrum", from: "0.1.0", to: "0.2.0" },
			{ name: "quadrum-react", from: "0.1.0", to: "0.2.0" },
		]);
	});

	it("names every package when the versions diverge, and keeps the commit subject short", () => {
		const pending = describePendingRelease({
			releases: [
				{ name: "quadrum", type: "minor", oldVersion: "0.1.0", newVersion: "0.2.0" },
				{ name: "quadrum-react", type: "patch", oldVersion: "0.1.5", newVersion: "0.1.6" },
			],
		});

		expect(pending.version).toBe("");
		expect(pending.title).toBe("chore: version packages quadrum@0.2.0, quadrum-react@0.1.6");
		// commitlint caps the subject at 72 characters and the label is unbounded.
		expect(pending.commit).toBe("chore: version packages");
	});

	it("falls back to a plain title on a publish run, where no changesets remain", () => {
		const pending = describePendingRelease({ changesets: [], releases: [] });

		expect(pending.version).toBe("");
		expect(pending.title).toBe("chore: version packages");
		expect(pending.packages).toEqual([]);
	});
});

describe("renderReleaseSummary", () => {
	it("reports the version PR with the version and every bump", () => {
		const summary = renderReleaseSummary({
			pendingPackages: [{ name: "quadrum", from: "0.1.0", to: "0.2.0" }],
			pendingVersion: "0.2.0",
			published: false,
			prNumber: 12,
		});

		expect(summary).toContain("## Version PR 0.2.0 (#12)");
		expect(summary).toContain("| `quadrum` | 0.1.0 | 0.2.0 |");
	});

	it("reports what was published when the version PR is merged", () => {
		const summary = renderReleaseSummary({
			pendingVersion: "",
			published: true,
			publishedPackages: [
				{ name: "quadrum", version: "0.2.0" },
				{ name: "quadrum-react", version: "0.2.0" },
			],
		});

		expect(summary).toContain("## Published to npm");
		expect(summary).toContain("| `quadrum-react` | 0.2.0 |");
		expect(summary).not.toContain("Version PR");
	});

	it("says so when there is nothing to release", () => {
		expect(renderReleaseSummary({ published: false })).toContain("## Nothing to release");
	});
});
