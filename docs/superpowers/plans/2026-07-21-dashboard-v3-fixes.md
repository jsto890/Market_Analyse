# Dashboard v3 — Remediation Plan (product-test fixes)

Date: 2026-07-21. Source: 4-agent product test (2026-07-20) + root-cause verification. Organised by impact tier per user request. Each item: **root cause → fix → files → verify**. Effort tags: S (<30min), M (~1–2h), L (half-day+).

Execution branch per tier; merge `--no-ff` after each tier passes `npm test` + `npx tsc --noEmit` + `next build` + a Playwright walkthrough (`scripts/shot.mjs`).

---

## TIER 1 — HIGHEST IMPACT (functional breakage)

### 1.1 ODTE endpoints 500 — `"use client"` contaminates server routes  [M]
**Root cause (verified):** Phase C added `"use client";` to `lib/odte.ts` so it could host the `useOdteSymbol`/`useLadder` hooks. But that file also exports the pure helpers `odteSymbols`, `isOdteSymbol`, `OdteSymbol`, and the `OdteHealth`/type interfaces, which are imported by **server-side route handlers** (`app/api/odte/{gex,pcr,unusual}/route.ts`) and by `lib/odteCompanion.ts`. A `"use client"` module gives server code client-reference stubs, so `isOdteSymbol` is not a function at request time → `TypeError` → empty-body 500. Argus itself returns 200 with full snapshot data (verified `:8088/api/{gex,pcr,unusual}/SPY`). There is also a latent circular import (`odte.ts` ↔ `odteCompanion.ts`).
**Fix:** Split the module.
- New `lib/odte-core.ts` (NO "use client"): `odteSymbols`, `odteEtfSymbols`, `odteIndexSymbols`, `OdteSymbol`, `isOdteSymbol`, and all pure types/interfaces (`OdteHealth`, ladder types, `GexLevels`). No React imports.
- `lib/odteCompanion.ts` imports symbols/types from `odte-core` (breaks the cycle; keep `companionSymbol`, `indexProxy` here or fold into core).
- `lib/odte.ts` keeps `"use client"` + hooks (`useOdteSymbol`, `useLadder`, `useOdteHealth`, badge helpers) and re-exports core for existing client imports (`export * from "./odte-core"`).
- Server routes (`app/api/odte/{gex,pcr,unusual,symbol}/route.ts`) import `isOdteSymbol`/`companionSymbol` from `odte-core`/`odteCompanion`, never from the client `odte.ts`.
**Files:** create `lib/odte-core.ts`; edit `lib/odte.ts`, `lib/odteCompanion.ts`, `app/api/odte/{gex,pcr,unusual,symbol}/route.ts`.
**Verify:** new vitest asserting `isOdteSymbol` importable + callable from a non-client context; `curl /api/odte/gex?symbol=SPY` → 200 with body; ODTE Flow card + companion GEX/PCR/Unusual tiles populate.

### 1.2 Underlying selector stuck on SPY  [M]
**Root cause:** the switch handler awaits a POST to `/api/odte/symbol` → `:8788/control/symbol`; that route also 500s (same "use client" issue in 1.1 + the live backend), so the client never gets success and never updates. Selection is wrongly coupled to a server round-trip.
**Fix:** make selection client-first. `useOdteSymbol` writes the choice to `localStorage` (`odte-symbol`) and updates UI state immediately (optimistic); fire the `:8788` sync as a non-blocking best-effort (ignore failure). Selector reads/writes `odte-symbol`; `/odte` and `/odte/strikes` both read it so the choice persists across pages.
**Files:** `lib/odte.ts` (`useOdteSymbol`), `app/odte/page.tsx`, `app/odte/strikes/page.tsx`, `app/api/odte/symbol/route.ts` (must not 500 after 1.1; return 200 even if backend sync fails).
**Verify:** click QQQ → header + data switch to QQQ without a network dependency; reload `/odte/strikes` → still QQQ; index symbols show proxied ETF data (see 3.5).

