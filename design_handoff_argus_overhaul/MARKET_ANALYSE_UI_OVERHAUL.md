# Argus — Full UI Overhaul Spec

**Date:** 31 Jul 2026 · **Scope:** every route in `dashboard/`, the shell, the rails, and the shared component layer.
**Posture:** this is not a defect list. It is a redesign. Where a page needs replacing, the replacement is specified. Where a page is fine, it says so.

**Pages walked for this pass:** `layout.tsx`, `RailShell.tsx`, `Nav*.tsx`, `globals.css`, `/` (`page.tsx` + `MorningReport` + `DiffStrip` + `SignalGroups`), `/t/[ticker]` (+ 15 ticker components), `/odte`, `/odte/strikes` (641 lines), `/watchlist` (648 lines), `/screener`, `/portfolio`, `/alerts`, `/rotation`, `/macro`, `/glossary`, `/sources`, `rails/*`, `ui/*`.

---

## Part I — The diagnosis

Argus has good bones and no system. The token ladder in `globals.css` is genuinely well made — five surfaces, semantic states, tabular figures, thin scrollbars, reduced-motion. Then every page ignores it in a different way.

Four structural failures, in order of damage:

**1. There is no page contract.** Ten routes, six content widths, three wrapper patterns, two header components, four loading idioms, five empty-state idioms. Concretely:

| Route | Wrapper | Width | Padding | Header |
|---|---|---|---|---|
| `/` | `<main>` | `max-w-6xl` | `px-4 py-6` | none (Morning Brief is the header) |
| `/t/[ticker]` | `<main>` | `max-w-[1400px]` | `px-4 py-4` | custom `Header.tsx` |
| `/odte` | `<main>` | full bleed | `px-4 py-2` | hand-rolled `<h1 class="text-sm">` |
| `/odte/strikes` | `<main>` | full bleed | `px-4 py-2` | hand-rolled `<h1 class="text-sm">` |
| `/watchlist` | `<main>` | `max-w-5xl` | `px-4 py-6` | `PageHeader` |
| `/screener` | `<div class="min-h-screen">` | `max-w-6xl` | `px-4 py-6` | `PageHeader` |
| `/portfolio` | `<div class="min-h-screen">` | `max-w-5xl` | `px-4 py-6` | `PageHeader` |
| `/alerts` | `<div class="min-h-screen">` | `max-w-5xl` | `px-4 py-6` | `PageHeader` |
| `/rotation` | `<main>` | `max-w-6xl` | `px-4 py-6` | `PageHeader` |
| `/macro` | `<main>` | `max-w-5xl` | `px-6 py-6` | `PageHeader` |

Three of those pages set `min-h-screen` **inside** `RailShell`'s `h-[calc(100vh-var(--nav-h))]` scroller — a full viewport height nested inside a viewport-minus-nav scroller, which guarantees a scrollbar with nothing to scroll to.

**2. The product explains itself only on hover.** The explanation layer is `InfoTip` + `title=`. Several InfoTips wrap `<span className="sr-only">` children, so there is *no visible trigger at all* — three on `/odte/strikes`, one on `/odte`. The knowledge exists in the codebase (`HEADER_GLOSS`, `GREEK_LABEL`, `PORTFOLIO_EDGE_LABEL`, `WATCHLIST_STATUS_LABEL`, a whole `/glossary` route) and is reachable almost nowhere.

**3. Everything is a table, so nothing has weight.** Eight of ten routes are a `PageHeader` on top of a `DataTable`. `/` renders four stacked tables; `/watchlist` two; `/screener`, `/portfolio` one each. The product's actual output — a judgement about a stock — is a cell in row 7.

**4. Every page is terminal.** `/macro` scores a sector and stops. `/rotation` plots a quadrant and stops. The Morning Brief truncates five lists at 3–5 items with no overflow. `/screener` ranks candidates and offers a pin. Nothing hands you to the next step, so the product is ten dashboards instead of one workflow.

Everything below fixes those four.

---

## Part II — The system

### 1. One page contract

Kill the per-page wrapper. One component, used by all ten routes:

```
<Page width="prose" | "wide" | "full" density="comfortable" | "dense">
  <Page.Header title subtitle status actions breadcrumb />
  <Page.Body />
</Page>
```

