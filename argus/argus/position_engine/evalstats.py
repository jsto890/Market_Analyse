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
                         alpha: float = 0.05, seed: int | None = None,
                         min_days: int | None = None) -> tuple[float, float]:
    """CI of the mean of a per-day metric series via a fixed-length moving-block bootstrap
    over DAYS (each day is an atomic unit → preserves the cross-sectional clustering,
    blocks of consecutive days preserve serial dependence). Abstains (returns NaN, NaN)
    when there are too few valid days to resample more than one block — otherwise every
    replicate is identical and the CI collapses to a zero-width point mass that would
    auto-pass a CI-excludes-zero gate (audit blocker)."""
    v = np.asarray(day_values, dtype=float)
    v = v[np.isfinite(v)]
    nobs = v.size
    floor = (3 * block_days) if min_days is None else min_days
    if nobs < floor or nobs == 0:
        return (float("nan"), float("nan"))
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


def _day_rank_vectors(df, signal_col, target_col, day_col):
    """Per contributing day, the centered signal-rank vector and the unit-normalised
    target-rank vector, so that rs @ rt_unit == Spearman ρ (Pearson on average ranks).
    Days with no signal contrast (nunique<2) or <3 names carry no information → dropped."""
    out = []
    for _, g in df.groupby(day_col):
        if g[signal_col].nunique() < 2 or len(g) < 3:
            continue
        rs = g[signal_col].rank().to_numpy()
        rt = g[target_col].rank().to_numpy()
        rs = rs - rs.mean()
        rt = rt - rt.mean()
        ns, nt = np.sqrt((rs * rs).sum()), np.sqrt((rt * rt).sum())
        if ns == 0 or nt == 0:
            continue
        out.append((rs, rt / (ns * nt)))
    return out


def permutation_pvalue(df: pd.DataFrame, signal_col: str, target_col: str, *,
                       n_perm: int = 2000, seed: int | None = None,
                       day_col: str = "date") -> float:
    """One-sided permutation p-value for 'the mean per-day rank-IC of signal vs target is
    > 0' (the deterioration direction). The null permutes the signal WITHIN each day,
    preserving that day's fire-count and the cross-sectional target distribution, and
    recomputes the mean-of-day rank-IC (spec §5/§7's 2000-shuffle null). Returns 1.0 when
    no day carries signal contrast (e.g. a never-firing signal) — cannot graduate."""
    days = _day_rank_vectors(df, signal_col, target_col, day_col)
    if not days:
        return 1.0
    obs = float(np.mean([rs @ rtn for rs, rtn in days]))
    rng = np.random.default_rng(seed)
    ge = 0
    for _ in range(n_perm):
        null = np.mean([rs[rng.permutation(rs.size)] @ rtn for rs, rtn in days])
        if null >= obs:
            ge += 1
    return (1 + ge) / (n_perm + 1)


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
