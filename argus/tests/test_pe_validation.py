import numpy as np
import pandas as pd
from argus.position_engine.validation import validate_corpus


def _series():
    seg = list(np.linspace(50, 148, 217))
    closes = seg + [145.0, 142.5, 140.5, 139.5] + [142.0] + [142.5] + [144.0, 145.5, 147.0] \
        + list(np.linspace(146.0, 120, 18))
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0; low = c - 1.0; vol = np.full(n, 1e6)
    high[221] = c[221] + 0.8; vol[221] = 1.7e6
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c, "volume": vol}, index=idx)


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_validate_corpus_cost_sensitivity_erodes_expectancy():
    df = _series()
    spy = _spy(len(df), df.index)
    res = validate_corpus({"TEST": df}, spy, years=1.0)
    cs = res["cost_sensitivity"]
    assert set(cs) == {"1.0x", "2.0x", "3.0x"}
    assert cs["1.0x"]["n_trades"] >= 1
    assert "expectancy_ci" in cs["1.0x"]
    assert cs["1.0x"]["expectancy"] >= cs["3.0x"]["expectancy"]   # higher cost -> lower expectancy


def test_validate_corpus_skips_short_series():
    df = _series()
    spy = _spy(len(df), df.index)
    short = df.iloc[:30]
    res = validate_corpus({"TEST": df, "SHORT": short}, spy, years=1.0)
    assert res["n_names"] == 1                                    # SHORT (<60 bars) skipped
