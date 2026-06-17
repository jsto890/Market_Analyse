"""SQLite access for econ_calendar. All access via argus.db.get_conn.
Upsert is idempotent on dedup_key, so re-running the daily refresh is safe."""

_COLS = ("date", "time_et", "event", "category", "importance", "source", "ticker", "dedup_key")


def upsert_events(conn, events: list[dict]) -> int:
    """Insert events, ignoring duplicates (by dedup_key). Returns rows newly added."""
    before = conn.total_changes
    conn.executemany(
        "INSERT OR IGNORE INTO econ_calendar "
        "(date,time_et,event,category,importance,source,ticker,dedup_key) "
        "VALUES (:date,:time_et,:event,:category,:importance,:source,:ticker,:dedup_key)",
        [{k: e.get(k) for k in _COLS} for e in events])
    conn.commit()
    return conn.total_changes - before


def upcoming(conn, today: str, days: int = 7) -> list:
    """Events from `today` (inclusive) through `today`+days, soonest first.
    Dates are ISO strings, so lexical comparison is chronological."""
    from datetime import date as _date, timedelta
    end = (_date.fromisoformat(today) + timedelta(days=days)).isoformat()
    return conn.execute(
        "SELECT date,time_et,event,category,importance,source,ticker FROM econ_calendar "
        "WHERE date >= ? AND date <= ? "
        "ORDER BY date ASC, CASE importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, "
        "time_et ASC", (today, end)).fetchall()


def clear_earnings(conn) -> None:
    """Earnings dates drift; the refresh job clears then re-inserts them so stale
    rows don't linger. Seed (macro) rows are never touched."""
    conn.execute("DELETE FROM econ_calendar WHERE source='earnings'")
    conn.commit()
