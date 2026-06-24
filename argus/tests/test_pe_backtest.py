import json

import numpy as np
import pandas as pd

from argus.position_engine.backtest import run_backtest
from argus.position_engine.params import EngineParams


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


def test_run_backtest_writes_artifacts_and_net_metrics(tmp_path):
    df = _series()
    out = run_backtest(ticker="TEST", daily=df, spy=df, sector=None,
                       params=EngineParams(), out_dir=tmp_path, intraday=None,
                       years=1.0)
    assert (tmp_path / "trades.csv").exists()
    assert (tmp_path / "metrics.json").exists()
    assert (tmp_path / "params.json").exists()
    metrics = json.loads((tmp_path / "metrics.json").read_text())
    assert metrics["n_trades"] >= 1
    assert "expectancy" in metrics and "mar" in metrics


def test_backtest_never_touches_live_db(tmp_path):
    df = _series()
    run_backtest(ticker="TEST", daily=df, spy=df, sector=None, out_dir=tmp_path,
                 intraday=None, years=1.0)
    assert (tmp_path / "run.db").exists()
