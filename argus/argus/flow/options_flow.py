"""Flow Intelligence — options flow proxy.

REAL options-flow products license vendor data (Cboe, etc.) for
sweep/block/print detection. Without that, we approximate flow signals
from the static end-of-day chain via yfinance:

  - Put/Call OI Ratio          (positioning bias)
  - Put/Call Volume Ratio      (today's positioning bias)
  - Volume / OI Ratio          (fresh positioning vs. stale)
  - IV Skew                    (calls vs puts ATM-ish IV)
  - Max Pain                   (strike where OI is most concentrated)

If you have a paid feed (Polygon options, Tradier, etc.), drop in a
new source here and keep the same return schema.
"""
from __future__ import annotations
from typing import Optional
import pandas as pd
import numpy as np

from ..data import get_options_chain, get_quote
from ..db import get_conn
from ..options_intel.clock import us_market_open


def _max_pain(calls: pd.DataFrame, puts: pd.DataFrame) -> float:
    strikes = sorted(set(calls["strike"]) | set(puts["strike"]))
    pains = []
    for k in strikes:
        call_pain = ((calls["strike"] < k) * (k - calls["strike"]) * calls["openInterest"]).sum()
        put_pain = ((puts["strike"] > k) * (puts["strike"] - k) * puts["openInterest"]).sum()
        pains.append((k, call_pain + put_pain))
    return float(min(pains, key=lambda x: x[1])[0])


def flow_summary(symbol: str, expiration: Optional[str] = None) -> dict:
    chain = get_options_chain(symbol, expiration)
    if "error" in chain:
        return chain
    calls = pd.DataFrame(chain["calls"])
    puts = pd.DataFrame(chain["puts"])

    quote = get_quote(symbol) or {}
    spot = quote.get("price", float("nan"))

    # ATM IV
    if not np.isnan(spot):
        atm_call = calls.iloc[(calls["strike"] - spot).abs().argsort()[:1]] if not calls.empty else None
        atm_put = puts.iloc[(puts["strike"] - spot).abs().argsort()[:1]] if not puts.empty else None
        iv_call = float(atm_call["impliedVolatility"].iloc[0]) if atm_call is not None and len(atm_call) else None
        iv_put = float(atm_put["impliedVolatility"].iloc[0]) if atm_put is not None and len(atm_put) else None
    else:
        iv_call = iv_put = None

    s = chain["summary"]
    flags = []
    if s["pcr_vol"] > 1.5:
        flags.append("HEAVY PUT VOLUME (defensive bias)")
    elif s["pcr_vol"] < 0.6:
        flags.append("HEAVY CALL VOLUME (bullish bias)")
    if s["pcr_oi"] > 1.3:
        flags.append("PUT-HEAVY POSITIONING")
    elif s["pcr_oi"] < 0.7:
        flags.append("CALL-HEAVY POSITIONING")
    if iv_call and iv_put:
        skew = iv_put - iv_call
        if skew > 0.05:
            flags.append("PUT SKEW (downside fear bid)")
        elif skew < -0.05:
            flags.append("CALL SKEW (upside chase)")

    try:
        max_pain = _max_pain(calls, puts) if not calls.empty and not puts.empty else None
    except Exception:
        max_pain = None

    # "Unusual" volume check: vol > OI (fresh positioning)
    unusual_calls = calls[calls["volume"].fillna(0) > calls["openInterest"].fillna(1) * 2]
    unusual_puts = puts[puts["volume"].fillna(0) > puts["openInterest"].fillna(1) * 2]

    # Closed-market fallback (B6 completion): live same-day volume is meaningless
    # overnight — serve the latest SCORED close snapshot instead, labelled.
    scored_as_of = None
    unusual_calls_records = None
    unusual_puts_records = None
    if not us_market_open():
        conn = None
        try:
            conn = get_conn()
            latest = conn.execute(
                "SELECT MAX(snap_date) AS d FROM unusual_activity WHERE symbol=?",
                (symbol.upper(),)).fetchone()
            if latest and latest["d"]:
                rows = conn.execute(
                    "SELECT * FROM unusual_activity WHERE symbol=? AND snap_date=? "
                    "ORDER BY score DESC", (symbol.upper(), latest["d"])).fetchall()
                if rows:
                    scored_as_of = latest["d"]
                    to_rec = lambda r: {
                        "strike": r["strike"], "expiry": r["expiry"],
                        "volume": r["vol"], "openInterest": r["oi"],
                        "lastPrice": r["last"], "score": r["score"], "basis": r["basis"]}
                    unusual_calls_records = [to_rec(r) for r in rows if r["side"] == "C"][:5]
                    unusual_puts_records = [to_rec(r) for r in rows if r["side"] == "P"][:5]
        except Exception:
            scored_as_of = None  # never break the panel — fall through to live lists
        finally:
            if conn is not None:
                conn.close()

    return {
        "symbol": symbol.upper(),
        "expiration": chain["expiration"],
        "spot": spot,
        "summary": s,
        "iv_atm_call": iv_call,
        "iv_atm_put": iv_put,
        "iv_skew": (iv_put - iv_call) if iv_call and iv_put else None,
        "max_pain": max_pain,
        "flags": flags,
        "unusual_calls_top": unusual_calls_records if scored_as_of is not None
            else unusual_calls.sort_values("volume", ascending=False).head(5).to_dict("records"),
        "unusual_puts_top": unusual_puts_records if scored_as_of is not None
            else unusual_puts.sort_values("volume", ascending=False).head(5).to_dict("records"),
        "unusual_as_of": scored_as_of,
        "disclaimer": "Free EOD chain — not real-time tape. For sweeps/blocks use a vendor feed.",
    }
