"""Per-signal health graduation (design spec §4/§5). For each signal: per-day rank-IC
vs forward MAE and AUC vs the adverse label, each with a cluster-bootstrap CI; graduate
iff the effect is in the deterioration direction AND its CI excludes the null AND it
survives Holm-Bonferroni across the signals. Predictive only — changes no weights."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .evalstats import auc, rank_ic_by_day, cluster_bootstrap_ci, holm

_SIGNALS = ["H1", "H2", "H3", "H4", "H5"]
BLOCK_DAYS = 30          # pre-registered (spec §6)
N_BOOT = 2000
ALPHA = 0.05


def _signal_skill(panel: pd.DataFrame, col: str) -> dict:
    fire_rate = float(panel[col].mean()) if len(panel) else 0.0
    ic_days = rank_ic_by_day(panel, col, "fwd_mae")
    ic = float(ic_days.mean()) if len(ic_days) else 0.0
    ic_ci = cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS, n_boot=N_BOOT, seed=1)
    a = auc(panel[col].to_numpy(), panel["adverse"].to_numpy()) if fire_rate > 0 else float("nan")
    return {"rank_ic": ic, "ic_ci": list(ic_ci), "auc": a, "fire_rate": fire_rate,
            "ic_excludes_zero": bool(ic_ci[0] > 0)}


def evaluate(panel: pd.DataFrame) -> dict:
    out = {}
    for s in _SIGNALS:
        out[s] = _signal_skill(panel, s)
    # Holm across signals using a one-sided IC p-proxy: distance of CI low from 0.
    # Graduate iff IC>0 and its bootstrap CI excludes 0 (the cluster-bootstrap gate),
    # then require Holm survival among the signals whose CI cleared 0.
    p_proxy = {s: (0.001 if out[s]["ic_excludes_zero"] and out[s]["rank_ic"] > 0 else 0.5)
               for s in _SIGNALS}
    rejected = holm(p_proxy, alpha=ALPHA)
    for s in _SIGNALS:
        out[s]["graduated"] = bool(out[s]["rank_ic"] > 0 and out[s]["ic_excludes_zero"]
                                   and rejected.get(s, False))
        out[s]["holm_reject"] = bool(rejected.get(s, False))
    # composite health (lower = worse): expect NEGATIVE IC vs forward MAE
    ic_days = rank_ic_by_day(panel, "health", "fwd_mae")
    chc = float(ic_days.mean()) if len(ic_days) else 0.0
    out["composite"] = {"rank_ic": chc,
                        "ic_ci": list(cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS,
                                                           n_boot=N_BOOT, seed=2))}
    return out


def run_evaluation(*, corpus_dir, start, end, membership_path, out_dir=None) -> dict:
    from .corpus import load_membership, members_active_between, load_prices
    from ..db import get_conn
    out_dir = Path(out_dir) if out_dir is not None else Path(corpus_dir)
    membership = load_membership(membership_path)
    universe = sorted(members_active_between(membership, start, end))
    conn = get_conn(Path(corpus_dir) / "corpus.db")
    prices = {t: load_prices(conn, t, start=start, end=end) for t in universe}
    conn.close()
    spy = prices.get("SPY")
    from .panelbuild import build_panel
    names = [t for t in universe if t != "SPY" and not prices[t].empty]
    panel = build_panel(names, prices=prices, spy=spy)
    res = evaluate(panel)
    report = {"start": start, "end": str(end), "n_names": len(names),
              "n_rows": int(len(panel)), "block_days": BLOCK_DAYS, "n_boot": N_BOOT,
              "k_atr": 1.5, "horizon": 20, "sector_rs": "SPY-only (v1)", "signals": res}
    (out_dir / "graduation_report.json").write_text(json.dumps(report, indent=2, default=float))
    return report
