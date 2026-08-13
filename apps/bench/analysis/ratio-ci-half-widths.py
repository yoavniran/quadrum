"""Measure whether the ratio's CI is tighter than either subject's.

The gate compares ratios, but the gatability test (assessGatability) admits a
scenario on each *subject's* CI half-width. The claim to test: because both
subjects are measured on the same machine seconds apart, machine drift loads on
both and largely cancels out of the ratio, so the ratio's own CI should be
tighter than either part's.

Pairing has to happen at the repetition level -- that is the unit across which
the machine drifts. The shipped aggregation pools every sample from every
repetition into one flat array before computing a CI, which destroys the
pairing, so this rebuilds it from the raw run.
"""

import json
import random
import statistics
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
RUN = RESULTS / "baseline-run.json"
BASE = RESULTS / "baseline.json"

RESAMPLES = 4000
SEED = 20260813


def median_ci(values, rng):
    """Percentile bootstrap CI of the median. Same procedure for every quantity."""
    n = len(values)
    if n == 0:
        return (float("nan"), float("nan"))
    boots = []
    for _ in range(RESAMPLES):
        boots.append(statistics.median(rng.choices(values, k=n)))
    boots.sort()
    lo = boots[int(0.025 * RESAMPLES)]
    hi = boots[min(int(0.975 * RESAMPLES), RESAMPLES - 1)]
    return (lo, hi)


def half_width_pct(point, ci):
    if point == 0 or any(x != x for x in ci):
        return float("nan")
    return 100.0 * ((ci[1] - ci[0]) / 2.0) / abs(point)


run = json.loads(RUN.read_text())
base = json.loads(BASE.read_text())

reps = run["scenarios"]
print(f"repetitions: {len(reps)}   trigger: {run['run']['trigger']}   run: {run['run']['id']}")
print(f"bootstrap: {RESAMPLES} resamples, seed {SEED}, percentile method\n")

header = (
    f"{'scenario':<28} {'quadrum':>9} {'chessgr.':>9} {'RATIO':>9}   "
    f"{'stored q':>9} {'stored c':>9}  verdict"
)
print(header)
print("-" * len(header))

rows = []

for sid, meta in base["scenarios"].items():
    key = meta["headlineMetric"]
    direction = meta.get("direction", "lower")

    if sid == "bundle-size":
        continue  # measured in Node, one value, no repetition structure

    q_per_rep = []
    c_per_rep = []

    for rep in reps:
        for comparison in rep:
            if comparison["scenarioId"] != sid:
                continue
            by = comparison.get("byAdapter", {})
            qm = next((m for m in by.get("quadrum", {}).get("metrics", []) if m["key"] == key), None)
            cm = next((m for m in by.get("chessground", {}).get("metrics", []) if m["key"] == key), None)
            if qm is None or cm is None:
                continue
            q_per_rep.append(qm["value"])
            c_per_rep.append(cm["value"])

    if not q_per_rep:
        print(f"{sid:<28} (no per-repetition data for {key})")
        continue

    # Paired ratio, oriented so lower always means quadrum better.
    ratios = []
    for q, c in zip(q_per_rep, c_per_rep):
        if q == 0 or c == 0:
            continue
        ratios.append(c / q if direction == "higher" else q / c)

    rng = random.Random(SEED)
    q_hw = half_width_pct(statistics.median(q_per_rep), median_ci(q_per_rep, rng))
    rng = random.Random(SEED)
    c_hw = half_width_pct(statistics.median(c_per_rep), median_ci(c_per_rep, rng))
    rng = random.Random(SEED)
    r_hw = (
        half_width_pct(statistics.median(ratios), median_ci(ratios, rng))
        if ratios
        else float("nan")
    )

    # What the shipped pipeline currently computes, for reference.
    def stored(subject):
        s = meta.get(subject)
        if not s or "ci95" not in s or not s.get("median"):
            return float("nan")
        return half_width_pct(s["median"], s["ci95"])

    sq, sc = stored("quadrum"), stored("chessground")

    worst_subject = max(x for x in (q_hw, c_hw) if x == x) if (q_hw == q_hw or c_hw == c_hw) else float("nan")
    if r_hw != r_hw:
        verdict = "n/a"
    elif r_hw <= 8.0 and worst_subject > 8.0:
        verdict = "RATIO RESCUES IT"
    elif r_hw <= 8.0:
        verdict = "both admit"
    elif worst_subject <= 8.0:
        verdict = "ratio is WORSE"
    else:
        verdict = "neither admits"

    def f(x):
        return "     n/a " if x != x else f"{x:8.2f}%"

    print(f"{sid:<28} {f(q_hw)} {f(c_hw)} {f(r_hw)}   {f(sq)} {f(sc)}  {verdict}")
    rows.append((sid, q_hw, c_hw, r_hw, sq, sc, verdict))

print()
print("quadrum/chessground/RATIO columns are all recomputed per-repetition (n=%d)." % len(reps))
print("'stored' columns are the shipped pooled-sample numbers the gate uses today.")
