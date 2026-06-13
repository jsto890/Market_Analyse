"""Free market data via yfinance.

This is the data backbone for free use. Indicator computation runs on these
DataFrames. yfinance is rate-limited and best-effort — if you have a paid
data feed, swap it in here; the rest of the system only depends on the
returned DataFrame schema.
"""
from __future__ import annotations

import time
from datetime import datetime
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf


_OHLCV_COLS = ["open", "high", "low", "close", "volume"]


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns=str.lower)
    # yfinance sometimes returns "adj close" — drop it; we use raw close.
    df = df[[c for c in _OHLCV_COLS if c in df.columns]].dropna()
    df.index = pd.to_datetime(df.index)
    df.index.name = "ts"
    return df


def _cache_bucket(interval: str) -> int:
    """Returns a time bucket int that changes every N seconds, used as a cache key."""
    now = datetime.now(ZoneInfo("America/New_York"))
    is_market_hours = (
        now.weekday() < 5
        and (now.hour, now.minute) >= (9, 30)
        and (now.hour, now.minute) < (16, 0)
    )
    ttl = 300 if is_market_hours else 3600
    return int(time.time() / ttl)


@lru_cache(maxsize=512)
def _fetch_cached(symbol: str, period: str, interval: str, bucket: int) -> pd.DataFrame:
    raw = yf.download(
        symbol,
        period=period,
        interval=interval,
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if raw is None or raw.empty:
        return pd.DataFrame(columns=_OHLCV_COLS)
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    return _normalise(raw)


def get_history(
    symbol: str,
    period: str = "2y",
    interval: str = "1d",
) -> pd.DataFrame:
    """Return OHLCV history for `symbol`. Columns: open, high, low, close, volume."""
    bucket = _cache_bucket(interval)
    df = _fetch_cached(symbol.upper(), period, interval, bucket).copy()
    df.attrs["ticker"] = symbol.upper()
    return df


def get_realtime_history(symbol: str) -> pd.DataFrame:
    """Return 1y daily history with today's bar replaced/appended from intraday data."""
    sym = symbol.upper()
    df = get_history(sym, period="1y", interval="1d")

    today = datetime.now(ZoneInfo("America/New_York")).date()
    if not df.empty and pd.Timestamp(df.index[-1]).date() == today:
        return df

    bucket = _cache_bucket("5m")
    intraday = _fetch_cached(sym, "1d", "5m", bucket)
    if intraday.empty:
        return df

    last_bar = intraday.iloc[-1]
    today_ts = pd.Timestamp(today)

    # Remove stale today row if present then append fresh one
    if not df.empty and pd.Timestamp(df.index[-1]).date() == today:
        df = df.iloc[:-1]

    today_row = pd.DataFrame(
        [[last_bar["open"], last_bar["high"], last_bar["low"],
          last_bar["close"], last_bar["volume"]]],
        columns=_OHLCV_COLS,
        index=pd.DatetimeIndex([today_ts], name="ts"),
    )
    return pd.concat([df, today_row])


def get_quote(symbol: str) -> Optional[dict]:
    df = get_history(symbol, period="5d", interval="1d")
    if df.empty:
        return None
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    return {
        "symbol": symbol.upper(),
        "price": float(last["close"]),
        "change": float(last["close"] - prev["close"]),
        "change_pct": float((last["close"] / prev["close"] - 1) * 100),
        "volume": int(last["volume"]),
        "ts": str(last.name),
    }


def get_extended_quote(symbol: str) -> Optional[dict]:
    """Last traded price including pre/post sessions (1m prepost bars)."""
    sym = symbol.upper()
    try:
        df = yf.Ticker(sym).history(period="1d", interval="1m", prepost=True)
    except Exception:
        return None
    if df is None or df.empty:
        return None
    df.columns = [str(c).lower() for c in df.columns]
    last = df.iloc[-1]
    return {"symbol": sym, "price": float(last["close"]), "ts": str(df.index[-1])}


def get_options_chain(symbol: str, expiration: Optional[str] = None) -> dict:
    """Best-effort options chain via yfinance. Used for Flow Intelligence stub.

    Note: this gives static end-of-day chains, NOT real-time options flow.
    Real options-flow products license vendor feeds (Cboe, etc.). The
    free-data version computes call/put OI ratios as a flow proxy.
    """
    tk = yf.Ticker(symbol.upper())
    try:
        expiries = tk.options
    except Exception:
        return {"symbol": symbol.upper(), "error": "no chain"}
    if not expiries:
        return {"symbol": symbol.upper(), "error": "no chain"}
    exp = expiration or expiries[0]
    chain = tk.option_chain(exp)
    calls, puts = chain.calls, chain.puts
    return {
        "symbol": symbol.upper(),
        "expiration": exp,
        "expirations": list(expiries),
        "calls": calls.to_dict("records"),
        "puts": puts.to_dict("records"),
        "summary": {
            "call_oi": int(calls["openInterest"].fillna(0).sum()),
            "put_oi": int(puts["openInterest"].fillna(0).sum()),
            "call_vol": int(calls["volume"].fillna(0).sum()),
            "put_vol": int(puts["volume"].fillna(0).sum()),
            "pcr_oi": float(
                puts["openInterest"].fillna(0).sum()
                / max(calls["openInterest"].fillna(0).sum(), 1)
            ),
            "pcr_vol": float(
                puts["volume"].fillna(0).sum()
                / max(calls["volume"].fillna(0).sum(), 1)
            ),
        },
    }
