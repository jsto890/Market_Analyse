# Dashboard Overhaul — Design Spec

_2026-06-11. Status: awaiting user review._

## 0. Why

The local dashboard experience is fragmented across **three UIs** and has drifted behind the pipeline. The Obsidian report is the quality benchmark (clear, grouped, explained); the dashboard should be its **interactive counterpart** — same information model, plus the things a static snapshot can't do: charts, drill-downs, live quotes, history, options context, search of any ticker.

Positioning constraint (from `project_positioning`): Argus is a **discovery + long-selection** engine. No trade journal, no P&L tracking, no exit management. The dashboard's job is: *what to look at today, why, and how it has been performing as a selector.*

---

## 1. Current-state audit

### 1.1 The three UIs

| UI | Where | State |
|---|---|---|
| Next.js dashboard | `dashboard/`, :3000 | The real one. 6 pages, ~2.4k LOC. Keep + overhaul. |
| "Argus Local" | `argus/argus/ui/index.html`, served at :8088 root | Dev console; raw JSON dumps (`flow`, `indicators`, `account`). Has the only Chat UI. **Retire.** |
| `argus_dashboard.html` | repo root, 1461-line single file | Pre-Next.js dashboard (bridge/morning mode). Broken via `file://` (CORS). **Retire.** |

Fragmentation is itself the biggest "messy/unprofessional" driver. One UI, one URL.

### 1.2 Bugs found in hands-on test (Playwright pass, 2026-06-11)

1. **Nav "Options" → 404.** Links `/options`; only `/options/[ticker]` exists.
2. **`/options/[ticker]` → 500 on every load.** Uses Next 15's `use(params)` on Next 14.2 — the page has *never* rendered.
3. **Watchlist schema split.** Action page pins push a plain string into `argus_watchlist`; Accounts page reads `{ticker, pinned_at}` objects → pins from the action card render as broken cards.
4. **Fake data on watchlist card:** "Last signal:" renders `new Date()` (today, always), not the actual signal date.
5. **FilterBar `sticky top-0`** sticks underneath the nav (also sticky, higher z) when scrolled.
6. **`/api/fundamentals/{symbol}` backend bug:** `"There is no current event loop in thread 'AnyIO worker thread'"` — fundamentals leg unreachable from any UI.
7. **`lib/bridge.ts` hardcodes** `/Users/josephstorey/Market_Analyse/reports/bridge_latest.csv`.
8. **Screener auto-fires the full default screen on page visit** (long block, no progress, wasted compute if you only came to type tickers).
9. Header "N HC longs" counts `high_conviction` rows regardless of verdict (some are WAIT).

### 1.3 Pipeline drift — the dashboard shows last month's data model

`bridge_latest.csv` now carries 52 columns. The dashboard ignores the ones that drive the report:

- `conviction` (🟢/🟡/⚪), `action_label` (STRONG/GOOD…), `trade_style`, `combo`
- `catalyst_score` + fundamental votes (`vote_event_catalyst`, `vote_earnings_proximity`, `vote_squeeze_setup`, `vote_growth_profitability`, `vote_analyst_upside`)
- `ticker_regime`, `n_eff`, `gate_flags`
- `group1` / `group2` / `near_aligned` — the report's grouping (Aligned / HC-pulling-back / Tech+Fund)

The dashboard still organises around the old 2-leg `alignment` vocabulary (ALIGNED/CONTRARIAN/DIVERGING/TECH_WAIT/NEUTRAL) while the report moved to a 3-leg (Sent/Tech/Fund) grouped model. No sector, no market-regime banner, no sector-rotation (RRG) panel — the report's top two sections are absent entirely.

### 1.4 Page-by-page verdicts

