"""Relative-unusual scorer (master plan WS-1.2, quant-adopted design).

Replaces the naive vol>2×OI filter. Run after the close snapshot:
    python -m argus.options_intel.unusual
"""
import math
import statistics
import sys
from datetime import datetime, timezone

from ..db import get_conn, heartbeat
from .schema import ensure_schema

MIN_OI = 50
MONEYNESS_NEIGHBOURHOOD = 0.02
MIN_BASELINE_DAYS = 10
SCORE_FLOOR = 2.0
PERSIST_THRESHOLD = 3.0
TOP_N = 15


def robust_z(value: float, baseline: list[float]) -> float | None:
    if len(baseline) < 3:
        return None
    med = statistics.median(baseline)
    mad = statistics.median(abs(x - med) for x in baseline)
    scale = 1.4826 * mad
    if scale == 0:
        scale = statistics.stdev(baseline)
    if scale == 0:
        return None
    return (value - med) / scale


def _contract(symbol, expiry, strike, side) -> str:
    return f"{symbol} {expiry} {strike:g}{side}"


def score_symbol(conn, symbol: str, snap_date: str, spot: float | None) -> int:
    rows = conn.execute(
        "SELECT * FROM options_snapshots WHERE symbol=? AND snap_date=? AND kind='close'",
        (symbol, snap_date)).fetchall()
    if not rows or not spot:
        return 0
    eligible = [r for r in rows if (r["oi"] or 0) >= MIN_OI]
    scored = []
    for r in eligible:
        metric = math.log1p(r["vol"] or 0)
        mny = r["strike"] / spot
        neighbours = [math.log1p(n["vol"] or 0) for n in eligible
                      if n["expiry"] == r["expiry"] and n["type"] == r["type"]
                      and n["strike"] != r["strike"]
                      and abs(n["strike"] / spot - mny) <= MONEYNESS_NEIGHBOURHOOD]
        cross = robust_z(metric, neighbours)
        hist = [math.log1p(h["vol"]) for h in conn.execute(
            "SELECT vol FROM options_snapshots WHERE symbol=? AND expiry=? AND strike=? "
            "AND type=? AND kind='close' AND snap_date<? AND vol>0 ORDER BY snap_date",
            (symbol, r["expiry"], r["strike"], r["type"], snap_date)).fetchall()]
        own = robust_z(metric, hist) if len(hist) >= MIN_BASELINE_DAYS else None
        terms = [t for t in (cross, own) if t is not None]
        if not terms:
            continue
        score = max(terms)
        contract = _contract(symbol, r["expiry"], r["strike"], r["type"])
        prev = conn.execute(
            "SELECT score FROM unusual_activity WHERE symbol=? AND contract=? "
            "AND snap_date<? ORDER BY snap_date DESC LIMIT 1",
            (symbol, contract, snap_date)).fetchone()
        persistence = 1 if prev and prev["score"] >= PERSIST_THRESHOLD else 0
        score += 0.5 * persistence
        if score < SCORE_FLOOR:
            continue
        parts = []
        parts.append(f"{cross:.1f} robust-σ vs similar-moneyness strikes" if cross is not None
                     else "degenerate neighbour baseline")
        parts.append(f"{own:.1f}σ vs own {len(hist)}-day baseline" if own is not None
                     else "insufficient history for own-baseline")
        if persistence:
            parts.append("2nd day")
        scored.append((r, score, cross, own, persistence, contract, "; ".join(parts)))

    scored.sort(key=lambda t: t[1], reverse=True)
    kept, per_side = [], {"C": 0, "P": 0}
    for t in scored:
        side = t[0]["type"]
        if per_side[side] < TOP_N:
            kept.append(t)
            per_side[side] += 1
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with conn:
        conn.execute("DELETE FROM unusual_activity WHERE symbol=? AND snap_date=?",
                     (symbol, snap_date))
        conn.executemany(
            "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,strike,"
            "score,cross_z,own_z,persistence,vol,oi,last,basis,ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(snap_date, symbol, c, r["type"], r["expiry"], r["strike"],
              round(s, 2), round(cz, 2) if cz is not None else None,
              round(oz, 2) if oz is not None else None,
              p, r["vol"], r["oi"], r["last"], basis, ts)
             for (r, s, cz, oz, p, c, basis) in kept])
    return len(kept)


def main() -> int:
    from ..data import get_quote
    conn = get_conn()
    ensure_schema(conn)
    latest = conn.execute(
        "SELECT MAX(snap_date) AS d FROM options_snapshots WHERE kind='close'").fetchone()
    if not latest or not latest["d"]:
        heartbeat("options-unusual", "error", "no close snapshots to score")
        conn.close()
        return 1
    snap_date = latest["d"]
    symbols = [r["symbol"] for r in conn.execute(
        "SELECT DISTINCT symbol FROM options_snapshots WHERE snap_date=? AND kind='close'",
        (snap_date,)).fetchall()]
    total = 0
    for sym in symbols:
        q = get_quote(sym) or {}
        total += score_symbol(conn, sym, snap_date, q.get("price"))
    conn.close()
    heartbeat("options-unusual", "ok", f"{total} rows, {len(symbols)} symbols, {snap_date}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
