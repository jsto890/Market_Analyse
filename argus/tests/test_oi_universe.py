import csv

from argus.db import get_conn
from argus.options_intel.universe import snapshot_universe

INDICES = ["SPY", "QQQ", "IWM", "DIA"]


def _write_bridge(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ticker", "fetch_symbol", "conviction"])
        w.writeheader()
        w.writerows(rows)


def test_universe_indices_first_dedup_and_cap(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    with conn:
        conn.execute("CREATE TABLE watchlist (ticker TEXT PRIMARY KEY, pinned_at TEXT, price_at_pin REAL)")
        conn.execute("INSERT INTO watchlist VALUES ('NVDA','2026-06-01',100.0)")
        conn.execute("INSERT INTO watchlist VALUES ('SPY','2026-06-01',600.0)")  # dup with index
    conn.close()
    bridge = tmp_path / "bridge_latest.csv"
    _write_bridge(bridge, [
        {"ticker": "AMD", "fetch_symbol": "AMD", "conviction": "9"},
        {"ticker": "SAAB-B", "fetch_symbol": "SAAB-B.ST", "conviction": "5"},
        {"ticker": "NVDA", "fetch_symbol": "NVDA", "conviction": "8"},  # dup with watchlist
    ])
    monkeypatch.setenv("BRIDGE_DIR", str(tmp_path))
    u = snapshot_universe(db_path=db, cap=5)
    assert u[:4] == INDICES                      # indices always first
    assert u == ["SPY", "QQQ", "IWM", "DIA", "NVDA"]  # cap=5: watchlist beats bridge


def test_universe_survives_missing_inputs(tmp_path, monkeypatch):
    db = tmp_path / "empty.db"
    monkeypatch.setenv("BRIDGE_DIR", str(tmp_path / "nope"))
    u = snapshot_universe(db_path=db, cap=50)
    assert u == INDICES  # no watchlist table, no bridge file → indices only, no crash
