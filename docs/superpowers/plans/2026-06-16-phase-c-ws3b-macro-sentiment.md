# WS-3b · Macro Sentiment Model (FinBERT v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score every `news_items` headline with local FinBERT and aggregate EMA-weighted by scope (global / US / sector) over 1h/1d/1w windows into a `macro_sentiment` table, surfaced as left-rail gauges and a `/macro` detail page charting score-over-time vs SPX.

**Architecture:** A periodic job (`python -m argus.macro.run`, launchd StartInterval=20min + a `run_daily.sh` step) scores only un-scored news items (cached in `news_sentiment`), classifies each item into scopes, then writes append-only recency-weighted aggregate snapshots to `macro_sentiment`. The Argus API exposes the latest gauges and a per-scope time series; the dashboard renders rail gauges and a `/macro` page. This is WS-3 item 3 (v1); the LLM meta-read (v2) is explicitly deferred.

**Tech Stack:** Python (transformers 5.12.1 + torch 2.12.0, FinBERT `ProsusAI/finbert` already in HF cache), SQLite via `argus.db.get_conn`, FastAPI (`argus/argus/api/routes.py`), Next.js + SWR + lightweight-charts (dashboard).

**Spec source:** `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` → WS-3 item 3.

**Key existing facts (verified):**
- FinBERT output: `pipeline('text-classification', model='ProsusAI/finbert', top_k=None)(text)` → `[[{'label':'positive','score':..},{'label':'neutral',..},{'label':'negative',..}]]`. Signed score = `positive − negative` ∈ [−1, 1]. One-time load ≈ 8s.
- `news_items(id, ts, source, ticker, headline, body, url, tags, is_breaking, dedup_key, created_ts)` — `argus/argus/news/schema.py`. `ts` is ISO-8601 (may be `None` for some items).
- `argus.db.get_conn(db_path=None)` → WAL, busy_timeout, `row_factory=Row`; `heartbeat(job, status, detail)`.
- `argus.sector_taxonomy.resolve_sector(ticker) -> (family, sub_sector)`; family `"Other"` when unmapped. Cached in `config/sector_cache.json`.
- API routes are plain `@app.get(...)` inside `build_app()` in `argus/argus/api/routes.py`. Dashboard reaches Argus through the catch-all proxy `dashboard/app/api/argus/[...path]/route.ts`, so `/api/argus/macro` → Argus `/api/macro`.
- Left-rail placeholder to replace: `dashboard/components/rails/LeftRail.tsx:251-255` (the footnote `<div>` saying "macro gauges · market blurb · today's events — land with WS-3"). `Block({label,badge,children,separator})` is defined in the same file. SWR rail hooks pattern: `dashboard/lib/rail-quotes.ts` / `dashboard/lib/news.ts` (`useSWR(url, fetcher, {refreshInterval})`).

---

## File Structure

**Create (backend — `argus/argus/macro/`):**
- `__init__.py` — package marker.
- `finbert.py` — lazy-singleton scorer: `score_headline`, `score_batch`.
- `scope.py` — pure classifier: `scopes_for(ticker, headline) -> set[str]`.
- `schema.py` — `ensure_macro_schema(conn)`: `news_sentiment` + `macro_sentiment` tables.
- `store.py` — DB helpers (unscored items, save scores, scored items since, insert aggregates, latest gauges, series).
- `aggregate.py` — `WINDOWS`, pure `compute_aggregates(items, now)`, orchestration `run_aggregation(conn, now)`.
- `run.py` — `main()` for `python -m argus.macro.run`.

**Create (tests — `argus/tests/`):**
- `test_macro_scope.py`, `test_macro_aggregate.py`, `test_macro_store.py`, `test_macro_finbert.py`.

**Create (frontend):**
- `dashboard/lib/macro.ts` — `useMacro`, `useMacroSeries`, types + helpers.
- `dashboard/components/rails/MacroGauges.tsx` — rail gauges.
- `dashboard/app/macro/page.tsx` — `/macro` detail page.
- `dashboard/components/macro/MacroChart.tsx` — score-vs-SPX line chart.

**Create (ops):**
- `scripts/com.argus.macro.plist` — launchd StartInterval job.