- **`prose`** = 880px — `/alerts`, `/glossary`, `/sources`.
- **`wide`** = 1240px — `/`, `/watchlist`, `/screener`, `/portfolio`, `/rotation`, `/macro`, `/calendar`.
- **`full`** = fluid with 24px gutters — `/t/[ticker]`, the options ladder. These are the only two surfaces that earn the whole width.
- Vertical rhythm: `py-6` top-level, `space-y-5` between sections, `space-y-3` within. No page sets its own padding again.
- `min-h-screen` is deleted from all three pages that use it. `RailShell` owns the scroll.

`PageHeader` absorbs the two hand-rolled `/odte` headers. Its `title` renders at the display size below — not `text-sm font-semibold`, which is currently smaller than the table rows underneath it.

### 2. A real type scale

Right now the product uses 11, 12, 13, 14, 18 and 28px with no rule, and `text-[11px]` does duty as both a micro-label and as body data in tables. Six roles, six tokens:

| Token | Size / weight | Use |
|---|---|---|
| `display` | 28 / 600 mono | ticker symbol, the one number a page is about |
| `headline` | 20 / 600 | page title |
| `title` | 15 / 600 | panel + card titles |
| `body` | 13 / 400 | prose, explanations, table cells |
| `data` | 13 / 400 mono tnum | all numerics |
| `micro` | 11 / 500 uppercase 0.08em | eyebrows and column headers **only** |

The rule that matters: **11px stops being a content size.** Today the Morning Brief's most actionable line, the ticker page's flag-age line, every ladder cell, and every rail row are all 11px. Data moves to 13px mono. `micro` is reserved for labels above data, never the data.

### 3. Colour, made semantic again

The tokens are fine; the assignments collide. `--teal` currently means "link" (`/odte` Overview link), "call side" (live ladder headers), "liquid" (Liq dot), and "zero-gamma marker" — four meanings on one page. `--warn` means "ATM", "BMO session", "high importance", "stale", and "HC" depending on where you are.

Fix by locking each token to one job and adding the two that are missing:

| Token | Sole meaning |
|---|---|
| `--accent` blue | interactive — links, active nav, focus, selection. Never data. |
| `--green` / `--red` | direction of money only: P&L, % change, long/short |
| `--teal` | **calls** (and only calls) |
| `--magenta` *(new)* | **puts** — currently puts borrow `--red`, which also means "down", so a rising put is red for two contradictory reasons |
| `--amber` | attention/degraded: stale data, frozen feed, near-term earnings |
| `--violet` *(new)* | model output — scores, conviction, verdicts. Today these steal green/red and imply P&L. |

Two neutrals also need naming, because the current ladder jumps straight from `--muted #7d8698` to `--text #eef1f6` with nothing between — which is why long-form copy in the mocks kept reaching for an undeclared grey:

| Token | Value | Sole meaning |
|---|---|---|
| `--text-2` | `#c8cede` | secondary reading copy — explanations, card body, "read this" strips |
| `--text-3` | `#9aa3b4` | tertiary — subtitles, supporting detail under a heading |

Anything below `--muted` in lightness is banned for reading copy: `#7d8698` on `--surface` measures 5.15:1 and passes AA, and a step darker does not. Micro axis ticks and decorative labels may go dimmer; sentences may not.

That last one is the important one. `combined_score`, `conviction`, `agreement_pct` and `verdict` are all currently rendered in the same green/red as returns, which tells the user a 0.72 score is *profit*. It isn't — the caveat line on `/` literally says "magnitude does not predict returns (r≈0)". Model output gets its own colour so it can never be mistaken for money.

### 4. The explanation layer comes out of the tooltip

Three tiers, replacing hover-only:

- **Inline gloss** — a dotted underline on the term itself, click to expand a two-line definition in place. No hover dependency, works on touch, focusable. Replaces every `sr-only` InfoTip.
- **"Read this panel" strip** — one sentence at the *foot* of every data panel explaining what the panel is for and what would make you act. Always visible, 13px, muted.
- **Learn pages** — the long-form material (`how to read the ladder`, greeks, the macro methodology, group definitions) lives in real routes under `/learn/*`, cross-linked from every gloss. `/glossary` becomes `/learn/glossary`.

