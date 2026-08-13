# Bench analysis scripts

One-off analyses of a minted baseline run. Standalone Python 3, no dependencies.
They read only committed data — `../results/baseline-run.json` (the raw per-repetition
run) and `../results/baseline.json` (the minted baseline) — and write nothing.

| Script | What it does |
| --- | --- |
| `ratio-ci-half-widths.py` | Bootstraps a median CI for quadrum, chessground and the paired per-repetition ratio, to test whether the ratio's interval is tighter than its parts. |
| `subject-correlation.py` | Pearson correlation between the two subjects' per-repetition values, with observed vs predicted quotient spread. |
| `variance-split.py` | Splits `update-throughput-anim-off`'s noise into within- and between-repetition components. |
| `detectable-regression.py` | Inverts the gate rule to the smallest regression each scenario can detect. |

Run any of them from this directory: `python3 ratio-ci-half-widths.py`.

They exist to support one decision, and the full write-up of what they showed —
tables, caveats and the options — is in
[`docs/plans/update-path-node-churn.md`](../../../docs/plans/update-path-node-churn.md),
section "The gatability criterion". Read that first; these are the workings behind it.

Every number is from a single run (`run-1786622849122`, 61 repetitions, 2026-08-13).
Re-running them after a new baseline is minted will produce different numbers, and the
plan doc's tables would then need updating alongside.
