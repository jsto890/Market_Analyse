# WS-2 Rail Spec — Argus Trading Terminal Rails

**Status:** Design-complete, gates implementation of WS-2 component tasks.
**Scope:** Left quote rail + right news shell + 3-column page wrapper. Does not alter Nav or any existing page content.

---

## 0. Token Reference

All values map directly to the Tailwind aliases already registered in `tailwind.config.ts`. No new tokens are introduced.

| CSS var      | Tailwind class(es)                     | Hex       | Role                                      |
|--------------|----------------------------------------|-----------|-------------------------------------------|
| `--bg`       | `bg-bg`                                | `#0b0e14` | Page background                           |
| `--surface`  | `bg-surface`                           | `#11151c` | Rail backgrounds, Nav                     |
| `--elevated` | `bg-elevated`, `hover:bg-elevated`     | `#1a1f2b` | Hover / active / skeleton base            |
| `--border`   | `border-line`, `divide-line`           | `#222936` | Dividers, rail outer edge                 |
| `--text`     | `text-foreground`                      | `#e6e8ec` | Prices, primary labels                    |
| `--muted`    | `text-muted`                           | `#8b93a3` | Ticker symbols, block headers, footnote   |
| `--accent`   | `text-accent`, `border-accent`         | `#4c8dff` | Interactive, session badges, expand icon  |
| `--green`    | `text-pos`                             | `#3fb950` | Positive % change only                    |
| `--red`      | `text-neg`                             | `#f85149` | Negative % change only                    |
| `--amber`    | `text-warn`, `border-warn`             | `#d29922` | Stale data, CLOSED badge, caution states  |
| `--teal`     | `text-teal`                            | `#2dd4bf` | Session overlap chip accent               |

**Semantic rule (non-negotiable):** `text-neg` / `#f85149` is used exclusively for negative price movement. It must never appear on UI chrome, error messages, offline states, or session labels. Offline and error states use `text-warn` (amber).

---

## 1. Layout & Dimensions

### 1.1 Three-column Shell

The shell sits below the existing 44px sticky Nav (`h-nav`, `top-0`, `z-40`). It fills the remaining viewport height.

```
┌─────────────────────────────────────────────────────────────────┐
│  NAV  44px  sticky top-0 z-40  bg-surface border-b border-line  │
├──────────┬──────────────────────────────────┬───────────────────┤
│ LEFT     │                                  │ RIGHT             │
│ 200px    │   PAGE CONTENT (flex-1)          │ 260px             │
│ (36px    │   overflow-y-auto                │ (36px min)        │
│  min)    │                                  │                   │
│          │                                  │                   │
│ sticky   │                                  │ sticky            │
│ top-nav  │                                  │ top-nav           │
│ h-screen │                                  │ h-screen          │
│ -nav     │                                  │ -nav              │
└──────────┴──────────────────────────────────┴───────────────────┘
```

**Shell wrapper element** (replaces the bare `{children}` in `layout.tsx`):

- Display: `flex flex-row`
- Height: `h-[calc(100vh-var(--nav-h))]`
- Position: relative (rails are sticky within it)
- Background: `bg-bg`

**Left rail expanded:** `w-[200px] flex-shrink-0`
**Left rail minimised:** `w-9` (36px, `flex-shrink-0`)
**Content area:** `flex-1 min-w-0 overflow-y-auto`
**Right rail expanded:** `w-[260px] flex-shrink-0`
**Right rail minimised:** `w-9 flex-shrink-0`

### 1.2 Rail Positioning

Both rails:
- `sticky top-[var(--nav-h)] h-[calc(100vh-var(--nav-h))]`
- `overflow-y-auto` (scrollable if content overflows — should not happen at target density)
- `bg-surface`
- Left rail: `border-r border-line`
- Right rail: `border-l border-line`

### 1.3 Internal Padding

