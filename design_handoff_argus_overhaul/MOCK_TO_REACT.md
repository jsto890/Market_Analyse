# Mock → React conversion map

**Source of truth:** `mocks/Argus Overhaul - Today + Ticker.dc.html`
**Target:** `dashboard/` — Next.js, Tailwind, tokens in `app/globals.css`

The mock is inline-styled HTML with literal hex and px. The app has a token
layer. This file is the lookup between them. It exists because Phases 1–4
translated the mock by eye, and the drift compounded.

---

## 1. Colour — 1:1, no judgment required

Every colour in the mock is already a token. Search the mock for the hex, use
the token. Never write the hex into a component.

| Mock hex | Token | Tailwind | Used in mock for |
|---|---|---|---|
| `#06090f` | `--bg` | `bg-bg` | page background |
| `#0c1017` | `--surface` | `bg-surface` | nav, rails, low-emphasis cards |
| `#12171f` | `--elevated` | `bg-elevated` | tiles, emphasised cards, inputs |
| `#1a212c` | `--raised` | `bg-raised` | active segment, hover, chart bands |
| `#1e2634` | `--line` | `border-line` | default 1px border, row dividers |
| `#2c3648` | `--line-strong` | `border-line-strong` | card border, section rule |
| `#eef1f6` | `--text` | `text-foreground` | primary text, values |
| `#c8cede` | `--text-2` | `text-2` | card body copy, rationale |
| `#9aa3b4` | `--text-3` | `text-3` | subtitles, secondary figures |
| `#7d8698` | `--muted` | `text-muted` | labels, eyebrows, inactive |
| `#5f6878` | `--muted-2` | `text-muted-2` | empty-value dash, disabled tick |
| `#4c8dff` | `--accent` | `text-accent` | links, active nav, tickers |
| `rgba(76,141,255,0.1)` | `--accent-dim` | `bg-accent-dim` | filled button, today tint |
| `#3fb950` | `--green` | `text-pos` | up, open, positive |
| `#f85149` | `--red` | `text-neg` | down, TOP importance, breaking |
| `#d29922` | `--amber` | `text-warn` | earnings, HI importance, warnings |
| `#2dd4bf` | `--teal` / `--call` | `text-teal` / `text-call` | supportive verdict, calls |
| `#9d7cf5` | `--model` | `text-model` | scores, badges, conviction |
| `#e372b0` | `--put` | `text-put` | puts (mock predates this — use it) |

Note the utility names are **`pos`/`neg`/`warn`**, not green/red/amber, and the
reading tones are **`text-2`/`text-3`** (textColor-only keys, so there is no
`bg-2`). `muted-3` is wired in `tailwind.config.ts` but `--muted-3` is not
declared in `globals.css` — either declare it or drop the key.

\* Mock `#5f6878` is close to `--muted-2` (`#737b8c`) but darker. Use
`--muted-2`; do not add a token. Mock `rgba(76,141,255,0.1)` vs `--accent-dim`
(`0.14`) — use the token.

**Tinted fills.** The mock writes these inline as `rgba(...)`. They are
systematic — same colour, three opacities:

| Purpose | Border | Fill |
|---|---|---|
| model / badge | `rgba(157,124,245,0.45)` | `rgba(157,124,245,0.12)` |
| amber / earnings | `rgba(210,153,34,0.5)` | `rgba(210,153,34,0.1)` |
| accent / primary verb | `rgba(76,141,255,0.4)` | `rgba(76,141,255,0.1)` |
| red / top-tier | `rgba(248,81,73,0.4)` | — |
| green / open pill | — | `rgba(63,185,80,0.12)` |

Add these as `--model-dim`, `--amber-dim`, `--red-dim`, `--green-dim` and the
matching `-line` variants rather than repeating the rgba in components.

---

## 2. Type — near 1:1. Three mock sizes are off-scale.

`tailwind.config.ts` declares **seven** roles, not six: `micro` 11, `label` 12,
`body` 13, `data` 13, `title` 15, `headline` 20, `display` 28. The `label` role
exists for "chip captions, card verbs, the word beside a figure" — which is
exactly what the mock uses 12px for. So the mock's most common size maps
straight across and **cards do not grow**.

