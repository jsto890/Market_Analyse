# Handoff: Argus UI Overhaul

## Overview

A full UI overhaul of the Argus trading dashboard (`Market_Analyse/dashboard/`, Next.js 14 + Tailwind + SWR). Fourteen screens across ten existing routes plus five new ones, driven by an audit of every route, rail, panel and shared component in the app.

The product is a dark trader terminal and stays one. What changes is that it stops looking like ten pages built by ten people:

1. **One page contract.** Ten routes currently use six content widths, three wrapper patterns, two header components, four loading idioms and five empty-state idioms.
2. **The explanation layer comes out of the tooltip.** Several `InfoTip`s wrap `sr-only` children, so they render no visible trigger at all — the knowledge exists in the codebase (`HEADER_GLOSS`, `GREEK_LABEL`, `PORTFOLIO_EDGE_LABEL`, a whole `/glossary` route) and is reachable almost nowhere.
3. **Not everything is a table.** Eight of ten routes are `PageHeader` + `DataTable`, so the product's actual output — a judgement about a stock — is a cell in row 7.
4. **Pages stop being terminal.** `/macro` scores a sector and stops. `/rotation` plots a quadrant and stops. Nothing hands you to the next step.

Two navigational defects are fixed as part of this: the What's Next rail's `+N more ›` links to `/macro` (a sentiment page with zero calendar content), and the options ladder's mode switch is an unlabelled 36×20 toggle whose only label is an `aria-label`.

## About the design files

`mocks/Argus Overhaul - Today + Ticker.dc.html` is a **design reference created in HTML** — a prototype showing intended look, layout and behaviour. It is **not production code to copy**. It is a single static file with inline styles, no React, no data layer.

Your task is to **recreate these designs in the existing Next.js codebase** using its established patterns: Tailwind classes against the token layer in `app/globals.css`, the `components/ui/*` primitives, SWR for data, and the existing `lib/*` helpers. Lift the exact values (hex codes, px sizes, spacing, copy) from the mock; do not lift its markup.

The mock needs `mocks/support.js` beside it to render. Open it in a browser and pan/zoom — it is a wide canvas, roughly 1440px per screen.

## Fidelity

**High fidelity.** Final colours, typography, spacing and layout. Recreate pixel-accurately using the codebase's existing libraries and patterns. Data shown in the mock is realistic but illustrative — wire real data.

## Reading order

1. `MARKET_ANALYSE_UI_AUDIT.md` — the ~175 findings this is all based on, each citing its source file. Read for context; you don't need it to implement.
2. `MARKET_ANALYSE_UI_OVERHAUL.md` — the design system and page-by-page rationale. **Read this second.**
3. `MARKET_ANALYSE_IMPLEMENTATION_PLAN.md` — **the build order. This is your working document.** Phased, each phase independently shippable, each task naming files and acceptance criteria.
4. `mocks/` — the visual reference.
5. `e2e/screens.spec.ts` — a Playwright screenshot harness. Run it before you start to capture a baseline, then after every phase to diff.

---

## Design tokens

### Colour

Existing, in `app/globals.css` — unchanged:

| Token | Value | Role |
|---|---|---|
| `--bg` | `#06090f` | deepest background |
| `--surface` | `#0c1017` | nav, rails, page cards |
| `--elevated` | `#12171f` | raised cards, table headers |
| `--raised` | `#1a212c` | hover, inputs, active segments |
| `--line` | `#1e2634` | hairlines |
| `--line-strong` | `#2c3648` | section dividers, card borders |
| `--text` | `#eef1f6` | primary |
| `--muted` | `#7d8698` | labels, secondary |
| `--accent` | `#4c8dff` | interactive |
| `--green` | `#3fb950` | up / profit |
| `--red` | `#f85149` | down / loss |
| `--amber` | `#d29922` | attention, degraded |
| `--teal` | `#2dd4bf` | calls |
| `--nav-h` | `46px` | nav height |

**New, must be added:**

| Token | Value | Sole meaning |
|---|---|---|
| `--put` | `#e372b0` | puts. They currently borrow `--red`, which also means "down" — so a rising put reads red for two contradictory reasons |
| `--model` | `#9d7cf5` | model output: scores, conviction, verdicts. These currently render in P&L green/red, which tells the user a 0.72 score is profit. The app's own caveat line says magnitude does not predict returns (r≈0) |
| `--text-2` | `#c8cede` | secondary reading copy — explanations, card body, "read this" strips |
| `--text-3` | `#9aa3b4` | tertiary — subtitles, supporting detail under a heading |

