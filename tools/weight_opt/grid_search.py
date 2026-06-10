"""Optimise the sentiment:technical blend by rank-IC, with a permutation null.

Why only sentiment:technical (not catalyst)? Catalyst scores exist for one date
(2026-06-09), which has almost no elapsed forward return — the catalyst weight
cannot be learned yet (held at literature prior; forward-validated at 6 weeks).

The blend is combined = a*sentiment + (1-a)*technical. Rank-IC (per-day Spearman
of combined vs forward return, averaged over days) is scale-invariant, so the
renormalisation constant in production blend_legs does not affect the ranking —
we sweep the single free parameter `a` = sentiment share of the 2-leg blend.

Run under base conda:
    /Users/josephstorey/anaconda3/bin/python tools/weight_opt/grid_search.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

sys.path.insert(0, str(Path(__file__).parent))
from schema import FORWARD_HORIZONS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs" / "weight_optimisation"
PANEL = OUT / "panel.csv"

USABLE_HORIZONS = [1, 5, 10]   # 20d has only ~27 rows — excluded
ALPHA_GRID = np.round(np.arange(0.05, 0.96, 0.025), 4)
MIN_NAMES_PER_DAY = 5
N_PERMUTATIONS = 2000
RNG = np.random.default_rng(20260609)

# Reference points (sentiment share of the 2-leg blend)
BASELINE_ALPHAS = {
    "production_35_45": 0.35 / (0.35 + 0.45),  # current top-level, 2-leg renormalised
    "equal_50_50": 0.5,
}


def _combined(df: pd.DataFrame, alpha: float) -> pd.Series:
    return alpha * df["sentiment_score"] + (1 - alpha) * df["tech_score"]


def _day_ics(df: pd.DataFrame, ret_col: str, alpha: float) -> list[float]:
    """Per-day Spearman correlation of combined score vs forward return."""
    ics = []
    for _, g in df.groupby("date"):
        g = g[g[ret_col].notna()]
        if len(g) < MIN_NAMES_PER_DAY:
            continue
        combined = _combined(g, alpha)
        if combined.nunique() < 2 or g[ret_col].nunique() < 2:
            continue
        rho, _ = spearmanr(combined, g[ret_col])
        if not np.isnan(rho):
            ics.append(rho)
    return ics


def _mean_ic(df: pd.DataFrame, ret_col: str, alpha: float) -> tuple[float, float, int]:
    ics = _day_ics(df, ret_col, alpha)
    if not ics:
        return float("nan"), float("nan"), 0
    arr = np.array(ics)
    tstat = arr.mean() / (arr.std(ddof=1) / np.sqrt(len(arr))) if len(arr) > 1 and arr.std() > 0 else float("nan")
    return arr.mean(), tstat, len(arr)


def _topk_readouts(df: pd.DataFrame, ret_col: str, alpha: float, k: int = 10) -> tuple[float, float]:
    """Avg per-day top-k hit-rate (ret>+10%) and top-k mean forward return."""
    hits, means = [], []
    for _, g in df.groupby("date"):
        g = g[g[ret_col].notna()]
        if len(g) < k:
            continue
        top = g.assign(_c=_combined(g, alpha)).nlargest(k, "_c")
        hits.append((top[ret_col] > 0.10).mean())
        means.append(top[ret_col].mean())
    return (float(np.mean(hits)) if hits else float("nan"),
            float(np.mean(means)) if means else float("nan"))


def _permutation_null(df: pd.DataFrame, ret_col: str) -> tuple[float, float, float]:
    """Best mean-IC over the alpha grid under within-day label shuffling.

    Returns (real_best_ic, null_p95, p_value) where p_value = P(null_best >= real_best).
    """
    real_best = max((_mean_ic(df, ret_col, a)[0] for a in ALPHA_GRID),
                    key=lambda x: (x if not np.isnan(x) else -9))
    null_best = np.empty(N_PERMUTATIONS)
    base = df[["date", "sentiment_score", "tech_score", ret_col]].copy()
    for i in range(N_PERMUTATIONS):
        shuffled = base.copy()
        shuffled[ret_col] = base.groupby("date")[ret_col].transform(
            lambda s: RNG.permutation(s.values))
        null_best[i] = max((_mean_ic(shuffled, ret_col, a)[0] for a in ALPHA_GRID),
                           key=lambda x: (x if not np.isnan(x) else -9))
    p_value = float((null_best >= real_best).mean())
    return float(real_best), float(np.percentile(null_best, 95)), p_value


def main() -> None:
    panel = pd.read_csv(PANEL)
    rows = []
    for h in USABLE_HORIZONS:
        ret_col = f"fwd_ret_{h}d"
        for a in ALPHA_GRID:
            mic, tstat, ndays = _mean_ic(panel, ret_col, a)
            hit, meanret = _topk_readouts(panel, ret_col, a)
            rows.append({"horizon_d": h, "alpha_sentiment": a, "alpha_technical": round(1 - a, 4),
                         "mean_ic": mic, "ic_tstat": tstat, "n_days": ndays,
                         "top10_hit_rate": hit, "top10_mean_ret": meanret})
    res = pd.DataFrame(rows)
    res.to_csv(OUT / "grid_search_results.csv", index=False)

    print("=" * 72)
    print("RANK-IC by horizon (higher = score ranks big movers better)")
    print("=" * 72)
    for h in USABLE_HORIZONS:
        sub = res[res.horizon_d == h].copy()
        best = sub.loc[sub.mean_ic.idxmax()]
        print(f"\n── {h}d forward ({int(best.n_days)} days) ──")
        print(f"  best:        a_sent={best.alpha_sentiment:.3f} "
              f"(tech={best.alpha_technical:.3f})  IC={best.mean_ic:+.3f}  t={best.ic_tstat:+.2f}")
        for name, a in BASELINE_ALPHAS.items():
            m, t, _ = _mean_ic(panel, f"fwd_ret_{h}d", a)
            print(f"  {name:16}: a_sent={a:.3f}  IC={m:+.3f}  t={t:+.2f}")

    print("\n" + "=" * 72)
    print(f"PERMUTATION NULL ({N_PERMUTATIONS} within-day label shuffles)")
    print("=" * 72)
    null_rows = []
    for h in USABLE_HORIZONS:
        real, p95, pval = _permutation_null(panel, f"fwd_ret_{h}d")
        verdict = "SIGNAL" if pval < 0.05 else "NOT distinguishable from chance"
        print(f"  {h}d: real_best_IC={real:+.3f}  null_p95={p95:+.3f}  p={pval:.3f}  → {verdict}")
        null_rows.append({"horizon_d": h, "real_best_ic": real, "null_p95": p95, "p_value": pval})
    pd.DataFrame(null_rows).to_csv(OUT / "permutation_null.csv", index=False)
    print(f"\nWrote grid_search_results.csv + permutation_null.csv to {OUT}")


if __name__ == "__main__":
    main()
