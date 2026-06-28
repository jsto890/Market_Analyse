"""Strength 0-100 (design spec §4): fixed equal-weight 5-component composite,
3 display tiers, and the arm/disarm entry gate with hysteresis."""
import numpy as np
import pandas as pd

from ..indicators.compute import _ema, _atr, _adx, _roc
from .params import EngineParams, DEFAULT

ARM, DISARM = 50, 40  # spec §4


def _clamp01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _logistic(x: float, x0: float = 0.0, k: float = 1.0) -> float:
    return 1.0 / (1.0 + np.exp(-k * (x - x0)))


def strength_components(daily: pd.DataFrame, spy: pd.DataFrame,
                        sector: pd.DataFrame | None = None) -> dict:
    """Each component in [0,100]. spy/sector are aligned daily closes for RS."""
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    adx, _, _ = _adx(h, l, c, 14)
    s1 = _clamp01((adx.iloc[-1] - 15) / 25) * 100

    roc12 = _roc(c, 60)                       # ~12 weeks of trading days
    rank = (roc12.rank(pct=True).iloc[-1]) if roc12.notna().sum() > 5 else 0.5
    s2 = float(rank) * 100

    def _ret(df, n=65):
        return float(df["close"].iloc[-1] / df["close"].iloc[-n] - 1) if len(df) > n else 0.0
    excess = _ret(daily) - _ret(spy)
    if sector is not None:
        excess = (excess + (_ret(daily) - _ret(sector))) / 2
    s3 = _logistic(excess, 0.0, 20.0) * 100

    atr = _atr(h, l, c, 14).iloc[-1]
    dist = (c.iloc[-1] - _ema(c, 50).iloc[-1]) / atr if atr else 0.0
    # inverted-U: peak at +1.25 ATR, penalise <0 and >4
    s4 = _clamp01(1 - abs(dist - 1.25) / 2.75) * 100

    up = v.where(c.diff() > 0, 0.0).rolling(20).sum().iloc[-1]
    dn = v.where(c.diff() < 0, 0.0).rolling(20).sum().iloc[-1]
    ratio = up / dn if dn else 2.0
    s5 = _logistic(ratio, 1.0, 2.0) * 100

    return {"S1": s1, "S2": s2, "S3": s3, "S4": s4, "S5": s5}


def score_strength(comp: dict) -> tuple[int, str]:
    s = int(round(sum(comp[k] for k in ("S1", "S2", "S3", "S4", "S5")) / 5))
    s = max(0, min(100, s))
    return s, tier_of(s)


def tier_of(s: int) -> str:
    return "weak" if s < 40 else ("building" if s < 70 else "strong")


def arm_eligible(prev_armed: bool, strength: int, params: EngineParams = DEFAULT) -> bool:
    """Hysteresis: arm at >=params.arm, disarm only below params.disarm."""
    if prev_armed:
        return strength >= params.disarm
    return strength >= params.arm
