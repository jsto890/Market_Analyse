"""Bias direction (design spec §3): weekly-weighted technical vote → bias_score
in [-9, +9], then step_bias() applies Schmitt hysteresis + confirmation + dwell.
Indicators reuse argus.indicators.compute. Starting thresholds are spec constants."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..indicators.compute import _sma, _ema, _adx
from .params import EngineParams, DEFAULT

ENTER, LEAVE, CONFIRM, DWELL = 4, 1, 2, 10  # spec §3 starting values


def _slope(s: pd.Series, n: int) -> float:
    s = s.dropna()
    if len(s) < n:
        return 0.0
    y = s.iloc[-n:].to_numpy()
    return float(np.polyfit(np.arange(n), y, 1)[0])


def _weekly_votes(weekly: pd.DataFrame) -> int:
    c = weekly["close"]
    sma30 = _sma(c, 30)
    v1 = 1 if c.iloc[-1] > sma30.iloc[-1] else -1
    sl = _slope(sma30, 10)
    band = 0.003 * float(c.iloc[-1])
    v2 = 1 if sl > band else (-1 if sl < -band else 0)
    h, l = weekly["high"], weekly["low"]
    hh = h.iloc[-1] > h.iloc[-10:-1].max() and l.iloc[-1] > l.iloc[-10:-1].min()
    ll = h.iloc[-1] < h.iloc[-10:-1].max() and l.iloc[-1] < l.iloc[-10:-1].min()
    v3 = 1 if hh else (-1 if ll else 0)
    return v1 + v2 + v3


def _daily_votes(daily: pd.DataFrame) -> int:
    c = daily["close"]
    ema50, sma200 = _ema(c, 50), _sma(c, 200)
    d1 = 1 if c.iloc[-1] > ema50.iloc[-1] else -1
    d2 = 1 if ema50.iloc[-1] > sma200.iloc[-1] else -1
    adx, pdi, ndi = _adx(daily["high"], daily["low"], c, 14)
    if adx.iloc[-1] >= 20:
        d3 = 1 if pdi.iloc[-1] > ndi.iloc[-1] else -1
    else:
        d3 = 0
    return d1 + d2 + d3


def bias_score(daily: pd.DataFrame, weekly: pd.DataFrame | None = None) -> int:
    """Score in [-9, +9]; weekly double-weighted. If weekly is None it is
    resampled from daily (W-FRI)."""
    if weekly is None or weekly is daily:
        weekly = daily.resample("W-FRI").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    return int(2 * _weekly_votes(weekly) + _daily_votes(daily))


@dataclass(frozen=True)
class BiasState:
    bias: str = "NEUTRAL"      # LONG | NEUTRAL | SHORT
    bars_in_state: int = 0
    pending: str | None = None  # candidate direction awaiting confirmation
    confirm_count: int = 0


def step_bias(prev: BiasState, score: int, params: EngineParams = DEFAULT) -> BiasState:
    """Schmitt hysteresis (enter ±bias_enter, leave at ±bias_leave) + confirm_bars
    consecutive bars + min_dwell minimum hold. NEUTRAL is the buffer between thresholds."""
    locked = prev.bars_in_state < params.min_dwell
    if prev.bias == "LONG":
        want = "LONG" if score > params.bias_leave else "NEUTRAL"
    elif prev.bias == "SHORT":
        want = "SHORT" if score < -params.bias_leave else "NEUTRAL"
    else:
        want = "LONG" if score >= params.bias_enter else ("SHORT" if score <= -params.bias_enter else "NEUTRAL")
    if want == prev.bias or locked:
        return BiasState(prev.bias, prev.bars_in_state + 1, None, 0)
    cc = prev.confirm_count + 1 if prev.pending == want else 1
    if cc >= params.confirm_bars:
        return BiasState(want, 0, None, 0)
    return BiasState(prev.bias, prev.bars_in_state + 1, want, cc)
