# Argus UI Overhaul — Implementation Plan

**Companion to:** `MARKET_ANALYSE_UI_OVERHAUL.md` (the what and why) and the visual mocks in `Argus Overhaul - Today + Ticker.dc.html` (ids `1a`–`4d`).
**Audience:** whoever implements this — written so Claude Code can execute a phase per session without further design input.
**Repo root:** `dashboard/`

---

## How to use this

Each phase is independently shippable and leaves the app working. Do them in order — phase 1 is load-bearing for everything after it. Within a phase, the order of tasks is the order of dependencies.

Every task names the files to touch and the acceptance test. **Do not start a phase before the previous one's acceptance criteria pass** — the whole point is that the system lands before the pages that depend on it.

Mock reference ids in brackets (`[2a]`) point at the design canvas.

---

## Phase 0 — Baseline capture (half a day)

Before changing anything, record what the app looks like now so regressions are visible.

| Task | Files | Done when |
|---|---|---|
| Add the screenshot harness | `e2e/screens.spec.ts` (already written) | `npx playwright test e2e/screens.spec.ts` writes ~40 PNGs to `dashboard/screens/` plus `_audit.json` |
| Commit the baseline | `screens/baseline/` | Move the run into `screens/baseline/` and commit; re-run after each phase and diff |

`_audit.json` also gives you the current font-size histogram per route — useful evidence for phase 1 and a way to prove the type scale actually collapsed.

---

## Phase 1 — Foundation (1 sprint, no new features)

Nothing user-visible is *added*. Every page changes. This is the phase that stops the product looking like ten pages by ten people.

### 1.1 Tokens

**File:** `app/globals.css`

Add to `:root`:

```
--put:     #e372b0;   /* puts — currently borrow --red, which also means "down" */
--model:   #9d7cf5;   /* scores, conviction, verdicts — never P&L green/red */
--text-2:  #c8cede;   /* secondary reading copy */
--text-3:  #9aa3b4;   /* tertiary — subtitles, supporting detail */
```

Keep `--call` as an alias of the existing `--teal`. Extend `tailwind.config` so `text-put`, `text-model`, `text-2`, `text-3` resolve.

**Rules to enforce from here on:**
- `--accent` is interactive only. Never data.
- `--green`/`--red` are money direction only. Never model output.
- Nothing darker than `--muted #7d8698` carries a sentence. (It measures 5.15:1 on `--surface`; a step darker fails AA. Decorative axis ticks may go dimmer.)

**Acceptance:** grep for `text-pos`/`text-neg` on any element rendering `score`, `conviction`, `agreement_pct` or `verdict` returns nothing.

### 1.2 Type scale

**Files:** `tailwind.config.ts`, `app/globals.css`

Six roles only. The codebase already has partial semantic classes (`text-micro`, `text-dense`, `text-body`, `text-subhead`) — finish the job and delete the arbitrary `text-[11px]` / `text-[12px]` / `text-[13px]` usages.

| Class | Size / weight | Use |
|---|---|---|
| `text-display` | 28 / 600 mono | ticker symbol, the one number a page is about |
| `text-headline` | 20 / 600 | page title |
| `text-title` | 15 / 600 | panel and card titles |
| `text-body` | 13 / 400 | prose, explanations, table cells |
| `text-data` | 13 / 400 mono tnum | all numerics |
| `text-micro` | 11 / 500 uppercase 0.08em | eyebrows and column headers **only** |

**The single highest-impact change:** 11px stops being a content size. `QuoteRow`, `EconCalendar`, `MacroGauges`, `MorningReport`, the ladder cells and every table cell move to `text-data`/`text-body`.

**Acceptance:** `_audit.json` shows ≤ 8 distinct rendered font sizes across all routes (currently 12+ on several).

### 1.3 The `Page` contract

**New:** `components/ui/Page.tsx`

```
<Page width="prose" | "wide" | "full">
  <Page.Header title subtitle status actions breadcrumb />
  <Page.Body />
</Page>
```

- `prose` 880px — `/alerts`, `/learn/*`
- `wide` 1240px — `/`, `/watchlist`, `/screener`, `/portfolio`, `/rotation`, `/macro`, `/calendar`
- `full` fluid, 24px gutters — `/t/[ticker]`, `/options/ladder`

`Page` owns padding (`py-6`, `space-y-5` between sections). No page sets its own again.

