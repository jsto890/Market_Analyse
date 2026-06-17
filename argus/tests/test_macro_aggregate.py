from datetime import datetime, timezone, timedelta
from argus.macro.aggregate import compute_aggregates, WINDOWS


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
