# Argus — mock conformance gap

**Method:** source-level review. Every finding names the file it lives in.
**Reviewed:** 1 Aug 2026, against `mocks/Argus Overhaul - Today + Ticker.dc.html` (ids `1a`–`4d`).
**Count:** 56 deltas — 17 STRUCT · 21 DRIFT · 18 POLISH.

Severity key: **STRUCT** = the mock's design is not there, it needs building ·
**DRIFT** = built, but rendered wrong · **POLISH** = one attribute out.

## Scorecard

| Id | Route | State | What is still missing |
|---|---|---|---|
| `1a` | `/` | PARTIAL | Brief is a card not a masthead · tape axis is a hairline not a bar · tabs aren't the segmented control · signal cards on the wrong surface |
| `1b` | `/t/[ticker]` | **SHELL** | Header is not the three-zone card · price at 15px not 28px · no range/volume bars · track record is three text lines · levels still a card beside the chart · Why panel is a different component entirely |
| `2a` | `/options/ladder` | CLOSE | Verify mirrored track widths, bar-fill anchoring, Jump-to-strike / Centre-on-spot |
| `2b` | `/calendar` | CLOSE | actual/consensus/prior ruled out of v1 — no feed |
| `2c` | `/options/gamma` | **SHELL** | No regime hero, spot-vs-flip scale, calibrated ±400 profile, scenario card |
| `2d` | `/options/flow` | **SHELL** | No ratio gauges, vs-OI or aggressor columns, read column, volume-vs-OI bars, tilt card |
| `2e` | `/options/greeks` | PARTIAL | Four aggregate cards ✓. Per-strike table not mirrored; no skew scatter, no term structure |
| `3a` | `/options` | PARTIAL | Four evidence cards ✓. No symbol switcher, session-read hero, agreement segments, expected-move box |
| `3b` | `/rotation` | PARTIAL | Trails ✓. Verify in-chart quadrant labels and name-not-ticker dot labels |
| `3c` | `/macro` | PARTIAL | Methodology is a `Collapsible` — the mock has it permanent |
| `4a` | `/watchlist` | CLOSE | Card surface tone only |
| `4b` | `/screener` | CLOSE | Verify the remainder table's eight tracks |
| `4c` | `/portfolio` | PARTIAL | Disagreement band ✓. Summary is three chips, not six numbers |
| `4d` | `/alerts` | CLOSE | Verify line-height and control sizing vs 14px / 2.1 |

---

# A · Drift that crosses every screen

Fix first. Each is one edit that removes the same defect from six or eight
pages, and every screen-level fix below assumes them.

### X-01 · STRUCT · 11px is still a content size in three places
**Mock/spec:** micro is eyebrows and column headers only. Sentences and figures are 13px.
**Now:** `components/ticker/WhyPanel.tsx` renders its entire body at `text-micro` — family rows, agent votes, notes, chips. Same in `LeftRail`'s collapsed glyph labels.
**Fix:** Sweep `text-micro` call sites. Anything carrying a sentence or a number becomes `text-body` / `text-data`.

### X-02 · DRIFT · Cards sit one step too dark
**Mock:** card = `#12171f` (`--elevated`) fill on a `#2c3648` (`--line-strong`) border. `--raised` is for hover, inputs and the active segment — never a resting card.
**Now:** `today/SignalGroups.tsx` `SignalCard` and `today/MorningReport.tsx` `Tile` both use `bg-raised` + `border-line`. On screen the cards recede into the page instead of lifting off it.
**Fix:** `bg-elevated border-line-strong` for emphasised cards, `bg-surface border-line` for quiet ones.

### X-03 · DRIFT · `SegmentedControl` is built and used twice
**Mock:** one segmented control for Today's groups, the ticker chart period, the macro lookback, the calendar horizon, ladder mode and density.
**Now:** only `/calendar` and `/options/ladder` import it. Today's groups are hand-rolled `border-b-2` underline tabs; the chart period switch is its own thing again.
**Fix:** Add an optional inline count to `SegmentedControl` (11px mono, `--text-3` when active, inherit when not), then replace the four hand-rolled switchers.

### X-04 · DRIFT · `Panel`'s 15px title is used where the mock uses an eyebrow
**Mock:** a 15px title appears only on the ticker page's body cards. Every band on Today is introduced by an 11px mono eyebrow with the detail to its right.
**Now:** `TodaysTape` and `SectorStrip` both render through `Panel`, so they shout at the same volume as the signals band.
**Fix:** Give `Panel` a `heading?: "eyebrow" | "title"` prop (default `"title"`), set the Today bands to `"eyebrow"`.

