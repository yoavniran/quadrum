/**
 * CLI wrapper around bench-report.mjs, used by bench.yml and by hand.
 *
 * Every decision lives in bench-report.mjs, which is pure and tested. This file
 * only reads files, writes files, prints, and picks an exit code -- so that the
 * question "would this gate have passed?" can always be answered from a JSON
 * file without a browser, a runner, or a CI environment.
 *
 *   summarize <results.json> [--out <report.md>]
 *     -> full per-scenario report to stdout, or to a file
 *
 *   gate <results.json> <baseline.json>
 *     -> compares and exits 1 on any fail. Reads the PR labels from PR_LABELS
 *        (comma- or JSON-separated); "bench-override" downgrades fails to warns
 *        and prints the fact into the step summary.
 *
 *   baseline <results.json> --out <baseline.json>
 *     -> mints a gate baseline. Throws if any gated scenario is too noisy to gate.
 *
 *   publish <results.json> --readme <README.md>
 *     -> splices the headline block between the bench:headline markers.
 *
 *   check <results.json> --readme <README.md>
 *     -> regenerates the block and fails if the README differs, or if the run is
 *        too old. This is what stops a hand-edited number surviving.
 *
 *   guard-baseline --files <changed-files.txt>
 *     -> fails a PR that updates the baseline alongside packages/ * /src without
 *        the bench-rebaseline label.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
	summarizeRun,
	makeBaseline,
	compareToBaseline,
	renderFullReport,
	renderHeadlineTable,
	renderGateSummary,
	spliceMarkers,
	checkFreshness,
	guardBaselineChange,
	OVERRIDE_LABEL,
} from "./bench-report.mjs";

const argv = process.argv.slice(2);
const mode = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith("--"));

/** @param {string} name @returns {string | null} */
function flag(name) {
	const index = argv.indexOf(`--${name}`);

	return index === -1 ? null : (argv[index + 1] ?? null);
}

/** @param {string} path */
function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * PR labels arrive as a JSON array from `github.event.pull_request.labels.*.name`
 * in some workflows and as a comma-separated string in others. Accept both
 * rather than make the workflow author guess.
 *
 * @returns {string[]}
 */
function prLabels() {
	const raw = (process.env.PR_LABELS ?? "").trim();

	if (!raw) {
		return [];
	}

	if (raw.startsWith("[")) {
		try {
			return JSON.parse(raw).map(String);
		} catch {
			return [];
		}
	}

	return raw
		.split(",")
		.map((label) => label.trim())
		.filter(Boolean);
}

/** Appends to the GitHub step summary when running in Actions; no-op locally. */
function stepSummary(markdown) {
	const target = process.env.GITHUB_STEP_SUMMARY;

	if (target) {
		appendFileSync(target, `${markdown}\n`);
	}
}

/** @param {string} message */
function fail(message) {
	console.error(`✖ ${message}`);
	process.exit(1);
}

/** @param {string | null} path @param {string} content */
function emit(path, content) {
	if (path) {
		writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
		console.log(`written to ${path}`);
	} else {
		console.log(content);
	}
}

function usage() {
	throw new Error(
		`unknown mode "${mode}" -- expected summarize | gate | baseline | publish | check | guard-baseline`,
	);
}

if (mode === "summarize") {
	if (!positional[0]) throw new Error("usage: write-bench-report.mjs summarize <results.json> [--out <report.md>]");

	emit(flag("out"), renderFullReport(summarizeRun(readJson(positional[0]))));
} else if (mode === "gate") {
	if (!positional[1]) throw new Error("usage: write-bench-report.mjs gate <results.json> <baseline.json>");

	const labels = prLabels();
	const override = labels.includes(OVERRIDE_LABEL)
		? `${OVERRIDE_LABEL} label applied by ${process.env.PR_ACTOR || "an unrecorded actor"}`
		: null;
	const gate = compareToBaseline(summarizeRun(readJson(positional[0])), readJson(positional[1]), { override });
	const summary = renderGateSummary(gate);

	console.log(summary);
	stepSummary(summary);

	// The failing scenario ids go to stdout in a parseable form so the workflow's
	// confirm-run step can re-measure only those, rather than re-running (and
	// thereby re-rolling) the whole suite.
	const failed = gate.results.filter((r) => r.status === "fail").map((r) => r.scenarioId);

	if (failed.length > 0) {
		console.log(`\nfailed-scenarios=${failed.join(",")}`);
	}

	if (!gate.ok) {
		process.exit(1);
	}
} else if (mode === "baseline") {
	const out = flag("out");

	if (!positional[0] || !out) {
		throw new Error("usage: write-bench-report.mjs baseline <results.json> --out <baseline.json>");
	}

	// makeBaseline throws when a gated scenario's interval is too wide to gate.
	// That failure is the point: minting a baseline is where an unstable gate
	// gets locked in for everyone who comes after.
	const baseline = makeBaseline(summarizeRun(readJson(positional[0])));

	writeFileSync(out, `${JSON.stringify(baseline, null, 2)}\n`);
	console.log(`baseline written to ${out} (${Object.keys(baseline.scenarios).length} gated scenarios)`);
} else if (mode === "publish" || mode === "check") {
	const readmePath = flag("readme");

	if (!positional[0] || !readmePath) {
		throw new Error(`usage: write-bench-report.mjs ${mode} <results.json> --readme <README.md>`);
	}

	const summary = summarizeRun(readJson(positional[0]));
	// renderHeadlineTable throws on a non-publishable run, so a PR-triggered or
	// dirty-tree result cannot reach the README through either mode.
	const block = renderHeadlineTable(summary);
	const readme = readFileSync(readmePath, "utf8");
	const spliced = spliceMarkers(readme, block);
	const freshness = checkFreshness(summary.run.startedAt, Date.now());

	if (mode === "publish") {
		writeFileSync(readmePath, spliced);
		console.log(`headline block spliced into ${readmePath}`);
		console.log(freshness.message);

		if (freshness.status === "fail") {
			fail(`refusing to publish: ${freshness.message}`);
		}
	} else {
		if (spliced !== readme) {
			console.error("--- expected ---");
			console.error(block);
			fail(
				`${readmePath} does not match the block generated from ${positional[0]}. Every number in the README must come from a run that happened: regenerate with \`publish\` rather than editing it by hand.`,
			);
		}

		console.log(`✔ ${readmePath} matches ${positional[0]}`);
		console.log(`${freshness.status === "ok" ? "✔" : "⚠"} ${freshness.message}`);

		if (freshness.status === "fail") {
			fail(freshness.message);
		}
	}
} else if (mode === "guard-baseline") {
	const filesPath = flag("files");

	if (!filesPath) {
		throw new Error("usage: write-bench-report.mjs guard-baseline --files <changed-files.txt>");
	}

	const files = readFileSync(filesPath, "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const verdict = guardBaselineChange(files, prLabels());

	console.log(verdict.reason);
	stepSummary(`### Baseline guard\n\n${verdict.ok ? "✅" : "❌"} ${verdict.reason}`);

	if (!verdict.ok) {
		process.exit(1);
	}
} else {
	usage();
}
