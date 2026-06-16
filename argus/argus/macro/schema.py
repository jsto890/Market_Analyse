"""WS-3b macro-sentiment tables (master plan §WS-3.3). Idempotent DDL — the
aggregator calls ensure_macro_schema() on every run (same pattern as
news/schema.py and options_intel/schema.py)."""
import sqlite3

_DDL = [
    # per-item FinBERT score cache: score each news_item once, reuse forever.
    """CREATE TABLE IF NOT EXISTS news_sentiment (
      news_id INTEGER PRIMARY KEY,
      score REAL NOT NULL,
      scored_ts TEXT NOT NULL DEFAULT (datetime('now'))
    )""",
    # append-only aggregate snapshots. gauges = latest per (scope,window);
    # the /macro chart = the series over ts.
    """CREATE TABLE IF NOT EXISTS macro_sentiment (
      scope TEXT NOT NULL,
      window TEXT NOT NULL,
      score REAL NOT NULL,
      n INTEGER NOT NULL,
      ts TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_macro_scope_window_ts ON macro_sentiment(scope, window, ts)",
]


def ensure_macro_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
