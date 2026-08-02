# Handoff: Argus UI — mock conformance remediation

**Target repo:** `Market_Analyse/dashboard/` — Next.js 14 (app router), React 18, Tailwind, SWR, Tauri desktop at `:3210`
**Design reference:** `mocks/Argus Overhaul - Today + Ticker.dc.html` — 14 screens, ids `1a`–`4d`
**Working document:** `IMPLEMENTATION_PLAN.md` ★
**Findings register:** `CONFORMANCE_GAP.md` — 56 deltas, each citing the file it lives in
**Paste-in prompt:** `CLAUDE_CODE_PROMPT.md`

---

## Overview

This is **not** the original overhaul handoff. That one is at
`design_handoff_argus_overhaul/` and it has already been executed: phases 0–4
landed, all fourteen routes exist, the token layer is complete, the options
split shipped, `/calendar` was built.

This package covers **what the executed overhaul did not get right**. A
source-level review of every route, rail, panel and shared component against
all fourteen mock screens found 56 remaining deltas. The structure is done;
the skin is not.

> The single sentence that describes the job: **the app is now built out of the
> right parts, arranged in the right order, and rendered at the wrong sizes on
> the wrong surfaces.**

### What is already correct — do not re-do it

Confirmed present and conformant by reading the source. Do not "improve" these:

- The whole token layer in `app/globals.css` — `--put`, `--model`, `--text-2`,
  `--text-3`, `--muted-2`, `--rail-collapsed`, the `--fs-*` roles, `--page-*`,
  `--stack`, `--w-prose`/`--w-wide`. All declared, all correct.
- `tailwind.config.ts` — seven font roles in px, stock keys remapped as a guard,
  `textColor` 2/3 split out to avoid `border-2` collisions.
- `components/ui/Page.tsx` — the three-width contract, `Page.Header`, `Page.Body`,
  `Page.Section`. Every route renders through it.
- The nav grouping in `NavLinks.tsx` — 9 links, 3 groups, hairline separators,
  `aria-current`. Matches the mock exactly.
- `ActionBar.tsx` — the verb row, the `fill` variant, the `flex-[1.4]` accent
  "Open →". Matches mock §4.5.
- The 36px rail collapse strips, `HiddenBlockGlyphs`, the non-scrolling left-rail
  footer, `useMarketClock`, `RankText` in What's Next, hour-grouped news,
  the "N new ↑" pill.
- `/watchlist` — filtering stat chips, pinned cards with sparkline + since-pin,
  `WindowProgress` on recent picks.
- `/screener` — score slider with live count, top-3 cards, `VoteBar`.
- `/alerts` — the sentence rule builder ("Alert me when [NVDA] …").
- `/portfolio` — the disagreement band leads the page.
- `/calendar` — month strip, week spine, day grid, event rows, rank glyphs.
- `/options/ladder` — density, mode, column groups, expiry chips, levels strip,
  collapsed explainer, `useOptionsLivePoller`.

### What this package changes

| Package | Theme | Deltas | Est. |
|---|---|---|---|
| **P1** | The shared substrate | X-01…X-06 | ~3 days |
| **P2** | The ticker header | K-01…K-08 | ~4 days |
| **P3** | Today, band by band | T-01…T-18 | ~4 days |
| **P4** | The options group | O-01…O-06 | ~5 days |
| **P5** | Rails, Why, and the tail | R-01…R-08, K-09…K-13, O-07…O-11 | ~3 days |

---

## About the design files

`mocks/Argus Overhaul - Today + Ticker.dc.html` is a **design reference created
in HTML** — a prototype showing intended look, layout and behaviour. It is
**not production code to copy**. It is a single static file with inline styles,
no React, no data layer.

Your task is to **bring the existing Next.js implementation into conformance
with it**, using the codebase's established patterns: Tailwind classes against
the token layer in `app/globals.css`, the `components/ui/*` primitives, SWR for
data, the existing `lib/*` helpers. Lift the exact values (hex codes, px sizes,
spacing, copy) from the mock; do not lift its markup.

