from argus.db import get_conn
from argus.news.schema import ensure_news_schema
from argus.news.store import insert_item, get_cursor, set_cursor, fetch_after, fetch_for_ticker


def _conn(tmp_path):
    conn = get_conn(tmp_path / "t.db")
    ensure_news_schema(conn)
    return conn


def test_insert_dedup_returns_id_or_none(tmp_path):
    conn = _conn(tmp_path)
    item = {"ts": "2026-06-16T00:00:00Z", "source": "discord", "headline": "Fed holds rates",
            "ticker": None, "body": None, "url": "u", "is_breaking": 0, "dedup_key": "msg-1"}
    first = insert_item(conn, item)
    dup = insert_item(conn, item)
    conn.close()
    assert isinstance(first, int) and first > 0
    assert dup is None


def test_cursor_roundtrip(tmp_path):
    conn = _conn(tmp_path)
    assert get_cursor(conn, "chan-1") is None
    set_cursor(conn, "chan-1", "111")
    set_cursor(conn, "chan-1", "222")
    got = get_cursor(conn, "chan-1")
    conn.close()
    assert got == "222"


def test_fetch_after_and_for_ticker(tmp_path):
    conn = _conn(tmp_path)
    for i, (tk, hl) in enumerate([(None, "macro a"), ("AAPL", "aapl b"), (None, "macro c")]):
        insert_item(conn, {"ts": f"2026-06-16T00:0{i}:00Z", "source": "discord", "headline": hl,
                           "ticker": tk, "body": None, "url": None, "is_breaking": 0,
                           "dedup_key": f"m{i}"})
    after0 = fetch_after(conn, after_id=0, limit=10)
    after1 = fetch_after(conn, after_id=1, limit=10)
    aapl = fetch_for_ticker(conn, "AAPL", limit=10)
    conn.close()
    assert [r["headline"] for r in after0] == ["macro a", "aapl b", "macro c"]
    assert [r["id"] for r in after1] == [2, 3]
    assert [r["headline"] for r in aapl] == ["aapl b"]
