"""WS-1 tables (master plan §2.2). Idempotent DDL — the snapshotter calls
ensure_schema() on every run; that IS the migration mechanism for this module
(same pattern as the heartbeats table in argus.db). Columns extend the §2.2
sketch with snap_date/kind for the idempotency key — noted in dashboard/README.md.
"""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS options_snapshots (
      snap_date TEXT NOT NULL,
      kind TEXT NOT NULL,
      symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      strike REAL NOT NULL,
      type TEXT NOT NULL,
      oi INTEGER, vol INTEGER, last REAL, bid REAL, ask REAL, iv REAL,
      ts TEXT NOT NULL,
      PRIMARY KEY (snap_date, kind, symbol, expiry, strike, type)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_snap_sym_date ON options_snapshots(symbol, snap_date)",
    """CREATE TABLE IF NOT EXISTS unusual_activity (
      snap_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      contract TEXT NOT NULL,
      side TEXT NOT NULL,
      expiry TEXT NOT NULL, strike REAL NOT NULL,
      score REAL NOT NULL, cross_z REAL, own_z REAL,
      persistence INTEGER NOT NULL DEFAULT 0,
      vol INTEGER, oi INTEGER, last REAL,
      basis TEXT NOT NULL,
      ts TEXT NOT NULL,
      PRIMARY KEY (snap_date, symbol, contract)
    )""",
    """CREATE TABLE IF NOT EXISTS gex_levels (
      date TEXT NOT NULL, symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      zero_gamma REAL, call_wall REAL, put_wall REAL, total_gex REAL,
      profile_json TEXT,
      PRIMARY KEY (date, symbol)
    )""",
]


def ensure_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
