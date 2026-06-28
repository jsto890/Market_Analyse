"""Per-signal health graduation (design spec §4/§5). For each signal: per-day rank-IC
vs forward MAE and AUC vs the adverse label, each with a cluster-bootstrap CI; graduate
iff the effect is in the deterioration direction AND its CI excludes the null AND it
survives Holm-Bonferroni across the signals. Predictive only — changes no weights."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .evalstats import (auc, rank_ic_by_day, cluster_bootstrap_ci, holm,
                        permutation_pvalue)

_SIGNALS = ["H1", "H2", "H3", "H4", "H5"]
BLOCK_DAYS = 30          # pre-registered (spec §6)
N_BOOT = 2000
N_PERM = 2000            # pre-registered 2000-shuffle null (spec §7)
ALPHA = 0.05


def _signal_skill(panel: pd.DataFrame, col: str, *, seed: int) -> dict:
    fire_rate = float(panel[col].mean()) if len(panel) else 0.0
    ic_days = rank_ic_by_day(panel, col, "fwd_mae")
    ic = float(ic_days.mean()) if len(ic_days) else 0.0
    ic_ci = cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS, n_boot=N_BOOT, seed=seed)
    a = auc(panel[col].to_numpy(), panel["adverse"].to_numpy()) if fire_rate > 0 else float("nan")
    perm_p = permutation_pvalue(panel, col, "fwd_mae", n_perm=N_PERM, seed=seed)
    return {"rank_ic": ic, "ic_ci": list(ic_ci), "auc": a, "fire_rate": fire_rate,
            "perm_p": perm_p, "ic_excludes_zero": bool(np.isfinite(ic_ci[0]) and ic_ci[0] > 0)}


def evaluate(panel: pd.DataFrame) -> dict:
    out = {}
    for i, s in enumerate(_SIGNALS):
        out[s] = _signal_skill(panel, s, seed=i + 1)
    # Real multiplicity control: Holm-Bonferroni over the per-signal one-sided permutation
    # p-values (NOT a binary proxy — the proxy made Holm a no-op, audit blocker). A signal
    # graduates iff its IC is in the deterioration direction AND it survives Holm.
    rejected = holm({s: out[s]["perm_p"] for s in _SIGNALS}, alpha=ALPHA)
    for s in _SIGNALS:
        out[s]["holm_reject"] = bool(rejected.get(s, False))
        out[s]["graduated"] = bool(out[s]["rank_ic"] > 0 and rejected.get(s, False))
    # composite health (lower = worse): expect NEGATIVE IC vs forward MAE
    ic_days = rank_ic_by_day(panel, "health", "fwd_mae")
    chc = float(ic_days.mean()) if len(ic_days) else 0.0
    out["composite"] = {"rank_ic": chc,
                        "ic_ci": list(cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS,
                                                           n_boot=N_BOOT, seed=99))}
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
              "n_perm": N_PERM, "k_atr": 1.5, "horizon": 20,
              "gate": "rank_ic>0 AND Holm-corrected one-sided permutation p<0.05",
              "bootstrap": "fixed-length moving-block over days (CI is descriptive; "
                           "abstains when valid days < 3*block_days)",
              "label": "forward-MAE in ATR units, capped at actual position exit",
              "sector_rs": "SPY-only (v1)", "signals": res}
    (out_dir / "graduation_report.json").write_text(json.dumps(report, indent=2, default=float))
    return report