| Zone                     | Value                     |
|--------------------------|---------------------------|
| Rail outer padding       | `px-0` (content pads internally) |
| Block header             | `px-3 pt-3 pb-1`          |
| Ticker row               | `px-3 py-0` (height-controlled, see §4) |
| Block separator          | 1px `border-b border-line` between block groups |
| Rail top padding         | `pt-1`                    |
| Footnote zone            | `px-3 py-2 mt-auto`       |

---

## 2. Type Scale

All type is monospace. The body already uses system-ui; rails override with `font-mono` at the rail container level. All numeric cells use `tabular-nums` (apply `tabular-nums` class or `font-variant-numeric: tabular-nums`).

| Element                    | Size     | Weight      | Class recipe                                      |
|----------------------------|----------|-------------|---------------------------------------------------|
| Block header label         | 10px     | 500 (medium)| `text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono` |
| Session badge (inline)     | 10px     | 500         | `text-[10px] font-medium font-mono`               |
| Ticker symbol (label)      | 11px     | 400         | `text-[11px] font-mono text-muted`                |
| Price value                | 12px     | 400         | `text-[12px] font-mono tabular-nums text-foreground` |
| % change                   | 11px     | 500         | `text-[11px] font-mono font-medium tabular-nums`  |
| FX pair label              | 11px     | 400         | `text-[11px] font-mono text-muted`                |
| Session chip (FX)          | 9px      | 500         | `text-[9px] font-mono font-medium uppercase tracking-[0.06em]` |
| News header                | 10px     | 500         | `text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono` |
| News placeholder body      | 11px     | 400         | `text-[11px] font-mono text-muted`                |
| Footnote text              | 10px     | 400         | `text-[10px] font-mono text-muted opacity-60`     |
| Minimised strip label      | 9px      | 500         | `text-[9px] font-mono font-medium uppercase tracking-[0.06em] text-muted` |
| Minimised % value          | 11px     | 500         | `text-[11px] font-mono font-medium tabular-nums`  |
| Collapse button icon       | 14px     | —           | SVG / Unicode, `text-muted hover:text-foreground` |

---

## 3. Color Usage by Element

### 3.1 Left Rail

| Element                        | Token           | Hex       | Notes                                              |
|--------------------------------|-----------------|-----------|----------------------------------------------------|
| Rail background                | `bg-surface`    | `#11151c` |                                                    |
| Rail border (right edge)       | `border-line`   | `#222936` |                                                    |
| Block header text              | `text-muted`    | `#8b93a3` |                                                    |
| Block divider line             | `border-line`   | `#222936` | 1px border-b                                       |
| Ticker symbol                  | `text-muted`    | `#8b93a3` |                                                    |
| Price                          | `text-foreground`| `#e6e8ec`|                                                    |
| % change positive              | `text-pos`      | `#3fb950` |                                                    |
| % change negative              | `text-neg`      | `#f85149` |                                                    |
| % change flat (±0.00%)         | `text-muted`    | `#8b93a3` | Threshold: abs(pct) < 0.05                         |
| Row hover background           | `hover:bg-elevated`| `#1a1f2b`|                                                   |
| Footnote text                  | `text-muted opacity-60` | — | Visually receded, clearly secondary           |

### 3.2 Session Badges (Equity block)

Badges sit right-aligned in the block header row. They must be visually distinct from up/down coloring. Green and red are forbidden here.

| Badge    | Background token     | Text token         | Rationale                        |
|----------|----------------------|--------------------|----------------------------------|
| `PRE`    | `bg-accent/15`       | `text-accent`      | Active but pre-hours — blue      |
| `REG`    | `bg-accent/25`       | `text-accent`      | Highest priority — fuller blue   |
| `AFTER`  | `bg-accent/10`       | `text-accent/70`   | Winding down — dimmer blue       |
| `CLOSED` | `bg-warn/10`         | `text-warn`        | Caution / inactive — amber       |

Badge shape: `rounded px-1.5 py-px text-[10px] font-medium font-mono`

### 3.3 FX Session Chips (Forex block)

