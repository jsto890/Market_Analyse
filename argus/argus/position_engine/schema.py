"""WS-4 Position Engine tables (design spec §10). Idempotent DDL — callers run
ensure_schema() on every use (same pattern as options_intel/schema.py)."""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS position_signals (
      ts TEXT NOT NULL, ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d',
      model_ver TEXT NOT NULL,
      bias TEXT NOT NULL, bias_strength INTEGER NOT NULL, strength_tier TEXT NOT NULL,
      overlay TEXT NOT NULL,
      entry REAL, stop REAL, target REAL,
      avg_cost REAL, leg_count INTEGER NOT NULL DEFAULT 0,
      progress_r REAL, progress_pct REAL, progress_denom REAL, progress_anchor REAL,
      health INTEGER, health_flags TEXT, risk_state TEXT, structure TEXT,
      exit_reason TEXT, cooldown_until TEXT,
      run_kind TEXT NOT NULL DEFAULT 'live', data_date TEXT NOT NULL,
      PRIMARY KEY (ticker, tf, ts, model_ver, run_kind)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_possig_ticker_ts ON position_signals(ticker, tf, ts)",
    "CREATE INDEX IF NOT EXISTS idx_possig_cache ON position_signals(ticker, model_ver, data_date, run_kind)",
    """CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d', model_ver TEXT NOT NULL,
      mode TEXT NOT NULL, side TEXT NOT NULL DEFAULT 'long',
      entry_ts TEXT NOT NULL, entry_px REAL NOT NULL, qty REAL NOT NULL,
      init_stop REAL NOT NULL, init_target REAL NOT NULL,
      exit_ts TEXT, exit_px REAL, exit_reason TEXT,
      r_multiple REAL, mae_r REAL, mfe_r REAL, holding_bars INTEGER,
      leg_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE (ticker, tf, model_ver, mode, entry_ts)
    )""",
    """CREATE TABLE IF NOT EXISTS trade_legs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL REFERENCES trades(id),
      leg_no INTEGER NOT NULL, ts TEXT NOT NULL,
      px REAL NOT NULL, qty REAL NOT NULL, kind TEXT NOT NULL,
      UNIQUE (trade_id, leg_no)
    )""",
    """CREATE TABLE IF NOT EXISTS position_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER, ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d',
      model_ver TEXT NOT NULL, ts TEXT NOT NULL, kind TEXT NOT NULL, exit_reason TEXT,
      old_denom REAL, new_denom REAL, old_target REAL, new_target REAL,
      old_stop REAL, new_stop REAL, frozen_anchor REAL, detail TEXT,
      UNIQUE (ticker, tf, model_ver, ts, kind)
    )""",
]


def ensure_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
