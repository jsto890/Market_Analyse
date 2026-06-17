"""WS-3d morning macro report (master plan §WS-3.5). Assembled entirely from our
own data: macro_sentiment + rail quotes + econ_calendar + news. build_report and
render_markdown are pure (inputs injected) for testability; generate() wires the
DB + rail. Surfaces as the dashboard landing header and is appended to the daily
Obsidian report."""
from datetime import datetime

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


def build_report(now: datetime, gauges: list[dict], events: list[dict],
                 headlines: list[dict], futures: list[dict]) -> dict:
    """Pure assembler. gauges = macro_sentiment rows; events = econ_calendar rows
    (chronological); headlines = news rows (any order); futures = [{symbol,change_pct}]."""
    g = {(x["scope"], x["window"]): x for x in gauges}
    us, glob = g.get(("us", "1d")), g.get(("global", "1d"))
    today = now.strftime("%Y-%m-%d")
    today_events = [e for e in events if e["date"] == today]
    earnings = [e for e in events if e.get("category") == "earnings"]
    macro_events = [e for e in events if e.get("category") != "earnings"]
    return {
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
        return build_report(now, gauges, events, headlines, futures)
    finally:
        if own:
            conn.close()


def _futures_snapshot() -> list[dict]:
    try:
        from ..data.rail import rail_quotes
        rq = rail_quotes()
        fut = set(rq["groups"].get("futures", []))
        return [{"symbol": q["symbol"], "change_pct": q["change_pct"]}
                for q in rq["quotes"] if q["symbol"] in fut]
    except Exception:
        return []
