"""Ridge regression as a SIGN-SANITY check only — not for setting weights.

The reviewers were explicit: normalising ridge coefficients to sum to 1 is
invalid (coefficients carry feature scale, can be negative, and the production
blend is a convex combination of raw legs). So this script does NOT produce
weights. It standardises the leg scores and reports the SIGN and magnitude of
each coefficient per horizon, answering one question: do the legs even have a
positive predictive relationship with forward return? If a leg's coefficient is
reliably negative, that is a red flag worth investigating before trusting it.

Run under base conda:
    /Users/josephstorey/anaconda3/bin/python tools/weight_opt/ridge_sanity.py
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
        df = panel[["sentiment_score", "tech_score", ret_col]].dropna()
        if len(df) < 30:
            continue
        X = df[["sentiment_score", "tech_score"]].values
        y = df[ret_col].values
        Xs = StandardScaler().fit_transform(X)
        # rank-transform target so the fit is not dominated by the fat right tail
        y_rank = pd.Series(y).rank().values
        model = Ridge(alpha=1.0).fit(Xs, y_rank)
        rows.append({
            "horizon_d": h, "n": len(df),
            "coef_sentiment": round(float(model.coef_[0]), 3),
            "coef_technical": round(float(model.coef_[1]), 3),
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
