"""Statistics toolkit for health-signal graduation (design spec §5). Per-day rank-IC,
rank-based AUC, a CLUSTER bootstrap that resamples whole trading-day cross-sections in
moving blocks (so cross-sectional + serial correlation is respected, not assumed away),
and Holm-Bonferroni. numpy/scipy only — sklearn is absent."""
import numpy as np
import pandas as pd
from scipy.stats import spearmanr


def auc(scores, labels) -> float:
    """Rank-based AUC (Mann-Whitney U / (n_pos*n_neg)). 0.5 = chance."""
    s = np.asarray(scores, float)
    y = np.asarray(labels, float)
    pos, neg = s[y == 1], s[y == 0]
    if pos.size == 0 or neg.size == 0:
        return float("nan")
    ranks = pd.Series(s).rank().to_numpy()
    r_pos = ranks[y == 1].sum()
    u = r_pos - pos.size * (pos.size + 1) / 2.0
    return float(u / (pos.size * neg.size))


def rank_ic_by_day(df: pd.DataFrame, signal_col: str, target_col: str,
                   day_col: str = "date") -> pd.Series:
    """Per-day Spearman ρ of signal vs target across that day's cross-section."""
    out = {}
    for day, g in df.groupby(day_col):
        if g[signal_col].nunique() < 2 or len(g) < 3:
            continue
        rho, _ = spearmanr(g[signal_col], g[target_col])
        if not np.isnan(rho):
            out[day] = float(rho)
    return pd.Series(out)


def cluster_bootstrap_ci(day_values, *, block_days: int = 30, n_boot: int = 2000,
                         alpha: float = 0.05, seed: int | None = None) -> tuple[float, float]:
    """CI of the mean of a per-day metric series via a moving-block bootstrap over DAYS
    (each day is an atomic unit → preserves the cross-sectional clustering, blocks of
    consecutive days preserve serial dependence)."""
    v = np.asarray(day_values, dtype=float)
    v = v[np.isfinite(v)]
    nobs = v.size
    if nobs == 0:
        return (0.0, 0.0)
    block_days = max(1, min(block_days, nobs))
    n_blocks = int(np.ceil(nobs / block_days))
    starts_max = nobs - block_days + 1
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for b in range(n_boot):
        starts = rng.integers(0, starts_max, size=n_blocks)
        sample = np.concatenate([v[s:s + block_days] for s in starts])[:nobs]
        means[b] = sample.mean()
    return (float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2)))


def holm(pvalues: dict, alpha: float = 0.05) -> dict:
    """Holm-Bonferroni: sort ascending, reject p_(i) while p_(i) <= alpha/(m-i); stop at
    the first failure (all subsequent are not rejected). Returns {key: reject_bool}."""
    items = sorted(pvalues.items(), key=lambda kv: kv[1])
    m = len(items)
    out, still = {}, True
    for i, (key, p) in enumerate(items):
        if still and p <= alpha / (m - i):
            out[key] = True
        else:
            still = False
            out[key] = False
    return out
