"""Whale alerts (master plan §WS-3.6): cross-market top-N options by premium
traded (vol × last × 100), filtered to unusual score > threshold, streamed into
news_items with source='whale' so they appear inline in the news rail with a 🐋
chip. v1 scans the tracked snapshot universe (the unusual_activity table).

CLI:  python -m argus.options_intel.whales
"""
import sys
from datetime import datetime, timezone

from ..db import get_conn, heartbeat
from ..news.schema import ensure_news_schema
from ..news.store import insert_item
from .schema import ensure_schema

MIN_PREMIUM = 250_000.0   # $250k notional premium floor
MIN_SCORE = 1.0           # unusual-activity score floor
TOP_N = 6


def _premium(r: dict) -> float:
    return (r.get("vol") or 0) * (r.get("last") or 0.0) * 100.0


def _side_word(side) -> str:
    return "calls" if str(side).upper().startswith("C") else "puts"


def whale_items(rows: list[dict], snap_date: str, ts: str, top_n: int = TOP_N,
                min_premium: float = MIN_PREMIUM, min_score: float = MIN_SCORE) -> list[dict]:
    """Pure: rank unusual rows by premium, build news_items dicts for the top N."""
    cand = [r for r in rows
            if (r.get("score") or 0) >= min_score and _premium(r) >= min_premium]
    cand.sort(key=_premium, reverse=True)
    out = []
    for r in cand[:top_n]:
        prem = _premium(r)
        headline = (f"🐋 {r['symbol']} {_side_word(r['side'])} {r['strike']:g} {r['expiry']} "
                    f"— ${prem / 1e6:.1f}M premium ({int(r['vol']):,} @ ${r['last']:.2f})")
        out.append({
            "ts": ts, "source": "whale", "ticker": r["symbol"], "headline": headline,
            "body": None, "url": None, "tags": None, "is_breaking": 0,
            "dedup_key": f"whale:{snap_date}:{r['symbol']}:{r['contract']}",
        })
    return out


def scan_whales(conn, snap_date: str | None = None, top_n: int = TOP_N,
                min_premium: float = MIN_PREMIUM, min_score: float = MIN_SCORE) -> int:
    ensure_schema(conn)
    ensure_news_schema(conn)
    if snap_date is None:
        row = conn.execute("SELECT MAX(snap_date) AS d FROM unusual_activity").fetchone()
        snap_date = row["d"] if row else None
    if not snap_date:
        return 0
    rows = [dict(r) for r in conn.execute(
        "SELECT symbol,contract,side,expiry,strike,score,vol,last "
        "FROM unusual_activity WHERE snap_date=?", (snap_date,)).fetchall()]
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    items = whale_items(rows, snap_date, ts, top_n, min_premium, min_score)
    return sum(1 for it in items if insert_item(conn, it) is not None)


def main() -> int:
    conn = get_conn()
    try:
        n = scan_whales(conn)
    finally:
        conn.close()
    heartbeat("whale-scan", "ok", f"{n} alerts")
    print(f"whale-scan: {n} alerts")
    return 0


if __name__ == "__main__":
    sys.exit(main())
