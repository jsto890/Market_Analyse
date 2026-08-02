# Argus conformance — implementation plan

**Companion to:** `README.md` (tokens and rules) and `CONFORMANCE_GAP.md` (the 56 findings).
**This is the working document.** Work from it top to bottom.

Five packages. Each is independently shippable and leaves the app working.
Within a package, the task order is the dependency order.

| Package | Theme | Closes | Est. |
|---|---|---|---|
| **P0** | Baseline | — | ½ day |
| **P1** | The shared substrate | X-01…X-06 | ~3 days |
| **P2** | The ticker header | K-01…K-08 | ~4 days |
| **P3** | Today, band by band | T-01…T-18 | ~4 days |
| **P4** | The options group | O-01…O-06 | ~5 days |
| **P5** | Rails, Why, and the tail | R-01…R-08, K-09…K-13, O-07…O-11 | ~3 days |

**P1 is load-bearing.** It adds nothing user-visible and changes every page.
Every package after it assumes it. Skipping it means implementing each page
against the same inconsistent substrate the work exists to remove.

---

## P0 — Baseline capture (½ day)

Before changing anything, record what the app looks like now so regressions are
visible.

1. `cd dashboard && npx playwright test e2e/screens.spec.ts` — capture into
   `screens/baseline/`. Commit it.
2. Write a small audit script that walks every route and dumps, per route:
   distinct rendered `font-size` values, distinct content widths, the count of
   elements with a `[title]` attribute, and any `className`/`style` containing a
   `#rrggbb` literal. Save as `_audit.json`. Commit it.
3. Confirm the app runs: `npm run dev`, `http://localhost:3210`. The Argus API
   (`cd argus && ./run.sh api`) must be up for `/t/[ticker]` and `/options/*`.

**Acceptance:** a committed screenshot per route and an `_audit.json` you can
diff against later.

---

## P1 — The shared substrate (~3 days)

Nothing user-visible is *added*. Every page changes.

### 1.1 · Kill 11px as a content size — X-01

**Files:** `components/ticker/WhyPanel.tsx`, `components/rails/LeftRail.tsx`, plus a repo sweep.

- `grep -rn "text-micro" components/ app/` and triage every hit. Keep it only
  where the element is an eyebrow or a column header. Everything carrying a
  sentence or a figure becomes `text-body` (sans prose) or `text-data` (mono
  numerics).
- `WhyPanel` is the big one: `FamilyRow`'s label / net / count, `VoteRow`'s
  agent / direction / confidence / note, the `n_eff` chip value, the
  `VoteSection` headings. All of it is content.
- Do not change the `.eyebrow` utility or `RankText`.

**Acceptance:** `_audit.json` shows no rendered `font-size` below 11px, and no
element with more than three words rendering at 11px on any route.

### 1.2 · Fix the card surface ladder — X-02

**Files:** `components/today/SignalGroups.tsx`, `components/today/MorningReport.tsx`, then a sweep.

- Emphasised resting card = `bg-elevated border border-line-strong`.
- Quiet resting card = `bg-surface border border-line`.
- `bg-raised` is reserved for hover, inputs and the active segment. `grep -rn
  "bg-raised" components/ app/` and check every hit is one of those three.

**Acceptance:** no resting card renders on `--raised`.

### 1.3 · `Panel` gains a heading role — X-04

**File:** `components/ui/Panel.tsx`

```ts
heading?: "eyebrow" | "title";  // default "title"
```

- `"eyebrow"` renders the title through `.eyebrow` and drops the `count` chip's
  background (the count becomes plain 11px mono `--muted` inline).
- `subtitle` in eyebrow mode renders right-aligned at 11px mono `--muted`, not
  after the title.

**Acceptance:** `TodaysTape` and `SectorStrip` pass `heading="eyebrow"` and
render an 11px uppercase label with the detail on the right.

### 1.4 · `SegmentedControl` gains counts, then replaces four switchers — X-03

**File:** `components/ui/SegmentedControl.tsx`

- Add an optional `count` per option, rendered inline after the label at 11px
  mono — `--text-3` when the segment is active, inherit when not.
- Confirm the container matches the mock exactly: outer 1px `--line`, radius
  6px, `bg-surface`, `p-[3px]`, `gap-[2px]`; active segment radius 4px on
  `--raised`, 13px/600 `--text`; inactive 13px/500 `--muted`.

Then replace, in this order:

