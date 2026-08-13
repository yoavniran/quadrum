"""Minimum regression each scenario's gate can actually catch.

The gate fails only when the ratio's CI *lower* bound exceeds
baseline.ratio * 1.15. So a scenario detects a regression of factor R only when

    R * (1 - halfWidth) > 1.15

using the ratio CI half-width the shipped pipeline computes. Noise therefore
never causes a false failure -- it only raises the bar for a true one.
"""

import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "results" / "baseline.json"
base = json.loads(BASE.read_text())
TOL = 1.15

hdr = f"{'scenario':<28} {'gated':>6} {'ratio':>8} {'ratio CI hw':>12} {'detects':>10}"
print(hdr)
print("-" * len(hdr))

for sid, meta in base["scenarios"].items():
    ratio = meta.get("ratio")
    ci = meta.get("ratioCi95")
    gated = meta.get("gated")
    if not ratio or not ci or any(x is None for x in ci):
        print(f"{sid:<28} {str(gated):>6} {'n/a':>8}")
        continue
    hw = ((ci[1] - ci[0]) / 2) / ratio
    if hw >= 1:
        detects = "nothing"
    else:
        detects = f"+{(TOL / (1 - hw) - 1) * 100:.0f}%"
    print(f"{sid:<28} {str(gated):>6} {ratio:8.3f} {hw*100:11.1f}% {detects:>10}")

print()
print("'detects' = smallest true regression in the ratio that would fail the build.")
print("A demoted scenario detects nothing at all, however tight its interval.")
