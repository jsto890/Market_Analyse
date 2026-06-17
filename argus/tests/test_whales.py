from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.whales import whale_items, scan_whales, _premium
from argus.news.schema import ensure_news_schema


_ROWS = [
    # big premium, high score → whale
    {"symbol": "NVDA", "contract": "NVDA260717C1000", "side": "C", "expiry": "2026-07-17",
     "strike": 1000.0, "score": 3.2, "vol": 12000, "last": 5.40},
    # tiny premium → filtered out despite high score
    {"symbol": "AMD", "contract": "AMD260717P200", "side": "P", "expiry": "2026-07-17",
     "strike": 200.0, "score": 4.0, "vol": 10, "last": 0.50},
    # decent premium but score below floor → filtered out
    {"symbol": "TSM", "contract": "TSM260717C300", "side": "C", "expiry": "2026-07-17",
     "strike": 300.0, "score": 0.3, "vol": 5000, "last": 2.00},
    # medium whale
    {"symbol": "MU", "contract": "MU260717P150", "side": "P", "expiry": "2026-07-17",
     "strike": 150.0, "score": 2.1, "vol": 4000, "last": 1.50},
]


def test_premium_formula():
    assert _premium({"vol": 100, "last": 2.0}) == 100 * 2.0 * 100


def test_whale_items_filters_ranks_and_formats():
    items = whale_items(_ROWS, "2026-06-17", ts="2026-06-17T20:00:00+00:00",
                        min_premium=250_000, min_score=1.0)
    # NVDA premium = 12000*5.4*100 = 6.48M; MU = 4000*1.5*100 = 600k. AMD/TSM filtered.
    assert [i["ticker"] for i in items] == ["NVDA", "MU"]   # premium-ranked desc
    nvda = items[0]
    assert nvda["source"] == "whale" and nvda["is_breaking"] == 0
    assert nvda["headline"].startswith("🐋 NVDA calls 1000 2026-07-17 — $6.5M premium")
    assert nvda["dedup_key"] == "whale:2026-06-17:NVDA:NVDA260717C1000"
    assert "puts" in items[1]["headline"]  # MU is a put


def test_scan_whales_inserts_dedups(tmp_path):
    conn = get_conn(tmp_path / "w.db")
    ensure_schema(conn)
    ensure_news_schema(conn)
    for r in _ROWS:
        conn.execute(
            "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,strike,"
            "score,vol,oi,last,basis,ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            ("2026-06-17", r["symbol"], r["contract"], r["side"], r["expiry"], r["strike"],
             r["score"], r["vol"], 0, r["last"], "cross", "2026-06-17T20:00:00Z"))
    conn.commit()
    n1 = scan_whales(conn)
    n2 = scan_whales(conn)  # idempotent — dedup_key collides
    rows = conn.execute("SELECT ticker FROM news_items WHERE source='whale' ORDER BY id").fetchall()
    conn.close()
    assert n1 == 2 and n2 == 0
    assert {r["ticker"] for r in rows} == {"NVDA", "MU"}
