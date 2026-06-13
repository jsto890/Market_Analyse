"""Chain snapshotter (master plan WS-1.1).

CLI:  python -m argus.options_intel.snapshot --kind preclose|close

Per symbol: nearest `max_expiries` expirations, strikes within ±20% of spot,
batched INSERT OR REPLACE keyed (snap_date, kind, symbol, expiry, strike, type).
One bad symbol never kills the run. Heartbeat: options-snapshot-<kind>.

Catch-up reality (deviation from master plan §2.4, documented in the plan):
yfinance serves only the CURRENT chain — a missed night cannot be backfilled
the next day. A late same-day run is still valid for that session; the unusual
scorer tolerates gaps by design (own-baseline needs ≥10 non-zero-vol days,
not consecutive days).
"""
import argparse
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..data import get_options_chain, get_quote
from ..db import get_conn, heartbeat
from .schema import ensure_schema
from .universe import snapshot_universe

MONEYNESS_BAND = 0.20


def us_trading_date(now: datetime | None = None) -> str:
    """The US session date this snapshot belongs to (ET calendar date)."""
    et = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    return et.date().isoformat()


def snapshot_symbol(conn, symbol: str, kind: str, snap_date: str,
                    spot: float | None, fetch=get_options_chain,
                    max_expiries: int = 4) -> int:
    first = fetch(symbol)
    if "error" in first:
        return 0
    expiries = list(first.get("expirations") or [])[:max_expiries]
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    def _int(v):
        try:
            return int(v) if v and v == v else 0  # v==v guards NaN
        except (TypeError, ValueError):
            return 0

    rows = []
    for i, exp in enumerate(expiries):
        chain = first if i == 0 and first.get("expiration") == exp else fetch(symbol, exp)
        if "error" in chain:
            continue
        for side, key in (("C", "calls"), ("P", "puts")):
            for r in chain.get(key, []):
                k = r.get("strike")
                if k is None:
                    continue
                if spot and abs(k / spot - 1.0) > MONEYNESS_BAND:
                    continue
                rows.append((snap_date, kind, symbol.upper(), exp, float(k), side,
                             _int(r.get("openInterest")), _int(r.get("volume")),
                             r.get("lastPrice"), r.get("bid"), r.get("ask"),
                             r.get("impliedVolatility"), ts))
    with conn:
        conn.executemany(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return len(rows)


def run(kind: str) -> int:
    conn = get_conn()
    ensure_schema(conn)
    snap_date = us_trading_date()
    universe = snapshot_universe()
    total, failed = 0, []
    for sym in universe:
        try:
            q = get_quote(sym) or {}
            n = snapshot_symbol(conn, sym, kind, snap_date, q.get("price"))
            total += n
            if n == 0:
                failed.append(sym)
        except Exception:
            failed.append(sym)
        time.sleep(0.5)  # be polite to yfinance
    conn.close()
    detail = f"{total} rows, {len(universe)} symbols, {snap_date}"
    if failed:
        detail += f", failed: {','.join(failed[:8])}"
    heartbeat(f"options-snapshot-{kind}", "error" if total == 0 else "ok", detail)
    return 0 if total > 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["preclose", "close"], required=True)
    args = ap.parse_args()
    return run(args.kind)


if __name__ == "__main__":
    sys.exit(main())