**Modify:**
- `argus/argus/api/routes.py` — add `/api/macro` and `/api/macro/series`.
- `dashboard/components/rails/LeftRail.tsx` — replace placeholder with `<MacroGauges/>`.
- `scripts/run_daily.sh` — add a macro-aggregate step.

---

### Task 1: Macro schema (`news_sentiment` + `macro_sentiment`)

**Files:**
- Create: `argus/argus/macro/__init__.py` (empty)
- Create: `argus/argus/macro/schema.py`
- Test: `argus/tests/test_macro_store.py` (schema portion)

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_macro_store.py
from argus.db import get_conn
from argus.macro.schema import ensure_macro_schema


def _conn(tmp_path):
    conn = get_conn(tmp_path / "t.db")
    ensure_macro_schema(conn)
    return conn


def test_schema_creates_tables(tmp_path):
    conn = _conn(tmp_path)
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert {"news_sentiment", "macro_sentiment"} <= names
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_store.py::test_schema_creates_tables -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.macro'`.

- [ ] **Step 3: Write minimal implementation**

```python
# argus/argus/macro/__init__.py
```

```python
# argus/argus/macro/schema.py
"""WS-3b macro-sentiment tables (master plan §WS-3.3). Idempotent DDL — the
aggregator calls ensure_macro_schema() on every run (same pattern as
news/schema.py and options_intel/schema.py)."""
import sqlite3

_DDL = [
    # per-item FinBERT score cache: score each news_item once, reuse forever.
    """CREATE TABLE IF NOT EXISTS news_sentiment (
      news_id INTEGER PRIMARY KEY,
      score REAL NOT NULL,
      scored_ts TEXT NOT NULL DEFAULT (datetime('now'))
    )""",
    # append-only aggregate snapshots. gauges = latest per (scope,window);
    # the /macro chart = the series over ts.
    """CREATE TABLE IF NOT EXISTS macro_sentiment (
      scope TEXT NOT NULL,
      window TEXT NOT NULL,
      score REAL NOT NULL,
      n INTEGER NOT NULL,
      ts TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_macro_scope_window_ts ON macro_sentiment(scope, window, ts)",
]


def ensure_macro_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_store.py::test_schema_creates_tables -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/macro/__init__.py argus/argus/macro/schema.py argus/tests/test_macro_store.py
git commit -m "feat(macro): news_sentiment + macro_sentiment schema"
```

---

### Task 2: Scope classifier (`scope.py`)

**Files:**
- Create: `argus/argus/macro/scope.py`
- Test: `argus/tests/test_macro_scope.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_macro_scope.py
import argus.macro.scope as sc


def test_macro_us_keyword_adds_us_and_global():
    assert sc.scopes_for(None, "Fed signals rate cut as CPI inflation cools") == {"global", "us"}


def test_plain_headline_is_global_only():
    assert sc.scopes_for(None, "Company unveils new logo") == {"global"}


def test_ticker_adds_sector_and_us(monkeypatch):
    monkeypatch.setattr(sc, "resolve_sector", lambda t: ("AI / Compute", "Semiconductors"))
    assert sc.scopes_for("NVDA", "Nvidia earnings beat estimates") == {
        "global", "us", "sector:AI / Compute"}


def test_ticker_unmapped_sector_skipped(monkeypatch):
    monkeypatch.setattr(sc, "resolve_sector", lambda t: ("Other", "whatever"))
    assert sc.scopes_for("ZZZZ", "some move") == {"global", "us"}


def test_empty_headline_no_crash():
    assert sc.scopes_for(None, "") == {"global"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_scope.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.macro.scope'`.

- [ ] **Step 3: Write minimal implementation**

