import sqlite3

from argus.db import get_conn, heartbeat, resolve_db_path


def test_get_conn_sets_wal_and_busy_timeout(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1  # NORMAL
    conn.close()
    # WAL persists in the file header for subsequent plain connections
    raw = sqlite3.connect(db)
    assert raw.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    raw.close()


def test_heartbeat_upserts_single_row(tmp_path):
    db = tmp_path / "t.db"
    heartbeat("snapshotter", "ok", "5 symbols", db_path=db)
    heartbeat("snapshotter", "error", "yf timeout", db_path=db)
    conn = get_conn(db)
    rows = conn.execute("SELECT job, status, detail FROM heartbeats").fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0]["job"] == "snapshotter"
    assert rows[0]["status"] == "error"
    assert rows[0]["detail"] == "yf timeout"


def test_resolve_db_path_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("ARGUS_DB", str(tmp_path / "x.db"))
    assert str(resolve_db_path()) == str(tmp_path / "x.db")