| Call site | Replaces |
|---|---|
| `today/SignalGroups.tsx` | the `border-b-2` tab row (T-11) |
| `ticker/TickerChartSection.tsx` | the hand-rolled period switch (K-11) |
| `app/macro/page.tsx` | the lookback control (O-07) |
| any remaining `Toggle` used as a two-state mode switch | — |

**Acceptance:** `grep -rn "border-b-2" components/ app/` returns only the nav.
One segmented-control implementation in the repo.

### 1.5 · Record the geometry ruling — X-05

**File:** `app/globals.css`

Add a comment above `--rail-l` / `--rail-r` stating: the mock draws 208/260;
the tokens hold 200/288 because the rails were re-measured against real content
in Phase 1; the content cap follows the mock at 1180. Closed, do not re-open.

### 1.6 · Remove the surfaces the mock does not have — X-06

**Files:** `components/NavActions.tsx`, `components/today/MorningReport.tsx`

- Move Reload behind ⌘K as a command, or keep it and note the deliberate
  divergence in `globals.css`'s comment block. Do not leave it undecided.
- Decide `/brief`: either give it a nav home or drop the "Full brief ›" link.

**Acceptance for P1:** run `e2e/screens.spec.ts`, diff against baseline. Every
route should differ only in type size, card surface and control chrome. No
layout should have moved.

---

## P2 — The ticker header (~4 days)

The widest single gap in the app, and the page a user reaches from every other
page.

> **Before starting:** get a decision on K-10 (the right column) — you do not
> need it for tasks 2.1–2.6, but you need it before you finish the page.

### 2.1 · Rebuild `Header` as a three-band card — K-01

**File:** `components/ticker/Header.tsx`

Replace the `flex-wrap` row with:

```
<section>                                  // rounded-lg border-line-strong bg-surface
  <div grid-cols-[1fr_320px_300px] gap-6 p-[18px_20px_16px]>
    <Identity/> <Price/> <Verdict/>
  </div>
  <div border-t border-line bg-elevated p-[10px_20px] flex items-center gap-2>
    <ActionBar/> <EarningsChip className="ml-auto"/>
  </div>
  <div grid-cols-3 border-t border-line>
    <TrackCol eyebrow="This call"/> <TrackCol eyebrow="Cohort"/> <TrackCol eyebrow="Read"/>
  </div>
</section>
```

Fixed zone widths — the current wrap-to-second-line behaviour on a laptop is
the defect, not a feature. Below 1100px the grid collapses to one column.

### 2.2 · Price zone — K-02, K-03

- Price → `text-display` (28px mono 500). Change % at `text-title`, absolute
  change at `text-data`, all on one baseline, `gap-2.5`.
- **Day-range bar:** 4px track, `bg-raised` under a
  `linear-gradient(90deg,#1a212c,#2c3648)`, radius 2; a 2px `bg-foreground`
  marker at `((mark - low) / (high - low)) * 100%`, `top:-3px h-2.5`; below it
  `low` / `day range` (in `--text-3`) / `high` at `text-micro` justified
  between.
- **Volume bar:** `Vol 48.2M · 0.78× ADV` at `text-label` mono `--muted`, then a
  40px × 4px track with a `--line-strong` fill at `min(volVsAdv, 1) * 100%`.
- Move the 52-week range out of the header (into `ChartInfoStrip`) or record it
  as a deliberate addition.
- Keep the `markBasis` `InfoTip` — it is a real improvement over the mock.

### 2.3 · Verdict zone — K-04

- Badge row unchanged (tier/verdict badge + `ConvictionDot` + HC gloss chip).
- Add `score 0.74 · agreement 81%` at `text-label` mono, score in `--model`,
  the rest `--muted`.
- Add `Model output, not a return forecast.` at `text-label text-muted` with
  `What HC means →` as a `Gloss`.
- Earnings moves out of this zone entirely (2.4).

### 2.4 · Action band — K-06, K-07

- `ActionBar` becomes its own band, not `ml-auto` in the zone row.
- Earnings chip right-aligned: `Earnings today · after close`. Session word
  comes from the catalysts payload (BMO/AMC), not a countdown. Amber chip.
- Delete `<CatalystStrip>` from `app/t/[ticker]/page.tsx`. Fold anything it
  carries that `CatalystsCard` does not into that card.

### 2.5 · Track-record band — K-05

Three equal columns, 1px `--line` dividers, `p-[12px_20px]`, each an
`.eyebrow` over two lines of `text-data`:

