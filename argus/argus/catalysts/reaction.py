"""Earnings price reaction (master plan WS-6.2): the % move attributable to a
past earnings release. Convention: if a later session exists, reaction =
prior-close → next-session-close (captures after-close reports and gaps); if the
earnings day is the last bar we have, fall back to that day's open→close."""
from __future__ import annotations

import pandas as pd


def earnings_reaction_pct(history: pd.DataFrame, earnings_date: str) -> float | None:
    if history is None or history.empty:
        return None
    idx = pd.to_datetime(history.index).normalize()
    target = pd.Timestamp(earnings_date).normalize()
    locs = (idx == target).nonzero()[0]
    if len(locs) == 0:
        return None
    i = int(locs[0])
    if i + 1 < len(history):
        prior = float(history["close"].iloc[i])
        after = float(history["close"].iloc[i + 1])
        return (after - prior) / prior * 100 if prior else None
    o = float(history["open"].iloc[i])
    c = float(history["close"].iloc[i])
    return (c - o) / o * 100 if o else None
