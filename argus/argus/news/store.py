"""SQLite access for news_items + news_cursor. All access via argus.db.get_conn."""
from datetime import datetime, timezone
from typing import Optional

_COLS = ("ts", "source", "ticker", "headline", "body", "url", "tags", "is_breaking", "dedup_key")


def insert_item(conn, item: dict) -> Optional[int]:
    """Insert one news item; returns its new id, or None if dedup_key collided."""
    row = {k: item.get(k) for k in _COLS}
    cur = conn.execute(
        "INSERT OR IGNORE INTO news_items (ts,source,ticker,headline,body,url,tags,is_breaking,dedup_key) "
        "VALUES (:ts,:source,:ticker,:headline,:body,:url,:tags,:is_breaking,:dedup_key)", row)
    conn.commit()
    return cur.lastrowid if cur.rowcount else None


def get_cursor(conn, channel_id: str) -> Optional[str]:
    r = conn.execute("SELECT last_message_id FROM news_cursor WHERE channel_id=?",
                     (channel_id,)).fetchone()
    return r["last_message_id"] if r else None


def set_cursor(conn, channel_id: str, last_message_id: str) -> None:
    conn.execute(
        "INSERT INTO news_cursor (channel_id,last_message_id,updated_ts) VALUES (?,?,?) "
        "ON CONFLICT(channel_id) DO UPDATE SET last_message_id=excluded.last_message_id, "
        "updated_ts=excluded.updated_ts",
        (channel_id, str(last_message_id), datetime.now(timezone.utc).isoformat(timespec="seconds")))
    conn.commit()


def fetch_after(conn, after_id: int = 0, limit: int = 200) -> list:
    return conn.execute(
        "SELECT * FROM news_items WHERE id > ? ORDER BY id ASC LIMIT ?",
        (after_id, limit)).fetchall()


def fetch_latest(conn, limit: int = 60) -> list:
    """The newest `limit` items, returned in ASCENDING id order (so a feed that
    reverses for display shows newest-first). The rail's display window — distinct
    from fetch_after's forward cursor pagination."""
    return conn.execute(
        "SELECT * FROM (SELECT * FROM news_items ORDER BY id DESC LIMIT ?) ORDER BY id ASC",
        (limit,)).fetchall()


def fetch_for_ticker(conn, ticker: str, limit: int = 30) -> list:
    return conn.execute(
        "SELECT * FROM news_items WHERE ticker=? ORDER BY id DESC LIMIT ?",
        (ticker.upper(), limit)).fetchall()
