"""Ridge regression as a SIGN-SANITY check only — not for setting weights.

The reviewers were explicit: normalising ridge coefficients to sum to 1 is
invalid (coefficients carry feature scale, can be negative, and the production
blend is a convex combination of raw legs). So this script does NOT produce
weights. It standardises the leg scores and reports the SIGN and magnitude of
each coefficient per horizon, answering one question: do the legs even have a
positive predictive relationship with forward return? If a leg's coefficient is
reliably negative, that is a red flag worth investigating before trusting it.

The fit carries a DATE FIXED EFFECT — features demeaned and target ranked within
each report date. Without it (as this script ran until 2026-08-03) the pooled fit is
dominated by a between-date market-timing channel: it answers "were high-sentiment
*days* good days", not "did high-sentiment *names* beat their peers that day", which
is the only thing the production blend can act on. That defect produced a spurious
"sentiment positive at every horizon" in the 2026-06-09 run, quoted as corroboration
in weight_decision.md, and an equally spurious sign inversion on 2026-08-03.
Coefficients are reported in target-sd units — the raw ranks have sd ~400-500, so an
untransformed coefficient of -37 is -0.07 sd, which is noise wearing a big number.

Run under the argus venv:
    argus/.venv/bin/python tools/weight_opt/ridge_sanity.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "weight_optimisation"
PANEL = OUT / "panel.csv"
USABLE_HORIZONS = [1, 5, 10]


def main() -> None:
    panel = pd.read_csv(PANEL)
    rows = []
    for h in USABLE_HORIZONS:
        ret_col = f"fwd_ret_{h}d"
        df = panel[["date", "sentiment_score", "tech_score", ret_col]].dropna()
        if len(df) < 30:
            continue
        # Rank the target WITHIN each date and rescale to [-0.5, 0.5], so every day
        # contributes on the same scale regardless of how many names it carried.
        y = df.groupby("date")[ret_col].transform(
            lambda s: s.rank(pct=True) - 0.5).values
        # Date fixed effect: demean each feature within its date, so the fit sees
        # only cross-sectional variation — the same quantity rank-IC measures.
        Xs = StandardScaler().fit_transform(
            df.groupby("date")[["sentiment_score", "tech_score"]]
              .transform(lambda s: s - s.mean()).values)
        model = Ridge(alpha=1.0).fit(Xs, y)
        sd_y = float(np.std(y)) or 1.0
        rows.append({
            "horizon_d": h, "n": len(df),
            "coef_sentiment": round(float(model.coef_[0]) / sd_y, 4),
            "coef_technical": round(float(model.coef_[1]) / sd_y, 4),
            "sentiment_sign": "＋" if model.coef_[0] > 0 else "－",
            "technical_sign": "＋" if model.coef_[1] > 0 else "－",
        })
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "ridge_sanity.csv", index=False)
    print("Ridge SIGN-sanity (standardised features, rank target) — NOT weights:")
    print(res.to_string(index=False))
    print("\nInterpretation: positive sign = leg ranks higher-scored names toward higher")
    print("forward returns. Negative sign on a leg is a red flag, not a weight.")


if __name__ == "__main__":
    main()