Deletable once this lands: every `title=` attribute used as documentation, every `sr-only` InfoTip child, and the five-paragraph explainer currently sitting on top of the ladder.

### 5. One state kit

Four idioms become one set: `<Loading kind="table|card|chart|inline">`, `<Empty title action>`, `<Failed reason retry>`, `<Stale asOf source>`. `SkeletonTable`, `Skeleton`, the bespoke `animate-pulse` divs in `MorningReport` and `SignalGroups`, `EmptyState`, and the eight one-off `<p>Loading…</p>` strings all collapse into it.

The `<Stale>` component matters most: every data surface in this product can be old, and right now staleness is communicated five different ways (a badge on `/odte`, an amber line on `/portfolio`, a `role="status"` box on `/`, `stale_ms` text on the live ladder, and silence everywhere else).

### 6. An action layer

Add a persistent **action bar** to every object surface — ticker, position, screener row, watchlist row: `Pin · Alert · Options · Chart · Copy`. One component, four contexts. Today `PinToggle` is the only verb in the entire product.

---

## Part III — Page-by-page

### `/` Today — **rebuild**

Currently: a collapsible Morning Brief, a date stepper, a status box, a diff strip, then four stacked tables (`ALIGNED`, `HIGH CONVICTION PULLING BACK`, `TECHNICAL + FUNDAMENTAL`, `Everything else`), each repeating the same 30-word `CAVEAT_LINE`, then a rotation link. It is a report dump with a lede.

**Replace with three bands.**

**Band 1 — The brief (full width, top).** Not a collapsible card; the page's masthead.
- Line 1, `headline` size: the synthesis — "ES +1.9%, VIX lagging, 2 earnings today."
- Line 2, `body`: the GEX/positioning read, promoted out of 11px muted mono. This is the most actionable sentence on the page and currently has the lowest contrast on the card.
- A **three-tile strip**: `Tape` (futures — wire up the `FutureChip` component that exists and is never rendered), `Positioning` (GEX band + distance to zero-gamma, linking to `/options/gamma`), `Tone` (macro score **with its delta**, linking to `/macro`). Each tile is a link. Today all three of these facts are prose.
- News chips: de-dupe by ticker (three of five slots currently say `$MSFT news`), show the actual headline truncated to ~60 chars with the ticker as prefix, cap at one chip per ticker.
- `as of HH:MM` — the card refreshes every 5 min and never says when it last did.
- Remove "What to expect" from the brief entirely. It duplicates the What's Next rail three columns away and, being unfiltered by date, shows events six days out under a daily brief. The day's events belong in Band 2.

**Band 2 — Today's tape (new).** A single horizontal strip under the brief: today's economic releases and today's earnings, on a time axis from 04:00 to 20:00 ET with a now-marker. Pre-market, open, close and after-hours shaded. This is the thing a trader looks at first every morning and the product currently has nowhere to put it.

**Band 3 — Signals.** Keep the grouping — it's the product's actual thesis — but change the presentation:
- Groups become **tabs with counts**, not four stacked panels: `Aligned 12 · Pulling back 4 · Tech+Fund 7 · Other 31`. Four tables on one page means the third one is never seen.
- `CAVEAT_LINE` prints once, in the header, as a "Read this" strip — not four times.
- The top 3 rows of the active group render as **cards**, not rows: ticker, verdict, the three leg bars at readable size, the one-line reason, and the action bar. The rest stay tabular. The product's headline output should not look identical to its long tail.
- Group titles lose the SCREAMING_CASE (`ALIGNED`, `HIGH CONVICTION, PULLING BACK`) — sentence case, with the rationale as the subtitle it already has.
- The filter toolbar stays as-is. It's the best-built control in the product.

**Band 4 — Rotation.** The current bottom link (a full-width bordered box containing one sentence) becomes an inline sparkline strip: the 11 sector RS values as a mini heat row, click through to `/rotation`.

### `/t/[ticker]` Ticker — **rebuild the header, delete the sub-nav**

