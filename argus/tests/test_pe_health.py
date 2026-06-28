import numpy as np
import pandas as pd

from argus.position_engine.health import (
    WEIGHTS, h1_momentum_rollover, h2_trend_break, h3_distribution, h4_rs_decay,
    composite, health,
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


def _weekly_from(daily):
    return daily.resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()


def test_h1_false_on_steady_uptrend():
    # rising daily -> RSI>50 and ROC above its MA: no rollover
    idx = pd.date_range("2023-01-01", periods=400, freq="D")
    c = np.linspace(50, 150, 400)
    d = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                      "volume": np.full(400, 1e6)}, index=idx)
    assert h1_momentum_rollover(d, _weekly_from(d)) is False


def test_h1_fires_when_roc_rolls_over_under_weak_rsi():
    # long rise then a sustained 2-week fade: 12wk ROC dips below its 4wk MA while
    # daily RSI(14) prints < 50 on the last two days
    idx = pd.date_range("2022-06-01", periods=460, freq="D")
    up = np.linspace(50, 160, 430)
    fade = np.linspace(160, 138, 30)            # ~4-week rollover into weakness
    c = np.concatenate([up, fade])
    d = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                      "volume": np.full(len(c), 1e6)}, index=idx)
    assert h1_momentum_rollover(d, _weekly_from(d)) is True


def test_h4_false_when_outperforming():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    tkr = pd.DataFrame({"close": np.linspace(100, 160, 30)}, index=wks)   # strong
    spy = pd.DataFrame({"close": np.linspace(100, 110, 30)}, index=wks)   # weak bench
    assert h4_rs_decay(tkr, spy, None) is False


def test_h4_fires_on_three_weeks_of_negative_falling_excess():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    spy_c = np.linspace(100, 130, 30)                  # benchmark grinds up
    tkr_c = spy_c.copy()
    tkr_c[-3:] = [spy_c[-3] * 0.97, spy_c[-2] * 0.94, spy_c[-1] * 0.90]  # 3 weeks of decay
    tkr = pd.DataFrame({"close": tkr_c}, index=wks)
    spy = pd.DataFrame({"close": spy_c}, index=wks)
    assert h4_rs_decay(tkr, spy, None) is True


def test_h4_uses_sector_when_present():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    spy_c = np.linspace(100, 130, 30)
    tkr_c = spy_c.copy()
    tkr_c[-3:] = [spy_c[-3] * 0.97, spy_c[-2] * 0.94, spy_c[-1] * 0.90]
    tkr = pd.DataFrame({"close": tkr_c}, index=wks)
    spy = pd.DataFrame({"close": spy_c}, index=wks)
    sector = pd.DataFrame({"close": spy_c}, index=wks)
    assert h4_rs_decay(tkr, spy, sector) is True


def test_health_is_alertonly_int_and_string():
    d = _flat_daily(80, 100.0)
    h, flags = health(d, wk=_weekly_from(d), spy_wk=_weekly_from(d), sector_wk=None)
    assert isinstance(h, int) and isinstance(flags, str)
    assert 0 <= h <= 100


def test_health_h5_flag_subtracts_its_weight():
    d = _flat_daily(80, 100.0)
    wk = _weekly_from(d)
    h0, f0 = health(d, wk=wk, spy_wk=wk, sector_wk=None, h5_flag=False)
    h1, f1 = health(d, wk=wk, spy_wk=wk, sector_wk=None, h5_flag=True)
    assert h0 == 100 and f0 == ""
    assert h1 == 100 - WEIGHTS["H5"] and f1 == "H5"