`--call` is an alias of `--teal`.

**Rules, enforced:**
- `--accent` is interactive only. Never data.
- `--green`/`--red` are money direction only. Never model output.
- Nothing darker than `--muted #7d8698` carries a sentence. It measures 5.15:1 on `--surface` and passes AA; a step darker does not. Decorative axis ticks may go dimmer.

### Typography

`Fira Sans` (`--font-sans`) and `Fira Code` (`--font-mono`), both already loaded via `next/font/google` in `app/layout.tsx`. `font-variant-numeric: tabular-nums` on everything mono.

Six roles. The codebase already has partial semantic classes (`text-micro`, `text-dense`, `text-body`, `text-subhead`) — finish the job and remove arbitrary `text-[11px]` / `text-[12px]` / `text-[13px]`.

| Role | Size / weight / family | Use |
|---|---|---|
| `display` | 28 / 600 / mono | ticker symbol; the one number a page is about |
| `headline` | 20 / 600 / sans | page title |
| `title` | 15 / 600 / sans | panel and card titles |
| `body` | 13 / 400 / sans | prose, explanations, table cells |
| `data` | 13 / 400 / mono tnum | all numerics |
| `micro` | 11 / 500 / mono, uppercase, `letter-spacing: 0.08em` | eyebrows and column headers **only** |

**The highest-impact single change: 11px stops being a content size.** Today the Morning Brief's most actionable line, every ladder cell and every rail row are 11px. Those move to `data`/`body` at 13px.

Section eyebrow pattern, used everywhere: 11px / 500 / mono / uppercase / `0.08em` / `--muted`.

### Spacing & shape

- Page: `py-6`, `space-y-5` between sections, `space-y-3` within.
- Card padding: `14px` compact, `18px 20px` for hero blocks.
- Table cell padding: `6px` (dense grids), `8px 16px` (standard rows), `9px 14px` (list rows).
- Gaps: `12px` between cards in a grid, `16px` between major regions, `6px` between action buttons.
- Radius: `8px` cards and panels, `6px` controls and segmented groups, `5px` chips and buttons, `4px` badges and inline tags, `3px` bars, `2px` bar fills.
- Borders: `1px solid --line` default; `1px solid --line-strong` for emphasis; `2px` only for the ladder's calls/puts divider and active-state left borders.
- Shadow: none in-app. The mock's `0 24px 60px rgba(0,0,0,0.5)` is canvas presentation only.

### Layout contract

One component, `<Page width>`, used by all routes:

| Width | Value | Routes |
|---|---|---|
| `prose` | 880px | `/alerts`, `/learn/*` |
| `wide` | 1240px | `/`, `/watchlist`, `/screener`, `/portfolio`, `/rotation`, `/macro`, `/calendar` |
| `full` | fluid, 24px gutters | `/t/[ticker]`, `/options/ladder` |

Shell: nav 46px, left rail 208px (36px collapsed), right rail 260px (36px collapsed), content between. `RailShell` owns the scroll — **delete `min-h-screen` from `/screener`, `/portfolio`, `/alerts`**, which nest a full viewport inside a viewport-minus-nav scroller.

---

## Screens

Fourteen, by mock id. Full rationale per screen is in `MARKET_ANALYSE_UI_OVERHAUL.md`; build order and acceptance criteria in `MARKET_ANALYSE_IMPLEMENTATION_PLAN.md`.

### `1a` — Today (`/`)

**Purpose:** the first screen of the morning. What happened overnight, what's scheduled today, what the model flagged.

Four bands, top to bottom:

1. **Brief masthead** — not a collapsible card. Eyebrow + date + `as of HH:MM`; synthesis at `headline`; three linked tiles in a 3-col grid (`Tape` · `Positioning` · `Tone`), each with numbers and a one-line read; then news chips.
   - Fix: de-dupe chips by ticker and show the real headline. `watchlist_news.slice(0,5)` currently has no de-dupe, so one ticker with three headlines renders `$MSFT news` three times, and the headline is `title=`-only.
   - Fix: wire `FutureChip` into the Tape tile — the component exists in `MorningReport.tsx` and is never rendered.
   - Remove "What to expect" from the brief. Unfiltered by date, it lists events six days out under a daily brief and duplicates the rail three columns away.