### X-05 · POLISH · Three geometry values were never reconciled
**Mock:** left rail 208px, right rail 260px, content cap 1180px.
**Now:** `--rail-l` 200px, `--rail-r` 288px, `--w-wide` 1180px ✓. The 28px right-rail difference is the visible one.
**Fix:** Ruled already — tokens win on rails, mock wins on the cap. Record it in `globals.css` as a comment so the next pass does not re-open it.

### X-06 · POLISH · Surfaces the mock does not have
**Mock:** the nav's right cluster is exactly Learn · session clock · ⌘K.
**Now:** `NavActions.tsx` adds a Reload button; `MorningReport.tsx` ends with a "Full brief ›" link to a `/brief` route that appears in no screen.
**Fix:** Keep Reload if the Tauri shell needs it, but move it behind ⌘K. Decide whether `/brief` stays; if it does it needs a place in the design.

---

# B · Screen `1a` — Today

`app/page.tsx`, `components/today/*`

## Band 1 — brief masthead

### T-01 · STRUCT · The brief is a card, not a masthead
**Mock:** no border, no fill. Eyebrow `MORNING BRIEF` left, `Friday 31 Jul · as of 09:42 ET` at 12px mono right, then the synthesis as a 20px heading with nothing around it.
**Now:** `today/MorningReport.tsx` wraps everything in `rounded-md border border-line bg-elevated p-4` and titles it with a 15px "Morning brief" h2 — the page opens with a box rather than a sentence.
**Fix:** Strip the section chrome. h2 → `.eyebrow`; synthesis → `text-headline`; date + `<Stale variant="line">` to the right at `text-label` mono.

### T-02 · DRIFT · Tile surface and padding
**Mock:** `#12171f` on `#1e2634`, radius 6, padding 12px 14px, three equal columns, 12px gap.
**Now:** `bg-raised px-3 py-2.5` — one surface too dark, and the padding lands off-scale on the 14px rem root (10.5px / 8.75px).
**Fix:** `bg-elevated border-line rounded-md p-[12px_14px]`, `grid-cols-3 gap-3`.

### T-03 · DRIFT · Tape tile carries a verdict the mock doesn't give it
**Mock:** Tape reads eyebrow → three figures → one read line. Only Positioning and Tone lead with a 15px verdict word; that asymmetry is what makes the two links look like conclusions.
**Now:** `tapeRead()` synthesises "risk-on" / "risk-off" / "mixed" / "flat" and passes it as `headline`, so all three tiles shout equally.
**Fix:** Keep the derived read as the `detail` sentence; drop `headline` on the Tape tile only.

### T-04 · POLISH · Tile link is the wrong glyph, size and colour
**Mock:** `gamma →` at 11px accent, top-right of the tile.
**Now:** `gamma ›` at `text-body text-muted`.
**Fix:** One arrow convention across the app — `→` for a link out of a tile, `›` for "more of this list".

### T-05 · STRUCT · News chips are a stacked list
**Mock:** a wrapping row of bordered chips, each `max-width:340px`, `padding:6px 10px`, radius 5, `#0c1017` on `#1e2634`: mono ticker in accent at 12px/600, headline truncated in `--text-2` at 12px, a mono `+2` in `--muted` when the name has more. Three fit on one line under the tiles.
**Now:** full-width stacked `<Link>`s with a `w-12` ticker gutter — five rows of vertical space where the mock spends one.
**Fix:** `flex flex-wrap gap-2`, chips at `max-w-[340px]`, `truncate` on the headline. The de-dupe by ticker (`groupNewsByTicker`) is already correct.

## Band 2 — today's tape

### T-06 · STRUCT · The session axis is a hairline, not a bar
**Mock:** a 24px filled bar, radius 4, `#12171f`, with the regular session lifted to `#1a212c` between two `#2c3648` edges, and `PRE · 04:00` / `REGULAR · 09:30` / `AFTER · 16:00` set inside it at 10px/600 (`--muted-2` for pre/after, `--muted` for regular). Whole band is 150px.
**Now:** `today/TodaysTape.tsx` draws a 20px zone (`h-5`) with `border-l` dividers and no fill except a raised tint on regular. It reads as ruled space, not as a trading day.
**Fix:** Rebuild the axis as one rounded track with three absolutely-positioned segments and inline labels. Session fractions come from `lib/tape.ts` `TAPE_SESSIONS` / `tapeFraction` — that maths is correct, keep it.

