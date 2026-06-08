"""SQLite-backed alert log. Single-user, file-based — no auth needed."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from ..settings import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    payload_json TEXT,
    channels_json TEXT
);
"""


class AlertLog:
    def __init__(self, path: Optional[str] = None) -> None:
        self.path = str(path or settings.db_path)
        # Keep a persistent connection for :memory: databases (they don't survive reconnects)
        self._persistent_conn: Optional[sqlite3.Connection] = (
            sqlite3.connect(":memory:") if self.path == ":memory:" else None
        )
        self._init()

    def _init(self) -> None:
        with self._conn() as c:
            c.executescript(SCHEMA)

    @contextmanager
    def _conn(self):
        if self._persistent_conn is not None:
            self._persistent_conn.row_factory = sqlite3.Row
            yield self._persistent_conn
            self._persistent_conn.commit()
        else:
            conn = sqlite3.connect(self.path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            finally:
                conn.close()

    def log_alert(self, title: str, body: str, payload: dict, channels: dict) -> None:
        with self._conn() as c:
            c.execute(
                """INSERT INTO alerts_log (ts, title, body, payload_json, channels_json)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    datetime.now(timezone.utc).isoformat(),
                    title,
                    body,
                    json.dumps(payload, default=str),
                    json.dumps(channels, default=str),
                ),
            )