2. **Today's tape** (new) — a 04:00–20:00 ET axis, 150px tall. Session bar with inline `PRE · 04:00` / `REGULAR · 09:30` / `AFTER · 16:00` labels; a `now` pill on its own lane above the bar; earnings chips above; economic releases below on a **three-lane ladder** with vertical connectors and left-aligned labels.
   - Critical: labels must be lane-assigned, not centred by percentage. Three morning releases fall inside ~11% of a 16-hour axis while their labels are 145–218px wide; percentage-centred labels overlap and are unreadable.
3. **Signals** — group tabs with counts (`Aligned 12 · Pulling back 4 · Tech + fund 7 · Everything else 31`), filter toolbar unchanged, `CAVEAT_LINE` printed **once** as a read-this strip (currently four times), top 3 as cards, remainder tabular.
   - Signal card: ticker + sector, tier badge and score in `--model`, three leg bars, one-line reason, E/S/T + R:R, action bar.
4. **Rotation strip** — 11 sector cells with heat fill, linking to `/rotation`.

### `1b` — Ticker (`/t/[ticker]`)

**Header, three fixed zones** in a `1fr 320px 300px` grid:
- **Identity** — symbol at `display`, company name at `title`, then sector · industry · market cap (the last three are new).
- **Price** — last at `display`, change % and absolute; day-range bar with a spot marker; volume vs ADV with a mini bar.
- **Verdict** — tier badge with **display copy** (`STANDARD_LONG` → "Standard long"), conviction dots, HC chip. All in `--model`.

Below the header, in order:
- **Action bar** — Pin · Set alert · Options ladder · Compare · Copy, plus a right-aligned earnings chip. Currently `PinToggle` is the only verb on the page.
- **Track record**, three equal columns: `This call` (7 May @ 287.51 → 333.43, +16.0% in 84 days) / `Cohort` (median peak +23% at ~7d) / `Read` (states the comparison in words).

**Delete `TickerSubNav`.** Its seven labels are printed again 40px below as `Panel title`; it only anchors the right column; and below 1100px the grid's `order-1`/`order-2` reorders so nav order no longer matches document order. Replace with a 32px sticky icon rail that can address both columns.

Fix regardless: the scroll-spy uses `entries.find(e => e.isIntersecting)`, which takes the first entry in callback order rather than the topmost — sort by `boundingClientRect.top`.

**Resolve the earnings contradiction:** the chip reads `earnings in 1d` from `bridgeRow.earnings_in_days` while `CatalystStrip` reads "next earnings 31 Jul", which is the same day. One source, one basis, one place.

Body keeps the 62/38 split; entry/stop/target are drawn **on** the chart rather than listed in a card beside it.

### `2a` — Options ladder (`/options/ladder`)

Full-bleed, rails collapsed.

**Control bar**, left to right:
- `Data` — two-segment **`Live` / `EOD`** with a status dot, plus source · age · freshness. This replaces the unlabelled `Toggle`.
- `Strikes` — **`±10 / ±20 / ±40 / All`**, persisted, default `±20`, driving both modes. Currently `useLadder(symbol, 4, 0.06)` hard-codes ±6% (~76 strikes per expiry on SPY) with no UI, while `/odte` calls the same hook with a different density.
- `Columns` — `Price` / `Flow` / `Gamma` / `Greeks` toggles; greeks off by default. 23 columns → 13.
- Right: `Jump to strike…`, `Centre on spot`.

**Expiry chips** with expected move.

**Levels strip**, three groups separated by 1px rules: *Price levels* (ATM · zero-γ · call wall · put wall · max pain) / *Regime* (long-gamma verdict · net GEX · pin risk) / *Data quality* (fresh % · as-of · source). One precision throughout.

**The ladder** — `width: max-content; margin: 0 auto` so the card hugs its fixed tracks and centres.
- Spanning group header: `CALLS` (teal tint) | 96px spacer with 2px dividers | `PUTS` (magenta tint).
- Row tracks: `72px 56px 96px 92px 62px 62px 96px 62px 62px 92px 96px 56px 72px` = 976px.
- Column order **from the strike outward on both sides**: Bid · Ask · Vol · OI · IV · GEX. Left-to-right that is `GEX IV OI Vol Ask Bid | Strike | Bid Ask Vol OI IV GEX`.
- Calls right-aligned, puts left-aligned. OI/Vol carry proportional bar fills anchored toward the strike.
- Strike column sticky, `--elevated` background, markers `ATM` (amber left border) `ZG` (teal) `CW` (teal) `PW` (magenta) `MP` (muted).

