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


def validate_corpus(prices, spy, *, model_ver="bt", cost_mults=COST_MULTS, years=None,
                    n_boot=500, seed=1) -> dict:
    """`prices` = {ticker: daily_df}; `spy` = SPY daily_df. Replays each name once, then for
    each cost multiplier re-prices via the FillModel, pools, and aggregates. Names with <60
    bars are skipped."""
    raw, total_bars = {}, 0
    for t, d in prices.items():
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
        m = aggregate(pooled, n_bars=total_bars or 1, years=years, bh_return=bh_ret,
                      bh_maxdd=bh_dd, spy_return=bh_ret, spy_maxdd=bh_dd)
        r = pooled["r_multiple"].to_numpy(float) if len(pooled) else np.array([])
        ci = block_bootstrap_ci(r, block_len=20, n_boot=n_boot, seed=seed) if len(r) else (0.0, 0.0)
        out["spy_mar"] = m["spy_mar"]
        out["cost_sensitivity"][f"{mult}x"] = {
            "n_trades": m["n_trades"], "win_rate": m["win_rate"], "avg_r": m["avg_r"],
            "expectancy": m["expectancy"], "expectancy_ci": list(ci), "net_r": m["net_r"],
            "mar": m["mar"], "max_dd_r": m["max_dd_r"], "exposure": m["exposure"],
            "trades_per_year": m["trades_per_year"], "mar_vs_spy": m["mar_vs_spy"]}
    return out
