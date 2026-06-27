"""Parameter sweep over the pre-registered tunables (design spec §11/§198). Runs a
grid of EngineParams into per-combo per-run dirs, collects headline metrics, and
reports the MAR spread so a sharp (overfit) peak is visible — prefer flat surfaces."""
import itertools
import json
from dataclasses import replace
from pathlib import Path

import pandas as pd

from .params import DEFAULT
from .backtest import run_backtest


def run_sweep(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame, grid: dict,
              out_dir, sector: pd.DataFrame | None = None, years: float | None = None) -> dict:
    """`grid` maps EngineParams field -> list of values. Cartesian product is run."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fields = list(grid.keys())
    runs = []
    for combo in itertools.product(*(grid[f] for f in fields)):
        overrides = dict(zip(fields, combo))
        params = replace(DEFAULT, **overrides)
        tag = "_".join(f"{f}{v}" for f, v in overrides.items())
        m = run_backtest(ticker=ticker, daily=daily, spy=spy, sector=sector,
                         params=params, intraday=None, out_dir=out_dir / tag, years=years)
        runs.append({"params": overrides, "mar": m["mar"], "expectancy": m["expectancy"],
                     "net_r": m["net_r"], "trades_per_year": m["trades_per_year"],
                     "max_dd_r": m["max_dd_r"]})
    mars = [r["mar"] for r in runs] or [0.0]
    best = max(runs, key=lambda r: r["mar"]) if runs else None
    summary = {"ticker": ticker, "n_runs": len(runs), "runs": runs,
               "best_by_mar": best, "mar_spread": float(max(mars) - min(mars))}
    (out_dir / "sweep_summary.json").write_text(json.dumps(summary, indent=2))
    return summary