**Explainer at the bottom, collapsed**, with a `How to read this →` link in the header. It currently opens above the ladder on every visit *and* documents the classic layout while rendering in both modes.

### `2b` — Calendar (`/calendar`) — new route

**Purpose:** what is coming, what it means, and what it does to the names you hold. This is where the rail's `+N more ›` should have gone all along.

- Filters: `30d` / `60d`, and `All` / `High impact` / `Watchlist earnings`.
- **Month-ahead strip**: the top-tier prints called out (`NFP · 8 Aug`, `CPI · 12 Aug`, `PCE · 29 Aug`) plus a watchlist earnings count.
- **Week spine**: `This week` / `Next week` / `Later this month`, each a card of day rows in a `104px 1fr` grid — date rail left, events right.
- Event row tracks `62px 26px 1fr 96px 96px 96px 20px`: time · importance rank (`TOP`/`HI`/`MD`) · name · **actual · consensus · prior** · chevron.
- **Expanded event**, three columns: *What it measures* / *Why it matters now* / *Beat / miss ⇒ what moves* — the latter with threshold rows (`> 200k`, `< 130k`) naming the affected tickers, and a footer line giving the user's own exposure.
- **Earnings on the same timeline** — watchlist chips on their day with session (BMO/AMC) and implied move.

Backend: the calendar endpoint serves `days=7`; needs 30–60 plus consensus/prior/actual.

### `2c` — Gamma (`/options/gamma`)

- **Regime hero**: "Long gamma" at 26px in teal, "Dealers dampen moves" beneath; a spot-vs-flip scale with a red→teal gradient, zero-γ and spot markers, `SHORT GAMMA · moves extend` / `LONG GAMMA · moves pin` end labels; net GEX and a pin-risk bar.
- **GEX profile**: 15 strike rows, horizontal bars off a centred axis, calibrated to the printed ±400 scale (bar % = value/400 × 50). Positive teal right, negative magenta left. ATM/ZG/CW/PW rows tinted.
- **Levels card**: each level with a sentence saying what it does — not a tooltip.
- **Net GEX by expiry**: four centred bars.
- **Scenario card** (amber): what happens if spot breaks the flip, written before it happens.

### `2d` — Flow (`/options/flow`)

- Three ratio tiles (P/C volume, P/C OI, unusual count), each with a gauge and a sentence interpreting it.
- **Unusual prints** table, tracks `62px 132px 70px 78px 92px 82px 1fr`: time · contract · size · premium · **vs OI** · **aggressor** · plain-English read. The two bolded fields are what separate new positioning from churn and buyers from sellers.
- **Volume vs OI by strike** — five bars showing where the book is genuinely being built.
- **Flow tilt** summary card.

### `2e` — Greeks (`/options/greeks`)

- Four aggregate dealer-exposure cards (Δ, Γ, Vanna, Charm), each with the value, its unit, and one line on what it does to today's tape.
- **Per-strike greeks table** in the same mirrored layout as the ladder (`CALLS` | Strike | `PUTS`, tracks `1fr ×4 | 96px | 1fr ×4`) so the muscle memory carries: Vega · Θ · Γ · Δ | Strike | Δ · Γ · Θ · Vega.
- **Skew** scatter with an ATM marker, puts magenta / calls teal.
- **Term structure** — four bars, the payrolls expiry highlighted amber.

### `3a` — Options overview (`/options`)

- Header carries a **symbol switcher**: `SPY / QQQ / IWM / DIA / SPX`, same segmented control as the ladder.
- **Session read** hero: one sentence at `headline`, an agreement count (`3 of 4 inputs agree`) as four segments, then a paragraph naming the dissent.
- **Today's box**: expected-move band with put wall, zero-γ, spot and call wall marked.
- **Four evidence cards** (Regime / Levels / Skew / Flow), each opening with a bolded plain read, then three stats, then a link to its detail route.
- **"If you're trading this"**: candidate strikes with intent, contract, cost, breakeven, max loss and a reason — with a read-this strip stating they are candidates, not recommendations, and that none survive a break of the flip.