```python
# argus/argus/macro/scope.py
"""Pure scope classifier (master plan §WS-3.3): a news item rolls up into one or
more macro scopes — always 'global'; 'us' for US-macro keywords or any (US-listed)
ticker; and 'sector:<family>' for tickers we can map. Sector family via the
existing sector_taxonomy. No I/O beyond resolve_sector's own cache."""
import re

from ..sector_taxonomy import resolve_sector

GLOBAL = "global"
US = "us"

# US-macro signal words → the print drives US (and therefore global) sentiment.
_US_MACRO = re.compile(
    r"\b(fed|fomc|powell|cpi|ppi|inflation|disinflation|jobs?|payrolls?|nfp|"
    r"unemployment|jobless|gdp|pce|rate\s?(?:cut|hike|s)?|interest rate|treasur|"
    r"yields?|recession|tariff|debt ceiling|consumer confidence|retail sales)\b",
    re.IGNORECASE,
)


def scopes_for(ticker, headline: str) -> set[str]:
    s = {GLOBAL}
    text = headline or ""
    if _US_MACRO.search(text):
        s.add(US)
    if ticker:
        s.add(US)  # tracked universe is US-listed
        try:
            family, _ = resolve_sector(ticker)
        except Exception:
            family = "Other"
        if family and family != "Other":
            s.add(f"sector:{family}")
    return s
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_scope.py -q`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/macro/scope.py argus/tests/test_macro_scope.py
git commit -m "feat(macro): scope classifier — global/us/sector rollup"
```

---

### Task 3: Aggregation math (`aggregate.py` pure function)

**Files:**
- Create: `argus/argus/macro/aggregate.py` (pure part only this task)
- Test: `argus/tests/test_macro_aggregate.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_macro_aggregate.py
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_aggregate.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.macro.aggregate'`.

- [ ] **Step 3: Write minimal implementation**

```python
# argus/argus/macro/aggregate.py
"""Recency-weighted scope aggregation (master plan §WS-3.3).

compute_aggregates() is pure: given scored, scope-tagged items and a clock, it
produces one (scope, window, score, n) row per scope present in each window.
Weight decays exponentially with age; the half-life is half the window, so the
most recent prints dominate without older context being dropped abruptly."""
import math
from datetime import datetime

WINDOWS = {"1h": 3600, "1d": 86400, "1w": 604800}


def compute_aggregates(items: list[dict], now: datetime) -> list[dict]:
    """items: [{"ts": datetime|None, "score": float, "scopes": set[str]}]."""
    out: list[dict] = []
    for window, secs in WINDOWS.items():
        half_life = secs / 2.0
        # accumulate weighted sums per scope
        wsum: dict[str, float] = {}
        vsum: dict[str, float] = {}
        cnt: dict[str, int] = {}
        for it in items:
            ts = it.get("ts")
            if ts is None:
                continue
            age = (now - ts).total_seconds()
            if age < 0 or age > secs:
                continue
            w = math.exp(-age / half_life)
            for scope in it.get("scopes", ()):  # noqa: B007
                wsum[scope] = wsum.get(scope, 0.0) + w
                vsum[scope] = vsum.get(scope, 0.0) + w * it["score"]
                cnt[scope] = cnt.get(scope, 0) + 1
        for scope, ws in wsum.items():
            if ws <= 0:
                continue
            out.append({
                "scope": scope,
                "window": window,
                "score": round(vsum[scope] / ws, 4),
                "n": cnt[scope],
            })
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_aggregate.py -q`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/macro/aggregate.py argus/tests/test_macro_aggregate.py
git commit -m "feat(macro): recency-weighted scope aggregation (pure)"
```

---

### Task 4: FinBERT scorer (`finbert.py`)

**Files:**
- Create: `argus/argus/macro/finbert.py`
- Test: `argus/tests/test_macro_finbert.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_macro_finbert.py
import pytest
from argus.macro.finbert import score_headline, score_batch


@pytest.mark.slow
def test_score_sign_is_directionally_correct():
    pos = score_headline("shares surge to record high on blowout profit and raised guidance")
    neg = score_headline("stock collapses on bankruptcy filing and massive write-downs")
    assert pos > 0.3
    assert neg < -0.3
    assert -1.0 <= pos <= 1.0 and -1.0 <= neg <= 1.0


@pytest.mark.slow
def test_batch_matches_single_and_handles_empty():
    texts = ["profit beats expectations", "", "guidance slashed amid weak demand"]
    out = score_batch(texts)
    assert len(out) == 3
    assert out[1] == 0.0           # empty headline → neutral 0.0
    assert out[0] > 0 and out[2] < 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_finbert.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.macro.finbert'`.

