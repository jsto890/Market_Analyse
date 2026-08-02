# Claude Code — prompts

Copy the block you need. Start with §1.

---

## 1 · Session one

```
You are working in the Argus trading dashboard: `dashboard/` — Next.js 14 app
router, React 18, Tailwind, SWR, running as a Tauri desktop app at :3210.

A UI overhaul was already executed against a set of design mocks. It got the
structure right and the fidelity wrong. Your job is to close the gap.

Read these four files in this order before you write any code:

1. design_handoff_argus_conformance/README.md
   — design tokens, type roles, geometry, standing rules, stack notes, and a
     list of what is ALREADY CORRECT and must not be re-done.
2. design_handoff_argus_conformance/CONFORMANCE_GAP.md
   — 56 findings (X-01…X-06, T-01…T-18, K-01…K-13, R-01…R-08, O-01…O-11).
     Each names the file it lives in, what the mock shows, what the code does
     now, and the fix.
3. design_handoff_argus_conformance/IMPLEMENTATION_PLAN.md
   — the working document: packages P0–P5, tasks in dependency order, with
     acceptance criteria.
4. design_handoff_argus_conformance/mocks/Argus Overhaul - Today + Ticker.dc.html
   — the visual reference. 14 screens on one canvas, ~1440px each, delimited by
     `<!-- ═══ 1a — TODAY ═══ -->` comments. It needs mocks/support.js beside it
     to render. Open it in a browser and pan.

Then execute P0 (baseline capture) and P1 (the shared substrate).

Rules for this codebase, non-negotiable:
- Never write a hex literal into a component. Every colour in the mock is
  already a token in app/globals.css. Use the Tailwind utility.
- Never use text-xs / text-sm / text-base / text-lg. Seven named roles only:
  display, headline, title, body, data, label, micro.
- 11px (`text-micro`) is an eyebrow and column-header size. It is not a content
  size. If it is a sentence or a figure it is `text-body` or `text-data`.
- `--accent` is interactive only, never data. `--green`/`--red` are money
  direction only, never model output — model output is `--model`.
- `bg-raised` is hover, inputs and the active segment. It is never a resting
  card. Resting cards are `bg-elevated` (emphasised) or `bg-surface` (quiet).
- Where there is no feed, render nothing. Not a dash, not a placeholder, not
  "TBA".
- Server components by default. Do not add "use client" to a file just because
  it came out of the mock.
- The mock is a design reference, not production code. Lift its values, never
  its markup. Never port its figures, its href="#1a" links, its 1440px frame,
  its drop shadow, its <sc-if> tags or its notes columns.

Do not start P2 until P1's acceptance criteria pass. Report what you changed
per task, and flag anything in the plan that the code contradicts — the plan
was written from a source read, not from running the app.
```

---

## 2 · Per-package prompts

Use these once P1 has shipped. Each assumes the four files above are already in
context.

### P2 — the ticker header

```
Execute P2 from IMPLEMENTATION_PLAN.md — the ticker header (findings K-01…K-08).

Read screen 1b in the mock first (search for "SCREEN 1b — TICKER"). The header
there is ONE card containing three bands: a fixed 1fr/320px/300px zone grid, a
rule, an action row on --elevated, a rule, and a three-column track record.
The current components/ticker/Header.tsx is a flex-wrap row — that is the
defect.

Work in this order: 2.1 rebuild the card shell → 2.2 price zone (28px price,
day-range bar, volume bar) → 2.3 verdict zone (score/agreement line + the
"Model output, not a return forecast" gloss line) → 2.4 action band + earnings
chip, delete CatalystStrip → 2.5 track-record columns → 2.6 levels onto the
chart, delete LevelsCard → 2.7 identity typography and chart chrome.

Two things to preserve, they are improvements over the mock:
- the markBasis InfoTip on the price
- cohortRead(), which already writes the track record's third column correctly

Do not touch the right column's panel list — that is a pending product decision
(K-10). Stop and ask if you reach it.
```

### P3 — Today

```
Execute P3 from IMPLEMENTATION_PLAN.md — the Today page (findings T-01…T-18).

Read screen 1a in the mock first (search for "SCREEN 1a — TODAY"). Four bands:
brief masthead (NO box — an eyebrow, a date line, a 20px synthesis, three tiles,
a row of news chips), today's tape (150px, a filled 24px session bar with a
now-pill in its own lane and connectors down to the release labels), signals
(segmented tabs with counts, toolbar on the same row, ONE caveat line above the
cards, three cards, then the table), and an 11-cell sector strip.

Order: 3.1 masthead → 3.2 tape → 3.3 signals → 3.4 sector strip. The masthead
is the least work and the most visible; do it first.

Two constraints:
- The signal card's one-line reason (T-15) has no feed behind it. Derive a
  sentence from the leg values or omit the row entirely. Do not fill it with
  catalyst text.
- Do not add actual-vs-consensus to the tape's release labels (T-09). The
  calendar feed does not carry it and faking it is worse than omitting it. Add
  the connector and tick only.

lib/tape.ts's TAPE_SESSIONS / tapeFraction / assignLanes maths is correct —
keep it, change only what it renders into.
```

