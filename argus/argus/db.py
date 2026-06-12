"""Single SQLite access point for all Python code.

Contract (master plan §2.2): WAL persisted at creation, busy_timeout=5000,
synchronous=NORMAL on every connection. No bare sqlite3.connect() elsewhere.
"""
import logging
import os
import sqlite3
from pathlib import Path
from typing import Optional, Union

log = logging.getLogger("argus.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS heartbeats (
  job TEXT PRIMARY KEY,
  last_run_ts TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT
);
"""

_REPO_ROOT = Path(__file__).resolve().parents[2]  # .../Market_Analyse


def resolve_db_path() -> Path:
    raw = os.environ.get("ARGUS_DB")
    if raw:
        return Path(raw).expanduser()
    return _REPO_ROOT / "argus.db"


def get_conn(db_path: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    p = Path(db_path) if db_path is not None else resolve_db_path()
    conn = sqlite3.connect(p)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(_SCHEMA.strip())
    log.debug("sqlite open %s", p)
    return conn


def heartbeat(job: str, status: str, detail: str = "",
              db_path: Optional[Union[str, Path]] = None) -> None:
    conn = get_conn(db_path)
    try:
        with conn:
            conn.execute(
                "INSERT INTO heartbeats (job, last_run_ts, status, detail) "
                "VALUES (?, datetime('now'), ?, ?) "
                "ON CONFLICT(job) DO UPDATE SET last_run_ts=excluded.last_run_ts, "
                "status=excluded.status, detail=excluded.detail",
                (job, status, detail),
            )
    finally:
        conn.close()
