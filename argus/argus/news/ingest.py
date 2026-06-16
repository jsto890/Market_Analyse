# argus/argus/news/ingest.py
"""Discord news ingest (master plan §WS-3.1) — reuses discord_copytrade's discord.py-self
auth pattern. A persistent gateway service: on_ready backfills each channel since its stored
cursor, on_message stores live. The pure to_news_item() mapper + store_message() carry the
testable logic; the discord.Client shell is exercised live at integration (user's token).

Run (controller/launchd):  python -m argus.news.ingest
Secret: DISCORD_USER_TOKEN read from env only — never printed/logged.
"""
import os
import re
import sys

from ..db import get_conn, heartbeat
from .schema import ensure_news_schema
from .store import insert_item, set_cursor, get_cursor

_CASHTAG = re.compile(r"\$([A-Za-z]{1,6})\b")
_BREAKING = re.compile(r"\bBREAKING\b|\bJUST IN\b|\bURGENT\b", re.IGNORECASE)


def to_news_item(msg) -> dict | None:
    """Pure: map a discord.Message-like object to a news_items row dict. None if empty."""
    text = (getattr(msg, "content", "") or "").strip()
    if not text:
        return None
    cash = _CASHTAG.search(text)
    ts = getattr(msg, "created_at", None)
    return {
        "ts": ts.isoformat() if ts is not None else None,
        "source": "discord",
        "ticker": cash.group(1).upper() if cash else None,
        "headline": text.splitlines()[0][:500],
        "body": text if "\n" in text else None,
        "url": getattr(msg, "jump_url", None),
        "tags": None,
        "is_breaking": 1 if _BREAKING.search(text) else 0,
        "dedup_key": f"discord:{getattr(msg, 'id', '')}",
    }


def store_message(conn, msg) -> bool:
    """Insert the message (dedup) and advance its channel cursor. True if a new row landed."""
    item = to_news_item(msg)
    if item is None:
        return False
    new_id = insert_item(conn, item)
    chan = str(getattr(getattr(msg, "channel", None), "id", ""))
    if chan:
        set_cursor(conn, chan, str(getattr(msg, "id", "")))
    return new_id is not None


def _channel_ids() -> list[str]:
    ids = [os.environ.get("DISCORD_NEWS_CHANNEL_ID", "").strip()]
    return [c for c in ids if c]


def run() -> int:
    import discord  # discord.py-self

    token = os.environ.get("DISCORD_USER_TOKEN")
    if not token:
        heartbeat("news-ingest", "error", "DISCORD_USER_TOKEN not set")
        return 2
    channels = _channel_ids()

    class NewsClient(discord.Client):
        async def on_ready(self):
            conn = get_conn(); ensure_news_schema(conn)
            total = 0
            try:
                for cid in channels:
                    ch = self.get_channel(int(cid))
                    if ch is None:
                        continue
                    after_id = get_cursor(conn, cid)
                    kwargs = {"limit": 200, "oldest_first": True}
                    if after_id:
                        kwargs["after"] = discord.Object(id=int(after_id))
                    async for m in ch.history(**kwargs):
                        if store_message(conn, m):
                            total += 1
            finally:
                conn.close()
            heartbeat("news-ingest", "ok", f"backfill {total} items, {len(channels)} channels")

        async def on_message(self, message):
            if str(message.channel.id) not in channels:
                return
            conn = get_conn(); ensure_news_schema(conn)
            try:
                store_message(conn, message)
            finally:
                conn.close()

    NewsClient().run(token)
    return 0


def main() -> int:
    return run()


if __name__ == "__main__":
    sys.exit(main())