Chips appear inline in the block header, right-aligned. Single session vs overlap are visually differentiated.

| State                  | Chip content  | Style                                                            |
|------------------------|---------------|------------------------------------------------------------------|
| Single session (ASIA)  | `ASIA`        | `bg-elevated text-muted rounded px-1.5 py-px text-[9px]`        |
| Single session (LDN)   | `LDN`         | `bg-elevated text-accent/80 rounded px-1.5 py-px text-[9px]`    |
| Single session (NY)    | `NY`          | `bg-elevated text-accent rounded px-1.5 py-px text-[9px]`       |
| Overlap (LDN·NY)       | `LDN·NY`      | `bg-teal/15 text-teal rounded px-1.5 py-px text-[9px] font-medium` — teal distinguishes overlap |
| Overlap (ASIA·LDN)     | `ASIA·LDN`    | `bg-teal/15 text-teal rounded px-1.5 py-px text-[9px] font-medium` |

Teal (`--teal`, `#2dd4bf`) is unused elsewhere in the token set and provides an unmistakable third color that carries no up/down semantic.

### 3.4 Offline / Stale State Colors

| Element                   | Token          | Notes                                         |
|---------------------------|----------------|-----------------------------------------------|
| Price (stale / offline)   | `text-muted`   | Dimmed — not red; red = down movement only    |
| Rail offline banner bg    | `bg-warn/10`   |                                               |
| Rail offline banner text  | `text-warn`    |                                               |
| Rail offline banner border| `border-warn/30`|                                              |
| Skeleton pulse base       | `bg-elevated`  | Animated opacity 40%→100%→40%                 |

---

## 4. Density & Spacing

### 4.1 Row Height and Block Layout

Target: 15 ticker rows + 3 block headers + footnote fits within 900px viewport height (856px available after 44px Nav).

| Component                        | Height   |
|----------------------------------|----------|
| Block header row                 | 24px     |
| Ticker row                       | 26px     |
| Block separator (border only)    | 1px      |
| Footnote zone                    | 36px     |
| Rail top padding                 | 4px      |

**Calculation:**
- 3 headers: 3 × 24px = 72px
- 15 rows: 15 × 26px = 390px
- 2 separators: 2 × 1px = 2px
- Footnote: 36px
- Top pad: 4px
- **Total: 504px** — well within 900px. Leaves ~350px headroom for additional content or slightly looser density if desired.

### 4.2 Ticker Row Internal Layout

Each ticker row is a single flex row, `h-[26px] flex items-center px-3`:

```
[symbol 11px muted]   [price 12px foreground]   [pct 11px pos/neg]
flex-shrink-0 w-12    flex-1 text-right          w-14 text-right
```

- Symbol column: `w-12 text-[11px] text-muted font-mono flex-shrink-0`
- Price column: `flex-1 text-right text-[12px] text-foreground font-mono tabular-nums`
- Pct column: `w-14 text-right text-[11px] font-mono font-medium tabular-nums` with `text-pos` or `text-neg` or `text-muted`

### 4.3 Block Header Row Layout

```
[LABEL 10px uppercase muted tracking]   [SESSION BADGE right-aligned]
```

`h-[24px] flex items-center justify-between px-3`

---

## 5. States

### 5.1 Default

Rail renders with live data. Prices show `text-foreground`, pct shows `text-pos` / `text-neg`.

### 5.2 Hover

Ticker row: `hover:bg-elevated cursor-default`. No transition needed — terminals are instant. Do not apply hover to block headers.

### 5.3 Loading / Skeleton

On initial mount before first data fetch, show skeleton rows. Do not show blank space.

Skeleton ticker row: replace price and pct columns with:
- Price skeleton: `h-3 w-14 rounded bg-elevated animate-pulse ml-auto`
- Pct skeleton: `h-3 w-10 rounded bg-elevated animate-pulse`

