from argus.db import get_conn
from argus.position_engine.schema import ensure_schema


def test_creates_four_tables(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert {"position_signals", "trades", "trade_legs", "position_events"} <= names


def test_idempotent(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    ensure_schema(conn)  # second call must not raise
    conn.close()