### T-07 · DRIFT · The now marker has no lane of its own
**Mock:** a filled accent pill reading `now 09:42` on its own row above the bar (`top:22px`), plus a 2px accent stripe cutting the bar itself. It never shares a row with an event label.
**Now:** a 1px accent `border-l` with the text beside it, in the same band as the session labels — so between 09:30 and 10:00 the marker and the REGULAR label collide.
**Fix:** Give `now` its own 22px lane above the axis and render it as a filled pill (`bg-accent text-bg`, radius 3, 10–11px mono 600). Keep the 2px stripe on the bar.

### T-08 · DRIFT · Earnings above the line are chips, not text
**Mock:** amber-bordered chips on an amber tint — `16:20 · AAPL AMC` — with a 20px amber connector dropping to the bar.
**Now:** plain text with a `border-l` tick; amber only appears on high-importance items and never as a fill.
**Fix:** Earnings marks get the chip treatment (`border-warn/50 bg-warn/10 text-warn`, radius 4, 11px mono 600); releases keep the text treatment. The two categories should not look alike.

### T-09 · STRUCT · Release rows have no connector and no result
**Mock:** each release drops a 1px vertical connector from the bar to its lane, meets an 8px horizontal tick, then the label — and the label carries the print: `08:30 · Chicago PMI 51.2 vs 49.8 est` (actual in `--green`, "vs … est" in `--muted-2`).
**Now:** labels are lane-assigned correctly (`assignLanes` — the hard part is done) but float free of the axis, and carry only time + name. The tape cannot tell you a number already came in.
**Fix:** Add the connector + tick. Actual-vs-consensus needs the calendar feed to carry it — same data ask as O-11, worth doing once for both. **Do not fake it.**

### T-10 · POLISH · Band heading
**Mock:** eyebrow `TODAY'S TAPE` left, `all times ET` at 11px mono right, inside a plain bordered box.
**Now:** a `Panel` with a 15px title and a 13px subtitle.
**Fix:** Falls out of X-04's `heading="eyebrow"`.

## Band 3 — signals

### T-11 · STRUCT · Group tabs are underline tabs, not a segmented control
**Mock:** one bordered pill on `#0c1017` with 3px inner padding and 2px gaps; the active segment is a `#1a212c` block at radius 4, 13px/600 `--text`; inactive 13px/500 `--muted`; counts inline at 11px mono.
**Now:** `today/SignalGroups.tsx` uses `border-b-2` tab buttons inside the panel — a second navigation idiom 40px under the real nav's underline.
**Fix:** Swap to `SegmentedControl` with counts (X-03). Keep the `role="tablist"` / `aria-controls` wiring.

### T-12 · DRIFT · The filter toolbar is its own bar
**Mock:** Search, conviction and sector sit on the **same row as the tabs**, pushed right with `margin-left:auto`, unboxed. Three controls, no more. Each is `#1a212c` on `#1e2634`, radius 5, `padding:5px 9px`, 12px `--muted`.
**Now:** a separate bordered `bg-elevated` bar above the panel carrying five controls — the extra "HC only" toggle with its `InfoTip`, plus a Clear button.
**Fix:** Move the controls onto the tab row and unbox them. HC-only folds into the conviction `Select` as a fourth option ("High conviction only"). Keep Clear, but as a text button that only renders when a filter is active.

### T-13 · DRIFT · The caveat is split in two and lands at the bottom
**Mock:** one 12px `--muted` line directly under the toolbar and above the cards: the group's rationale, then the caveat, in the same sentence run. You read it before you read a score.
**Now:** the rationale prints at the top of the tab panel; `CAVEAT_LINE` prints through `ReadThis` at the foot of the section, below the table. Printing it once was the fix — placement is the remainder.
**Fix:** Join them into one line above the cards. This is the documented exception to the read-this-at-the-foot rule.

### T-14 · STRUCT · Signal card hierarchy is inverted
**Mock:** ticker at 19px mono in `--text` (not accent) with the sector at 12px `--muted` beneath it; the tier badge and `0.78 score` stack right-aligned at 11–12px. The card's largest thing is the name.
**Now:** ticker is a 15px accent link inline with the sector; the score is `text-headline` (20px) in a separate wrap row. The card's largest thing is a number the caveat line says not to read as one.
**Fix:** Ticker → `text-headline font-mono text-foreground`, sector under it at `text-label text-muted`, badge + score stacked right at `text-label`/`text-micro`. The whole card stays a link.

