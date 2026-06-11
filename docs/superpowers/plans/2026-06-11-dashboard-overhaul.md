# Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three fragmented local UIs with one professional Next.js dashboard that is the interactive counterpart of the daily Obsidian report — grouped signal tables, a chart-centred ticker page for any symbol, time-aware features (what's new, earnings proximity, flag age), and statistically honest displays.

**Architecture:** Keep the existing Next 14.2 App Router app in `dashboard/` and overhaul in place. Server components read the bridge CSV + JSON sidecars; a SQLite layer (better-sqlite3, ingested from dated bridge CSVs) powers history/diff/watchlist; the FastAPI Argus backend (:8088) stays the live-compute engine via the existing proxy route. Two small Python emitters add machine-readable sidecars the report already computes internally.

**Tech stack:** Next.js 14.2 (App Router), TypeScript, Tailwind 3.4 + CSS custom-property tokens, SWR (ticker page only), `lightweight-charts@4` (candles), recharts (sparklines/histogram), better-sqlite3 (WAL), papaparse, lucide-react, @radix-ui/react-tooltip + popover, vitest (lib tests). Python: pandas/yfinance (existing), FastAPI (existing).

**Spec:** `docs/superpowers/specs/2026-06-11-dashboard-overhaul-design.md`. This plan supersedes the spec where they differ (see §RB below).

---

## RB. Review-board outcomes (5 reviewers, 2026-06-11)

Five independent reviews were run against the spec: UI designer, daily-trader persona, quant, implementation (Next/React), product manager. Dispositions:

### Cut from the spec (won't be built)

| Item | Cut by | Reason |
|---|---|---|
| Compass scatter panel | trader + PM | Groups already encode tech×sentiment; "demo viz I'd open twice ever" |
| Per-ticker AI **chat** | trader + PM | Toy; one-shot "Generate analysis" stays (on-demand) |
| "About the ensemble" + /agents content | trader | Documentation on a trading page; family-bar tooltips suffice |
| RRG scatter (Phase-5 stretch) | trader + PM | Table already exceeds usage |
| Per-account sparklines | trader + PM | No decision impact |
| 0DTE health ping plumbing | trader + impl | Plain link; user knows if their own app is running |
| Max pain stat | trader | "Never acted on it, never will" |
| `/api/status` aggregation route | impl | Client-side `Promise.all` in the popover; no server route |
| SWR on Today page | impl | Server components + `fs.statSync` mtime; SWR only on ticker page |
| Combined-score column in default Today table | UI + quant | Encoded by sort/bars; r≈0 with returns — must not look like a ranking |

### Added to the spec (new requirements)

| Item | From | What |
|---|---|---|
| **Yesterday-diff** | trader #1 | NEW badge per ticker; "changes since yesterday" strip: dropped names (info only, never a sell prompt), group moves, sentiment-turn flag on pullback names |
| **Next-earnings proximity** | trader #2 | `next_earnings_date`/`earnings_in_days` emitted by Python; chip in ticker header + amber warning chip on table rows when ≤10d |
| **Flag-age line** | trader #3 | Ticker header: "flagged 3d ago at $24.51 · +8.2% since · median pick peaks +23% @ ~7d" |
| **Recent-picks tracker** | trader #4 | Auto (not pin-dependent) rolling-14d table of every group1/pullback/group2 first-flag on /watchlist |
| **Size calculator + distance-to-entry** | trader #5 | On Levels card: persisted risk-$ input → share count from stop distance; "price is X% above entry" chip. A calculator, not trade management |
| **Tier-first sorting** | quant ★1 | Within groups sort by action_label tier → combo class, never by combined_score; score tooltip: "magnitude ≠ edge (r≈0 in backtest)" |
| **CI display** | quant ★2 | Ticker page score as `0.67 [0.41–0.78]` from live card; Today shows bars/one decimal |
| **Honest Performance stats** | quant ★3/16/17 | Median headline; right-censoring denominator (only picks ≥10 trading days old in conversion rates); day-0 peaks reported separately; SPY benchmark column; n on every row, grey n<5; cuts by action_label + combo class only |
| **meta_note / meta_coherence / inflation_gap / LOO attribution** | quant 13–15 | Surface on ticker Why panel (live-only fields — not in CSV) |
| **HC reframing** | quant ★5 | "HC" tooltip = "≥75% indicator agreement — consensus, not edge"; never sort by agreement |
| **n_eff neutral wording** | quant 6 | No "healthy" judgment, no green-for-high; tooltip notes high n_eff backtested worse |
| **Nav-integrated context strip** | UI 1 | Regime/freshness/counts live in the nav bar (persistent, fixes sticky collisions structurally) |
| **Group-header rationale prose** | UI 2 | Each group header carries the report's one-line explanation |
| **Third surface token `--elevated`** | UI 14 | Hover/expanded/tooltip depth step |
| **28px ticker display size; teal/amber regime colors (blue = interactive only); global focus-visible ring** | UI 15–17 | Token-sheet additions |
| **Formatting & alignment rule sheet** | UI 18–19 | §A11, normative |
| **⌘K as real palette; j/k/Enter/Space table keys; `?` help overlay; UI-state persistence; pinned transitions; sticky first column** | UI 21–25 | §A1/§A9 |
| **Rotation panel below signal tables, collapsed, with one-line summary** | trader | Candidates above the fold; rotation changes a decision ~monthly |

### Re-phased (implementation review)

- SQLite ingest + watchlist API pulled forward to **Phase 1** (foundation) — diff/history/tracker/pin all depend on it; it's ~1 day.
- Design system validated **on the Today table in the same phase it's built** (impl 16).
- Pin button (Phase 3) uses the Phase-1 watchlist API, not localStorage.
- Critical landmines pre-solved in tasks: better-sqlite3 `globalThis` singleton + `serverComponentsExternalPackages`; lightweight-charts v4 pin + dynamic import + StrictMode `destroyed` flag; Next-14 plain-object `params` (never `use(params)`); `redirects()` in next.config; atomic `os.replace` writes for Python sidecars; papaparse global `"True"/"False"` transform.

### Data-basis ruling (quant 7, verified)

`argus/argus/data/market.py:50` uses `auto_adjust=False` — prices are **split-adjusted but dividend-unadjusted** (yfinance always split-adjusts). Do **NOT** flip this flag: every indicator/backtest is calibrated on it. All "then → now %" math must use the **same `/api/history` series for both endpoints** (consistent basis); short-window returns are unaffected by dividend adjustment at the product's horizon. `price_at_pin` is compared against this same series, never against an externally-sourced price.

---

# Part A — Application blueprint

## A0. Decision hierarchy → page map

Every page answers exactly one operator question. Anything on a page that doesn't serve its question is on the wrong page.