Then convert all ten routes. **Delete `min-h-screen` from `/screener`, `/portfolio`, `/alerts`** — they nest a full viewport inside `RailShell`'s `h-[calc(100vh-var(--nav-h))]` scroller, which guarantees a scrollbar with nothing to scroll to. Absorb the two hand-rolled `<h1 className="text-sm font-semibold">` headers on `/odte` and `/odte/strikes` into `Page.Header`.

**Acceptance:** every route renders inside `Page`; `_audit.json` shows exactly three distinct content widths; no route sets its own `max-w-*` or `min-h-screen`.

### 1.4 Explanation layer

**New:** `components/ui/Gloss.tsx`, `components/ui/ReadThis.tsx`
**Rework:** `components/ui/InfoTip.tsx`

- `Gloss` — dotted underline on the term, click to expand a two-line definition in place. Focusable, works on touch. Replaces every `InfoTip` whose child is `sr-only`.
- `ReadThis` — one sentence at the **foot** of a data panel saying what it's for and what would make you act. Add a `readThis` slot to `Panel`.
- **Ban:** `InfoTip` with an `sr-only`-only child. There are four today (three on `/odte/strikes`, one on `/odte`) and they render no visible trigger at all — the explanation exists and cannot be reached.
- Delete every `title=` attribute used as documentation. Sources: `EconCalendar` importance dots, `QuoteRow`, `RightRail` headlines, `LeftRail` glyphs.

**Acceptance:** `document.querySelectorAll('[title]').length` is 0 on every route; no `InfoTip` renders zero visible pixels.

### 1.5 State kit