The mock needs `mocks/support.js` beside it to render. Open it in a browser and
pan/zoom — it is a wide canvas, roughly 1440px per screen. Screens are
delimited by `<!-- ═══ 1a — TODAY ═══ -->` comments; each is a `<div id="…">`.

**Never port from the mock:** the figures (6,412 / 0.78 / +31.2%), the
`href="#1a"` placeholder links, the `1440px` fixed frame, the drop shadow, the
`<sc-if>` wrappers, or the four-column notes block at the end of each screen.
Those are canvas presentation scaffolding.

## Fidelity

**High fidelity.** Final colours, typography, spacing and layout. Recreate
pixel-accurately using the codebase's existing libraries and patterns. Data
shown in the mock is realistic but illustrative — wire real data.

---

## Design tokens

Everything below is **already declared**. You are matching against it, not
adding to it. Never write a hex literal into a component.

### Colour

| Mock hex | Token | Tailwind | Meaning |
|---|---|---|---|
| `#06090f` | `--bg` | `bg-bg` | page background |
| `#0c1017` | `--surface` | `bg-surface` | nav, rails, quiet cards |
| `#12171f` | `--elevated` | `bg-elevated` | **resting cards**, tiles, table headers |
| `#1a212c` | `--raised` | `bg-raised` | hover, inputs, active segment — **never a resting card** |
| `#1e2634` | `--line` | `border-line` | default 1px border, row dividers |
| `#2c3648` | `--line-strong` | `border-line-strong` | emphasised card border, section rule |
| `#eef1f6` | `--text` | `text-foreground` | primary text, values |
| `#c8cede` | `--text-2` | `text-2` | card body copy, rationale, read-this |
| `#9aa3b4` | `--text-3` | `text-3` | subtitles, secondary figures |
| `#7d8698` | `--muted` | `text-muted` | labels, eyebrows, inactive |
| `#737b8c` | `--muted-2` | `text-muted-2` | empty-value dash, disabled tick |
| `#4c8dff` | `--accent` | `text-accent` | **interactive only** — links, active nav, tickers |
| — | `--accent-dim` | `bg-accent-dim` | filled button, today tint |
| `#3fb950` | `--green` | `text-pos` | up, open, positive — **money direction only** |
| `#f85149` | `--red` | `text-neg` | down, TOP importance, breaking |
| `#d29922` | `--amber` | `text-warn` | earnings, HI importance, warnings |
| `#2dd4bf` | `--teal` / `--call` | `text-teal` / `text-call` | supportive verdict, calls |
| `#9d7cf5` | `--model` | `text-model` | **model output** — scores, conviction, verdicts |
| `#e372b0` | `--put` | `text-put` | puts |

**Enforced rules.** `--accent` is interactive, never data. `--green`/`--red`
are money direction, never model output. Nothing darker than `--muted` carries
a sentence.

**Tinted fills** — same colour, three opacities. Written inline as `rgba()` in
the mock; use the Tailwind opacity syntax (`border-model/45 bg-model/10`):

| Purpose | Border | Fill |
|---|---|---|
| model / badge | `rgba(157,124,245,0.45)` | `rgba(157,124,245,0.12)` |
| amber / earnings | `rgba(210,153,34,0.5)` | `rgba(210,153,34,0.1)` |
| accent / primary verb | `rgba(76,141,255,0.4)` | `rgba(76,141,255,0.1)` |
| red / top-tier | `rgba(248,81,73,0.4)` | — |
| green / open pill | — | `rgba(63,185,80,0.12)` |

### Typography

`Fira Sans` (`--font-sans`) and `Fira Code` (`--font-mono`), loaded via
`next/font/google`. `font-variant-numeric: tabular-nums` on everything mono.

| Role | Utility | Size / weight / family | Use |
|---|---|---|---|
| display | `text-display` | 28 / 600 / mono | ticker symbol; **the price**; the one number a page is about |
| headline | `text-headline` | 20 / 600 / sans | page title, brief synthesis, card ticker |
| title | `text-title` | 15 / 600 / sans | panel and card titles, verdict words |
| body | `text-body` | 13 / 400 / sans | prose, explanations, table cells |
| data | `text-data` | 13 / 400 / mono tnum | all numerics |
| label | `text-label` | 12 / 400 / sans | chip captions, card verbs, the word beside a figure |
| micro | `text-micro` | 11 / 500 / mono, uppercase, `0.08em` | **eyebrows and column headers only** |

