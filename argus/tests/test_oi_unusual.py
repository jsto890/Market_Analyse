from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.unusual import robust_z, score_symbol


def _snap(conn, snap_date, symbol, strike, side, oi, vol, expiry="2026-06-20", spot=100.0):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,?,1.0,0.9,1.1,0.2,?)",
            (snap_date, "close", symbol, expiry, strike, side, oi, vol, snap_date))


def test_robust_z_flags_outlier_not_noise():
    assert robust_z(50.0, [1.0, 1.1, 0.9, 1.0, 1.05]) > 3
    assert abs(robust_z(1.0, [1.0, 1.1, 0.9, 1.0, 1.05])) < 1


def test_robust_z_constant_baseline_suppressed():
    # constant baseline carries zero dispersion info → suppress (None), never a fake 0 or fudge
    assert robust_z(2.0, [2.0, 2.0, 2.0]) is None
    assert robust_z(5.0, [2.0, 2.0, 2.0]) is None
    assert robust_z(1.0, [1.0, 1.0]) is None            # <3 points → None


def test_robust_z_mad_zero_but_variance_sigma_fallback():
    import math
    # tie-heavy but NOT constant: MAD=0, σ>0 → scored via std-dev fallback
    assert robust_z(math.log1p(5000), [math.log1p(20)] * 4 + [math.log1p(30)]) > 3


def test_score_symbol_outlier_beats_low_oi_noise(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    for k, v in [(98.0, 18), (99.0, 25), (100.0, 22), (101.0, 19), (102.0, 24)]:
        _snap(conn, "2026-06-13", "TEST", k, "C", oi=500, vol=v)
    _snap(conn, "2026-06-13", "TEST", 99.5, "C", oi=500, vol=5000)   # genuine outlier
    _snap(conn, "2026-06-13", "TEST", 100.5, "C", oi=10,  vol=400)   # low-OI noise, excluded
    n = score_symbol(conn, "TEST", "2026-06-13", spot=100.0)
    rows = conn.execute("SELECT * FROM unusual_activity ORDER BY score DESC").fetchall()
    conn.close()
    assert n >= 1
    assert rows[0]["strike"] == 99.5
    assert all(r["strike"] != 100.5 for r in rows)          # OI<50 excluded
    assert "insufficient history" in rows[0]["basis"]        # no own-baseline yet


def test_own_baseline_and_persistence(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    # non-constant history (real volume series are never identical) so the own-baseline
    # carries dispersion: a constant baseline is correctly suppressed under the adjudicated
    # design, which would leave the 12th unscored and break the persistence bootstrap.
    hist_vols = [18, 22, 19, 21, 20, 23, 17, 24, 20, 19, 22, 18]
    for i in range(1, 13):
        _snap(conn, f"2026-05-{i:02d}", "TEST", 100.0, "C", oi=500, vol=hist_vols[i - 1])
        _snap(conn, f"2026-05-{i:02d}", "TEST", 101.0, "C", oi=500, vol=hist_vols[i - 1])
    _snap(conn, "2026-06-12", "TEST", 100.0, "C", oi=500, vol=4000)
    _snap(conn, "2026-06-12", "TEST", 101.0, "C", oi=500, vol=20)
    score_symbol(conn, "TEST", "2026-06-12", spot=100.0)
    _snap(conn, "2026-06-13", "TEST", 100.0, "C", oi=500, vol=5000)
    _snap(conn, "2026-06-13", "TEST", 101.0, "C", oi=500, vol=20)
    score_symbol(conn, "TEST", "2026-06-13", spot=100.0)
    row = conn.execute(
        "SELECT * FROM unusual_activity WHERE snap_date='2026-06-13' AND strike=100.0"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row["own_z"] is not None and row["own_z"] > 3
    assert row["persistence"] == 1
    assert "2nd day" in row["basis"]
