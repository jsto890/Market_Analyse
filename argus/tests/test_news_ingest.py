from types import SimpleNamespace
from datetime import datetime, timezone

from argus.db import get_conn
from argus.news.schema import ensure_news_schema
from argus.news.store import get_cursor
from argus.news.ingest import to_news_item, store_message


def _msg(mid, content, chan="123", ts=None):
    return SimpleNamespace(
        id=mid, content=content,
        channel=SimpleNamespace(id=chan),
        created_at=ts or datetime(2026, 6, 16, tzinfo=timezone.utc),
        jump_url=f"https://discord.com/channels/x/{chan}/{mid}")


def test_to_news_item_extracts_cashtag_and_breaking():
    it = to_news_item(_msg(1, "BREAKING: $AAPL halted after 12% drop"))
    assert it["source"] == "discord"
    assert it["ticker"] == "AAPL"
    assert it["is_breaking"] == 1
    assert it["headline"].startswith("BREAKING")
    assert it["dedup_key"] == "discord:1"
    assert it["url"].endswith("/1")


def test_to_news_item_plain_no_ticker():
    it = to_news_item(_msg(2, "Fed minutes show split on cuts"))
    assert it["ticker"] is None and it["is_breaking"] == 0


def test_to_news_item_skips_empty():
    assert to_news_item(_msg(3, "   ")) is None


def test_store_message_inserts_and_advances_cursor(tmp_path):
    conn = get_conn(tmp_path / "t.db"); ensure_news_schema(conn)
    assert store_message(conn, _msg(1001, "$NVDA breaks out")) is True
    assert store_message(conn, _msg(1001, "$NVDA breaks out")) is False
    n = conn.execute("SELECT COUNT(*) FROM news_items").fetchone()[0]
    cur = get_cursor(conn, "123")
    conn.close()
    assert n == 1
    assert cur == "1001"