Use CSS `@keyframes pulse` (opacity 40%→100%→40%, 1.4s ease-in-out infinite). This is the Tailwind `animate-pulse` default. Apply at the rail container level: no per-row JS state needed.

Symbol column still renders the text label during skeleton phase — the ticker name is known statically.

### 5.4 Stale Data (API responded but data is old — >5 min)

- Price and pct remain visible but dimmed: add `opacity-60` to the price and pct text.
- Block header gains a small amber dot: `w-1.5 h-1.5 rounded-full bg-warn` inline after the label text.
- No banner — stale is a row-level indicator, not a rail-level alert.

### 5.5 Rail Offline (API unreachable — no response)

Replace the block's ticker rows with a single inline banner inside that block's content area:

```
<div class="mx-3 my-1 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono">
  QUOTE FEED OFFLINE
</div>
```

Last-known prices stay visible above the banner with `opacity-40` if cached. If no cache, show skeleton rows.

Do NOT use red for this state. Amber signals "degraded" without implying negative price movement.

### 5.6 Minimised State (36px strip)

See §6 for full minimised spec.

---

## 6. Minimised Rail States

### 6.1 Left Rail Minimised (36px wide)

The 36px strip shows exactly 3 condensed items (SPY, QQQ, VIX) stacked vertically, plus the expand affordance at the bottom.

**Strip layout:** `w-9 flex flex-col items-center py-1 gap-0 border-r border-line bg-surface`

Each mini item: `w-full flex flex-col items-center py-1.5 gap-0.5 hover:bg-elevated`

```
[SYM 9px muted]     ← text-[9px] text-muted font-mono uppercase
[±0.00% 11px]       ← text-[11px] font-mono font-medium tabular-nums text-pos / text-neg
```

- SYM label: `text-[9px] font-mono text-muted leading-none`
- Pct: `text-[11px] font-mono font-medium tabular-nums leading-none` + `text-pos` or `text-neg`
- No price shown in minimised state — only the delta.

**Expand affordance:**
Positioned at `mt-auto` bottom of the strip.

```
<button class="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated">
  ›  <!-- Unicode U+203A, 14px, rotated 0deg when collapsed = "expand right" -->
</button>
```

When expanded, the same button shows `‹` (U+2039) — "collapse left". The character is `text-[14px]`. No animation on the icon itself — state is immediate.

Focus ring: `focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2` (already in globals.css via `*:focus-visible`).

### 6.2 Right Rail Minimised (36px strip)

Vertical "NEWS" label rotated 90 degrees, plus the expand affordance at top.

```
<div class="w-9 flex flex-col items-center py-1 border-l border-line bg-surface">
  <!-- expand button top -->
  <button class="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated">
    ‹
  </button>
  <!-- rotated label -->
  <span class="text-[9px] font-mono font-medium uppercase tracking-[0.12em] text-muted mt-4"
        style="writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 0.12em">
    NEWS
  </span>
</div>
```

When expanded: button shows `›` (expand = push outward, collapse = pull inward convention is reversed on the right side).

---

## 7. Right Rail — Designed Empty State

The right rail is a designed shell, not a stub. It must not look like a placeholder accident.

### 7.1 Expanded Empty State Structure

```
┌────────────────────────────────┐
│  NEWS  ·  WS-3                 │  ← header row
├────────────────────────────────┤
│                                │
│  ────────────────────          │  ← placeholder lines (muted bars)
│  ─────────────────             │
│  ──────────────────────        │
│                                │
│  Live feed and macro           │  ← placeholder text
│  sentiment arrive              │
│  with WS-3.                    │
│                                │
└────────────────────────────────┘
```

**Header row:**
`h-[24px] flex items-center justify-between px-3 border-b border-line`

- Left: `text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono` — text "NEWS"
- Right: `text-[10px] font-mono text-muted opacity-50` — text "WS-3"