| Page | Verdict | Notes |
|---|---|---|
| Signals (/) | **Rebuild.** | 40 cards × ~300px in one column ≈ 12k px of scrolling. The 5-row ReturnsBar dominates every card while encoding 5 numbers (bars are per-card normalised → SNDK +3829% and HIMS −51% look similar). Raw dev-speak in UI ("anchor: ema_50", "entry: clean"). Table mode is better than cards but unsortable. Report grouping absent. |
| Action card (/action/[t]) | **Rebuild around a chart.** | **No price chart** — E/S/T levels float with no price context; biggest single gap in the product. VoteMatrix = wall of unlabeled squares. FamilyRings = tiny, mostly-grey donuts. Agent notes mostly empty ("EMA Alignment — "). Tech-leg only: no sentiment, catalysts, or fundamentals despite the system being a 3-leg blend. |
| Screener | **Keep, demote.** | Useful batch tool; shouldn't auto-run; results should link to ticker page. |
| Accounts | **Keep, split.** | Trust tiers table is good. Watchlist squatting on the same page is its own feature (and broken, §1.2.3). |
| Portfolio | **Keep as-is (small polish).** | IBKR-offline dead end is acceptable for an overlay feature. |
| Agents | **Cut from nav.** | A static list of 70 names is documentation, not a destination. |
| Options | **Fold into ticker page.** | Both routes broken today (§1.2.1–2). |
| Compass modal | **Keep, relocate.** | Decent viz, wrong container (modal). Becomes a panel on Today. |
| G-spotlight | **Keep, surface.** | Works, but invisible — no hint anywhere that "g" does anything. |

### 1.5 Unused backend capability (free wins)

Working today: `/api/history` (OHLCV → charts), `/api/quote` (live price), `/api/analysis` (LLM write-up), `/api/chat/{symbol}`, `/api/indicators`. Broken: `/api/fundamentals` (§1.2.6). The report pipeline also produces `reports/selection_performance.csv`, `reports/selection_backtest.csv`, `docs/label_efficacy/`, and dated `bridge_*.csv` since 2026-05-07 — enough to power a Performance page with zero new computation.

---

## 2. Goals

1. **One professional UI** at :3000. Retire the other two.
2. **Parity with the report's information model** (3 legs, groups, conviction, regime, RRG), then exceed it with interactivity.
3. **Ticker page as the centre of gravity** — search any ticker → one page with chart, all three legs, options, AI.
4. Honest data presentation (no fake dates, no per-card-normalised bars, labels humans can read).
5. Respect positioning: discovery + selection. No journal/exits/P&L.

Non-goals: trade execution UI, multi-user/auth, cloud deploy, mobile-first (responsive is enough), replacing the Obsidian report.

---

## 3. Approaches considered

**A. Overhaul the existing Next.js app in place (recommended).**
Keep Next 14 + Tailwind + SWR + recharts; restructure IA; add ticker page + design system; retire legacy UIs. Reuses the working data plumbing (CSV reader, API proxy, accounts/portfolio pages). Risk: dragging some old component debt along — acceptable at 2.4k LOC.

**B. Greenfield rebuild (Next 15 + shadcn/ui).**
Cleanest slate, newest stack. But throws away working code, re-introduces the `use(params)` class of version churn that broke the options page, and the payoff over A is mostly aesthetic — the design-system pass in A gets the same look.

**C. Minimal patch.**
Fix the bugs, default to table view, add sorting. Cheapest, but leaves three UIs, no chart, no report parity — doesn't answer "messy, unprofessional, weak".

**Decision: A.** One deliberate exception borrowed from B: build the visual layer as a small token-based design system (no shadcn dependency needed; Radix primitives + lucide-react icons only where they earn their keep).

---

## 4. Design

### 4.1 Information architecture

```
Nav:  Today · Watchlist · Performance · Sources · Screener · 0DTE ↗     [⌘K search] [status]

/            Today — interactive daily report
/t/[ticker]  Ticker page (replaces /action/[t] and /options/[t])
/watchlist   Pinned tickers
/performance Selection performance + label efficacy + signal history
/sources     Account trust (renamed from Accounts)
/screener    Batch Argus runs (on-demand only)
0DTE ↗       External link → OptionsAnalysis app (:5173) with live/down indicator
```

