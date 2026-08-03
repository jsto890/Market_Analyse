"""Next-earnings dates for tracked tickers via yfinance Ticker.calendar.
Failure-tolerant: a ticker that errors or has no date is skipped, never fatal.
The calendar fetcher is injected so tests don't hit the network."""
from datetime import date
from typing import Callable, Optional

import pandas as pd

from ..options_intel.universe import INDEX_UNDERLYINGS, snapshot_universe


ET = "America/New_York"


def _default_calendar(sym):
    import yfinance as yf
    return yf.Ticker(sym).calendar


def _default_earnings_times(sym):
    """yfinance's earnings-dates frame. Separate from `.calendar` because only
    this one carries a clock: `.calendar` returns bare dates."""
    import yfinance as yf
    return yf.Ticker(sym).get_earnings_dates(limit=12)


def next_earnings_slot(frame, today: Optional[str] = None) -> Optional[tuple]:
    """(date, time_et) for the earliest earnings timestamp on or after `today`.

    The frame's index is tz-aware and the clock in it *is* the BMO/AMC signal —
    08:00 reports before the bell, 16:00 after — which is the whole reason to
    read this source rather than `.calendar`. Rows are newest-first, so we scan
    for the minimum rather than taking the head. Midnight reads as date-only,
    not as an event at 00:00.
    """
    if frame is None:
        return None
    try:
        index = list(frame.index)
    except Exception:
        return None
    t = pd.Timestamp(today or date.today()).normalize()
    best = None
    for raw in index:
        try:
            d = pd.Timestamp(raw)
        except Exception:
            continue
        if d.tzinfo is not None:
            d = d.tz_convert(ET).tz_localize(None)
        if d.normalize() < t:
            continue
        if best is None or d < best:
            best = d
    if best is None:
        return None
    time_et = None if (best.hour == 0 and best.minute == 0) else f"{best.hour:02d}:{best.minute:02d}"
    return best.date().isoformat(), time_et


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


def earnings_event(sym: str, cal, today: Optional[str] = None,
                   times=None) -> Optional[dict]:
    """`times` is the earnings-dates frame; when it resolves a slot it wins over
    `cal`, because it is the only source that knows whether the name reports
    before or after the bell. Without it the event keeps its date-only shape."""
    slot = next_earnings_slot(times, today) if times is not None else None
    if slot:
        d, time_et = slot
    else:
        d, time_et = next_earnings_date(cal, today), None
    if not d:
        return None
    return {"date": d, "time_et": time_et, "event": f"{sym} earnings",
            "category": "earnings", "importance": "medium", "source": "earnings",
            "ticker": sym, "dedup_key": f"earnings:{sym}:{d}"}


def fetch_earnings(tickers: list[str],
                   fetch_cal: Callable = _default_calendar,
                   fetch_times: Callable = _default_earnings_times) -> list[dict]:
    out = []
    for sym in tickers:
        # The timed source is the newer of the two and needs lxml; losing it
        # must degrade to a date-only event, not drop the name off the calendar.
        try:
            times = fetch_times(sym)
        except Exception:
            times = None
        try:
            ev = earnings_event(sym, fetch_cal(sym), times=times)
        except Exception:
            ev = None
        if ev:
            out.append(ev)
    return out


def tracked_tickers(db_path=None) -> list[str]:
    """Tracked universe minus index ETFs (which have no earnings)."""
    idx = set(INDEX_UNDERLYINGS)
    return [s for s in snapshot_universe(db_path) if s not in idx]