### T-15 · DRIFT · Card body: five rows, in order
**Mock:** legs row (3 bars, 7px wide × up to 16px tall, 3px gap + `sent · tech · fund` at 11px + 1D right-aligned) → a one-line reason at 12px `--text-2` → an E/S/T + R:R row above a 1px `--line` rule, R:R right-aligned → the verb row.
**Now:** score, legs, return and flags all share one wrapping row; the E/S/T row has no rule above it; the reason line is catalyst text or nothing.
**Fix:** Split the rows and add the rule. **The reason line has no feed behind it** — either derive one sentence from the leg values (e.g. "Third session in Aligned. Trend, chatter and the catalyst all pulling the same way.") or leave the row out. Do not fill it with catalysts.

### T-16 · POLISH · Table "Signal" cell is a badge
**Mock:** plain text — `Standard long` — at 12px in `--model`. In a 30-row table a badge per row is 30 boxes.
**Now:** `<Badge variant="tier">` in every row of `columnsFor()`.
**Fix:** Badges on cards, bare model-coloured text in tables. Column tracks otherwise match the mock exactly (`88px 128px 110px 1fr 80px 80px`).

## Band 4 — rotation

### T-17 · DRIFT · Eleven cells in one row, keyed by ETF
**Mock:** a single `repeat(11,1fr)` row, 4px gaps, each cell an ETF ticker over its value on a heat fill, radius 4, `padding:7px 4px`, centred, both lines 11px mono.
**Now:** `today/SectorStrip.tsx` wraps to 3/4/6 columns with two-line industry names and a quadrant dot — two or three rows of blocks, not a strip.
**Fix:** Fixed 11-column grid, ETF ticker as the label, industry name via Radix tooltip. Keep the quadrant dot and the `heatBg` tint.

### T-18 · POLISH · The whole strip is one link
**Mock:** the band is a single anchor to `/rotation` with an eyebrow and `Full RRG →`.
**Now:** the header uses a 15px title plus a summary sentence, and each cell is its own link to the same destination — twelve tab stops for one navigation.
**Fix:** One link around the band, or per-cell links that deep-link to that sector (`/rotation?sector=…`). Not both.

---

# C · Screen `1b` — Ticker

`app/t/[ticker]/page.tsx`, `components/ticker/*`

The pieces exist — `TickerNav`, `SectionRail`, `ActionBar`, `cohortRead()`, the
HC gloss, the single earnings source. What did not happen is the header's
**reconstruction**.

### K-01 · STRUCT · The header is three bands, not one row
**Mock:** one card on `#0c1017` with a `#2c3648` border, holding: a `1fr 320px 300px` zone grid (`gap:24px; padding:18px 20px 16px`) → a 1px rule → the action row on `#12171f` (`padding:10px 20px`) → a 1px rule → the three-column track record. Fixed zones, so the layout never reflows on a longer company name.
**Now:** `ticker/Header.tsx` is a `flex-wrap` row with `border-l` dividers, the `ActionBar` pushed right inside the same row, and the track record as three text lines below it. The file's own comment admits the verdict zone wraps to a second line on a laptop.
**Fix:** Rebuild as the three-band card. This one change carries K-02 → K-06 with it.

### K-02 · STRUCT · The price is 15px on a page about the price
**Mock:** last at `display` — 28px mono weight 500, the same size as the symbol — then change % at 15px and the absolute change at 13px, all on one baseline (`gap:10px`).
**Now:** `text-title` (15px) with change % at 13px and no absolute change. The symbol is 28px and the price is half that.
**Fix:** Price → `text-display`; add the absolute move. Keep the `markBasis` InfoTip — it is a real improvement over the mock.

### K-03 · STRUCT · No day-range bar, no volume bar
**Mock:** a 4px track (`#1a212c` under a `linear-gradient(90deg,#1a212c,#2c3648)`), a 2px `--text` marker at the day's position (`top:-3px; height:10px`), then low / `day range` / high at 11px mono under it. Then `Vol 48.2M · 0.78× ADV` at 12px mono with a 40px × 4px proportional bar.
**Now:** both are text: `day 331.02–338.90` and `vol 48.2M (0.8× ADV)`. A 52-week range with a percent-of-range figure is also there — the mock's price zone has no 52-week line at all.
**Fix:** Add both bars. Move 52-week out of the header (it belongs in the chart info), or accept it as a deliberate addition and note it.

