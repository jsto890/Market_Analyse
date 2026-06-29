import numpy as np
import pandas as pd
from argus.position_engine.exits import (
    giveback_trail, chandelier_high, donchian_break, no_progress,
    profit_target_3r, health_exit, realized_r, RULES, CONTROL,
)


def _path(highs, lows, closes, opens=None, atr=1.0, donch=None, flags=None):
    n = len(closes)
    return pd.DataFrame({
        "open": opens if opens is not None else closes,
        "high": highs, "low": lows, "close": closes,
        "volume": np.full(n, 1e6),
        "atr14": np.full(n, atr) if np.isscalar(atr) else atr,
        "donch_low20": [np.nan] * n if donch is None else donch,
        "health_flags": [""] * n if flags is None else flags,
    }, index=pd.date_range("2022-01-03", periods=n, freq="B"))


def test_giveback_trail_fires_after_activation_then_giveback():
    # entry 100, r=10; peak hits +2R (high 120) then close falls to +1.0R (110) = 50% of peak < 60% -> exit
    highs = [101, 110, 120, 118, 110]
    out = giveback_trail(_path(highs, [99]*5, [100, 109, 119, 117, 110]), 100.0, 10.0)
    assert out == 4                       # peakR=2.0 at t2; closeR=1.0 <= 0.6*2.0 at t4


def test_giveback_trail_silent_before_activation():
    # never reaches +1.5R -> no exit
    out = giveback_trail(_path([101, 104, 103], [99]*3, [100, 103, 101]), 100.0, 10.0)
    assert out is None


def test_chandelier_high_fires_on_close_below_peak_minus_3atr():
    # HH=120 at t1; line=120-3*2=114; close 113 at t2 < 114 -> exit t2
    out = chandelier_high(_path([110, 120, 116], [99]*3, [109, 119, 113], atr=2.0), 100.0, 10.0)
    assert out == 2


def test_donchian_break_fires_on_close_below_prior_20_low():
    out = donchian_break(_path([110]*3, [100]*3, [109, 108, 95], donch=[np.nan, 100.0, 100.0]), 100.0, 10.0)
    assert out == 2                       # close 95 < donch 100 at t2


def test_no_progress_fires_after_8_bars_without_new_high():
    highs = [110] + [109] * 9            # new high only at t0
    out = no_progress(_path(highs, [100]*10, [105]*10), 100.0, 10.0)
    assert out == 8                       # t - last_new_high(0) >= 8 at t=8


def test_profit_target_3r_fires_on_3R_close():
    out = profit_target_3r(_path([131]*3, [99]*3, [120, 129, 131]), 100.0, 10.0)
    assert out == 2                       # close 131 >= 100 + 3*10


def test_health_exit_fires_on_first_flag():
    out = health_exit(_path([110]*4, [100]*4, [105]*4, flags=["", "", "H2", ""]), 100.0, 10.0)
    assert out == 2


def test_realized_r_fills_at_next_open_and_baseline_on_none():
    p = _path([110]*4, [100]*4, [105]*4, opens=[100, 102, 104, 106])
    assert realized_r(p, 100.0, 10.0, 1, baseline_r=0.5) == (104.0 - 100.0) / 10.0   # T+1 open
    assert realized_r(p, 100.0, 10.0, None, baseline_r=0.5) == 0.5                     # never fired
    assert realized_r(p, 100.0, 10.0, 3, baseline_r=0.5) == 0.5                        # last bar -> baseline


def test_rule_dicts_split_candidates_and_control():
    assert set(RULES) == {"giveback_trail", "chandelier_high", "donchian_break",
                          "no_progress", "profit_target_3r"}
    assert set(CONTROL) == {"health_exit"}
