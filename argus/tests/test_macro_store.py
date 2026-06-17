from argus.db import get_conn
from argus.macro.schema import ensure_macro_schema
from argus.macro.store import (insert_aggregates, latest_macro, macro_series,
                               save_scores, scored_news_since, unscored_news)
from argus.news.schema import ensure_news_schema
from argus.news.store import insert_item


def _conn(tmp_path):
    conn = get_conn(tmp_path / "t.db")
    ensure_macro_schema(conn)
    return conn


def _news_conn(tmp_path):
    conn = get_conn(tmp_path / "n.db")
    ensure_news_schema(conn)
    ensure_macro_schema(conn)
    return conn


def test_schema_creates_tables(tmp_path):
    conn = _conn(tmp_path)
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert {"news_sentiment", "macro_sentiment"} <= names


def test_unscored_then_save_then_scored(tmp_path):
    conn = _news_conn(tmp_path)
    nid = insert_item(conn, {"ts": "2026-06-16T11:55:00+00:00", "source": "discord",
                             "ticker": "NVDA", "headline": "Nvidia jumps", "body": None,
                             "url": None, "tags": None, "is_breaking": 0, "dedup_key": "d1"})
    assert [r["id"] for r in unscored_news(conn)] == [nid]
    save_scores(conn, [(nid, 0.8)])
    assert unscored_news(conn) == []
    rows = scored_news_since(conn, "2026-06-16T00:00:00+00:00")
    conn.close()
    assert rows[0]["score"] == 0.8 and rows[0]["ticker"] == "NVDA"


def test_insert_and_read_aggregates(tmp_path):
    conn = _news_conn(tmp_path)
    insert_aggregates(conn, [
        {"scope": "global", "window": "1d", "score": 0.2, "n": 5},
        {"scope": "us", "window": "1d", "score": -0.1, "n": 3},
    ], ts="2026-06-16T12:00:00+00:00")
    insert_aggregates(conn, [
        {"scope": "global", "window": "1d", "score": 0.4, "n": 6},
    ], ts="2026-06-16T12:20:00+00:00")
    gauges = {(g["scope"], g["window"]): g for g in latest_macro(conn)}
    series = macro_series(conn, "global", "1d", limit=10)
    conn.close()
    # latest_macro returns the most recent ts per (scope,window)
    assert gauges[("global", "1d")]["score"] == 0.4
    assert gauges[("us", "1d")]["score"] == -0.1
    # series is chronological (oldest first) for charting
    assert [round(p["score"], 1) for p in series] == [0.2, 0.4]
