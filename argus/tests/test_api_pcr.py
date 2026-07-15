from fastapi.testclient import TestClient


def _seed(db):
    from argus.db import get_conn
    from argus.options_intel.schema import ensure_schema
    conn = get_conn(db)
    ensure_schema(conn)
    with conn:
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','eod','QQQ','2026-07-17',500.0,'C',1000,100,5.0,4.9,5.1,0.2,"
            "'2026-07-15T20:00:00')")
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','eod','QQQ','2026-07-17',510.0,'C',1000,100,4.0,3.9,4.1,0.2,"
            "'2026-07-15T20:00:00')")
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','eod','QQQ','2026-07-17',495.0,'P',800,150,3.0,2.9,3.1,0.2,"
            "'2026-07-15T20:00:00')")
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','eod','ZERO','2026-07-17',495.0,'P',800,150,3.0,2.9,3.1,0.2,"
            "'2026-07-15T20:00:00')")
    conn.close()


def test_pcr_endpoint(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db")
    monkeypatch.setenv("ARGUS_DB", db)
    _seed(db)
    from argus.main import app
    c = TestClient(app)

    r = c.get("/api/pcr/QQQ")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "QQQ"
    assert body["as_of"] == "2026-07-15"
    assert body["call_vol"] == 200
    assert body["put_vol"] == 150
    assert body["call_oi"] == 2000
    assert body["put_oi"] == 800
    assert body["pcr_vol"] == 0.75
    assert body["pcr_oi"] == 0.4

    assert c.get("/api/pcr/ZZZQ").status_code == 404

    r2 = c.get("/api/pcr/ZERO")
    assert r2.status_code == 200
    assert r2.json()["pcr_vol"] is None


def test_pcr_uses_only_latest_kind_not_both(tmp_path, monkeypatch):
    """preclose and close snapshots coexist under the same snap_date (PK
    includes kind). The endpoint must aggregate only the latest kind's rows,
    not sum both — and must report that latest kind, not the lexically
    largest kind string."""
    db = str(tmp_path / "t2.db")
    monkeypatch.setenv("ARGUS_DB", db)
    from argus.db import get_conn
    from argus.options_intel.schema import ensure_schema
    conn = get_conn(db)
    ensure_schema(conn)
    with conn:
        # preclose snapshot, taken earlier in the day
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','preclose','QQQ','2026-07-17',500.0,'C',1000,100,5.0,4.9,5.1,0.2,"
            "'2026-07-15T19:45:00')")
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','preclose','QQQ','2026-07-17',495.0,'P',800,150,3.0,2.9,3.1,0.2,"
            "'2026-07-15T19:45:00')")
        # close snapshot, taken later in the day, with different values
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','close','QQQ','2026-07-17',500.0,'C',1200,200,5.2,5.1,5.3,0.2,"
            "'2026-07-15T20:15:00')")
        conn.execute(
            "INSERT INTO options_snapshots VALUES "
            "('2026-07-15','close','QQQ','2026-07-17',495.0,'P',900,300,3.2,3.1,3.3,0.2,"
            "'2026-07-15T20:15:00')")
    conn.close()

    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/pcr/QQQ")
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "close"
    assert body["call_vol"] == 200
    assert body["put_vol"] == 300
    assert body["call_oi"] == 1200
    assert body["put_oi"] == 900
    assert body["pcr_vol"] == 1.5
    assert body["pcr_oi"] == 0.75
