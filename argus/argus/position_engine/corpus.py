"""Calibration corpus (design spec §3, Phase 3b-1). Reads the committed point-in-time
S&P 500 membership and builds/queries a SQLite cache of ADJUSTED daily OHLCV. Runtime
code never scrapes — membership comes from config/sp500_membership.json (built once by
tools/corpus/build_sp500_membership.py). Network fetching is injected for testability."""
import json
from pathlib import Path

import pandas as pd

from ..db import get_conn


def load_membership(path) -> dict:
    """Parse the committed membership JSON into typed intervals.
    Returns {"benchmarks": [...], "members": {ticker: [(start_ts, end_ts_or_None), ...]}}."""
    raw = json.loads(Path(path).read_text())
    members = {}
    for tkr, ivals in raw.get("members", {}).items():
        members[tkr] = [(pd.Timestamp(s), pd.Timestamp(e) if e else None) for s, e in ivals]
    return {"benchmarks": list(raw.get("_benchmarks", [])), "members": members}


def members_active_between(membership: dict, start, end) -> set:
    """Every member whose in-index interval overlaps [start, end], plus all benchmarks."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    out = set(membership["benchmarks"])
    for tkr, ivals in membership["members"].items():
        for s, e in ivals:
            e_eff = e if e is not None else end
            if s <= end and e_eff >= start:          # interval overlaps the window
                out.add(tkr)
                break
    return out


_PRICE_COLS = ["open", "high", "low", "close", "volume"]


def ensure_price_schema(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prices ("
        "ticker TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL, low REAL, "
        "close REAL, volume REAL, PRIMARY KEY (ticker, date))")
    conn.commit()


def build_corpus(tickers, *, conn, fetch, start="2014-01-01") -> dict:
    """Fetch each ticker via fetch(ticker, start)->DataFrame|None and upsert into prices.
    A None/empty frame or a raising fetch records a skip (never crashes the build)."""
    fetched, skipped = [], []
    for tkr in tickers:
        try:
            df = fetch(tkr, start)
        except Exception as exc:                      # degrade, never abort the corpus
            skipped.append({"ticker": tkr, "reason": repr(exc)})
            continue
        if df is None or len(df) == 0:
            skipped.append({"ticker": tkr, "reason": "no data"})
            continue
        rows = [(tkr, ts.strftime("%Y-%m-%d"), float(r["open"]), float(r["high"]),
                 float(r["low"]), float(r["close"]), float(r["volume"]))
                for ts, r in df.iterrows()]
        conn.executemany(
            "INSERT OR REPLACE INTO prices (ticker,date,open,high,low,close,volume) "
            "VALUES (?,?,?,?,?,?,?)", rows)
        conn.commit()
        fetched.append({"ticker": tkr, "n_bars": len(rows),
                        "first": rows[0][1], "last": rows[-1][1]})
    return {"fetched": fetched, "skipped": skipped}


def load_prices(conn, ticker, start=None, end=None) -> pd.DataFrame:
    """Adjusted OHLCV for one ticker as an ascending DatetimeIndex frame named 'ts'."""
    q = "SELECT date, open, high, low, close, volume FROM prices WHERE ticker=?"
    params = [ticker]
    if start is not None:
        q += " AND date>=?"; params.append(pd.Timestamp(start).strftime("%Y-%m-%d"))
    if end is not None:
        q += " AND date<=?"; params.append(pd.Timestamp(end).strftime("%Y-%m-%d"))
    q += " ORDER BY date"
    rows = conn.execute(q, params).fetchall()
    df = pd.DataFrame(rows, columns=["date"] + _PRICE_COLS)
    df.index = pd.to_datetime(df["date"]); df.index.name = "ts"
    return df[_PRICE_COLS]