| Mock px | Maps to | Utility | Notes |
|---|---|---|---|
| 10px | **11px** | `text-micro` | below the floor; 10px was never in the scale |
| 11px | 11px | `text-micro` | eyebrows, column headers, rank text |
| 12px | 12px | `text-label` | card body, buttons, chips, subtitles |
| 13px | 13px | `text-body` / `text-data` | prose, table values |
| 15px | 15px | `text-title` | verdicts, card hero figures |
| 16px | **15px** | `text-title` | watchlist price — round down |
| 18px, 19px | **20px** | `text-headline` | card ticker |
| 20px | 20px | `text-headline` | page h2, masthead headline |

Two things the roles already encode, so stop hand-writing them:

- `micro` ships `letter-spacing: 0.08em` and `font-weight: 500`. The mock's
  eyebrow style **is** `text-micro` + `uppercase` — nothing else.
- `label` is documented sentence case. That is the G6 button ruling already in
  the token layer: `text-label` verbs are Pin / Alert / Open →, never PIN ALERT.

Never use `text-xs`/`sm`/`base`/`lg` — they are remapped onto the same roles as
a guard, but naming the role says what you meant.

**Weights:** 700 only for the ARGUS wordmark. 600 for headings, active tabs,
badges, hero figures. 500 for nav items and primary buttons. Everything else
400. The mock never uses 800+.

**Families:** `font-sans` (Fira Sans) for prose, headings, card copy, button
labels. `font-mono` (Fira Code) for every number, ticker, time, eyebrow and
column header — both are self-hosted through `next/font/google` and resolve via
`--font-sans`/`--font-mono`, so never write the family name. The rule in the
mock is exact — if it is a quantity or an identifier it is mono, if it is a
sentence it is not. Note the right-rail news headline is Fira Sans while its
timestamp is Fira Code, in the same row.

---

## 3. Geometry

| Mock value | Token / rule |
|---|---|
| nav height 46px | `--nav-h` |
| left rail 208px | `--rail-l` is 200px — **reconcile**; mock is 208 |
| right rail 260px | `--rail-r` is 288px — **reconcile**; mock is 260 |
| content max 1180px | `--w-wide` is 1240px — **reconcile**; mock is 1180 |
| collapsed rail strip 36px | new — add `--rail-collapsed` |
| page padding 24px 28px 40px | `--page-y` / `--page-x` |
| gap between bands 24px, 20px, 18px | `--stack` (20px) for all three |
| gap within a band 12px | `--stack-tight` |
| radius: card 8px, tile/panel 6px, chip/button 5px, bar/cell 4px, tick 3px | four-step radius scale — add tokens |
| border width | always 1px. The mock has no 2px borders except the nav underline and the notes rule. |

Three reconciliations above are real conflicts between the mock and the Phase 1
token values. **Rule: the token wins for rail widths (200/288 stay), the mock
wins for content cap (1180).** Rails were re-measured in Phase 1 against real
content; the content cap was not.

---

## 4. Components the mock defines and the app should share

These recur across screens. Build once, not per page.

1. **Eyebrow label** — 11px mono, uppercase, `0.08em`, `--muted`. Every section
   label on every screen. No accent bar, no border, no background.
2. **Stat chip** — `display:flex; align-items:baseline; gap:7px`, 1px border,
   radius 5px, padding 6px 11px; label 13px `--muted`, figure 13px mono
   coloured. Emphasised variant uses `--line-strong` + `--elevated`, default
   uses `--line` + `--surface`, semantic variant tints both.
3. **Segmented control** — outer 1px `--line`, radius 6px, `--surface`, padding
   3px, gap 2px; active radius 4px on `--raised`, 13px/600 `--text`; inactive
   13px/500 `--muted`; counts inline at 11px mono. (You have `SegmentedControl`
   — the tabs on Today are not using it.)
4. **Rank text** — 26px-wide slot, 11px/600, bare text, no box. TOP `--red`,
   MID `--amber`, LOW `--muted`.
5. **Verb row** — one row, max four, sentence case. Three at `flex:1` (13px
   `--text-3`, 1px `--line`, radius 5px, padding 5px 0) then the primary at
   `flex:1.3` (13px/500 `--accent`, accent-dim fill and border).
