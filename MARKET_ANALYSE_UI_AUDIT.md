# Market Analyse — Full UI & UX Audit

**Scope:** every route, rail, panel, shared component and linked surface in `dashboard/`, plus the Argus dev UI (`argus/argus/ui/index.html`) and the sibling Market Review dashboard (`Market_Review/src/stock_chatter/dashboard.py`).
**Method:** source-level review — every finding below points at a file I read, not at a guess. Nothing here is inferred from screenshots.
**Date:** 2026-07-28

Severity key: **P0** = broken / misleading, fix first · **P1** = real usability cost · **P2** = polish, consistency, debt.

---

## 0. Files reviewed

```
app/layout.tsx  app/globals.css  app/page.tsx
app/watchlist/{page.tsx,WatchlistClient.tsx}  app/screener/page.tsx
app/portfolio/page.tsx  app/alerts/page.tsx  app/rotation/page.tsx
app/macro/page.tsx  app/odte/page.tsx  app/odte/strikes/page.tsx
app/t/[ticker]/page.tsx
components/{Nav,NavLinks,NavActions,ContextStrip,CommandK,HelpOverlay}.tsx
components/rails/{RailShell,LeftRail,RightRail,QuoteRow,EconCalendar,MacroGauges}.tsx
components/today/{MorningReport,DiffStrip,SignalGroups,RotationPanel}.tsx
components/ticker/{Header,LevelsCard,WhyPanel,CatalystsCard,CatalystStrip,
  SentimentCard,HistoryCard,NewsCard,OptionsPanel,ChartInfoStrip,AiPanel}.tsx
components/charts/CandleChart.tsx  components/rotation/RRGChart.tsx
components/odte/{VerdictCard,StrikeGuidance}.tsx
components/ui/{Panel,DataTable,Badge,ConvictionDot,MicroBar,ScoreBar,StatChip,
  EmptyState,PageHeader,Skeleton,Sparkline,TooltipProvider}.tsx
argus/argus/ui/index.html   argus/README.md
Market_Review/src/stock_chatter/dashboard.py
```

---

## 1. Executive summary

Argus is a competent, opinionated **trader terminal**: dark layered surfaces, Fira Sans/Fira Code, tabular numerals, three-column shell, keyboard shortcuts, tooltip-gated jargon. The token layer in `globals.css` is real (`--bg / --surface / --elevated / --raised / --line / --line-strong` as a lightness ladder, semantic `--green/--red/--amber/--teal` reserved for state), and `Panel` / `DataTable` / `Badge` / `StatChip` prove someone thought about a system.

Where it breaks down:

1. **Meaning lives in hover.** Roughly two dozen critical definitions (what HC means, what conviction means, why Δrank is a dot, what "thin basket" implies, why n_eff being high is bad) exist *only* inside Radix tooltips attached to `cursor-default` spans. On touch, and for keyboard users, that content is unreachable — and there is no glossary, legend or onboarding anywhere in the product.
2. **The system is only half-adopted.** Two table implementations, four collapsible implementations, three "pin" treatments, three center-zero bar components, four `toLocale*` locales, two return-value units, and a second undocumented palette hardcoded inside `CandleChart`.
3. **Density has no relief valve.** 9–11px mono is the default in both rails and several tables; a Today row carries nine encodings before expansion; nothing collapses, summarises or steps down for a smaller window except the right rail.
4. **Dead and orphaned surfaces.** `/sources` is linked from every sentiment chip and does not exist. `/macro` exists and is not in the nav. `/api/signals/dates` + `by-date` exist and no UI reaches them.
5. **Skeletons used as decoration.** Screener and Portfolio render `SkeletonTable` in *non-loading* states as an illustration of what would appear — a shimmer that never resolves is a bug signal, not an empty state.
6. **Two products, two design languages.** Market Review's dashboard is light-mode, purple-accented, kanban-laned, system-font, with a completely different vocabulary for the same objects. Same user, same workflow, no shared visual DNA.

---

## 2. Global chrome — nav, context strip, palette, shell

`layout.tsx`, `Nav.tsx`, `NavLinks.tsx`, `NavActions.tsx`, `ContextStrip.tsx`, `CommandK.tsx`, `HelpOverlay.tsx`, `rails/RailShell.tsx`

**G-01 · P0 · `/macro` is an orphan route.** `NavLinks.LINKS` has seven entries and Macro is not one of them. The only path to a full page of FinBERT macro sentiment is a 10px `1d ›` link inside `MacroGauges` in the left rail — invisible if the rail is collapsed. *Fix:* add it to the nav (or fold Macro into Rotation as a tab) and keep the rail link as a deep-link.

**G-02 · P0 · Four of six keyboard shortcuts are undiscoverable.** `CommandK` binds `⌘K` **and** bare `g`; `HelpOverlay` binds `?`; `DataTable` binds `j`, `k`, `Space`, `Enter`, `Esc`. The only visible hint in the entire chrome is the `⌘K` text button in `NavActions`. Nothing tells a user that `?` exists, so the help overlay that documents everything else is itself hidden behind an undocumented key. *Fix:* a persistent `?` affordance next to `⌘K` in the nav, and mention `j/k` inline in the first table header row or as a one-time dismissible hint.

**G-03 · P1 · Bare `g` is a hostile binding.** `CommandK` opens on `g` with only an `isEditableTarget()` guard, and it *toggles* rather than opens — pressing `g` twice quickly closes it. Any non-input focus (a table container with `tabIndex=0`, a button, the body) makes `g` swallow the keystroke. *Fix:* drop bare `g`, or make it open-only and scope it to the document body.

**G-04 · P1 · It's a ticker search, not a command palette.** `buildResults()` only matches tickers from bridge + watchlist, plus a raw 1–5 letter fallback. You cannot navigate to a page, run the screener, toggle a rail, or jump to a section from it. Empty query renders an empty box with no recents, no suggestions, no "try NVDA". *Fix:* add page/action commands and a default state (recent tickers, pinned watchlist, "Run screener", "Go to Rotation").

**G-05 · P1 · Session chip never ticks.** `ContextStrip` calls `sessionChip()` → `usMarketState()` during render with no interval, while the SWR status poll (60s) is what happens to re-render it. `LeftRail`'s `EquityBadge` and `ChartInfoStrip` have the same shape. A 09:30 open or 16:00 close is only reflected when something else re-renders. *Fix:* one shared `useMarketClock()` hook with a 30s tick, consumed everywhere.

**G-06 · P1 · `SYS` health is hover-only and unpinnable.** The aggregate is a 10px pill; per-service state (name + detail + dot) exists solely in a Radix tooltip on a `cursor-default` span, so it's unreachable by keyboard and on touch, and impossible to keep open while you read it. *Fix:* make the pill a button that opens a small popover; keep the tooltip as a preview.

**G-07 · P1 · No global data-freshness indicator.** Staleness only surfaces as an inline warning banner on Today when `generated_at` is >24h old (`app/page.tsx:isStale`). During normal operation nothing anywhere states when the bridge last ran. *Fix:* put "bridge 06:52 · quotes 12s ago" in the context strip.

**G-08 · P1 · Page shells contradict each other.** `RailShell` gives a `h-[calc(100vh-var(--nav-h))]` scroll container, then `screener`, `portfolio` and `alerts` each wrap content in `min-h-screen`, and `odte`/`odte/strikes`/ticker use `h-full`. Result: nested scroll areas and a viewport's worth of dead space at the bottom of three pages. *Fix:* one `<PageShell>` that owns padding, max-width and scroll; pages provide content only.

**G-09 · P2 · Five different content widths.** `max-w-6xl` (Today, Rotation, Screener), `max-w-5xl` (Watchlist, Portfolio, Alerts, Macro), `max-w-[1400px]` (ticker), full-bleed (odte). Every navigation re-flows the measure. *Fix:* two widths max — "reading" and "dense" — as tokens.