Deleted routes: `/action/[t]` (301 → `/t/[t]`), `/options`, `/options/[t]`, `/agents` (content moves to a collapsible "About the ensemble" on the ticker page's Why panel), `/portfolio` stays but moves under a small "Portfolio" link in the status area (it's an overlay, not a daily destination) — *if that feels wrong in practice, keep it in the main nav; one-line change.*

**Path of a morning:** open Today → regime + rotation orient you in 5 seconds → scan grouped signal tables → click a ticker → chart + why + catalysts on one page → pin or move on. Two clicks from open to decision context.

### 4.2 Today (/)

Top-to-bottom:

1. **Context strip** (one row, always visible): market regime (SPY+QQQ verdicts → risk-on/off, chase ON/OFF), bridge data date + age ("today 08:00" / amber when stale >24h), counts ("16 aligned · 6 HC").
2. **Sector rotation panel** (collapsible, default open): RRG table from `sector_rotation.py` output — Quadrant, RS-Ratio, RS-Mom, Breadth, 1W/1M/3M, Δrank. Stretch (Phase 5): true RRG scatter (RS-Ratio × RS-Mom, quadrant-coloured dots) — strictly an upgrade the report can't print.
   - *Data note:* rotation panel currently renders only into the report Markdown. Add `--json` output from `sector_rotation.py` to `reports/rotation_latest.json` in the daily run; dashboard reads that file. No live recompute.
3. **Signal tables, grouped like the report**: "Aligned" (group1), "High conviction, pulling back", "Tech + Fund bullish" (group2, 🔸 near-aligned marker), then collapsed "Everything else".
   - **Table-first** (the card grid dies). Columns: Ticker · Signal (action_label badge) · Conv (dot) · Sent/Tech/Fund (three compact bars, fixed −1..+1 scale) · Combined · Sector · 1D/1W/1M returns (coloured text, *not* bars) · Catalyst chips (✓ count, hover detail).
   - Sortable columns, sticky header (below nav, offset fixed), row click → `/t/[ticker]`, row expand (chevron) for E/S/T + quality + top accounts without leaving the page.
   - Filters: search, HC-only, conviction, sector. The five alignment-vocab filter buttons go away (groups subsume them).
4. **Compass** as an inline collapsible panel (tech × sentiment scatter, dot click → ticker page) instead of a modal.

### 4.3 Ticker page (/t/[ticker]) — the centre of gravity

Layout: header band + 2-column body (chart column ~62%, context column ~38%), stacking on narrow screens.

- **Header:** ticker, company name, live quote + day % (`/api/quote`), action_label badge, trade_style, conviction, verdict, HC flag, Pin button, "in today's report" indicator.
- **Chart (the headline feature):** candlesticks via `lightweight-charts`, daily 1Y default with 3M/6M/1Y/2Y ranges; EMA 20/50/200 overlays; volume sub-pane; **horizontal price lines for Entry/Stop/Target** with labels; marker on first-flagged date(s) from signal history. Data: `/api/history` (works today).
- **Levels card:** E/S/T, R:R, stop anchor *explained in words* (e.g. "stop under EMA-50, 388.63"), entry quality, extended flag.
- **Why panel (replaces VoteMatrix + FamilyRings + AgreeDissent):**
  - Family verdict bars: one row per family incl. the uncapped "other" bucket — `trend 9/13 ▮▮▮▮▮▮▮░░`, colour by direction; N_eff and inflation-gap chips with plain-English tooltips ("3.1 independent sources — healthy").
  - Combo string decoded ("LSNS — trend up, oscillators overbought: dip-buy profile").
  - Agent detail (agreed/dissented lists) collapsed by default; drop agents whose note is empty instead of rendering "Agent — ".
  - "About the ensemble" collapsible (absorbs the old /agents page).
