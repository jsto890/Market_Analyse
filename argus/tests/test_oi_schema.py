from argus.db import get_conn
from argus.options_intel.schema import ensure_schema


def test_ensure_schema_creates_tables_idempotently(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    ensure_schema(conn)  # idempotent
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"options_snapshots", "unusual_activity", "gex_levels"} <= names


def test_snapshot_upsert_key(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    row = ("2026-06-13", "close", "SPY", "2026-06-20", 600.0, "C",
           100, 50, 1.2, 1.1, 1.3, 0.18, "2026-06-13T06:10:00")
    with conn:
        conn.execute("INSERT OR REPLACE INTO options_snapshots "
                     "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
                     "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
        conn.execute("INSERT OR REPLACE INTO options_snapshots "
                     "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
                     "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
    n = conn.execute("SELECT COUNT(*) FROM options_snapshots").fetchone()[0]
    conn.close()
    assert n == 1  # PK collapses the duplicate