**Placeholder bars** (simulate news headlines without fake data):
Three horizontal bars at 60%, 75%, 55% width respectively:
`h-2 rounded bg-elevated opacity-50` — static, no pulse animation (pulsing would imply loading, which is incorrect — this is intentional empty state).

Container: `px-3 pt-4 flex flex-col gap-2`

**Explanatory text:**
`text-[11px] font-mono text-muted opacity-60 px-3 pt-3 leading-relaxed`
Content: "Live feed and macro sentiment arrive with WS-3."

### 7.2 Color

Nothing in the right rail uses `text-pos`, `text-neg`, or `text-warn`. It is uniformly `text-muted` with varying opacity. This reads as "intentionally dormant" rather than "error" or "data."

---

## 8. Concrete Tailwind Class Recipes

Copy-paste ready. Implementers use these verbatim.

### 8.1 Ticker Row (left rail, expanded)

```html
<div class="h-[26px] flex items-center px-3 hover:bg-elevated cursor-default">
  <span class="w-12 text-[11px] font-mono text-muted flex-shrink-0 leading-none">ES</span>
  <span class="flex-1 text-right text-[12px] font-mono tabular-nums text-foreground leading-none">5 247.25</span>
  <span class="w-14 text-right text-[11px] font-mono font-medium tabular-nums text-pos leading-none">+0.34%</span>
</div>
```

For negative pct: replace `text-pos` with `text-neg`.
For flat (|pct| < 0.05): replace `text-pos` with `text-muted`.

### 8.2 Block Header Row

```html
<div class="h-[24px] flex items-center justify-between px-3">
  <span class="text-[10px] font-medium uppercase tracking-[0.08em] text-muted font-mono leading-none">Futures</span>
  <!-- session badge (equity block only) -->
  <span class="rounded px-1.5 py-px text-[10px] font-medium font-mono bg-accent/25 text-accent leading-none">REG</span>
</div>
```

For CLOSED badge: replace `bg-accent/25 text-accent` with `bg-warn/10 text-warn`.

### 8.3 FX Session Chip (overlap)

```html
<span class="rounded px-1.5 py-px text-[9px] font-mono font-medium bg-teal/15 text-teal leading-none">LDN·NY</span>
```

Single session: replace `bg-teal/15 text-teal` with `bg-elevated text-accent` (NY/LDN) or `bg-elevated text-muted` (ASIA).

### 8.4 Minimised Strip Item

```html
<div class="w-full flex flex-col items-center py-1.5 gap-0.5 hover:bg-elevated cursor-default">
  <span class="text-[9px] font-mono text-muted leading-none uppercase">SPY</span>
  <span class="text-[11px] font-mono font-medium tabular-nums text-pos leading-none">+0.41%</span>
</div>
```

### 8.5 Collapse / Expand Button

```html
<!-- On left rail, expanded → click collapses -->
<button class="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated">
  <span class="text-[14px] leading-none select-none">‹</span>
</button>

<!-- On left rail, collapsed → click expands -->
<button class="w-9 h-9 flex items-center justify-center text-muted hover:text-foreground hover:bg-elevated">
  <span class="text-[14px] leading-none select-none">›</span>
</button>
```

### 8.6 Rail Offline Banner (inside a block)

```html
<div class="mx-3 my-1 px-2 py-1.5 rounded border border-warn/30 bg-warn/10 text-warn text-[10px] font-mono leading-snug">
  QUOTE FEED OFFLINE
</div>
```

### 8.7 Stale Indicator Dot (in block header)

```html
<!-- Append after label text inside block header -->
<span class="inline-block w-1.5 h-1.5 rounded-full bg-warn ml-1.5 flex-shrink-0"></span>
```

### 8.8 Skeleton Row

```html
<div class="h-[26px] flex items-center px-3 gap-2">
  <span class="w-12 text-[11px] font-mono text-muted flex-shrink-0 leading-none">ES</span>
  <div class="flex-1 flex justify-end">
    <div class="h-3 w-14 rounded bg-elevated animate-pulse"></div>
  </div>
  <div class="w-14 flex justify-end">
    <div class="h-3 w-10 rounded bg-elevated animate-pulse"></div>
  </div>
</div>
```