**Header.** Currently five type sizes on one baseline, a permanent glossary footnote as body copy, a raw `STANDARD_LONG` enum, and an earnings chip that contradicts the strip below it. Rebuild as three fixed zones:

- **Identity** (left): `AAPL` at `display` · `Apple Inc.` · sector · market cap. The last two don't exist today; a ticker header that can't tell you the sector is not a header.
- **Price** (centre): last, change, and — new — the day range and volume-vs-ADV bar. One block, one alignment, one type size for the pair.
- **Verdict** (right): the tier badge with **display copy** ("Standard long", not `STANDARD_LONG`), conviction, and HC — with the explainer moved into a click-gloss on the HC chip. The sentence "HC = ≥75% indicator agreement (consensus, not edge) · conviction dots are display-only…" currently renders as permanent body copy on every ticker that has a bridge row, whether or not HC is even present.
- **Action bar** below: `Pin · Alert · Options · Compare · Copy`. Today: `PinToggle`, alone.
- **Track record row**, separated and labelled, replacing the run-on: `This call: 7 May @ 287.51 → 333.43, +16.0% in 84d` / `Cohort: median peak +23% @ ~7d`. Then state the comparison instead of leaving the reader to compute it.
- Resolve the earnings contradiction — the chip reads "earnings in 1d" from `bridgeRow.earnings_in_days` while `CatalystStrip` below reads "next earnings 31 Jul", which is today. One source, one date basis, one place.

**Sub-nav: delete it.** `TICKER_SECTIONS` lists seven labels — Levels, Why, Catalysts, News, Sentiment, History, AI — that are printed *again* forty pixels below as the `Panel title` of each target card. It also only anchors the right column, so "Levels" scrolls past the chart into the sidebar, and below 1100px the grid reorders (`order-1`/`order-2`) so the anchors sit above the chart and the nav order no longer matches the page. Three defects for a control that duplicates content already on screen.

Replace with a **left icon rail** inside the page (32px, sticky) — seven icons, tooltip on hover, active state driven by a corrected scroll-spy (sort intersecting entries by `boundingClientRect.top`; the current `entries.find(e => e.isIntersecting)` picks whichever entry the browser reported first, so the highlight flickers). Zero duplicated words, and it can address both columns.

**Body.** Keep the 62/38 split. Two changes:
- The chart panel gets the levels overlaid (entry/stop/target, walls) rather than listed in a separate card to its right — the `LevelsCard` numbers mean nothing without the price context four inches away.
- `OptionsPanel` and `GexCard` currently sit below the chart in the left column with no relationship to the options routes. Make them a summary that links to `/options/gamma?symbol=`.

### `/odte` → `/options/*` — **split into five routes**

`/odte/strikes` is 641 lines rendering eight unrelated blocks; `/odte` adds four verdict cards, a stats strip and `StrikeGuidance`, duplicating levels with different formatting (`String(callWall)` on one page, `fmtLvl()` → `toFixed(0)` on the other). Split:

| Route | Contents |
|---|---|
| `/options` | Session verdict cards, spot/regime, what today's positioning implies. The `VerdictCard` grid, kept — it's good. |
| `/options/ladder` | The ladder, alone, full-bleed |
| `/options/gamma` | GEX profile chart, zero-gamma, walls, max pain, pin risk — with the mechanics written out, not tooltipped |
| `/options/flow` | PCR, unusual prints, volume vs OI |
| `/learn/options` | How to read the ladder, greeks, worked examples |

**The ladder page specifically:**

