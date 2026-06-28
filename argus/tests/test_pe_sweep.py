import numpy as np
import pandas as pd

from argus.position_engine.sweep import run_sweep


def _series():
    seg = list(np.linspace(50, 148, 217))
    pull = [145.0, 142.5, 140.5, 139.5]
    resume = [142.0]
    fill = [142.5]
    cont = [144.0, 145.5, 147.0]
    drop = list(np.linspace(146.0, 120, 18))
    closes = seg + pull + resume + fill + cont + drop
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    sidx = 221
    vol[sidx] = 1.7e6
    high[sidx] = c[sidx] + 0.8
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c,
                         "volume": vol}, index=idx)


def test_sweep_runs_grid_and_writes_summary(tmp_path):
    df = _series()
    grid = {"cooldown_bars": [3, 5], "stop_atr": [1.5, 2.0]}   # 2x2 = 4 combos
    summary = run_sweep(ticker="TEST", daily=df, spy=df, grid=grid,
                        out_dir=tmp_path, years=1.0)
    assert len(summary["runs"]) == 4
    assert (tmp_path / "sweep_summary.json").exists()
    # each run records its params + headline metrics
    r0 = summary["runs"][0]
    assert "params" in r0 and "mar" in r0 and "expectancy" in r0
    # a best-by-MAR pick is reported
    assert "best_by_mar" in summary


def test_sweep_reports_stability_neighbourhood(tmp_path):
    df = _series()
    grid = {"cooldown_bars": [3, 5, 8]}
    summary = run_sweep(ticker="TEST", daily=df, spy=df, grid=grid,
                        out_dir=tmp_path, years=1.0)
    # MAR spread across the 1-D grid is reported so a sharp peak (overfit) is visible
    assert "mar_spread" in summary and summary["mar_spread"] >= 0.0
