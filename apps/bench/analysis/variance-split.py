"""Where does update-throughput-anim-off's noise live?

Within a repetition (jitter that more iterations would average away) or between
repetitions (drift between fresh browser processes, which more iterations cannot
touch)? The answer decides whether the scenario is fixable by tuning.
"""

import json
import statistics
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
RUN = RESULTS / "baseline-run.json"
run = json.loads(RUN.read_text())
reps = run["scenarios"]

SID = "update-throughput-anim-off"
KEY = "update-total-script-ms"

opts = None
per_rep = {"quadrum": [], "chessground": []}
within_cv = {"quadrum": [], "chessground": []}

for rep in reps:
    for comp in rep:
        if comp["scenarioId"] != SID:
            continue
        opts = comp.get("options")
        for subject in per_rep:
            m = next(
                (x for x in comp["byAdapter"].get(subject, {}).get("metrics", []) if x["key"] == KEY),
                None,
            )
            if not m:
                continue
            per_rep[subject].append(m["value"])
            s = m.get("samples") or []
            if len(s) > 2 and statistics.fmean(s):
                within_cv[subject].append(statistics.stdev(s) / statistics.fmean(s))

print(f"scenario options: {opts}")
print(f"repetitions: {len(per_rep['quadrum'])}\n")

for subject in ("quadrum", "chessground"):
    vals = per_rep[subject]
    between = statistics.stdev(vals) / statistics.fmean(vals)
    print(f"{subject}:")
    print(f"  median of repetition values : {statistics.median(vals):.3f} ms")
    print(f"  BETWEEN-repetition spread   : {between*100:6.2f}%")

    if within_cv[subject]:
        within = statistics.fmean(within_cv[subject])
        print(f"  WITHIN-repetition spread    : {within*100:6.2f}%  (mean over repetitions)")
    else:
        # Not a gap in the data. This metric is a single total per repetition --
        # already the sum over `iterations` updates -- so it has no per-iteration
        # samples to vary. All of its noise is therefore between-repetition, and
        # raising `iterations` cannot touch it.
        print("  WITHIN-repetition spread    :    n/a  (metric is one total per repetition)")

    print(f"  min / max repetition value  : {min(vals):.3f} / {max(vals):.3f} ms")
    print()