### 8.9 Rail Shell (3-column wrapper)

```html
<!-- Wraps children in layout.tsx instead of bare fragment -->
<div class="flex flex-row h-[calc(100vh-var(--nav-h))]">
  <!-- Left rail — insert LeftRail component here -->
  <!-- Content -->
  <main class="flex-1 min-w-0 overflow-y-auto">
    {children}
  </main>
  <!-- Right rail — insert RightRail component here -->
</div>
```

### 8.10 Footnote Zone (bottom of left rail, expanded)

```html
<div class="mt-auto px-3 py-2 border-t border-line">
  <p class="text-[10px] font-mono text-muted opacity-60 leading-relaxed">
    macro gauges · market blurb · today&rsquo;s events&thinsp;—&thinsp;land with WS-3
  </p>
</div>
```

---

## 9. Deferred Features (Visible but Inactive — WS-3)

The following are shown as designed empty states, not hidden:

- Macro gauge widgets (left rail, below Forex block)
- Market blurb / daily narrative
- Economic calendar events
- Right rail: live news feed
- Right rail: macro sentiment score

These are named in the footnote exactly as specified above. They are never shown as "Coming Soon" (marketing language) — they are referenced by workstream ID, which reads as engineering status, not product positioning.

---

## 10. Reference-Grounded Design Rationale

**1. Row density calibrated to Bloomberg terminal defaults.**
Bloomberg's quote sheets use approximately 20px row heights at 11–12px type. This spec targets 26px rows to accommodate the additional pct column without crowding, while staying well below typical 32–36px "comfortable" UI rows. The result is ~15 rows visible without scroll on a 900px viewport — the same cognitive load as a Bloomberg market monitor panel. Taller rows would waste the rail's narrow column width and break the terminal aesthetic.

**2. Session overlap uses teal (not a second shade of green or blue) — TradingView pattern.**
TradingView's session indicators use a distinct third color for overlapping sessions (typically a brighter or contrasting hue) to differentiate overlap from any single session. Using teal from the existing token set achieves this without adding a new token: it is visually distinct from both `--accent` (blue, interactive) and `--muted` (gray, inactive), and carries zero up/down semantic. Amber and red are excluded from session chips to prevent users from reading "LDN·NY overlap" as a warning or negative data point.

**3. Designed empty state over hidden panels — Linear-dark convention.**
Linear's dark UI surfaces empty states as intentional structures with muted placeholder geometry rather than hiding sections or showing raw "N/A" text. The right rail empty state uses static (non-pulsing) placeholder bars to communicate "this area is reserved and awaiting content" distinctly from "loading." Pulse animation is reserved for skeleton loading (data expected imminently). Static bars communicate a longer-horizon absence — the correct signal for a feature landing in WS-3.

---

## 11. Implementation Notes

- Rail collapse state is managed via a React context or URL search param (`?ql=0&qr=0`). URL param preferred — allows linking to a specific layout state and survives page navigation.
- Rail widths are fixed pixel values (`w-[200px]`, `w-[260px]`, `w-9`), not percentage-based. At the min viewport width this dashboard targets (1280px), the content area is never narrower than 780px.
- VIX in the Futures block: display value as `24.31` (no sign, no color). VIX is a volatility index — its direction chip uses `text-pos` / `text-neg` only for the session change, not the absolute level.
- `font-mono` at the rail container overrides the `system-ui` font set in `layout.tsx` body. Apply `font-mono` to both rail root elements directly — do not modify the body rule.
- `tabular-nums` must be applied to every element displaying a price or percentage. Misaligned columns break the terminal aesthetic immediately.
- The 3-column shell must be implemented in `layout.tsx` to wrap all pages. The LeftRail and RightRail are client components (they will poll a quote API) mounted once in layout, not remounted on page navigation.