- **Density control, top right, persisted:** `±10 / ±20 / ±40 / All strikes`, default `±20`. Today `useLadder(activeSymbol, 4, 0.06)` hard-codes 4 expiries and a ±6% band — roughly 76 strikes per expiry on SPY at $1 increments — with no UI at all, while `/odte` calls the same hook with `(activeSymbol, 1)`. Two densities, one product, neither adjustable. The control must drive the live ladder too, which currently renders `liveLadder.levels` verbatim.
- **The unlabelled toggle gets a label.** The control nobody can identify is `<Toggle checked={showLive} label="Show live options ladder" />` — a 36×20 track whose `label` prop is `aria-label` only, by design ("the visual track carries no text"). It swaps the entire page contents. Replace with a two-segment control reading **`Live` / `EOD`**, with the provenance badge (LIVE/FROZEN/STALE/EOD) directly beside it, so mode and data state are one unit.
- **Calls and puts stop being colour-only.** The live table's header runs `C Bid Ask IV Δ Γ Θ Spread% Liq Vol OI GEX` then the identical eleven names again for puts, distinguished by teal vs red, with only `Strike` sticky. Once scrolled right you cannot tell which side you are in. Add a spanning `CALLS ← | → PUTS` group header, a 2px divider at the strike column, and the new `--magenta` for puts.
- **Column groups, toggleable:** `Price` (bid/ask/spread), `Greeks` (Δ Γ Θ), `Flow` (vol/OI), `Gamma` (GEX). Greeks off by default. 23 columns at 11px behind a horizontal mask gradient is not a table, it's a terminal dump.
- **Strike jump + centre-on-spot in both modes.** The live ladder never centres and lands you on the lowest strike of a 76-row grid; `Center on spot` is rendered only when `!showLive`.
- **One GEX unit.** Live cells divide by 1000 under a header that just says `GEX`; the classic ladder uses `fmtGex()` with B/M suffixes; the overview strip uses `fmtGex()` again. Put the unit in the header, use one formatter everywhere.
- **The levels strip gets grouped** into *Price levels* (ATM · max pain · zero-gamma · walls), *Regime* (net GEX band · pin risk), *Data quality* (fresh % · as-of · source) with consistent precision. Today it is seven metrics in one wrapping row at four different decimal precisions, one of which documents its own scale in its label (`Pin Risk (0–100)`).
- **"How to read this ladder" moves to the bottom**, collapsed, with a `How to read this →` link in the header pointing at `/learn/options`. It was promoted above the fold in the last round and overshot: five paragraphs now push the ladder off-screen on every visit. It also renders in *both* modes while documenting only the classic layout — its Columns section describes OI/Vol mirrored around the strike and green/red GEX bars, none of which exist in the 23-column live table.
- Row interaction becomes consistent: classic rows are silently click-to-copy (`cursor-pointer`, no affordance); live rows aren't clickable. Both get a visible copy action on hover/focus.

### `/macro` — **rebuild** and split off `/calendar`

**`/calendar` (new, P0).** The What's Next rail's `+N more ›` links to `/macro`, a FinBERT sentiment page with zero calendar content — the single worst navigational lie in the product. Calendar data currently surfaces in exactly two truncated places (rail `max=6`, brief `slice(0,4)`), both fetched with `days=7`. Nothing shows the next month.

- 30–60 day horizon, grouped by week, "this week / next week / later" spine.
- Per event: **consensus · prior · actual**, release time in ET *and* local, importance as a visible rank not a hover-only dot (`importanceMeta` currently puts the label in `title=`).
- Per event, expandable: **what it measures**, **why it matters now**, and **beat / miss ⇒ what moves** — the transmission chain from macro to rates to sector to the names on the user's watchlist. This is the expanded forward-looking material the product is missing entirely.
- **Earnings overlaid on the same timeline** for watchlist tickers, so "NFP Friday, AAPL prints Thursday AMC" is one view.
- Cross-links both ways: event ⇄ affected tickers ⇄ the `/macro` scope.

**`/macro` itself.** Currently: a subtitle, three window buttons, a grid of scope tiles showing a score and `n=`, and a line chart. Six problems, all structural:

- **The model is undocumented.** "FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish" is the entire methodology disclosure. Add a permanent **Methodology** panel: article count and sources, lookback and decay half-life, how a scope is assigned, what `n=` counts, what the windows mean, and what a score of +0.04 implies behaviourally.
- **The neutral band is invisible.** `toneClass()` hard-codes ±0.05, so +0.04 renders muted and +0.06 renders green with nothing on screen explaining the threshold. Shade ±0.05 on the chart and print the thresholds in the legend.
- **The tiles have no trend.** Score and `n=`, nothing else, on a page whose entire subject is sentiment *change*. Every tile gets Δ vs previous reading, a direction arrow, and a 20-point sparkline; sort by absolute change, not alphabetically.
- **The benchmark is on the wrong timebase.** The SPY overlay is hard-coded to `period=1mo&interval=1d` regardless of the selected window — on `1h` you are drawing a month of daily bars against an hour of sentiment on a shared x-axis. Bind it to `window`.
- **No drill-down, so no trust.** Nothing links a score to the articles that produced it. Clicking a tile or a chart point opens the ranked contributing headlines with individual scores and weights.
- **No macro→micro chain.** The page stops at a sector score. Add a bottom band: the tickers driving the selected scope, the user's positions in it, and the calendar events ahead for it.