- [ ] **Step 3: Write minimal implementation**

```python
# argus/argus/macro/finbert.py
"""Local FinBERT scorer (ProsusAI/finbert) — free, no API cost. Lazy singleton:
the ~8s model load happens once per process, on first score. Signed score =
P(positive) − P(negative) ∈ [−1, 1]. Empty text scores 0.0 (neutral)."""
import threading

_MODEL = "ProsusAI/finbert"
_pipe = None
_lock = threading.Lock()


def _get_pipeline():
    global _pipe
    if _pipe is None:
        with _lock:
            if _pipe is None:
                from transformers import pipeline
                _pipe = pipeline("text-classification", model=_MODEL, top_k=None)
    return _pipe


def _signed(scored) -> float:
    d = {x["label"].lower(): x["score"] for x in scored}
    return round(float(d.get("positive", 0.0) - d.get("negative", 0.0)), 4)


def score_headline(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    out = _get_pipeline()(text[:512])  # FinBERT max ~512 tokens; truncate defensively
    return _signed(out[0])


def score_batch(texts: list[str]) -> list[float]:
    """Score many headlines; empties map to 0.0 without hitting the model."""
    idx = [i for i, t in enumerate(texts) if t and t.strip()]
    results = [0.0] * len(texts)
    if not idx:
        return results
    pipe = _get_pipeline()
    outs = pipe([texts[i][:512] for i in idx])
    for i, o in zip(idx, outs):
        results[i] = _signed(o)
    return results
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_finbert.py -q`
Expected: PASS (2 tests; ~10s due to model load). If pytest is configured with `-m "not slow"` by default, run `... -m slow` to force.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/macro/finbert.py argus/tests/test_macro_finbert.py
git commit -m "feat(macro): lazy-singleton FinBERT scorer (signed pos-neg)"
```

---

### Task 5: Store helpers + aggregation orchestration

**Files:**
- Modify: `argus/argus/macro/store.py` (create)
- Modify: `argus/argus/macro/aggregate.py` (add `run_aggregation`)
- Test: `argus/tests/test_macro_store.py` (extend)

- [ ] **Step 1: Write the failing test (append to test_macro_store.py)**

```python
# argus/tests/test_macro_store.py  (append)
from argus.macro.store import (insert_aggregates, latest_macro, macro_series,
                               save_scores, scored_news_since, unscored_news)
from argus.news.schema import ensure_news_schema
from argus.news.store import insert_item


def _news_conn(tmp_path):
    conn = get_conn(tmp_path / "n.db")
    ensure_news_schema(conn)
    ensure_macro_schema(conn)
    return conn


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
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_store.py -q`
Expected: FAIL — `ImportError: cannot import name ... from 'argus.macro.store'`.

- [ ] **Step 3: Implement `store.py`**

```python
# argus/argus/macro/store.py
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
```

- [ ] **Step 4: Add `run_aggregation` to `aggregate.py`**

```python
# argus/argus/macro/aggregate.py  (append after compute_aggregates)
from datetime import timezone, timedelta

from ..db import get_conn, heartbeat
from .schema import ensure_macro_schema
from .finbert import score_batch
from .scope import scopes_for
from . import store as _store


def _parse_ts(raw):
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def run_aggregation(conn=None, now: datetime | None = None) -> dict:
    """Score new headlines, aggregate the last week into macro_sentiment.
    Returns a small summary dict for the heartbeat."""
    own = conn is None
    conn = conn or get_conn()
    now = now or datetime.now(timezone.utc)
    try:
        ensure_macro_schema(conn)
        # 1. score any un-scored headlines (FinBERT only on the new ones).
        todo = _store.unscored_news(conn)
        if todo:
            scores = score_batch([r["headline"] for r in todo])
            _store.save_scores(conn, [(r["id"], sc) for r, sc in zip(todo, scores)])
        # 2. pull the last week of scored items, tag scopes, aggregate.
        since = (now - timedelta(seconds=WINDOWS["1w"])).isoformat(timespec="seconds")
        rows = _store.scored_news_since(conn, since)
        items = [{"ts": _parse_ts(r["ts"]), "score": r["score"],
                  "scopes": scopes_for(r["ticker"], r["headline"])} for r in rows]
        aggs = compute_aggregates(items, now)
        if aggs:
            _store.insert_aggregates(conn, aggs, ts=now.isoformat(timespec="seconds"))
        summary = {"scored": len(todo), "items": len(items), "aggregates": len(aggs)}
    finally:
        if own:
            conn.close()
    heartbeat("macro-aggregate", "ok",
              f"scored {summary['scored']}, {summary['aggregates']} aggregates")
    return summary
