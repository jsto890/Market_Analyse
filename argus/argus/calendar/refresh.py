"""Daily econ-calendar refresh (master plan §WS-3.4) — launchd + run_daily.sh.
Idempotently upserts the macro seed (yearly-stable) and re-fetches tracked-name
earnings (which drift). Run: python -m argus.calendar.refresh"""
import sys
from datetime import date

from ..db import get_conn, heartbeat
from .schema import ensure_calendar_schema
from .seed import all_seed_events
from .earnings import fetch_earnings, tracked_tickers
from . import store as _store


def run_refresh(conn=None, today: str | None = None, tickers: list | None = None) -> dict:
    own = conn is None
    conn = conn or get_conn()
    today = today or date.today().isoformat()
    try:
        ensure_calendar_schema(conn)
        seeded = _store.upsert_events(conn, all_seed_events(int(today[:4])))
        # earnings drift — clear then re-insert the fresh set
        _store.clear_earnings(conn)
        tks = tickers if tickers is not None else tracked_tickers()
        earnings = fetch_earnings(tks)
        added_earnings = _store.upsert_events(conn, earnings)
        summary = {"seeded_new": seeded, "earnings": added_earnings, "tickers": len(tks)}
    finally:
        if own:
            conn.close()
    heartbeat("calendar-refresh", "ok",
              f"{summary['earnings']} earnings, {summary['tickers']} tickers")
    return summary


def main() -> int:
    print(f"calendar-refresh: {run_refresh()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