**G-10 · P2 · `PageHeader` is used on half the pages.** Watchlist, Screener, Portfolio, Alerts use it; Today has no title at all, Rotation's title is a Panel heading, odte and Macro hand-roll `<h1>`. *Fix:* mandate `PageHeader` (Today's can carry the freshness line + date picker).

**G-11 · P2 · No skip link; rails are first in the DOM.** `RailShell` renders `LeftRail` before content, so keyboard users traverse ~30 rail rows before reaching the table they came for. *Fix:* `<a href="#main" class="sr-only focus:not-sr-only">Skip to content</a>` plus `id="main"`.

**G-12 · P2 · Nav links lack `aria-current`.** Active state is color + a 2px underline only (`NavLinks`). *Fix:* `aria-current="page"`.

**G-13 · P2 · Poll intervals are unmanaged.** 5s (`odte/health`), 10s (quotes), 30s (alerts rules + log), 60s (status, portfolio, rail quotes), 1h (catalysts) — none pause on `document.hidden`, and the 5s health poll runs all day on a local FastAPI. *Fix:* a shared SWR config with visibility-aware refresh.

**G-14 · P2 · No settings surface.** Risk $, rail collapse, chart period/EMAs, table sorts, Today filters and panel states are spread across ~10 localStorage keys with no central place to view or reset them. For a single-user local app that's the natural home for API ports, IBKR mode, alert channels and thresholds too.

---

## 3. Left rail (quotes / calendar / macro)

`LeftRail.tsx`, `QuoteRow.tsx`, `EconCalendar.tsx`, `MacroGauges.tsx`

**LR-01 · P0 · No width-based collapse — unlike the right rail.** `RightRail` listens on `(max-width: 1279px)` and self-collapses; `LeftRail` only responds to a manual click persisted in `rail-left-collapsed`. On a 1280px laptop the news rail hides itself and the 200px quote rail does not. *Fix:* same matchMedia treatment, or collapse both from one layout hook.

**LR-02 · P1 · The offline banner renders three times.** `renderRows()` returns the `QUOTE FEED OFFLINE` block per group, so a single feed failure paints it inside Futures, US Equity and Forex. *Fix:* hoist to one rail-level banner.

**LR-03 · P1 · Quote rows are dead ends.** `QuoteRow` is `cursor-default` with no link, while every other ticker string in the product navigates. You can't click SPY in the rail to open `/t/SPY`. *Fix:* make rows links (or add a row-hover chevron).

**LR-04 · P1 · Collapsed rail silently drops four of five blocks.** The 36px strip shows SPY/QQQ/VIX only; futures, forex, the econ calendar and the macro gauges vanish with no indication they exist. *Fix:* keep a one-glyph indicator per hidden block, or show the next calendar event as a dot.

**LR-05 · P1 · `mt-auto` can push the macro gauges (and the collapse button) below the fold.** They sit at the end of a `overflow-y-auto` column after up to six calendar rows; on a 768px-tall window they're reachable only by scrolling a 200px column, with no scroll cue. *Fix:* pin the gauges + collapse control as a non-scrolling footer.

**LR-06 · P1 · Five data types read as one list.** Futures, equity, forex, calendar and macro are separated only by a 1px `border-line` and a 24px 10px-uppercase header. At 9–11px mono the whole rail is texture. *Fix:* stronger block separation (背 background step or 8px gap), and right-align the numeric column consistently.

**LR-07 · P1 · Macro gauges use a different color language.** `MacroGauges.Gauge` fills positive with `bg-accent` (blue) and negative with `bg-warn` (amber) — everywhere else in the app positive/negative is green/red (`MicroBar`, `ScoreBar`, `NetBar`, returns, GEX). *Fix:* green/red, or explain the deviation with a label.

**LR-08 · P2 · FX chip has four states and no key.** `FxChip` renders CLOSED (amber), OPEN (muted), overlap (teal, `NY·LDN`), single session (three different accent opacities). Nothing tells the user that dimmer blue = Asia. *Fix:* single label pattern `FX · LDN` with one tone, and put the session table in the help overlay.

**LR-09 · P2 · Calendar caps silently.** `EconCalendar` slices to `max = 6` with no "+N more" and no link to a full calendar; importance is a 4px dot with no legend. *Fix:* footer link → Macro/Calendar page, and label importance on hover *and* with a shape/weight difference.

**LR-10 · P2 · 9px type with `opacity-60`.** `EconCalendar`'s `time_et` is `text-[9px] … opacity-60` on `--surface`; `MacroGauges` "building…" is the same. That's well under any reasonable legibility floor. *Fix:* 10–11px minimum, opacity via a token color instead of `opacity`.

---

## 4. Right rail (news feed)

`RightRail.tsx`

**RR-01 · P1 · Error and empty states are indistinguishable.** "news feed offline" (broken) and "no news yet — feed starts when the ingest service runs" (benign) are both 11px muted paragraphs. The header count degrades to "offline" / "…" in 9px. *Fix:* amber + icon for failure, muted for quiet; keep the shapes different.

**RR-02 · P1 · Feed order relies on the API.** `[...data.items].reverse()` assumes the payload is ascending; there's no sort on `ts`. A provider that changes order silently scrambles the feed. *Fix:* sort by timestamp, and show a relative age on every row (already have `relTime`).

**RR-03 · P1 · No filtering or "new since" marker.** A 24-item rail with no per-ticker filter, no watchlist-only toggle, no unread rule, and no jump-to-top when items arrive mid-read. For a live feed that's the core interaction. *Fix:* two chips (All / My tickers) + a subtle "3 new" pill that scrolls to top.

**RR-04 · P2 · Whale rows use an emoji in an icon-free UI.** `SOURCE_SHORT` maps `whale → 🐋`, the only emoji in the product; everything else is a lucide glyph or a text code. *Fix:* `WHL` code + teal border (border is already there).

**RR-05 · P2 · Headlines clamp at 3 lines with no escape.** `line-clamp-3` with no `title` attr and no expand — a truncated headline is unrecoverable unless it has a URL. *Fix:* `title={headline}` at minimum.

**RR-06 · P2 · Ticker link is a 10px target at the row edge.** Below the 24px minimum for a comfortable click, adjacent to the headline link. *Fix:* pad to a 24px hit area.

---

## 5. Today (`/`)

`app/page.tsx`, `today/MorningReport.tsx`, `today/DiffStrip.tsx`, `today/SignalGroups.tsx`

**TD-01 · P0 · No date navigation, even though the API has it.** `app/api/signals/dates` and `app/api/signals/by-date` exist; Today renders only "now". You can't answer "what did this look like on Monday?" without the DB. *Fix:* a date stepper in the page header wired to `by-date`.

**TD-02 · P0 · Filters can empty the page with almost no feedback.** `GROUP_META.filter(g => sorted[g.key].length > 0)` *removes* a group whose rows were filtered out, so a persisted `hcOnly` or sector filter from last week silently deletes ALIGNED from the page. The only cue is the small "Clear" text button. *Fix:* always render the group with "0 shown · 12 hidden by filters", and make the active-filter state loud (chip row with counts).

**TD-03 · P1 · Nine encodings per row before expansion.** Ticker link, tier badge, conviction dots, three leg bars, sector text, 1D chip, 1M chip, flag glyph, catalyst count — then the expanded row adds E/S/T, R, comb, quality, n_eff, regime, 1W/6M/1Y, a sparkline, mentions, accounts and earnings. *Fix:* demote three of them (conviction, catalyst count, flags) to the expanded row or to a hover card, and let the leg bars carry the scan.

**TD-04 · P1 · The flags column appears and disappears between tables on the same page.** `GroupTable` drops the `flags` column when no row in *that group* has a flag, so ALIGNED and TECHNICAL+FUNDAMENTAL can have different column counts and misaligned headers directly above one another. *Fix:* keep the column, render "—".

**TD-05 · P1 · Cryptic headers, inconsistently explained.** `C` has a tooltip; `⚑` and `Cat` have none; `Sent · Tech · Fund` has a good one. *Fix:* tooltip on every abbreviated header, or spell them out (`Flags`, `Catalysts`).

