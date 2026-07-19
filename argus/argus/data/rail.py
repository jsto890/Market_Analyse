"""Batched basket quotes for the dashboard left rail (master plan §2.3, WS-2).

One yf.download for the whole basket; per-symbol last-valid close (ffill) to
dodge the ragged-last-row problem across futures/forex/crypto/index daily bars.
"""
from __future__ import annotations

from typing import Callable

import pandas as pd
import yfinance as yf

FUTURES = ["ES=F", "NQ=F", "YM=F", "RTY=F", "^VIX", "CL=F", "BTC-USD"]
INDICES = ["SPY", "QQQ", "IWM", "DIA"]
FOREX = ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "AUDUSD=X"]
RAIL_BASKET = FUTURES + INDICES + FOREX
_GROUP = {**{s: "futures" for s in FUTURES},
          **{s: "indices" for s in INDICES},
          **{s: "forex" for s in FOREX}}


def _default_fetch(symbols, **kwargs) -> pd.DataFrame:
    df = yf.download(" ".join(symbols), period="5d", progress=False, **kwargs)
    if df is None or df.empty:
        return pd.DataFrame()
    close = df["Close"] if "Close" in df.columns.get_level_values(0) else df
    return close


def rail_quotes(fetch: Callable = _default_fetch) -> dict:
    close = fetch(RAIL_BASKET)
    if close is None or close.empty or len(close) < 1:
        return {"quotes": [], "groups": {"futures": [], "indices": [], "forex": []},
                "error": "no data"}
    quotes, groups = [], {"futures": [], "indices": [], "forex": []}
    for sym in RAIL_BASKET:
        if sym not in close.columns:
            continue
        # Per-symbol real prints only: the basket index is the union of dates
        # across symbols (futures trade Sunday, equities don't), so padded rows
        # must not count as closes.
        series = close[sym].dropna()
        if series.empty:
            continue
        p = series.iloc[-1]
        last_close = float(series.iloc[-2]) if len(series) > 1 else float(p)
        prev_close = float(series.iloc[-3]) if len(series) > 2 else last_close
        chg_pct = float((p / last_close - 1) * 100) if last_close else 0.0
        q = {"symbol": sym, "price": round(float(p), 4),
             "change_pct": round(chg_pct, 2),
             "last_close": round(last_close, 4),
             "prev_close": round(prev_close, 4),
             "group": _GROUP[sym]}
        quotes.append(q)
        groups[_GROUP[sym]].append(sym)
    return {"quotes": quotes, "groups": groups, "error": None}
