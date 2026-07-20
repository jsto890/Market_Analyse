"""WS-3d morning macro report (master plan §WS-3.5). Assembled entirely from our
own data: macro_sentiment + rail quotes + econ_calendar + news. build_report and
render_markdown are pure (inputs injected) for testability; generate() wires the
DB + rail. Surfaces as the dashboard landing header and is appended to the daily
Obsidian report."""
from datetime import datetime, timedelta

# upper bound (inclusive) → label, ascending
_TONE = [(-0.20, "bearish"), (-0.05, "cautious"), (0.05, "neutral"),
         (0.20, "constructive")]


def tone_label(score: float) -> str:
    for hi, name in _TONE:
        if score <= hi:
            return name
    return "bullish"


def _tone_sentence(us: dict | None, glob: dict | None, today_events: list[dict]) -> str:
    us_s = us["score"] if us else 0.0
    parts = [f"US macro tone reads **{tone_label(us_s)}** ({us_s:+.2f})"]
    if glob:
        parts.append(f"global **{tone_label(glob['score'])}** ({glob['score']:+.2f})")
    sent = "; ".join(parts) + "."
    high = [e for e in today_events if e["importance"] == "high"]
    if high:
        sent += " Watch today: " + ", ".join(e["event"] for e in high) + "."
    return sent


def _earnings_session(time_et: str | None) -> str:
    if not time_et:
        return "—"
    if time_et < "09:30":
        return "BMO"
    return "AMC" if time_et >= "16:00" else "—"


def _day_ahead_earnings(rows: list[dict], watchlist: set[str]) -> list[dict]:
    out = [{**e, "session": _earnings_session(e.get("time_et")),
            "watchlist": (e.get("ticker") or "").upper() in watchlist}
           for e in rows]
    return sorted(out, key=lambda e: not e["watchlist"])  # stable: watchlist first


def _synthesis(futures: list[dict], today_events: list[dict],
               earn_today: list[dict], watchlist: set[str]) -> str:
    parts = []
    by = {q["symbol"]: q["change_pct"] for q in futures}
    if "ES=F" in by:
        parts.append(f"ES {by['ES=F']:+.1f}%")
    if len(by) > 1:
        lag = min(by, key=lambda s: by[s])
        led = max(by, key=lambda s: by[s])
        if led != lag and by[led] - by[lag] >= 0.3:
            parts.append(f"{lag.replace('=F', '')} lagging")
    high = [e for e in today_events if e["importance"] == "high"]
    if high:
        e = high[0]
        parts.append(f"{e['event']} {e['time_et']} ET" if e.get("time_et") else e["event"])
    if earn_today:
        wl = sum(1 for e in earn_today if (e.get("ticker") or "").upper() in watchlist)
        parts.append(f"{len(earn_today)} earnings today" + (f" ({wl} watchlist)" if wl else ""))
    return " · ".join(parts) if parts else "Quiet slate."


def gex_line(spot: float | None, zero_gamma: float | None,
             total_gex: float | None) -> str | None:
    """One-sentence GEX risk read — shared contract with the ODTE Levels verdict."""
    if spot is None or zero_gamma is None or not spot or not zero_gamma:
        return None
    dist = (spot / zero_gamma - 1) * 100
    gex_b = (total_gex or 0) / 1e9
    if spot >= zero_gamma:
        return (f"GEX supportive ({gex_b:+.1f}B, spot {dist:+.1f}% vs zero-gamma) — "
                "dips likely bought")
    return (f"GEX fragile ({gex_b:+.1f}B, spot {dist:+.1f}% below zero-gamma) — "
            "moves extend")


def build_report(now: datetime, gauges: list[dict], events: list[dict],
                 headlines: list[dict], futures: list[dict],
                 watchlist: set[str] | None = None,
                 gex: dict | None = None) -> dict:
    """Pure assembler. gauges = macro_sentiment rows; events = econ_calendar rows
    (chronological); headlines = news rows (any order); futures = [{symbol,change_pct}];
    watchlist = tickers whose earnings rank first in day_ahead."""
    watchlist = {t.upper() for t in (watchlist or set())}
    g = {(x["scope"], x["window"]): x for x in gauges}
    us, glob = g.get(("us", "1d")), g.get(("global", "1d"))
    today = now.strftime("%Y-%m-%d")
    tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")
    today_events = [e for e in events if e["date"] == today]
    earnings = [e for e in events if e.get("category") == "earnings"]
    macro_events = [e for e in events if e.get("category") != "earnings"]
    earn_today = _day_ahead_earnings([e for e in earnings if e["date"] == today], watchlist)
    earn_tomorrow = _day_ahead_earnings([e for e in earnings if e["date"] == tomorrow], watchlist)
    day_ahead = {
        "synthesis": _synthesis(futures, today_events, earn_today, watchlist),
        "earnings_today": earn_today,
        "earnings_tomorrow": earn_tomorrow,
        "gex_line": gex_line(gex.get("spot"), gex.get("zero_gamma"),
                             gex.get("total_gex")) if gex else None,
        "watchlist_news": [
            {"ticker": h["ticker"], "headline": h["headline"]}
            for h in headlines
            if h.get("ticker") and h["ticker"].upper() in watchlist
        ],
    }
    return {
        "day_ahead": day_ahead,
        "date": today,
        "weekday": now.strftime("%A"),
        "tone": _tone_sentence(us, glob, today_events),
        "macro": {"us_1d": us, "global_1d": glob},
        "futures": futures,
        "today_events": today_events,
        "macro_events": macro_events[:6],
        "earnings": earnings[:6],
        "headlines": headlines[:6],
    }


