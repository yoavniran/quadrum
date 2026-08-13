"""Does machine drift actually load on both subjects together?

If it did, quadrum's and chessground's per-repetition values would rise and fall
together (positive correlation), and the ratio would cancel some of that noise.
If they are uncorrelated, the ratio's variance is roughly the SUM of the two
relative variances and the ratio is necessarily noisier than either part.
"""

import json
import math
import statistics
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
RUN = RESULTS / "baseline-run.json"
BASE = RESULTS / "baseline.json"

run = json.loads(RUN.read_text())
base = json.loads(BASE.read_text())
reps = run["scenarios"]


def pearson(xs, ys):
    n = len(xs)
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return num / (dx * dy) if dx and dy else float("nan")


hdr = f"{'scenario':<28} {'corr(q,c)':>10} {'cv_q':>8} {'cv_c':>8} {'cv_ratio':>9} {'predicted':>10}"
print(hdr)
print("-" * len(hdr))

for sid, meta in base["scenarios"].items():
    if sid == "bundle-size":
        continue
    key = meta["headlineMetric"]
    q, c = [], []
    for rep in reps:
        for comp in rep:
            if comp["scenarioId"] != sid:
                continue
            by = comp.get("byAdapter", {})
            qm = next((m for m in by.get("quadrum", {}).get("metrics", []) if m["key"] == key), None)
            cm = next((m for m in by.get("chessground", {}).get("metrics", []) if m["key"] == key), None)
            if qm and cm:
                q.append(qm["value"])
                c.append(cm["value"])

    if len(q) < 3 or statistics.fmean(q) == 0 or statistics.fmean(c) == 0:
        print(f"{sid:<28} {'n/a':>10}")
        continue

    ratios = [a / b for a, b in zip(q, c) if b]
    cv_q = statistics.stdev(q) / statistics.fmean(q)
    cv_c = statistics.stdev(c) / statistics.fmean(c)
    cv_r = statistics.stdev(ratios) / statistics.fmean(ratios)
    r = pearson(q, c)
    # First-order propagation for a quotient of correlated variables.
    predicted = math.sqrt(max(cv_q**2 + cv_c**2 - 2 * r * cv_q * cv_c, 0.0))

    print(
        f"{sid:<28} {r:10.3f} {cv_q*100:7.2f}% {cv_c*100:7.2f}% "
        f"{cv_r*100:8.2f}% {predicted*100:9.2f}%"
    )

print()
print("cv = coefficient of variation across the 61 repetitions (spread / mean).")
print("predicted = sqrt(cv_q^2 + cv_c^2 - 2*corr*cv_q*cv_c), the quotient's spread.")
print("corr > 0 means shared drift and some cancellation; corr ~ 0 means the")
print("noises are independent and the ratio compounds them.")
