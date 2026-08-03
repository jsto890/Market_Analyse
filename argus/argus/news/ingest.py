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
import threading
import time

from ..db import get_conn, heartbeat
from .schema import ensure_news_schema
from .store import insert_item, set_cursor, get_cursor

_CASHTAG = re.compile(r"\$([A-Za-z]{1,6})\b")
_BREAKING = re.compile(r"\bBREAKING\b|\bJUST IN\b|\bURGENT\b", re.IGNORECASE)

# A gateway that connects but never reaches READY reconnects forever without ever
# exiting, so launchd's KeepAlive — which only fires on exit — cannot restart it.
# That is how this daemon sat live-locked for seven days on one invocation while
# its heartbeat, written only from on_ready, kept reporting the last good run.
_READY_TIMEOUT = int(os.environ.get("NEWS_INGEST_READY_TIMEOUT", "300"))
_DISCONNECT_LIMIT = int(os.environ.get("NEWS_INGEST_DISCONNECT_LIMIT", "10"))
_BEAT_INTERVAL = int(os.environ.get("NEWS_INGEST_BEAT_INTERVAL", "600"))


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

    state = {"ready": False, "disconnects": 0, "items": 0}

    def _die(detail: str, code: int) -> None:
        heartbeat("news-ingest", "error", detail)
        print(f"[news-ingest] {detail}", file=sys.stderr)
        # discord.py-self owns the event loop and swallows anything raised from a
        # callback, so leaving the process is the only way out of a wedged gateway.
        # KeepAlive restarts us after ThrottleInterval.
        os._exit(code)

    def _ready_watchdog() -> None:
        time.sleep(_READY_TIMEOUT)
        if not state["ready"]:
            _die(f"gateway never reached READY within {_READY_TIMEOUT}s", 3)

    def _beat() -> None:
        # Without this the heartbeat only advances on connect, so an idle-but-healthy
        # feed is indistinguishable from a dead one and last_run_ts means nothing.
        while True:
            time.sleep(_BEAT_INTERVAL)
            if state["ready"]:
                heartbeat("news-ingest", "ok",
                          f"connected, {state['items']} items this session")

    threading.Thread(target=_ready_watchdog, daemon=True).start()
    threading.Thread(target=_beat, daemon=True).start()

    class NewsClient(discord.Client):
        async def on_disconnect(self):
            state["disconnects"] += 1
            if state["disconnects"] >= _DISCONNECT_LIMIT:
                _die(f"{state['disconnects']} consecutive gateway disconnects "
                     "with no resume", 4)

        async def on_resumed(self):
            state["disconnects"] = 0

        async def on_ready(self):
            state["ready"] = True
            state["disconnects"] = 0
            conn = get_conn(); ensure_news_schema(conn)
            total = 0
            try:
                for cid in channels:
                    ch = self.get_channel(int(cid))
                    if ch is None:
                        continue
                    after_id = get_cursor(conn, cid)
                    if after_id:
                        # Resuming: process everything since the cursor, in order.
                        kwargs = {"limit": 500, "oldest_first": True,
                                  "after": discord.Object(id=int(after_id))}
                    else:
                        # Fresh: grab the MOST RECENT messages (newest-first), not the
                        # channel's oldest history — a news feed wants the recent window.
                        kwargs = {"limit": 200}
                    async for m in ch.history(**kwargs):
                        if store_message(conn, m):
                            total += 1
            finally:
                conn.close()
            state["items"] += total
            heartbeat("news-ingest", "ok", f"backfill {total} items, {len(channels)} channels")

        async def on_message(self, message):
            if str(message.channel.id) not in channels:
                return
            conn = get_conn(); ensure_news_schema(conn)
            try:
                if store_message(conn, message):
                    state["items"] += 1
            finally:
                conn.close()

    NewsClient().run(token)
    # run() returning at all means the gateway gave up; a persistent daemon exiting
    # zero would leave the dashboard's last heartbeat reading ok forever.
    heartbeat("news-ingest", "error", "gateway client exited")
    return 5


def main() -> int:
    return run()


if __name__ == "__main__":
    sys.exit(main())