def _fmt_event(e: dict) -> str:
    t = f" {e['time_et']}" if e.get("time_et") else ""
    return f"- {e['date']}{t} _[{e['importance']}]_ {e['event']}"


def render_markdown(r: dict) -> str:
    lines = [f"## Morning Brief — {r['date']} ({r['weekday']})", "", r["tone"], ""]
    da = r.get("day_ahead") or {}
    if da.get("synthesis") and da["synthesis"] != "Quiet slate.":
        lines += [f"**Day ahead:** {da['synthesis']}", ""]
    if da.get("earnings_today"):
        earn = " · ".join(f"{e.get('ticker') or e['event']} {e['session']}"
                          for e in da["earnings_today"])
        lines += [f"**Earnings today:** {earn}", ""]
    if r["futures"]:
        fut = " · ".join(f"{q['symbol']} {q['change_pct']:+.2f}%" for q in r["futures"])
        lines += [f"**Futures:** {fut}", ""]
    if r["macro_events"]:
        lines.append("**What to expect:**")
        lines += [_fmt_event(e) for e in r["macro_events"]]
        lines.append("")
    if r["earnings"]:
        lines.append("**Earnings (tracked):**")
        lines += [f"- {e['date']} {e.get('ticker') or e['event']}" for e in r["earnings"]]
        lines.append("")
    if r["headlines"]:
        lines.append("**Headlines:**")
        lines += [f"- {'🔴 ' if h.get('is_breaking') else ''}"
                  f"{('$' + h['ticker'] + ' ') if h.get('ticker') else ''}{h['headline']}"
                  for h in r["headlines"]]
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def generate(conn=None, now: datetime | None = None) -> dict:
    """Orchestration: read our stores + rail, assemble the report dict."""
    from ..db import get_conn
    from ..macro.schema import ensure_macro_schema
    from ..macro.store import latest_macro
    from ..calendar.schema import ensure_calendar_schema
    from ..calendar.store import upcoming as calendar_upcoming
    from ..news.schema import ensure_news_schema
    from ..news.store import fetch_latest

    own = conn is None
    conn = conn or get_conn()
    now = now or datetime.now()
    try:
        ensure_macro_schema(conn)
        ensure_calendar_schema(conn)
        ensure_news_schema(conn)
        gauges = [dict(r) for r in latest_macro(conn)]
        events = [dict(r) for r in calendar_upcoming(conn, now.strftime("%Y-%m-%d"), 7)]
        # newest headlines first
        headlines = [dict(r) for r in reversed(fetch_latest(conn, 8))]
        futures = _futures_snapshot()
        return build_report(now, gauges, events, headlines, futures,
                            watchlist=_watchlist_tickers(),
                            gex=_gex_snapshot(conn))
    finally:
        if own:
            conn.close()


def _gex_snapshot(conn) -> dict | None:
    """Latest SPY gex_levels row + rail spot for the day-ahead GEX line."""
    try:
        row = conn.execute(
            "SELECT zero_gamma, total_gex FROM gex_levels WHERE symbol='SPY' "
            "ORDER BY date DESC LIMIT 1").fetchone()
        if row is None:
            return None
        from ..data.rail import rail_quotes
        spot = next((q["price"] for q in rail_quotes()["quotes"] if q["symbol"] == "SPY"), None)
        return {"spot": spot, "zero_gamma": row["zero_gamma"], "total_gex": row["total_gex"]}
    except Exception:
        return None


def _watchlist_tickers() -> set[str]:
    """Tickers in the latest bridge CSV — used to rank day-ahead earnings."""
    import csv
    import os
    from pathlib import Path
    base = os.environ.get("BRIDGE_DIR") or str(Path(__file__).resolve().parents[3] / "reports")
    try:
        with open(Path(base) / "bridge_latest.csv", newline="", encoding="utf-8") as fh:
            return {row["ticker"].upper() for row in csv.DictReader(fh) if row.get("ticker")}
    except Exception:
        return set()


def _futures_snapshot() -> list[dict]:
    try:
        from ..data.rail import rail_quotes
        rq = rail_quotes()
        fut = set(rq["groups"].get("futures", []))
        return [{"symbol": q["symbol"], "change_pct": q["change_pct"]}
                for q in rq["quotes"] if q["symbol"] in fut]
    except Exception:
        return []