- **Sentiment leg:** sentiment score bar, mentions, distinct accounts, top accounts as chips linking to /sources rows, conviction.
- **Catalysts & fundamentals leg:** catalyst chips with dates and polarity (⚡ beat / ⚠ miss, analyst actions with firm + grade), the five fundamental votes as compact ticks, short interest, analyst target vs price. Requires fixing `/api/fundamentals` (§1.2.6) — until then, render from bridge CSV columns which already carry the votes + catalysts.
- **Options panel** (fold-in of the dead options page): P/C OI & volume, max pain, ATM IV + skew, unusual strikes table. Render only when IBKR Gateway responds; otherwise a one-line "IBKR offline" row, not a dead page.
- **AI panel (on demand):** "Generate analysis" button → `/api/analysis/{t}`; chat input → `/api/chat/{t}`. Never auto-fires (costs money/time).
- **Signal history:** sparkline/list of this ticker's past bridge appearances (date, group, combined score, price then → now %). Data: SQLite (§4.7).

Any ticker works — if it's not in today's bridge, the page simply lacks the sentiment row (action card + chart + options still run). This *is* the "search bar → per-ticker page" the user asked for.

### 4.4 Watchlist (/watchlist)

- Pin from ticker page or by typing. Unified shape, stored in SQLite via a tiny API route (survives browser/localStorage wipes); migrate existing localStorage entries on first load.
- Each row: ticker, pinned date, price then/now (% since pin), last signal date *(real)*, today's group/badge if present, unpin.
- Sorted by % since pin by default. This page answers "how are my picks doing" — selection metrics, not P&L.

### 4.5 Performance (/performance)

Read-only renders of artifacts that already exist:
- **Selection performance** (`selection_performance.csv` / `selection_backtest.csv`): MFE distribution histogram, % reaching +10/+25/+50, median days-to-peak, best/worst names — the OVERVIEW.md evidence, live.
- **Label efficacy** (`docs/label_efficacy/latest.md` + CSV): forward returns by setup label.
- **Signal history browser:** by date — pick a past report day, see that day's signals with forward returns since (from SQLite + `/api/quote`).
- Honest framing baked into the page: "peak, not realised" caveat line.

### 4.6 Sources (/sources) and Screener (/screener)

- Sources = current Accounts page minus watchlist, plus Wilson-CI amber flag for n<10 (already coloured) and a per-account sparkline later (stretch).
- Screener: no auto-run; explicit Run; results in the Today table style; rows link to `/t/[ticker]`; note that a custom-universe run takes 10–30s.

### 4.7 Data layer

- `lib/bridge.ts`: path from `process.env.BRIDGE_DIR` (default `../reports` relative to the dashboard dir). Parse once per request (server component) as now.
- **SQLite ingest** (enables history + performance): extend the existing-but-unused `lib/db.ts` `signals` table with `conviction`, `action_label`, `trade_style`, `combo`, `ticker_regime`, `n_eff`, `group1`, `group2`, `near_aligned`, `sector`. A small `scripts/ingest.ts` (run by `npm run ingest`, also called from `run_daily.sh` after the bridge step) upserts every dated `bridge_*.csv`, keyed `(date, ticker)`, keeping the latest file per calendar day. One-off backfill from the ~30 existing dated CSVs.
- `watchlist` table: `(ticker TEXT PRIMARY KEY, pinned_at TEXT, price_at_pin REAL)` + `GET/POST/DELETE /api/watchlist`.
- Argus API stays the live-compute backend via the existing proxy route. Fix `/api/fundamentals` event-loop bug in `argus/api/routes.py` (run the yfinance call via `asyncio.new_event_loop` in the worker thread or make the route async).

### 4.8 Visual design system

Professional = restraint + consistency, not more decoration:
- **Tokens** (CSS vars): bg `#0b0e14`, surface `#11151c`, border `#222936`, text `#e6e8ec` / muted `#8b93a3`; one accent (blue `#4c8dff`) for interactive elements only; green/red/amber reserved for data semantics. 4/8px spacing grid; radius 6.
- **Type:** Geist Sans (already loaded) for UI; mono only for tickers + numerics with `tabular-nums`; 13px data tables, 3-step scale (13/15/20). No emoji in chrome — `lucide-react` icons (⚡→Zap, ⊕→Crosshair, ⊞→Table, ☀→Sun). Emojis stay only where they're data semantics shared with the report (conviction dots can be CSS dots instead).
- **Components:** Badge (verdict/action_label/conviction), ScoreBar (fixed-scale), StatChip, Panel (header + collapsible), DataTable (sortable, sticky-header, expandable rows), Sparkline. Build on Tailwind; Radix only for popover/tooltip/dialog.
- **States:** skeleton loaders (no layout jump), designed empty states ("IBKR offline — start Gateway on :4002 · Retry"), error toasts. Returns shown as coloured text `+5.1%`, never per-row-normalised bars.
- Implementation note: build UI work under the `frontend-design` skill discipline; review against this token sheet.

