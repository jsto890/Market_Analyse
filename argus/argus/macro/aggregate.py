"""Recency-weighted scope aggregation (master plan §WS-3.3).

compute_aggregates() is pure: given scored, scope-tagged items and a clock, it
produces one (scope, window, score, n) row per scope present in each window.
Weight decays exponentially with age; the half-life is half the window, so the
most recent prints dominate without older context being dropped abruptly."""
import math
from datetime import datetime, timedelta, timezone

from ..db import get_conn, heartbeat
from .finbert import score_batch
from .schema import ensure_macro_schema
from .scope import scopes_for
from . import store as _store

WINDOWS = {"1h": 3600, "1d": 86400, "1w": 604800}


def compute_aggregates(items: list[dict], now: datetime) -> list[dict]:
    """items: [{"ts": datetime|None, "score": float, "scopes": set[str]}]."""
    out: list[dict] = []
    for window, secs in WINDOWS.items():
        half_life = secs / 2.0
        # accumulate weighted sums per scope
        wsum: dict[str, float] = {}
        vsum: dict[str, float] = {}
        cnt: dict[str, int] = {}
        for it in items:
            ts = it.get("ts")
            if ts is None:
                continue
            age = (now - ts).total_seconds()
            if age < 0 or age > secs:
                continue
            w = math.exp(-age / half_life)
            for scope in it.get("scopes", ()):
                wsum[scope] = wsum.get(scope, 0.0) + w
                vsum[scope] = vsum.get(scope, 0.0) + w * it["score"]
                cnt[scope] = cnt.get(scope, 0) + 1
        for scope, ws in wsum.items():
            if ws <= 0:
                continue
            out.append({
                "scope": scope,
                "window": window,
                "score": round(vsum[scope] / ws, 4),
                "n": cnt[scope],
            })
    return out


def _parse_ts(raw):
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def run_aggregation(conn=None, now: datetime | None = None) -> dict:
    """Score new headlines, aggregate the last week into macro_sentiment.
    Returns a small summary dict for the heartbeat."""
    own = conn is None
    conn = conn or get_conn()
    now = now or datetime.now(timezone.utc)
    try:
        ensure_macro_schema(conn)
        # 1. score any un-scored headlines (FinBERT only on the new ones).
        todo = _store.unscored_news(conn)
        if todo:
            scores = score_batch([r["headline"] for r in todo])
            _store.save_scores(conn, [(r["id"], sc) for r, sc in zip(todo, scores)])
        # 2. pull the last week of scored items, tag scopes, aggregate.
        since = (now - timedelta(seconds=WINDOWS["1w"])).isoformat(timespec="seconds")
        rows = _store.scored_news_since(conn, since)
        items = [{"ts": _parse_ts(r["ts"]), "score": r["score"],
                  "scopes": scopes_for(r["ticker"], r["headline"])} for r in rows]
        aggs = compute_aggregates(items, now)
        if aggs:
            _store.insert_aggregates(conn, aggs, ts=now.isoformat(timespec="seconds"))
        summary = {"scored": len(todo), "items": len(items), "aggregates": len(aggs)}
    finally:
        if own:
            conn.close()
    heartbeat("macro-aggregate", "ok",
              f"scored {summary['scored']}, {summary['aggregates']} aggregates")
    return summary