6. **Component bars** — `align-items:flex-end` in a fixed-height box, 7px wide,
   3px gap, radius 1px. Shared baseline is the point.
7. **Sparkline** — 12 bars, `flex:1`, 2px gap, 34px tall, radius 1px; recency
   ramp `--raised` → `--line-strong` → live bar in `--green`/`--red`.
8. **Value cell** — inline lowercase label + value in one cell (`act 51.2`),
   label `--muted`, value coloured. Empty renders a bare `—` in `--muted-2`
   with NO label.
9. **Section rule** — eyebrow, then optional 13px `--muted` detail, then a
   `flex:1` 1px `--line` rule to the right edge.

---

## 5. Conversion protocol

Per screen, in this order:

1. Split the screen out of the canvas into a standalone file so you can open it
   in a browser next to `localhost`. The screens are delimited by
   `<!-- ═══ SCREEN 1a — TODAY ═══ -->` comments; each is a `<div id="…">`.
   Strip the `<x-dc>` wrapper, the `<sc-if>` tags (keep their children), the
   badge/caption header div, and the four-column notes block at the end.
2. Diff top to bottom, region by region. Write down every divergence before
   fixing any of it — fixing as you read is how the last pass missed the
   systemic ones.
3. Convert values through §1–§3. Never paste a hex or an off-scale px.
4. Anything that recurs goes through §4, not into the page.
5. Re-capture and diff against the previous capture, not against the mock —
   the mock's numbers are illustrative.

**Never port from the mock:** the figures (6,412 / 0.78 / +31.2%), the
`href="#1a"` placeholder links, the `1440px` fixed frame, the drop shadow, or
the notes column. Those are presentation scaffolding for the canvas.

---

## 6. Standing rules

Derived from the mocks; apply to anything not explicitly specified.

- One clock per page.
- A field with no feed renders nothing — not a placeholder, not "TBA".
- A column whose every cell is empty gets dropped, not dashed.
- A label prints once per column, never once per row.
- A control that needs an explanatory sentence beside it is mislabelled.
- Never more than four verbs on a card, never two rows of them.
- Model output (scores, conviction, verdicts) is `--model`, never P&L
  green/red.

---

## 7. Stack notes

**React 18 / Next 14, server components by default.** Seven of the nine shared
components in §4 are pure presentation — eyebrow, stat chip, rank text, value
cell, section rule, sparkline, component bars. None of them needs `"use
client"`. Only the segmented control and the verb row do. The mock is static
markup, which maps to RSC almost verbatim; resist adding `"use client"` to a
file just because it came out of the mock.

**Tailwind, not inline styles.** The mock is inline-styled because it is a
single-file canvas. Nothing in §1–§3 should reach a component as a `style`
attribute. The one legitimate exception is a genuinely computed value — a
sparkline bar's `height:72%`, the tape's `left:35.6%`, a heat tint's opacity.
Those are data, not design tokens.

**recharts is for charts, not for bars.** The RRG is recharts. The 12-bar
sparkline (§4.7) and the 3-bar component meter (§4.6) are flex divs — twelve
`<span>`s with a percentage height. Do not pull recharts into a card for them;
it costs a client boundary and renders worse at 34px.

**Radix covers the deferrals.** Two instructions from the conformance pass need
a tooltip rather than inline text: the calendar's local-time conversion (one
line, ET only, GMT on hover) and rotation's long industry names (truncated,
full name on hover). Use the Radix tooltip already in the repo, not a title
attribute.

**lucide-react for the ticker icon rail.** The active item shows its label as
text beside the icon; the rest are icon-only with `aria-label`.

**SWR is why the empty states matter.** Every "renders nothing when there is no
feed" rule has a loading state in front of it. A skeleton is not a placeholder —
the no-feed rule governs resolved-and-empty, not in-flight.

**Tauri desktop at :3210.** Fixed desktop widths only; there is no mobile
breakpoint to design for. The mock's 1440px frame is the target width and
1024px is the narrow case (`state--ticker-1024-full`).

**`npx tsc --noEmit` is the only static gate** — no ESLint, no Prettier. Nothing
will catch a stray hex or an off-scale px for you. The Playwright contract
counts font sizes and content widths; it does not check colour. Adding a
hex-literal grep to the contract suite would close that hole cheaply.
