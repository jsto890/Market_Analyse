"""WS-3c economic-calendar table (master plan §WS-3.4). Idempotent DDL — the
refresh job calls ensure_calendar_schema() on every run (same pattern as
news/schema.py). Answers "what is scheduled and when"; actual-vs-forecast is
out of scope for v1."""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS econ_calendar (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,           -- YYYY-MM-DD (US Eastern)
      time_et TEXT,                 -- HH:MM 24h ET, or NULL if unknown
      event TEXT NOT NULL,
      category TEXT NOT NULL,       -- fomc|inflation|jobs|growth|earnings
      importance TEXT NOT NULL,     -- high|medium|low
      source TEXT NOT NULL,         -- seed|earnings
      ticker TEXT,                  -- set for earnings rows
      dedup_key TEXT UNIQUE NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_cal_date ON econ_calendar(date)",
]


def ensure_calendar_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