### K-04 · DRIFT · The verdict zone is missing its two lines
**Mock:** under the badge row — `score 0.74 · agreement 81%` (score in `--model`, the rest `--muted`, 12px mono), then `Model output, not a return forecast.` at 12px `--muted` with `What HC means →` as a dotted gloss.
**Now:** neither line exists in the header. The HC gloss is on the chip ✓, but score and agreement only appear much further down, inside `WhyPanel`'s title actions.
**Fix:** Lift score + agreement into the verdict zone (they come off `bridgeRow` / the action card); add the one-line disclaimer with the gloss.

### K-05 · STRUCT · Track record is three lines, not three columns
**Mock:** an equal three-column grid with 1px `--line` dividers and a top rule, each column `padding:12px 20px`: `THIS CALL` (eyebrow) → `7 May @ 287.51 → 333.43` → `+16.0% in 84 days` / `COHORT` → `median pick peaks +23%` → `at ~7 days` / `READ` → the comparison in prose at 12px `--text-2`.
**Now:** three stacked `<p>`s with 78px inline `text-micro` labels. The content is right — `cohortRead()` writes the comparison properly — but it reads as a footnote instead of a band.
**Fix:** Same data, three columns, dividers, eyebrow headings.

### K-06 · DRIFT · The action row is not a row
**Mock:** its own band on `#12171f` above a rule: five verbs left (`★ Pinned` filled accent, then Set alert / Options ladder / Compare / Copy at 12px `--text-3` on `--line`), and the earnings chip right-aligned reading `Earnings today · after close` — the session, not a countdown.
**Now:** `ActionBar` floats at `ml-auto` in the zone row, so on a narrow window it wraps under the verdict. Earnings prints inside the verdict zone as "earnings today · 31 Jul".
**Fix:** Break the action bar out as its own band; move the earnings chip to its right end and give it the session word (`catalysts.next_earnings` + BMO/AMC).

### K-07 · DRIFT · `CatalystStrip` should not survive the header
**Mock:** no strip under the header. Its one fact — the next earnings — is the action row's chip, and the rest lives in the Catalysts card.
**Now:** still rendered inside the header `<section>` in `app/t/[ticker]/page.tsx`. The double-earnings contradiction was fixed at the data layer (one SWR key, one basis) but the second surface is still on screen.
**Fix:** Delete it; fold anything it carries that `CatalystsCard` does not into that card.

### K-08 · STRUCT · Levels belong on the chart
**Mock:** entry, stop and target drawn as dashed price lines with right-edge labels — `T 352.00` (green dashed), `333.43` (white solid, `#1a212c` chip), `E 287.51` (accent dashed), `S 271.00` (red dashed) — and a read-this line under the chart saying they are indicative and mark where the thesis was formed, not where an order sits.
**Now:** `LevelsCard` still renders as the first card in the right column, listing the same three numbers beside the chart that should be carrying them.
**Fix:** Draw the price lines in `charts/CandleChart.tsx` (lightweight-charts `createPriceLine`), retire the card. Note `CandleChart` carries a second undocumented palette — fold it onto the tokens while you are in there.

### K-09 · STRUCT · "Why this is flagged" is a different component
**Mock:** three rows. Each is a 44px eyebrow (`SENT` / `TECH` / `FUND`), three bars (6px wide, up to 14px tall), and a plain-English sentence naming the evidence — "142 mentions across 38 accounts, up 2.1× on the 20-day" / "Above the 20-, 50- and 200-day; RSI 61 with room." / "Weakest leg — earnings tonight is the catalyst and the risk." Bars take `--green` or `--amber` per leg. A read-this foot explains that two green and one amber is what "Standard long, not high conviction" looks like.
**Now:** `ticker/WhyPanel.tsx` is 424 lines of ensemble telemetry — a combo string, per-family vote bars with leave-one-out attribution, n_eff / regime / ADX chips, and a 70-agent vote accordion — all at 11px. It is the densest surface in the product and the mock replaced it with three sentences.
**Fix:** Lead with the three-leg summary. Keep the ensemble detail behind a "How the ensemble voted" disclosure below it — it is diagnostics, not the answer. **Product decision — confirm before building.**

### K-10 · DRIFT · Right column is seven panels; the mock has two
**Mock:** Why this is flagged, then Catalysts. That is the column.
**Now:** Levels → Why → Catalysts → News → Sentiment → History → AI. Five are below the fold on a 1440×900 window, and the icon rail is the only thing that admits they exist.
**Fix:** The mock is a design for the top of the page, not a deletion order. Decide explicitly which of News / Sentiment / History / AI stay, and give the survivors a second full-width band below the fold rather than one long column. **Product decision — confirm before building.**

