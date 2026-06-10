"""Forward-validate the catalyst intra-weights from logged per-sub-agent votes.

For each of the 5 catalyst sub-agents, correlate its signed vote confidence
(logged in the bridge CSV since 2026-06-09) against realised forward returns,
over the rows where that sub-agent actually fired (non-zero vote). Sub-agents
whose votes rank-correlate with forward returns deserve more weight; those near
zero deserve less. This replaces the literature prior with evidence where the
data is strong enough.

Run under base conda (after historical_bridge_dataset.py):
    /Users/josephstorey/anaconda3/bin/python tools/weight_opt/vote_validation.py
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).parent))
from schema import VOTE_COLUMNS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "weight_optimisation"
PANEL = OUT / "panel.csv"
HISTORY = OUT / "catalyst_weight_history.csv"

USABLE_HORIZONS = [5, 10, 20]   # catalysts are a multi-day-to-weeks signal
MIN_FIRES = 20                  # need at least this many non-zero votes to judge


def main() -> None:
    panel = pd.read_csv(PANEL)
    rows = []
    for vc in VOTE_COLUMNS:
        if vc not in panel:
            continue
        v = pd.to_numeric(panel[vc], errors="coerce")
        fired = panel[v.fillna(0) != 0].copy()
        fired[vc] = pd.to_numeric(fired[vc], errors="coerce")
        for h in USABLE_HORIZONS:
            ret = pd.to_numeric(fired.get(f"fwd_ret_{h}d"), errors="coerce")
            pair = pd.DataFrame({"v": fired[vc], "r": ret}).dropna()
            if len(pair) < MIN_FIRES or pair["v"].nunique() < 2:
                rho, p, n = np.nan, np.nan, len(pair)
            else:
                rho, p = spearmanr(pair["v"], pair["r"])
                n = len(pair)
            rows.append({"sub_agent": vc.replace("vote_", ""), "horizon_d": h,
                         "n_fires": n, "spearman": round(rho, 3) if not np.isnan(rho) else "",
                         "p_value": round(p, 3) if not np.isnan(p) else ""})
    res = pd.DataFrame(rows)
    print("Catalyst sub-agent vote vs forward return (where the vote fired):")
    print(res.to_string(index=False))

    enough = res[pd.to_numeric(res["n_fires"], errors="coerce") >= MIN_FIRES]
    if enough.empty:
        print(f"\nNot enough fired votes yet (need >= {MIN_FIRES}). Keep the literature prior.")
    else:
        print("\nWhere n_fires is adequate, raise weights for strong +Spearman sub-agents,")
        print("cut weights for near-zero / negative ones. Update config/weights.yaml accordingly.")

    snap = res.copy()
    snap.insert(0, "run_date", date.today().isoformat())
    snap.to_csv(HISTORY, mode="a", header=not HISTORY.exists(), index=False)
    print(f"\nAppended to {HISTORY}")


if __name__ == "__main__":
    main()