Also: label the window control (`1h/1d/1w` as bare strings is ambiguous between lookback and interval), and stop the silent scope reset — the `useEffect` snaps `scope` back to `"global"` whenever the selection has no data in the new window, with no message.

### `/watchlist` — **restructure**

Two panels, `Pinned` and `Recent picks (auto)`, each a 9–10 column table. The information is right; the shape is wrong.

- Pinned names become **cards in a grid** (3 across at `wide`): ticker, sparkline, since-pin with heat, today's badge, action bar. A watchlist is a set of things you're watching, not a spreadsheet — and the current table's `Pinned · Pin price · Now · Since pin · Today · Last signal · 1W · 1M · unpin` makes the two columns you actually scan (since-pin, today) the fifth and sixth.
- The summary strip (`pinned · median since-pin · best · worst`) is good — promote it above the add-bar and make each chip filter the grid.
- `Recent picks` stays tabular but gains the diff the page implies and never shows: what changed since yesterday, and how far each pick is through the ~7d median-peak window it's measured against.
- The 648 lines contain two near-identical concurrency-limited fetch loops (`fetchHistoriesWithConcurrency` for histories, an inline copy for last-signals) each firing N requests per row. One batch endpoint, one loop.
- The migration banner (one-time localStorage→API migration) is permanent page furniture for a one-time event. Move it to a toast.

### `/screener` — **restructure**

The controls and states are the best-built on any page (abort, cancel, cached/fresh, re-run, persisted results, a real empty state). The output is the problem: a 12-column table where `Score`, `L`, `S`, `W`, `Agree%`, `HC`, `R:R`, `1d%`, `5d%` all compete at equal weight, and score/agreement render in the same green/red as returns.

- **Result cards for the top 5**, table for the rest. Each card: verdict, score on the new `--violet` model colour, the L/S/W vote split as a single stacked bar rather than three numeric columns, R:R, and the action bar.
- **Vote split as a bar** kills three columns and reads instantly.
- Min-score becomes a **slider with a live count** ("42 of 500 above 0.30") instead of a bare number input whose effect is invisible until you re-run.
- Saved screens: the controls are stateless per visit apart from the last result blob. Let a configuration be named and re-run.

### `/portfolio` — **restructure**

The offline path is better designed than the online one. Online you get three stat chips and an 8-column table; offline you get an explanation, a fallback list, a retry, and a preview of what would be there.

- **Position cards**, not rows: symbol, size, avg cost, market value, unrealised P&L with a heat bar, and — the point of this product — the Argus verdict next to the position, with `edge` spelled out inline instead of behind an `InfoTip` on a badge.
- **Portfolio-level band at top**: NLV, cash, buying power (keep), plus day P&L, exposure by sector, and concentration. Three chips is not a portfolio summary.
- **Agreement view**: which positions Argus currently disagrees with. That single view is the reason to open this page and it does not exist.
- `PageHeader subtitle="TWS · port 7496 · live"` — a port number as a page subtitle. Connection detail belongs in the status chip, not the masthead.

### `/alerts` — **keep, tighten**

Structurally the healthiest page: clear sections, optimistic updates with real undo, grouped log, working test path. Four fixes:

- The rule builder is a wrapping row of five bare `<label>`s that reflows as the condition changes. Make it a sentence: *"Alert me when **[NVDA]** **[verdict flips to]** **[LONG]**"* — inline controls in reading order.
- Rule rows print the kind label twice — once as an accent chip, once inside `ruleSummary()` ("Verdict flips to" appears in both). Drop the chip.
- Channel status (`Email ✓ Telegram — Webhook —`) is three text fragments in a bordered strip. Make it a proper status row with a link to configure, since an alert with no enabled channel silently does nothing.
- `Recent fires` shows the latest 30 with no filter by rule or symbol, and no link from a fired alert back to the rule that fired it.