### 1.3 Context strip / top-right indicators — full overhaul  [L] (user priority)
**Problems:** overflows below 1440 and pushes the health dot off-screen; two redundant health dots (strip aggregate + standalone `StatusDot` in `NavActions`); count semantics wrong/confusing (`watch 1` vs ~8 WATCH rows; `earnings 0` reads as "none ever"); cramped `743.29-0.99%prev`-style density; secondary nav (`ODTE↗ Portfolio ⌘K`) competes with status in the same row.
**Fix (redesign):**
- **Always-visible priority:** regime + session chip + ONE health dot must never scroll off. Put the single health dot in a fixed nav slot (leftmost of the status cluster), not the end.
- **Collapse under width:** below ~1360px, fold the freshness detail (`sent: … · bridge …`) into the health-dot popover; keep regime · session · health · counts inline. Below ~1100px, counts collapse into the popover too. Use a container-query/breakpoint, not fixed single-line.
- **One dot, not two:** delete standalone `StatusDot` from `NavActions`; the strip's aggregate dot (worst-of Argus/IBKR/ingest, with per-service tooltip) is the only one. Give it a distinct **shape+label** (e.g. a ◆ or a small "SYS" pill) so it doesn't collide with green=up / "Live" pill semantics.
- **Fix counts (align to the table):** `watch` counts rows whose signal is WATCH (same source as `SignalGroups`), not the current mis-derived value; `earnings` shows today's count and, when 0, shows the next earnings day (`earn: Thu 3`) or hides — never bare `0`. Add tooltips defining each count.
- **Move secondary nav out of the status row:** `Portfolio`, `ODTE↗` become real entries in `NavLinks`; `⌘K` hint stays but right-aligned and drops first under width.
**Files:** `components/ContextStrip.tsx`, `components/Nav.tsx`, `components/NavActions.tsx`, `components/NavLinks.tsx`, `lib/status.ts` (count derivation → reuse `groupSignals`), `components/StatusDot.tsx` (remove/merge).
**Verify:** Playwright at 1024/1280/1440 — health dot + regime + counts visible at every width, no horizontal overflow; counts match the Today table; tooltip lists the 3 services.

### 1.4 News rail starves/clips main tables at narrow widths  [M]
**Root cause:** the ~250px news rail is fixed and never yields; main-column tables have hidden overflow, so columns silently vanish at 1280/1024 (Today loses "Cat", watchlist loses 5 columns, strikes selector clips RUT/DJX).
**Fix:** (a) make the right rail collapsible (a persistent toggle; remember state in localStorage) and auto-collapse below ~1280; (b) wrap wide tables in `overflow-x-auto` containers so nothing is silently hidden even when present. Pairs with 4.1 (collapse on table-heavy pages).
**Files:** `components/rails/RailShell.tsx`/`RightRail.tsx`, `app/layout.tsx`, the table components on Today/watchlist/strikes.
**Verify:** at 1024, no column loss; body never scrolls horizontally; rail collapse toggle works and persists.

