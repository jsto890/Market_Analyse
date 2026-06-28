"""R-space backtest metrics (design spec §11). The engine is signals-only, so we
do NOT invent dollar sizing: the equity curve is cumulative net-R, drawdown is in
R, and MAR = (net_R / years) / max_drawdown_R. Benchmarks are compared as MAR
ratios (return%/maxDD%) so the comparison is dimensionally honest."""
import numpy as np
import pandas as pd


def _max_dd_r(cum: np.ndarray) -> float:
    if cum.size == 0:
        return 0.0
    peak = np.maximum.accumulate(cum)
    return float(np.max(peak - cum))


def aggregate(trades: pd.DataFrame, *, n_bars: int, years: float,
              bh_return: float, bh_maxdd: float,
              spy_return: float, spy_maxdd: float) -> dict:
    n = len(trades)
    if n == 0:
        return {"n_trades": 0, "win_rate": 0.0, "avg_r": 0.0, "expectancy": 0.0,
                "net_r": 0.0, "exposure": 0.0, "max_dd_r": 0.0, "mar": 0.0,
                "trades_per_year": 0.0, "bh_mar": _safe_ratio(bh_return, bh_maxdd),
                "spy_mar": _safe_ratio(spy_return, spy_maxdd), "mar_vs_bh": 0.0,
                "mar_vs_spy": 0.0}
    r = trades["r_multiple"].astype(float).to_numpy()
    cum = np.cumsum(r)
    net_r = float(cum[-1])
    max_dd_r = _max_dd_r(cum)
    # No-drawdown case (max_dd_r == 0) deliberately yields MAR = 0.0 via _safe_ratio,
    # not +inf: keeps the metric JSON-serialisable and finite for the downstream
    # success-bar comparator. The comparator owns any "undefined drawdown" handling.
    mar = _safe_ratio(net_r / years, max_dd_r)
    bh_mar = _safe_ratio(bh_return, bh_maxdd)
    spy_mar = _safe_ratio(spy_return, spy_maxdd)
    return {
        "n_trades": n,
        "win_rate": float((r > 0).mean()),
        "avg_r": float(r.mean()),
        "expectancy": float(r.mean()),               # net R per trade
        "net_r": net_r,
        "exposure": float(trades["holding_bars"].sum()) / n_bars if n_bars else 0.0,
        "max_dd_r": max_dd_r,
        "mar": mar,
        "trades_per_year": n / years if years else 0.0,
        "bh_mar": bh_mar,
        "spy_mar": spy_mar,
        "mar_vs_bh": mar - bh_mar,
        "mar_vs_spy": mar - spy_mar,
    }


def _safe_ratio(num: float, den: float) -> float:
    return float(num / den) if den and den > 0 else 0.0


def block_bootstrap_ci(values, block_len: int, n_boot: int = 1000,
                       alpha: float = 0.05, seed: int | None = None) -> tuple[float, float]:
    """Moving-block bootstrap CI for the mean of a serially-correlated series.
    Resamples contiguous blocks (length block_len) with replacement until the
    sample length is covered, then takes percentile bounds across n_boot means."""
    v = np.asarray(values, dtype=float)
    nobs = v.size
    if nobs == 0:
        return (0.0, 0.0)
    block_len = max(1, min(block_len, nobs))
    n_blocks = int(np.ceil(nobs / block_len))
    starts_max = nobs - block_len + 1
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for b in range(n_boot):
        starts = rng.integers(0, starts_max, size=n_blocks)
        sample = np.concatenate([v[s:s + block_len] for s in starts])[:nobs]
        means[b] = sample.mean()
    return (float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2)))


def beats_baseline(candidate: dict, baseline: dict, *, mar_uplift_ci: tuple[float, float],
                   mar_uplift_min: float = 0.15, trades_per_year_cap: float = 0.25) -> dict:
    """Pre-registered success bar (spec §196): MAR improves by >= mar_uplift_min,
    trades/year rises by <= trades_per_year_cap, and the MAR-uplift bootstrap CI
    excludes zero. mar_uplift_ci is the CI of (candidate-baseline) MAR over regimes.

    A degenerate baseline (MAR == 0, i.e. no drawdown / break-even, or zero
    trades/year) makes the *relative* uplift undefined; the gate conservatively
    does NOT graduate in that case (passed=False, baseline_degenerate=True)."""
    base_mar = baseline["mar"]
    base_tpy = baseline["trades_per_year"]
    ci_lo, ci_hi = mar_uplift_ci
    ci_excludes_zero = ci_lo > 0 or ci_hi < 0          # CI does not span zero
    if base_mar == 0 or base_tpy == 0:
        return {"passed": False, "mar_uplift": float("nan"),
                "tpy_increase": float("nan"), "ci_excludes_zero": bool(ci_excludes_zero),
                "baseline_degenerate": True}
    mar_uplift = (candidate["mar"] - base_mar) / abs(base_mar)
    tpy_increase = (candidate["trades_per_year"] - base_tpy) / abs(base_tpy)
    passed = (mar_uplift >= mar_uplift_min and tpy_increase <= trades_per_year_cap
              and ci_excludes_zero)
    return {"passed": bool(passed), "mar_uplift": float(mar_uplift),
            "tpy_increase": float(tpy_increase), "ci_excludes_zero": bool(ci_excludes_zero),
            "baseline_degenerate": False}
