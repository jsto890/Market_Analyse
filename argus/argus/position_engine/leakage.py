"""Leakage shuffle gate (design spec §198). Permuting bars after the split must
collapse the OOS edge to ~0; a surviving edge means lookahead. A suite gate, not a
metric."""
from pathlib import Path

import numpy as np
import pandas as pd

from .backtest import run_backtest


def shuffle_future_frame(daily: pd.DataFrame, *, split: int, seed: int | None = None) -> pd.DataFrame:
    """Return a copy with bars AFTER `split` row-permuted (the index is kept in
    order; the OHLCV rows beyond the split are shuffled). Causal history up to and
    including `split` is untouched."""
    rng = np.random.default_rng(seed)
    fut = daily.iloc[split + 1:]
    perm = rng.permutation(len(fut))
    shuffled = fut.to_numpy()[perm]
    out = daily.copy()
    out.iloc[split + 1:] = shuffled
    return out


def edge_collapses(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame,
                   split: int, out_dir, n_shuffles: int = 30, tol: float = 0.25) -> bool:
    """True if mean expectancy across shuffled-future runs is within `tol` R of 0."""
    exps = []
    for k in range(n_shuffles):
        sh = shuffle_future_frame(daily, split=split, seed=k)
        m = run_backtest(ticker=ticker, daily=sh, spy=spy, intraday=None,
                         out_dir=Path(out_dir) / f"shuf_{k}", years=1.0)
        exps.append(m["expectancy"])
    return abs(float(np.mean(exps))) <= tol