### `3b` — Rotation (`/rotation`)

- **Narrative card** above the chart, stating what is rotating in one sentence.
- **RRG**, 470px, four tinted quadrants with **labels drawn on the chart** and a one-line gloss each (Improving / Leading / Lagging / Weakening).
- **Eight-week trails** — two fading dots behind each current dot. An RRG without trails is a scatter plot; the rotation *is* the trail.
- Dots labelled with **sector names**, not ETF tickers, with a legend under the plot mapping name → ETF.
- Sidebar: `Moved most this week` with quadrant transitions; a sector detail card with the names you hold in it and its macro tone; an `Ahead of it` card tying the rotation to calendar events.
- Trail length control `4w / 8w / Off`.

### `3c` — Macro (`/macro`)

- **Methodology panel, permanent** and on the page: *Input* (article count, sources) / *Scoring* (FinBERT per sentence, entity-matched to scope) / *Weighting* (decay half-life, source multiplier, what `n` counts) / *What it isn't* (not a price forecast; below n=40 treat as noise).
- Lookback control **labelled**, reading `1 hour / 1 day / 1 week` — bare `1h/1d/1w` is ambiguous between lookback and interval.
- **Scope tiles** sorted by absolute change, each with score, `n`, **Δ vs previous** and a 10-bar sparkline. Muted inside the ±0.05 neutral band, coloured outside.
- **Chart** with the ±0.05 band shaded, zero line, and the benchmark **on the selected window**. Currently `page.tsx:24` hard-codes `period=1mo&interval=1d`, so on `1h` you overlay a month of daily bars on an hour of sentiment.
- **"What moved it"** — top weighted headlines with individual scores and weights. A sentiment number that can't be audited is a number nobody acts on.
- **"Where this lands"** — names driving the scope, your exposure, rotation quadrant, next catalyst, with links out.

Also: stop the silent `scope → "global"` reset when the selected scope has no data in the new window.

### `4a` — Watchlist (`/watchlist`)

- Summary chips above the add bar; each filters the grid.
- **Pinned names as cards**, 3 across: symbol, pin date and price, live price and change, 12-bar sparkline, **since-pin at card weight**, tier badge or earnings chip, action bar. Since-pin and today's badge are currently the fifth and sixth of ten columns.
- **Recent picks** stays tabular, and gains a **window-progress** bar showing how far each pick is into the ~7-day median-peak window it is measured against.
- Collapse the two near-identical concurrency loops (`fetchHistoriesWithConcurrency` plus an inline copy for last-signals) into one batch endpoint.
- Migration banner → toast.

### `4b` — Screener (`/screener`)

- Keep the controls and states — abort, cancel, cached/fresh, re-run, persisted results are the best-built interaction layer in the product.
- **Min score becomes a slider with a live count** ("42 of 500 above the bar"), so the threshold's effect is visible before you re-run.
- **Top 3 as result cards**: symbol, sector, score in `--model`, **vote split as one stacked bar** (green/amber/red with counts beneath), R:R and returns, action bar.
- Remainder tabular, tracks `82px 120px 84px minmax(168px,1fr) 74px 76px 76px 72px` — the vote-bar track takes the slack.
- The stacked bar replaces three numeric columns (`L`, `S`, `W`).

### `4c` — Portfolio (`/portfolio`)

- **Portfolio band**: six numbers — NLV, day P&L, unrealised, cash, exposure, top-sector concentration. Three chips is not a summary. Move `TWS · port 7496 · live` out of the page subtitle into the status chip.
- **Disagreement band leads the page** (amber-bordered): which positions the model has turned against, each with the reason in prose and the P&L. *This is the reason to open the page and it does not exist today.*
- **Position cards**: symbol, size and avg cost, verdict badge, unrealised P&L, a progress bar, market value, and a one-line note (agreement, earnings risk, or the conflict).

### `4d` — Alerts (`/alerts`)

- Channel row states what happens when only one channel is on, and links to configure.
- **Rule builder reads as the sentence it will fire**: *"Alert me when **[NVDA]** **[verdict flips to]** **[Short]**"* — inline dropdown-styled controls at 14px in reading order, on a 2.1 line-height. Replaces five bare `<label>`s that reflow when the condition changes.
- **Active rules**: one line of prose per rule, last-fired, toggle, delete. Drop the duplicated kind chip — `KIND_LABEL` currently renders in both the chip and `ruleSummary()`.
- **Recent fires**: day-grouped, each with a `from this rule` link back to its rule, plus rule and date-range filters.