### 1.5 `/rotation` renders empty  [S→M]
**Root cause:** `RotationPanel` defaults collapsed to a one-line header; the dedicated page shows only that header over a void (my Phase A regression — moved the panel but didn't give the tab a default-expanded/full view).
**Fix (minimum):** render `RotationPanel` expanded on `/rotation` (pass an `defaultOpen`/`expanded` prop or a non-collapsible variant). See 4.x-expand (Tier 4) for the fuller RRG build.
**Files:** `app/rotation/page.tsx`, `components/today/RotationPanel.tsx`.
**Verify:** `/rotation` shows the 12-row sector table by default.

---

## TIER 2 — MEDIUM

### 2.1 ODTE verdict-card expand is a no-op  [M]
**Root cause:** `VerdictCard` chevrons imply expandability but the click handler doesn't reveal detail (Phase C claimed-done, not wired). Confirmed via byte-identical before/after screenshots.
**Fix:** implement expand-in-place: toggle a detail body (reuse `GexCard`/`PcrCard`/`UnusualCard` content), a one-line "why this matters", and an in-card "Open strikes →" link. Per spec §6.
**Files:** `components/odte/VerdictCard.tsx`, `app/odte/page.tsx`.
**Verify:** clicking a card expands/collapses; screenshot differs.

### 2.2 Strikes table: no highlighting + lands on deep-ITM  [M]
**Root cause:** zero-gamma/wall row highlighting never implemented; default scroll shows strikes 700–723 while spot 743 / walls 745 / zero-gamma ~749 are below the fold.
**Fix:** highlight the zero-gamma row and call/put-wall rows (the only strong highlights); on load, scroll/anchor the table to the nearest-spot row so the pin zone is visible first.
**Files:** `app/odte/strikes/page.tsx`.
**Verify:** wall/zero-gamma rows visually marked; page opens centered on spot.

### 2.3 Today count-group mismatches  [S]
**Root cause:** `computeCounts`/group logic disagree with `groupSignals` render — "PULLING BACK (1)" header with 0 rows; "TECH+FUND (3)" shows 2; strip "watch 1" vs ~8 rows.
**Fix:** derive counts from the exact same `groupSignals` output the table renders; drop any group whose body is empty; single source of truth shared with 1.3.
**Files:** `lib/groups.ts`, `lib/status.ts`, `app/page.tsx`, `components/today/SignalGroups.tsx`.
**Verify:** every count equals rendered rows; no empty group headers.

### 2.4 Ticker `action_card` 504 → misleading "API offline"  [M]
**Root cause:** a slow per-ticker ensemble call (SMR) times out at the proxy; the WHY panel then shows "Argus API offline — cd argus && ./run.sh api" though the API is up, with no retry.
**Fix:** auto-retry once on timeout before showing an error; cache last-good card per ticker; correct the message to "scoring timed out — retrying" vs a true offline state.
**Files:** the `/api/argus/action_card/[symbol]` proxy + the ticker WHY panel component.
**Verify:** a slow ticker recovers without the scary message.

### 2.5 Fundamentals show "IBKR offline" for liquid names  [M]
**Root cause:** NVDA shows "No fundamental data — IBKR offline" though the project uses yfinance for fundamentals independent of IBKR.
**Fix:** wire the fundamentals path to fall back to yfinance when IBKR is unavailable; only show the offline message for genuinely unavailable data.
**Files:** argus fundamentals fetch + the ticker fundamentals panel.
**Verify:** NVDA/AAPL show fundamentals with IBKR down.

---

## TIER 3 — NOT NEEDED / DEAD WEIGHT (remove or gate)

### 3.1 News rail everywhere + geopolitics noise  [M]
Collapse the rail by default on table-heavy pages (`/odte/strikes`, `/portfolio`, `/screener`); add a relevance filter so it isn't ~90% Iran/geopolitics on an equity screener. (Ties to 1.4.)
**Files:** rail components, `lib/news.ts` (filter/rank).

### 3.2 Macro shown 3× → keep one  [S]
Left-rail MACRO gauges duplicate the Brief tone line AND the `/macro` page. Keep the `/macro` page + brief line; drop the left-rail gauges (or make the rail gauges the only place and thin the brief). Decide one home.
**Files:** `components/rails/LeftRail.tsx` or `MacroGauges.tsx`.

### 3.3 Futures shown 2× → drop brief chips  [S]
Morning Brief futures chip row duplicates the left FUTURES rail. Remove the brief chips.
**Files:** `components/today/MorningReport.tsx`.

### 3.4 Earnings shown 2× → consolidate  [S]
Brief "Earnings" duplicates left-rail "What's next". Keep the Day-Ahead earnings block (with BMO/AMC, item 4.5); drop the rail duplication or vice-versa.
**Files:** `MorningReport.tsx` / `LeftRail.tsx`.

### 3.5 Index-underlying row — keep but label  [S]
Not truly dead: `companionSymbol` proxies SPX→SPY, NDX→QQQ, etc., so after 1.1/1.2 they show proxied ETF data. Keep the row but label proxied underlyings "(via SPY)" so it's honest; if proxying is unwanted, hide the index row instead.
**Files:** `app/odte/page.tsx`, `lib/odteCompanion.ts` (`isProxied`).

### 3.6 Empty flag (🚩) column  [S]
All "—" in the ALIGNED table. Hide the column until flags are populated.
**Files:** `components/today/SignalGroups.tsx`.

### 3.7 TradingView watermark on macro chart  [S]
Remove the decorative watermark from the plot.
**Files:** `components/macro/MacroChart.tsx`.

### 3.8 Watchlist day-of dead columns  [S]
"@flag/Now" are +0.0% for all day-0 picks. Hide or dash these when age 0.
**Files:** watchlist recent-picks table.

---

## TIER 4 — NEEDS EXPANDING

### 4.1 `/rotation` full RRG  [L]
Beyond 1.5's default-expand: build the RRG (relative-rotation graph) quadrant view + sector table the tab implies ("10/12 fading" needs a chart). Spec §5.
**Files:** new `components/rotation/*`, `app/rotation/page.tsx`.

### 4.2 Screener upgrades  [M]
Sortable column headers (score/RR/5d%); surface *why* an entered ticker was dropped (e.g. PLTR below min_score, with a note); make the whole row link to `/t/<ticker>`; add inline "pin to watchlist".
**Files:** `app/screener/page.tsx`.

### 4.3 Portfolio watchlist fallback  [M]
When the paper gateway is offline, fall back to the pinned watchlist instead of a dead Retry button.
**Files:** `app/portfolio/page.tsx`.

### 4.4 Health dot distinct treatment  [S] (folded into 1.3)
Distinct shape/label so system-health never reads as market-up/Live.

### 4.5 Earnings BMO/AMC + smart collapse  [S]
Show BMO/AMC tags; collapse the section when nothing is actionable today/tomorrow instead of listing next week's dates. (Backend `day_ahead` already computes sessions — surface them; the fallback list needs the same treatment.)
**Files:** `components/today/MorningReport.tsx`.

### 4.6 Sentiment staleness flag  [S]
`sent: stocktwits 11h` during PRE is stale for a morning read — flag visually when age exceeds a threshold before the open.
**Files:** `components/ContextStrip.tsx` (ties to 1.3), `lib/status.ts`.

---

## Sequencing
- **Tier 1** first (functional + the user-flagged strip): 1.1 → 1.2 → 1.3 → 1.4 → 1.5.
- **Tier 2** next (ODTE polish + ticker robustness).
- **Tier 3** dedup/cleanup (fast, mostly deletions).
- **Tier 4** expansions (RRG is the big one).
Each tier is independently shippable and merges `--no-ff` after green tests + a Playwright pass.