### P4 — the options group

```
Execute P4 from IMPLEMENTATION_PLAN.md — the options routes (findings O-01…O-06).

FIRST: inspect what /api/odte/unusual returns. If it carries no open interest
and no aggressor side, tell me — O-03 (the flow table's two meaningful columns)
becomes a backend ticket and you proceed without it.

Read mock screens 3a, 2c, 2d, 2e, 2a. The five routes exist; three of them were
filled with the old odte cards instead of the mock's designs.

Order: 4.2's scenario card first (cheapest, highest value), then 4.1 the
overview hero + symbol switcher, then the rest of 4.2 gamma, then 4.3 flow,
then 4.4 greeks. 4.5 is a VERIFY task on the ladder — open the mock at 1440px
beside localhost and check three things only (mirrored column order, bar-fill
anchoring toward the strike, Jump-to-strike / Centre-on-spot). Fix only what
fails; the ladder is the best-built page in the product.

lib/odte-verdicts.ts already derives the regime verdict, the levels read and
the flow read for the overview page. Reuse it for gamma's hero rather than
writing a second derivation.
```

### P5 — rails, Why, and the tail

```
Execute P5 from IMPLEMENTATION_PLAN.md — findings R-01…R-08, K-09…K-13,
O-07…O-11.

5.1 (the rails) is eight small independent fixes — do those first, they are
half a day and they touch the frame every page renders inside.

5.2 (the Why panel) needs a decision from me before you build it. The mock
replaces 424 lines of ensemble telemetry with three sentences. The
recommendation in the plan keeps both — three-leg summary leads, ensemble
behind a "How the ensemble voted" disclosure. Confirm with me first. If a leg
has no evidence sentence available, render the bar and the label and nothing
else; do not invent one.

5.3 (the ticker's right column) also needs a decision — the mock shows two
cards where the app has seven, and it was drawn as the top of the page, not as
a deletion order.

5.4 is four independent page fixes: macro's methodology panel unwrapped from
Collapsible, portfolio's six-number band, watchlist/screener card surfaces,
rotation's in-chart quadrant labels.
```

---

## 3 · Verification prompt

Run after every package.

```
Verify the package I just finished against IMPLEMENTATION_PLAN.md's
"Definition of done":

1. npx tsc --noEmit — must be clean.
2. npx playwright test e2e/screens.spec.ts — diff against the PREVIOUS capture,
   not against the mock. Every difference should be one we intended. List them.
3. Re-run the audit script and report: any rendered font-size below 11px, the
   count of distinct content widths (must be 3), the count of [title]
   attributes (must be 0), and any hex literal in a className or style.
4. Open the relevant mock screen beside localhost:3210 at 1440px and read top
   to bottom. Write down EVERY remaining divergence before fixing any of it.
   Fixing as you read is how the last pass missed the systemic ones.

Report the list. Do not fix anything until I have seen it.
```

---

## 4 · Guard rails to paste when things drift

Short correctives for the failure modes this codebase has already shown once.

```
Stop. You are re-implementing something that already exists. Before writing a
new component, grep components/ui/ — the kit has Page, Panel, ActionBar,
StatChip, VoteBar, RankText, ValueCell, ReadThis, Gloss, InfoTip,
SegmentedControl, Sparkline, MicroBar, CenterBar, Badge, ConvictionDot,
DataTable, Loading, Empty, Failed, Stale, Collapsible, Toggle, Select, Input,
Button, PinToggle, UndoToastProvider. Use them.
```

```
That is a hex literal in a component. Every colour in the mock is already a
token in app/globals.css. Find the token in README.md's colour table and use
the Tailwind utility.
```

```
You put a sentence at text-micro. 11px is an eyebrow and column-header size.
Sentences are text-body, figures are text-data.
```

```
You rendered a dash / "—" / "TBA" where the feed returned nothing. The standing
rule is: a field with no feed renders nothing. A column whose every cell is
empty gets dropped, not dashed.
```

```
You are diffing against the mock. Diff against the previous screenshot capture.
The mock's numbers are illustrative — its figures, tickers and dates are not
data, and matching them is not the goal.
```
