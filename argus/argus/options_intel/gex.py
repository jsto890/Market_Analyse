"""GEX engine (master plan WS-1.5, quant-corrected formula).

DEALER-SIGN CONVENTION (assumption, not a fact — SpotGamma-style
"customers buy calls and puts from dealers"):

    | side | dealer position | sign in GEX sum |
    |------|-----------------|-----------------|
    | call | short           | -1              |
    | put  | short           | +1              |

The levels card must state "model assumes dealer positioning; levels are
estimates, not measurements". OI-based GEX is valid only for DTE >= 1 —
the profile uses the nearest expiry with DTE >= 1 and the UI labels it
"OI-based — reflects overnight book, not today's flow".

CLI:  python -m argus.options_intel.gex   (computes for SPY/QQQ/IWM/DIA)
"""
import json
import math
import sys
from datetime import date, datetime, timezone

from scipy.stats import norm

from ..db import get_conn, heartbeat
from .schema import ensure_schema
from .universe import INDEX_UNDERLYINGS

DEALER_SIGN = {"C": -1.0, "P": +1.0}
SWEEP_PCT = 0.15
SWEEP_POINTS = 61
DEFAULT_IV = 0.20


def bs_gamma(s: float, k: float, t: float, sigma: float) -> float:
    if s <= 0 or k <= 0 or t <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(s / k) + 0.5 * sigma * sigma * t) / (sigma * math.sqrt(t))
    return float(norm.pdf(d1) / (s * sigma * math.sqrt(t)))


def _nearest_eligible_expiry(conn, symbol: str, snap_date: str, today: str) -> str | None:
    rows = conn.execute(
        "SELECT DISTINCT expiry FROM options_snapshots "
        "WHERE symbol=? AND snap_date=? AND kind='close' ORDER BY expiry",
        (symbol, snap_date)).fetchall()
    for r in rows:
        dte = (date.fromisoformat(r["expiry"]) - date.fromisoformat(today)).days
        if dte >= 1:
            return r["expiry"]
    return None


def compute_gex(conn, symbol: str, snap_date: str, spot: float | None,
                today: str | None = None) -> dict | None:
    today = today or date.today().isoformat()
    if not spot:
        return None
    expiry = _nearest_eligible_expiry(conn, symbol, snap_date, today)
    if not expiry:
        return None
    rows = conn.execute(
        "SELECT strike, type, oi, iv FROM options_snapshots "
        "WHERE symbol=? AND snap_date=? AND kind='close' AND expiry=? AND oi>0",
        (symbol, snap_date, expiry)).fetchall()
    if not rows:
        return None
    t_years = max((date.fromisoformat(expiry) - date.fromisoformat(today)).days, 1) / 365.0

    spots = [spot * (1 - SWEEP_PCT + 2 * SWEEP_PCT * i / (SWEEP_POINTS - 1))
             for i in range(SWEEP_POINTS)]
    gex_curve = []
    for sp in spots:
        total = 0.0
        for r in rows:
            iv = r["iv"] if r["iv"] and r["iv"] > 0 else DEFAULT_IV
            total += (bs_gamma(sp, r["strike"], t_years, iv) * (r["oi"] or 0)
                      * 100 * sp * sp * 0.01 * DEALER_SIGN[r["type"]])
        gex_curve.append(total)

    zero = None
    for i in range(1, len(spots)):
        a, b = gex_curve[i - 1], gex_curve[i]
        if a == 0 or (a < 0) != (b < 0):
            zero = spots[i - 1] if b == a else spots[i - 1] + (spots[i] - spots[i - 1]) * (-a) / (b - a)
            break

    def wall(side: str) -> float | None:
        best, best_v = None, -1.0
        for r in rows:
            if r["type"] != side:
                continue
            iv = r["iv"] if r["iv"] and r["iv"] > 0 else DEFAULT_IV
            v = abs(bs_gamma(spot, r["strike"], t_years, iv) * (r["oi"] or 0))
            if v > best_v:
                best, best_v = r["strike"], v
        return best

    mid = SWEEP_POINTS // 2
    out = {"date": snap_date, "symbol": symbol, "expiry": expiry,
           "zero_gamma": round(zero, 2) if zero is not None else None,
           "call_wall": wall("C"), "put_wall": wall("P"),
           "total_gex": round(gex_curve[mid], 0),
           "profile_json": json.dumps({"spots": [round(s, 2) for s in spots],
                                       "gex": [round(g, 0) for g in gex_curve]})}
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO gex_levels "
            "(date,symbol,expiry,zero_gamma,call_wall,put_wall,total_gex,profile_json) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (out["date"], out["symbol"], out["expiry"], out["zero_gamma"],
             out["call_wall"], out["put_wall"], out["total_gex"], out["profile_json"]))
    return out


def main() -> int:
    from ..data import get_quote
    conn = get_conn()
    ensure_schema(conn)
    latest = conn.execute(
        "SELECT MAX(snap_date) AS d FROM options_snapshots WHERE kind='close'").fetchone()
    if not latest or not latest["d"]:
        heartbeat("options-gex", "error", "no close snapshots")
        conn.close()
        return 1
    done = []
    for sym in INDEX_UNDERLYINGS:
        q = get_quote(sym) or {}
        if compute_gex(conn, sym, latest["d"], q.get("price")):
            done.append(sym)
    conn.close()
    heartbeat("options-gex", "ok" if done else "error",
              f"levels for {','.join(done) or 'none'} @ {latest['d']}")
    return 0 if done else 1


if __name__ == "__main__":
    sys.exit(main())
