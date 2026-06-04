"""Simplified Wyckoff phase classifier.

Returns one of: ACCUMULATION, MARKUP, DISTRIBUTION, MARKDOWN, UNCLEAR.
Heuristic: combines 50d range compression, 200d trend slope, and volume
behaviour. Real Wyckoff requires discretionary chart reading; this is a
deterministic stand-in suitable as one vote among many.
"""
from __future__ import annotations
import pandas as pd
import numpy as np


def classify(df: pd.DataFrame) -> str:
    if len(df) < 220:
        return "UNCLEAR"
    c = df["close"]
    v = df["volume"]
    sma200 = c.rolling(200).mean()
    slope = (sma200.iloc[-1] - sma200.iloc[-50]) / sma200.iloc[-50]

    rng_50 = (df["high"].iloc[-50:].max() - df["low"].iloc[-50:].min()) / c.iloc[-1]
    rng_200 = (df["high"].iloc[-200:].max() - df["low"].iloc[-200:].min()) / c.iloc[-1]

    vol_recent = v.iloc[-20:].mean()
    vol_old = v.iloc[-200:-20].mean()
    vol_ratio = vol_recent / max(vol_old, 1)

    compressed = rng_50 < 0.6 * rng_200
    rising_vol = vol_ratio > 1.1

    if slope > 0.05 and not compressed:
        return "MARKUP"
    if slope < -0.05 and not compressed:
        return "MARKDOWN"
    if slope >= -0.05 and slope <= 0.05 and compressed:
        # Range. Distinguish accumulation vs distribution by where price is
        # relative to the previous trend.
        prior_slope = (sma200.iloc[-50] - sma200.iloc[-200]) / sma200.iloc[-200]
        if prior_slope < 0 and rising_vol:
            return "ACCUMULATION"
        if prior_slope > 0 and rising_vol:
            return "DISTRIBUTION"
    return "UNCLEAR"
