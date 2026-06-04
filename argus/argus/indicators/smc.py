"""Simplified Smart Money Concepts (SMC) detection.

This is NOT institutional-grade. Real SMC is partly subjective. Here we
implement two of the highest-signal pieces — Break of Structure (BOS) and
Order Blocks — as deterministic rules.
"""
from __future__ import annotations
import pandas as pd
import numpy as np


def break_of_structure(df: pd.DataFrame, lookback: int = 20) -> int:
    """+1 = bullish BOS, -1 = bearish BOS, 0 = none on last bar."""
    if len(df) < lookback + 2:
        return 0
    last_close = df["close"].iloc[-1]
    prev_high = df["high"].iloc[-(lookback + 1):-1].max()
    prev_low = df["low"].iloc[-(lookback + 1):-1].min()
    if last_close > prev_high:
        return 1
    if last_close < prev_low:
        return -1
    return 0


def order_block(df: pd.DataFrame, lookback: int = 30) -> dict:
    """Return last bullish/bearish order block prices (last opposite candle
    before a strong impulse). Best-effort heuristic."""
    if len(df) < lookback + 5:
        return {"bullish": None, "bearish": None}
    window = df.iloc[-lookback:]
    body = (window["close"] - window["open"]).abs()
    impulse_threshold = body.quantile(0.85)

    bullish = bearish = None
    for i in range(2, len(window) - 1):
        bar = window.iloc[i]
        nxt = window.iloc[i + 1]
        if (nxt["close"] - nxt["open"]) > impulse_threshold and bar["close"] < bar["open"]:
            bullish = float((bar["open"] + bar["close"]) / 2)
        if (nxt["open"] - nxt["close"]) > impulse_threshold and bar["close"] > bar["open"]:
            bearish = float((bar["open"] + bar["close"]) / 2)
    return {"bullish": bullish, "bearish": bearish}