```

- [ ] **Step 5: Run tests**

Run: `cd argus && .venv/bin/python -m pytest tests/test_macro_store.py tests/test_macro_aggregate.py -q`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add argus/argus/macro/store.py argus/argus/macro/aggregate.py argus/tests/test_macro_store.py
git commit -m "feat(macro): store helpers + run_aggregation orchestration"
```

---

### Task 6: CLI runner + API endpoints

**Files:**
- Create: `argus/argus/macro/run.py`
- Modify: `argus/argus/api/routes.py` (imports near line 50; routes after `/api/news/{symbol}` ~line 148)

- [ ] **Step 1: Implement the runner**

```python
# argus/argus/macro/run.py
"""Macro aggregation entrypoint — launchd (StartInterval) + run_daily.sh.
Run: python -m argus.macro.run"""
import sys

from .aggregate import run_aggregation


def main() -> int:
    summary = run_aggregation()
    print(f"macro-aggregate: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Add API endpoints to `routes.py`**

Add imports alongside the existing news imports (`argus/argus/api/routes.py:50-52`):

```python
from ..macro.schema import ensure_macro_schema
from ..macro.store import latest_macro, macro_series
```

Add the routes immediately after the `news_for_symbol` route (after ~line 148):

```python
    @app.get("/api/macro")
    def macro():
        conn = get_conn()
        ensure_macro_schema(conn)
        try:
            gauges = [dict(r) for r in latest_macro(conn)]
        finally:
            conn.close()
        return {"gauges": gauges}

    @app.get("/api/macro/series")
    def macro_series_route(scope: str = "global", window: str = "1d", limit: int = 200):
        conn = get_conn()
        ensure_macro_schema(conn)
        try:
            points = [dict(r) for r in macro_series(conn, scope, window, limit)]
        finally:
            conn.close()
        return {"scope": scope, "window": window, "points": points}
```

- [ ] **Step 3: Smoke-test runner + endpoints**

Run (populates + serves):
```bash
cd argus && .venv/bin/python -m argus.macro.run
.venv/bin/python -c "from argus.api.routes import build_app; from fastapi.testclient import TestClient; c=TestClient(build_app()); print(c.get('/api/macro').json()); print(c.get('/api/macro/series?scope=global&window=1d').json())"
```
Expected: runner prints a summary dict; `/api/macro` returns `{"gauges":[...]}`; `/api/macro/series` returns `{"scope":"global","window":"1d","points":[...]}`. (Gauges may be `[]` if there are no news items in the test DB — acceptable; the live DB has ~224 items.)

- [ ] **Step 4: Commit**

```bash
git add argus/argus/macro/run.py argus/argus/api/routes.py
git commit -m "feat(macro): CLI runner + /api/macro and /api/macro/series"
```

---

### Task 7: Dashboard — macro hook + left-rail gauges

**Files:**
- Create: `dashboard/lib/macro.ts`
- Create: `dashboard/components/rails/MacroGauges.tsx`
- Modify: `dashboard/components/rails/LeftRail.tsx:251-255` (replace placeholder)

- [ ] **Step 1: Implement the data hook**

```typescript
// dashboard/lib/macro.ts
"use client";

import useSWR from "swr";

export interface MacroGauge {
  scope: string; window: string; score: number; n: number; ts: string;
}
export interface MacroPoint { ts: string; score: number; n: number; }

const fetcher = (url: string) =>
  fetch(url).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

export function useMacro() {
  return useSWR<{ gauges: MacroGauge[] }>("/api/argus/macro", fetcher, {
    refreshInterval: 60_000, shouldRetryOnError: false,
  });
}

