# Phase C / WS-3a: News Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. UI tasks get a Playwright check. Steps use checkbox (`- [ ]`) syntax.
>
> **Binding rules:** master plan §4.1 + §WS-3 + §2.2/§2.3. Scope: files listed per task. Out-of-scope discoveries reported, never fixed. No `sudo`/`launchctl`; the persistent ingest service's launchd install + live Discord connection are controller/user integration steps. **Secrets rule (§2.2.6, absolute): the Discord token is read from the git-ignored `.env` only — never printed, logged, committed, or echoed.**

**Goal:** A live news pipeline — a persistent Discord gateway service (self-bot, reusing discord_copytrade's `discord.py-self` auth pattern) ingests the news channel into a `news_items` table with self-healing backfill; an `/api/news` cursor feed and `/api/news/{symbol}` per-ticker endpoint expose it; the right rail's placeholder becomes a live reverse-chron news feed with breaking-news treatment and "load older" pagination; the ticker page gains a per-ticker News card. This is WS-3 **slice 1** (the master plan's "ship the news rail when ingest is live"); macro-sentiment (FinBERT), the econ calendar, and the morning report are subsequent slices.

**Architecture:** A new `argus/argus/news/` package: `schema.py` (news_items + per-channel backfill cursor), `store.py` (insert-with-dedup, cursor get/set, fetch-after-id — all pure SQLite via `argus.db.get_conn`), `ticker_news.py` (yfinance `Ticker.news` + `ibkr.historical_news` merge, deduped), and `ingest.py` (a `discord.Client` subclass whose `on_ready` backfills each channel since its stored cursor and whose `on_message` stores live — both delegating to a **pure** `to_news_item()` mapper + the store, so the logic is unit-tested without any live connection). The API adds `/api/news?after=<id>&limit=` (monotonic id cursor, dedupe-safe) and `/api/news/{symbol}`. The dashboard right rail polls `/api/argus/news?after=<cursor>` every 25s and renders the feed per the WS-2 design spec aesthetic.

**Tech Stack:** Python 3.11 (`argus/.venv`), `discord.py-self` (self-bot fork — installed into the argus venv as a prereq; imports as `discord`), sqlite3 via `argus.db`, FastAPI, yfinance; Next.js 14 + SWR; launchd `KeepAlive`.

**Verified starting facts (2026-06-16):**
- discord_copytrade pattern (`~/discord_copytrade/main.py`): `import discord  # discord.py-self`; `class CopyTradeBot(discord.Client)`; `on_ready` backfills via `ch.history(limit=50, oldest_first=True, after=discord.Object(id=after_id))`; `on_message(self, message)` for live; per-channel cursor = last processed message id; a "seen" set dedupes; `bot.run(DISCORD_USER_TOKEN)`. **WS-3a mirrors this.**
- `discord.py-self` is being installed into the argus venv (prereq, controller step — imports as `discord`). The argus venv did NOT have it before.
- `argus.db`: `get_conn(db_path=None)` (WAL, busy_timeout=5000, row_factory=Row, autocommit), `heartbeat(job,status,detail)`, `python -m argus.heartbeat`. Schema pattern: idempotent `ensure_schema(conn)` (see `argus/argus/options_intel/schema.py`).
- `argus/argus/data/ibkr.py:222` `IBKRClient.historical_news(symbol, total=10) -> list[str]` (needs live IBKR; degrade gracefully when down).
- yfinance `Ticker(sym).news` → `[{id, content: {title, summary, description, pubDate, provider:{displayName}, previewUrl, ...}}]` (yfinance 1.x nested shape).
- `.env` (git-ignored) holds `DISCORD_USER_TOKEN` (the credential) + `DISCORD_NEWS_CHANNEL_ID=1514793336513495050` + `DISCORD_NEWS_SERVER_ID=1508333182112501844`.
- Dashboard: `dashboard/components/rails/RightRail.tsx` is the designed empty shell (WS-2) — this slice replaces its placeholder with the live feed. Proxy `dashboard/app/api/argus/[...path]/route.ts` forwards `/api/argus/*` → `:8088/api/*` (multi-segment). Design authority for the rail look: `docs/design/ws2-rail-spec.md` (terminal/dark; `text-neg`/red ONLY for negative data — but the user explicitly wants BREAKING news in red, so breaking uses a red **left-border + "BREAKING" label**, a labelled shape, not the pct-red semantic; see master plan §WS-2 right rail).
- argus pytest baseline: 49. dashboard vitest baseline: 49.

---

### Task 1: News schema (news_items + backfill cursor)

**Files:**
- Create: `argus/argus/news/__init__.py` (empty), `argus/argus/news/schema.py`
- Test: `argus/tests/test_news_schema.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_news_schema.py
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
    assert ids == [1, 2]  # monotonic autoincrement — the /api/news cursor


def test_news_items_dedup_unique(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_news_schema(conn)
    with conn:
        conn.execute("INSERT OR IGNORE INTO news_items (ts,source,headline,dedup_key) "
                     "VALUES ('2026-06-16T00:00:00Z','discord','a','k1')")
        conn.execute("INSERT OR IGNORE INTO news_items (ts,source,headline,dedup_key) "
                     "VALUES ('2026-06-16T00:00:00Z','discord','a','k1')")  # same dedup_key
    n = conn.execute("SELECT COUNT(*) FROM news_items").fetchone()[0]
    conn.close()
    assert n == 1  # UNIQUE(dedup_key) collapses the duplicate
```

- [ ] **Step 2: Run to verify failure** — `cd argus && .venv/bin/python -m pytest tests/test_news_schema.py -v` → `ModuleNotFoundError`.

- [ ] **Step 3: Implement** (and the empty `__init__.py`)

```python
# argus/argus/news/schema.py
"""WS-3 news tables (master plan §2.2). Idempotent DDL — ingesters call
ensure_news_schema() on every run (same pattern as options_intel.schema)."""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,   -- monotonic cursor for /api/news?after=
      ts TEXT NOT NULL,                        -- ISO8601 UTC of the item
      source TEXT NOT NULL,                    -- 'discord' | 'yfinance' | 'ibkr' | 'whale'
      ticker TEXT,                             -- optional cashtag, upper
      headline TEXT NOT NULL,
      body TEXT,
      url TEXT,
      tags TEXT,                               -- comma-sep, optional
      is_breaking INTEGER NOT NULL DEFAULT 0,
      dedup_key TEXT UNIQUE,                   -- source-specific natural key (e.g. discord msg id)
      created_ts TEXT NOT NULL DEFAULT (datetime('now'))
    )""",
    "CREATE INDEX IF NOT EXISTS idx_news_ticker ON news_items(ticker, id)",
    """CREATE TABLE IF NOT EXISTS news_cursor (
      channel_id TEXT PRIMARY KEY,             -- discord channel id
      last_message_id TEXT NOT NULL,           -- last processed message id (backfill cursor)
      updated_ts TEXT NOT NULL
    )""",
]


def ensure_news_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 52.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/news/__init__.py argus/argus/news/schema.py argus/tests/test_news_schema.py
git commit -m "feat(news): news_items + backfill-cursor schema"
```

---

### Task 2: News store helpers (insert/dedup, cursor, fetch)

**Files:**
- Create: `argus/argus/news/store.py`
- Test: `argus/tests/test_news_store.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_news_store.py
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
    dup = insert_item(conn, item)            # same dedup_key
    conn.close()
    assert isinstance(first, int) and first > 0
    assert dup is None                        # dedup → no second row


def test_cursor_roundtrip(tmp_path):
    conn = _conn(tmp_path)
    assert get_cursor(conn, "chan-1") is None
    set_cursor(conn, "chan-1", "111")
    set_cursor(conn, "chan-1", "222")        # upsert
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
    assert [r["id"] for r in after1] == [2, 3]       # strictly after id 1
    assert [r["headline"] for r in aapl] == ["aapl b"]
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```python
# argus/argus/news/store.py
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


def fetch_for_ticker(conn, ticker: str, limit: int = 30) -> list:
    return conn.execute(
        "SELECT * FROM news_items WHERE ticker=? ORDER BY id DESC LIMIT ?",
        (ticker.upper(), limit)).fetchall()
```

(Note: `cur.rowcount` is 1 on insert, 0 when `INSERT OR IGNORE` skips a dedup collision — that's how we detect the dup. `conn` is autocommit/WAL but the explicit `conn.commit()` is harmless and makes intent clear.)

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 55.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/news/store.py argus/tests/test_news_store.py
git commit -m "feat(news): store helpers — insert-dedup, backfill cursor, fetch-after/for-ticker"
```

---

### Task 3: Per-ticker news (yfinance + IBKR merge)

**Files:**
- Create: `argus/argus/news/ticker_news.py`
- Test: `argus/tests/test_ticker_news.py`

- [ ] **Step 1: Write the failing tests** (injected fetchers — no network)

```python
# argus/tests/test_ticker_news.py
from argus.news.ticker_news import ticker_news


def fake_yf(sym):
    return [
        {"content": {"title": "AAPL hits record high", "summary": "s1",
                     "pubDate": "2026-06-16T12:00:00Z",
                     "provider": {"displayName": "Reuters"}, "previewUrl": "http://r/1"}},
        {"content": {"title": "Apple unveils new chip", "summary": "s2",
                     "pubDate": "2026-06-16T10:00:00Z",
                     "provider": {"displayName": "Bloomberg"}, "canonicalUrl": {"url": "http://b/2"}}},
    ]


def fake_ibkr(sym, total=10):
    return ["AAPL hits record high", "Analyst raises target"]  # first dups yf by title


def test_merge_dedupes_by_title_and_normalizes(monkeypatch):
    rows = ticker_news("AAPL", yf_fetch=fake_yf, ibkr_fetch=fake_ibkr)
    titles = [r["headline"] for r in rows]
    # 2 yf + 2 ibkr, but "AAPL hits record high" dups → 3 unique
    assert len(rows) == 3
    assert titles.count("AAPL hits record high") == 1
    # yfinance rows carry source/url/provider; ibkr rows are headline-only
    yf_row = next(r for r in rows if r["headline"] == "Apple unveils new chip")
    assert yf_row["source"] == "yfinance" and yf_row["url"] == "http://b/2"
    ib_row = next(r for r in rows if r["headline"] == "Analyst raises target")
    assert ib_row["source"] == "ibkr" and ib_row["url"] is None


def test_survives_fetcher_failure(monkeypatch):
    def boom(sym, total=10):
        raise RuntimeError("IBKR down")
    rows = ticker_news("AAPL", yf_fetch=fake_yf, ibkr_fetch=boom)
    assert len(rows) == 2 and all(r["source"] == "yfinance" for r in rows)  # ibkr failure non-fatal
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```python
# argus/argus/news/ticker_news.py
"""Per-ticker news: merge yfinance Ticker.news + IBKR historical_news, dedupe by title.
Used by GET /api/news/{symbol} and the ticker-page News card. Any source failing is non-fatal."""
from typing import Callable


def _default_yf(sym):
    import yfinance as yf
    return yf.Ticker(sym).news or []


def _default_ibkr(sym, total=10):
    from ..data import IBKRClient
    return IBKRClient.instance().historical_news(sym, total=total)


def _yf_url(content: dict):
    if content.get("previewUrl"):
        return content["previewUrl"]
    cu = content.get("canonicalUrl")
    return cu.get("url") if isinstance(cu, dict) else None


def ticker_news(symbol: str, yf_fetch: Callable = _default_yf,
                ibkr_fetch: Callable = _default_ibkr, limit: int = 12) -> list[dict]:
    sym = symbol.upper()
    out, seen = [], set()

    try:
        for n in (yf_fetch(sym) or []):
            c = n.get("content", n)
            title = (c.get("title") or "").strip()
            if not title or title.lower() in seen:
                continue
            seen.add(title.lower())
            prov = c.get("provider") or {}
            out.append({"headline": title, "source": "yfinance",
                        "body": c.get("summary") or c.get("description"),
                        "url": _yf_url(c), "ts": c.get("pubDate") or c.get("displayTime"),
                        "provider": prov.get("displayName") if isinstance(prov, dict) else None,
                        "ticker": sym})
    except Exception:
        pass

    try:
        for hl in (ibkr_fetch(sym) or []):
            t = (hl or "").strip()
            if not t or t.lower() in seen:
                continue
            seen.add(t.lower())
            out.append({"headline": t, "source": "ibkr", "body": None, "url": None,
                        "ts": None, "provider": "IBKR", "ticker": sym})
    except Exception:
        pass

    return out[:limit]
```

- [ ] **Step 4: Run to verify pass** → 2 passed; full suite 57.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/news/ticker_news.py argus/tests/test_ticker_news.py
git commit -m "feat(news): per-ticker news — yfinance + IBKR merge, title-dedup, failure-tolerant"
```

---

### Task 4: News API endpoints

**Files:**
- Modify: `argus/argus/api/routes.py` (2 routes)
- Test: `argus/tests/test_news_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_news_api.py
from fastapi.testclient import TestClient


def _seed(db):
    from argus.db import get_conn
    from argus.news.schema import ensure_news_schema
    from argus.news.store import insert_item
    conn = get_conn(db); ensure_news_schema(conn)
    for i, (tk, hl, brk) in enumerate([(None, "Fed holds", 0), ("AAPL", "AAPL up", 0),
                                       (None, "BREAKING: bank fails", 1)]):
        insert_item(conn, {"ts": f"2026-06-16T00:0{i}:00Z", "source": "discord", "headline": hl,
                           "ticker": tk, "body": None, "url": None, "tags": None,
                           "is_breaking": brk, "dedup_key": f"m{i}"})
    conn.close()


def test_news_feed_cursor(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db"); monkeypatch.setenv("ARGUS_DB", db); _seed(db)
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/news?after=0&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["cursor"] == 3 and len(body["items"]) == 3
    assert body["items"][2]["is_breaking"] == 1
    r2 = c.get("/api/news?after=2")
    assert [i["id"] for i in r2.json()["items"]] == [3]


def test_news_for_symbol(tmp_path, monkeypatch):
    # /api/news/{symbol} pulls live per-ticker news; monkeypatch the provider to avoid network
    db = str(tmp_path / "t.db"); monkeypatch.setenv("ARGUS_DB", db)
    import argus.api.routes as routes
    monkeypatch.setattr(routes, "ticker_news",
                        lambda sym, **k: [{"headline": f"{sym} news", "source": "yfinance",
                                           "url": "u", "ts": "t", "provider": "Reuters",
                                           "ticker": sym, "body": None}])
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/news/AAPL")
    assert r.status_code == 200
    assert r.json()["items"][0]["headline"] == "AAPL news"
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: add the routes** in `argus/argus/api/routes.py` next to `/api/heartbeats`. Imports with the relative imports: `from ..news.schema import ensure_news_schema`, `from ..news.store import fetch_after`, `from ..news.ticker_news import ticker_news`.

```python
    @app.get("/api/news")
    def news(after: int = 0, limit: int = 200):
        conn = get_conn()
        ensure_news_schema(conn)
        try:
            rows = fetch_after(conn, after_id=after, limit=limit)
            items = [dict(r) for r in rows]
        finally:
            conn.close()
        cursor = items[-1]["id"] if items else after
        return {"items": items, "cursor": cursor}

    @app.get("/api/news/{symbol}")
    def news_for_symbol(symbol: str):
        return {"symbol": symbol.upper(), "items": ticker_news(symbol)}
```

(The test monkeypatches `routes.ticker_news`, so import it as a module-level name `from ..news.ticker_news import ticker_news` and call it bare in the route.)

- [ ] **Step 4: Run** → green; full suite 59. **Step 5: Commit**

```bash
git add argus/argus/api/routes.py argus/tests/test_news_api.py
git commit -m "feat(news): /api/news cursor feed + /api/news/{symbol} per-ticker endpoint"
```

---

### Task 5: Discord ingest service (pure mapper + client shell)

**Files:**
- Create: `argus/argus/news/ingest.py`
- Test: `argus/tests/test_news_ingest.py`

The pure `to_news_item()` mapper + the store are unit-tested with plain objects; the `discord.Client` shell (`on_ready`/`on_message`) is **not** unit-tested (needs a live gateway — deferred to integration where the user runs the service with their token).

- [ ] **Step 1: Write the failing tests** (no `discord` connection — pass a SimpleNamespace message)

```python
# argus/tests/test_news_ingest.py
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
    assert store_message(conn, _msg(1001, "$NVDA breaks out")) is False  # dedup (same id)
    n = conn.execute("SELECT COUNT(*) FROM news_items").fetchone()[0]
    cur = get_cursor(conn, "123")
    conn.close()
    assert n == 1
    assert cur == "1001"   # cursor advanced to the message id
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```python
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

    NewsClient().run(token)   # blocks (persistent gateway)
    return 0


def main() -> int:
    return run()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify pass** → 4 passed; full suite 63. (The `run()`/`NewsClient` path is NOT unit-tested — it needs a live gateway; the pure `to_news_item`/`store_message` are fully covered.)

- [ ] **Step 5: Commit**

```bash
git add argus/argus/news/ingest.py argus/tests/test_news_ingest.py
git commit -m "feat(news): discord ingest — pure mapper + store, backfill/live client shell"
```

---

### Task 6: Right-rail live news feed

**Files:**
- Create: `dashboard/lib/news.ts` (SWR hook + types)
- Rewrite: `dashboard/components/rails/RightRail.tsx` (placeholder → live feed; keep the minimised strip + collapse from WS-2)

- [ ] **Step 1: `news.ts`**

```ts
// dashboard/lib/news.ts
"use client";

import useSWR from "swr";

export interface NewsItem {
  id: number; ts: string; source: string; ticker: string | null;
  headline: string; body: string | null; url: string | null; is_breaking: number;
}
const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useNewsFeed() {
  // Poll the head of the feed (most recent 60). Cursor pagination ("load older") is a
  // follow-up; v1 shows the latest window, refreshed every 25s.
  return useSWR<{ items: NewsItem[]; cursor: number }>(
    "/api/argus/news?after=0&limit=60", fetcher,
    { refreshInterval: 25_000, shouldRetryOnError: false }
  );
}

export function relTime(ts: string): string {
  const ms = Date.now() - new Date(ts.replace(" ", "T")).getTime();
  if (!Number.isFinite(ms)) return "";
  const m = ms / 60000;
  if (m < 1) return "now"; if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60; if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
```

- [ ] **Step 2: Rewrite `RightRail.tsx`.** Keep the WS-2 collapse (`useState`+`localStorage` key `rail-right-collapsed`, read in `useEffect`) and the minimised vertical "NEWS" strip EXACTLY as they are. Replace ONLY the expanded body (the placeholder bars + "arrive with WS-3" text) with the live feed:
  - Header row unchanged shape (`NEWS` left); right side now shows item count or a live dot instead of "WS-3".
  - `const { data, error } = useNewsFeed();` — render `data.items` reverse-chron (newest first → reverse the ascending array).
  - Each item: a row with `relTime(ts)` (muted), a source chip (`text-[9px]` muted, e.g. "discord"/"yf"), the headline (`text-[12px] text-foreground leading-snug`, line-clamp 3), and if `ticker`, a ticker chip linking to `/t/{ticker}` (`text-accent text-[10px]`, use `next/link`).
  - **Breaking** (`is_breaking`): a red **left-border** (`border-l-2 border-neg pl-2`) + a `BREAKING` tag (`text-[9px] font-medium text-neg`) — per master plan §WS-2 (user wants red; labelled border+tag, NOT the pct-data-red elsewhere, NOT a pulse). This is the ONE sanctioned red-on-chrome use, justified by the explicit user request.
  - Empty (`data.items.length === 0`): a muted "no news yet — ingest starts when the service runs" (designed, not blank). Error/offline: muted "news feed offline" (amber not required here — match the LeftRail offline tone, muted is fine for the right rail per design §7.2, but a one-line muted message, never blank).
  - Scrollable (`overflow-y-auto` already on the aside).
  - Keep `font-mono`, the `w-[260px]` expanded width, sticky positioning.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx vitest run` 49. Dev server (port 3100, `ARGUS_DB=… BRIDGE_DIR=…`): the live API serves `/api/news` only after integration restart, so on the worktree the feed shows the empty/offline designed state — confirm it's NOT blank and NOT crashing (Playwright: the right `aside` contains "NEWS" and either items or the empty-state text). To see real items, seed a few `news_items` rows into the live DB first (optional): `cd argus && .venv/bin/python -c "from argus.db import get_conn; from argus.news.schema import ensure_news_schema; from argus.news.store import insert_item; c=get_conn(); ensure_news_schema(c); insert_item(c, {'ts':'2026-06-16T00:00:00Z','source':'discord','headline':'BREAKING: test headline $SPY','ticker':'SPY','body':None,'url':None,'tags':None,'is_breaking':1,'dedup_key':'seed1'}); c.close()"` — but that writes the live DB; only do it if verifying the populated state, and note it. Paste the Playwright text.

- [ ] **Step 4: Commit**

```bash
git add dashboard/lib/news.ts dashboard/components/rails/RightRail.tsx
git commit -m "feat(dashboard): right-rail live news feed — source/ticker chips, breaking treatment, 25s poll"
```

---

### Task 7: Per-ticker News card on the ticker page

**Files:**
- Create: `dashboard/components/ticker/NewsCard.tsx`
- Modify: `dashboard/app/t/[ticker]/page.tsx` (render it)

- [ ] **Step 1: `NewsCard.tsx`** — `"use client"`, SWR on `/api/argus/news/${ticker}`, renders up to ~8 items (headline + source/provider + relTime, link to `url` when present) in a `Panel` titled "News". `if (error || !data) return null` for the absent state (no crash; the card simply doesn't show if the endpoint 404s pre-integration). Reuse `relTime` from `@/lib/news`. Follow the existing ticker-card style (see `CatalystsCard.tsx`/`GexCard.tsx`).

- [ ] **Step 2: Render it** in `dashboard/app/t/[ticker]/page.tsx` near the other ticker cards (CatalystsCard/OptionsPanel) — `<NewsCard ticker={ticker} />`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx vitest run` 49. Dev server: `/t/AAPL` — the News card renders live yfinance per-ticker news via `/api/argus/news/AAPL` (this works pre-integration IF the live API has the route — it won't until restart, so the card is absent on the worktree; verify it doesn't crash the page). Paste tsc/vitest.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/ticker/NewsCard.tsx "dashboard/app/t/[ticker]/page.tsx"
git commit -m "feat(dashboard): per-ticker News card on the ticker page"
```

---

### Task 8: Persistent ingest service plist

**Files:**
- Create: `scripts/com.argus.news-ingest.plist`
- Modify: `scripts/README.md` (one row)

- [ ] **Step 1: The plist** — a `KeepAlive` long-lived service (NOT a scheduled job; the gateway reconnects and self-heals). It runs through `job_wrapper.sh` for the env + heartbeat envelope, but with `KeepAlive` so launchd restarts it if it exits:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.argus.news-ingest</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>/Users/josephstorey/Market_Analyse/scripts/job_wrapper.sh</string>
        <string>news-ingest</string>
        <string>/Users/josephstorey/Market_Analyse/argus/.venv/bin/python</string>
        <string>-m</string><string>argus.news.ingest</string>
    </array>
    <key>WorkingDirectory</key><string>/Users/josephstorey/Market_Analyse/argus</string>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>30</integer>
    <key>StandardOutPath</key><string>/tmp/argus-news-ingest.log</string>
    <key>StandardErrorPath</key><string>/tmp/argus-news-ingest.err</string>
</dict>
</plist>
```

(Note: `job_wrapper.sh` wraps with `caffeinate -i`, which is fine for a long-lived service; the wrapper's start/ok/error heartbeat fires once per launch, and the ingest module writes its own `news-ingest` heartbeats on backfill — both under the same job key, last-write-wins, acceptable. ThrottleInterval avoids tight crash-loops.)

- [ ] **Step 2: `scripts/README.md`** — add a row:

```markdown
| (module) `argus.news.ingest` | persistent Discord news gateway (self-bot, KeepAlive) → `news_items` | `com.argus.news-ingest` (KeepAlive, not scheduled) |
```

- [ ] **Step 3: Verify** — `plutil -lint scripts/com.argus.news-ingest.plist` → OK. Do NOT bootstrap (controller, at integration — and only after confirming the token is in `.env`). **Step 4: Commit**

```bash
git add scripts/com.argus.news-ingest.plist scripts/README.md
git commit -m "feat(scripts): persistent news-ingest launchd service (KeepAlive)"
```

---

### Task 9: Docs, board, sweep

**Files:**
- Modify: `argus/README.md`, `dashboard/README.md`, `docs/SESSION_HANDOFF.md`, master plan §9 (Phase C / WS-3 row)

- [ ] **Step 1:** `argus/README.md`: endpoint rows `GET /api/news` (cursor feed) + `GET /api/news/{symbol}`; a `news` module paragraph (Discord ingest self-bot via discord.py-self, news_items + backfill cursor, per-ticker yfinance/IBKR merge; macro/calendar/morning-report land in later WS-3 slices). `dashboard/README.md`: the live right-rail news feed + per-ticker News card + the `news.ts` helper; note breaking = labelled red border. `docs/SESSION_HANDOFF.md`: WS-3a done on branch; integration pending (install `discord.py-self` — already in venv; bootstrap `com.argus.news-ingest` after confirming `DISCORD_USER_TOKEN` in `.env`; restart Argus API for `/api/news*`; the gateway connects live with the user's token — a ToS-sensitive self-bot for personal use, the user's accepted risk). Master plan §9: Phase C / WS-3 row → `In progress — slice 3a (news pipeline) done; 3b macro, 3c calendar, 3d morning report/whale to follow`, link this plan, date 2026-06-16.

- [ ] **Step 2: Sweep** — `cd argus && .venv/bin/python -m pytest tests/ -v` (63 expected) and `cd ../dashboard && npx vitest run` (49) + `npx tsc --noEmit`. Paste tails.

- [ ] **Step 3: Commit**

```bash
git add argus/README.md dashboard/README.md docs/SESSION_HANDOFF.md docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md
git commit -m "chore(news): docs + status board for WS-3a news pipeline"
```

---

## Acceptance (this slice)

1. argus pytest green (63); dashboard vitest green (49); tsc clean.
2. After integration (controller): `com.argus.news-ingest` bootstrapped (KeepAlive); the gateway connects with `DISCORD_USER_TOKEN`, backfills the news channel, and `on_message` stores live items; `news-ingest` heartbeats visible on /sources.
3. `curl :8088/api/news?after=0` returns stored items with a monotonic `cursor`; `curl :8088/api/news/AAPL` returns merged per-ticker news.
4. The right rail shows a live reverse-chron feed (source + ticker chips → `/t/[ticker]`, breaking = red left-border + BREAKING tag), refreshing every 25s; designed empty/offline states, never blank.
5. The ticker page shows a per-ticker News card.
6. Deferred to later WS-3 slices (documented): macro-sentiment (FinBERT → macro_sentiment + left-rail gauges + /macro), econ calendar (+ "Today" left-rail block + index catalyst chips), morning macro report, whale alerts; cursor "load older" pagination in the rail; secondary Discord sources (whale-watch/Market-Report channels). Live gateway verification is the user's (token + ToS-accepted self-bot, personal use).
