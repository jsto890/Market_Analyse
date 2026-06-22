import numpy as np
import pandas as pd
from argus.position_engine.levels import (entry_trigger, compute_levels,
                                          gap_skip, trail_stop, RR_FLOOR)


def _df(rows):
    idx = pd.date_range("2024-01-01", periods=len(rows), freq="D")
    return pd.DataFrame(rows, index=idx, columns=["open", "high", "low", "close", "volume"])


def test_entry_trigger_fires_on_pullback_resume():
    # uptrend, a pullback toward EMA, then a resumption bar closing above prior high on volume
    base = [[100, 101, 99, 100, 1e6]] * 60
    # drift up to build EMA below price
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(60)]
    pull = [[127, 127, 125.5, 126, 1e6]]           # deeper dip, low reaches ~20EMA
    resume = [[126, 130, 125, 128.5, 1.5e6]]        # close > prior high, vol up
    df = _df(up + pull + resume)
    assert entry_trigger(df) is True


def test_no_trigger_without_volume():
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(60)]
    pull = [[127, 127, 125.5, 126, 1e6]]           # same deeper dip (near=True)
    weak = [[126, 130, 125, 128.5, 0.5e6]]          # resume but low volume
    df = _df(up + pull + weak)
    assert entry_trigger(df) is False


def test_compute_levels_rr_and_stop():
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(80)]
    df = _df(up)
    lv = compute_levels(entry_px=df["close"].iloc[-1], daily=df)
    assert lv["stop"] < lv["entry"] < lv["target"]
    assert lv["rr"] >= RR_FLOOR or lv["armed"] is False


def test_gap_skip():
    assert gap_skip(entry_signal_close=100, next_open=101.0, atr=1.0) is True   # >0.75 ATR gap
    assert gap_skip(entry_signal_close=100, next_open=100.3, atr=1.0) is False


def test_trail_only_ratchets_up():
    # at +1R move to breakeven; beyond, chandelier; never down
    assert trail_stop(prior_stop=95, close=110, atr=2.0, progress_r=1.5, entry=100) >= 100
    assert trail_stop(prior_stop=104, close=108, atr=2.0, progress_r=2.0, entry=100) >= 104
