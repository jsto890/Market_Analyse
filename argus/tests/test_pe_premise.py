import numpy as np
import pandas as pd
from argus.position_engine.premise import _enrich, extract_trades, _metrics, oracle_ceiling


def _series():
    # inlined uptrend->pullback->continuation->drop with a LONG round-trip (from test_pe_replay)
    seg = list(np.linspace(50, 148, 217))
    closes = seg + [145.0, 142.5, 140.5, 139.5] + [142.0] + [142.5] + [144.0, 145.5, 147.0] \
        + list(np.linspace(146.0, 120, 18))
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    high[221] = c[221] + 0.8
    vol[221] = 1.7e6
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c, "volume": vol}, index=idx)


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_enrich_adds_full_series_indicator_columns():
    d = _enrich(_series())
    assert {"atr14", "donch_low20"}.issubset(d.columns)
    assert d["atr14"].iloc[-1] > 0
    assert np.isnan(d["donch_low20"].iloc[0])         # shifted -> first is NaN


def test_extract_trades_returns_enriched_paths():
    df = _series()
    spy = _spy(len(df), df.index)
    trades = extract_trades("TEST", df, spy)
    assert len(trades) >= 1
    t = trades[0]
    assert {"ticker", "entry_ts", "entry_px", "r", "hold_r", "mfe_r", "path"} <= set(t)
    assert t["r"] > 0
    assert {"atr14", "donch_low20", "health_flags"}.issubset(t["path"].columns)
    assert len(t["path"]) >= 2                          # at least entry..exit


def test_metrics_returns_mar_and_expectancy():
    mar, exp = _metrics([1.0, -0.5, 2.0, -0.5], years=1.0)
    assert abs(exp - 0.5) < 1e-9                       # mean R
    assert mar > 0                                     # net 2.0 over a drawdown


def test_oracle_ceiling_beats_hold():
    # NB metrics.aggregate gives mar=0 when there is NO drawdown (the _safe_ratio convention),
    # so the oracle series must still contain a loss for MAR to be well-defined.
    trades = [{"entry_ts": pd.Timestamp("2021-01-04"), "hold_r": 0.5, "mfe_r": 2.0},
              {"entry_ts": pd.Timestamp("2021-02-01"), "hold_r": -0.4, "mfe_r": -0.2},
              {"entry_ts": pd.Timestamp("2021-03-01"), "hold_r": 1.0, "mfe_r": 3.0}]
    oc = oracle_ceiling(trades, years=1.0)
    assert abs(oc["hold_exp"] - np.mean([0.5, -0.4, 1.0])) < 1e-9
    assert abs(oc["oracle_exp"] - np.mean([2.0, -0.2, 3.0])) < 1e-9   # oracle = max(hold, mfe)
    assert oc["uplift_exp"] > 0 and oc["uplift_mar"] > 0
