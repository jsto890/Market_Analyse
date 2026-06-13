"""Snapshot universe: index underlyings + watchlist + today's bridge tickers.

Priority when capped: indices > watchlist (pin order) > bridge (conviction desc).
Bridge symbols use fetch_symbol (yfinance symbol). Missing inputs are skipped,
never fatal — an empty bridge day still snapshots the indices.
"""
import csv
import os
import sqlite3
from pathlib import Path
from typing import Optional, Union

from ..db import get_conn

INDEX_UNDERLYINGS = ["SPY", "QQQ", "IWM", "DIA"]


def _watchlist(db_path) -> list[str]:
    try:
        conn = get_conn(db_path)
        rows = conn.execute(
            "SELECT ticker FROM watchlist ORDER BY pinned_at").fetchall()
        conn.close()
        return [r["ticker"].upper() for r in rows]
    except sqlite3.Error:
        return []


def _bridge() -> list[str]:
    bridge_dir = os.environ.get("BRIDGE_DIR")
    if not bridge_dir:
        return []
    p = Path(bridge_dir) / "bridge_latest.csv"
    if not p.exists():
        return []
    try:
        with open(p, newline="") as f:
            rows = list(csv.DictReader(f))
    except (OSError, UnicodeDecodeError, csv.Error):
        return []

    def conv(r):
        try:
            return float(r.get("conviction") or 0)
        except ValueError:
            return 0.0

    rows.sort(key=conv, reverse=True)
    return [(r.get("fetch_symbol") or r.get("ticker") or "").upper()
            for r in rows if r.get("ticker")]


def snapshot_universe(db_path: Optional[Union[str, Path]] = None, cap: int = 50) -> list[str]:
    out: list[str] = []
    for sym in INDEX_UNDERLYINGS + _watchlist(db_path) + _bridge():
        if sym and sym not in out:
            out.append(sym)
        if len(out) >= cap:
            break
    return out
