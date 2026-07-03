"""Baseline corpus validation (Phase-2 success-bar at scale). Replays the fixed baseline
engine over a price universe, re-prices NET of fills at a grid of cost multipliers, pools
trades, and reports R-space metrics (WR/expectancy+bootstrap-CI/MAR/exposure) vs SPY. Pure
given injected prices — offline-testable. The corpus-wide driver lives in backtests/."""
import os
import tempfile

import numpy as np
import pandas as pd

from ..db import get_conn
from .schema import ensure_schema
from .replay import replay
from .backtest import _price_trades, _bh
from .metrics import aggregate, block_bootstrap_ci
from .fills import FillModel

COST_MULTS = (1.0, 2.0, 3.0)
R_CLIP = 25.0   # R-multiples beyond this are artifacts of a near-zero risk denominator
                # (entry - init_stop ~ 0 on heavily split-adjusted low-priced names / gap-down
                # fills); legit trades are well within. The mean/MAR are computed on clipped R.


def robust_trade_stats(r_values, *, r_clip=R_CLIP) -> dict:
    """Outlier-robust central tendency for per-trade R. `raw_mean` is the naive (corruptible)
    mean; `median`/`trimmed_mean` are clip-free robust stats; `winsor_mean` is the mean of R
    clipped to +/-r_clip (the headline robust expectancy)."""
    r = np.asarray(r_values, dtype=float)
    r = r[np.isfinite(r)]
    if r.size == 0:
        return {"raw_mean": 0.0, "median": 0.0, "trimmed_mean": 0.0, "winsor_mean": 0.0, "n_clipped": 0}
    clipped = np.clip(r, -r_clip, r_clip)
    lo, hi = np.quantile(r, 0.05), np.quantile(r, 0.95)
    trimmed = r[(r >= lo) & (r <= hi)]
    return {"raw_mean": float(r.mean()), "median": float(np.median(r)),
            "trimmed_mean": float(trimmed.mean()) if trimmed.size else float(r.mean()),
            "winsor_mean": float(clipped.mean()), "n_clipped": int((np.abs(r) > r_clip).sum())}


def validate_corpus(prices, spy, *, model_ver="bt", cost_mults=COST_MULTS, years=None,
                    n_boot=500, seed=1, r_clip=R_CLIP, per_trade_out=None, on_progress=None) -> dict:
    """`prices` = {ticker: daily_df}; `spy` = SPY daily_df. Replays each name once, then for
    each cost multiplier re-prices via the FillModel, pools, and aggregates. Names with <60
    bars are skipped. `on_progress(i, n)` is called per name for long runs."""
    raw, total_bars = {}, 0
    items = list(prices.items())
    for i, (t, d) in enumerate(items, 1):
        if on_progress is not None:
            on_progress(i, len(items))
        if d is None or len(d) < 60:
            continue
        fd, tmp = tempfile.mkstemp(suffix=".db"); os.close(fd)
        c = get_conn(tmp)
        try:
            ensure_schema(c)
            replay(c, ticker=t, daily=d, spy=spy, sector=None, model_ver=model_ver,
                   run_kind="backtest", mode="paper")
            rows = [dict(r) for r in c.execute(
                "SELECT * FROM trades WHERE ticker=? AND model_ver=?", (t, model_ver)).fetchall()]
        finally:
            c.close(); os.unlink(tmp)
        raw[t] = (rows, d); total_bars += len(d)

    if years is None:
        spans = [d.index for _, (_, d) in raw.items()]
        if spans:
            lo = min(ix.min() for ix in spans); hi = max(ix.max() for ix in spans)
            years = max((hi - lo).days / 365.25, 1e-9)
        else:
            years = 1e-9
    bh_ret, bh_dd = _bh(spy)

    out = {"n_names": len(raw), "total_bars": total_bars, "years": years, "cost_sensitivity": {}}
    for mult in cost_mults:
        fm = FillModel(slippage_bps=5.0 * mult, commission_per_share=0.005 * mult)
        parts = []
        for t, (rows, d) in raw.items():
            priced = _price_trades(rows, d, None, fm)
            if len(priced):
                parts.append(priced.assign(ticker=t))
        pooled = (pd.concat(parts, ignore_index=True).sort_values("exit_ts") if parts
                  else pd.DataFrame(columns=["r_multiple", "holding_bars", "exit_ts"]))
        rob = robust_trade_stats(pooled["r_multiple"], r_clip=r_clip) if len(pooled) else \
            robust_trade_stats([], r_clip=r_clip)
        # mean/MAR/CI are computed on R CLIPPED to +/-r_clip so a near-zero-risk artifact
        # cannot hijack them; raw_mean/median/trimmed_mean are reported alongside.
        clipped = pooled.assign(r_multiple=np.clip(pooled["r_multiple"], -r_clip, r_clip)) \
            if len(pooled) else pooled
        m = aggregate(clipped, n_bars=total_bars or 1, years=years, bh_return=bh_ret,
                      bh_maxdd=bh_dd, spy_return=bh_ret, spy_maxdd=bh_dd)
        cr = clipped["r_multiple"].to_numpy(float) if len(clipped) else np.array([])
        ci = block_bootstrap_ci(cr, block_len=20, n_boot=n_boot, seed=seed) if len(cr) else (0.0, 0.0)
        out["spy_mar"] = m["spy_mar"]
        out["cost_sensitivity"][f"{mult}x"] = {
            "n_trades": m["n_trades"], "win_rate": m["win_rate"],
            "expectancy": rob["winsor_mean"], "expectancy_ci": list(ci),
            "median_r": rob["median"], "trimmed_mean_r": rob["trimmed_mean"],
            "raw_mean_r": rob["raw_mean"], "n_clipped": rob["n_clipped"],
            "net_r": m["net_r"], "mar": m["mar"], "max_dd_r": m["max_dd_r"],
            "exposure": m["exposure"], "trades_per_year": m["trades_per_year"],
            "mar_vs_spy": m["mar_vs_spy"]}
        if mult == cost_mults[0] and per_trade_out is not None and len(pooled):
            pooled[["ticker", "exit_ts", "r_multiple"]].to_csv(per_trade_out, index=False)
    return out
