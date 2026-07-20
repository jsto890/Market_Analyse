import sqlite3

from argus.options_intel.schema import ensure_schema
from argus.options_intel.ladder import strike_ladder


def _conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    ensure_schema(conn)
    return conn


def _seed(conn, symbol="SPY", snap="2026-07-17"):
    rows = []
    for expiry in ("2026-07-20", "2026-07-21"):
        for strike in (700.0, 740.0, 745.0, 750.0, 800.0):
            rows.append((snap, "close", symbol, expiry, strike, "C", 1000, 500, 2.5, 2.4, 2.6, 0.2, "ts"))
            rows.append((snap, "close", symbol, expiry, strike, "P", 2000, 800, 2.0, 1.9, 2.1, 0.25, "ts"))
    conn.executemany(
        "INSERT INTO options_snapshots (snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    conn.execute(
        "INSERT INTO gex_levels (date,symbol,expiry,zero_gamma,call_wall,put_wall,total_gex,profile_json) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (snap, symbol, "2026-07-20", 748.9, 745.0, 745.0, 1.5e9, "{}"))


def test_ladder_structure_and_band():
    conn = _conn()
    _seed(conn)
    out = strike_ladder(conn, "SPY", spot=745.0, today="2026-07-20", band=0.02)
    assert out["symbol"] == "SPY" and out["snap_date"] == "2026-07-17"
    assert out["levels"]["zero_gamma"] == 748.9
    assert [e["expiry"] for e in out["expiries"]] == ["2026-07-20", "2026-07-21"]
    strikes = [r["strike"] for r in out["expiries"][0]["rows"]]
    assert strikes == [740.0, 745.0, 750.0]  # 700/800 outside 2% band
    row = out["expiries"][0]["rows"][1]
    assert row["call"]["oi"] == 1000 and row["put"]["oi"] == 2000
    assert isinstance(row["gex"], float)  # dealer-signed per-strike GEX


def test_ladder_expected_move_from_atm_straddle():
    conn = _conn()
    _seed(conn)
    out = strike_ladder(conn, "SPY", spot=745.0, today="2026-07-20", band=0.02)
    # ATM 745: call last 2.5 + put last 2.0 = 4.5 -> 4.5/745 = 0.604%
    assert abs(out["expiries"][0]["expected_move_pct"] - 0.604) < 0.01


def test_ladder_skips_past_expiries_and_handles_missing():
    conn = _conn()
    _seed(conn)
    out = strike_ladder(conn, "SPY", spot=745.0, today="2026-07-21", band=0.02)
    assert [e["expiry"] for e in out["expiries"]] == ["2026-07-21"]
    assert strike_ladder(conn, "NOPE", spot=100.0, today="2026-07-20") is None