- **This call** — `7 May @ 287.51 → 333.43` in `--text-2`, then
  `+16.0% in 84 days` in `--green`/`--red`.
- **Cohort** — `median pick peaks +23%` in `--text-2`, then `at ~7 days` in
  `--text-3`.
- **Read** — `cohortRead()`'s sentence at `text-label text-2`, `text-wrap: pretty`.

The data and the copy already exist in `Header.tsx`; this is layout only.

### 2.6 · Levels onto the chart — K-08

**Files:** `components/charts/CandleChart.tsx`, `app/t/[ticker]/page.tsx`

- Draw entry / stop / target as `createPriceLine` on the series: target green
  dashed, entry accent dashed, stop red dashed, last price white solid with a
  `--raised` chip. Labels at the right edge, 11px mono, tinted background +
  border matching the line.
- Add the read-this line under the chart via `Panel`'s `readThis`.
- Delete `LevelsCard` from the right column.
- While in `CandleChart`: it carries a second undocumented palette. Fold it
  onto the tokens.

### 2.7 · Identity + chart chrome — K-11, K-12, K-13

- Company name to the symbol's baseline at `text-title text-3`.
- Meta line to **sans** `text-label text-muted`, `#2c3648` middots, market cap
  in mono, no "mkt cap" label, one tone for all three facts.
- Panel title "Price & signals" → "Chart"; period `SegmentedControl` into
  `Panel`'s `actions`; `ChartInfoStrip` below the chart, read-this at the foot.
- `CatalystsCard`: add the `Calendar →` header link; time column to 58px.

**Acceptance for P2:** at 1440px the header renders as three bands with no
wrapping; price is 28px; the range and volume bars are present; the track
record is three columns; `CatalystStrip` and `LevelsCard` no longer render.

---

## P3 — Today, band by band (~4 days)

Do the masthead first — least work, most visible.

### 3.1 · Brief masthead — T-01…T-05

**File:** `components/today/MorningReport.tsx`

- Remove the section's border, background and padding. It is a masthead.
- `<h2>Morning brief</h2>` → `.eyebrow`; date + `<Stale variant="line">` right
  at `text-label` mono `--muted`.
- Synthesis → `text-headline`, `text-wrap: pretty`, no card around it.
- Tiles: `bg-elevated border-line rounded-md p-[12px_14px]`, `grid-cols-3
  gap-3`. Eyebrow, then figures, then the read at `text-label`.
- Tape tile: drop `headline`; keep `tapeRead().read` as `detail`.
- Tile links: `gamma →` at `text-micro text-accent`, top-right.
- News chips: `flex flex-wrap gap-2`, each a chip at `max-w-[340px]`,
  `p-[6px_10px]`, radius 5, `bg-surface border-line`; mono accent ticker,
  truncated `--text-2` headline, mono `--muted` `+N`.
- Resolve the "Full brief ›" link per X-06.

### 3.2 · Today's tape — T-06…T-10

**File:** `components/today/TodaysTape.tsx`

- `heading="eyebrow"`, subtitle `all times ET` right.
- Rebuild the axis: one 24px rounded track on `--elevated`; three absolutely
  positioned session segments from `TAPE_SESSIONS` / `tapeFraction`; regular on
  `--raised` between two `--line-strong` edges; labels inline at 10–11px mono
  600, `--muted-2` for pre/after and `--muted` for regular, `left: calc(x% + 8px)`.
- `now`: its own 22px lane above the axis, filled accent pill
  (`bg-accent text-bg rounded-[3px] px-1.5 py-0.5`), plus a 2px accent stripe
  through the axis at the same fraction.
- Earnings marks → amber chips (`border-warn/50 bg-warn/10 text-warn`, radius 4,
  11px mono 600) with a 20px amber connector to the axis.
- Release marks → 1px vertical connector from the axis down to the lane, an 8px
  horizontal tick, then the label. `assignLanes` already gives the lane; the
  connector height is `lane * LANE_H + offset`.
- Leave actual-vs-consensus out until the feed carries it (T-09 / O-11).
- Total band height 150px when populated.

### 3.3 · Signals — T-11…T-16

**File:** `components/today/SignalGroups.tsx`

- Tabs → `SegmentedControl` with counts (P1 1.4). Keep the tab semantics.
- Toolbar onto the same row, `ml-auto`, unboxed. Three controls: search,
  conviction (with "High conviction only" as a fourth option, replacing the HC
  toggle), sector. Clear renders only when a filter is active.