**The rule that is still being broken:** 11px is not a content size. If it is a
sentence or a figure it is `body` or `data`. `micro` already ships its
letter-spacing and weight — the eyebrow style *is* `text-micro` + nothing else.
The `.eyebrow` utility in `globals.css` is the canonical form.

Mock sizes that are off-scale and what they map to: 10px → 11px (`micro`),
16px → 15px (`title`), 18/19px → 20px (`headline`).

**Weights:** 700 only for the ARGUS wordmark. 600 for headings, active tabs,
badges, hero figures. 500 for nav items and primary buttons. 400 everything
else.

**Family rule, exact:** if it is a quantity or an identifier it is mono; if it
is a sentence it is not. The right-rail news headline is Fira Sans while its
timestamp is Fira Code, in the same row.

### Geometry

| Value | Token | Note |
|---|---|---|
| nav height 46px | `--nav-h` | ✓ |
| left rail 208px | `--rail-l` = 200px | **token wins** — do not change |
| right rail 260px | `--rail-r` = 288px | **token wins** — do not change |
| collapsed strip 36px | `--rail-collapsed` | ✓ |
| content cap 1180px | `--w-wide` | **mock wins**, already applied ✓ |
| prose cap 880px | `--w-prose` | ✓ |
| page padding | `--page-x` 28px / `--page-y` 24px | ✓ |
| between sections | `--stack` 20px | ✓ |
| within a section | `--stack-tight` 12px | ✓ |

**Radius:** 8px cards and panels · 6px controls, tiles and segmented groups ·
5px chips and buttons · 4px badges and inline tags · 3px bars · 2px bar fills.

**Borders:** always 1px. The only 2px in the product are the nav's active
underline, the ladder's calls/puts divider, and active-state left borders.

**Shadow:** none in-app. The mock's `0 24px 60px rgba(0,0,0,0.5)` is canvas
presentation only.

### Shared components the mock defines

Build once, not per page. Seven of the nine are pure presentation — no
`"use client"`.

1. **Eyebrow** — 11px mono, uppercase, `0.08em`, `--muted`. No bar, no border,
   no background. Use `.eyebrow`.
2. **Stat chip** — `flex; items-baseline; gap:7px`, 1px border, radius 5px,
   padding 6px 11px; label 13px `--muted`, figure 13px mono coloured.
   Emphasised = `--line-strong` + `--elevated`; default = `--line` + `--surface`.
3. **Segmented control** — outer 1px `--line`, radius 6px, `--surface`, padding
   3px, gap 2px; active radius 4px on `--raised`, 13px/600 `--text`; inactive
   13px/500 `--muted`; counts inline at 11px mono.
4. **Rank text** — 26px-wide slot, 11px/600, bare text, no box. TOP `--red`,
   HI `--amber`, MD `--muted`.
5. **Verb row** — one row, max four, sentence case. Three at `flex:1` (12–13px
   `--text-3`, 1px `--line`, radius 5px, padding 5px 0) then the primary at
   `flex:1.3`–`1.4` (accent, accent-dim fill and border).
6. **Component bars** — `align-items:flex-end` in a fixed-height box, 7px wide,
   3px gap, radius 1px. Shared baseline is the point.
7. **Sparkline** — 12 bars, `flex:1`, 2px gap, 34px tall, radius 1px; recency
   ramp `--raised` → `--line-strong` → live bar in `--green`/`--red`.
8. **Value cell** — inline lowercase label + value in one cell (`act 51.2`),
   label `--muted`, value coloured. Empty renders a bare `—` in `--muted-2`
   with **no** label.
9. **Section rule** — eyebrow, optional 13px `--muted` detail, then a `flex:1`
   1px `--line` rule to the right edge.

---

## Standing rules

Derived from the mocks; apply to anything not explicitly specified here.

