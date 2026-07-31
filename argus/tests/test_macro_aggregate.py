from datetime import datetime, timezone, timedelta
from argus.macro.aggregate import compute_aggregates, contributors, tile_stats, WINDOWS


def _now():
    return datetime(2026, 6, 16, 12, 0, 0, tzinfo=timezone.utc)


def test_windows_defined():
    assert WINDOWS == {"1h": 3600, "1d": 86400, "1w": 604800}


def test_recency_weighting_and_membership():
    now = _now()
    items = [
        {"ts": now - timedelta(minutes=5),  "score": 1.0,  "scopes": {"global", "us"}},
        {"ts": now - timedelta(minutes=50), "score": -1.0, "scopes": {"global"}},
        {"ts": now - timedelta(days=3),     "score": 0.5,  "scopes": {"global"}},
    ]
    out = {(r["scope"], r["window"]): r for r in compute_aggregates(items, now)}
    # 1h/global: both -5m and -50m; recent +1 outweighs older -1 → positive
    assert out[("global", "1h")]["n"] == 2
    assert out[("global", "1h")]["score"] > 0
    # 1h/us: only the -5m item
    assert out[("us", "1h")]["n"] == 1
    assert out[("us", "1h")]["score"] == 1.0
    # 1w/global: all three present; no us row beyond the one item
    assert out[("global", "1w")]["n"] == 3
    assert ("us", "1w") in out and out[("us", "1w")]["n"] == 1


def test_empty_items_yields_no_rows():
    assert compute_aggregates([], _now()) == []


def test_items_with_none_ts_ignored():
    now = _now()
    items = [{"ts": None, "score": 1.0, "scopes": {"global"}}]
    assert compute_aggregates(items, now) == []


def test_contributors_shares_sum_to_one_and_reconstruct_the_gauge():
    now = _now()
    items = [
        {"ts": now - timedelta(minutes=5), "score": 1.0, "scopes": {"global", "us"},
         "headline": "Fed holds", "ticker": None, "source": "rss", "url": "u1"},
        {"ts": now - timedelta(minutes=50), "score": -1.0, "scopes": {"global"},
         "headline": "Selloff", "ticker": "AAPL", "source": "rss", "url": "u2"},
        {"ts": now - timedelta(days=3), "score": 0.5, "scopes": {"global"},
         "headline": "Old", "ticker": None, "source": "rss", "url": "u3"},
    ]
    out = contributors(items, now, "1h", "global")
    assert out["n"] == 2  # the 3-day-old item is outside the 1h window
    assert abs(sum(r["share"] for r in out["items"]) - 1.0) < 1e-3
    gauge = {(r["scope"], r["window"]): r for r in compute_aggregates(items, now)}
    assert abs(out["score"] - gauge[("global", "1h")]["score"]) < 1e-3
    # ranked by influence, so the recent, heavier item leads
    assert out["items"][0]["headline"] == "Fed holds"
    assert out["tickers"] == [{"ticker": "AAPL", "n": 1}]


def test_contributors_filters_to_the_requested_scope():
    now = _now()
    items = [
        {"ts": now - timedelta(minutes=5), "score": 1.0, "scopes": {"global", "us"},
         "headline": "US print", "ticker": None, "source": "rss", "url": None},
        {"ts": now - timedelta(minutes=5), "score": -1.0, "scopes": {"global"},
         "headline": "Elsewhere", "ticker": None, "source": "rss", "url": None},
    ]
    out = contributors(items, now, "1h", "us")
    assert [r["headline"] for r in out["items"]] == ["US print"]


def test_tile_stats_deltas_sparkline_and_mover_ordering():
    now = _now()
    def row(scope, minutes_ago, score):
        ts = (now - timedelta(minutes=minutes_ago)).isoformat(timespec="seconds")
        return {"scope": scope, "ts": ts, "score": score, "n": 3}
    rows = [
        row("global", 1500, 0.00), row("global", 90, 0.02), row("global", 0, 0.03),
        row("us", 1500, 0.40), row("us", 90, 0.10), row("us", 0, 0.05),
    ]
    tiles = {t["scope"]: t for t in tile_stats(rows, now, spark_points=2)}
    assert tiles["us"]["delta_1h"] == -0.05      # vs the 90-minute-old snapshot
    assert tiles["us"]["delta_1d"] == -0.35      # vs the 25-hour-old snapshot
    assert tiles["global"]["spark"] == [0.02, 0.03]
    # biggest absolute mover first
    assert [t["scope"] for t in tile_stats(rows, now)] == ["us", "global"]


def test_tile_stats_reports_none_when_history_is_too_short():
    now = _now()
    rows = [{"scope": "global", "ts": now.isoformat(timespec="seconds"), "score": 0.1, "n": 1}]
    tile = tile_stats(rows, now)[0]
    assert tile["delta_1h"] is None and tile["delta_1d"] is None
    assert tile["spark"] == [0.1]