**TD-06 · P1 · Same metric, two representations.** 1D/1M are heat-shaded chips in the row; 1W/6M/1Y are a slash-joined text triple in the expanded row (`fmtRet`). *Fix:* one component for all period returns.

**TD-07 · P1 · Critical caveats are buried in 13px mono.** "(indicative)", "magnitude does not predict returns (r≈0)" and "consensus, not edge" are the intellectually honest core of this product and they're the least visible text on the page. *Fix:* promote to a persistent one-line disclaimer under the group title.

**TD-08 · P1 · Expanded rows fetch per row, forever mounted.** Each expansion fires `/api/argus/history/{sym}?period=3mo`; `everExpandedKeys` keeps every previously-expanded row's subtree mounted (max-height 0). A long session accumulates DOM and in-flight requests. *Fix:* unmount on collapse, cache history by ticker at the page level, and prefetch on row hover.

**TD-09 · P1 · Morning Brief has no loading, error or collapse state.** `if (!data) return null` — the highest-value block on the page silently doesn't exist while it loads or if the report fails, and on a busy day (synthesis + GEX + tone + 4 macro + 5 earnings + 5 news chips) it's the tallest block with no way to fold it. *Fix:* skeleton + error line + make it a `Panel` (collapsible, persisted).

**TD-10 · P2 · Brief news chips are plain `<a>` doing full page loads.** `MorningReport` uses `href={`/t/${n.ticker}`}` instead of `next/link`, unlike the rest of the app; the chip says "$NVDA news" but lands on the ticker page, and the actual headline is in a `title` attr. *Fix:* `Link`, and either link the headline URL or label the chip "NVDA ↗".

**TD-11 · P2 · DiffStrip is a second collapsible implementation.** Hand-rolled open/persist logic, `rounded-lg` + `bg-surface`, sitting directly above `Panel`s that are `rounded-md` + `bg-elevated`. Two adjacent cards, two radii, two surfaces. *Fix:* use `Panel`.

**TD-12 · P2 · Two warning banners can stack identically.** "No bridge data" and "Bridge data is stale" share exactly one visual treatment and can render together. *Fix:* one status region, one message, severity-ranked.

**TD-13 · P2 · The rotation teaser wastes its data.** `RotationPanel` already computes `Leading: X, Y · N/M fading`, but Today renders `Sector rotation → {n} sectors tracked`. *Fix:* show the summary string; keep the link.

**TD-14 · P2 · "Everything else" is unexplained** and defaults closed, so the largest bucket on the page is both hidden and unlabelled as to *why* those names didn't group.

---

## 6. Ticker detail (`/t/[ticker]`)

`app/t/[ticker]/page.tsx` + `components/ticker/*`, `charts/CandleChart.tsx`

**TK-01 · P0 · `/sources` doesn't exist.** `SentimentCard` renders every top-account chip as `<Link href="/sources">` — there is no `app/sources` route. Every account chip is a 404. *Fix:* build the sources page (the data is in Market Review's leaderboard) or link to the X profile.

**TK-02 · P0 · Chart levels never update.** `CandleChart` draws entry/stop/target price lines once at mount from the *bridge* row, while `LevelsCard` deliberately prefers the live `action_card` levels (with a comment that bridge rows "often carry degenerate placeholders"). So the card and the chart can show two different stops. *Fix:* lift levels to the page, pass live values, redraw on change.

**TK-03 · P1 · Seven stacked panels with no in-page navigation.** Levels → Why → Catalysts → News → Sentiment → History → AI, each collapsible, none summarised. Below 1100px the grid collapses to one column and the chart + options push all analysis a full screen down. *Fix:* a sticky sub-nav (or tabs: Setup / Evidence / Flow / News) and reorder for narrow width.

**TK-04 · P1 · The header badge row is five hover-only encodings.** tier `Badge`, verdict `Badge`, style `Badge`, `ConvictionDot`, `HC` chip — and `Badge variant="style"` has **no color map**, so it always falls back to muted (a badge that never conveys anything). *Fix:* drop `style` or give it a scale; consolidate tier+verdict (they overlap); one caveat line under the row instead of four tooltips.

**TK-05 · P1 · `WhyPanel` renders an orphan tooltip glyph.** When `inflation_gap > 0.15` the panel renders a bare `InfoTooltip` with no adjacent label — a lone "i" floating in the layout whose meaning ("correlated consensus — discount") is hover-only. *Fix:* a labelled amber row like the meta-analyst callout.

**TK-06 · P1 · The votes accordion ignores its own summary.** The toggle says "N agreed · M dissented" and then lists **all** votes unsorted and ungrouped, 70 rows of 11px, four columns, with `note` truncated to 120px. *Fix:* split into Agreed / Dissented sections, group by family (the data is already family-keyed), default to dissenters — that's the interesting half.

**TK-07 · P1 · `combo` codes are raw.** `COMBO_NOTE` explains five prefixes; anything else shows a 4-letter code (e.g. "LNSL") with no gloss. *Fix:* decode positionally (trend / squeeze / oscillator / structure) so unknown combos still read.

**TK-08 · P1 · `PriceRail` has no scale.** Four markers (S, E, T + a price dot) on a 6px bar with no axis, no tick values, and the current price value only in a `title` attr. *Fix:* label the endpoints, put the price value beside the dot.

**TK-09 · P1 · Risk sizing is context-free.** `dash:riskUsd` is one global number with no currency label, no account balance, no % -of-account framing, and the resulting share count is presented with no fee/slippage caveat next to a "Long plan" sentence that reads like instruction. *Fix:* express risk as % of a stated account size, and keep the "context, not a mechanical exit system" line adjacent to the numbers rather than at the bottom.

**TK-10 · P1 · `AiPanel` can't be regenerated.** `if (state.status === "loading" || state.status === "done") return;` — once generated, the only way to refresh is a page reload. No copy button, output is a bare `<pre>`. *Fix:* Regenerate + Copy actions, and render as prose (it's writing, not code).

**TK-11 · P2 · `OptionsPanel` repeats its own caveat.** "robust-score (beta), validation pending" is rendered in two branches of the same panel; three stacked tables (P/C summary, Unusual Calls, Unusual Puts) plus an IV row and a flags row with no hierarchy between them.

**TK-12 · P2 · Chart controls conflate two toggle types.** Active range pill and the `log` toggle both use `bg-accent text-foreground`; EMA chips use raw fills (`#4c8dff`, `#d29922`, `#8b93a3`) with `text-foreground` on amber — a contrast risk and a third button style in one 6-item toolbar. *Fix:* one active treatment, EMA chips as swatch + label.

**TK-13 · P2 · No OHLC readout / crosshair legend** on a 420px chart, and the volume histogram shares the pane with no axis or label.

**TK-14 · P2 · `ChartInfoStrip` is six unlabelled facts** in one 12px mono line (`vol 1.4× avg`, `52w 120–200 (65%)`) — a good idea rendered as a run-on sentence.

**TK-15 · P2 · No prev/next ticker and no back-to-Today.** The whole workflow is "scan Today → open a name → return", and the return trip is browser-back only. *Fix:* `‹ NVDA / AVGO ›` from the current group, plus a breadcrumb.

**TK-16 · P2 · Server-side history has a 5s timeout and no retry.** `fetchHistory` swallows failures and the page renders `EmptyState "no chart data"` — indistinguishable from a genuinely unlisted symbol. *Fix:* differentiate timeout vs no-data, offer retry.

**TK-17 · P2 · `HistoryCard` caps at 10 rows** with "+N older" as static text, no expand.

**TK-18 · P2 · Duplicate fetches held together by comments.** Header + LevelsCard both SWR `quote`; WhyPanel + LevelsCard both SWR `action_card`; Header + CatalystsCard both SWR `fundamentals`. It works via SWR key dedupe, but comments ("Shares SWR cache w/ WhyPanel") are load-bearing. *Fix:* one `useTickerData(ticker)` hook.

---

## 7. Watchlist (`/watchlist`)

`WatchlistClient.tsx`