| # | Question | Page |
|---|---|---|
| 0 | Is the data fresh, and may I chase today? | Nav context strip (every page) |
| 1 | What should I look at today, in what order, and **what changed**? | `/` Today |
| 2 | Why this name, am I late, is the entry sane? | `/t/[ticker]` |
| 3 | How are the names I flagged (and the system's recent picks) doing? | `/watchlist` |
| 4 | Does the selector work; where is it strong/weak? | `/performance` |
| 5 | Whose chatter should I weight? | `/sources` |
| 6 | What does Argus say about an arbitrary basket right now? | `/screener` |

Morning path: open `/` → strip orients (2s) → diff strip shows what's new (10s) → scan Aligned table (60s) → click one ticker → chart + why + earnings chip (60s) → pin or pass. Two clicks, under three minutes.

## A1. Global shell

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ARGUS  Today  Watchlist  Performance  Sources  Screener        ◇ RISK-ON · chase ON  │
│                                                          bridge 08:02 ✓ · 16/4/6 · ⌘K │ ← one 44px row, two
│                                                              0DTE↗  Portfolio  ●      │   right-aligned clusters
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Why | Why here | How |
|---|---|---|---|
| Wordmark + 5 nav links | Navigation | Top bar, not sidebar: 6 destinations max; vertical space is the scarce resource on data-dense tables | `Nav.tsx`, active = white, inactive = muted |
| Regime pill `◇ RISK-ON · chase ON` | Question 0 — gates the whole morning | In nav = persistent on every page; also structurally kills the sticky-bar z-collision (UI 1) | teal text/border when risk-on, amber when risk-off; from `bridge_meta.json`; blue is never used for state |
| Freshness `bridge 08:02 ✓` | Trust — launchd has silently failed before | Next to regime: both are "can I trust the screen" facts | server-computed from meta `generated_at` (fallback: CSV mtime); ✓ <24h, amber 24–48h, red >48h "run_daily may have failed" |
| Counts `16/4/6` | Scope of today | Glanceable; full labels in tooltip ("aligned / pullback / tech+fund") | from meta counts |
| ⌘K button | Discoverability of the palette ("g" was invisible) | Universal pattern, right side | opens CommandK |
| `0DTE↗` | Launch the QQQ ladder app | Link-out only (see spec §4.9); no health ping | plain `<a href="http://127.0.0.1:5173" target="_blank">` |
| `Portfolio` (small) | IBKR overlay is occasional-use | Demoted from primary nav (PM/trader: won't use daily) | link to `/portfolio` (page kept as-is) |
| Status dot `●` | API/IBKR health | Popover, zero nav slots | client `Promise.all` on `/api/argus/health` + flow probe; lists Argus API / IBKR / ingest date |

Global behaviors: `⌘K` or `g` opens palette (arrow-keys nav, Enter opens `/t/X`, Esc closes); `?` opens a keyboard-help overlay; `focus-visible` ring (2px `--accent`, offset 2) on every interactive element; no route transitions (information tools must feel instant).

## A2. Today (`/`)

```
┌ Changes since yesterday ──────────────────────────────── [collapse] ┐
│ NEW: AAOI CGEH · Moved: HIMS pullback→aligned · Turned: QBTS ↑sent  │
│ Dropped: UNH APPS (info only — downgrades are not sell signals)     │
└──────────────────────────────────────────────────────────────────────┘
  [search…] [HC] [conviction ▾] [sector ▾]

ALIGNED — sentiment + technical + fundamental all bullish          (16)
─ one-line rationale prose, muted ────────────────────────────────────
 Ticker  Signal       C  Sent Tech Fund  Sector          1D     1M    ⚑   Cat  ▸
 AMD     ⚡PRIME_LONG  ●  ▮▮▮  ▮▮   ▮▮   Semiconductors  +5.1%  +7.7%      ⚡2  ▸
 AAOI ᴺᴱᵂ ⚡STRONG     ●  ▮▮   ▮▮▮  ▮▮   Networking      +11.1% +32%  ext  ⚡1  ▸
 ├─ expanded: E 24.51 S 22.10 T 29.80 · R 2.3x (indicative) · 1.8% above entry
 │  comb +0.64 ⓘ · quality 9.8 · n_eff 2.4 · regime trending · 1W/6M/1Y +5.9/+649/+1109
 │  ▁▂▃▅▆▇ 60d · 41 mentions · 9 accts: @a @b @c · earnings in 23d · Open AAOI →

HIGH CONVICTION, PULLING BACK                                       (4)
─ strong chatter + catalyst, sentiment dipping — watch for the turn ──
 …

TECHNICAL + FUNDAMENTAL                                             (6)
─ 🔸 near-aligned: sentiment just below the 0.30 bar ─────────────────
 …
▸ Everything else (14)

▸ Sector rotation — Leading: Sci Instruments, Software-App · 8/12 fading
  (collapsed; expands to full RRG table)
```

Element rationale:

| Element | Why shown | Why here / this form |
|---|---|---|
| Diff strip | Trader's #1 gap: "which of these did I not see yesterday" is *the* morning question | Top of content — it's the delta over the report the user already read. Dropped names labelled info-only (acting on downgrades backtested −) |
| Group tables w/ rationale prose | The groups are the system's output; prose headers carry the report's interpretive value (UI 2) | Replaces alignment-filter buttons and the card grid entirely |
| Within-group sort | quant ★1: tier (PRIME>BREAKOUT>STANDARD>WATCH>WAIT>AVOID) → combo class (strong {LSNS,LNLL,LSNL} > neutral > weak {LNNL,LLNL}) → combined desc as final tiebreak | Score must not present as a ranking; it isn't one (r≈0) |
| Columns (10): Ticker+NEW · Signal badge · Conv dot · 3 leg micro-bars (fixed −1..+1, 56px) · Sector · 1D · 1M · ⚑ flags (ext / earnings≤10d) · Cat count · chevron | Each is a triage input; Combined, 1W/6M/1Y, levels → expanded row (UI 6/7) | 1D+1M only in-row: yesterday + trend context; extension and earnings flags prevent the two repeatable mistakes (chasing, buying into a print) |
| Expanded row | 80% of triage questions without navigation: levels + dist-to-entry, combined (with the r≈0 tooltip), quality, n_eff, regime, long returns, 60d sparkline, mentions/accounts, earnings date, Open link | Click row/chevron expands; clicking the **ticker symbol** navigates (UI 4 — two gestures, two distinct targets) |
| "Everything else (14)" | Count in the toggle (UI 5) | Collapsed; uncertainty about hidden content costs decision time |
| Rotation panel | Context, not a daily decision input (changes a decision ~monthly — trader) | **Below** the tables, collapsed, header carries the one-line summary ("Leading: X, Y · 8/12 fading"); expands to the full RRG table per §A2.1 |

§A2.1 RRG table (inside the collapsed panel): columns `Industry · Δrank · ◉ · RS-Ratio · RS-Mom · Breadth · n · 1W · 1M · 3M` (UI 3 order; quadrant as coloured dot). Rules: Δrank renders `•` for |Δ|<2 (hysteresis — ~72% of ±1 moves are noise); rows with n<20 greyed with tooltip "thin basket — displayed RS values are noisier than the (shrinkage-adjusted) rank suggests"; breadth tooltip "% above 50-DMA — Improving + low breadth = one-name move, unconfirmed" (quant 9–11).

States: stale bridge → amber banner above diff strip; missing `rotation_latest.json` → panel hidden; empty group → header + "none today" muted row.

## A3. Ticker page (`/t/[ticker]`)

```
┌ AMD  Advanced Micro Devices   452.40 −4.9%        ⚡PRIME_LONG  LONG  MOMENTUM  ● high  HC ⓘ │
│ flagged 3d ago at 421.30 · +7.4% since · median pick peaks +23% @ ~7d                        │
│ earnings in 23d                                                              [Pin] [⋯]      │
├───────────────────────────────────────────┬──────────────────────────────────────────────────┤
│ CHART (min-h 420px @1440; 560 @2560)      │ LEVELS & RISK                                    │
│  candlesticks · EMA 20/50/200 toggles     │  E 452.40 · S 388.63 · T 553.55 · R 1.6x ⓘ      │
│  E/S/T price lines (styles §A3.1)         │  "Stop rides the 50-day EMA (388.63)" · clean    │
│  ▲ flag-date markers                      │  price 0.0% from entry                           │
│  range 3M/6M/1Y/2Y · vol pane · log       │  Risk $ [500] → 7 shares ⓘ calculator only       │
│                                           ├──────────────────────────────────────────────────┤
│                                           │ WHY — LONG 0.67 [0.41–0.78] · agree 66% (gap ⓘ) │
│                                           │  combo LSNS — "dip-buy profile: trend up,        │
│                                           │   oscillators cooled" ← headline (quant 12)      │
│                                           │  trend     ████████░░  net +7  (LOO −0.18)       │
│                                           │  momentum  ███░░░░░░░  net −2  (LOO −0.02)       │
│                                           │  …8 family rows incl. "other" bucket             │
│                                           │  n_eff 2.4 ⓘ · regime trending (ADX 31)          │
│                                           │  ⚠ meta: "consensus leans on one weekly leg"    │
│                                           │  ▸ agent votes (23 agreed · 12 dissented)        │
├───────────────────────────────────────────┼──────────────────────────────────────────────────┤
│ OPTIONS (collapsible; IBKR-gated)         │ CATALYSTS & FUNDAMENTALS                         │
│  P/C OI · P/C Vol · ATM IV c/p · skew     │  ▌⚡ earnings beat (EPS …) · 9d ago              │
│  unusual calls / puts tables              │  ▌⚡ analyst upgrade JPM UW→N · 5d ago           │
│  (no max pain)                            │  votes ✓✓—✓✗ · rev +38% · margin 13% ·           │
│                                           │  tgt $483 (+2%) · short 2.7%                     │
│                                           ├──────────────────────────────────────────────────┤
│                                           │ SENTIMENT  +0.34 ▮▮▮ · 41 mentions · 9 accounts  │
│                                           │  @PhotonBull @QuiverQuant … (tier-edged chips)   │
│                                           ├──────────────────────────────────────────────────┤
│                                           │ SIGNAL HISTORY  table: date·group·label·comb·    │
│                                           │  price then→now% (same-series basis §RB)         │
│                                           ├──────────────────────────────────────────────────┤
│                                           │ ▸ AI — [Generate analysis ~10s]  (one-shot)      │
└───────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

| Element | Why | Why here / form |
|---|---|---|
| Header: 28px mono ticker, live quote (SWR 30s), badges | Page identity anchor (UI 15); HC badge tooltip "≥75% agreement — consensus, not edge" (quant ★5) | Conviction dot tooltip: "social conviction — display-only, not in the blend; n may be missing" (quant 18; `nan` → —) |
| Flag-age line | Trader #3: moves the Performance page's one actionable stat to the moment of temptation | From SQLite first-flag + `/api/history` closes; median-peak constants recomputed by the Performance lib |
| Earnings chip | Trader #2: the repeatable mistake-stopper | Amber when ≤10d: "earnings in 6d — inside typical hold window" |
| Chart | The #1 product gap; every entry decision starts at price structure | Left, tallest element (UI 9). §A3.1 line styles |
| Levels & Risk | Levels are chart-adjacent numerics; the size calc is the last number computed before every order (trader #5) | R:R labelled *indicative* + footnote "levels are context, not an exit system — mechanical exits backtested ~breakeven" (quant 19). Risk-$ persisted (`localStorage dash:riskUsd`); shares = floor(risk$/(entry−stop)) |
| Why panel | The explanation layer; combo decode is the **headline** because combo class is the validated quality dimension; bars show net direction (long−short), not a green fill = quality | CI from live card (`score_ci_lo/hi`); inflation-gap shown next to agreement when >0.15 ("correlated consensus — discount"); LOO `family_attribution` as per-row delta; `meta_note` as advisory callout; n_eff neutral chip. All live-only fields — this panel always comes from `/api/argus/action_card`, never CSV |
| Agent votes accordion | Transparency pitch ("every vote inspectable") at near-zero cost; collapsed; agents with empty notes render name+conf only | Below family bars; trader won't open it daily — that's fine, it's one accordion row |
| Catalysts & fundamentals | Decision input on every name (trader) | Row format with polarity stripe (UI 13), not chips; next-earnings handled in header |
| Sentiment | Decision input on borderline/near-aligned names | Tier-edged account chips link to `/sources` |
| Options panel | Weekly-use on high-short names | Left under chart (price-adjacent); IBKR-gated single-row notice when offline; **no max pain** |
| Signal history | "Am I late" detail beyond the header line | Same-basis price rule (§RB ruling) |
| AI | One-shot only; never auto-fires; latency hint on the button + shimmer in the output area (UI 12) | Last position — cost-gated convenience, not a decision input |

§A3.1 chart price-line styles (UI 10): Entry = white dashed 1px; Stop = solid red 1px; Target = solid green 1px; right-edge pill labels (20%-opacity fill); if two lines are within 1% of price, offset labels 14px vertically. Flag markers: `arrowUp belowBar` accent-coloured at each historical flag date.

Off-bridge tickers: header has quote only; Why panel runs the live action card ("Running 70 agents… ~10s" skeleton); sentiment card shows "No social signal — last seen <date|never>"; everything else works. Invalid symbol → error state with "check the symbol" hint.

## A4. Watchlist (`/watchlist`)

Two sections:
1. **Pinned** (manual): add-bar (validates via quote) · table `Ticker · Pinned · @pin · Now · Since-pin% (default sort) · Today's badge · Last signal (real) · 1W · 1M · unpin`. Summary strip: count, median since-pin, best/worst.
2. **Recent picks (auto)** — trader #4, the evening review: every group1/pullback/group2 ticker first-flagged in the last 14 days. `Ticker · First flagged · Group · @flag · Now · Since-flag% · Age (d) · Still in report? · days-to-typical-peak context`. Sorted by since-flag% desc. "Dropped" rendered as plain text, never red/sell-styled.

Why one page: both sections answer question 3 ("are the picks working"), differing only in who picked. Storage: SQLite watchlist table via API; one-time localStorage migration (handles both legacy shapes: `string[]` and `{ticker,pinned_at}[]`), then key removed.

## A5. Performance (`/performance`)

Order: caveat banner → KPI row → MFE histogram → by-tier table → by-combo table → label efficacy → history browser.

- **Caveat banner (permanent, verbatim):** "Peak (MFE), not realised P&L — mechanical exits captured ~0% of this in backtest; the edge is in selection. n=63 selections, single bull regime (May–Jun 2026). Recent picks are right-censored: peaks may not have occurred yet."
- **KPI row:** **median** peak gain headline (mean shown, labelled); `% reached +10/+25/+50` computed **only over picks ≥10 trading days old** (denominator displayed: "38/51 eligible"); median days-to-peak **excluding day-0 peaks**, with "15/63 peaked same day (flagged at/after the move)" as its own stat (quant ★3/16/17).
- **Histogram:** MFE distribution, median line marked (skew makes the mean a lie).
- **By action_label / by combo class tables:** the two validated quality dimensions (quant ★4). Every row shows its n; rows with n<5 greyed "insufficient sample". **No** per-sector returns, **no** n_eff cuts, **no** per-account curves.
- **Label efficacy:** aggregate `docs/label_efficacy/<latest>.csv` by label → median f5/f10/f20, n.
- **History browser:** date picker → that day's signals + forward return to now **+ SPY same-window column** (beta context); caption "selections only — not the screened universe; no survivorship correction" (quant 8).

## A6. Sources (`/sources`)

The current Accounts page minus the watchlist section, renamed (avoids brokerage-account collision). Tier sections as-is; n<10 amber kept; restyled to tokens. No sparklines.

## A7. Screener (`/screener`)

No auto-run. Two explicit buttons: "Run custom" (comma list + min score) and "Run default universe". Progress line with elapsed seconds ("~10–30s"). Results in the Today table components; ticker symbol → `/t/[ticker]`. Last nav slot — occasional-use tool.

## A8. Design tokens (final)

```css
:root {
  --bg: #0b0e14;        /* page */
  --surface: #11151c;   /* panels, cards, table headers */
  --elevated: #1a1f2b;  /* hover rows, expanded rows, tooltips, menus (UI 14) */
  --border: #222936;
  --text: #e6e8ec;
  --muted: #8b93a3;
  --accent: #4c8dff;    /* interactive ONLY: links, buttons, focus, selection */
  --green: #3fb950; --red: #f85149; --amber: #d29922;
  --teal: #2dd4bf;      /* risk-on state (blue stays interactive-only, UI 16) */
  --nav-h: 44px;
}
```

Type: Geist Sans UI; mono (`tabular-nums`) for tickers + all numerics. Scale: 13 (data) / 15 (body) / 20 (section) / **28 display** (ticker header only). Spacing 4/8 grid, radius 6. Icons: lucide-react; **no emoji in chrome** (conviction = CSS dots; report emojis stay in the report). Focus: global `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`. Transitions: row expand 150ms max-height ease-out; group collapse 200ms; staleness colour 500ms; **nothing else** (UI 23).

## A9. Component inventory

| Component | Props (essential) | Notes |
|---|---|---|
| `ui/Badge` | `variant: 'tier'\|'verdict'\|'style'\|'flag'`, `value` | tier colours: PRIME amber-filled, BREAKOUT/STANDARD green-outline, WATCH grey, AVOID red-outline |
| `ui/ConvictionDot` | `value: 'high'\|'med'\|'low'\|null` | null → "—"; tooltip "display-only, not in blend" |
| `ui/ScoreBar` | `value (-1..1)`, `showValue?` | fixed scale, centre axis tick |
| `ui/MicroBar` | `value (-1..1)` | 56×8px leg bars |
| `ui/StatChip` | `label, value, tone?, tooltip?` | |
| `ui/Panel` | `title, subtitle?, collapsible?, defaultOpen?, persistKey?, actions?` | collapse state in localStorage |
| `ui/DataTable<T>` | `columns: Column<T>[]`, `rows`, `rowKey`, `defaultSort?`, `expandedRender?`, `persistKey?`, `onOpen?` | sortable; sticky header `top: var(--nav-h)`; sticky first column with right border at <1280 (UI 25); j/k/Enter/Space/Esc keys (UI 24); zebra `--elevated` hover |
| `ui/Sparkline` | `values: number[]`, `w?, h?` | hand-rolled SVG path, no axes |
| `ui/Skeleton`, `ui/EmptyState` | | no-layout-jump loaders; designed empties |
| `CommandK` | — | `⌘K`/`g`; results: today's bridge (group+tier inline) → watchlist → "Open XYZ →" for arbitrary input; arrow-keys only (UI 21) |
| `HelpOverlay` | — | `?` lists all keys |
| `Nav` + `ContextStrip` + `StatusDot` | server props: meta, freshness | strip data server-rendered |
| `charts/CandleChart` | `bars, levels?, markers?, persistKey` | lightweight-charts v4 wrapper (Task 26) |
| `today/DiffStrip`, `today/SignalGroups`, `today/RotationPanel` | | page assemblies |
| `ticker/*` | `LevelsCard, WhyPanel, CatalystsCard, SentimentCard, HistoryCard, OptionsPanel, AiPanel` | |

## A10. Data contracts

**Bridge CSV — new columns (Python, Task 19):** `report_group` (`aligned|pullback|tech_fund|other` — single source of truth for grouping, same logic as the report builder), `theme`, `industry` (the report's "AI / Compute → Semiconductors" split), `next_earnings_date` (ISO or empty), `earnings_in_days` (int or empty).

**`reports/bridge_meta.json`** (Task 20, atomic write):
```json
{ "generated_at": "2026-06-11T08:02:11+10:00",
  "regime": "risk_on", "chase_enabled": true,
  "spy": {"verdict": "LONG", "score": 0.41}, "qqq": {"verdict": "LONG", "score": 0.38},
  "counts": {"total": 40, "aligned": 16, "pullback": 4, "tech_fund": 6, "hc": 6} }
```

**`reports/rotation_latest.json`** (Task 21): `[{industry, quadrant: "leading|improving|weakening|lagging", rs_ratio, rs_mom, breadth, n, r1w, r1m, r3m, rank, drank}]`.

**SQLite (`argus.db`)** — additive migration in `getDb()`:
```sql
-- signals: existing cols + ret_126d/ret_252d already present, ADD:
conviction TEXT, action_label TEXT, trade_style TEXT, combo TEXT,
ticker_regime TEXT, n_eff REAL, report_group TEXT, near_aligned INTEGER,
sector TEXT, industry TEXT, theme TEXT, mentions INTEGER, accounts INTEGER,
top_accounts TEXT, setup_label TEXT, next_earnings_date TEXT
-- new table:
CREATE TABLE IF NOT EXISTS watchlist (
  ticker TEXT PRIMARY KEY, pinned_at TEXT NOT NULL, price_at_pin REAL
);
```

**Next API routes:** `GET/POST/DELETE /api/watchlist` · `GET /api/signals/history?ticker=X` · `GET /api/signals/dates` · `GET /api/signals/by-date?date=` · `GET /api/signals/recent?days=14` (first-flag query for the tracker). Argus proxy (`/api/argus/[...path]`) unchanged.

## A11. Display rules (normative)

- **Signs/decimals:** scores always signed, 2dp on ticker page with CI, **bar-or-1dp on Today**; returns `+5.1%` 1dp signed; RS values 1dp unsigned; breadth integer %; zero renders `0.00`.
- **Alignment:** text left; numerics right with `tabular-nums`; badges/dots centre (UI 18 widths).
- **Colour:** green/red only for signed data values; amber = warnings/staleness; teal/amber = regime; accent blue = interactive only. Never colour n_eff green-for-high.
- **Sorting:** group order fixed; in-group = tier → combo class → combined desc. agreement_pct is never a sort key.
- **Sample-size:** every aggregate row displays n; n<5 greyed; conversion rates display their eligible denominator.
- **Downgrades/drops:** always neutral-styled information, never red/sell-styled.
- **Price history basis:** `/api/history` series for both endpoints of any "then→now" computation.

---

# Part B — Implementation tasks

Tests: vitest for `lib/` logic; UI verified by the Playwright smoke script (Task 44) + `npm run build`. Run dashboard commands from `dashboard/`. Commit after every task.

## Phase 0 — Hygiene

### Task 1: Test scaffolding + env path for bridge CSV

**Files:** Modify `dashboard/package.json`, `dashboard/lib/bridge.ts`; Create `dashboard/vitest.config.ts`, `dashboard/lib/__tests__/bridge.test.ts`

- [ ] `npm i -D vitest` ; add `"test": "vitest run"`, `"ingest": "node scripts/ingest.ts"` to scripts
- [ ] `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
```
- [ ] Failing test:
```ts
import { describe, it, expect } from "vitest";
import { resolveBridgePath } from "@/lib/bridge";
describe("resolveBridgePath", () => {
  it("uses BRIDGE_DIR when set", () => {
    expect(resolveBridgePath("/x")).toBe("/x/bridge_latest.csv");
  });
  it("defaults to ../reports", () => {
    expect(resolveBridgePath(undefined)).toMatch(/reports\/bridge_latest\.csv$/);
  });
});
```
- [ ] Implement in `lib/bridge.ts` (replace the hardcoded absolute path):
```ts
export function resolveBridgePath(dir = process.env.BRIDGE_DIR): string {
  const base = dir ?? path.join(process.cwd(), "..", "reports");
  return path.join(base, "bridge_latest.csv");
}
```
  and use it in `loadBridgeSignals()`. Add papaparse global boolean transform (impl 6) and drop the three manual coercions:
```ts
Papa.parse<Record<string, unknown>>(content, {
  header: true, dynamicTyping: true, skipEmptyLines: true,
  transform: (v) => (v === "True" ? true : v === "False" ? false : v),
});
```
- [ ] `npm test` → PASS; `npm run dev` → Today renders. Commit `fix(dashboard): env-based bridge path, global bool parsing, vitest scaffold`

### Task 2: Fix `/options/[ticker]` crash + remove dead nav link

**Files:** Modify `dashboard/app/options/[ticker]/page.tsx`, `dashboard/components/Nav.tsx`

- [ ] Replace the Next-15 pattern (the page has never rendered — `use(params)` throws on Next 14):
```ts
export default function OptionsPage({ params }: { params: { ticker: string } }) {
  const upper = params.ticker.toUpperCase();
```
  (delete the `use` import and the `Promise` type)
- [ ] Remove the `/options` link from `Nav.tsx` (no index route exists)
- [ ] Verify: `curl -s -o /dev/null -w "%{http_code}" localhost:3000/options/AMD` → 200 (offline state renders if IBKR down). Commit `fix(dashboard): options page Next-14 params crash; drop dead nav link`

### Task 3: Watchlist schema shim + remove fake date

**Files:** Modify `dashboard/app/accounts/page.tsx`, `dashboard/app/action/[ticker]/page.tsx`

- [ ] In accounts page, tolerate both legacy shapes on read:
```ts
const entries = (JSON.parse(stored) as unknown[]).map((e) =>
  typeof e === "string" ? { ticker: e, pinned_at: "" } : (e as WatchlistEntry)
);
```
- [ ] In action page `handlePinWatchlist`, push `{ ticker, pinned_at: new Date().toISOString() }` (object, not string), de-duped by `.some(e => e.ticker === ticker)`
- [ ] Delete the `Last signal: new Date()` line in `WatchlistCard` (it renders today's date always — fake; real date returns in Task 35)
- [ ] Verify: pin from `/action/AMD`, open `/accounts` — card renders ticker correctly. Commit `fix(dashboard): unify watchlist shapes; remove fabricated last-signal date`

### Task 4: Screener no-auto-run + sticky offset + HC label

**Files:** Modify `dashboard/app/screener/page.tsx`, `dashboard/components/FilterBar.tsx`, `dashboard/app/page.tsx`

- [ ] Screener: delete the on-mount `useEffect`; add a second button `Run default universe` → `runScreener(null)`; empty state "Enter tickers or run the default universe"
- [ ] FilterBar: `sticky top-0` → `sticky top-[44px] z-30` (below nav)
- [ ] Home header: `{hcRows.length} HC · {rows.length} signals` (drop "longs" — HC includes WAIT verdicts)
- [ ] Commit `fix(dashboard): screener explicit-run only; sticky offset; honest HC count`

### Task 5: Fix `/api/fundamentals` event-loop bug (Python)

**Files:** Modify `argus/argus/api/routes.py:174-180`

- [ ] Root cause: sync route runs in an AnyIO worker thread with no asyncio loop; `ib_insync`/yfinance paths call `get_event_loop()`. Own a loop for the call (do **not** make the route `async` — `run_until_complete` on the uvicorn loop deadlocks):
```python
@app.get("/api/fundamentals/{symbol}")
def fundamentals(symbol: str):
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return _fundamentals_impl(symbol.upper())   # existing body
    except Exception as e:
        return {"error": str(e), "symbol": symbol.upper()}
    finally:
        loop.close()
        asyncio.set_event_loop(None)
```
- [ ] Apply the same wrapper to `account` and `portfolio` if they exhibit the same error (test each)
- [ ] Verify: `curl -s 127.0.0.1:8088/api/fundamentals/AMD` returns data, not the event-loop error (restart API first). Commit in repo root: `fix(argus): own an event loop in threaded sync routes`

## Phase 1 — Foundation (tokens, components, shell, SQLite, Python emitters)

### Task 6: Design tokens + Tailwind mapping

**Files:** Modify `dashboard/app/globals.css`, `dashboard/tailwind.config.ts`

- [ ] Add the §A8 token block to `globals.css` `:root`, plus:
```css
*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
body { background: var(--bg); color: var(--text); }
```
- [ ] Map in `tailwind.config.ts`:
```ts
theme: { extend: { colors: {
  bg: "var(--bg)", surface: "var(--surface)", elevated: "var(--elevated)",
  line: "var(--border)", muted: "var(--muted)", accent: "var(--accent)",
  pos: "var(--green)", neg: "var(--red)", warn: "var(--amber)", teal: "var(--teal)",
}, height: { nav: "var(--nav-h)" } } }
```
- [ ] `npm run build` passes. Commit `feat(dashboard): design token sheet`

### Task 7: Core UI primitives

**Files:** Create `dashboard/components/ui/{Badge,ConvictionDot,ScoreBar,MicroBar,StatChip,Panel,Sparkline,Skeleton,EmptyState}.tsx`; `npm i lucide-react @radix-ui/react-tooltip @radix-ui/react-popover`

- [ ] Implement per §A9. Key contracts —
```ts
// Badge.tsx
const TIER: Record<string,string> = {
  PRIME_LONG: "bg-warn/20 text-warn border-warn/50",
  BREAKOUT_LONG: "border-pos/50 text-pos", STANDARD_LONG: "border-pos/30 text-pos",
  WATCH: "border-line text-muted", AVOID: "border-neg/50 text-neg", WAIT: "border-line text-muted",
};
// Panel.tsx — collapsible persists via localStorage key `dash:panel:${persistKey}`
// Sparkline.tsx — pure SVG polyline, props {values:number[]; w?:number; h?:number}
```
- [ ] MicroBar/ScoreBar: fixed −1..+1 domain, centre tick, green/red by sign (never per-row normalised)
- [ ] Commit `feat(dashboard): ui primitives (Badge, Panel, bars, chips, sparkline, states)`

### Task 8: `DataTable` with sort/expand/keys/sticky

**Files:** Create `dashboard/components/ui/DataTable.tsx`

- [ ] API:
```ts
export interface Column<T> {
  key: string; header: string; width?: string;
  align?: "left" | "right" | "center"; sortable?: boolean;
  sortFn?: (a: T, b: T) => number; render: (row: T) => React.ReactNode;
}
export interface DataTableProps<T> {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  expandedRender?: (row: T) => React.ReactNode;
  persistKey?: string;                 // localStorage `dash:table:${k}:sort`
  onOpen?: (row: T) => void;           // Enter / ticker-cell click
}
```
- [ ] Behaviors (all from §A1/§A9): click header = sort toggle (persisted); row click or `Space`/`→` = expand (150ms max-height); `onOpen` only from the designated open-cell or `Enter`; `j`/`k` move `focusedRowIndex` (container keydown listener, skip when target is editable); thead `sticky` at `top-nav z-30 bg-surface`; first column `sticky left-0 bg-inherit border-r border-line` inside an `overflow-x-auto` wrapper; zebra + `hover:bg-elevated`
- [ ] Commit `feat(dashboard): DataTable (sort, expand, keyboard, sticky col/header)`

### Task 9: Nav + context strip + CommandK + help overlay

**Files:** Rewrite `dashboard/components/Nav.tsx`; Create `dashboard/components/{ContextStrip,StatusDot,CommandK,HelpOverlay}.tsx`; Modify `dashboard/app/layout.tsx`; Delete `dashboard/components/GKeySpotlight.tsx`

- [ ] Nav per §A1: links Today/Watchlist/Performance/Sources/Screener; right cluster = `<ContextStrip/>` `0DTE↗` `Portfolio` `⌘K` `<StatusDot/>`; height `h-nav`
- [ ] `ContextStrip` is a **server component** in `layout.tsx`'s nav slot: reads `reports/bridge_meta.json` (graceful fallback: CSV `fs.statSync` mtime, counts from CSV) → regime pill (teal/amber), freshness (✓/amber/red per §A1), counts with tooltip
- [ ] `CommandK` (client): opens on `⌘K` or bare `g` (skip editable targets — reuse GKeySpotlight's guard, then delete the file); results per §A9 (bridge rows w/ group+tier badges → watchlist → raw "Open X →"); arrow-keys + Enter → `router.push('/t/'+t)`
- [ ] `HelpOverlay` on `?`: static key list (g/⌘K, j/k, Enter, Space, Esc, ?)
- [ ] `StatusDot` (client): popover; `Promise.all([fetch('/api/argus/health'), …])` on open only; rows: Argus API · IBKR (via `/api/argus/portfolio` probe result cached) · last ingest date (from `/api/signals/dates` once it exists; until then omit)
- [ ] Commit `feat(dashboard): nav shell, context strip, command palette, help overlay`

### Task 10: Redirects + route scaffolds

**Files:** Modify `dashboard/next.config.mjs`; Create `dashboard/app/t/[ticker]/page.tsx` (scaffold), `dashboard/app/{watchlist,performance,sources}/page.tsx` (scaffolds)

- [ ] `next.config.mjs`:
```js
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
  async redirects() {
    return [
      { source: "/action/:ticker", destination: "/t/:ticker", permanent: true },
      { source: "/options/:ticker", destination: "/t/:ticker", permanent: true },
      { source: "/options", destination: "/", permanent: true },
      { source: "/agents", destination: "/", permanent: true },
      { source: "/accounts", destination: "/sources", permanent: true },
    ];
  },
};
export default nextConfig;
```
  (Next 14 key is `experimental.serverComponentsExternalPackages`; `permanent` issues 308 — fine for GET.) The old `/action`, `/options`, `/agents` page files are deleted in Task 25/41 after `/t` reaches parity; redirects land now so links can be written against final routes.
- [ ] `/t/[ticker]` scaffold: plain-object params, renders header + "under construction" panels; `/watchlist` `/performance` `/sources` scaffolds render their titles (sources temporarily re-exports the accounts page component)
- [ ] Commit `feat(dashboard): final routes + redirects, serverExternalPackages`

### Task 11: SQLite v2 — hot-reload-safe singleton + migration

**Files:** Rewrite `dashboard/lib/db.ts`; Create `dashboard/lib/__tests__/db.test.ts`

- [ ] Failing test (uses a temp DB path):
```ts
import { describe, it, expect } from "vitest";
import { openDb } from "@/lib/db";
import fs from "fs"; import os from "os"; import path from "path";
it("creates schema with new columns and watchlist table", () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "db-")), "t.db");
  const db = openDb(p);
  const cols = db.prepare("PRAGMA table_info(signals)").all().map((r: any) => r.name);
  for (const c of ["report_group","action_label","n_eff","next_earnings_date"])
    expect(cols).toContain(c);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='watchlist'").get()).toBeTruthy();
});
```
- [ ] Implement (impl 1 pattern — `globalThis` stash survives HMR; WAL; additive `ALTER TABLE` migration; §A10 columns):
```ts
import Database from "better-sqlite3";
import path from "path";
declare global { var __argusDb: Database.Database | undefined }

const NEW_COLS: Record<string,string> = {
  conviction:"TEXT", action_label:"TEXT", trade_style:"TEXT", combo:"TEXT",
  ticker_regime:"TEXT", n_eff:"REAL", report_group:"TEXT", near_aligned:"INTEGER",
  sector:"TEXT", industry:"TEXT", theme:"TEXT", mentions:"INTEGER",
  accounts:"INTEGER", top_accounts:"TEXT", setup_label:"TEXT", next_earnings_date:"TEXT",
};

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`CREATE TABLE IF NOT EXISTS signals ( /* existing column list from current db.ts */ );
           CREATE TABLE IF NOT EXISTS watchlist (
             ticker TEXT PRIMARY KEY, pinned_at TEXT NOT NULL, price_at_pin REAL );`);
  const existing = new Set(db.prepare("PRAGMA table_info(signals)").all().map((r: any) => r.name));
  for (const [c, t] of Object.entries(NEW_COLS))
    if (!existing.has(c)) db.exec(`ALTER TABLE signals ADD COLUMN ${c} ${t}`);
  return db;
}
export function getDb(): Database.Database {
  if (globalThis.__argusDb) return globalThis.__argusDb;
  const p = process.env.ARGUS_DB ?? path.join(process.cwd(), "..", "argus.db");
  globalThis.__argusDb = openDb(p);
  return globalThis.__argusDb;
}
```
- [ ] `npm test` PASS. Commit `feat(dashboard): sqlite v2 — WAL, HMR-safe singleton, additive migration, watchlist table`

### Task 12: Ingest script + backfill

**Files:** Create `dashboard/scripts/ingest.ts`, `dashboard/lib/ingest.ts`, `dashboard/lib/__tests__/ingest.test.ts`

- [ ] Failing tests for the pure logic (latest-per-day selection + row mapping):
```ts
import { latestPerDay, rowToSignal } from "@/lib/ingest";
it("keeps lexicographically-latest file per day", () => {
  expect(latestPerDay(["bridge_20260610_0800.csv","bridge_20260610_1450.csv","bridge_20260609_0800.csv"]))
    .toEqual(new Map([["2026-06-10","bridge_20260610_1450.csv"],["2026-06-09","bridge_20260609_0800.csv"]]));
});
it("maps a CSV row to a signal record", () => {
  const r = rowToSignal({ ticker:"AMD", combined_score:0.74, high_conviction:true,
    group1:true, group2:false, near_aligned:false, conviction:"high" }, "2026-06-10");
  expect(r).toMatchObject({ date:"2026-06-10", ticker:"AMD", high_conviction:1, report_group:"aligned" });
});
```
- [ ] `lib/ingest.ts`: `latestPerDay(names)` (group on `slice(7,15)`, keep max suffix — `HHMM` sorts lexicographically, impl 5); `rowToSignal(row, date)` maps CSV→DB cols, booleans→0/1, derives `report_group` when the CSV lacks the column (pre-Task-19 files): `group1→aligned`; `group2 && conviction==='high' && sentiment_score<0.20→pullback`; `group2→tech_fund`; else `other` (mirrors `sentiment_bridge.py:281-283,802-804`); rejects rows where `combined_score` is not a finite number (quant 20 — count + report rejects)
- [ ] `scripts/ingest.ts`: readdir `BRIDGE_DIR ?? ../reports` for `^bridge_\d{8}_\d{4}\.csv$`, parse with the Task-1 papaparse config, upsert in one transaction:
```ts
const stmt = db.prepare(`INSERT INTO signals (date,ticker,${cols}) VALUES (@date,@ticker,${params})
  ON CONFLICT(date,ticker) DO UPDATE SET ${updates}`);
const tx = db.transaction((rows) => rows.forEach((r) => stmt.run(r)));
```
  print `ingested N days, M rows, R rejected`
- [ ] Run backfill: `node scripts/ingest.ts` → expect ~25–30 days from the existing dated files; spot-check `sqlite3 ../argus.db "SELECT date, COUNT(*) FROM signals GROUP BY date ORDER BY date DESC LIMIT 5"`
- [ ] Commit `feat(dashboard): bridge ingest with backfill (latest-per-day, idempotent upsert)`

### Task 13: Watchlist + signals API routes

**Files:** Create `dashboard/app/api/watchlist/route.ts`, `dashboard/app/api/signals/{history,dates,by-date,recent}/route.ts`; Create `dashboard/lib/signals.ts`

- [ ] `lib/signals.ts` query helpers (all prepared statements on `getDb()`):
```ts
export const signalHistory = (t: string) => getDb().prepare(
  `SELECT date, report_group, action_label, combined_score, entry
     FROM signals WHERE ticker=? ORDER BY date ASC`).all(t.toUpperCase());
export const reportDates = () => getDb().prepare(
  `SELECT DISTINCT date FROM signals ORDER BY date DESC`).all();
export const byDate = (d: string) => getDb().prepare(
  `SELECT * FROM signals WHERE date=? ORDER BY combined_score DESC`).all(d);
export const recentFirstFlags = (days: number) => getDb().prepare(
  `SELECT ticker, MIN(date) AS first_date,
          (SELECT report_group FROM signals s2 WHERE s2.ticker=s.ticker AND s2.date=MIN(s.date)) AS first_group,
          (SELECT entry FROM signals s3 WHERE s3.ticker=s.ticker AND s3.date=MIN(s.date)) AS entry_at_flag,
          MAX(date) AS last_date
     FROM signals s
    WHERE report_group IN ('aligned','pullback','tech_fund')
    GROUP BY ticker
   HAVING first_date >= date('now', ?)
    ORDER BY first_date DESC`).all(`-${days} days`);
```
- [ ] `api/watchlist/route.ts`: GET → all rows; POST `{ticker}` → fetch quote via Argus proxy server-side for `price_at_pin`, insert-or-ignore; DELETE `{ticker}`. Return updated list each time.
- [ ] Thin route handlers around the helpers; verify each with curl. Commit `feat(dashboard): watchlist + signal-history API`

### Task 14: Python — `report_group`, `theme`/`industry`, earnings columns (CSV)

**Files:** Modify `~/Market_Analyse/sentiment_bridge.py`

- [ ] At the row-dict build (`sentiment_bridge.py:335` area) add `report_group` using the **same** conditions the report builder uses at lines 281–283 and 796–806 — extract a helper so report and CSV can never diverge:
```python
def _report_group(group1, group2, conviction, sentiment_score):
    if group1: return "aligned"
    if group2 and str(conviction).lower() == "high" and sentiment_score < NEAR_SENT:
        return "pullback"
    if group2: return "tech_fund"
    return "other"
```
  and refactor the section-building code (798–806) to consume it.
- [ ] Add `theme` and `industry` columns from the existing sector-taxonomy mapping the report already prints ("AI / Compute → Semiconductors" = theme → industry).
- [ ] Add `next_earnings_date` / `earnings_in_days`: in the catalyst/fundamental leg (it already holds a `yf.Ticker` per name), read the next earnings timestamp (`tkr.calendar` `Earnings Date`, fallback `get_earnings_dates(limit=8)` first future row); emit ISO date + integer days, empty on failure. Wrap in the leg's existing best-effort try/except.
- [ ] Regenerate: run the manual bridge command (SESSION_HANDOFF §1) and confirm new CSV headers + sensible values for 3 known tickers. Re-run `node scripts/ingest.ts`. Commit `feat(bridge): report_group, theme/industry, next-earnings columns`

### Task 15: Python — `bridge_meta.json` + `rotation_latest.json`

**Files:** Modify `~/Market_Analyse/sentiment_bridge.py`, `~/Market_Analyse/sector_rotation.py`

- [ ] In `sentiment_bridge.py`, after the report write (it already has regime, chase flag, SPY/QQQ verdicts, and group lists in scope), emit §A10's `bridge_meta.json` with an **atomic** write (impl 17):
```python
import json, os
tmp = os.path.join(REPORTS_DIR, "bridge_meta.tmp.json")
with open(tmp, "w") as f: json.dump(meta, f)
os.replace(tmp, os.path.join(REPORTS_DIR, "bridge_meta.json"))
```
- [ ] In `sector_rotation.py`, alongside the Markdown panel emit `rotation_latest.json` (§A10 fields incl. `n`; same atomic pattern). The panel function already computes every field — serialize, don't recompute.
- [ ] Run both; validate with `python3 -m json.tool reports/bridge_meta.json reports/rotation_latest.json`. Commit `feat(pipeline): machine-readable meta + rotation sidecars (atomic writes)`

### Task 16: Hook ingest into the daily run

**Files:** Modify `~/Market_Review/run_daily.sh`

- [ ] After the bridge + Obsidian-copy steps:
```bash
(cd "$HOME/Market_Analyse/dashboard" && node scripts/ingest.ts) \
  >> "$HOME/Market_Analyse/logs/ingest.log" 2>&1 || echo "ingest failed" >> "$LOG"
```
- [ ] Run the script block manually once; check `logs/ingest.log`. Commit (Market_Review repo) `chore: ingest bridge CSVs into dashboard db after daily run`

## Phase 2 — Today page

### Task 17: Bridge types + grouping/sorting lib

**Files:** Modify `dashboard/types/bridge.ts`, `dashboard/lib/bridge.ts`; Create `dashboard/lib/groups.ts`, `dashboard/lib/__tests__/groups.test.ts`

- [ ] Extend `BridgeRow` with: `conviction: "high"|"med"|"low"|null`, `action_label`, `trade_style`, `combo`, `ticker_regime`, `n_eff`, `catalyst_score`, `vote_event_catalyst`…`vote_analyst_upside`, `gate_flags`, `report_group`, `near_aligned: boolean`, `theme`, `industry`, `next_earnings_date: string|null`, `earnings_in_days: number|null` (parser: empty string → null)
- [ ] Failing tests:
```ts
import { groupSignals, tierSort, comboClass } from "@/lib/groups";
it("groups by report_group with fallback derivation", () => {
  const g = groupSignals([
    { ticker:"A", report_group:"aligned" }, { ticker:"B", report_group:"pullback" },
    { ticker:"C", report_group:"tech_fund" }, { ticker:"D", report_group:"other" },
  ] as any);
  expect(g.aligned.map(r=>r.ticker)).toEqual(["A"]);
  expect(g.other.map(r=>r.ticker)).toEqual(["D"]);
});
it("sorts tier > combo class > combined, never raw score first", () => {
  const rows = [
    { ticker:"X", action_label:"STANDARD_LONG", combo:"LNNL", combined_score:0.9 },
    { ticker:"Y", action_label:"PRIME_LONG",    combo:"LSNS", combined_score:0.4 },
  ] as any;
  expect([...rows].sort(tierSort)[0].ticker).toBe("Y");
});
it("classifies combos", () => {
  expect(comboClass("LSNS")).toBe("strong"); expect(comboClass("LNNL")).toBe("weak");
  expect(comboClass("LLNS")).toBe("neutral");
});
```
- [ ] Implement: `ACTION_ORDER = ["PRIME_LONG","BREAKOUT_LONG","STANDARD_LONG","WATCH","WAIT","AVOID"]`; `STRONG = new Set(["LSNS","LNLL","LSNL"])`, `WEAK = new Set(["LNNL","LLNL"])`; `tierSort` = tier index asc → combo class (strong<neutral<weak) → combined desc. `groupSignals` keys off `report_group` with the Task-12 fallback for old rows.
- [ ] `npm test` PASS. Commit `feat(dashboard): bridge row v2 + report grouping/tier sorting`

### Task 18: Diff lib (yesterday comparison)

**Files:** Create `dashboard/lib/diff.ts`, `dashboard/lib/__tests__/diff.test.ts`

- [ ] Failing tests:
```ts
import { diffReports } from "@/lib/diff";
const y = [{ ticker:"AMD", report_group:"aligned", sentiment_score:0.5 },
           { ticker:"QBTS", report_group:"pullback", sentiment_score:-0.08 },
           { ticker:"UNH", report_group:"aligned", sentiment_score:0.3 }] as any;
const t = [{ ticker:"AMD", report_group:"aligned", sentiment_score:0.5 },
           { ticker:"QBTS", report_group:"aligned", sentiment_score:0.25 },
           { ticker:"AAOI", report_group:"tech_fund", sentiment_score:0.28 }] as any;
const d = diffReports(t, y);
it("flags new tickers", () => expect(d.newTickers.has("AAOI")).toBe(true));
it("flags drops with their old group", () =>
  expect(d.dropped).toEqual([{ ticker:"UNH", group:"aligned" }]));
it("flags group moves", () =>
  expect(d.groupMoves).toEqual([{ ticker:"QBTS", from:"pullback", to:"aligned" }]));
it("flags sentiment turns on yesterday-pullback names (Δ≥0.15)", () =>
  expect(d.sentimentTurns.has("QBTS")).toBe(true));
```
- [ ] Implement over actionable groups only (`aligned|pullback|tech_fund`); "yesterday" loader = second-latest date in SQLite (`byDate`), falling back to the second-latest dated CSV when DB is empty
- [ ] PASS. Commit `feat(dashboard): yesterday-diff computation`

### Task 19: Today page assembly

**Files:** Rewrite `dashboard/app/page.tsx`; Create `dashboard/components/today/{DiffStrip,SignalGroups,RotationPanel}.tsx`; Delete `dashboard/components/{SignalCard,SignalListBody,SignalTable,FilterBar,FilterContext,ReturnsBar,AlignmentCompass}.tsx` (compass is cut, cards are dead)

- [ ] `page.tsx` (server component, no SWR — impl 19): load rows + meta + rotation JSON + diff; pass to client assemblies
- [ ] `DiffStrip`: per §A2 — NEW/moved/turned/dropped lines; dropped suffixed "(info only — downgrades are not sell signals)"; collapsible, `persistKey="diff"`; hidden when no previous date exists
- [ ] `SignalGroups`: four `Panel`s (last one collapsed w/ count) each containing a `DataTable` with the §A2 column set —
```ts
const columns: Column<BridgeRow>[] = [
  { key:"ticker", header:"Ticker", render: r => <TickerCell row={r} isNew={diff.newTickers.has(r.ticker)} /> }, // navigates
  { key:"tier", header:"Signal", render: r => <Badge variant="tier" value={r.action_label} /> },
  { key:"conv", header:"C", align:"center", render: r => <ConvictionDot value={r.conviction} /> },
  { key:"legs", header:"Sent · Tech · Fund", render: r => <LegBars s={r.sentiment_score} t={r.tech_score} f={r.catalyst_score} /> },
  { key:"industry", header:"Sector", render: r => <span className="text-muted">{r.industry || "—"}</span> },
  { key:"r1d", header:"1D", align:"right", sortable:true, render: r => <Ret v={r.ret_1d} /> },
  { key:"r1m", header:"1M", align:"right", sortable:true, render: r => <Ret v={r.ret_20d} /> },
  { key:"flags", header:"⚑", render: r => <RowFlags ext={r.is_extended} earnDays={r.earnings_in_days} /> }, // amber chip when ≤10
  { key:"cat", header:"Cat", render: r => <CatalystCount value={r.catalysts} /> },     // hover popover w/ list
];
```
  default order = `tierSort`; expanded row per §A2 (levels + dist-to-entry needs no live quote here — use `ret_1d`-adjusted display only if quote absent: show levels, combined ⓘ "magnitude does not predict returns (r≈0)", quality, n_eff, regime, 1W/6M/1Y, `Sparkline` from `/api/argus/history?period=3mo` lazy-fetched on first expand, mentions/accounts/top accounts, earnings date, "Open →")
- [ ] Filters row (search / HC ⓘ"consensus, not edge" / conviction / sector-from-data) above the first group — plain client state + localStorage persistence
- [ ] `RotationPanel`: collapsed `Panel` **below** the groups; header summary = top-2 Leading industries + "N/12 fading"; body = §A2.1 table with hysteresis dot, n column, thin-basket grey, breadth tooltip
- [ ] Verify against live data; `npm run build`. Commit `feat(dashboard): Today — diff strip, grouped tier-sorted tables, rotation panel`

## Phase 3 — Ticker page

### Task 20: CandleChart component

**Files:** Create `dashboard/components/charts/CandleChart.tsx`; `npm i lightweight-charts@4`

- [ ] Client-only wrapper (impl 3 — dynamic import inside the effect, StrictMode-safe, v4 API):
```tsx
"use client";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";

export interface Level { price: number; kind: "entry" | "stop" | "target" }
export interface Marker { date: string; label: string }
export interface Bar { ts: string; open: number; high: number; low: number; close: number; volume: number }

export default function CandleChart({ bars, levels = [], markers = [], height = 420 }:
  { bars: Bar[]; levels?: Level[]; markers?: Marker[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    let destroyed = false;
    import("lightweight-charts").then(({ createChart, ColorType }) => {
      if (destroyed || !ref.current) return;
      const chart = createChart(ref.current, {
        height, layout: { background: { type: ColorType.Solid, color: "#0b0e14" }, textColor: "#8b93a3" },
        grid: { vertLines: { color: "#161b24" }, horzLines: { color: "#161b24" } },
        rightPriceScale: { borderColor: "#222936" }, timeScale: { borderColor: "#222936" },
      });
      const series = chart.addCandlestickSeries({
        upColor: "#3fb950", downColor: "#f85149", wickUpColor: "#3fb950",
        wickDownColor: "#f85149", borderVisible: false,
      });
      chartRef.current = chart; seriesRef.current = series;
      const STYLE = { entry: { color: "#e6e8ec", lineStyle: 2, title: "E" },
                      stop: { color: "#f85149", lineStyle: 0, title: "S" },
                      target: { color: "#3fb950", lineStyle: 0, title: "T" } } as const;
      for (const l of levels)
        series.createPriceLine({ price: l.price, lineWidth: 1, axisLabelVisible: true, ...STYLE[l.kind] });
    });
    return () => { destroyed = true; chartRef.current?.remove(); chartRef.current = null; };
  }, []); // mount-only; data flows via the next effect

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(bars.map(b => ({
      time: (Date.parse(b.ts) / 1000) as UTCTimestamp,
      open: b.open, high: b.high, low: b.low, close: b.close })));
    seriesRef.current.setMarkers(markers.map(m => ({
      time: (Date.parse(m.date) / 1000) as UTCTimestamp,
      position: "belowBar", shape: "arrowUp", color: "#4c8dff", text: m.label })));
  }, [bars, markers]);

  return <div ref={ref} className="w-full" />;
}
```
  (Data-update effect must also run after the async create resolves — call it from the import `.then` once, or hold bars in a ref; implement whichever, but both mount orders must render data.) Volume histogram pane + EMA line series (computed client-side from closes: 20/50/200 SMA-seeded EMA) added the same way; range pills refetch `/api/argus/history/{t}?period=` ; per-ticker persistence `dash:chart:{t}`
- [ ] Verify on `/t/AMD` scaffold with live history data; chart renders, lines labelled, no StrictMode double-chart. Commit `feat(dashboard): candlestick chart (lightweight-charts v4, E/S/T lines, markers)`

### Task 21: Ticker page — header, levels & risk

**Files:** Rewrite `dashboard/app/t/[ticker]/page.tsx`; Create `dashboard/components/ticker/{Header,LevelsCard}.tsx`

- [ ] Server component loads: bridge row (today, by ticker), signal history (SQLite), history bars (server fetch of the Argus proxy target) — client islands get them as props; live quote + action card via SWR client-side
- [ ] `Header` per §A3: 28px mono ticker, quote+day% (SWR `/api/argus/quote/{t}`, 30s), Badges, ConvictionDot, HC ⓘ; **flag-age line** = first SQLite row (`first flagged {n}d ago at {entry_at_flag} · {+x}% since` — both prices from the history series §RB) + static context "median pick peaks +23% @ ~7d" (constants exported by `lib/performance.ts`, Task 24); **earnings chip** amber when `earnings_in_days ≤ 10`; Pin button → POST/DELETE `/api/watchlist`
- [ ] `LevelsCard`: E/S/T/R:R "indicative" ⓘ; stop-anchor sentence (map: `ema_50` → "Stop rides the 50-day EMA", `supertrend` → "Stop tracks the SuperTrend line", `psar` → "Stop at the parabolic SAR", `swing_low` → "Stop under the last swing low", else raw); dist-to-entry from live quote; size calc:
```tsx
const [risk, setRisk] = useLocalStorage("dash:riskUsd", 500);
const shares = entry > stop ? Math.floor(risk / (entry - stop)) : null;
```
  footnote: "Calculator only — levels are context, not an exit system (mechanical exits backtested ~breakeven)."
- [ ] Layout: `grid grid-cols-[62fr,38fr] gap-4 max-[1100px]:grid-cols-1`; left = CandleChart (`min-h-[420px] 2xl:min-h-[560px]`) ; right starts Levels → (Task 22 panels)
- [ ] Commit `feat(dashboard): ticker page shell — header, chart wiring, levels & risk`

### Task 22: Why panel (live action card)

**Files:** Create `dashboard/components/ticker/WhyPanel.tsx`; Modify `dashboard/types/argus.ts`

- [ ] Extend `ActionCardData` with the fields `to_dict()` already returns (`builder.py:558-599`): `score_ci_lo, score_ci_hi, inflation_gap, family_attribution: Record<string,number>, family_votes: Record<string,{long:number;short:number;wait:number}|string>, ticker_regime, n_eff, combo, trade_style, action_label, adx_value, adx_slope, meta_coherence, meta_adjustment, meta_note` — verify exact `family_votes` shape against `curl 127.0.0.1:8088/api/action_card/AMD | python3 -m json.tool` before typing
- [ ] Render per §A3: headline = `combo` + decode map:
```ts
const COMBO_NOTE: Record<string,string> = {
  LSNS: "dip-buy profile — trend up, oscillators cooled (best backtested class)",
  LNLL: "trend + squeeze + oscillators confirming",
  LSNL: "trend up, mixed confirmation",
  LNNL: "chasing risk — oscillators confirm into extension (backtested negative)",
  LLNL: "chasing risk — everything confirming late (backtested ~flat)",
};
```
  score `0.67 [0.41–0.78]` (+ "wide" tag when `ci_hi−ci_lo > 0.25`); agreement w/ inflation-gap suffix when `>0.15`; family rows = net-direction bar + `n/N` + LOO delta (`family_attribution`); n_eff neutral chip ⓘ "higher is not better — high n_eff backtested worse"; regime + ADX chip; `meta_note` amber callout "Meta-analyst: …" tagged advisory-only; collapsed "agent votes (N agreed · M dissented)" accordion listing names+confidence, notes only when non-empty
- [ ] Loading: skeleton "Running 70 agents… ~10s" (off-bridge tickers hit a cold compute). Error: "Argus API offline — `cd argus && ./run.sh api`"
- [ ] Commit `feat(dashboard): Why panel — combo headline, CI, family bars + LOO, meta-analyst note`

### Task 23: Catalysts/fundamentals, sentiment, history, options, AI panels

**Files:** Create `dashboard/components/ticker/{CatalystsCard,SentimentCard,HistoryCard,OptionsPanel,AiPanel}.tsx`; Delete `dashboard/app/options/[ticker]/page.tsx`, `dashboard/app/action/[ticker]/page.tsx`, `dashboard/components/{VoteMatrix,FamilyRings,AgreeDissentList}.tsx`, `dashboard/app/agents/page.tsx`

- [ ] `CatalystsCard`: catalyst rows (polarity stripe ▌ green/red + lucide icon + text + age, from bridge `catalysts` today / `/api/fundamentals` off-bridge); 5 fundamental vote ticks (`vote_*` cols, ✓/✗/—); stats line rev/margin/target-vs-price/short%
- [ ] `SentimentCard`: ScoreBar, mentions, accounts, conviction; account chips with tier-coloured left edge → `/sources`; "No social signal today — last seen {date|never}" when off-bridge
- [ ] `HistoryCard`: SQLite rows table `date · group · label · combined · then→now%` (then = entry at flag date from DB, now = last close from the chart's bars — same series); also feeds chart markers
- [ ] `OptionsPanel` (left, under chart): port the working pieces of the old options page minus max pain — summary P/C table, IV row, unusual tables; collapsed single-line "IBKR offline · Retry" state
- [ ] `AiPanel`: collapsed; button "Generate analysis ~10s" → `/api/argus/analysis/{t}` once, shimmer in output area, result cached in component state. **No chat.**
- [ ] Right-column order: Levels → Why → Catalysts → Sentiment → History → AI. Delete the four legacy files + agents page (redirects from Task 10 already cover the routes). Full-page verify on: AMD (in report), SPY (off-report), GIBBERISH (error state)
- [ ] Commit `feat(dashboard): ticker page complete; retire action/options/agents pages`

## Phase 4 — Watchlist, Performance, Sources

### Task 24: Performance lib + page

**Files:** Create `dashboard/lib/performance.ts`, `dashboard/lib/__tests__/performance.test.ts`, `dashboard/app/performance/page.tsx` (replace scaffold)

- [ ] Failing tests for the honest-stats rules (quant ★3/16/17):
```ts
import { perfStats } from "@/lib/performance";
const rows = [ // schema: reports/selection_performance.csv
  { ticker:"A", first_said:"2026-05-08", entry:10, peak:15, "peak_gain_%":50, days_to_peak:5 },
  { ticker:"B", first_said:"2026-05-09", entry:10, peak:11, "peak_gain_%":10, days_to_peak:0 },
  { ticker:"C", first_said:"2026-06-10", entry:10, peak:10.5, "peak_gain_%":5, days_to_peak:1 },
];
const s = perfStats(rows as any, new Date("2026-06-11"));
it("uses median as headline", () => expect(s.medianPeak).toBe(10));
it("excludes young picks from conversion denominators (≥10 trading days)", () =>
  expect(s.reached10.eligible).toBe(2));           // C is 1 day old → excluded
it("reports day-0 peaks separately and excludes from days-to-peak median", () => {
  expect(s.day0Count).toBe(1); expect(s.medianDaysToPeak).toBe(5);
});
```
- [ ] Implement + export `MEDIAN_PEAK_PCT` / `MEDIAN_DAYS_TO_PEAK` constants (consumed by the ticker header flag-age line). Page per §A5: caveat banner (verbatim §A5 text), KPI row w/ eligible denominators, recharts histogram with median reference line, by-`action_label` and by-`combo`-class tables joined from SQLite signals (first-flag row per ticker) with n per row + n<5 grey, label-efficacy aggregation of `docs/label_efficacy/*.csv` (latest file; median f5/f10/f20 by label), history browser (`/api/signals/dates` picker → `by-date` table + SPY same-window return via history endpoint, caption per §A5)
- [ ] Commit `feat(dashboard): performance page — censoring-aware stats, tier/combo cuts, history browser`

### Task 25: Watchlist page (+ migration) and Sources rename

**Files:** Rewrite `dashboard/app/watchlist/page.tsx`, `dashboard/app/sources/page.tsx`; Delete `dashboard/app/accounts/page.tsx`, `dashboard/app/api/watchlist-signals/route.ts` (superseded)

- [ ] Watchlist per §A4: Pinned table (SWR on `/api/watchlist`, since-pin% from history-series closes) + one-time client migration:
```ts
useEffect(() => {
  const raw = localStorage.getItem("argus_watchlist");
  if (!raw) return;
  const tickers = (JSON.parse(raw) as unknown[]).map(e => typeof e === "string" ? e : (e as any).ticker);
  Promise.all(tickers.filter(Boolean).map(t => fetch("/api/watchlist", { method:"POST", body: JSON.stringify({ ticker: t }) })))
    .then(() => localStorage.removeItem("argus_watchlist"));
}, []);
```
- [ ] Recent-picks section: `/api/signals/recent?days=14` → table per §A4 (still-in = last_date === latest report date; "dropped" plain-styled; age + "typical peak ~{MEDIAN_DAYS_TO_PEAK}d" context column)
- [ ] Sources = old accounts page content (minus watchlist section) restyled with tokens/DataTable
- [ ] Commit `feat(dashboard): watchlist (pinned + auto recent picks), sources page`

## Phase 5 — Retirement & polish

### Task 26: Retire legacy UIs

**Files:** Delete `~/Market_Analyse/argus_dashboard.html`; Replace `argus/argus/ui/index.html`

- [ ] Replace Argus-Local UI with a landing: `<h1>Argus API</h1><p>Dashboard: <a href="http://localhost:3000">localhost:3000</a> · API docs: /docs</p>` (root route keeps serving it; `/ui` static mount now irrelevant)
- [ ] `git rm argus_dashboard.html` (Next.js app reached parity in Phases 2–3). Note for the user, don't touch: `~/argus_dashboard.html`, `~/argus_live.html`, `~/argus-live.html` strays in the home dir
- [ ] Commit `chore: retire legacy dashboards — one UI at :3000`

### Task 27: Polish sweep + smoke script

**Files:** Create `dashboard/scripts/smoke.mjs`; sweep across components

- [ ] Sweep checklist: every fetch has skeleton + designed empty/error state; formatting rules §A11 audited per page; `?` overlay lists all live keybindings; responsive pass at 1280/1440/2560 (sticky first column engages <1280); persistence keys all read/write (`sort`, `panel`, `chart range`, `riskUsd`, filters)
- [ ] `smoke.mjs` (adapted from the existing Playwright pass): visit `/`, expand a row, `/t/AMD`, `/t/SPY`, `/watchlist`, `/performance`, `/sources`, `/screener`, `/portfolio`; assert no console errors, no 404/500, screenshot each; run with `node scripts/smoke.mjs` against dev server
- [ ] `npm run build && npm test && node scripts/smoke.mjs` all green. Commit `chore(dashboard): polish sweep + smoke harness`

---

## Self-review checklist (run before execution)

- Spec coverage: every §4 spec item is either tasked above or explicitly cut in §RB ✓
- All five reviewer high-impact items have a task: UI 1→T9, UI 2/8/9/14→T6/19/21, trader 1–5→T18/14/21/25/21, quant ★1–5→T17/22/24/19, impl 1–5→T11/5/20/2/12, PM MVP line = end of Task 23 ✓
- Type consistency: `BridgeRow` extension (T17) precedes all consumers; `Column<T>` (T8) used by T19/24/25; `perfStats` constants (T24) consumed by T21 header — T21 ships with placeholder constants `{23, 7}` until T24 lands (acceptable: same values, sourced from OVERVIEW.md)
- Acceptance (PM): morning scan ≤2min · zero 404/500 on daily paths · chart+E/S/T on every bridge ticker · 5+ sortable columns · watchlist persists across sessions with real since-pin %
