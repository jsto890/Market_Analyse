import csv

from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.label_sheet import write_sheet


def test_sheet_mixes_top_and_random_without_leaking_rank(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    with conn:
        for i in range(30):
            conn.execute(
                "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,"
                "strike,score,cross_z,own_z,persistence,vol,oi,last,basis,ts) VALUES "
                "('2026-06-12','SPY',?,'C','2026-06-20',?,?,?,NULL,0,100,500,1.0,'b','t')",
                (f"SPY 2026-06-20 {600+i}C", 600.0 + i, 5.0 - i * 0.1, 5.0 - i * 0.1))
        for i in range(40):
            conn.execute(
                "INSERT OR REPLACE INTO options_snapshots (snap_date,kind,symbol,expiry,"
                "strike,type,oi,vol,last,bid,ask,iv,ts) VALUES "
                "('2026-06-12','close','SPY','2026-06-20',?, 'C', 200, 10,1,0.9,1.1,0.2,'t')",
                (500.0 + i,))
    out = tmp_path / "sheet.csv"
    write_sheet(conn, out, top_n=10, random_n=10, seed=42)
    conn.close()
    rows = list(csv.DictReader(open(out)))
    assert len(rows) == 20
    assert set(rows[0].keys()) == {"snap_date", "symbol", "contract", "vol", "oi",
                                   "last", "label_unusual_yn", "notes"}
    # no score/rank columns — labelling must be blind
