"""Strike ladder for the dashboard /odte/strikes page (dashboard v3 Phase C).

Reads the multi-expiry options_snapshots (already collected by snapshot.py) and
serves per-strike OI/vol/IV plus dealer-signed per-strike GEX and the ATM
straddle expected move. Pure sqlite reads — no network."""
from __future__ import annotations

from datetime import date

from .gex import bs_gamma, DEALER_SIGN, DEFAULT_IV


def _per_strike_gex(spot: float, strike: float, t_years: float,
                    call: dict | None, put: dict | None) -> float:
    total = 0.0
    for side, leg in (("C", call), ("P", put)):
        if not leg or not leg.get("oi"):
            continue
        gamma = bs_gamma(spot, strike, t_years, leg.get("iv") or DEFAULT_IV)
        total += gamma * leg["oi"] * 100 * spot * spot * 0.01 * DEALER_SIGN[side]
    return round(total, 0)


def strike_ladder(conn, symbol: str, spot: float | None,
                  max_expiries: int = 4, band: float = 0.06,
                  today: str | None = None) -> dict | None:
    symbol = symbol.upper()
    today = today or date.today().isoformat()
    snap_row = conn.execute(
        "SELECT MAX(snap_date) AS d FROM options_snapshots WHERE symbol=?",
        (symbol,)).fetchone()
    snap = snap_row["d"] if snap_row else None
    if not snap:
        return None
    expiries = [r["expiry"] for r in conn.execute(
        "SELECT DISTINCT expiry FROM options_snapshots "
        "WHERE symbol=? AND snap_date=? AND kind='close' AND expiry>=? "
        "ORDER BY expiry LIMIT ?", (symbol, snap, today, max_expiries))]
    if not expiries:
        return None

    levels_row = conn.execute(
        "SELECT zero_gamma, call_wall, put_wall, total_gex FROM gex_levels "
        "WHERE symbol=? ORDER BY date DESC LIMIT 1", (symbol,)).fetchone()
    levels = dict(levels_row) if levels_row else None

    out_expiries = []
    for expiry in expiries:
        t_years = max((date.fromisoformat(expiry) - date.fromisoformat(today)).days, 1) / 365.0
        by_strike: dict[float, dict] = {}
        for r in conn.execute(
                "SELECT strike, type, oi, vol, last, iv FROM options_snapshots "
                "WHERE symbol=? AND snap_date=? AND kind='close' AND expiry=? "
                "ORDER BY strike", (symbol, snap, expiry)):
            k = float(r["strike"])
            if spot and band and abs(k / spot - 1.0) > band:
                continue
            leg = {"oi": r["oi"] or 0, "vol": r["vol"] or 0,
                   "last": r["last"], "iv": r["iv"]}
            by_strike.setdefault(k, {})["call" if r["type"] == "C" else "put"] = leg

        rows = []
        for k in sorted(by_strike):
            call, put = by_strike[k].get("call"), by_strike[k].get("put")
            rows.append({
                "strike": k,
                "call": call,
                "put": put,
                "gex": _per_strike_gex(spot, k, t_years, call, put) if spot else 0.0,
            })

        expected_move = None
        if spot and rows:
            atm = min(rows, key=lambda r: abs(r["strike"] - spot))
            c_last = (atm["call"] or {}).get("last")
            p_last = (atm["put"] or {}).get("last")
            if c_last and p_last:
                expected_move = round((c_last + p_last) / spot * 100, 3)

        out_expiries.append({"expiry": expiry, "expected_move_pct": expected_move, "rows": rows})

    return {"symbol": symbol, "snap_date": snap, "spot": spot,
            "levels": levels, "expiries": out_expiries}
