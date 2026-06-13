from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.snapshot import snapshot_symbol


def fake_chain(symbol, expiration=None):
    if symbol == "BAD":
        return {"symbol": "BAD", "error": "no chain"}
    exp = expiration or "2026-06-20"
    mk = lambda k, oi, vol: {"strike": k, "openInterest": oi, "volume": vol,
                             "lastPrice": 1.0, "bid": 0.9, "ask": 1.1,
                             "impliedVolatility": 0.2}
    return {"symbol": symbol, "expiration": exp,
            "expirations": ["2026-06-20", "2026-06-27", "2026-09-18"],
            "calls": [mk(95, 100, 10), mk(100, 200, 30), mk(130, 50, 5)],
            "puts": [mk(95, 80, 20), mk(100, 150, 40)],
            "summary": {}}


def test_snapshot_writes_rows_within_moneyness(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    n = snapshot_symbol(conn, "TEST", kind="close", snap_date="2026-06-13",
                        spot=100.0, fetch=fake_chain, max_expiries=2)
    rows = conn.execute("SELECT DISTINCT expiry FROM options_snapshots").fetchall()
    conn.close()
    assert n == 8  # 2 expiries × (calls 95,100 + puts 95,100); strike 130 = 30% OTM dropped
    assert {r["expiry"] for r in rows} == {"2026-06-20", "2026-06-27"}


def test_snapshot_idempotent_rerun(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    snapshot_symbol(conn, "TEST", "close", "2026-06-13", 100.0, fake_chain, 2)
    snapshot_symbol(conn, "TEST", "close", "2026-06-13", 100.0, fake_chain, 2)
    n = conn.execute("SELECT COUNT(*) FROM options_snapshots").fetchone()[0]
    conn.close()
    assert n == 8  # INSERT OR REPLACE — same day+kind replaces, never duplicates


def test_snapshot_bad_symbol_returns_zero(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    assert snapshot_symbol(conn, "BAD", "close", "2026-06-13", None, fake_chain, 2) == 0
    conn.close()