export function useMacroSeries(scope: string, window: string) {
  return useSWR<{ scope: string; window: string; points: MacroPoint[] }>(
    `/api/argus/macro/series?scope=${encodeURIComponent(scope)}&window=${window}`,
    fetcher, { refreshInterval: 60_000, shouldRetryOnError: false });
}

/** Human label for a scope key. "sector:AI / Compute" → "AI / Compute". */
export function scopeLabel(scope: string): string {
  return scope.startsWith("sector:") ? scope.slice(7) : scope.toUpperCase();
}

/** −1..1 → tone class. Green above +0.05, red below −0.05, muted between. */
export function toneClass(score: number): string {
  if (score > 0.05) return "text-accent";
  if (score < -0.05) return "text-warn";
  return "text-muted";
}
```

- [ ] **Step 2: Implement the gauges component**

```tsx
// dashboard/components/rails/MacroGauges.tsx
"use client";

import Link from "next/link";
import { useMacro, scopeLabel, toneClass, type MacroGauge } from "@/lib/macro";

/** A compact −1..1 bar centred at 0. */
function Gauge({ g }: { g: MacroGauge }) {
  const pct = Math.max(-1, Math.min(1, g.score)) * 50; // ±50% from centre
  const pos = g.score >= 0;
  return (
    <div className="px-3 py-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono text-muted truncate">{scopeLabel(g.scope)}</span>
        <span className={`text-[10px] font-mono tabular-nums ${toneClass(g.score)}`}>
          {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1 mt-0.5 bg-elevated rounded-full overflow-hidden">
        <span className="absolute left-1/2 top-0 h-full w-px bg-line" />
        <span
          className={`absolute top-0 h-full ${pos ? "bg-accent" : "bg-warn"}`}
          style={{ left: pos ? "50%" : `${50 + pct}%`, width: `${Math.abs(pct)}%` }}
        />
      </div>
    </div>
  );
}

export function MacroGauges({ window = "1d" }: { window?: string }) {
  const { data } = useMacro();
  const gauges = (data?.gauges ?? []).filter((g) => g.window === window);
  // Show global + us first, then up to 3 sectors with the most items.
  const head = gauges.filter((g) => g.scope === "global" || g.scope === "us");
  const sectors = gauges
    .filter((g) => g.scope.startsWith("sector:"))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const show = [...head, ...sectors];

  return (
    <div className="border-t border-line">
      <div className="h-[24px] flex items-center justify-between px-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">
          Macro
        </span>
        <Link href="/macro" className="text-[10px] font-mono text-muted hover:text-accent">{window} ›</Link>
      </div>
      {show.length === 0
        ? <p className="px-3 py-1 text-[10px] font-mono text-muted opacity-60">building…</p>
        : show.map((g) => <Gauge key={`${g.scope}-${g.window}`} g={g} />)}
    </div>
  );
}
```

- [ ] **Step 3: Wire into LeftRail (replace the placeholder footnote)**

In `dashboard/components/rails/LeftRail.tsx`, add the import near the other rail imports (top of file):
```tsx
import { MacroGauges } from "./MacroGauges";
```
Replace the placeholder `<div>` block (currently `dashboard/components/rails/LeftRail.tsx:250-255`, the `{/* Footnote zone per spec §8.10 */}` div) with:
```tsx
        {/* Macro sentiment gauges — WS-3b */}
        <div className="mt-auto">
          <MacroGauges window="1d" />
        </div>
```

- [ ] **Step 4: Build to verify it compiles**

Run: `cd dashboard && node_modules/.bin/next build 2>&1 | tail -20`
Expected: build succeeds (no type errors). If `next build` is heavy, `npx tsc --noEmit` on the touched files is an acceptable faster check.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/macro.ts dashboard/components/rails/MacroGauges.tsx dashboard/components/rails/LeftRail.tsx
git commit -m "feat(dashboard): left-rail macro sentiment gauges"
```

---

### Task 8: `/macro` detail page — score-over-time vs SPX

**Files:**
- Create: `dashboard/components/macro/MacroChart.tsx`
- Create: `dashboard/app/macro/page.tsx`

- [ ] **Step 1: Implement the chart (lightweight-charts, two scales)**

```tsx
// dashboard/components/macro/MacroChart.tsx
"use client";

import { useEffect, useRef } from "react";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import type { MacroPoint } from "@/lib/macro";

interface SpxBar { time: number; close: number; }

/** Macro score (left axis, −1..1) overlaid on SPY close (right axis). */
export function MacroChart({ points, spx }: { points: MacroPoint[]; spx: SpxBar[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 320,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#8b949e" },
      grid: { vertLines: { visible: false }, horzLines: { color: "#21262d" } },
      rightPriceScale: { borderColor: "#21262d" },
      leftPriceScale: { visible: true, borderColor: "#21262d" },
      timeScale: { borderColor: "#21262d" },
    });
    const macro = chart.addSeries(LineSeries, { color: "#2f81f7", priceScaleId: "left", lineWidth: 2 });
    macro.setData(points
      .map((p) => ({ time: Math.floor(new Date(p.ts.replace(" ", "T")).getTime() / 1000), value: p.score }))
      .filter((d) => Number.isFinite(d.time)) as never);
    if (spx.length) {
      const spy = chart.addSeries(LineSeries, { color: "#8b949e", priceScaleId: "right", lineWidth: 1 });
      spy.setData(spx.map((b) => ({ time: b.time, value: b.close })) as never);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [points, spx]);
  return <div ref={ref} className="w-full" />;
}
```

- [ ] **Step 2: Implement the page**

```tsx
// dashboard/app/macro/page.tsx
"use client";

import { useState } from "react";
import { useMacro, useMacroSeries, scopeLabel, toneClass } from "@/lib/macro";
import useSWR from "swr";
import { MacroChart } from "@/components/macro/MacroChart";

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const WINDOWS = ["1h", "1d", "1w"];

export default function MacroPage() {
  const { data } = useMacro();
  const [scope, setScope] = useState("global");
  const [window, setWindow] = useState("1d");
  const { data: series } = useMacroSeries(scope, window);
  // SPY daily history already served by Argus; reuse it as the benchmark overlay.
  const { data: hist } = useSWR<{ bars: { time: number; close: number }[] }>(
    "/api/argus/history/SPY?period=1mo&interval=1d", fetcher);

  const gauges = (data?.gauges ?? []).filter((g) => g.window === window);
  const scopes = Array.from(new Set((data?.gauges ?? []).map((g) => g.scope)));

  return (
    <main className="max-w-5xl mx-auto px-6 py-6 font-mono">
      <h1 className="text-lg font-semibold mb-1">Macro Sentiment</h1>
      <p className="text-xs text-muted mb-4">
        FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish.
      </p>

      <div className="flex gap-2 mb-4">
        {WINDOWS.map((w) => (
          <button key={w} onClick={() => setWindow(w)}
            className={`px-2 py-1 text-xs rounded ${w === window ? "bg-accent/20 text-accent" : "bg-elevated text-muted"}`}>
            {w}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {gauges.map((g) => (
          <button key={g.scope} onClick={() => setScope(g.scope)}
            className={`text-left p-2 rounded border ${g.scope === scope ? "border-accent" : "border-line"} bg-surface`}>
            <div className="text-[11px] text-muted truncate">{scopeLabel(g.scope)}</div>
            <div className={`text-sm tabular-nums ${toneClass(g.score)}`}>
              {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted opacity-60">n={g.n}</div>
          </button>
        ))}
      </div>

      <div className="mb-2 text-xs text-muted">
        {scopeLabel(scope)} · {window} vs SPY
      </div>
      <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
      {!scopes.length && <p className="text-xs text-muted mt-4">No macro data yet — the aggregator runs every 20 min.</p>}
    </main>
  );
}
```

Note: confirm the SPY history response shape — the page assumes `{ bars: [{ time, close }] }`. If `/api/argus/history/SPY` returns a different shape (check `argus/argus/api/routes.py:185` `history`), adapt the `hist` mapping in this step before building.

- [ ] **Step 3: Build to verify it compiles**

Run: `cd dashboard && node_modules/.bin/next build 2>&1 | tail -20`
Expected: build succeeds; `/macro` appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/macro/MacroChart.tsx dashboard/app/macro/page.tsx
git commit -m "feat(dashboard): /macro detail page — score-over-time vs SPY"
```

---

### Task 9: Schedule the aggregator (launchd + run_daily)

**Files:**
- Create: `scripts/com.argus.macro.plist`
- Modify: `scripts/run_daily.sh` (add a macro step after the dashboard ingest)

- [ ] **Step 1: Create the launchd plist**

```xml
<!-- scripts/com.argus.macro.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.argus.macro</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/josephstorey/Market_Analyse/argus/.venv/bin/python</string>
    <string>-m</string><string>argus.macro.run</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/josephstorey/Market_Analyse/argus</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    <key>ARGUS_DB</key><string>/Users/josephstorey/Market_Analyse/argus.db</string>
  </dict>
  <key>StartInterval</key><integer>1200</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/argus_macro.log</string>
  <key>StandardErrorPath</key><string>/tmp/argus_macro.err</string>
</dict>
</plist>
```

- [ ] **Step 2: Add a macro step to `scripts/run_daily.sh`**

Append after the dashboard-ingest step (`scripts/run_daily.sh:41`):

```zsh
# 4. Macro sentiment aggregate (FinBERT scores news → macro_sentiment; WS-3b)
if (cd "$REPO/argus" && "$PY" -m argus.macro.run); then hb macro-aggregate ok; else hb macro-aggregate error "exit $?"; fi
```

- [ ] **Step 3: Verify the plist loads and the job runs once**

Run:
```bash
cp /Users/josephstorey/Market_Analyse/scripts/com.argus.macro.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.macro.plist
launchctl kickstart -k gui/$(id -u)/com.argus.macro
sleep 15 && cat /tmp/argus_macro.log
```
Expected: log shows `macro-aggregate: {'scored': N, 'items': M, 'aggregates': K}`. Verify the heartbeat: `cd argus && .venv/bin/python -c "from argus.db import get_conn; print([dict(r) for r in get_conn().execute(\"SELECT * FROM heartbeats WHERE job='macro-aggregate'\")])"`.

- [ ] **Step 4: Commit**

```bash
git add scripts/com.argus.macro.plist scripts/run_daily.sh
git commit -m "feat(ops): schedule macro aggregator (launchd 20min + run_daily step)"
```

---

## Self-Review

**1. Spec coverage** (WS-3 item 3):
- "FinBERT scores every news_items headline" → Task 4 (scorer) + Task 5 (`run_aggregation` scores un-scored items, cached in `news_sentiment`). ✓
- "aggregate EMA-weighted by scope — global / US / sector" → Task 2 (scope) + Task 3 (recency-weighted aggregate). ✓ (Note: implemented as exponential recency weighting within each window — the spec's "EMA-weighted" intent; a true cross-snapshot EMA is unnecessary given per-run recency weighting.)
- "ticker→sector via existing mapping; macro keywords→scope rules" → Task 2 uses `resolve_sector` + keyword regex. ✓
- "over 1h/1d/1w windows into macro_sentiment" → Task 1 table + Task 3 `WINDOWS`. ✓
- "left-rail gauges" → Task 7. ✓
- "a /macro detail page with score-over-time charts vs SPX" → Task 8 (SPY overlay; SPY is the tradeable SPX proxy already served by Argus). ✓
- "v2 LLM meta-read … (after validation)" → explicitly out of scope. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every code step shows complete code. One verification note in Task 8 Step 2 (confirm SPY history shape) is a real check, not a placeholder.

**3. Type consistency:** `scopes_for(ticker, headline) -> set[str]` used identically in Tasks 2/5. `compute_aggregates(items, now)` row shape `{scope,window,score,n}` matches `insert_aggregates` input and `MacroGauge`/API output. `score_batch(texts)->list[float]` matches `run_aggregation` usage. Store fn names (`unscored_news`, `save_scores`, `scored_news_since`, `insert_aggregates`, `latest_macro`, `macro_series`) match across store.py, aggregate.py, routes.py and tests. Frontend `MacroGauge`/`MacroPoint` fields match the API JSON.

**Risk note:** `resolve_sector` may do an uncached yfinance call per new ticker during scoring; it is cached after first lookup and the new-item set per run is small, so this is acceptable for v1. If it becomes slow, memoise per-run and skip sector scope for uncached tickers.
