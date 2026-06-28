"""Structural ATR-scaled levels (design spec §5). Independent of bias/strength.
All fills resolve at T+1 open in the runner; this module only computes levels and
the entry-trigger condition on completed bars."""
import pandas as pd

from ..indicators.compute import _ema, _atr
from .params import EngineParams, DEFAULT

BUY_ZONE_ATR = 0.5      # pullback proximity to EMA
RESUME_VOL = 1.2        # resumption volume vs 20d avg
STOP_ATR = 1.5
TRAIL_ATR = 2.5
GAP_ATR = 0.75
RR_FLOOR = 1.8
SWING_LB = 10
STRUCT_LB = 60          # prior-structure window for the forward (overhead) target


def entry_trigger(daily: pd.DataFrame, params: EngineParams = DEFAULT) -> bool:
    """True if the last completed bar is a pullback-to-EMA + resumption + volume."""
    if len(daily) < 60:
        return False
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    atr = _atr(h, l, c, 14).iloc[-1]
    ema20, ema50 = _ema(c, 20).iloc[-1], _ema(c, 50).iloc[-1]
    prev = daily.iloc[-2]
    bar = daily.iloc[-1]
    near = min(abs(prev["low"] - ema20), abs(prev["low"] - ema50)) <= params.buy_zone_atr * atr
    resume = bar["close"] > prev["high"]
    vol_ok = bar["volume"] >= RESUME_VOL * v.iloc[-21:-1].mean()
    return bool(near and resume and vol_ok)


def compute_levels(entry_px: float, daily: pd.DataFrame, params: EngineParams = DEFAULT) -> dict:
    c, h, l = daily["close"], daily["high"], daily["low"]
    atr = float(_atr(h, l, c, 14).iloc[-1])
    swing_low = float(l.iloc[-SWING_LB:].min())
    stop = min(swing_low, entry_px - params.stop_atr * atr)
    r = entry_px - stop
    # Forward structural target: the highest PRIOR high ABOVE entry, from a window that
    # EXCLUDES the most recent SWING_LB breakout/pullback bars — so the target is not
    # pinned to the high we are breaking THROUGH (that pinning collapsed rr→0 and vetoed
    # ~every entry). Floor at a clean 2R; extend up to genuine overhead resistance when it
    # sits beyond 2R (let winners run to structure).
    prior = h.iloc[-(STRUCT_LB + SWING_LB):-SWING_LB]
    overhead = prior[prior > entry_px]
    fwd_struct = float(overhead.max()) if len(overhead) else entry_px
    target = max(entry_px + 2.0 * r, fwd_struct)
    rr = (target - entry_px) / r if r > 0 else 0.0
    return {"entry": entry_px, "stop": stop, "target": target, "rr": rr,
            "armed": bool(r > 0 and rr >= RR_FLOOR), "atr": atr}


def gap_skip(entry_signal_close: float, next_open: float, atr: float) -> bool:
    return next_open > entry_signal_close + GAP_ATR * atr


def trail_stop(prior_stop: float, close: float, atr: float, progress_r: float,
               entry: float, params: EngineParams = DEFAULT) -> float:
    """Sticky, ratchet-up only. >=+1R: breakeven; beyond: chandelier max."""
    candidate = prior_stop
    if progress_r >= 1.0:
        candidate = max(candidate, entry)
    if progress_r > 1.0:
        candidate = max(candidate, close - params.trail_atr * atr)
    return max(prior_stop, candidate)