### 4.9 OptionsAnalysis integration

OptionsAnalysis is a **QQQ-0DTE-only live websocket ladder** (own backend :8000 + Vite frontend :5173, own IBKR session, desktop wrapper). It is *not* a per-ticker options analyzer, so it doesn't merge into the ticker page.

**Decision: link-out, not embed.**
- Nav item "0DTE ↗" opens `http://127.0.0.1:5173` in a new tab; a health ping (`/health` on :8000 via the proxy route) renders the link green/grey with "not running — `cd ~/OptionsAnalysis && …`" tooltip when down.
- Per-ticker options needs are served by the ticker page's Options panel (Argus `/api/flow`, §4.3) — that's the "search a ticker, see its options picture" ask.
- Explicitly rejected: iframe embed (duplicate websocket lifecycle, focus/shortcut conflicts, two IBKR consumers fighting pacing limits) and porting the ladder into Next.js (large effort, zero benefit while it's QQQ-only by spec).

### 4.10 Deletions

- `argus_dashboard.html` (repo root) — delete after Phase 2 reaches parity (grouped tables + context strip).
- `argus/argus/ui/index.html` — replace with a redirect/landing pointing at :3000 (the FastAPI root keeps serving /docs). The Chat capability it uniquely held moves to the ticker page AI panel.
- `/app/action`, `/app/options`, `/app/agents` routes; `VoteMatrix.tsx`, `FamilyRings.tsx`, `AlignmentCompass` modal wrapper (logic reused in panel form), `ReturnsBar.tsx`.
- Root-dir strays `~/argus_dashboard.html`, `~/argus_live.html`, `~/argus-live.html` (user's home, not repo — flag, don't auto-delete).

---

## 5. Implementation phases

| Phase | Scope | Size |
|---|---|---|
| **0 — Hygiene** | Fix §1.2 bugs: options 404/500 (route removal + redirect), watchlist schema, fake date, sticky offset, env path, screener auto-run, HC count label, `/api/fundamentals` backend fix | S |
| **1 — Design system + IA** | Tokens, core components (Badge/Panel/DataTable/ScoreBar), nav restructure (+⌘K search), route moves with redirects | M |
| **2 — Today page** | Context strip, grouped sortable tables w/ expandable rows, new-column wiring (conviction/action_label/fund votes/sector), rotation JSON export + panel, compass panel | M–L |
| **3 — Ticker page** | Chart (lightweight-charts) + E/S/T lines, Why panel (family bars, combo decode), sentiment + catalyst/fund legs, options fold-in, AI on-demand panel | L |
| **4 — History & Performance** | SQLite ingest + backfill, watchlist API + page, /performance page, signal-history on ticker page | M |
| **5 — Retire & polish** | Delete legacy UIs + dead routes/components, 0DTE health link, RRG scatter (stretch), responsive pass, empty/loading states sweep | M |

Each phase lands independently; the app stays usable throughout. New packages: `lightweight-charts`, `lucide-react`, `@radix-ui/react-{tooltip,popover,dialog}`. Everything else is already installed (`better-sqlite3`, `papaparse`, `swr`, `recharts`).

## 6. Open questions for review

1. Portfolio: relegate to status-area link (current plan) or keep in main nav?
2. Performance page MVP: are the three existing CSV/MD artifacts enough, or do you want per-account calibration curves in v1?
3. Conviction display: coloured dots (proposed) vs the report's 🟢/🟡/⚪ emojis for visual continuity?
4. Should the daily `run_daily.sh` also call `npm run ingest`, or do you prefer ingest-on-dashboard-start (chokidar watcher)?
