"""Next-earnings dates for tracked tickers via yfinance Ticker.calendar.
Failure-tolerant: a ticker that errors or has no date is skipped, never fatal.
The calendar fetcher is injected so tests don't hit the network."""
from typing import Callable, Optional

import pandas as pd

from ..options_intel.universe import INDEX_UNDERLYINGS, snapshot_universe


def _default_calendar(sym):
    import yfinance as yf
    return yf.Ticker(sym).calendar


def next_earnings_date(cal) -> Optional[str]:
    """Extract the next earnings date (ISO) from a yfinance .calendar mapping."""
    if not cal:
        return None
    ed = cal.get("Earnings Date") if hasattr(cal, "get") else None
    if not ed:
        return None
    d = ed[0] if isinstance(ed, (list, tuple)) and ed else ed
    try:
        return pd.Timestamp(d).date().isoformat()
    except Exception:
        return None


def earnings_event(sym: str, cal) -> Optional[dict]:
    d = next_earnings_date(cal)
    if not d:
        return None
    return {"date": d, "time_et": None, "event": f"{sym} earnings",
            "category": "earnings", "importance": "medium", "source": "earnings",
            "ticker": sym, "dedup_key": f"earnings:{sym}:{d}"}


def fetch_earnings(tickers: list[str],
                   fetch_cal: Callable = _default_calendar) -> list[dict]:
    out = []
    for sym in tickers:
        try:
            ev = earnings_event(sym, fetch_cal(sym))
        except Exception:
            ev = None
        if ev:
            out.append(ev)
    return out


def tracked_tickers(db_path=None) -> list[str]:
    """Tracked universe minus index ETFs (which have no earnings)."""
    idx = set(INDEX_UNDERLYINGS)
    return [s for s in snapshot_universe(db_path) if s not in idx]
