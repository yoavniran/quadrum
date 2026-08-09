/**
 * Pure helpers behind release.yml's version-aware PR title and run summary.
 *
 * They live here rather than inline in the workflow because both carry real
 * branching -- a run either opens a version PR or publishes, and the packages
 * either share a version or do not -- and YAML is a bad place to get that wrong
 * quietly. Nothing here touches the filesystem or the environment; the CLI
 * wrapper (`write-release-report.mjs`) does the I/O.
 */

/**
 * Reads a `changeset status --output` payload and describes the release that
 * `changeset version` would perform.
 *
 * @param {{ releases?: Array<{ name: string, type: string, oldVersion: string, newVersion: string }> }} status
 * @returns {{ version: string, title: string, commit: string, packages: Array<{ name: string, from: string, to: string }> }}
 */
export function describePendingRelease(status) {
	const releases = (status?.releases ?? []).filter((release) => release.type !== "none");

	if (releases.length === 0) {
		// A publish run: the changesets were consumed by the previous version PR.
		return { version: "", title: "chore: version packages", commit: "chore: version packages", packages: [] };
	}

	const packages = releases.map((release) => ({
		name: release.name,
		from: release.oldVersion,
		to: release.newVersion,
	}));

	// The two published packages are `linked` in .changeset/config.json, so they
	// normally move together and the title can name the version once. If they
	// ever diverge, name every package rather than picking one arbitrarily.
	const versions = [...new Set(packages.map((pkg) => pkg.to))];
	const version = versions.length === 1 ? versions[0] : "";
	const label = version || packages.map((pkg) => `${pkg.name}@${pkg.to}`).join(", ");

	return {
		version,
		title: `chore: version packages ${label}`,
		// The commit subject is capped at 72 characters by commitlint, and the
		// diverged-versions label has no bound, so only the single shared version
		// is safe to put there.
		commit: version ? `chore: version packages ${version}` : "chore: version packages",
		packages,
	};
}

/**
 * Renders the GitHub run summary for whichever half of the release ran.
 *
 * @param {{
 *   pendingPackages?: Array<{ name: string, from: string, to: string }>,
 *   pendingVersion?: string,
 *   published?: boolean,
 *   publishedPackages?: Array<{ name: string, version: string }>,
 *   prNumber?: string | number | null,
 * }} run
 * @returns {string} markdown
 */
export function renderReleaseSummary(run) {
	const pending = run.pendingPackages ?? [];
	const publishedPackages = run.publishedPackages ?? [];

	if (run.published) {
		const heading = run.pendingVersion ? `## Published ${run.pendingVersion}` : "## Published to npm";
		const rows = publishedPackages.map((pkg) => `| \`${pkg.name}\` | ${pkg.version} |`);

		return publishedPackages.length > 0
			? [heading, "", "| Package | Version |", "| --- | --- |", ...rows, ""].join("\n")
			: [heading, "", "No packages reported by the release action.", ""].join("\n");
	}

	if (pending.length === 0) {
		return ["## Nothing to release", "", "No pending changesets and nothing published.", ""].join("\n");
	}

	const version = run.pendingVersion ? ` ${run.pendingVersion}` : "";
	const link = run.prNumber ? ` (#${run.prNumber})` : "";
	const rows = pending.map((pkg) => `| \`${pkg.name}\` | ${pkg.from} | ${pkg.to} |`);

	return [
		`## Version PR${version}${link}`,
		"",
		"Merging it publishes these versions to npm.",
		"",
		"| Package | From | To |",
		"| --- | --- | --- |",
		...rows,
		"",
	].join("\n");
}
