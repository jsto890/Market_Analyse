from argus.db import get_conn
from argus.calendar.schema import ensure_calendar_schema
from argus.calendar.seed import load_seed_events, weekly_claims, all_seed_events
from argus.calendar.store import upsert_events, upcoming, clear_earnings
from argus.calendar.earnings import earnings_event, fetch_earnings, next_earnings_date


def _conn(tmp_path):
    conn = get_conn(tmp_path / "c.db")
    ensure_calendar_schema(conn)
    return conn


def test_seed_loads_known_events():
    ev = load_seed_events()
    keys = {e["dedup_key"] for e in ev}
    # today's FOMC + a known CPI date must be present
    assert "FOMC rate decision:2026-06-17" in keys
    assert "CPI (Consumer Price Index):2026-07-14" in keys
    # FOMC is 8 meetings; all high importance, 14:00 ET
    fomc = [e for e in ev if e["category"] == "fomc"]
    assert len(fomc) == 8
    assert all(e["importance"] == "high" and e["time_et"] == "14:00" for e in fomc)


def test_weekly_claims_are_all_thursdays():
    from datetime import date
    claims = weekly_claims(2026)
    assert len(claims) >= 51
    assert all(date.fromisoformat(c["date"]).weekday() == 3 for c in claims)  # Thu=3
    assert claims[0]["event"] == "Initial Jobless Claims"


def test_upsert_is_idempotent(tmp_path):
    conn = _conn(tmp_path)
    ev = all_seed_events(2026)
    added1 = upsert_events(conn, ev)
    added2 = upsert_events(conn, ev)  # same events again
    conn.close()
    assert added1 == len(ev)
    assert added2 == 0  # nothing new on the second run


def test_upcoming_window_and_ordering(tmp_path):
    conn = _conn(tmp_path)
    upsert_events(conn, all_seed_events(2026))
    rows = upcoming(conn, "2026-06-17", days=14)
    conn.close()
    dates = [r["date"] for r in rows]
    # window is inclusive of today (FOMC 06-17) and excludes far-out events
    assert dates[0] == "2026-06-17"
    assert all("2026-06-17" <= d <= "2026-07-01" for d in dates)
    # 06-17 has FOMC (high) — it should sort before any same-day medium event
    first_today = [r for r in rows if r["date"] == "2026-06-17"][0]
    assert first_today["event"] == "FOMC rate decision"


def test_clear_earnings_keeps_seed(tmp_path):
    conn = _conn(tmp_path)
    upsert_events(conn, load_seed_events())
    upsert_events(conn, [{"date": "2026-06-18", "time_et": None, "event": "NVDA earnings",
                          "category": "earnings", "importance": "medium", "source": "earnings",
                          "ticker": "NVDA", "dedup_key": "earnings:NVDA:2026-06-18"}])
    clear_earnings(conn)
    rows = conn.execute("SELECT source, COUNT(*) c FROM econ_calendar GROUP BY source").fetchall()
    conn.close()
    by_source = {r["source"]: r["c"] for r in rows}
    assert "earnings" not in by_source         # earnings cleared
    assert by_source["seed"] > 0               # seed preserved


def test_earnings_event_from_calendar():
    import pandas as pd
    cal = {"Earnings Date": [pd.Timestamp("2026-07-30")]}
    ev = earnings_event("NVDA", cal, today="2026-07-01")
    assert ev["date"] == "2026-07-30"
    assert ev["ticker"] == "NVDA" and ev["category"] == "earnings"
    assert ev["dedup_key"] == "earnings:NVDA:2026-07-30"
    # no date → no event
    assert earnings_event("NVDA", {}, today="2026-07-01") is None
    assert next_earnings_date(None) is None


def test_next_earnings_date_skips_the_report_already_out():
    import pandas as pd
    # yfinance lists the window around today, oldest first.
    cal = {"Earnings Date": [pd.Timestamp("2026-05-28"), pd.Timestamp("2026-08-12")]}
    assert next_earnings_date(cal, today="2026-07-01") == "2026-08-12"
    assert next_earnings_date(cal, today="2026-09-01") is None
    # Reporting today is still ahead of you.
    assert next_earnings_date(cal, today="2026-08-12") == "2026-08-12"


def test_fetch_earnings_is_failure_tolerant():
    import pandas as pd

    def fake_cal(sym):
        if sym == "BOOM":
            raise RuntimeError("yfinance blew up")
        if sym == "NONE":
            return {}
        return {"Earnings Date": [pd.Timestamp("2026-08-12")]}

    # fetch_times is stubbed out: unstubbed it would reach yfinance over the network.
    out = fetch_earnings(["AAPL", "BOOM", "NONE"], fetch_cal=fake_cal,
                         fetch_times=lambda sym: None)
    assert [e["ticker"] for e in out] == ["AAPL"]   # BOOM raised, NONE had no date
    assert out[0]["date"] == "2026-08-12"
    assert out[0]["time_et"] is None                # no timed source, date-only shape


def _frame(stamps):
    """Stand-in for yfinance's earnings-dates frame: newest-first, tz-aware ET."""
    import pandas as pd
    return pd.DataFrame(
        {"EPS Estimate": [None] * len(stamps)},
        index=pd.DatetimeIndex([pd.Timestamp(s, tz="America/New_York") for s in stamps]),
    )


def test_next_earnings_slot_reads_the_bell_off_the_timestamp():
    from argus.calendar.earnings import next_earnings_slot

    # Newest-first, exactly as yfinance returns it — the earliest future row wins,
    # not the head of the frame.
    frame = _frame(["2026-08-06 08:00", "2026-05-07 07:00", "2026-02-10 07:00"])
    assert next_earnings_slot(frame, today="2026-08-03") == ("2026-08-06", "08:00")

    after = _frame(["2026-08-04 16:00", "2026-05-05 16:00"])
    assert next_earnings_slot(after, today="2026-08-03") == ("2026-08-04", "16:00")


def test_next_earnings_slot_ignores_reports_already_out():
    from argus.calendar.earnings import next_earnings_slot

    frame = _frame(["2026-08-06 08:00", "2026-05-07 07:00"])
    assert next_earnings_slot(frame, today="2026-08-07") is None
    # Reporting today still counts — the position is held into it.
    assert next_earnings_slot(frame, today="2026-08-06") == ("2026-08-06", "08:00")


def test_next_earnings_slot_treats_midnight_as_no_time():
    from argus.calendar.earnings import next_earnings_slot

    # A date-only row parses as 00:00; calling that an event at midnight would
    # put it on the axis hours before the pre-market open.
    frame = _frame(["2026-08-06 00:00"])
    assert next_earnings_slot(frame, today="2026-08-03") == ("2026-08-06", None)
    assert next_earnings_slot(None) is None


def test_timed_source_wins_over_the_bare_calendar_date():
    import pandas as pd
    from argus.calendar.earnings import earnings_event

    cal = {"Earnings Date": [pd.Timestamp("2026-08-05")]}
    ev = earnings_event("ANET", cal, today="2026-08-03",
                        times=_frame(["2026-08-04 16:00"]))
    assert (ev["date"], ev["time_et"]) == ("2026-08-04", "16:00")
    assert ev["dedup_key"] == "earnings:ANET:2026-08-04"

    # Losing the timed source degrades to the calendar's date, never to nothing.
    ev = earnings_event("ANET", cal, today="2026-08-03", times=None)
    assert (ev["date"], ev["time_et"]) == ("2026-08-05", None)
