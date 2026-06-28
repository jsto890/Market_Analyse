import numpy as np
import pandas as pd
from argus.position_engine.labels import forward_mae, H_DEFAULT, K_DEFAULT


def _frame(closes, lows=None):
    n = len(closes)
    idx = pd.date_range("2022-01-03", periods=n, freq="B")
    c = np.array(closes, float)
    low = np.array(lows, float) if lows is not None else c - 1.0
    return pd.DataFrame({"open": c, "high": c + 1.0, "low": low, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_pre_registered_constants():
    assert H_DEFAULT == 20 and K_DEFAULT == 1.5


def test_mae_zero_when_only_rises():
    # rise per step (~1.7) exceeds the 1.0 low-band, so no forward low dips below entry close
    df = _frame(list(np.linspace(100, 200, 60)))
    out = forward_mae(df, horizon=20, k=1.5)
    # early bars have a full forward window and no drawdown -> mae ~ 0
    assert out["fwd_mae"].iloc[0] == 0.0
    assert out["adverse"].iloc[0] == False


def test_mae_measures_atr_drawdown_and_binary_threshold():
    # flat at 100 (ATR ~ 2 from the +/-1 high/low), then a forward low of 90 -> ~5 ATR drop
    closes = [100.0] * 40
    lows = [99.0] * 40
    lows[25] = 90.0                                  # a deep forward low after bar ~5..24
    df = _frame(closes, lows)
    out = forward_mae(df, horizon=20, k=1.5)
    i = out.index[10]
    assert out.loc[i, "fwd_mae"] > 1.5              # 10 ATR-ish drawdown ahead
    assert out.loc[i, "adverse"] == True


def test_tail_bars_have_no_label():
    df = _frame(list(np.linspace(100, 110, 30)))
    out = forward_mae(df, horizon=20, k=1.5)
    assert pd.isna(out["fwd_mae"].iloc[-1])         # no forward bar
    assert pd.isna(out["adverse"].iloc[-1])


def test_exit_cap_excludes_post_exit_drawdown():
    # flat at 100 (lows==close, no routine dip); a deep low at bar 20 is AFTER exit at bar 10.
    closes = [100.0] * 40
    lows = [100.0] * 40
    lows[20] = 80.0                                  # huge drawdown, but post-exit
    df = _frame(closes, lows)
    # bar 0 holds until exit at position 10 (inclusive); cap the forward window there.
    exit_pos = np.full(40, 10, dtype=int)
    capped = forward_mae(df, horizon=20, k=1.5, exit_pos=exit_pos)
    uncapped = forward_mae(df, horizon=20, k=1.5)
    i = df.index[0]
    assert capped.loc[i, "fwd_mae"] == 0.0          # never sees the post-exit low
    assert capped.loc[i, "adverse"] == False
    assert uncapped.loc[i, "fwd_mae"] > 1.5         # uncapped DOES see it (look-ahead)


def test_exit_cap_drops_label_on_exit_bar():
    closes = [100.0] * 40
    df = _frame(closes)
    exit_pos = np.full(40, 10, dtype=int)
    out = forward_mae(df, horizon=20, k=1.5, exit_pos=exit_pos)
    assert pd.isna(out["fwd_mae"].iloc[10])         # exit bar: no remaining held window
