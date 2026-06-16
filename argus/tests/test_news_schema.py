from argus.db import get_conn
from argus.news.schema import ensure_news_schema


def test_schema_creates_tables_idempotent(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_news_schema(conn)
    ensure_news_schema(conn)  # idempotent
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"news_items", "news_cursor"} <= names


def test_news_items_autoincrement_id(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_news_schema(conn)
    with conn:
        conn.execute("INSERT INTO news_items (ts,source,headline) VALUES ('2026-06-16T00:00:00Z','discord','a')")
        conn.execute("INSERT INTO news_items (ts,source,headline) VALUES ('2026-06-16T00:01:00Z','discord','b')")
    ids = [r["id"] for r in conn.execute("SELECT id FROM news_items ORDER BY id").fetchall()]
    conn.close()
    assert ids == [1, 2]


def test_news_items_dedup_unique(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_news_schema(conn)
    with conn:
        conn.execute("INSERT OR IGNORE INTO news_items (ts,source,headline,dedup_key) "
                     "VALUES ('2026-06-16T00:00:00Z','discord','a','k1')")
        conn.execute("INSERT OR IGNORE INTO news_items (ts,source,headline,dedup_key) "
                     "VALUES ('2026-06-16T00:00:00Z','discord','a','k1')")
    n = conn.execute("SELECT COUNT(*) FROM news_items").fetchone()[0]
    conn.close()
    assert n == 1
