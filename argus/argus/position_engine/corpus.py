"""Calibration corpus (design spec §3, Phase 3b-1). Reads the committed point-in-time
S&P 500 membership and builds/queries a SQLite cache of ADJUSTED daily OHLCV. Runtime
code never scrapes — membership comes from config/sp500_membership.json (built once by
tools/corpus/build_sp500_membership.py). Network fetching is injected for testability."""
import json
from datetime import datetime, timezone
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


def yf_adjusted(ticker: str, start: str):
    """Split/dividend-adjusted daily OHLCV from yfinance, lowercase columns, DatetimeIndex.
    Isolated (not inlined) so build orchestration is monkeypatchable in tests."""
    import yfinance as yf
    raw = yf.Ticker(ticker).history(start=start, interval="1d", auto_adjust=True)
    if raw is None or raw.empty:
        return None
    raw = raw.rename(columns=str.lower)
    raw.index = pd.to_datetime(raw.index).tz_localize(None)
    cols = [c for c in _PRICE_COLS if c in raw.columns]
    return raw[cols] if len(cols) == len(_PRICE_COLS) else None


def run_corpus(*, membership_path, out_dir, start="2014-01-01", end=None, fetch=None) -> dict:
    """Build the full corpus: active members over [start,end] + benchmarks -> corpus.db,
    and write corpus_manifest.json. `fetch` defaults to the live yf_adjusted."""
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    end = pd.Timestamp(end) if end is not None else pd.Timestamp.utcnow().normalize()
    membership = load_membership(membership_path)
    universe = sorted(members_active_between(membership, start, end))

    def _default_fetch(t, s):
        return yf_adjusted(t, s)
    fetch = fetch or _default_fetch

    conn = get_conn(out_dir / "corpus.db")
    ensure_price_schema(conn)
    built = build_corpus(universe, conn=conn, fetch=fetch, start=start)
    conn.close()

    manifest = {"built_at": datetime.now(timezone.utc).isoformat(),
                "start": start, "end": end.strftime("%Y-%m-%d"),
                "n_members": len(universe), **built}
    (out_dir / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def load_manifest(out_dir) -> dict:
    return json.loads((Path(out_dir) / "corpus_manifest.json").read_text())