### K-11 · DRIFT · Chart card title and period control
**Mock:** titled `Chart`, with a four-way `1D / 1M / 6M / 2Y` segmented control in the card header (11px mono, active on `#1a212c` radius 3) and a read-this line at the foot.
**Now:** titled "Price & signals"; the period switch is inside `TickerChartSection` in its own idiom, and `ChartInfoStrip` sits under the chart where the read-this line goes.
**Fix:** Rename to "Chart", move the period control into `Panel`'s `actions` slot as a `SegmentedControl`, and let `Panel`'s `readThis` own the foot.

### K-12 · POLISH · Identity zone typography
**Mock:** company name at 15px `--text-3` on the symbol's baseline (`gap:12px`); sector · industry · market cap on a second line at 12px **sans** `--muted` with `#2c3648` middots, cap in mono.
**Now:** all of it on one 13px mono line below the symbol, with a "mkt cap" label the mock drops. Industry is dimmed to `--muted-2`.
**Fix:** Name up to the symbol's baseline; the meta line to sans; drop the label; one tone for all three facts.

### K-13 · POLISH · Catalysts card header
**Mock:** carries a `Calendar →` link, and each row is a 58px time slot (`Tonight` in `--amber` / `23 Jul` in `--muted`) against a sentence at 12px `--text-2`.
**Now:** verify `ticker/CatalystsCard.tsx` — the cross-link to `/calendar` is the part most likely missing, since the calendar route arrived after this card.
**Fix:** Add the link; align the time column to 58px.

---

# D · Shell and rails

`components/Nav*.tsx`, `components/rails/*`, `components/ContextStrip.tsx`

The frame is the best-converted part of the app. Nav grouping, the 36px
collapse strips, the non-scrolling rail footer, hour-grouped news, `RankText`
in What's Next, the single market clock — all shipped. What is left is tone.

### R-01 · DRIFT · The US Equity badge is the wrong colour
**Mock:** `OPEN` in `--green` on `rgba(63,185,80,0.12)`, radius 3, 10px/600. Open is a state, and green is what state reads as everywhere else in the rail.
**Now:** `LeftRail.tsx` `EquityBadge` renders four accent-tinted variants (pre / regular / after / closed) so the open market is blue — the same blue as every link on the page. Violates the "accent is interactive only" rule.
**Fix:** Green for open, muted for pre/after, amber for closed.

### R-02 · POLISH · The FX chip
**Mock:** `LDN/NY` in `--teal` on `rgba(45,212,191,0.12)` — the session names only.
**Now:** `FX · LDN·NY` in muted on elevated. The "FX ·" prefix repeats the block header two words away.
**Fix:** Drop the prefix; teal for an overlap, muted for a single session, amber for closed.

### R-03 · DRIFT · What's Next header and row shape
**Mock:** header carries a `calendar ›` accent link on the right. Rows are rank → name → time, with the day taking the time slot for anything not today (`Thu`, `Fri`), and today's row on `rgba(76,141,255,0.06)`.
**Now:** `rails/EconCalendar.tsx`'s right slot says "impact" — a column label for a column that is not there. Rows carry rank → day → name → time, so a Friday event prints both "Fri" and "08:30" in a 200px rail.
**Fix:** Move the `/calendar` link into the header; collapse day and time into one right-hand slot. Keep the `+N more` count on the footer link.

### R-04 · POLISH · News rows print the clock, not the age
**Mock:** `09:31 · Reuters` — an absolute time and a readable source, under a `BREAKING` flag in `--red` when it applies.
**Now:** `14m · reu` — relative age and a four-letter code. Inside an hour-grouped feed the relative age is the one thing the group header already told you.
**Fix:** Absolute ET time; source spelled out (the `SOURCE_SHORT` codes were for a 260px rail that is now 288px). Keep `relTime` for the tooltip.

### R-05 · POLISH · News rows carry an earnings chip
**Mock:** three chip kinds — ticker (accent), `pinned` (model), `earnings` (amber) — so a headline about a name reporting tonight is visibly different.
**Now:** ticker and pinned only.
**Fix:** Add the earnings chip; `useCalendar` is already in the rail for the collapsed glyphs.

