"""SQLite-backed trade journal. Single-user, file-based — no auth needed."""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import List, Optional

from ..settings import settings


SCHEMA = """
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,        -- LONG / SHORT
    qty REAL NOT NULL,
    entry REAL,
    stop REAL,
    target REAL,
    exit REAL,
    pnl REAL,
    rr REAL,
    status TEXT NOT NULL,      -- OPEN / CLOSED
    setup TEXT,                -- which agents/triggered the trade
    notes TEXT,
    closed_ts TEXT
);

CREATE TABLE IF NOT EXISTS alerts_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    payload_json TEXT,
    channels_json TEXT
);
"""


@dataclass
class Trade:
    id: Optional[int]
    ts: str
    symbol: str
    side: str
    qty: float
    entry: Optional[float]
    stop: Optional[float]
    target: Optional[float]
    exit: Optional[float]
    pnl: Optional[float]
    rr: Optional[float]
    status: str
    setup: Optional[str] = None
    notes: Optional[str] = None
    closed_ts: Optional[str] = None


class Journal:
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

    # --- trades ---

    def open_trade(self, t: Trade) -> int:
        with self._conn() as c:
            cur = c.execute(
                """INSERT INTO trades (ts, symbol, side, qty, entry, stop, target, status, setup, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)""",
                (t.ts, t.symbol, t.side, t.qty, t.entry, t.stop, t.target, t.setup, t.notes),
            )
            return cur.lastrowid

    def close_trade(self, trade_id: int, exit_price: float, notes: Optional[str] = None) -> None:
        with self._conn() as c:
            row = c.execute("SELECT * FROM trades WHERE id=?", (trade_id,)).fetchone()
            if not row:
                return
            entry = row["entry"] or 0
            qty = row["qty"]
            sign = 1 if row["side"] == "LONG" else -1
            pnl = (exit_price - entry) * sign * qty
            rr = None
            if row["entry"] and row["stop"]:
                risk = abs(row["entry"] - row["stop"])
                if risk:
                    rr = abs(exit_price - row["entry"]) / risk * sign
            c.execute(
                """UPDATE trades SET exit=?, pnl=?, rr=?, status='CLOSED', closed_ts=?, notes=COALESCE(?, notes)
                   WHERE id=?""",
                (exit_price, pnl, rr, datetime.now(timezone.utc).isoformat(), notes, trade_id),
            )

    def list_trades(self, status: Optional[str] = None, limit: int = 100) -> List[dict]:
        sql = "SELECT * FROM trades"
        params = ()
        if status:
            sql += " WHERE status=?"
            params = (status,)
        sql += " ORDER BY id DESC LIMIT ?"
        params = (*params, limit)
        with self._conn() as c:
            return [dict(r) for r in c.execute(sql, params).fetchall()]

    def stats(self) -> dict:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM trades WHERE status='CLOSED'").fetchall()
        if not rows:
            return {"trades": 0}
        pnls = [r["pnl"] or 0 for r in rows]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p < 0]
        return {
            "trades": len(rows),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": len(wins) / len(rows),
            "avg_win": sum(wins) / len(wins) if wins else 0,
            "avg_loss": sum(losses) / len(losses) if losses else 0,
            "total_pnl": sum(pnls),
        }

    # --- alerts log ---

    def log_alert(self, title: str, body: str, payload: dict, channels: dict) -> None:
        import json
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