- One caveat line above the cards: `{meta.rationale} {CAVEAT_LINE}` at
  `text-label text-muted`. Remove the `<ReadThis>` at the foot. This is the
  documented exception to the read-this-at-the-foot rule.
- `SignalCard`:
  - `bg-elevated border-line-strong rounded-lg p-3.5 gap-[11px]`
  - ticker `text-headline font-mono text-foreground`, sector `text-label
    text-muted` beneath
  - right stack: tier badge, then `0.78 score` at `text-label` mono `--model`
  - legs row: 3 bars (7px wide, ≤16px tall, 3px gap) + `sent · tech · fund` at
    `text-micro` + 1D right-aligned
  - reason line at `text-label text-2` — **derive one sentence from the leg
    values or omit the row**; do not fill it with catalyst text
  - E/S/T + R:R row with `border-t border-line pt-2.5`, R:R right-aligned
  - `<ActionBar fill>` — already correct
- Table: `Signal` cell → bare `text-label text-model` text, not `<Badge>`.

### 3.4 · Sector strip — T-17, T-18

**File:** `components/today/SectorStrip.tsx`

- Fixed `grid-cols-11 gap-1`; each cell radius 4, `p-[7px_4px]`, centred, ETF
  ticker over value, both `text-micro`, `heatBg` tint retained.
- Industry name via Radix tooltip, not a second line.
- One link around the band, or per-cell deep links. Not both.
- `heading="eyebrow"`, `Full RRG →` at `text-label text-accent`.

**Acceptance for P3:** Today renders four bands — masthead (no box), tape
(150px, filled axis), signals (segmented tabs, one caveat line, three cards),
sector strip (one row of eleven). Diff against P2's capture.

---

## P4 — The options group (~5 days)

**Task zero:** confirm what `/api/odte/unusual` returns. If it has no open
interest and no side, O-03 becomes a backend ticket and P4 proceeds without it.

### 4.1 · Overview `3a` — O-05

**File:** `app/options/page.tsx`

- `SymbolSwitcher` into `Page.Header`'s `actions` as a `SegmentedControl`:
  SPY / QQQ / IWM / DIA / SPX, persisted to the existing `odte-symbol` key.
- Session-read hero above the cards: one sentence at `text-headline`; an
  agreement count as four segments (count the four `Verdict`s you already
  derive — `deriveLevels`, `deriveFlow`, `deriveShape`, spot); a paragraph
  naming the dissenting input.
- Expected-move box: the band with put wall, zero-γ, spot and call wall marked.
- Keep the four `VerdictCard`s as they are.
- Confirm `StrikeGuidance` is the "If you're trading this" block; if it is, give
  it the read-this strip stating the candidates are not recommendations and
  that none survive a break of the flip.

### 4.2 · Gamma `2c` — O-01, O-02

**File:** `app/options/gamma/page.tsx`

- Regime hero: verdict word at 26px in `--teal`/`--put`, sub-line beneath; a
  spot-vs-flip scale (red→teal gradient) with zero-γ and spot markers and
  `SHORT GAMMA · moves extend` / `LONG GAMMA · moves pin` end labels; net GEX
  figure and a pin-risk bar. Source: `deriveLevels()`.
- GEX profile: 15 strike rows, horizontal bars off a centred axis, **calibrated
  to the printed scale** (bar % = value/max × 50 where max is the printed ±N),
  positive teal right and negative magenta left; ATM/ZG/CW/PW rows tinted.
- Levels card: every level carries a sentence saying what it does. Not a tooltip.
- Net GEX by expiry: four centred bars.
- Scenario card (amber): what happens if spot breaks the flip, written before it
  happens. **Cheapest, highest value — do it first.**

### 4.3 · Flow `2d` — O-03

**File:** `app/options/flow/page.tsx`

- Three ratio tiles (P/C volume, P/C OI, unusual count), each with a gauge and
  one sentence interpreting it.
- Unusual prints table on tracks `62px 132px 70px 78px 92px 82px 1fr`:
  time · contract · size · premium · **vs OI** · **aggressor** · plain-English
  read.
- Volume vs OI by strike — five bars showing where the book is being built.
- Flow-tilt summary card.

### 4.4 · Greeks `2e` — O-04

**File:** `app/options/greeks/page.tsx`

- Per-strike table mirrored like the ladder: `1fr×4 | 96px | 1fr×4`, column
  order `Vega · Θ · Γ · Δ | Strike | Δ · Γ · Θ · Vega`, calls right-aligned,
  puts left.
