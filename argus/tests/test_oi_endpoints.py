import os

from fastapi.testclient import TestClient


def _seed(db):
    from argus.db import get_conn
    from argus.options_intel.schema import ensure_schema
    conn = get_conn(db)
    ensure_schema(conn)
    with conn:
        conn.execute(
            "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,strike,"
            "score,cross_z,own_z,persistence,vol,oi,last,basis,ts) VALUES "
            "('2026-06-12','SPY','SPY 2026-06-20 600C','C','2026-06-20',600.0,"
            "3.8,3.8,NULL,0,5000,500,1.25,'3.8 robust-σ vs similar-moneyness strikes; "
            "insufficient history for own-baseline','2026-06-12T20:10:00')")
        conn.execute(
            "INSERT OR REPLACE INTO gex_levels VALUES "
            "('2026-06-12','SPY','2026-06-20',598.5,605.0,590.0,1.2e9,'{}')")
    conn.close()


def test_unusual_and_gex_endpoints(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db")
    monkeypatch.setenv("ARGUS_DB", db)
    _seed(db)
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/unusual/SPY")
    assert r.status_code == 200
    body = r.json()
    assert body["as_of"] == "2026-06-12"
    assert body["rows"][0]["score"] == 3.8
    g = c.get("/api/gex/SPY")
    assert g.status_code == 200
    assert g.json()["zero_gamma"] == 598.5
    assert "OI-based" in g.json()["caveat"]
    assert c.get("/api/gex/ZZZQ").status_code == 404