---

## Interactions & behaviour

- **Transitions** — 140ms ease on `color`, `background-color`, `border-color`, `opacity`, `box-shadow`. Already in `globals.css`; respect the existing `prefers-reduced-motion` block.
- **Hover** — rows lift to `--elevated`; buttons and chips move muted → foreground; links accent → lighter accent.
- **Focus** — keep the existing global `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px }`.
- **Segmented controls** — active segment gets `--raised` background and `--text`; inactive `--muted`, no background. Persist selection to localStorage via the existing `useLocalStorage` + `STATIC_KEYS`.
- **Gloss** — dotted `1px` underline in the term's own colour; click (not hover) expands a two-line definition in place; focusable; Escape closes.
- **Read-this strips** — always visible, 12px `--muted`, at the **foot** of a panel above a `1px --line` rule.
- **Live ladder polling** — keep the current `useOptionsLivePoller` behaviour: 500ms base, exponential backoff to 5s, abort on symbol/expiry change, pause on `document.hidden`, STALE badge after consecutive failures. It is correct; don't rewrite it.
- **Density and mode changes** re-fetch; keep scroll anchored on the ATM row.
- **Responsive** — the target is 1440–1920 desktop. Below 1280 both rails auto-collapse to 36px (existing `NARROW_QUERY` behaviour). Below 1100 the ticker page goes single-column; if `TickerSubNav` is replaced by the icon rail as specified, the current nav-order mismatch disappears.

## State

Mostly existing. New state to add:

| State | Scope | Persist |
|---|---|---|
| `strikeDensity` | `/options/ladder` | localStorage |
| `ladderMode` (`live` \| `eod`) | `/options/ladder` | localStorage (replaces `odteLiveMode`) |
| `columnGroups` | `/options/ladder` | localStorage |
| `optionsSymbol` | all `/options/*` | localStorage (existing `odte-symbol`) |
| `calendarHorizon` (30/60) + filter | `/calendar` | localStorage |
| `expandedEvent` | `/calendar` | ephemeral |
| `trailLength` (4w/8w/off) | `/rotation` | localStorage |
| `selectedSector` | `/rotation` | ephemeral |
| `railCollapsed` (left, right) | shell | localStorage |
| `activeSignalGroup` | `/` | localStorage |
| `savedScreens` | `/screener` | server |

Data requirements not currently met by the backend:
- Calendar: 30–60 day horizon, plus consensus / prior / actual per event.
- Macro: previous-reading delta and a short history per scope (for tile sparklines); article-level drill-down with per-article score and weight; benchmark series matching the selected window.
- Rotation: 8 weeks of RS-ratio / RS-momentum history per sector.
- Ticker: sector, industry, market cap, ADV.
- Portfolio: day P&L, sector exposure.
- Options: a strike-count / band parameter on the live ladder endpoint.

## Assets

None. No images, no icon files. Icons in the app come from `lucide-react`, already a dependency. Fonts are self-hosted at build time via `next/font/google`. The mock draws all charts, bars and markers in CSS — reimplement charts with the existing chart libraries (`lightweight-charts` for price, `recharts` for the rest) or CSS where the mock's approach is simpler.

## Files in this bundle

```
README.md                              ← you are here
MARKET_ANALYSE_UI_AUDIT.md             audit, ~175 findings with source citations
MARKET_ANALYSE_UI_OVERHAUL.md          the design system and page-by-page rationale
MARKET_ANALYSE_IMPLEMENTATION_PLAN.md  ★ the phased build order — work from this
mocks/
  Argus Overhaul - Today + Ticker.dc.html   all 14 screens (needs support.js beside it)
  support.js
e2e/
  screens.spec.ts                      Playwright screenshot harness
```

## First session

```
Read MARKET_ANALYSE_IMPLEMENTATION_PLAN.md and execute Phase 0, then Phase 1.
Do not start Phase 2 until Phase 1's acceptance criteria pass.
```

Phase 1 is the one to resist cutting. It adds no features and changes every page; every later phase assumes it. Skipping it means implementing each page's redesign against the same inconsistent substrate the overhaul exists to remove.