- One clock per page.
- A field with no feed renders **nothing** — not a placeholder, not "TBA",
  not a dash.
- A column whose every cell is empty gets dropped, not dashed.
- A label prints once per column, never once per row.
- A control that needs an explanatory sentence beside it is mislabelled.
- Never more than four verbs on a card, never two rows of them.
- Model output (scores, conviction, verdicts) is `--model`, never P&L green/red.
- Read-this strips are always visible, 12px `--muted`, at the **foot** of a
  panel above a 1px `--line` rule. (Exception: Today's caveat line, which the
  mock places above the cards — see T-13.)
- Gloss = dotted 1px underline in the term's own colour; **click**, not hover,
  expands a two-line definition in place; focusable; Escape closes.

## Stack notes

- **RSC by default.** The mock is static markup, which maps to server
  components almost verbatim. Only the segmented control and the verb row need
  `"use client"`. Resist adding it to a file just because it came out of the mock.
- **Tailwind, not inline styles.** The one legitimate `style` attribute is a
  genuinely computed value — a sparkline bar's `height:72%`, the tape's
  `left:35.6%`, a heat tint's opacity. Those are data, not design tokens.
- **recharts is for charts, not bars.** The 12-bar sparkline and the 3-bar
  component meter are flex divs. Do not pull recharts into a card for them.
- **`lightweight-charts`** for price; **recharts** for the rest.
- **Radix tooltip** already in the repo for the two legitimate deferrals
  (calendar local-time conversion, rotation's long industry names). Not a
  `title` attribute.
- **lucide-react** for the ticker icon rail.
- **Responsive target is 1440–1920 desktop.** No mobile breakpoint. Below 1280
  both rails auto-collapse (existing `NARROW_QUERY`). Below 1100 the ticker page
  goes single-column in document order.
- **`npx tsc --noEmit` is the only static gate** — no ESLint, no Prettier.
  Nothing catches a stray hex or an off-scale px for you. Adding a hex-literal
  grep to the Playwright suite would close that hole cheaply.

## Regression guard

`e2e/screens.spec.ts` is a Playwright screenshot harness. **Run it before you
start** to capture a baseline, then after every package and diff against
`screens/baseline/` — against the previous capture, not against the mock. The
mock's numbers are illustrative.

Assertions worth adding as you go:

- No element renders below 11px.
- `document.querySelectorAll('[title]').length === 0` on every route.
- Exactly three distinct `[data-page-width]` values across all routes.
- No route sets its own `max-w-*` or `min-h-screen`.
- No hex literal in any `className` or `style` on any route.

## Assets

None. No images, no icon files. Icons come from `lucide-react`, already a
dependency. Fonts are self-hosted at build time via `next/font/google`. The
mock draws all charts, bars and markers in CSS.

## Files in this bundle

```
README.md                     ← you are here: tokens, rules, stack notes
CLAUDE_CODE_PROMPT.md         ★ paste this into Claude Code to start
IMPLEMENTATION_PLAN.md        ★ the working document — packages, tasks, criteria
CONFORMANCE_GAP.md            the 56 findings, each citing its source file
Argus Mock Conformance Gap.dc.html   the same review as a readable document
mocks/
  Argus Overhaul - Today + Ticker.dc.html   all 14 screens
  support.js                                required beside it to render
```

## Two decisions this handoff cannot make for you

1. **The ticker page's right column.** The mock shows two cards where the app
   has seven (Levels, Why, Catalysts, News, Sentiment, History, AI). The mock
   was drawn as the top of the page, not as a deletion order. Someone has to
   decide what happens to News, Sentiment, History and AI. K-10 proposes a
   second band below the fold; that is a proposal, not a spec.
2. **The Why panel.** It renders real ensemble telemetry — combo string,
   per-family votes with leave-one-out attribution, n_eff/regime/ADX, a 70-agent
   vote accordion. The mock replaced all of it with three sentences. K-09
   recommends keeping both (three-leg summary leads, ensemble behind a
   disclosure), but that is a product call.

**Raise both with the design owner before starting P2 or P5.**