**WL-01 · P1 · Destructive actions with no confirm and no undo.** `unpin` is an 11px text link in the last column; one mis-click loses the pin date and `price_at_pin` — the basis of the "since pin" column. *Fix:* undo toast (5s) or a confirm on rows older than a day.

**WL-02 · P1 · Progressive enrichment reflows the table.** Histories and last-signal dates load per ticker at concurrency 5, each result calling `setState(new Map(...))`; every row starts as "—" and columns re-measure as values land. *Fix:* one batched endpoint, or reserve column widths and show per-cell skeletons.

**WL-03 · P1 · A column of identical text.** `Context` renders `typical peak ~{medianDaysToPeak}d` for every row — the same string N times. *Fix:* move to the panel subtitle.

**WL-04 · P1 · Add-ticker has no success feedback and lossy errors.** `addError` clears on the next keystroke; success is inferred from a row appearing after revalidation. *Fix:* inline confirmation ("NVDA pinned @ 214.30") and persistent error until dismissed.

**WL-05 · P2 · Mixed vocabulary in headers.** `Still in?` (question) with values `yes` / `dropped` / `—`; `@pin` and `@flag` as column names beside `Since pin` and `Since flag`. *Fix:* declarative headers (`In today's report`), consistent naming.

**WL-06 · P2 · Third navigation mechanism.** Rows here use plain `<a href>` (full reload); Today uses `next/link` + `router.push`; Screener uses `onOpen`. *Fix:* one row-open convention.

**WL-07 · P2 · Silent legacy migration.** The `argus_watchlist` localStorage migration POSTs on every mount and only removes the key if every request succeeds — a partial failure retries forever with no user-visible state. *Fix:* one-shot flag + a visible result.

**WL-08 · P2 · Loading text vs skeletons.** "Loading…" here, `SkeletonTable` on Screener/Portfolio, `Skeleton` bars in WhyPanel, `animate-pulse` divs in the rails. Four loading vocabularies.

---

## 8. Options (`/odte`) and Strikes (`/odte/strikes`)

`app/odte/page.tsx`, `app/odte/strikes/page.tsx`, `odte/VerdictCard.tsx`, `odte/StrikeGuidance.tsx`

**OD-01 · P0 · The same numbers are shown twice, in two formats.** The four `VerdictCard`s (Spot/Regime, Levels, Shape/Skew, Flow/Stats) present GEX, walls, zero-gamma, PCR and unusual prints — and then the "Companion grid" `Panel` renders `GexCard`, `UnusualCard`, `PcrCard`, `SpotCard` with the same underlying data. *Fix:* pick one: verdicts as the summary layer, companion cards as the drill-down inside each card's expanded state (which already exists).

**OD-02 · P0 · Actionable trade instructions with no in-UI disclaimer.** `StrikeGuidance` renders "Buy the 5480 call (OTM)", targets, and phase-specific advice ("theta is brutal"). The README carries the not-financial-advice disclaimer; the screen that gives the instruction does not. *Fix:* a persistent one-line disclaimer in the panel header.

**OD-03 · P1 · Whole page in monospace, including prose.** `<main className="… font-mono …">` on both odte routes means multi-sentence guidance paragraphs and the entire "How to read this ladder" section render in Fira Code. *Fix:* mono for numerals/codes only.

**OD-04 · P1 · Five identical "Open strikes →" links.** One per `VerdictCard` expanded state (4) plus one in the stats strip. *Fix:* one.

**OD-05 · P1 · Symbol switcher is duplicated with divergent styling.** Both pages hand-roll the ETF/INDEX button group; `/odte` marks active with `bg-accent-dim text-accent`, `/odte/strikes` uses `bg-green-500/20 text-green-400` — raw Tailwind palette colors that exist nowhere in the token set. *Fix:* extract `<SymbolSwitcher>`, use tokens.

**OD-06 · P1 · The ladder auto-scrolls a nested container on every change.** `spotRowRef.current?.scrollIntoView({block:"center"})` fires on symbol, expiry, spot-index and spot changes — inside a `max-h-[70vh]` scroller nested in the rail shell, i.e. it can move the page under the user mid-read as spot updates. *Fix:* scroll once on mount/symbol change, and offer a "center on spot" button instead of automatic movement.

**OD-07 · P1 · The best explanation on the page is below a 70vh table.** "How to read this ladder" (genuinely excellent copy: ZG, CW, PW, GEX sign, strike selection) sits *after* the scroll region. New users will never scroll past a table that scrolls internally. *Fix:* move it into a collapsible header block, default-open on first visit.

**OD-08 · P1 · `VerdictCard` expansion isn't persisted** (unlike every `Panel`), so drilling into Levels resets on each navigation. Also `disabled` when there's no detail, with no explanation for why a card doesn't open.

**OD-09 · P2 · Ladder rows are inert.** 8 columns of 11px numbers, mirrored bars, four marker codes — and no way to act on a strike (no copy, no "size this", no link out).

