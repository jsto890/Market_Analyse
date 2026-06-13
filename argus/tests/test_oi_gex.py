import json

from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.gex import bs_gamma, compute_gex


def _snap(conn, symbol, expiry, strike, side, oi, iv=0.2, snap_date="2026-06-13"):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,100,1.0,0.9,1.1,?,?)",
            (snap_date, "close", symbol, expiry, strike, side, oi, iv, snap_date))


def test_bs_gamma_peaks_atm():
    atm = bs_gamma(100, 100, 30 / 365, 0.2)
    otm = bs_gamma(100, 130, 30 / 365, 0.2)
    assert atm > 0 and atm > otm * 5


def test_compute_gex_skips_zero_dte_and_finds_flip(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    _snap(conn, "SPY", "2026-06-13", 100.0, "C", oi=99999)
    for k in (90.0, 95.0, 100.0, 105.0, 110.0):
        _snap(conn, "SPY", "2026-07-17", k, "C", oi=1000)
        _snap(conn, "SPY", "2026-07-17", k, "P", oi=1000)
    res = compute_gex(conn, "SPY", "2026-06-13", spot=100.0, today="2026-06-13")
    row = conn.execute("SELECT * FROM gex_levels").fetchone()
    conn.close()
    assert res is not None
    assert row["expiry"] == "2026-07-17"            # 0DTE skipped
    assert row["zero_gamma"] is not None
    assert 85.0 <= row["zero_gamma"] <= 115.0
    assert row["call_wall"] in (90.0, 95.0, 100.0, 105.0, 110.0)
    profile = json.loads(row["profile_json"])
    assert len(profile["spots"]) == len(profile["gex"]) == 61


def test_compute_gex_no_eligible_expiry(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    _snap(conn, "SPY", "2026-06-13", 100.0, "C", oi=100)   # only 0DTE
    assert compute_gex(conn, "SPY", "2026-06-13", 100.0, today="2026-06-13") is None
    conn.close()