### R-06 · POLISH · Hour headers read as ranges
**Mock:** `09:00 — NOW`, then `08:00 — 09:00`. The current hour is named as current.
**Now:** bare hour marks — `09:00`, `08:00`.
**Fix:** Render the range in `groupByHour`; label the newest bucket "— now".

### R-07 · POLISH · Left rail quote tracks
**Mock:** rows at a flat 27px; label 42px, value `flex:1` right-aligned, change in a fixed 54px slot. Forex is 56 / flex / 52. Block separator is a `#2c3648` rule with 4px of air.
**Now:** separator and header height match. Measure `rails/QuoteRow.tsx` against the three tracks — a ragged change column is the most visible thing in a quote rail.
**Fix:** Fix the three tracks; give forex its own pair.

### R-08 · POLISH · Macro gauges header link
**Mock:** header is `MACRO` with a `1d ›` accent link; each gauge is a label/value row over a 4px centre-zero track (`#12171f`) with a `#2c3648` tick at 50%.
**Now:** verify `rails/MacroGauges.tsx` still colours positive/negative green/red rather than the old accent/amber pair, and that the window link is present.
**Fix:** Cheap check; likely already correct.

---

# E · The options group and the rest

Phase 2 split `/odte/strikes` into five routes. The split happened; three of the
five were then filled with the old cards rather than the mock's designs. This is
the largest block of remaining work.

### O-01 · STRUCT · Gamma `2c` — no regime hero
**Mock:** "Long gamma" at 26px in `--teal` with "Dealers dampen moves" beneath; a spot-vs-flip scale with a red→teal gradient, zero-γ and spot markers, `SHORT GAMMA · moves extend` / `LONG GAMMA · moves pin` end labels; net GEX and a pin-risk bar.
**Now:** `app/options/gamma/page.tsx` opens straight into `GexChart` / `GexCard` / `DexChart` / `SkewCard` / `DeltaBandsCard` / `MvcCard`.
**Fix:** Build the hero from `lib/odte-verdicts.ts` `deriveLevels()` — it already writes this verdict for the overview. Mostly layout.

### O-02 · STRUCT · Gamma — profile, levels-with-sentences, scenario card
**Mock:** 15 strike rows, horizontal bars off a centred axis calibrated to the printed ±400 scale (bar % = value/400 × 50), positive teal right and negative magenta left, ATM/ZG/CW/PW rows tinted. A levels card where every level carries a sentence saying what it does — not a tooltip. Four centred bars for net GEX by expiry. An amber scenario card stating what happens if spot breaks the flip, written before it happens.
**Now:** none of the four exist as designed. Level meanings are still tooltip-gated.
**Fix:** ~1 day each. The scenario card is the highest-value and the cheapest.

### O-03 · STRUCT · Flow `2d` — the two columns that carry the meaning
**Mock:** unusual prints on tracks `62px 132px 70px 78px 92px 82px 1fr`: time · contract · size · premium · **vs OI** · **aggressor** · plain-English read. Those two bolded fields separate new positioning from churn and buyers from sellers. Plus three ratio tiles (P/C volume, P/C OI, unusual count) each with a gauge and an interpreting sentence, five volume-vs-OI-by-strike bars, and a flow-tilt summary card.
**Now:** `app/options/flow/page.tsx` is `PcrCard` + `UnusualCard` in a `Panel`. Neither field appears; no gauges, no bars, no tilt card.
**Fix:** **First confirm `/api/odte/unusual` returns open interest and side.** If it does not, this is a backend ticket and the rest of P4 proceeds without it.

### O-04 · DRIFT · Greeks `2e` — the mirrored table
**Mock:** per-strike greeks in the ladder's own layout — `Vega · Θ · Γ · Δ | Strike | Δ · Γ · Θ · Vega` on `1fr×4 | 96px | 1fr×4` — so the muscle memory carries between the two pages. Plus a skew scatter with an ATM marker (puts magenta, calls teal) and a four-bar term structure with the payrolls expiry highlighted amber.
**Now:** the four aggregate cards are built and read well. "Exposure by strike" is a conventional table with call/put columns side by side, not mirrored. No skew scatter, no term structure.
**Fix:** Mirror the tracks; lift the skew scatter from `components/odte/SkewCard.tsx`.

