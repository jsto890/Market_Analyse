# Dashboard v3 — refresh, simplify, standalone — design spec

Date: 2026-07-20. Direction approved in-session; reviewed by three subagents (UI design, architecture, product) — findings integrated below.

## Goals
1. Replace the deprecated context strip with live regime/freshness/health/counts.
2. Move IBKR price connections to IB Gateway port 4002.
3. Session-aware % change for futures and US equities (no more misleading 0.00% overnight).
4. Morning brief that actually says what to expect today (gap, events, earnings, expected moves).
5. Remove Performance and Sources tabs; Sector Rotation gets its own tab.
6. ODTE tab overhaul: two unified native pages (verdict overview + strike tables), no embedded options_analysis iframe.
7. Package as a standalone Tauri desktop app (MarketAnalyse.app).

Non-goals: new data sources, mobile, auth/multi-user, changes to the nightly pipeline itself.

## 1. Context strip (`components/ContextStrip.tsx` rewrite)
Three visually-grouped clusters (four zones wrapped on <1400px windows — reviewer #1):
- **Regime + session**: regime pill from `reports/bridge_meta.json` + session chip `PRE | RTH | AH | OVN` (NY clock; weekday+time, reuse econ-calendar holidays if trivially available).
- **Freshness + health (merged cluster)**: `sentiment: stocktwits 2h · bridge 11:09 · prices 30s` plus ONE aggregate health dot = worst-of {Argus API, IBKR Gateway, last ingest}; tooltip (existing Tooltip.Portal pattern) lists each service individually with its reason.
  - Four states, not three: green ok / amber degraded / red down / **grey = expected-stale** (weekend/holiday, market closed) so the strip doesn't cry wolf every Saturday.
  - IBKR dot derives from odte `/health` `ibkr_connected` (already computed) — NOT a raw socket probe (open port ≠ logged in).
- **Counts**: `ALIGNED 16 · watch 4 · earnings 3` from bridge CSV + earnings calendar. Real link affordance (hover state + cursor), navigates to the relevant section. Small dot marker on any count/pill that changed since last visit (localStorage snapshot) — "what changed since I last looked".
Data: one `/api/status` aggregate route polled every 60s, with **per-check timeouts (~1.5s) and a 5–10s server-side cache** so one dead dependency degrades one dot, never blocks the strip.

## 2. IBKR Gateway 4002 (paper — labeled as such)
- 4002 = IB Gateway **paper** (4001 = Gateway live, 7496 = TWS live). User wants 4002; quote/price subs work identically on paper gateway.
- One constant via env `IBKR_PORT` (default **4002**); sweep hardcoded 7496/4001 in `dashboard/app/portfolio/page.tsx`, argus quote modules, odte backend (`connector.py`, `settings_store.py`), launchd plists.
- **Relabel** portfolio/positions UI "paper" (page currently mislabels 4002 as live — `portfolio/page.tsx:79`). Switching to live later = set `IBKR_PORT=4001`, label follows the port.

## 3. Session-aware % change
- Shared helper `lib/changeBasis.ts`: given instrument class (US equity / index future) and now(NY):
  - **Session open**: change vs previous regular close = current-day gain/loss.
  - **Closed/overnight**: last completed session close vs its prior close = past-day gain/loss, muted `prev` suffix.
- API routes return `last`, `lastClose`, `prevClose`; client picks basis. Applied in QuoteRow, rails, ODTE spot, portfolio.

## 4. Morning brief upgrade — Day Ahead (`MorningReport.tsx` + brief job)
- **Overnight tape**: ES/NQ/RTY % + implied SPY/QQQ gap direction/size ("Gap +0.3% · ES +0.4 · NQ +0.8 · RTY −0.2"). Table-stakes for the 0DTE workflow (reviewer #3).
- **Econ events today** with NY times + importance (WS-3c data).
- **Earnings today + tomorrow**, BMO/AMC split, **impact-ranked** (watchlist membership first, then market-cap/IV proxy), top 3 highlighted, rest collapsed.
- **Expected moves**: SPY/QQQ straddle-implied daily move (existing Argus odte routes).
- **GEX risk line**: one sentence, sticky vs squeezy ("Net GEX +1.5B, spot above zero-gamma — dips likely bought" / "below zero-gamma — moves extend"). Derived from same inputs as ODTE Levels verdict (shared function).
- **What to expect**: data-first actionable line, not regime prose — "Gap +0.5%, RTY lagging, FOMC 14:00, 2 watchlist earnings AMC". LLM polish optional; template is the fallback and the contract.
- **Watchlist news links**: names with a fresh catalyst today link to their news.

## 5. Tabs
- Delete `app/performance/`, `app/sources/` + nav links + `components/sources/` (grep for shared API consumers before deleting routes).
- New `app/rotation/` tab: RRG chart + sector table (existing data). Trail history **cut** from scope (rotation is a once-daily signal; trail adds little — reviewer #3). Today keeps a one-line rotation summary linking to the tab.

## 6. ODTE overhaul (`app/odte/` → two pages)
**Data wiring (reviewer #2)**: verdict cards source from the **existing Argus routes** (`api/odte/gex|pcr|unusual`); odte backend `:8788` supplies spot/MSI/health only. The strikes page needs a **new odte REST endpoint** — per-underlying, multi-expiry (today + next ~3 expiries) strike ladder — since `:8788` currently holds one active symbol and 0–1 DTE only; building that endpoint is part of Phase C, scoped read-only.

**Page 1 — Overview** (`/odte`):
- Verdict cards: **Spot/Regime**, **Levels**, **Shape/Skew**, **Flow/Stats**, plus **Companion grid** as a 5th top-level card (multi-underlying 2×2 — not nested inside another card).
- Each card: status (good/neutral/caution) rendered as a **left-border accent** — deliberately distinct from the round health dots so "market read" never looks like "service down" — plus one plain-English line and 2-3 key numbers.
- Verdicts come from one shared pure contract per card: `derive(inputs) → {status, sentence}` — single seam for logic, language, and unit tests; no per-card drift.
- Cards render only with data; missing source = one muted line ("no data — IBKR feed down"). No N/A grids.
- **Expand rule**: a card expands in-place to a *summary* of its detail (top strikes/walls, mini chart, "why this matters" explainer) and always contains an "Open strikes →" link; the strikes page is the only full-detail destination. One mental model: expand = more context, navigate = full data.
- Decision Assist + Compare Tray collapse into one compact action row.
- Underlying selector (SPY/QQQ/IWM/DIA + SPX/NDX/RUT/DJX) persists across both pages.

**Page 2 — Strikes** (`/odte/strikes`):
- Per-underlying ladder: expiry tabs (today + next ~3), rows with OI, volume, GEX contribution, MTC/MSI markers.
- Walls + zero-gamma row get the **only** strong highlight (no competing ATM/ITM bolding); rows capped ~40 around spot with scroll, virtualize only if perf demands.
- Replaces the embedded options_analysis page entirely; native components, one visual language.

## 7. Standalone Tauri app
Framing: **a native window over locally-managed services** — Tauri bundles the Next server only; Argus (:8088), odte backend (:8788), IBKR Gateway, and the nightly pipeline stay launchd-managed as today (odte already has its own PyInstaller path; no second packaging of Python backends).
- Next.js `output: "standalone"`; Node sidecar on a local port; window loads it.
- **better-sqlite3**: explicitly copy the prebuilt `.node` binary into the standalone bundle (file-tracing misses it); verify at cold start.
- **DB access**: app connection opens **readonly**; schema migrations move to the ingest pipeline (currently `openDb` runs CREATE/ALTER on open — a write-lock race with the nightly writer); busy_timeout raised.
- **Env**: absolute `ARGUS_DB`, `MARKET_REVIEW_DIR`, `IBKR_PORT` injected via tauri.conf sidecar env — never cwd-relative (cwd inside a bundle ≠ repo).
- **Lifecycle**: sidecar bound to window (kill on quit); port pre-flight with fail-fast or auto-increment (a stale instance or `npm run dev` must not brick startup).
- Dev flow (`npm run dev`) unchanged.

## Phasing (each shippable)
- **A.** Context strip + %-basis + port 4002/paper relabel + tab removal + rotation tab.
- **B0.** Day Ahead core: overnight gap/futures, earnings ranked, events, expected moves, synthesis line.
- **B1.** Day Ahead extras: GEX risk line, watchlist news links.
- **C.** ODTE overhaul: verdict cards + new strike-ladder endpoint + strikes page; remove embed.
- **D.** Tauri packaging.

## Testing
- Unit: changeBasis (session boundaries, weekend/holiday), `/api/status` (timeouts, cache, four dot states), verdict derivation contracts, strike-ladder endpoint.
- Manual: strip all-green/degraded/expected-stale, ODTE with sources down, strikes across underlyings/expiries.
- Packaging: cold-start .app with no dev servers; readonly DB concurrent with a pipeline write; quit leaves no orphan sidecar/port.
