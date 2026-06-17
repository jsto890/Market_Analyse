"""SQLite access for macro sentiment. All access via argus.db.get_conn.
news_sentiment caches per-item FinBERT scores; macro_sentiment is append-only
aggregate snapshots."""
from datetime import datetime, timezone


def unscored_news(conn, limit: int = 2000) -> list:
    """news_items with a non-null headline that have no cached score yet."""
    return conn.execute(
        "SELECT n.id, n.ts, n.ticker, n.headline FROM news_items n "
        "LEFT JOIN news_sentiment s ON s.news_id = n.id "
        "WHERE s.news_id IS NULL ORDER BY n.id DESC LIMIT ?", (limit,)).fetchall()


def save_scores(conn, rows: list[tuple]) -> None:
    """rows: [(news_id, score)]."""
    conn.executemany(
        "INSERT OR REPLACE INTO news_sentiment (news_id, score, scored_ts) "
        "VALUES (?, ?, ?)",
        [(nid, score, datetime.now(timezone.utc).isoformat(timespec="seconds"))
         for nid, score in rows])
    conn.commit()


def scored_news_since(conn, since_ts: str) -> list:
    """Scored items with ts >= since_ts, newest first. Joins score + ticker + ts."""
    return conn.execute(
        "SELECT n.id, n.ts, n.ticker, n.headline, s.score FROM news_items n "
        "JOIN news_sentiment s ON s.news_id = n.id "
        "WHERE n.ts >= ? ORDER BY n.id DESC", (since_ts,)).fetchall()


def insert_aggregates(conn, rows: list[dict], ts: str) -> None:
    conn.executemany(
        "INSERT INTO macro_sentiment (scope, window, score, n, ts) VALUES (?,?,?,?,?)",
        [(r["scope"], r["window"], r["score"], r["n"], ts) for r in rows])
    conn.commit()


def latest_macro(conn) -> list:
    """Most recent row per (scope, window) — the gauge values."""
    return conn.execute(
        "SELECT scope, window, score, n, ts FROM macro_sentiment m "
        "WHERE ts = (SELECT MAX(ts) FROM macro_sentiment "
        "            WHERE scope = m.scope AND window = m.window) "
        "ORDER BY scope, window").fetchall()


def macro_series(conn, scope: str, window: str, limit: int = 200) -> list:
    """Time series for one (scope, window), chronological (oldest first)."""
    rows = conn.execute(
        "SELECT ts, score, n FROM macro_sentiment WHERE scope=? AND window=? "
        "ORDER BY ts DESC LIMIT ?", (scope, window, limit)).fetchall()
    return list(reversed(rows))
