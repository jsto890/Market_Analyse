# Sentiment feed fallback (X API outage / 402) — design

Date: 2026-07-20. Approved in-session.

## Problem
`run_daily.sh` is `set -e`; when the X API fails (402 Payment Required on 2026-07-20, or downtime/missing token) the run dies at `fetch-x` and nothing downstream (signals, setups, bridge, dashboard ingest) refreshes.

## Decisions
- **Fallback = free sources + graceful degrade.** Stocktwits public API + Reddit public JSON mapped into the existing `x_posts.jsonl` schema. If those also fail, continue with cached posts and flag staleness.
- **Failure-only trigger.** X stays primary; fallback fires only when `fetch-x` exits non-zero.
- No streaming/intraday, no scraping, no paid alternatives.

## Components
1. `Market_Review/src/stock_chatter/fallback_sources.py`
   - `fetch_stocktwits_posts(tickers)` — `api.stocktwits.com/api/2/streams/symbol/{T}.json` per ticker (no auth). Row mapping: `id="st-<msg id>"`, `account="@st:<username>"`, `created_at`, `text=body`, `entities.cashtags` from `symbols`, `public_metrics.like_count/reply_count`, `source="stocktwits"`.
   - `fetch_stocktwits_trending_posts(max_symbols)` — trending symbols → their streams; used as discovery fallback.
   - `fetch_reddit_posts(subreddits)` — `reddit.com/r/<subs>/new.json` (UA header). `id="rd-<name>"`, `account="@rd:<author>"`, `text=title+selftext`, `source="reddit"`. Tickers come from the existing text-regex extractor.
   - Per-source failures tolerated; a source returning nothing doesn't fail the others.
2. CLI `fetch-fallback` (cli.py) — args `--tickers`, `--subreddits`, `--out`. Derives symbol list from `--tickers` + recent watchlist memory. Appends deduped rows to `x_posts.jsonl` via `append_new_jsonl`.
3. Freshness stamp `data/state/sentiment_meta.json` — `{last_success_utc, source}` written by both `fetch-x` (source `x`) and `fetch-fallback` (source `stocktwits+reddit`).
4. `run_daily.sh` — fetch-x no longer fatal: on failure run `fetch-fallback`; if both fail, memo gets `--x-skipped` and run continues with cached posts. Discovery python block: try X broad scan, fall back to Stocktwits trending posts.
5. `Market_Analyse/sentiment_bridge.py` — report header line showing sentiment source + age from the meta file (path derived from `MARKET_REVIEW_REPORT`); `⚠ SENTIMENT STALE` if > 36 h.

## Downstream compatibility
`extract_signals` already handles unknown accounts (tier `unknown`, weight 0.25) and extracts tickers from text when `entities.cashtags` is absent. No changes to signals/setups/memo/dashboard.

## Testing
`tests/test_fallback_sources.py` — mocked HTTP: schema mapping for both sources, per-source failure tolerance, trending fallback. Live verify by running today's pipeline (X currently 402s, so the fallback path executes for real).