### O-05 · STRUCT · Options overview `3a` — no session read, no symbol switcher
**Mock:** header carries `SPY / QQQ / IWM / DIA / SPX` as the same segmented control the ladder uses. Then a hero: one sentence at `headline`, an agreement count rendered as four segments (`3 of 4 inputs agree`), and a paragraph naming the dissent. Then the expected-move box with put wall / zero-γ / spot / call wall marked. Then the four evidence cards. Then "If you're trading this" — candidate strikes with intent, contract, cost, breakeven, max loss and a reason, behind a read-this strip stating they are candidates, not recommendations, and that none survive a break of the flip.
**Now:** the four `VerdictCard`s exist and are good. Above them there is nothing — no switcher (symbol comes from `useOdteSymbol` with no visible control on this page), no synthesis, no agreement count, no expected-move band. `StrikeGuidance` is imported; confirm whether it is the candidates block.
**Fix:** The four verdicts already hold the agreement data — count them. ~½ day for the hero, ~1h for the switcher (`components/odte/SymbolSwitcher.tsx` exists).

### O-06 · POLISH · Ladder `2a` — verify, don't rebuild
**Mock:** thirteen tracks totalling 976px (`72 56 96 92 62 62 96 62 62 92 96 56 72`), `width:max-content; margin:0 auto`; columns ordered **outward from the strike on both sides** — left-to-right that is `GEX IV OI Vol Ask Bid | Strike | Bid Ask Vol OI IV GEX`; calls right-aligned, puts left; OI/Vol bar fills anchored toward the strike; strike column sticky on `--elevated` with markers ATM (amber left border) / ZG (teal) / CW (teal) / PW (magenta) / MP (muted); `Jump to strike…` and `Centre on spot` at the right of the control bar.
**Now:** data/strikes/columns controls, expiry chips, levels strip and the collapsed explainer are all in.
**Fix:** Diff against the mock at 1440px before touching anything. The three details worth checking are the mirrored column order, the bar-fill anchoring, and whether the two right-hand controls exist.

### O-07 · DRIFT · Macro `3c` — methodology is permanent
**Mock:** four columns on the page, always — Input (article count, sources) / Scoring (FinBERT per sentence, entity-matched to scope) / Weighting (decay half-life, source multiplier, what `n` counts) / What it isn't (not a price forecast; below n=40 treat as noise).
**Now:** wrapped in `Collapsible`, so it defaults shut and most sessions never see it.
**Fix:** Unwrap it. Also confirm the lookback control reads "1 hour / 1 day / 1 week" (not bare `1h/1d/1w`) and that the benchmark series follows the selected window rather than the hard-coded `period=1mo&interval=1d`.

### O-08 · DRIFT · Portfolio `4c` — six numbers, not three chips
**Mock:** NLV, day P&L, unrealised, cash, exposure, top-sector concentration — as one band.
**Now:** a `sm:grid-cols-2 lg:grid-cols-3` chip grid. Day P&L and sector exposure are backend gaps listed in the original handoff's data requirements; the other four are available now.
**Fix:** Build the six-slot band; render the two missing slots as **nothing**, not as a dash. The disagreement band leading the page is already correct.

### O-09 · POLISH · Watchlist `4a` and Screener `4b`
**Mock:** cards on `#12171f` / `#2c3648` for the lead name and `#0c1017` / `#1e2634` for the rest — the first card is emphasised, the others recede.
**Now:** both pages are otherwise conformant. Only the surface ladder and the emphasised-lead treatment need a look. (`WatchlistClient` already passes `lead={i === 0 && filter === "all"}`.)
**Fix:** ~½ day between them. **These are the two pages to hold up as the standard.**

### O-10 · POLISH · Rotation `3b` — labels on the chart
**Mock:** quadrant names drawn inside the plot with a one-line gloss each (Improving / Leading / Lagging / Weakening); dots labelled with **sector names**, not ETF tickers, with a legend under the plot mapping name → ETF; an eight-week trail behind each dot (two fading dots) with a `4w / 8w / Off` control.
**Now:** trails are built (`lib/rotationTrails.ts`) and the sidebar exists.
**Fix:** Verify the in-chart quadrant labels and the name-not-ticker dot labels. Likely small.

### O-11 · POLISH · Calendar `2b` — the deferred columns
**Mock:** event rows carry actual · consensus · prior, and the expanded event's third column turns thresholds (`> 200k`, `< 130k`) into named tickers with the user's own exposure on a footer line.
**Now:** ruled out of v1 on 2026-07-31 — `argus/argus/calendar/schema.py` puts actual-vs-forecast out of scope and no feed stands behind it. The month strip, week spine, day grid and rank glyphs all shipped.
**Fix:** Leave it. Revisit only with a consensus feed — and when it lands, it also completes T-09 on the tape.
