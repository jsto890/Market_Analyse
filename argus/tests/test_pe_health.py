import numpy as np
import pandas as pd

from argus.position_engine.health import (
    WEIGHTS, h2_trend_break, h3_distribution, composite, health,
)


def _flat_daily(n=80, px=100.0):
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    c = np.full(n, px)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_composite_no_flags_is_full_health():
    h, flags = composite({"H1": False, "H2": False, "H3": False, "H4": False, "H5": False})
    assert h == 100 and flags == ""


def test_composite_subtracts_weights_and_lists_flags_in_order():
    h, flags = composite({"H1": False, "H2": True, "H3": True, "H4": False, "H5": False})
    assert h == 100 - WEIGHTS["H2"] - WEIGHTS["H3"]      # 100-25-25 = 50
    assert flags == "H2,H3"                               # fixed H1..H5 order


def test_composite_clamps_at_zero():
    allflags = {k: True for k in ("H1", "H2", "H3", "H4", "H5")}
    h, flags = composite(allflags)
    assert h == 0 and flags == "H1,H2,H3,H4,H5"


def test_h2_trend_break_fires_after_two_closes_below_ema_by_atr():
    d = _flat_daily(80, 100.0)
    # drive the last two closes well below the 50-EMA (>0.5 ATR); ATR~2 here
    d.iloc[-2, d.columns.get_loc("close")] = 80.0
    d.iloc[-1, d.columns.get_loc("close")] = 79.0
    assert h2_trend_break(d) is True


def test_h2_trend_break_false_when_above_ema():
    assert h2_trend_break(_flat_daily(80, 100.0)) is False


def test_h2_requires_two_consecutive_closes():
    d = _flat_daily(80, 100.0)
    d.iloc[-1, d.columns.get_loc("close")] = 79.0   # only the final close breaks
    assert h2_trend_break(d) is False


def test_h3_distribution_fires_on_three_highvol_down_days():
    d = _flat_daily(80, 100.0)
    cl = d.columns.get_loc("close"); op = d.columns.get_loc("open")
    hi = d.columns.get_loc("high"); lo = d.columns.get_loc("low")
    vo = d.columns.get_loc("volume")
    for k in (-2, -5, -8):                      # 3 of the last 10 bars
        d.iloc[k, op] = 100.0; d.iloc[k, hi] = 100.5
        d.iloc[k, lo] = 95.0;  d.iloc[k, cl] = 95.3   # close in lower 1/3 of range
        d.iloc[k, vo] = 2.0e6                          # > 1.5x the 1e6 average
    assert h3_distribution(d) is True


def test_h3_distribution_false_on_quiet_tape():
    assert h3_distribution(_flat_daily(80, 100.0)) is False


def test_health_is_alertonly_int_and_string():
    d = _flat_daily(80, 100.0)
    h, flags = health(d, wk=d.resample("W-FRI").last().dropna(), spy=d, sector=None)
    assert isinstance(h, int) and isinstance(flags, str)
    assert 0 <= h <= 100


def test_health_h5_flag_subtracts_its_weight():
    d = _flat_daily(80, 100.0)
    wk = d.resample("W-FRI").last().dropna()
    h0, f0 = health(d, wk=wk, spy=d, sector=None, h5_flag=False)
    h1, f1 = health(d, wk=wk, spy=d, sector=None, h5_flag=True)
    assert h0 == 100 and f0 == ""
    assert h1 == 100 - WEIGHTS["H5"] and f1 == "H5"
