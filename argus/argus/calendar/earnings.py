"""Next-earnings dates for tracked tickers via yfinance Ticker.calendar.
Failure-tolerant: a ticker that errors or has no date is skipped, never fatal.
The calendar fetcher is injected so tests don't hit the network."""
from datetime import date
from typing import Callable, Optional

import pandas as pd

from ..options_intel.universe import INDEX_UNDERLYINGS, snapshot_universe


def _default_calendar(sym):
    import yfinance as yf
    return yf.Ticker(sym).calendar


def next_earnings_date(cal, today: Optional[str] = None) -> Optional[str]:
    """Next earnings date (ISO) from a yfinance .calendar mapping: the first
    candidate on or after `today`. The calendar lists the window around today,
    so ed[0] is as often the report already out as the one coming."""
    if not cal:
        return None
    ed = cal.get("Earnings Date") if hasattr(cal, "get") else None
    if ed is None or (hasattr(ed, "__len__") and len(ed) == 0):
        return None
    candidates = list(ed) if isinstance(ed, (list, tuple)) else [ed]
    t = pd.Timestamp(today or date.today()).normalize()
    for c in candidates:
        try:
            d = pd.Timestamp(c)
            if d.tzinfo is not None:
                d = d.tz_localize(None)
            d = d.normalize()
        except Exception:
            continue
        if d >= t:
            return d.date().isoformat()
    return None


def earnings_event(sym: str, cal, today: Optional[str] = None) -> Optional[dict]:
    d = next_earnings_date(cal, today)
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