**OD-10 · P2 · Legend is duplicated** (inline `LegendItem` row + the footer's Markers list), and marker codes (`SPOT/ZG/CW/PW`) are 9px inline-superscripts inside the strike cell.

**OD-11 · P2 · `odte/health` polls every 5s** with `shouldRetryOnError:false`; the badge tone is the only surface for it.

---

## 9. Rotation (`/rotation`)

`app/rotation/page.tsx`, `rotation/RRGChart.tsx`, `today/RotationPanel.tsx`

**RO-01 · P1 · Two encodings for quadrant on one page.** The RRG uses four tinted `ReferenceArea`s with 11px corner labels; the table below uses a 10px colored dot under a `◉` header with the label available only on hover. *Fix:* a shared legend row at the top of the page; use the same swatch in both.

**RO-02 · P1 · Δrank hides the actual value.** `|drank| < 2` renders `•` with the tooltip "~72% of ±1 moves are noise" — statistically honest, but the user can no longer see whether a sector moved +1 or −1. *Fix:* show the value in muted with the noise note attached, rather than replacing it.

**RO-03 · P1 · The rotation table is a second table implementation.** A bespoke `<table>` — so it has no sorting, no keyboard navigation, no persisted sort, no zebra, none of what `DataTable` provides two files away, on a 10-column dataset that obviously wants sorting. *Fix:* migrate to `DataTable`.

**RO-04 · P1 · Ten abbreviated headers, two tooltips.** `RS-Ratio`, `RS-Mom`, `Breadth`, `n`, `1W/1M/3M`, `◉` are unexplained; only Δrank and Breadth have tips. *Fix:* tips on all, and expand `n` to "constituents".

**RO-05 · P1 · Thin baskets look disabled.** `n < 20` sets the whole row to `text-muted`, which reads as "inactive/unavailable", with the real reason hover-only on the industry name. *Fix:* keep the row at normal contrast and mark it with a `thin` chip.

**RO-06 · P2 · Dropped sectors are counted but not named.** The subtitle says "N hidden (no data)"; there's no way to see which sectors failed. *Fix:* list them under the chart.

**RO-07 · P2 · Label collision persists at the origin.** `RRGChart`'s per-point label offsets + stroke halo help, but sectors clustered at 100/100 still overlap at 10px. *Fix:* leader lines or hover-only labels with a persistent top-5 list.

**RO-08 · P2 · No page header, no timestamp** — the page has no title of its own and never states when the rotation job ran.

**RO-09 · P2 · Fixed 420px chart height** regardless of viewport; on a tall monitor it's half the value it could be.

---

## 10. Screener (`/screener`)

`app/screener/page.tsx`

**SC-01 · P0 · `Min score` is silently ignored for the full universe.** `runScreener(null)` hits `GET /api/argus/screener` and never sends `min_conviction`; the value only applies to the POST path with a custom ticker list. The control stays visible and editable, implying it works. *Fix:* send it on both paths, or disable it with a note when running the full universe.

**SC-02 · P0 · A skeleton table is used as decoration in the idle state.** With `results === null` the page renders an explainer card **plus** `SkeletonTable rows={6}` — a shimmering placeholder while nothing is loading, which reads as a hung request. *Fix:* a static, low-contrast column preview or nothing.

**SC-03 · P1 · A 10–30s job with no progress, no cancel, no persistence.** `loading` shows "Running agent ensemble… (10–30s)" plus a second skeleton; there's no progress signal, no way to abort, and results live in component state so any navigation discards them. *Fix:* persist the last result (SWR cache or localStorage) with an "as of" line, and add cancel.

**SC-04 · P1 · Verdicts bypass the `Badge` component.** `verdictColor()` renders raw colored mono text while the rest of the app uses `Badge variant="verdict"` for the same values. *Fix:* use `Badge`.

**SC-05 · P1 · Twelve columns, three unlabelled.** `L`, `S`, `W` (long/short/wait votes) as bare letters; `HC` as literal bold text; `Agree%`, `R:R`, `Score` to three different precisions (3dp / 0dp% / 1dp). *Fix:* header tooltips, and one numeric precision policy.

**SC-06 · P1 · Return units differ from the rest of the app.** Here `fmtPct` multiplies by 100 (API returns fractions); Today's `Ret` prints the raw number with no `%`. The same "1d" concept renders as `+2.4` on one page and `+2.4%` on another. *Fix:* normalise at the API boundary, one formatter.

**SC-07 · P2 · Refresh is conditional.** "Re-run (~30s)" only renders when the response was `cached`; a fresh-but-stale result has no refresh affordance. *Fix:* always offer refresh, show `as_of` next to it.

**SC-08 · P2 · Pin failures are invisible.** The optimistic toggle's `catch` just revalidates; the chip silently reverts. *Fix:* inline error.

**SC-09 · P2 · Solid accent primary button** (`bg-accent text-white`) appears only here and on Alerts; the rest of the product uses bordered ghost buttons. Pick one primary style and apply it consistently.

---

## 11. Portfolio (`/portfolio`)

`app/portfolio/page.tsx`

**PF-01 · P0 · No P&L.** The table shows position, avg cost, Argus verdict, score and edge — no market value, no unrealized P&L, no day change, no weight. For a positions screen that's the missing centre. `/api/account` exists in Argus (per README) and isn't used, so there's no NLV/cash/buying-power either. *Fix:* market value + unrealized P&L columns and an account summary strip.

**PF-02 · P0 · The subtitle contradicts the documented ports.** Hardcoded "Paper account · IBKR Gateway 4002" while the README specifies 7497 (paper) / 7496 (live) and `.env` controls it. Nothing on screen reflects the *actual* connection or whether live trading is enabled. *Fix:* read the real host/port/mode from `/api/status` and label live vs paper prominently.

**PF-03 · P0 · Skeleton-as-illustration again.** In the offline state the page renders `SkeletonTable` under "Positions (connect gateway)" — an animated loading placeholder for something that is explicitly *not* loading.

**PF-04 · P1 · A third table implementation.** Bespoke `<table>` with zebra via `bg-white/[0.02]` (an ad-hoc alpha, not a token), no sort, no keyboard, no persistence. *Fix:* `DataTable`.

**PF-05 · P1 · Row navigation is an unlabelled `›` button.** 12px, last column, no `aria-label`, while rows elsewhere are clickable. *Fix:* make the row clickable (`onOpen`), drop the glyph.

**PF-06 · P1 · The watchlist fallback is unexplained.** When IBKR is down the page shows pinned tickers + dates under an 11px amber line. Why the watchlist is a substitute for positions is never stated. *Fix:* one sentence of intent, or drop the fallback in favour of a clean offline state with a "Connect" walkthrough.

**PF-07 · P2 · Two overlapping offline signals.** `offline` (no list / error sentinel) and `liveOffline` (`ibkr_offline` on rows) render different messages in different places with the same amber styling.

**PF-08 · P2 · `edge` renders raw** (`HOLD/ADD`, `CONSIDER SELLING`, `NEUTRAL`) as muted mono text with no chip, no color, and no explanation of how it's derived.

---

## 12. Alerts (`/alerts`)

`app/alerts/page.tsx`

**AL-01 · P0 · `enabled` exists in the model and has no UI.** `Rule.enabled` is fetched and never rendered or toggled — the only lifecycle operation is destructive delete. *Fix:* a per-rule enable/disable switch.

**AL-02 · P0 · No channel status.** The subtitle promises "fires via your alert channels" while SMTP/Telegram/webhook config lives in `.env`. There's no indication of which channels are configured, no test-send, and a rule can fire into nothing. *Fix:* a channel row (Email ✓ / Telegram — / Webhook ✓) with a "Send test" action.

**AL-03 · P1 · Validation gaps.** `addRule` returns silently when `kind === "price"` and `level` is empty; the Add button is only disabled on an empty symbol. No feedback on invalid symbols either (server response is discarded). *Fix:* disable on incomplete params, surface the API error.

**AL-04 · P1 · Delete is immediate and irreversible** (icon-only trash, no confirm, no undo) — the same pattern as watchlist unpin.

**AL-05 · P1 · "Evaluate now" has no result.** It POSTs and refreshes the log; if nothing fired, nothing visibly changes. *Fix:* "Evaluated 6 rules · 0 fired · 12:04".

**AL-06 · P2 · Condition labels don't survive into the list.** The form says "Verdict flips to"; the rule row shows a `verdict` chip plus `NVDA → verdict becomes LONG`. Two phrasings for one concept.

**AL-07 · P2 · Log caps at 30 with no pagination, no grouping by day, and `toLocaleString()` with no timezone label.**

**AL-08 · P2 · 9px-tall labels above 36px inputs** (`text-[11px]` labels, `h-9` fields) and a hardcoded `inputCls` string instead of a shared input component — the app has no `Input`/`Select` primitives, so every page re-invents field styling (compare Screener's `h-9`, Today's `h-8`, Watchlist's `py-1.5`).

---

## 13. Macro (`/macro`)

`app/macro/page.tsx`, `macro/MacroChart.tsx`

**MC-01 · P0 · Orphan page** (see G-01).

**MC-02 · P1 · Scope state can point at nothing.** `scope` defaults to `"global"` and is never reconciled when `window` changes; the gauge grid is filtered by window, so the chart can plot a scope that has no visible card — with the caption still naming it. *Fix:* reset scope to the first available gauge when the window changes.

**MC-03 · P1 · The empty state appears below an empty chart.** `{!anyData && <p>No macro data yet…</p>}` renders *after* `<MacroChart>`, so a first-run user sees a blank plot and then an explanation. *Fix:* replace the chart with the empty state.

**MC-04 · P1 · Whole page in mono, bespoke `<h1>`, no `PageHeader`, no timestamp** — and no legend explaining that the overlay is SPY (only the small caption "vs SPY").

**MC-05 · P2 · Gauge cards are unlabelled toggles.** `<button>` with `border-accent` when active, no `aria-pressed`, no group role; `n=` counts at 10px `opacity-60`.

**MC-06 · P2 · Window buttons duplicate the rail's window link** (`MacroGauges` links `/macro` with `{window} ›`) but the deep link doesn't carry the window — it always lands on `1d`.

---

## 14. Shared component system

`components/ui/*`

**UI-01 · P1 · `ConvictionDot` occupies a column and carries no weight.** All three dots render in `--muted` regardless of level (differing only by fill count at 8px), and the tooltip states it's "Display-only — not blended into the composite score". A column that is neither legible nor decision-relevant. *Fix:* drop from the table, or make it a tinted `high/med/low` label.

**UI-02 · P1 · Three near-identical center-zero bars.** `MicroBar` (56×8), `ScoreBar` (100×8, optional value), `NetBar` (80×8, defined inline in `WhyPanel`). Same visual, three APIs, one duplicated implementation. *Fix:* one `<CenterBar width value showValue>`.

**UI-03 · P1 · `Badge` tier colors invert the app's own semantics.** `PRIME_LONG → bg-warn/20 text-warn` (amber) while `BREAKOUT_LONG`/`STANDARD_LONG` are green — but amber means *caution* everywhere else (stale data, earnings inside the hold window, market closed, wide CI). The strongest signal reads as a warning. *Fix:* make PRIME the strongest green (weight/fill), reserve amber for risk.

**UI-04 · P1 · `Panel` animates `max-height: 9999px`.** Open state jumps rather than eases, and content taller than 9999px clips. `DataTable`'s expansion uses `600px`, `DiffStrip` uses `9999px` too — three magic numbers. *Fix:* grid-rows or measured height.

**UI-05 · P1 · `Panel` titles are strings, so callers fake structure.** `SignalGroups` passes `` `${g.title}  (${count})` `` with two spaces to imitate a count chip. *Fix:* accept `ReactNode` or a `count` prop.

**UI-06 · P1 · `DataTable` sticky column relies on `bg-inherit`.** Row backgrounds are set on `<tr>` (zebra `bg-surface` / `bg-bg`) and the first cell uses `sticky left-0 bg-inherit` — fragile across browsers, and the sticky header (`bg-surface`) is the same color as every even row, so the header doesn't separate on scroll. *Fix:* explicit cell backgrounds, and a distinct header surface + shadow.

**UI-07 · P1 · `DataTable` keyboard mode is invisible and jumpy.** The container is `tabIndex=0` with `outline-none`, so there's no focus ring to tell you `j/k` are live; `focusedKey` changes call `scrollIntoView({block:"nearest"})` inside nested scroll containers. *Fix:* visible focus state on the table, and scroll only when the row is actually out of view.

**UI-08 · P1 · No horizontal-scroll affordance.** `DataTable` and four bespoke tables use `overflow-x-auto` with no edge fade or shadow; with 12 columns and two rails eating 460px, columns silently sit off-screen. *Fix:* gradient masks on both edges when scrollable.

**UI-09 · P1 · Tooltip triggers are mostly non-focusable spans.** `Badge`, `ConvictionDot`, `ChipTooltip`, `CatalystCount`, `QuadrantDot`, `DRank`, `Th` all wrap `cursor-default` spans. Radix opens on focus *if the trigger is focusable* — these aren't, so keyboard and screen-reader users can't reach the definitions, and touch users can't either. *Fix:* `tabIndex={0}` + `role="button"` on tooltip triggers, or move definitions into visible legends.

**UI-10 · P2 · `EmptyState` is used three times.** Everywhere else empties are bare `<p className="text-[13px] text-muted">` ("none today", "No recent news", "No prior flags in the database", "No results above threshold"). *Fix:* one empty component with message + optional action.

**UI-11 · P2 · `Sparkline` is `aria-hidden` with no text alternative** and inherits `currentColor` from a muted parent, so trend direction is conveyed by a 1.5px muted line only.

**UI-12 · P2 · No `Input`, `Select`, `Button` primitives.** Field and button styling is re-declared in at least six files with different heights (h-8 / h-9 / py-1.5), radii and focus treatments (`focus:border-accent` vs `focus:ring-1 focus:ring-accent`).

**UI-13 · P2 · `StatChip` and hand-rolled chips coexist** — `WhyPanel`'s `n_eff` chip replicates `StatChip`'s markup because it needs a trailing tooltip.

---

## 15. Accessibility

**A11Y-01 · P0 · Hover-only semantics.** The product's entire explanatory layer is Radix tooltips + `title` attributes on non-focusable elements (see UI-09). On a touch device, a large share of the UI is undecodable. *Fix:* a glossary page + visible legends + focusable triggers.

**A11Y-02 · P1 · Type floor is too low.** 9px (`EconCalendar` time, `MiniItem` labels, rail block badges, news meta, ladder markers), 10px (eyebrows, chips, many labels), 11px (most mono data). `--muted #7d8698` on `--surface #0c1017` is ~5:1 — acceptable at 14px, fragile at 9–10px, and further reduced by `text-muted/70`, `text-muted/80`, `opacity-60`, `text-foreground/80`. *Fix:* 11px floor for data, 12px for prose; replace opacity with tokens.

**A11Y-03 · P1 · Color-only encodings.** Quadrant dots, econ importance dots, FX session tints, breaking-news border, GEX bar sign, `MacroGauges` blue/amber. Returns are the good case — the `+`/`−` sign is a redundant cue. *Fix:* pair each with a shape, letter or label.

**A11Y-04 · P1 · Toggles lack state semantics.** EMA chips, `log`, `HC only`, macro window/scope, symbol switchers — all `<button>` with visual-only state, no `aria-pressed`. Nav links lack `aria-current`.

**A11Y-05 · P1 · No skip link** and rails precede content (G-11).

**A11Y-06 · P2 · Tables lack `scope`/`caption`** in the bespoke implementations (Rotation, Portfolio, OptionsPanel, HistoryCard, strikes ladder).

**A11Y-07 · P2 · Destructive actions without confirmation** (unpin, delete rule) and no undo anywhere in the product.

**Credit where due:** the global `*:focus-visible` outline, `prefers-reduced-motion` reset, `tabular-nums` enforcement, `aria-expanded`/`aria-controls` on `Panel` and the votes accordion, and `aria-label`s on icon-only rail/delete buttons are all correct.

---

## 16. Consistency & cross-product findings

**X-01 · P0 · Two products, two design languages.** `Market_Review`'s `render_dashboard()` is light-mode (`--bg #f6f7f9`, `--ink #17202a`), system-font, purple accent `#6f5cc2`, 8px radii with drop shadows, pill badges, a five-lane kanban board, and its own vocabulary: `fresh_watch`, `building`, `momentum_confirmed`, `extended`, `late_chase`, `avoid_wait`, `noise` — versus Argus's dark terminal and `ALIGNED / PULLBACK / TECH+FUND / other`. Same operator, same daily workflow, adjacent stages of one pipeline, zero shared DNA. *Fix:* decide which is the product surface. If both stay, port Market Review to the Argus tokens and unify the label taxonomy (one mapping table, one set of names).

**X-02 · P1 · A third and fourth palette.** `argus/argus/ui/index.html` uses `#0b0e14 / #e6e8ec / #5b9cf6` — close to but not equal to the dashboard tokens (`#06090f / #eef1f6 / #4c8dff`). `CandleChart` hardcodes `#0b0e14`, `#8b93a3`, `#161b24`, `#222936` for its background, text, grid and borders, so the chart is a *different* dark theme sitting inside a Panel. `#e6e8ec` also appears as the chart's entry-line color. *Fix:* read tokens via `getComputedStyle` (or pass them in) and align the dev UI.

**X-03 · P1 · Four locales, no timezones.** `en-NZ` (`app/page.tsx` bridge time), `en-AU` (`CatalystStrip`), `en-US` (`QuoteRow`), runtime default (`alerts`, `portfolio`, `watchlist`). Session logic is ET, chart timestamps are UTC, alert logs are local — and almost no timestamp carries a zone label. *Fix:* one locale + one display-timezone setting, `tz-display.ts` already exists as the hook point.

**X-04 · P1 · Three pin affordances.** `PinButton` (ticker header, bordered accent chip), `PinCell` (screener, bordered chip that turns amber), watchlist `unpin` (text link). *Fix:* one `<PinToggle>`.

**X-05 · P1 · Four collapsible implementations.** `Panel`, `DiffStrip`, `VerdictCard`, `WhyPanel`'s votes accordion — different chevrons, radii, persistence and animation.

**X-06 · P1 · Five table implementations.** `DataTable` (Today, Watchlist, Screener) + bespoke tables in `RotationPanel`, `portfolio`, `OptionsPanel`, `HistoryCard`, `odte/strikes`. Everything not on `DataTable` loses sorting, keyboard nav and persisted state.

**X-07 · P2 · Group naming drifts across surfaces.** Today's UI labels (`ALIGNED`, `HIGH CONVICTION, PULLING BACK`, `TECHNICAL + FUNDAMENTAL`), `CommandK`'s inline re-derivation (`aligned`/`pullback`/`tech_fund`/`other`), `DiffStrip`'s `GROUP_LABEL` (`tech+fund`), Watchlist's raw `first_group`, and the ticker `HistoryCard`'s raw `report_group`. Five renderings of one enum — and `CommandK` reimplements the grouping logic that `lib/groups.ts` owns. *Fix:* one label map + one grouping function.

**X-08 · P2 · Number precision is ad hoc.** Scores at 2dp and 3dp, returns at 1dp with and without `%`, agreement as `%` (and a `>= 2 ? round : round(x*100)` normalisation hack in `WhyPanel`), R:R at 1dp and 2dp on different pages. *Fix:* a `format.ts` with `pct`, `ret`, `score`, `rr`, `price`.

---

## 17. Prioritised roadmap

**P0 — correctness and dead ends (1 sprint)**
1. `/sources` route (or re-target the chips) — TK-01
2. Macro into the nav — G-01, MC-01
3. Screener `min_conviction` on the full-universe path — SC-01
4. Remove skeletons from idle/offline states (Screener, Portfolio) — SC-02, PF-03
5. Portfolio P&L + account summary; fix the IBKR port/mode label — PF-01, PF-02
6. Alerts: rule enable/disable + channel status — AL-01, AL-02
7. Live chart levels — TK-02
8. Visible `?` affordance + shortcut hints — G-02
9. Disclaimer where advice is given (`StrikeGuidance`) — OD-02
10. Filter feedback on Today (never silently hide a group) — TD-02

**P1 — usability (2–3 sprints)**
11. Glossary/legend page; make tooltip triggers focusable — A11Y-01, UI-09
12. Type-scale floor pass (11px data / 12px prose), kill `opacity`-based dimming — A11Y-02
13. Row-encoding diet on Today; unify period returns — TD-03, TD-06
14. Migrate Rotation + Portfolio to `DataTable`; add scroll affordance — RO-03, PF-04, UI-08
15. Left-rail responsive parity + pinned rail footer — LR-01, LR-05
16. Deduplicate odte (verdict cards vs companion grid), de-mono the prose — OD-01, OD-03
17. `useTickerData()` + `useMarketClock()` hooks — TK-18, G-05
18. Date navigation on Today — TD-01
19. Undo for unpin/delete — A11Y-07
20. Split the votes accordion by agreement + family — TK-06

**P2 — system debt (ongoing)**
21. `Input`/`Select`/`Button`/`CenterBar`/`EmptyState` primitives — UI-02, UI-10, UI-12
22. One collapsible, one table, one pin, one label map — X-04, X-05, X-06, X-07
23. `format.ts` + single locale/timezone setting — X-03, X-08
24. Tokens into `CandleChart` and the Argus dev UI — X-02
25. Settings page (risk, ports, thresholds, reset all stored prefs) — G-14
26. Port Market Review to the Argus token set and unify the taxonomy — X-01

---

## 18. What's already good (keep)

- The token ladder in `globals.css` — five surfaces, semantic state colors, thin themed scrollbars, `tabular-nums` globally, `prefers-reduced-motion`.
- Fira Sans / Fira Code with mono reserved for data — the right typographic decision for this product.
- Intellectual honesty in the copy: "consensus, not edge", "magnitude does not predict returns", "~72% of ±1 moves are noise", "Higher is not better", "advisory only", "context, not a mechanical exit system". This is rare and valuable — the fix is to make it *more* visible, not less.
- `DataTable`'s expand-in-place + `j/k` navigation is the right interaction for a scanning workflow.
- `WhyPanel`'s degraded states (504 → "the ensemble is slow, not offline", stale chip, retry) are best-in-app error handling; use them as the template everywhere else.
- The "How to read this ladder" section on `/odte/strikes` is the best explanatory content in the product — it just needs to be above the fold.
- Per-view state persistence is the right instinct for a daily-use local tool; it needs visibility and a reset, not removal.

---

# Addendum — Argus Options Live (new commit)

**Reviewed:** `argus/argus/options_live/*` (13 modules), `dashboard/lib/optionsLive.ts`, `dashboard/components/GexChart.tsx`, `dashboard/app/odte/strikes/page.tsx` (now 591 lines, was 358), `dashboard/next.config.mjs`, `dashboard/lib/__tests__/optionsLive*.ts`.

**What shipped, as built:** a live IBKR ladder behind a `LIVE` toggle on `/odte/strikes` — provenance badge (LIVE / FROZEN / EOD + timestamp + staleness + fresh-contract ratio), a six-cell levels strip (ATM, max pain, pin risk, zero-gamma, MSI call/put, net GEX band), a 23-column strike ladder (bid/ask/IV/Δ/Γ/Θ/ν/ρ/vol/OI/GEX per side), 500 ms polling, and a `GexChart` Recharts area chart. Backend analytics (IV surface, exposures, levels, MSI/MTC, session lifecycle, yfinance fallback) are typed end-to-end into `LadderSnapshot`, which is genuinely good — the UI layer is where this needs work.

Numbering continues the main document (`OL-xx`). Severity key unchanged.

---

## 19. Options Live — correctness

**OL-01 · P0 · The fetch target does not exist in the Next app.** `fetchOptionsLive()` calls `/api/options/live/${symbol}?expiry=0DTE`, but `dashboard/app/api/` contains only `accounts`, `argus`, `bridge`, `odte`, `signals`, `status`, `watchlist` — there is no `options` route, and `next.config.mjs` defines **redirects only, no rewrites** (and its `/options/:ticker → /t/:ticker` rule doesn't match an `/api/...` path). Every FastAPI route the dashboard consumes today goes through the `app/api/argus/[...path]` proxy; this one bypasses it. As written, the LIVE toggle can only ever produce a 404 → `console.warn` → "Live data unavailable". *Fix:* add `app/api/options/live/[symbol]/route.ts` proxying `127.0.0.1:8088`, or call `/api/argus/options/live/${symbol}` through the existing proxy.

**OL-02 · P0 · Turning LIVE on renders two ladders at once.** `{showLive && …}` and `{data && …}` are independent siblings, so with the toggle on and the SWR ladder loaded, the page stacks the 23-column live table *and* the original 8-column mirrored ladder — each inside its own `flex-1 overflow-auto` region, competing for the same flex height, with two sticky headers and two different strike orderings. *Fix:* one ladder at a time (`showLive ? <LiveLadder/> : <ClassicLadder/>`), or make it a real mode switch with shared chrome.

**OL-03 · P0 · The GEX column renders the same value twice.** Both the call-side GEX cell and the put-side GEX cell print `level.gex_by_strike / 1000` — the identical expression. Column 12 and column 23 of a 23-column table always agree, which reads as "calls and puts have equal gamma at every strike". Either the model needs `call_gex` / `put_gex`, or the column belongs once, in the centre next to the strike. *Fix:* split the field server-side, or render one signed GEX column.

**OL-04 · P0 · `GexChart` is built and never mounted.** The component exists (130 lines, parses `{strikes:[], gex:[]}`, handles empty/invalid states) but nothing imports it; `strikes/page.tsx` has the comment `{/* GEX Profile Chart — implementation deferred to Task 12 */}` where it should be, and `gex_profile_json` is typed, fetched and unused. The execution summary marks Dashboard 11–12 complete. *Fix:* mount it under the levels strip.

**OL-05 · P1 · The 500 ms poller has no overlap guard, no abort and no backoff.** `setInterval(fetchLive, 500)` fires regardless of whether the previous request resolved; there's no `AbortController`, no `document.hidden` check, and a failing endpoint keeps hammering at 2 req/s forever while showing one static error line. With OL-01 unfixed that's a 404 twice a second for as long as the tab is open. *Fix:* self-scheduling `setTimeout` loop after each settle, abort in-flight on symbol change/unmount, pause when hidden, exponential backoff to ~5 s on repeated failure.

**OL-06 · P1 · Errors don't invalidate the ladder on screen.** `setLiveError(...)` leaves `liveLadder` intact, so a dead feed shows a red "Live data unavailable" line above a fully-rendered ladder of frozen numbers with a green `LIVE` badge and a timestamp that stops advancing. This is the most dangerous failure mode in the whole product — stale option greeks that still look live. *Fix:* on N consecutive failures, dim the table, flip the badge to `STALE`, and show the age in seconds, not milliseconds.

**OL-07 · P1 · `stale_ms > 0` is effectively always true.** The staleness chip renders whenever the value is non-zero, so a healthy feed permanently displays something like "180ms stale" in warn amber next to a green LIVE badge — a warning colour that never turns off stops being a warning. *Fix:* threshold it (e.g. >1500 ms), and express it in human units.

**OL-08 · P1 · Half the typed payload never reaches the screen.** `msi_rationale` (the *why* behind the MSI strikes), `spread_pct`, `liquid`, `per_dollar_gamma`, `per_dollar_delta`, `wall_type`, `zero_gamma_side`, `max_pain_delta` are all modelled and none are rendered. Meanwhile ρ — the least useful greek for 0DTE — gets two of the 23 columns. *Fix:* trade ρ (and arguably ν) for `spread_pct` + a `liquid` marker, and surface `msi_rationale` as the MSI cell's tooltip.

---

## 20. Options Live — surface design

**OL-09 · P0 · A fifth and sixth palette.** This commit introduces raw Tailwind palette colours into a token-driven product: `bg-blue-500/30 text-blue-300` and `bg-gray-500/20 text-gray-400` (LIVE toggle), `bg-green-500/30 text-green-300`, `bg-yellow-500/30 text-yellow-300`, `bg-gray-500/30 text-gray-300` (provenance badge), `bg-yellow-500/10` and `bg-blue-500/10` (row highlights), and `#10b981` / `#ef4444` hardcoded in `GexChart`. The app's own tokens for exactly these states are `--teal`, `--amber`, `--muted`, `--green #3fb950`, `--red #f85149`. Note the existing `bg-green-500/20` in the symbol switcher (OD-05) has now spread. *Fix:* map LIVE→teal, FROZEN→amber, EOD→muted, and use `var(--green)/var(--red)` in the chart.

**OL-10 · P1 · Case is not a state.** The toggle's label changes from `live` to `LIVE` — lowercase/uppercase as the primary state cue, backed only by grey→blue. There's no dot, no "polling" indicator, no `aria-pressed`, and the state isn't persisted (every navigation back to Strikes resets to off, discarding the mode the user was working in). *Fix:* a proper switch with a live dot, persisted in localStorage like every other rail/panel preference.

**OL-11 · P1 · 23 columns at 11px with no sticky strike and no scroll affordance.** The strike column scrolls away horizontally (the *classic* ladder at least anchors the strike in the centre), there's no edge fade, `text-center` on every numeric cell defeats decimal alignment, and `tabular-nums` — applied to the old ladder — is missing from the new one. *Fix:* `sticky left-0` on the strike cell, right-align numerics, add `tabular-nums`, gradient masks on both edges.

**OL-12 · P1 · Greek symbols with no legend.** `Δ Γ Θ ν ρ` head ten of the columns with no tooltip, no key, and no unit — while the same page's footer ("How to read this ladder") explains SPOT/ZG/CW/PW in detail. The new table also drops the marker codes entirely, so a user in LIVE mode loses the ZG/CW/PW vocabulary they just learned. *Fix:* extend the footer legend to greeks and keep the marker codes in the live ladder.

**OL-13 · P1 · Duplicated and inconsistent numbers in adjacent rows.** `net_gex_band` prints in the provenance line *and* again in the levels strip 40 px below. Precision is ad hoc across six cells: ATM 0dp, max pain 2dp, pin risk 0dp, zero-gamma 0dp, MSI 0dp — and `pin_risk` is a bare unitless number with no scale or range. *Fix:* one placement per fact, one precision policy, label `pin_risk` (0–100? probability?).

**OL-14 · P1 · Row highlighting is ambiguous when ATM and zero-gamma coincide.** Both class strings are appended (`bg-yellow-500/10` for ZG, `bg-blue-500/10` for ATM); which wins depends on CSS source order, not intent — and neither is explained anywhere on screen. The classic ladder solved this with left borders + inline codes. *Fix:* left-border markers + code chips, same vocabulary as the classic ladder.

**OL-15 · P2 · Provenance metadata is 11px muted, the least prominent thing in the block.** Timestamp, staleness and fresh-contract ratio — the entire basis for trusting the numbers — sit at the smallest size on the page, right-aligned, with `fresh_contract_ratio` shown as a bare "Fresh 87%" with no explanation of what 87% means. *Fix:* promote to the levels strip as a first-class cell with a tooltip.

**OL-16 · P2 · The levels strip is a rigid `grid-cols-6`.** Six fixed columns inside a centre pane already squeezed by two rails; "MSI Call/Put" plus two 4-digit strikes will wrap or clip well before a laptop viewport. *Fix:* `flex-wrap` with the existing `StatChip`.

**OL-17 · P2 · No loading state for live mode.** Between toggling on and the first response there's simply nothing — no skeleton, no "connecting to gateway…". Given the backend has an explicit session lifecycle (connect → subscribe → coalesce), the UI should reflect it. *Fix:* a connecting state that names the phase.

**OL-18 · P2 · `GexChart` ignores the app's chart conventions.** Own colour logic, own tooltip, `stroke="rgba(255,255,255,0.3)"` axes, 300px fixed height, no zero line, no spot/ATM reference line, and net-GEX sign colours the *entire* profile one hue rather than colouring positive and negative regions — which is precisely the information a gamma profile exists to show. `RRGChart` already establishes the house pattern (Panel wrapper, token colours, `ReferenceLine`). *Fix:* wrap in `Panel`, split fill at zero, add `ReferenceLine` at spot and zero-gamma.

**OL-19 · P2 · No accessible handling of a 500 ms-updating region.** No `aria-live` policy either way — a screen reader gets either silence or an unusable firehose from a 23×N table that mutates twice a second. *Fix:* `aria-live="off"` on the table with a separate polite summary region ("SPY 5482.10, net GEX positive, updated 2s ago").

**OL-20 · P2 · Live mode hides the expiry tabs.** The expiry selector lives in the `{data && …}` block and `fetchOptionsLive` is hardcoded to `"0DTE"`, so in live mode the user can't change expiry and isn't told why the tabs vanished (or, per OL-02, sees tabs that only affect the *other* ladder). *Fix:* one expiry control feeding both sources.

---

## 21. Options Live — what to do next

**Ship-blockers (before this is usable at all)**
1. Route the fetch through a real endpoint — OL-01
2. One ladder per mode — OL-02
3. Split or de-duplicate the GEX column — OL-03
4. Mount `GexChart` — OL-04
5. Tokenise the new colours — OL-09

**Before it can be trusted with money**
6. Poller hygiene: abort, backoff, visibility pause — OL-05
7. Fail loudly: invalidate the ladder, flip the badge, age in seconds — OL-06, OL-07
8. Threshold and explain provenance (staleness, fresh ratio) — OL-07, OL-15

**Then**
9. Sticky strike, right-aligned tabular numerics, scroll affordance — OL-11
10. Greek + marker legend carried into live mode — OL-12
11. Trade ρ/ν for `spread_pct` + `liquid`; surface `msi_rationale` — OL-08
12. Persisted toggle with a real switch — OL-10
13. Unified expiry control — OL-20
14. GEX chart into `Panel`, split at zero, reference lines — OL-18

**Note on the execution summary:** Dashboard (tasks 11–12) is marked ✅ with 119 TypeScript tests, but the 23-column ladder currently fetches a non-existent route, the GEX chart isn't mounted, and the two ladders overlap. The tests in `lib/__tests__/optionsLive*.ts` assert type shape and that `fetchOptionsLive` is a function — they don't exercise the route, the polling loop, or the rendered table, so none of OL-01 … OL-04 would fail CI. Worth adding one integration test that mounts the page with the toggle on against a mocked endpoint.
