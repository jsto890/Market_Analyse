# Platform v2 — Master Plan

_2026-06-12. Status: drafted from user feedback session; 3-agent adversarial review integrated (architect-reviewer: data plane + job topology; quant-analyst: backtest leakage, survivorship, GEX/unusual-score statistics; ui-designer: rail layout, hierarchy, progress-meter readability). Awaiting user approval._

This document is the single source of truth for the next major round of work. It covers: a full review of every feedback item with root-cause analysis, the design for each workstream, exact implementation steps, who (which agent) works on what, what data/access each piece needs and how to get it, knowledge sources each agent should consult, sequencing, and open questions that need a user decision.

---

## 0. The strategic shift

Previous positioning (OVERVIEW.md, `project_positioning` memory): *Argus = ticker discovery + long selection, not trade management.*

**That positioning is now superseded by explicit user direction.** The goals are:

1. Keep the discovery edge (sentiment + technicals + fundamentals finds the names — this works: separating bad setups from good ones is validated).
2. **Add a precision entry/exit layer** — a second, independent model that answers *when* to buy and *when* to get out, on any ticker, on any timeframe. Long-only: "short" means *exit the long*, never a short position.
3. **Become a live trading terminal** — persistent market rails (indices/futures/forex + sessions), streaming news with macro sentiment, options intelligence (relative unusual activity, gamma levels), index 0DTE hub.
4. **Eventually trade automatically** — long-only swing entries/exits through IBKR, gated behind validation and paper trading.

Discovery (sentiment bridge) and trade-timing (new Position Engine) stay **separate models**. The bridge keeps finding names; the Position Engine times any name. This separation makes the Position Engine backtestable on arbitrary tickers/periods, independent of the sentiment pipeline's history. **Important caveat (quant review):** ticker-count is *not* sample-count — equity returns are cross-sectionally correlated, so the effective number of independent observations is bounded by the number of distinct market regimes traversed in the test window, not by how many tickers you run. Confidence intervals must be sized by block-bootstrap over time, never by ticker count. "Lots of tickers" buys breadth of evidence, not statistical infinity.

---

## 1. Feedback review — every item, with root cause

### 1.1 Bugs (verified in code / live API on 2026-06-12)

| # | Symptom | Root cause | Fix direction |
|---|---------|-----------|---------------|
| B1 | 3M/1Y/2Y chart buttons "don't work" | Two compounding issues. (a) Each button refetches from `/api/argus/history` — verified the API itself returns correct bars for all periods, but when the Argus API is slow/down the button silently shows a tiny "failed to load" note and does nothing. (b) `CandleChart.tsx` hydrates `activePeriod` from localStorage but the server-rendered `initialBars` are a fixed period — pill state and data disagree on load. | Fetch **2Y daily once**, switch ranges client-side via `timeScale().setVisibleRange()`. Zero refetch, zero failure mode, instant switching. |
| B2 | 200MA toggle does nothing | `computeEma()` returns `[]` when `closes.length < period`. 3M ≈ 64 bars, 6M ≈ 126 bars — EMA-200 can mathematically never render on the default view. | Same fix as B1: compute all EMAs over the full 2Y series; display window is independent of indicator lookback. |
| B3 | Today tab: some ticker rows collapse to a clickable sliver | Suspect the expandable-row `max-height` animation in `DataTable.tsx` (`maxHeight: 0 / overflow: hidden` row pairs) interacting with the sticky first column `bg-inherit`; needs a Playwright repro before fixing — do not guess-fix. | Repro → fix → add a visual regression check for row heights. |
| B4 | Sources tab empty | `dashboard/app/api/accounts/route.ts` reads a hardcoded path in the **wrong repo**: `/Users/josephstorey/Market_Review/reports/account_backtest.csv`. The file exists in neither repo; nothing in Market_Analyse generates it. Route silently returns `{accounts: []}`. | Port/build the account-trust backtest artifact into this repo's pipeline (`run_daily.sh` step → `reports/account_backtest.csv`), make the path env-configurable, and render a designed "no data yet — generator last ran X" state instead of silent empty. |
| B5 | "Pricing since ticker was called" looks weird | `Header.tsx` renders a bare `+X% since` string; `HistoryCard` shows `then→now` columns without context (entry basis, date, holding days). | Redesign as one coherent text element: "Called 2026-05-21 @ $42.10 → now $48.77 (**+15.8%**, 16 trading days)". No header sparkline (UI review: the full chart directly below *is* the sparkline — a header mini-chart duplicates it at lower fidelity). Same text component reused on watchlist rows; per-appearance detail stays in `HistoryCard`. |
| B6 | Unusual calls/puts empty during Sydney daytime | The unusual filter is **same-day volume based**. Sydney daytime = US overnight → today's chain volume ≈ 0 → empty list. Not an IBKR issue (verified: flow endpoint serves yfinance data fine overnight). | §3 Options Intelligence: relative-unusual model + EOD snapshots so overnight shows yesterday's recap, clearly labelled. |
| B7 | Options panel mislabels failures | The panel's only error state says "IBKR offline" but the data source is yfinance via Argus. | Correct copy + distinguish "Argus API down" / "no chain data" / "market closed, showing last snapshot". |
| B8 | Chart lacks context info | No session/volume info under chart. | Chart info strip — designed in WS-0. |

### 1.2 Feature requests, restated precisely