### `/rotation` — **expand**

An RRG chart and a table, and that's the page. The RRG is the most sophisticated visual in the product and it is given no support: no explanation of the four quadrants, no history trail, no way to see how a sector arrived where it is.

- Quadrant labels rendered **on** the chart (Leading / Weakening / Lagging / Improving) with a one-line gloss each.
- **Tails** — 4–8 week trails per sector. An RRG without trails is a scatter plot; the rotation *is* the trail.
- Click a sector → the tickers in it, from the signals data already loaded on `/`.
- Link the page to `/macro`: sentiment by sector and rotation by sector are the same question asked two ways, and the two pages don't know about each other.

### `/sources`, `/glossary` — **fold in**

Both are orphans — no nav entry, reachable only by URL. `/glossary` becomes `/learn/glossary` and is linked from every inline gloss. `/sources` becomes a panel inside a new `/learn/data` page covering provenance and refresh cadence, and the nav gains a single **Learn** entry.

### Rails and shell

- **Left rail** (quotes / What's Next / macro gauges): rows are 11px mono at ~24px height with hover-only importance dots. Bring rows to 13px data, make importance a visible rank, and give `What's Next` a correct destination (`/calendar`).
- **Right rail** (news): flat reverse-chron list. Group by hour, mark breaking, and show which watchlist names each item touches.
- Both rails should be **collapsible and remember it**. On a 1440px screen they consume ~480px of a 1240px content budget, which is why `/odte/strikes` runs full-bleed and masks its own overflow.
- **Nav**: eight top-level items, all equal weight. Group them — `Today · Watchlist · Screener` (find) / `Ticker · Options · Rotation · Macro · Calendar` (analyse) / `Portfolio · Alerts` (act) — with a divider, and add `Learn`.
- **ContextStrip** duplicates state the pages already show. Give it one job: market clock, session phase, and global data freshness.

---

## Part IV — Component work order

**New**
`Page` / `Page.Header` · `ActionBar` · `Gloss` (inline definition) · `ReadThis` (panel-foot strip) · `Stale` · `Loading` / `Empty` / `Failed` · `SegmentedControl` (mode + density) · `DensityControl` · `ColumnGroups` · `VoteBar` · `TimeAxis` (today's tape) · `EventCard` (calendar) · `PositionCard` · `SignalCard` · `Trail` (RRG tails)

**Rework**
`PageHeader` → absorbed into `Page.Header` · `Toggle` → gains a visible label slot; `SegmentedControl` replaces it for mode switches · `InfoTip` → becomes `Gloss`, `sr-only`-only usage banned · `Badge` → display copy map, kills `STANDARD_LONG` · `DataTable` → column groups, sticky group headers, density prop · `Panel` → `ReadThis` slot

**Delete**
`TickerSubNav` · `SkeletonTable` + `Skeleton` (→ `Loading`) · `EmptyState` (→ `Empty`) · the duplicated concurrency loop in `WatchlistClient` · `FutureChip` **or** render it (it exists, is never mounted, and the tape band needs it) · every `title=` used as documentation · the four repetitions of `CAVEAT_LINE`

---

## Part V — Sequence

**1 · Foundation (unblocks everything)** — `Page` contract on all ten routes; type scale; colour reassignment incl. `--magenta` / `--violet`; state kit; `Gloss` + `ReadThis`. No new features, and every page changes.

**2 · The two broken journeys** — `/calendar` with the full expanded event material + repoint the rail; the options split into five routes with density control, labelled mode switch, calls/puts group headers, and the explainer moved to the bottom.

**3 · The two flagship surfaces** — Today's three bands (brief, tape, signal cards); the ticker header rebuild and sub-nav removal.

**4 · The rest** — macro methodology + trends + drill-down; watchlist cards; screener cards + vote bar; portfolio cards + agreement view; rotation tails; alerts sentence-builder; rails and nav grouping.

**5 · The action layer** — `ActionBar` everywhere, and the cross-links that turn ten dashboards into one workflow.
