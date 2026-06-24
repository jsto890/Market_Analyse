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
