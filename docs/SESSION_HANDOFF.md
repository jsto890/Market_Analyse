# Session Handoff — 2026-06-16 (Phase C / WS-3a complete, branch ws3a-news-pipeline)

> Written from the WS-3a branch perspective. **Integration pending** — the branch has not yet been merged to main. A fresh session can resume from this file alone.

## 1. Current state

- **Phase C / WS-3a (news pipeline): DONE on branch `ws3a-news-pipeline`** — 9 tasks complete, ready for controller integration.
- `main` is at the Phase B/C merge state (WS-1 options intel + WS-6 catalysts + WS-2 UI shell merged).
- **This branch has NOT been merged to main.** The controller must merge + restart the Argus API + bootstrap the ingest service (see §3).

## 2. What landed (WS-3a — all 9 tasks)

### Argus — schema

- `argus/argus/news/schema.py` — `ensure_schema()` creates `news_items(id, ts, source, ticker, headline, body, url, tags, is_breaking, external_id)` and `backfill_cursors(channel_id, last_id)` tables; WAL + busy_timeout via shared `argus.db`.

### Argus — store helpers

- `argus/argus/news/store.py` — `insert_news_item()` with conflict-ignore dedup on `(source, external_id)`; `fetch_after(cursor, limit)` (cursor-paginated by monotonic `id`); `fetch_for_ticker(symbol, limit)`.

### Argus — per-ticker news

- `argus/argus/news/per_ticker.py` — `get_news_for_ticker(symbol)`: fetches yfinance `Ticker.news` + IBKR `historical_news`, merges, title-deduplicates, returns sorted by recency. Each source fails independently.

### Argus — REST endpoints

- `GET /api/news` — cursor-based feed; `?after=<id>` for incremental polls; returns `{items: [...], cursor: <int>}`.
- `GET /api/news/{symbol}` — per-ticker feed (yfinance + IBKR merge).
- Both registered in `argus/argus/api/routes.py`.

### Argus — Discord ingest

- `argus/argus/news/discord_ingest.py` — `discord.py-self` self-bot (reuses `discord_copytrade` auth pattern). On `on_ready`: loads `backfill_cursors` per channel and backfills all messages since the stored cursor. `on_message`: stores live items. Processing: cashtag extraction → ticker normalisation, BREAKING detection, dedup via `source=discord:<msgid>`. Requires `DISCORD_USER_TOKEN` + `DISCORD_NEWS_CHANNEL_ID` in the git-ignored `.env`.

### Argus — launchd service

- `scripts/com.argus.news-ingest.plist` — KeepAlive launchd user agent that keeps the Discord ingest process alive. Gateway reconnects automatically on disconnect.

### Dashboard — live right-rail news feed

- `components/rails/RightRail.tsx` upgraded from shell to live feed. Polls `/api/argus/news?after=<cursor>` every 25s via `lib/news.ts`. Each item: timestamp, source chip, headline, optional ticker chip(s) → `/t/[ticker]`. Breaking items (is_breaking=true): red left-border + `BREAKING` tag.

### Dashboard — per-ticker News card

- `components/TickerNewsCard.tsx` — calls `useTickerNews(symbol)` (`lib/news.ts`), renders scrollable list (yfinance + IBKR), source chip per row.
- Wired into the ticker page (`app/t/[ticker]/page.tsx` or equivalent).

### Dashboard — `lib/news.ts`

- `useNews(cursor?)` SWR hook (25s poll); `useTickerNews(symbol)` hook; `NewsItem` type.

## 3. Branch commits (141b533..HEAD)

```
e400321 feat(scripts): persistent news-ingest launchd service (KeepAlive)
8ebd256 feat(dashboard): per-ticker News card on the ticker page
075490c feat(dashboard): right-rail live news feed — source/ticker chips, breaking treatment, 25s poll
a7e3c16 feat(news): discord ingest — pure mapper + store, backfill/live client shell
f0a713d feat(news): /api/news cursor feed + /api/news/{symbol} per-ticker endpoint
3142203 feat(news): per-ticker news — yfinance + IBKR merge, title-dedup, failure-tolerant
fb2c0ee feat(news): store helpers — insert-dedup, backfill cursor, fetch-after/for-ticker
171ef60 feat(news): news_items + backfill-cursor schema
(Task 9: chore(news): docs + status board for WS-3a news pipeline)
```

## 4. Regression sweep (branch, pre-integration)

```
argus pytest:       63/63 passed
                    NOTE: test_cat_endpoint.py emits a pandas deprecation WARNING — not a failure; test passes (pre-existing)
dashboard vitest:   49/49 passed
dashboard tsc:      clean (no errors)
```

## 5. Integration steps (controller)

1. **Check `.env` secrets**: confirm `DISCORD_USER_TOKEN` and `DISCORD_NEWS_CHANNEL_ID` are present in the git-ignored `argus/.env` (never committed, never in any plist `EnvironmentVariables` block).
2. **Merge** `ws3a-news-pipeline` → `main`.
3. **Restart live Argus API**: `launchctl kickstart -k gui/$(id -u)/ai.argus.api` (no sudo). After restart, `curl http://127.0.0.1:8088/api/news?after=0` should return `{items: [], cursor: 0}` (empty until ingest runs).
4. **Bootstrap the ingest service** (first time only):
   ```bash
   cp scripts/com.argus.news-ingest.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.news-ingest.plist
   launchctl kickstart gui/$(id -u)/com.argus.news-ingest
   ```
   The gateway connects with the user's Discord token (self-bot — personal use, accepted ToS risk, same pattern as discord_copytrade). It will backfill the configured channel(s) on first `on_ready`, then stream live.
5. **Verify**: check `/sources` heartbeats show `news-ingest` alive; `curl http://127.0.0.1:8088/api/news?after=0` returns backfilled items; the right rail in the dashboard shows the live feed.
6. **Remove worktree**: `git worktree remove .worktrees/ws3a` once merge is confirmed.

## 6. WS-3 remaining slices (next)

| Slice | Content | Blockers |
|-------|---------|---------|
| WS-3b | Macro-sentiment scoring — FinBERT (`ProsusAI/finbert`, already installed in argus venv); `macro_sentiment` table; left-rail gauges (global/US/sector) | FinBERT ~500MB; GPU/CPU inference budget |
| WS-3c | Economic calendar ingester — BLS/FOMC/BEA public schedules + yfinance earnings calendar; `econ_calendar` table; "Today" left-rail block | None (all public data) |
| WS-3d | Morning macro report + whale alerts — auto-generated daily report (futures snapshot, headlines, econ events); whale alerts from unusual scorer cross-market top-N premium | WS-3b (macro scorer) + WS-1 unusual scorer already live |

## 7. Architecture pointers

- Master plan: `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` (§4.1 guardrails, §9 board, §WS-3).
- WS-3a plan: `docs/superpowers/plans/2026-06-16-phase-c-ws3a-news-pipeline.md` (9 tasks, acceptance criteria).
- Service: `ai.argus.api` + `com.argus.news-ingest` are USER LaunchAgents — `launchctl kickstart -k gui/$(id -u)/<label>` (no sudo).
- DB: one canonical `ARGUS_DB` path (set in `.env` + every plist); WAL + busy_timeout via `argus.db.get_conn()`.
