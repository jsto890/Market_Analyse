"""WS-3 news tables (master plan §2.2). Idempotent DDL — ingesters call
ensure_news_schema() on every run (same pattern as options_intel.schema)."""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      source TEXT NOT NULL,
      ticker TEXT,
      headline TEXT NOT NULL,
      body TEXT,
      url TEXT,
      tags TEXT,
      is_breaking INTEGER NOT NULL DEFAULT 0,
      dedup_key TEXT UNIQUE,
      created_ts TEXT NOT NULL DEFAULT (datetime('now'))
    )""",
    "CREATE INDEX IF NOT EXISTS idx_news_ticker ON news_items(ticker, id)",
    """CREATE TABLE IF NOT EXISTS news_cursor (
      channel_id TEXT PRIMARY KEY,
      last_message_id TEXT NOT NULL,
      updated_ts TEXT NOT NULL
    )""",
]


def ensure_news_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
