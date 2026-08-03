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


def contributors(items: list[dict], now: datetime, window: str,
                 scope: str, limit: int = 20) -> dict:
    """The articles behind one (scope, window) score, ranked by influence.

    Same decay as compute_aggregates, so `share` sums to 1 across every item in
    the window and each item's `score` × `weight` reconstructs the gauge."""
    secs = WINDOWS[window]
    half_life = secs / 2.0
    scored: list[dict] = []
    wsum = 0.0
    for it in items:
        ts = it.get("ts")
        if ts is None or scope not in it.get("scopes", ()):
            continue
        age = (now - ts).total_seconds()
        if age < 0 or age > secs:
            continue
        w = math.exp(-age / half_life)
        wsum += w
        scored.append({
            "headline": it.get("headline"),
            "ticker": it.get("ticker"),
            "source": it.get("source"),
            "url": it.get("url"),
            "ts": ts.isoformat(timespec="seconds"),
            "score": round(float(it["score"]), 4),
            "weight": round(w, 4),
            "_w": w,
        })
    for row in scored:
        row["share"] = round(row.pop("_w") / wsum, 4) if wsum > 0 else 0.0
    # Rank by how much the item moves the gauge, not by raw sentiment.
    scored.sort(key=lambda r: abs(r["score"] * r["share"]), reverse=True)
    tickers: dict[str, int] = {}
    for row in scored:
        if row["ticker"]:
            tickers[row["ticker"]] = tickers.get(row["ticker"], 0) + 1
    top_tickers = sorted(tickers.items(), key=lambda kv: kv[1], reverse=True)[:12]
    return {
        "scope": scope,
        "window": window,
        "n": len(scored),
        "score": round(sum(r["score"] * r["share"] for r in scored), 4) if wsum > 0 else 0.0,
        "items": scored[:limit],
        "tickers": [{"ticker": t, "n": c} for t, c in top_tickers],
    }


def tile_stats(rows: list[dict], now: datetime, spark_points: int = 20) -> list[dict]:
    """Per-scope latest score plus change over the last hour/day and a sparkline.

    `rows` are chronological (scope, ts, score, n) snapshots for one window."""
    by_scope: dict[str, list[dict]] = {}
    for r in rows:
        by_scope.setdefault(r["scope"], []).append(dict(r))
    out: list[dict] = []
    for scope, series in by_scope.items():
        series.sort(key=lambda r: str(r["ts"]))
        latest = series[-1]

        def _delta(seconds: int):
            cutoff = now - timedelta(seconds=seconds)
            # A window with no observation in it has no change to report. Without
            # this guard the newest point is also its own comparand once the feed
            # goes quiet, so a week-old score renders as "1h → 0.00" — unchanged,
            # rather than unknown.
            latest_ts = _parse_ts(latest["ts"])
            if latest_ts is None or latest_ts <= cutoff:
                return None
            older = [s for s in series if (_parse_ts(s["ts"]) or now) <= cutoff]
            if not older:
                return None
            return round(latest["score"] - older[-1]["score"], 4)

        out.append({
            "scope": scope,
            "score": latest["score"],
            "n": latest["n"],
            "ts": latest["ts"],
            "delta_1h": _delta(3600),
            "delta_1d": _delta(86400),
            "spark": [s["score"] for s in series[-spark_points:]],
        })
    # Biggest movers first; scopes with no comparable history sink to the bottom.
    out.sort(key=lambda t: abs(t["delta_1d"] if t["delta_1d"] is not None else
                               (t["delta_1h"] or 0.0)), reverse=True)
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