- **F-A. Entry/exit precision (the centrepiece).** Catch names *just before* the rally leg; exit before/early-in drawdown. Replace PRIME_LONG / STANDARD_LONG / WATCH (which the user perceives as one bucket — see WS-4 for what they actually encode and why the perception is still right) with a four-state machine: **WEAK / WAIT / LONG / EXIT**. While LONG: show *trade progress* — where price sits between stop and target, with a live strength/accuracy read on the model (sudden intraday/intraweek deterioration must surface). Stop/target set from historical price action + technicals + catalysts; reviewed in real time, not fire-and-forget. Backtestable on any ticker, any period, any candle size; buy/sell markers visible on the ticker chart; iterate across timeframes. Reference baselines to beat: 200SMA-touch DCA entry; Bollinger-band / standard-deviation / Fibonacci-extension exits.
- **F-B. Index 0DTE as a first-class dashboard section** — not a link-out. Underlyings: SPX/SPY, NDX/QQQ, **IWM/RUT**, **DJX/DIA**.
- **F-C. Catalysts always present** — every ticker view shows 1–3 catalysts (last earnings result, analyst upgrades/downgrades, events).
- **F-D. Options intelligence** — relative unusual activity (vs the strikes around it, vs that contract's own baseline), last pricing on every row, a "review of the day" after the close, **gamma levels** (zero-gamma flip, call/put walls) as daily levels to watch.
- **F-E. News + macro layer** — user's Discord financial-news bot as a live feed; right-side continuous news scroll (scrollback, breaking news highlighted red); per-ticker news feed (yfinance + IBKR) on the ticker page; full **macro sentiment model** (global / US / sector, multiple time ranges) built from the news stream + fundamentals/technicals; **morning macro market report** in the style of the Discord bot's report (futures snapshot, headlines, what to expect today: economic calendar + earnings); **whale alerts**.
- **F-F. UI shell overhaul** — persistent **left rail**: live ticker feed (indices SPY/QQQ/IWM/DIA with pre/reg/after-market state; futures ES/NQ/YM/RTY + VIX + Crude + Bitcoin; main forex pairs with NY/LDN/ASIA session indicator), macro sentiment gauges, "what to expect today" (econ + earnings). Persistent **right rail**: news scroll. Both rails visible on every tab, individually minimisable. Plus a general UI-quality ramp: install dedicated UI agents/knowledge bases; more info under the chart (volume, pre/after/regular-market session data).
- **F-G. Automated swing trading (end state)** — long-only, in and out of bullish names, sector-rotation aware, good exits to avoid holding through drawdowns. Strictly gated: model validation → paper → small live.

---

## 2. Architecture overview

### 2.1 New components

```
Market_Analyse/
├── argus/                      (existing FastAPI :8088 — extended, not rewritten)
│   └── argus/
│       ├── options_intel/      NEW: chain snapshotter, relative-unusual scorer, GEX engine
│       ├── news/               NEW: Discord ingester, yfinance/IBKR news pollers, macro scorer
│       └── position_engine/    NEW: state machine, level model, backtest harness, health monitor
├── dashboard/                  (existing Next.js :3000 — shell + new pages)
│   ├── app/odte/               NEW: index 0DTE hub
│   ├── components/rails/       NEW: LeftRail (tickers/sessions/macro), RightRail (news)
│   └── components/position/    NEW: state badge, trade-progress meter, marker layers
└── scripts/                    snapshot/ingest jobs wired into launchd + run_daily.sh
```

### 2.2 Data stores — one SQLite DB, with an explicit cross-language contract

**Architect-review finding (HIGH, adopted):** the "shared DB" is currently fiction. `dashboard/lib/db.ts` defaults to `../argus.db` (not `market.db`, which is 0 bytes); Python's only SQLite writer (`argus/argus/alerts/log.py`) opens connections with **no WAL and no busy_timeout**; nothing pins the two runtimes to the same file. Three different DB paths are possible today. Before any ingester is built, the **data-plane contract** below is a gating deliverable (Phase B-0, §5):

1. **One canonical absolute DB path** from a single `ARGUS_DB` env var consumed by both runtimes (set in `.env` and every launchd plist). Relative-path defaults removed; both sides log the resolved absolute path at startup and assert it exists.
2. **WAL set once at DB creation** (persists in the file header); every Python connection sets `PRAGMA busy_timeout=5000` and `synchronous=NORMAL` via one shared `argus/db.py` helper — no bare `sqlite3.connect()` anywhere.
3. **Short, batched, explicitly-committed transactions** in ingesters; never hold a write txn across a network/yfinance call.
4. **Backtest sweeps never touch the live DB** — they run against per-run files; only validated aggregate stats get promoted (see WS-4).
5. **`heartbeats(job, last_run_ts, status, detail)` table**: every scheduled job writes a heartbeat; the dashboard renders freshness badges ("snapshotter last ran 14h ago — baseline 12/20 sessions"). Silent gaps must surface — that is the B4/B6 lesson generalised.
6. **Secrets** (Discord token, future API keys, IBKR creds) live in one git-ignored `.env` resolved by both runtimes — never in plist `EnvironmentVariables` (world-readable), never in the DB, never in the repo. DB files confirmed git-ignored before real data lands.

| Table | Purpose | Written by |
|---|---|---|
| `news_items(id, ts, source, ticker?, headline, body, url, tags, is_breaking)` | unified news stream | news ingesters |
| `macro_sentiment(ts, scope, score, n_items, window)` | scope = global/us/sector:XLK… | macro scorer |
| `options_snapshots(ts, symbol, expiry, strike, type, oi, vol, last, bid, ask, iv)` | EOD + intraday chain snapshots | snapshotter |
| `unusual_activity(ts, symbol, contract, score, basis)` | scored relative-unusual rows | unusual scorer |
| `gex_levels(date, symbol, zero_gamma, call_wall, put_wall, total_gex, profile_json)` | daily gamma levels | GEX engine |
| `position_signals(ts, ticker, state, entry, stop, target, progress, health, model_ver)` | WEAK/WAIT/LONG/EXIT stream | position engine |
| `trades(id, ticker, side, qty, entry_ts, entry_px, exit_ts?, exit_px?, mode)` | mode = backtest/paper/live | position engine / executor |
| `econ_calendar(date, time, name, importance, actual?, forecast?, prior?)` | what-to-expect | calendar ingester |
| `heartbeats(job, last_run_ts, status, detail)` | job freshness, rendered as badges | every scheduled job |

### 2.3 Live data flow to the UI

Polling first, sockets later — the rails update on human timescales:

- **Quote rail:** one batched `yf.download(...)`/`fast_info` poll every 30–60s (single Argus endpoint `/api/rail/quotes` returns the whole basket: indices, futures `ES=F NQ=F YM=F RTY=F CL=F ^VIX BTC-USD`, forex `EURUSD=X` etc. with `prepost=True`). IBKR upgrade path when Gateway is up.
- **News rail:** dashboard polls `/api/news?after=<cursor>` every 20–30s; the cursor is the autoincrement `news_items.id` (monotonic, dedupe-safe across backfills — not `ts`); on reopen after hours away the backlog is capped (last 200 items or 24h, whichever smaller) with "load older" pagination. SSE upgrade only if polling feels laggy in practice.
- **Session/market-state logic** is pure client-side time math (NY/LDN/ASIA sessions, pre 4:00–9:30 ET, regular, after 16:00–20:00 ET) — no data dependency, must handle the user's Sydney timezone explicitly (render both ET and local).

### 2.4 Job topology — the sleeping-laptop problem (must be solved before WS-1)

**Architect-review finding (HIGH, adopted):** the plan's core jobs (snapshots 15:50 ET / close / hourly; morning report 08:00 ET) all fall in the middle of the Sydney night, when this laptop is most likely asleep. The existing launchd job (`com.market-review.daily.plist` — note: the daily driver currently lives in the **Market_Review** repo, not this one) uses `StartCalendarInterval` with no catch-up: jobs scheduled while asleep simply don't run. The relative-unusual baseline needs ~20 consecutive trading days of snapshots — a silently gappy snapshotter produces a *quietly wrong* scorer, which is worse than an empty one.

Mitigations, in order, all landing in Phase B-0:

1. **`pmset` scheduled wakes** aligned to the ET snapshot times (`pmset repeat wakeorpoweron …`), jobs wrapped in `caffeinate` so the machine stays up long enough to finish.
2. **Idempotent, self-healing jobs:** on every start, each job checks its `heartbeats` row and backfills what is still fetchable (EOD chains for missed days are re-fetchable; intraday is not — the unusual-score baseline is therefore designed to tolerate gaps: "≥N of last 20 sessions present" rather than "20 consecutive").
3. **Freshness rendered in the UI** (heartbeat badges, §2.2.5) so a missed night is visible the next morning, never silent.
4. **Decision point (Q6, elevated):** if ≥Gate-2 automation is pursued, a small always-on box (Mac mini / VPS) becomes mandatory — paper trading cannot run on a sleeping laptop. Costed at WS-7 kickoff, not after.

Also in B-0: consolidate the daily driver — `run_daily.sh` orchestration moves into (or is mirrored in) this repo so Market_Analyse owns its own schedule; this also resolves the B4-class cross-repo path confusion at the root.

### 2.5 What stays untouched

Sentiment bridge pipeline, report generation, Obsidian export, screener, performance page internals, trust-tier methodology. The bridge's *outputs* gain a `position_state` column once the Position Engine ships (WS-4), but the discovery pipeline itself does not change in this round.

---

## 3. Workstream designs

### WS-0 · Bug sweep (B1–B8)

Everything in §1.1, plus the chart info strip (B8): under the chart, one compact row — last close, day range, volume vs 20d-avg volume ("1.4× avg"), pre-market / after-hours price + % when in those sessions (yfinance `prepost` data already flows through `/api/history` with `interval=1m, prepost=True` for the realtime endpoint), and 52-week position. Range buttons switch to client-side visible-range (B1) which also makes 1W/1D candle-interval additions cheap later.

**Acceptance:** Playwright pass over Today + ticker + sources pages, all period buttons, 200MA on every period, no sliver rows, sources table populated (or designed empty state), since-called element shows date/basis/days.

### WS-1 · Options intelligence

1. **Snapshotter** (`argus/options_intel/snapshot.py`): pull chains for tracked symbols (today's bridge tickers + watchlist + the four index underlyings) at 15:50 ET (pre-close), at close, and hourly intraday; persist to `options_snapshots`. launchd job, ET-scheduled.
2. **Relative-unusual scorer** — replaces the naive same-day volume filter. Quant review rejected the first-draft design (`vol/OI` z-scores vs 10 adjacent strikes) as statistically unsound: `vol/OI` explodes on tiny-OI contracts, raw adjacent strikes mix incomparable moneyness levels, and mean/std z-scores on heavy-tailed counts flag the low-OI tail constantly — trading "too empty" for "too noisy". **Adopted design:**
   - Score on `log1p(vol)`, not `vol/OI`, to tame the tail; contracts need `OI ≥ 50` to be eligible at all.
   - Two robust components: (a) **cross-sectional** — contract vs neighbours of *similar moneyness* (strikes within ±2% moneyness, same expiry), using **median + MAD** (robust z); (b) **own-baseline** — robust z of today's `log1p(vol)` vs that contract's snapshot history, requiring **≥10 non-zero-volume days** or the term is suppressed and flagged "insufficient history".
   - Persistence bonus (unusual ≥2 consecutive days ranks higher). Output ranked rows with score basis in plain words ("3.8 robust-σ vs similar-moneyness strikes; 2nd day").
   - **Acceptance criterion:** on a hand-labelled validation week, top-ranked rows must be genuinely unusual, not low-OI noise — this is checked before the panel ships.
   - When US market is closed: serve the **latest close snapshot**, banner "as of yesterday's close (US)" — never an empty table again (B6).
3. **Row enrichment:** last, bid/ask, %change, IV per unusual row — *the data is already in the API payload*; the UI just never rendered it.
4. **Day review:** post-close summary per symbol — P/C volume vs 20d avg, IV change, biggest OI changes (today's OI vs yesterday's snapshot = where positioning actually moved), top unusual contracts recap. Renders in the ticker Options panel + the 0DTE hub.
5. **GEX engine** (`argus/options_intel/gex.py`) — quant review corrected the first-draft formula (units error + asserted sign convention). **Adopted design:**
   - **Profile by spot sweep:** sweep candidate spot S′ over a ±15% grid; at each S′, `GEX(S′) = Σ_strikes BS_gamma(S′,K,T,σ) × OI × 100 × S′² × 0.01 × dealer_sign`. Gamma is *re-evaluated at each candidate spot* — holding gamma fixed at current spot makes the flip point wrong.
   - **Zero-gamma flip** = the S′ where GEX(S′) crosses zero. **Walls** = strikes with max |gamma × OI| (the S′²·0.01 constant cancels in the argmax — wall location does not depend on it).
   - **`dealer_sign` is an explicit, documented assumption, not a fact:** default = the SpotGamma-style "customers buy calls and puts from dealers" convention (dealer short calls → call gamma counted negative; dealer short puts → put gamma counted positive), written down as a convention table in the module. The levels card states "model assumes dealer positioning; levels are estimates, not measurements".
   - **OI-based GEX is valid only for ≥1DTE.** OI settles overnight; 0DTE positioning is intraday volume that never reaches OI, so an OI-based 0DTE profile describes *yesterday's book*. v1 therefore publishes GEX levels for the **next non-zero-DTE expiry**, and the 0DTE hub labels its card "OI-based — reflects overnight book, not today's flow" (see WS-5 and Q8).
   - Implementation: scipy norm pdf directly or `py_vollib`; daily levels land in `gex_levels`, rendered as horizontal lines on index charts + a levels card ("watch 5,980 — zero gamma; 6,050 call wall").

**Knowledge sources:** SpotGamma/Menthor-Q public methodology write-ups for GEX conventions; CBOE white papers on 0DTE flows; `py_vollib` docs; existing `~/OptionsAnalysis/backend` (it already speaks IBKR options websocket — reuse patterns, don't reinvent).

### WS-2 · UI shell: rails + quality ramp

**Layout** (in `dashboard/app/layout.tsx`, wrapping every page):

```
┌──────┬────────────────────────────────┬──────────┐
│ LEFT │  existing page content         │  RIGHT   │
│ rail │  (Today / ticker / 0DTE / …)   │  rail    │
│ 200px│                                │  260px   │
│ [⟨]  │                                │  [⟩]     │
└──────┴────────────────────────────────┴──────────┘
```

Widths per UI review: 200px left + 260px right (the first-draft 240/300 would have left under ~640px of content on a 1280px laptop — below what the chart column and 7-column DataTables need). **Below a 1440px viewport, both rails default to their minimised strip on first visit**; each rail's state persists independently in localStorage.

- **Left rail, top→bottom — ordered for the Sydney-morning scan** (UI review: the first question at 7 AM AEST is "did anything blow up overnight", and overnight that answer lives in futures, not in closed-market equity prints):
  1. **Futures block** — ES NQ YM RTY, VIX, CL, BTC (these move while Sydney is awake; first read);
  2. **one-line market blurb** (auto-generated from macro model, §WS-3) — always shows its generation timestamp at full visual weight, amber stale-treatment when >3h old (overnight news volume is thin; a stale blurb without an age read misleads);
  3. **US equity block** — SPY QQQ IWM DIA, price + day% + session badge (PRE/REG/AFTER), with an explicit **CLOSED state label** so stale prices read as stale;
  4. **forex block** — EURUSD USDJPY GBPUSD AUDUSD with active-session chip (ASIA/LDN/NY) and session-overlap highlight;
  5. **macro sentiment gauges** (global/US/sector top-mover) once WS-3 ships;
  6. **"Today" block** — next economic events (time-to-event countdown), earnings before-open/after-close.
  Each block collapsible; whole rail minimisable to a 36px strip showing only SPY/QQQ/VIX deltas.
- **Right rail:** reverse-chron news stream; each item: time, source chip, headline, optional ticker chips that link to `/t/[ticker]`; **breaking** items get a red left-border + "BREAKING" tag for 10 min — *labelled shape + border, no pulse animation*, so it can't be mistaken for a position-P&L red (the UI reviewer recommended amber to keep red purely data-semantic; the user explicitly asked for red, so red-with-label ships first and falls back to amber if it proves confusing in live use); infinite scrollback (cursor pagination over `news_items`); filter row (all / tickers-I-follow / macro). Minimisable; unread-count badge when minimised.
- **Timezone display hierarchy** (applies everywhere, not just rails): **Sydney local is primary**, ET secondary in muted text — `7:42 AM (4:42 PM ET)`. Session badges (PRE/REG/AFTER) are already semantic; they get an ET tooltip on hover rather than an inline second timestamp. Never two timestamps at equal weight.
- Rails are server-skeleton + client-SWR, isolated from page re-renders; on narrow viewports they become drawer overlays. Page content max-width loosens — the dead side margins the user flagged are what the rails occupy.
- **UI quality ramp (explicit step):** before rail implementation, run a short design pass: `agent-installer` checks awesome-claude-code-subagents for additional UI/design agents worth installing; `design-bridge` pulls 2–3 reference DESIGN.md specs (terminal-style aesthetics: TradingView, Bloomberg-terminal-inspired, Linear-dark) to ground the visual language; `ui-designer` produces the rail component spec against the existing token sheet (spec §4.8 of the 2026-06-11 design) so the rails *extend* the design system, not fork it. All UI built under the `frontend-design` skill discipline.

### WS-3 · News + macro sentiment

1. **Discord ingest** (`argus/news/discord_ingest.py`): a small read-only Discord client reusing **discord_copytrade's existing auth pattern and credentials** (`~/discord_copytrade/.env` — secret; referenced, never copied into this repo, committed, logged or echoed). Primary source: the news channel `1514793336513495050` (server `1508333182112501844`) → headline messages parsed into `news_items`. Optional secondary sources (Q4/Q5): the private group's Market Report bot and whale-watch tracker bot channels — **personal-use ingest only** (the user is a member); they are cross-checks, never structural dependencies, and their content is never republished outside the local product. This is a **different process model from every other job** — a persistent gateway websocket, not a scheduled batch. It runs as a supervised long-lived service (`launchd KeepAlive=true`), and its reconnect contract is explicit: on every (re)connect it **backfills channel history since the last stored item for that source**, so sleep/disconnect windows self-heal instead of silently dropping messages.
2. **Per-ticker news** — already half-built: `argus/data/ibkr.py: historical_news()` exists; add yfinance `Ticker.news` merge, dedupe by title-similarity, new Argus endpoint `/api/news/{symbol}`, rendered as a News card on the ticker page (every ticker, not just bridge names).
3. **Macro sentiment model**, two stages: **v1 (ship fast):** FinBERT (local, free, no API cost) scores every `news_items` headline; aggregate EMA-weighted by scope — global / US / sector (ticker→sector via existing mapping; macro keywords→scope rules) — over 1h/1d/1w windows into `macro_sentiment`; left-rail gauges + a `/macro` detail page with score-over-time charts vs SPX. **v2 (after validation):** LLM meta-read on top headlines per scope, in the style of the Discord bot's morning paragraph, cached hourly (cost-controlled like the existing meta-analyst with its 60-min cache).
4. **Our own economic calendar** (`argus/news/calendar.py`) — the "What to Expect Today" data is built in-house, not parsed from anyone's bot (Q4). Sources, all free and official: BLS release schedule (CPI, PPI, employment situation — published a year ahead), FOMC meeting calendar (federalreserve.gov), BEA release schedule (GDP, PCE), DOL weekly jobless-claims cadence, plus yfinance earnings calendar for tracked names. A yearly-refresh scraper for the schedules + a daily job that marks today's events; importance tiers hand-assigned per event type (CPI/FOMC/NFP = high). Actual-vs-forecast values are out of scope for v1 (that's what paid APIs sell); the calendar answers *what is scheduled and when*, which is what the left rail and morning report need.
5. **Morning macro report:** generated 8:00 AM ET from `macro_sentiment` + rail quotes + `econ_calendar` + earnings — rendered as the dashboard's landing header block and appended to the daily Obsidian report. Format follows the Market Report style the user likes (futures snapshot, one-paragraph read, headlines, what to expect, earnings) — generated entirely from our own data.
6. **Whale alerts:** the relative-unusual scorer (WS-1) already finds them per-symbol; whale alerts = cross-market top-N by **premium traded** (vol × last × 100) filtered to score > threshold, streamed into `news_items` with `source=whale` so they appear inline in the news rail with a 🐋 chip. v1 scans only tracked symbols (snapshot universe); full-market sweep scanning needs a paid flow feed (deferred, Q5). Supplementary: the private group's whale-watch tracker channel can be ingested via item 1 as `source=whale_discord` rows (personal use, optional, channel ID pending). The two streams stay distinguishable in the rail.

**Knowledge sources:** discord.py docs (Context7); FinBERT model card (ProsusAI/finbert); the existing `sentiment_bridge.py` aggregation patterns; the Discord bot's message format (live samples from the channel).

### WS-4 · Position Engine (entries, exits, the new taxonomy)

**What PRIME/STANDARD/WATCH actually encode today** (`argus/argus/action_card/builder.py:_classify_action`): PRIME_LONG = strong combo + weekly-L + favourable regime (backtested 55.3% WR vs 35.7% without weekly confirm); STANDARD = solid-but-not-prime; WATCH = long signal, weak/extended setup. They are *not* identical — but they are all **static labels about setup quality at scan time**. The user's real complaint stands: none of them say *act now*, *how far along is the move*, or *get out*. That's a different kind of model — a **state machine over time**, not a label at a point in time.

**New taxonomy** (per ticker, re-evaluated on every bar of the operating timeframe):

| State | Meaning | Display |
|---|---|---|
| `WEAK` | bearish/broken structure — do not touch | grey badge |
| `WAIT` | constructive but no entry trigger yet | amber badge + "what would trigger" line |
| `LONG` | entry triggered, position should be on | green badge + **progress meter** |
| `EXIT` | close the long (target, stop, or health-based early exit) | red badge + exit reason |

**Progress meter** (the "how far into the long are we" stat) — first-draft design (−100% stop → 0 entry → +100% target on one bar) was rejected by both the quant and UI reviews: the denominator moves when stops trail, DCA means there is no single entry, and a healthy at-entry position visually reads as "0% / in loss". **Adopted design — two decoupled readings, never one bar meaning both:**
- **Reward progress:** bar from 0 (stop) to 100 (target) with the entry marked as a tick; position = `(price − avg_cost) / (target − avg_cost)` mapped onto that scale, where `avg_cost` is volume-weighted when DCA legs exist. **Primary label is the R-multiple** (e.g. "+0.7R", basis = original risk), which traders read natively; the bar is the spatial backup.
- **Risk state:** a separate chip for the *current* (possibly trailed) stop — "stop +0.4R · locked". When a target is recomputed, the prior progress value is frozen with a visible "target moved" marker so the bar never silently rescales.
- Alongside both, **health**: a 0–100 score from the real-time monitor (below). All shown on ticker page header and Today table.

**Levels model:** entry/stop/target from ATR-scaled structure (swing lows, EMA bands, volume nodes) + catalyst proximity (no fresh entries straight into earnings unless explicitly flagged) — building on the existing adaptive stop/target work rather than replacing it. Stops/targets are *recomputed but sticky*: they only move per defined rules (e.g., trail after +1R), never silently.

**Real-time health monitor:** while LONG, score deterioration signals on intraday/daily data — relative volume on down moves, loss of the entry's anchor level, bearish engulfing at resistance, sector RS rollover, market-regime flip. Health < threshold ⇒ EXIT (early), independent of stop. This is the "sudden intraday or intraweek weakness that suddenly pops up" requirement.

The quant review flagged the health monitor as **the single largest overfitting surface in the plan** (five qualitative signals + a free threshold = 6+ degrees of freedom tunable to the backtest). Adopted discipline — it ships in two stages:
- **Stage 1 (validation):** each candidate deterioration signal gets a *precise* definition (exact engulfing rule, exact loss-of-anchor rule, exact RV threshold) and is tested **individually** as a standalone exit overlay against the no-health baseline. Only signals that independently improve OOS expectancy graduate.
- **Stage 2 (combination):** graduated signals combine with a fixed, pre-registered weighting — no post-hoc threshold search (any fitted threshold consumes a walk-forward fold).
- **Calibration is censoring-aware:** health both triggers exits *and* gets evaluated, so post-exit returns are censored. Health-triggered exits are compared against what the baseline exit would have returned *on the same trades* — never against unconditional forward returns.

**Backtest harness** (`argus/position_engine/backtest.py`): runs the full state machine over any ticker list × any period × any candle interval (1d first; 1h/15m later), producing per-trade logs (entry/exit ts+px, R, MAE/MFE, holding days) and aggregate stats (WR, avg R, expectancy, exposure, max DD, vs buy-and-hold of the same ticker, vs SPY). Quant review of the inherited `tools/backtest/` machinery found two leakage vectors and a survivorship problem that are now **hard rules**:

- **Fill convention — no signal-bar fills, ever.** The existing `backtest_selections.py` enters at the signal-day close — but the signal is computed *from* that close: one-bar lookahead. Rule: signals compute on bar T's completed data; **entry executes at bar T+1 open**. Stops/targets that gap through fill at the *open*, not at the level (overnight gap risk is real for swing trades). Health-monitor exits likewise execute T+1 open. A leakage unit test (shuffle future bars → OOS edge must collapse to ~zero) is part of the harness test suite.
- **Costs modelled, not ignored:** expectancy reported **net of modeled slippage + commission**; the harness's default report is OOS-net numbers — in-sample or gross figures require an explicit flag.
- **Survivorship — point-in-time universes only.** "Current S&P 500 members over 2 years" silently excludes every delisted loser. OOS universes must be point-in-time constituents (membership as of each backtest date, delistings included) or an explicitly liquidity-floored random sample of all-listed names with the residual bias stated. **"Past bridge picks" is disallowed as an independence universe** — the bridge pre-filtered for bullish setups, so testing only on its picks is selection bias that contradicts §0's independence claim; it may be used as a clearly-labelled *secondary, discovery-conditional* diagnostic only.
- **Engine decision is a design-phase deliverable** (vectorbt vs extending `tools/backtest`) — decided in WS-4's design weeks, before code, since the trade-log schema, `position_signals`/`trades` shapes and chart-marker contract all hang off it. Backtest sweeps write to per-run files, never the live DB (§2.2.4).
- **Baselines first:** the user's 200SMA-touch DCA entry; Bollinger/σ-band/fib-extension exits; plus ATR trailing stop and time-stop as controls. Every "improvement" must beat baselines OOS across ≥3 disjoint point-in-time universes before adoption.

**Chart integration:** historical state transitions render as chart markers (▲ LONG entries, ▼ EXITs) with hover detail — on any ticker page, from backtest or live signal history. This is the "when clicking into a ticker we could also see when we have said to buy and sell".

**Bridge integration & migration:** bridge CSV gains `position_state`, `entry`, `stop`, `target`, `progress`, `health` columns; Today table shows the state badge. PRIME/STANDARD/WATCH keep being computed (they remain useful as *setup-quality priors* feeding the WAIT→LONG trigger and they preserve label-efficacy history) but **leave the UI** once the state machine is validated — run both in parallel for ≥4 weeks of daily reports, then cut over (Q3).

**Model-accuracy display:** every signal row stores `model_ver`; the performance page gains a Position Engine tab — rolling WR/avg-R by model version, calibration of health score vs forward returns. "Review the strength of that model in real time" = this tab plus the health score.

**Knowledge sources:** López de Prado *Advances in Financial Machine Learning* (triple-barrier labelling, purged CV — methodology only, start rules-based before any ML); Quantpedia/Quantocracy for entry/exit study summaries; vectorbt docs (candidate engine; decide vs extending `tools/backtest`); existing `docs/weight_optimisation` + `docs/label_efficacy` work.

### WS-5 · Index 0DTE hub (`/odte`)

A dashboard page, not a link-out (supersedes the 2026-06-11 decision — the user explicitly wants it in-product). Underlyings: **SPX/SPY, NDX/QQQ, RUT/IWM, DJX/DIA**.

- **Layout: 2×2 grid** (UI review: four equal columns inside the railed content area gives each index ~150px — unreadable; a 2×2 grid gives each cell a workable half-width; a 4-across dense view is opt-in on wide screens with rails minimised). **Per-index cell:** spot + day%; today's expiry chain summary (0DTE P/C vol ratio, premium split); GEX levels card (zero-gamma, call wall, put wall) with distance-from-spot — **labelled "OI-based, reflects overnight book"** per the WS-1 0DTE limitation, with levels published from the next non-zero-DTE expiry; intraday price chart with GEX levels overlaid; top unusual 0DTE contracts (relative-unusual scorer, WS-1, volume-based so it *is* intraday-valid).
- **Data reality:** SPY/QQQ/IWM/DIA chains are reliably available via yfinance (ETF proxies; daily expiries on all four). True index options (SPX/NDX/RUT/DJX) need IBKR. **v1 ships on ETF proxies** (works overnight from Sydney, no Gateway dependency), with an IBKR upgrade layer when Gateway is connected — badge shows which source is live. DJX specifically has no free chain source → DIA proxy in v1 (Q2).
- **Relationship to `~/OptionsAnalysis`:** its QQQ ladder stays the live-execution tool; its backend patterns (IBKR options websocket subscription management) are the reference implementation for the IBKR upgrade layer. Re-evaluate merging only after the hub proves out (avoid two IBKR consumers fighting pacing limits — same constraint as before).
- The 0DTE nav link-out gets replaced by the `/odte` page; health-ping pattern reused for the IBKR-source badge.

### WS-6 · Catalysts everywhere

Data already exists (catalyst_score + five fundamental votes + catalyst details in bridge CSV; `CatalystsCard` on ticker page). Gaps to close: (1) Today table gains a catalyst chips column (the 2026-06-11 spec promised it; verify it landed, finish if not); (2) ticker header gets a one-line "next/last catalyst" strip — "Earnings May 28: beat, +12% reaction · UBS upgrade Jun 3 → $54"; (3) any-ticker coverage: catalysts currently flow only through bridge rows — add an Argus `/api/catalysts/{symbol}` (yfinance: earnings dates + history, analyst recs/upgrades) so searched tickers get catalysts too; (4) econ-calendar awareness: index-level events (CPI/FOMC days) render as catalyst chips on index/0DTE views from `econ_calendar`.

### WS-7 · Automation (end-state, strictly gated)

Three gates, in order, each requiring explicit user sign-off:

1. **Gate 1 — Signal validation:** Position Engine live signals logged ≥6 weeks **and a minimum closed-trade count set before looking (≥50)** — six weeks alone can be <30 trades, too few to separate skill from luck. The edge must hold (a) **net of modeled slippage + commission**, (b) **after subtracting the SPY-beta contribution** — a long-only strategy in an up-market beats its baselines by just harvesting beta; that fails the gate, (c) **in the down-regime subset** of the test window, and (d) with a **deflated-Sharpe / block-bootstrap confidence interval excluding zero** (López de Prado's DSR; block-bootstrap by time per §0's regime-count caveat). Calibration acceptable on the performance tab.
2. **Gate 2 — Paper trading:** executor (`argus/position_engine/executor.py`, ib_insync against IBKR **paper account**) trades the signals automatically with full risk rails: max N concurrent positions, max % equity per position, daily loss cutoff, no entries within X days of earnings, market-regime kill-switch (no new longs in risk-off), sector-concentration cap (rotation-aware sizing comes from the existing RRG work). Trade blotter page in dashboard; every order + decision logged to `trades`.
3. **Gate 3 — Small live capital:** only after paper results match backtest expectations within tolerance for ≥8 weeks. Hard kill-switch (file flag + dashboard button). Position sizing starts at minimum.

Security: IBKR credentials never in repo; gateway on localhost only; executor refuses to start if `mode=live` without a manually-created consent file. `security-engineer` agent reviews before Gate 2. **Kill-switch behaviour is itself a tested acceptance criterion** (quant review: untested kill-switches are theater): an integration test must prove that a flag flip during an open paper position halts new entries and exercises the defined in-flight-order policy (cancel-and-flatten vs let-fill — policy chosen and written down before Gate 2).

---

## 4. Who works on what — agent team plan

Per the collaborative-build directive: each workstream gets a small team — specialist builders, a reviewer from a *different* discipline (cross-examination, not self-grading), and named knowledge sources so research is grounded, broad and diverse rather than single-perspective. Orchestration: `agent-organizer`/`it-ops-orchestrator` patterns; tasks dispatched per the `subagent-driven-development` skill with `code-reviewer` gates before merge.

| WS | Builders (primary) | Review / devil's advocate | Knowledge sources to consult |
|---|---|---|---|
| 0 Bug sweep | `react-specialist` (chart, DataTable), `debugger` (B3 repro first) | `code-reviewer`; `qa-expert` writes the Playwright regression pass | lightweight-charts docs (Context7), existing smoke harness in `dashboard/scripts` |
| 1 Options intel | `python-pro` (snapshotter/scorer), `quant-analyst` (GEX maths, unusual-score design) | `data-engineer` (snapshot schema/retention), `code-reviewer` | SpotGamma/Menthor-Q GEX methodology posts, CBOE 0DTE papers, py_vollib docs, `~/OptionsAnalysis/backend` |
| 2 UI shell | `ui-designer` (spec) → `frontend-developer` + `react-specialist` (build) | `architect-reviewer` (layout/perf: rails re-render isolation), `accessibility-tester` (contrast, motion) | `design-bridge` reference specs (TradingView/Bloomberg/Linear-dark), `frontend-design` skill, existing token sheet (§4.8 of 2026-06-11 spec); `agent-installer` scans for further UI agents first |
| 3 News/macro | `python-pro` (ingesters), `nlp-engineer` (FinBERT pipeline), `api-designer` (news/calendar API shapes before build) | `error-detective` (ingest failure modes: Discord reconnects, dedupe), `code-reviewer` | discord.py docs (Context7), ProsusAI/finbert model card, live samples of the bot's message format |
| 4 Position Engine | `quant-analyst` (model + backtest design), `python-pro` (implementation), `ml-engineer` (only if/when ML enters; rules-first) | **second `quant-analyst` instance as adversarial reviewer** (overfitting hunt: leakage, survivorship, regime-dependence), `qa-expert` (test strategy for the state machine) | López de Prado (triple-barrier, purged walk-forward), Quantpedia/Quantocracy, vectorbt docs, `tools/backtest/`, `docs/label_efficacy/` |
| 5 0DTE hub | `frontend-developer` (page), `python-pro` (index data layer) | `performance-engineer` (intraday refresh load), `code-reviewer` | WS-1 outputs; IBKR API docs for index options (DJX/SPX contracts); OptionsAnalysis backend |
| 6 Catalysts | `fullstack-developer` | `code-reviewer` | yfinance earnings/recommendations API surface; existing catalyst leg design doc (2026-06-09) |
| 7 Automation | `fintech-engineer` (executor), `python-pro` | `security-engineer` (credential/kill-switch audit) **mandatory before Gate 2**, `risk-manager` (risk-rail review), `code-reviewer` | ib_insync docs (Context7), IBKR paper-trading docs, existing `argus/data/ibkr.py` |

Standing rules: every PR through `code-reviewer`; design-stage work (API shapes, model specs) reviewed *before* implementation; `debugger` is the first responder on any repro-needed bug (never guess-fix); research tasks fan out in parallel (e.g., GEX methodology + DJX data sourcing + FinBERT eval run concurrently at WS-1/3 kickoff).

---

## 5. Sequencing

```
Phase A   (week 1):     WS-0 bug sweep ──────────────► everything visible works
Phase B-0 (week 1):     DATA-PLANE FOUNDATION (gating): canonical ARGUS_DB path +
                        WAL/busy_timeout contract (§2.2) · heartbeats table ·
                        pmset wake scheduling + idempotent-backfill pattern (§2.4) ·
                        .env secrets · daily driver consolidated into this repo
Phase B   (weeks 1–3):  WS-1 options intel ──┬──► snapshots accumulating (start EARLY —
                        WS-6 catalysts ──────┘     relative-unusual needs ~20d of baselines)
Phase C   (weeks 2–4):  WS-2 UI shell + WS-3 news/macro (rails need the news feed; ship
                        quote rail first, news rail when ingest is live)
Phase D   (weeks 3–6):  WS-5 0DTE hub (consumes WS-1 GEX + snapshots)
Phase E   (weeks 4–10): WS-4 Position Engine (design → baselines → backtests → parallel run)
Phase F   (gated):      WS-7 automation (Gates 1–3, calendar time not effort time)
```

Phase A is pure debt — nothing new lands until the current product is solid. **Phase B-0 exists because of the architecture review:** the three highest-severity findings (greenfield shared DB with unsafe defaults, three possible DB paths, jobs scheduled while the laptop sleeps) all gate the ingest workstreams — an early-but-broken snapshotter accumulating three weeks of gappy data is a head start that isn't one. **No ingester writes production data until B-0 lands.** WS-1's snapshotter is deliberately early because the relative-unusual scorer needs ~20 trading days of stored baselines before it's meaningful: every week of delay is a week of missing data. WS-4 is the longest pole and runs as the steady background track once C starts; its first two weeks are *design + baseline backtests only* (no production code — engine choice, fill conventions, universe construction, per-trade schema), reviewed adversarially before the build.

Each workstream gets its own implementation plan (writing-plans skill: exact tasks, TDD steps, file-level detail) at kickoff; this master plan is the architecture + scope + staffing contract.

---

## 6. What's needed from the user

| # | Decision / input | Needed by | Recommendation |
|---|---|---|---|
| Q1 | **Discord bot access** | — | **ANSWERED 2026-06-12.** News channel ID `1514793336513495050` (server `1508333182112501844`). Credentials already exist in `~/discord_copytrade/.env` — **secret: reference that file (or copy values into this repo's git-ignored `.env`) at implementation time; never commit, log, or echo them.** The ingester reuses discord_copytrade's existing auth pattern rather than minting a new token. |
| Q2 | **DJX** chain data | — | **ANSWERED.** DIA proxy in v1; IBKR-DJX upgrade later. |
| Q3 | **Taxonomy cutover** | — | **ANSWERED.** Parallel run ≥4 weeks before old labels leave the UI. |
| Q4 | **Economic calendar source** | — | **ANSWERED.** The "What to Expect Today" Market Report is **not the user's bot** — it's a third-party bot in a private group's channel. **We build our own calendar** (see WS-3.4a): official public release schedules (BLS CPI/PPI/jobs, FOMC calendar, BEA GDP/PCE — all published months ahead, free) + yfinance earnings calendar. The private channel's posts may be ingested for personal cross-checking only (user is a member); never a structural dependency, never republished. |
| Q5 | **Whale alerts scope** | — | **ANSWERED.** Paid feed deferred. v1 = our tracked-symbol scorer; additionally, the private group has a **real-time whale-watch tracker bot** whose channel can be ingested as a personal-use news source (channel ID still needed from user) — same private-source rules as Q4. |
| Q6 | **Execution host** | — | **ANSWERED.** `pmset` wakes + backfill now; VPS/always-on box later, before paper trading. |
| Q7 | **Risk rails for automation** (max positions, % per trade, daily loss cutoff, in-flight-order kill policy) | WS-7 Gate 2 | Flagged, per user — concrete numbers proposed at Gate 2 review, backtest-derived. |
| Q8 | **0DTE GEX limitation** | — | **ANSWERED.** Accept labelled ≥1DTE levels in v1; revisit later. |
| Q9 | **IBKR paper account** | — | **ANSWERED.** Paper account exists. Gateway-during-US-hours rides on Q6's VPS. |

Still needed (small): channel IDs for the private group's whale-watch bot and Market Report bot, *if* the user wants them ingested (optional — nothing structural depends on them).

---

## 7. Risks & honest caveats

- **Overfitting is the existential risk of WS-4.** Mitigations are structural (purged walk-forward, point-in-time universes, next-bar-open fills, baselines-first, adversarial quant review, the two-stage health monitor) but the discipline must hold under "just one more tweak" pressure. The backtest harness reports OOS-net numbers by default; in-sample or gross numbers require an explicit flag. The **health monitor** carries the highest per-component overfit risk (many free parameters touching exits directly) — each of its sub-signals is a separate hypothesis requiring independent OOS support, per the WS-4 staging rules.
- **yfinance fragility:** every free feed here (chains, news, prepost quotes) rides an unofficial API. Mitigation: all ingesters tolerate failure silently into "stale data" badges (never blank panels — that's the B6 lesson), and IBKR is the upgrade path for everything that matters.
- **Timezone correctness** is a feature, not a detail: the user operates from Sydney (UTC+10/+11) against US markets. Every timestamp follows the Sydney-primary / ET-secondary hierarchy (WS-2); every scheduler comment states its timezone; snapshot jobs are ET-anchored. Test the DST-shift weeks (US and AU shift on different dates).
- **Scope weight:** this plan is ~3× the 2026-06-11 overhaul. The phase gates exist so each slice ships usable value; if capacity forces cuts, cut from the *bottom* of the sequencing list (automation slips first, bug sweep never).
- **Two IBKR consumers** (Argus + OptionsAnalysis) sharing one Gateway will hit pacing limits if both run hot — the snapshotter must rate-limit and back off when the ladder app is live.

---

## 8. Memory/doc updates on approval

- Update `project_positioning` memory: discovery+selection positioning superseded — entries/exits/automation are now in scope (this doc, §0).
- OVERVIEW.md gains a "Platform v2 direction" section after Phase A lands.
- Each workstream kickoff produces its own `docs/superpowers/plans/` implementation plan; this file gets a status table row per workstream as they start/land.
