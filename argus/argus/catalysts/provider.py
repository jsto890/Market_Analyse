"""Any-ticker catalysts (master plan WS-6.3). Composes yfinance surfaces that
work WITHOUT lxml (calendar, upgrades_downgrades) plus, when lxml is present,
earnings_dates for past surprises. Fetchers are injected for testability; the
module-level defaults wire the real yfinance + get_history calls.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Optional

import pandas as pd

from ..data import get_history
from .reaction import earnings_reaction_pct

ANALYST_WINDOW_DAYS = 90
ANALYST_MAX = 3


def _default_calendar(sym): import yfinance as yf; return yf.Ticker(sym).calendar
def _default_upgrades(sym): import yfinance as yf; return yf.Ticker(sym).upgrades_downgrades
def _default_past(sym): import yfinance as yf; return yf.Ticker(sym).earnings_dates
def _default_history(sym, **k): return get_history(sym, period="1y")


def _next_earnings(cal) -> Optional[str]:
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


def _last_earnings(past_df, hist, today: str) -> Optional[dict]:
    if past_df is None or len(past_df) == 0:
        return None
    t = pd.Timestamp(today).normalize()
    idx = pd.to_datetime(past_df.index).normalize()
    past = sorted([d for d in idx if d <= t], reverse=True)
    if not past:
        return None
    d = past[0]
    surprise = None
    for col in ("Surprise(%)", "Surprise %", "surprise"):
        if col in past_df.columns:
            v = past_df.loc[past_df.index.normalize() == d, col]
            if len(v) and pd.notna(v.iloc[0]):
                surprise = round(float(v.iloc[0]), 1)
            break
    reaction = earnings_reaction_pct(hist, d.date().isoformat()) if hist is not None else None
    return {"date": d.date().isoformat(),
            "surprise_pct": surprise,
            "reaction_pct": round(reaction, 1) if reaction is not None else None}


def _analyst(up_df, today: str) -> list[dict]:
    if up_df is None or len(up_df) == 0:
        return []
    t = pd.Timestamp(today).normalize()
    out = []
    for ts, row in up_df.iterrows():
        d = pd.Timestamp(ts).normalize()
        if (t - d).days > ANALYST_WINDOW_DAYS or d > t:
            continue
        out.append({"date": d.date().isoformat(), "firm": str(row.get("Firm", "")),
                    "to": str(row.get("ToGrade", "")), "from": str(row.get("FromGrade", "")),
                    "action": str(row.get("Action", ""))})
    out.sort(key=lambda a: a["date"], reverse=True)
    return out[:ANALYST_MAX]


def build_catalysts(symbol: str, today: Optional[str] = None,
                    calendar: Callable = _default_calendar,
                    upgrades: Callable = _default_upgrades,
                    history: Callable = _default_history,
                    past_earnings: Callable = _default_past) -> dict:
    sym = symbol.upper()
    today = today or datetime.now(timezone.utc).date().isoformat()
    degraded: list[str] = []

    def _try(fn, name, *a, **k):
        try:
            return fn(*a, **k)
        except Exception:
            degraded.append(name)
            return None

    cal = _try(calendar, "calendar", sym)
    up = _try(upgrades, "upgrades", sym)
    hist = _try(history, "history", sym)
    past = _try(past_earnings, "past_earnings", sym)

    return {"symbol": sym,
            "next_earnings": _next_earnings(cal),
            "last_earnings": _last_earnings(past, hist, today),
            "analyst": _analyst(up, today),
            "degraded": degraded}