- Skew scatter with an ATM marker, puts magenta and calls teal — lift from
  `components/odte/SkewCard.tsx`.
- Term structure: four bars, the payrolls expiry highlighted amber.
- Keep the four aggregate cards; they read well.

### 4.5 · Ladder `2a` — O-06

**File:** `app/options/ladder/page.tsx`

**Verify, do not rebuild.** Open the mock at 1440px beside `localhost` and
check three things only: the mirrored column order (`GEX IV OI Vol Ask Bid |
Strike | Bid Ask Vol OI IV GEX`), the OI/Vol bar fills anchoring **toward** the
strike, and whether `Jump to strike…` and `Centre on spot` exist at the right of
the control bar. Fix only what fails.

---

## P5 — Rails, Why, and the tail (~3 days)

### 5.1 · Rails — R-01…R-08

**Files:** `components/rails/*`

- `EquityBadge` → green open / muted pre-after / amber closed (R-01).
- `FxChip` → drop the `FX ·` prefix; teal overlap, muted single, amber closed (R-02).
- `EconCalendar` → `/calendar` link into the header (replacing "impact");
  collapse day and time into one right-hand slot (R-03).
- `RightRail` `NewsRow` → absolute ET time and a spelled-out source; `relTime`
  moves to the tooltip (R-04). Add the amber earnings chip (R-05).
- `groupByHour` → render ranges, newest labelled "— now" (R-06).
- `QuoteRow` → 42 / flex / 54 tracks, forex 56 / flex / 52 (R-07).
- `MacroGauges` → verify green/red and the `1d ›` link (R-08).

### 5.2 · The Why panel — K-09

**File:** `components/ticker/WhyPanel.tsx`

> **Product decision required before building.**

Recommended shape: three leg rows lead — 44px eyebrow (`SENT`/`TECH`/`FUND`),
three bars at 6px wide, and a plain-English sentence naming the evidence, with
the leg colour green or amber. A read-this foot explains that two green and one
amber is what "Standard long, not high conviction" looks like. Everything the
panel renders today moves behind a `How the ensemble voted` disclosure below
it — it is diagnostics, not the answer.

The evidence sentences need a source. `mentions` / `accounts` / the 20-day
ratio are on the bridge row; the technical sentence can come off the action
card's family votes. If a leg has no evidence, render the bar and the label and
**nothing else** — do not invent a sentence.

### 5.3 · Ticker right column — K-10

> **Product decision required.**

Once decided: survivors move to a second full-width band below the fold rather
than one seven-panel column. Update `SectionRail` to match.

### 5.4 · The tail — O-07, O-08, O-09, O-10

- **Macro:** unwrap the methodology panel from `Collapsible`; lookback reads
  "1 hour / 1 day / 1 week"; benchmark series follows the selected window (drop
  the hard-coded `period=1mo&interval=1d`); stop the silent `scope → "global"`
  reset when the selected scope has no data in the new window (O-07).
- **Portfolio:** six-slot summary band — NLV, day P&L, unrealised, cash,
  exposure, top-sector concentration. Missing slots render **nothing** (O-08).
- **Watchlist / Screener:** card surface ladder and the emphasised-lead
  treatment (O-09).
- **Rotation:** verify in-chart quadrant labels with a gloss each, and dots
  labelled with sector names plus a name → ETF legend (O-10).

---

## Definition of done

Per package:

1. `npx tsc --noEmit` clean.
2. `npx playwright test e2e/screens.spec.ts` — diff against the previous
   capture, not against the mock. Every difference should be one you intended.
3. `_audit.json` re-run: no rendered size below 11px; no more than three
   distinct content widths; zero `[title]` attributes; zero hex literals in
   `className`/`style`.
4. Open the mock screen beside `localhost:3210` at 1440px and read top to
   bottom. Write down every remaining divergence **before** fixing any of it —
   fixing as you read is how the last pass missed the systemic ones.

## Never do

- Port the mock's figures, `href="#1a"` links, 1440px frame, drop shadow,
  `<sc-if>` tags, or notes columns.
- Write a hex literal into a component.
- Use `text-xs` / `text-sm` / `text-base` / `text-lg`.
- Add `"use client"` to a file just because it came out of the mock.
- Render a dash, a placeholder or "TBA" where there is no feed. Render nothing.
- Colour model output green or red.
- Use `--accent` for anything that is not interactive.