**New:** `components/ui/Loading.tsx`, `Empty.tsx`, `Failed.tsx`, `Stale.tsx`
**Delete:** `SkeletonTable.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, the bespoke `animate-pulse` blocks in `MorningReport` and `SignalGroups`, and the eight one-off `<p>Loading…</p>` strings.

`Stale` matters most: every surface here can be old, and staleness is currently communicated five different ways. One component, `<Stale asOf source />`, used by the ladder, `/portfolio`, `/`, `/macro` and the rails.

**Acceptance:** grep for `animate-pulse` outside `Loading.tsx` returns nothing.

---

## Phase 2 — The two broken journeys (1 sprint)

The two things a user hits and bounces off.

### 2.1 `/calendar` — new route `[2b]`

**New:** `app/calendar/page.tsx`, `components/calendar/*`
**Change:** `components/rails/EconCalendar.tsx:41` — repoint `+N more ›` from `/macro` to `/calendar`
**Backend:** the calendar endpoint currently serves `days=7`; needs 30–60 and the consensus/prior/actual fields

- Horizon 30 days (60 behind a toggle), grouped **this week / next week / later**.
- Every row: time (ET + local), importance as a visible rank, **consensus · prior · actual**.
- Expandable per event: *what it measures*, *why it matters now*, *beat / miss ⇒ what moves* — the macro → rates → sector → your-watchlist chain.
- Watchlist earnings overlaid on the same timeline, with session and implied move **when the feed carries them**. `time_et` is NULL for every earnings row today and implied move has no source at all — omit the slot rather than printing `session TBA` on twenty rows. A field with no feed renders nothing, not a placeholder.
- Cross-link both directions: event ⇄ affected tickers ⇄ the `/macro` scope.
- Nav gains a `Calendar` entry.

**Why first:** `+N more ›` currently sends you from a *calendar* to a FinBERT *sentiment gauge*. It is the worst navigational lie in the product and the user has hit it.

**Acceptance:** the rail overflow lands on a page containing calendar events; `/calendar` shows ≥ 20 events; every high-importance event carries the three-part explanation, and the consensus · prior · actual columns exist and align whether or not they hold values.

> **Ruled 2026-07-31 (Phase 2 review).** The data half of this clause is not shippable in v1: `argus/argus/calendar/schema.py` puts actual-vs-forecast out of scope and no feed stands behind it. The columns are built at 96px and populate the day one lands — that is the correct outcome, not a gap. Do not approximate, and do not delete the columns to make a test pass.

### 2.2 Options split — five routes `[2a] [2c] [2d] [2e] [3a]`

`/odte/strikes` is 641 lines rendering eight unrelated blocks. Split:

| New route | From | Mock |
|---|---|---|
| `/options` | `app/odte/page.tsx` | `3a` |
| `/options/ladder` | `app/odte/strikes/page.tsx` | `2a` |
| `/options/gamma` | `GexCard` + `GexChart` + levels | `2c` |
| `/options/flow` | `PcrCard` + `UnusualCard` | `2d` |
| `/options/greeks` | new | `2e` |
| `/learn/options` | the explainer block | — |

Keep `/odte/*` as redirects for one release.

**Ladder specifics — in priority order:**

1. **Visible label on the mode switch.** Replace `<Toggle checked={showLive} label="Show live options ladder" />` (a 36×20 track whose only label is `aria-label`) with a two-segment `Live` / `EOD` control, provenance badge beside it. This is the control the user could not identify.
2. **Strike density control.** `±10 / ±20 / ±40 / All`, persisted, default `±20`, driving **both** modes. Today `useLadder(symbol, 4, 0.06)` hard-codes ±6% — ~76 strikes per expiry on SPY — with no UI, while `/odte` calls the same hook with a different density. The live ladder needs the same parameter server-side.
3. **Mirrored layout.** Strike down the centre, 2px divider each side, spanning `CALLS` / `PUTS` group headers, puts on `--put`. Column order from the strike outward: **Bid · Ask · Vol · OI · IV · GEX** on each side.
4. **Column groups.** `Price` / `Flow` / `Gamma` / `Quality` / `Greeks` — quality (spread width, two-sided flag) and greeks both off by default. Default view is price + flow + gamma = 13 columns exactly. 23 → 13.
5. **Grid affordances.** Jump-to-strike, centre-on-spot in both modes (live currently never centres and lands on the lowest strike), visible copy action on row hover/focus in both modes.
6. **One GEX unit.** Live cells divide by 1000 under a header saying only `GEX`; classic uses `fmtGex()` with B/M. Put the unit in the header, use one formatter.
7. **Levels strip grouped** into *Price levels* / *Regime* / *Data quality* at one precision.
8. **Explainer to the bottom**, collapsed, with a `How to read this →` link in the header. It currently opens above the ladder on every visit *and* documents the classic layout while rendering in both modes.

**Acceptance:** all five routes render; the mode control has visible text; changing density changes row count in both modes; the ladder is reachable in ≤ 1 scroll from page top.

**`/options/greeks` scope.** Δ / Γ / ν / Θ only — the per-contract feed carries first-order greeks. Vanna and charm are cross-partials requiring a fitted vol surface this stack does not build. The page states the omission in one line rather than approximating it, and shows its EOD empty state honestly.

---

## Phase 3 — The two flagship surfaces (1 sprint)

### 3.1 Today `[1a]`

**Files:** `app/page.tsx`, `components/today/*`

- **Brief becomes the masthead** — not a collapsible card. Synthesis at `headline`, then three linked tiles: `Tape` (wire up `FutureChip`, which exists and is never rendered), `Positioning` (GEX band + distance to zero-gamma → `/options/gamma`), `Tone` (macro score **with delta** → `/macro`). Add an `as of HH:MM`.
- **De-dupe news chips by ticker** and show the actual headline. Currently `watchlist_news.slice(0,5)` with no de-dupe puts `$MSFT news` in three of five slots, and the headline is `title=`-only.
- **Remove "What to expect" from the brief.** Unfiltered by date, it lists events six days out under a daily brief, and duplicates the What's Next rail three columns away.
- **New "Today's tape" band** — everything scheduled to move today on one 04:00–20:00 axis with a now-marker, releases below, earnings above. Lane-based label layout: percentage-positioned centred labels cannot fit clustered morning releases.
- **Signal groups become tabs** with counts, not four stacked panels. Top 3 of the active group render as cards; the rest stay tabular. `CAVEAT_LINE` prints **once**, in the header, as `ReadThis` — currently four times.
- Group titles lose SCREAMING_CASE.
- Rotation link becomes an 11-cell sector heat strip.

### 3.2 Ticker `[1b]`

**Files:** `app/t/[ticker]/page.tsx`, `components/ticker/*`

- **Header → three zones.** Identity (symbol, name, **sector, market cap** — new), Price (last, change, **day range, volume vs ADV** — new), Verdict (badge with display copy, conviction, HC).
- **`STANDARD_LONG` → "Standard long".** Add a display-copy map to `Badge`.
- **HC footnote → `Gloss` on the chip.** It currently renders as permanent body copy on every ticker with a bridge row, whether or not HC is present.
- **Resolve the earnings contradiction.** The chip reads `earnings in 1d` from `bridgeRow.earnings_in_days`; `CatalystStrip` reads "next earnings 31 Jul", which is today. One source, one basis, one place.
- **Track record split** into `This call` / `Cohort` / `Read`, with the comparison stated rather than left for the reader to compute.
- **Action bar:** Pin · Alert · Options · Compare · Copy. Today `PinToggle` is the only verb.
- **Delete `TickerSubNav`.** Its seven labels are printed again 40px below as `Panel title`; it only anchors the right column; and below 1100px the grid reorders so nav order no longer matches document order. Replace with a 32px sticky icon rail that can address both columns.
- **Fix the scroll-spy** regardless: `entries.find(e => e.isIntersecting)` takes the first entry in callback order, not the topmost. Sort by `boundingClientRect.top`.
- Draw entry/stop/target on the chart rather than listing them in a card to its right.

**Acceptance:** no label appears twice within one scroll; the header exposes sector and market cap; one earnings date on the page.

---

## Phase 4 — The rest (1 sprint)

### 4.1 Macro `[3c]`
**Files:** `app/macro/page.tsx`, `components/macro/*`, `lib/macro.ts`

- **Publish the methodology on the page** — sources, article count, decay half-life, what `n` counts, when to ignore a score.
- **Fix the benchmark timebase.** `page.tsx:24` hard-codes `period=1mo&interval=1d` regardless of window; on `1h` you overlay a month of daily bars on an hour of sentiment. Bind to `window`.
- **Shade the ±0.05 neutral band.** `toneClass()` hard-codes it; nothing on screen says so.
- **Δ + sparkline on every tile**, sorted by absolute change.
- **Drill-down** from a tile or chart point to the ranked contributing headlines with scores and weights.
- Label the lookback control; stop the silent `scope → "global"` reset on window change.
- Bottom band: names driving the scope, your exposure, next catalyst.

> **Chart-point drill-down has no feed (verified 2026-07-31).** `/api/macro/contributors` takes `(scope, window, limit)` only and `/api/news` takes `(after, limit, latest)` — neither accepts an instant or a range, so there is no way to ask which headlines were inside the lookback at the moment you clicked. A click would return the panel already open below it. Needs an `at=` parameter on `contributors` before the affordance is real; the tile path is done.

### 4.2 Rotation `[3b]`
**Files:** `app/rotation/page.tsx`, `components/rotation/RRGChart.tsx`

- **Quadrant labels on the chart** with a one-line gloss each.
- **8-week trails.** An RRG without trails is a scatter plot; the rotation *is* the trail.
- **Sector names, not ETF tickers**, on the dots — with a legend mapping name → ETF.
- Click a sector → the names you hold in it, from the signals data already loaded on `/`.
- Cross-link to `/macro` — sentiment by sector and rotation by sector are the same question asked twice.

> **The name → ETF legend has no feed (verified 2026-07-31).** The rotation job emits yfinance *industry* groups — "Semiconductor Equipment & Materials", "Uranium", "Quantum Computing" — not sector ETFs, and no ETF symbol appears anywhere in `rotation_latest.json`. There is nothing to map a name to. The dots-carry-names half is already settled the other way: an abbreviated industry name still ellipsised on the dot, so it named nothing the keyed legend didn't name in full.

> ~~**Logged, not built:**~~ **Built 2026-08-01. The RRG legend and the rotation table named all 12 sectors twice**, ~100px apart on the same scroll — the §3.2 duplication class again. The legend existed only because the dots carry an index instead of a name. The table is now the legend: the plot index prefixes the industry cell (`withRrgIndex` in `RotationPanel`), the standalone `<ul>` is gone, and a row click picks the sector. Selection is owned by `components/rotation/RotationView.tsx`; `DataTable` gained a `selectedKey` prop so a pick made on the chart paints the matching row. Index prefixes the first column rather than adding one, so the sticky-left cell stays the one that identifies the row. (Found while building §4.2.)

> **Prerequisite — trails are blocked (verified 2026-07-31).** `reports/rotation_latest.json` is a flat 12-row snapshot overwritten daily: no dated retention, no prior position, so there is nothing to draw a trail *from*. There is also no rotation route in the API at all — `app/rotation/page.tsx` reads the file straight off disk. Before any trail work: dated retention or a history table, **plus** an actual endpoint. The endpoint is worth doing regardless of trails. Phase 3's sector heat strip (§3.1) needs only the current snapshot and is not blocked by this.

### 4.3 Watchlist `[4a]`
**Files:** `app/watchlist/WatchlistClient.tsx` (648 lines)

- Pinned names → **card grid**, 3 across. Since-pin and today's badge at card weight; they're currently the fifth and sixth of ten columns.
- Summary strip above the add bar; each chip filters the grid.
- Recent picks gains **window progress** against the ~7d median-peak cohort.
- **Collapse the two near-identical concurrency loops** (`fetchHistoriesWithConcurrency` plus an inline copy for last-signals) into one batch endpoint.
- Migration banner → toast. It's permanent page furniture for a one-time event.

### 4.4 Screener `[4b]`
**File:** `app/screener/page.tsx`

- Top 5 as **result cards**, rest tabular.
- **L/S/W vote split as one stacked bar** — kills three numeric columns.
- Min score → **slider with a live count** ("42 of 500 above 0.30").
- Score and agreement move to `--model`.
- Saved, named screens.

Keep the controls and states as they are — abort, cancel, cached/fresh, re-run, persisted results are the best-built interaction layer in the product.

### 4.5 Portfolio `[4c]`
**File:** `app/portfolio/page.tsx`

- **Disagreement band leads the page** — which positions the model has turned against, with the reason and the P&L. This is the reason to open the page and it does not exist today.
- Positions → cards, with the Argus verdict next to the position and `edge` spelled out inline.
- Portfolio band: NLV, day P&L, unrealised, cash, exposure, concentration. Three chips is not a summary.
- Move `TWS · port 7496 · live` out of the page subtitle into the status chip.

### 4.6 Alerts `[4d]`
**File:** `app/alerts/page.tsx`

- Rule builder → **a sentence**: *"Alert me when **[NVDA]** **[verdict flips to]** **[Short]**"*.
- Drop the duplicated kind chip on rule rows (`KIND_LABEL` renders in both the chip and `ruleSummary()`).
- Channel row says what happens when none are enabled, and links to configure.
- `Recent fires` gains filters and a link back to the firing rule.

### 4.7 Shell
**Files:** `components/Nav*.tsx`, `components/rails/*`, `components/ContextStrip.tsx`

- **Group the nav:** `Today · Watchlist · Screener` / `Ticker · Options · Rotation · Macro · Calendar` / `Portfolio · Alerts`, plus `Learn`.
- **Rails keep every block** — Futures, US Equity, Forex, What's Next, Macro gauges, same order. Restyle only: values 13px, labels 11px, importance as a visible rank.
- Rails collapsible with persistence. On 1440 they consume ~460px of a 1240px content budget, which is why the ladder runs full-bleed and masks its own overflow.
- News rail: group by hour, mark breaking, tag which watchlist names each item touches.
- ~~**The news rail and the ticker page's News card are the same content twice**~~ — **premise false, verified while building §4.7.** They are two disjoint feeds sharing a generic label. The rail reads the `news_items` table, written only by `argus/argus/news/ingest.py` (Discord) and the whale-alert job; a live sample was 36 discord + 24 whale, zero press headlines. The ticker card is a live yfinance fetch (`ticker_news.py`) that is never persisted and never carries chatter or flow. Different tables, different producers, no overlap. **Resolution: keep both, rename the rail** to state what it actually carries ("Chatter & Flow"); the ticker card keeps "News". Deleting either would have removed real data.
- **Same class, second instance: the left rail's `MACRO 1D` block restates the `/macro` scope tiles** — GLOBAL, US and each sector at the same scores, in the same order, ~900px to the left of the tiles themselves. A rail that summarises the page you are already on is a repetition; suppress the rail block on `/macro`, or resolve it the same way as the news pair. (Found while building §4.1.) **Resolution: the rail loses on `/macro` and renders nothing** — both the expanded gauge block and the collapsed strip's macro dot, since a 6px dot of the same score is the shortened version the rule bars. Everywhere else both stay: they are the only macro reading on those pages.
- `ContextStrip` gets one job: market clock, session phase, global data freshness.

### 4.8 Learn
**New:** `/learn/glossary` (move `/glossary`), `/learn/options`, `/learn/data` (absorb `/sources`)

~~All three are currently orphans reachable only by URL.~~ Two of them were.
`/options/learn` was linked from the options tab bar (`OPTIONS_TABS` in
`lib/optionsUi.tsx`) and from the ladder's "Full reference →". Moving it under
`/learn` and re-pointing both links keeps one copy; leaving a second copy at
`/learn/options` would have been the duplication this overhaul exists to remove.

Shipped: the three `git mv`s, a `/learn` index (the nav needs a destination, and
the three pages are siblings, not one page with two annexes), a fourth nav group,
`308` redirects from all three old URLs, and a feed-by-feed table on `/learn/data`
read off the serving code path — not off the pipeline's description of itself.

---

## Phase 5 — The action layer (few days)

**New:** `components/ui/ActionBar.tsx` — `Pin · Alert · Options · Compare · Copy`, one component, four contexts (ticker header, signal card, watchlist card, screener card, position card).

Then the cross-links that turn ten dashboards into one workflow: signal → ticker → options → alert; calendar event → affected names → positions; macro scope → sector → rotation → holdings.

**Built 2026-08-01.** Chain 1 is `ActionBar` itself — every surface that names a ticker carries the same five verbs. Chains 2 and 3 both ended at the same missing step, "which of these do I own", so they share one piece: `lib/positions.tsx` (`useHeldPositions` + `HeldChips`), rendered in the calendar row's transmission block and in the RRG's selected-sector band.

Two premises in the original text turned out to be wrong and the build differs accordingly:

- *macro scope → sector → rotation* cannot carry the sector across. The macro scopes are `sector_taxonomy` families (`AI / Compute`, `Financials`); the rotation rows are yfinance industries (`Semiconductors`, `Software - Application`). A `/rotation?industry=…` link built from a macro scope would never match a row, so the two pages stay linked page-to-page in both directions and no selection is passed.
- *rotation → holdings* can only reach the holdings it can map to a sector, which is the sector's candidates from today's bridge signals. A position in a name that did not make the list has no industry anywhere in the UI, so it is not shown rather than guessed at.

---

## Component work order

**New:** `Page` / `Page.Header` · `ActionBar` · `Gloss` · `ReadThis` · `Stale` · `Loading` / `Empty` / `Failed` · `SegmentedControl` · `DensityControl` · `ColumnGroups` · `VoteBar` · `TimeAxis` · `EventCard` · `PositionCard` · `SignalCard` · `Trail`

**Rework:** `PageHeader` → absorbed into `Page.Header` · `Toggle` → visible label slot; `SegmentedControl` replaces it for mode switches · `InfoTip` → `Gloss`, `sr-only`-only banned · `Badge` → display-copy map · `DataTable` → column groups, sticky group headers, density prop · `Panel` → `readThis` slot

**Delete:** `TickerSubNav` · `SkeletonTable` + `Skeleton` · `EmptyState` · the duplicate concurrency loop in `WatchlistClient` · every `title=` used as documentation · three of the four `CAVEAT_LINE` repetitions · `FutureChip` **or** render it (the tape band needs it)

---

## Regression guard

Re-run `e2e/screens.spec.ts` at the end of every phase and diff against `screens/baseline/`. Add these assertions to the suite as you go:

```
phase 1  — ≤ 3 distinct content widths; ≤ 8 distinct font sizes; 0 [title] attributes;
           0 InfoTips with zero visible area; 0 min-h-screen inside RailShell
phase 2  — /calendar returns 200 and renders ≥ 20 events;
           rail "+N more" href === "/calendar";
           all five /options/* routes return 200;
           ladder mode control has non-empty textContent
phase 3  — no string appears as both a tab label and a panel title on /t/[ticker];
           /t/[ticker] header contains sector and market cap;
           CAVEAT_LINE appears exactly once on /
phase 4  — macro benchmark request URL contains the selected window;
           RRG renders 11 sector names (not ETF tickers);
           portfolio renders the disagreement band when any verdict conflicts
```

---

## Sequencing summary

| Phase | Theme | Ships |
|---|---|---|
| 0 | Baseline capture | half a day |
| 1 | Foundation — tokens, type, `Page`, explanations, states | 1 sprint |
| 2 | `/calendar` + the options split | 1 sprint |
| 3 | Today + ticker | 1 sprint |
| 4 | Macro, rotation, watchlist, screener, portfolio, alerts, shell, learn | 1 sprint |
| 5 | Action layer + cross-links | few days |

Phase 1 is the one to resist cutting. Every later phase assumes it, and skipping it means implementing each page's redesign against the same inconsistent substrate the overhaul exists to remove.
