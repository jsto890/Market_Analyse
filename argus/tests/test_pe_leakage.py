import numpy as np
import pandas as pd

from argus.position_engine.leakage import shuffle_future_frame, edge_collapses


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


def test_shuffle_permutes_only_bars_after_split():
    df = _series()
    split = 220
    sh = shuffle_future_frame(df, split=split, seed=7)
    # bars up to the split are identical; the future block is a permutation (same multiset)
    assert sh.iloc[:split + 1].equals(df.iloc[:split + 1])
    assert sorted(sh["close"].iloc[split + 1:]) == sorted(df["close"].iloc[split + 1:])


def test_edge_collapses_under_shuffled_future(tmp_path):
    df = _series()
    # real expectancy on this canned series is meaningful; shuffled-future expectancy
    # should be ~0 (no exploitable structure left). Gate passes when it collapses.
    assert edge_collapses(ticker="TEST", daily=df, spy=df, split=215,
                          out_dir=tmp_path, n_shuffles=20, tol=0.5) is True
