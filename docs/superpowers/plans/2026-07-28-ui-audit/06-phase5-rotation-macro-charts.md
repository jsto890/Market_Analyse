# Phase 5: Rotation, Macro & Chart Conventions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close every RO-xx (Rotation) and MC-xx (Macro) audit finding and establish the one chart-convention spec (X-02) that `RRGChart`, `MacroChart`, and `CandleChart` migrate onto in this phase — with `GexChart`'s later migration (owned by a different agent) able to apply the same spec without asking questions.
**Architecture:** Two Recharts/SVG-based charts (`RRGChart`) and two lightweight-charts/canvas-based charts (`MacroChart`, `CandleChart`) currently each invent their own palette, axis treatment, and fixed pixel height. This phase introduces one shared, framework-agnostic token/height/tooltip contract in `lib/chartConventions.ts`, migrates all three in-scope charts onto it, and separately fixes the Rotation and Macro pages' own structural/accessibility findings (bespoke table, unglossed headers, orphaned scope state, misplaced empty state, unlabelled toggle-buttons).
**Tech Stack:** Next.js 14.2 App Router, React 18.3, Recharts 3.8.1, lightweight-charts 4.2.3, `@radix-ui/react-tooltip`, Vitest 4 (`component` project, jsdom), React Testing Library 16.3, `@/test/render`, `@/test/fetchMock`, `@/test/localStorage`.
**Depends on:** Phase 0 (test infra — `@/test/render`, `mockFetchJson`, `resetLocalStorage`/`seedLocalStorage`, the `ResizeObserver` stub), Phase 1 (design system — `Button`, `Toggle`, `InfoTip`, `Collapsible`, `CenterBar`, `PageHeader` already exists pre-Phase-1 and is reused as-is), `00-foundations-contract.md` (`lib/format.ts`, `lib/labels.ts`, `lib/storageKeys.ts`, tokens).

## Global Constraints
- All commands run from `/Users/josephstorey/Market_Analyse/dashboard`.
- Test command for every task in this plan: `npm run test:component` (Vitest `component` project — jsdom, RTL, the setup file's `ResizeObserver`/`matchMedia` stubs).
- Every new/edited component test imports `render`/`screen`/`userEvent` from `@/test/render`, never directly from `@testing-library/react` (see `01-phase0-test-infra.md`).
- No raw Tailwind palette colors or hardcoded hex anywhere touched by this plan — tokens only (`var(--green)`, `text-pos`, `tokens.green` from `resolveChartTokens()`, etc.).
- `lib/labels.ts`'s `HEADER_GLOSS` and `QUADRANT_LABEL` maps are FROZEN (00-foundations-contract.md §D) — consumed verbatim, never re-worded, never extended with new keys from this plan.
- `components/ui/InfoTip.tsx`, `Toggle.tsx`, `Collapsible.tsx`, `lib/format.ts`, `lib/labels.ts`, `lib/storageKeys.ts` do not exist in the repo yet (verified) — they are Phase 1's deliverables. Every task below that imports them lists that import under **Consumes** so the coverage table makes the cross-phase dependency explicit.
- `PageHeader` (`components/ui/PageHeader.tsx`, `{title, subtitle, actions}` props) already exists and is already used by Screener/Portfolio/Watchlist/Alerts — reused here unchanged, not part of Phase 1's new-primitives set.
- `argus/argus/ui/index.html` (the Argus Python service's own dev UI, mentioned in roadmap item 24 and X-02) is a **separate codebase**, not a `dashboard/` file — out of scope for this plan; only `dashboard/components/charts/CandleChart.tsx`'s token migration (the dashboard-side half of roadmap item 24) is planned here.
- The nav fix that adds `/macro` to `NavLinks.tsx` (G-01/MC-01) belongs to the Chrome agent — no task for it here.

## Chart Conventions Spec

> Every chart in this app — `RRGChart`, `MacroChart`, `CandleChart` in this phase, `GexChart` in a later phase — follows this spec exactly. It is precise enough to apply to `GexChart` with no further design decisions needed.

### 1. Color source — `lib/chartConventions.ts`

Two families of chart renderer exist in this codebase and each needs colors delivered differently:

- **SVG/DOM charts (Recharts — `RRGChart`, and any future Recharts chart):** pass CSS custom-property references directly as string props — `stroke="var(--line)"`, `fill="var(--green)"` — exactly as `RRGChart.tsx` already does for its `ReferenceArea`/`ReferenceLine` fills today. The browser resolves `var(--x)` for SVG presentation attributes natively; no JS resolution step is needed or allowed.
- **Canvas charts (lightweight-charts — `MacroChart`, `CandleChart`, and `GexChart` if it is ever ported off Recharts):** the library's options objects (`createChart`, `addLineSeries`, `createPriceLine`, etc.) require literal, already-resolved color strings (hex/rgb) — they do not understand `var(--x)` because they paint to a `<canvas>` 2D context, not the CSS box model. These charts call `resolveChartTokens()` **once per mount/data-apply, inside a client-only effect**, and use the returned literal strings everywhere a color is needed.

`dashboard/lib/chartConventions.ts` (new file, created in Task 1) exports:

```ts
export interface ChartTokens {
  bg: string; text: string; muted: string; line: string; lineStrong: string;
  green: string; red: string; accent: string; amber: string; teal: string;
}

export function resolveChartTokens(el?: HTMLElement): ChartTokens;
export function hexWithAlpha(hex: string, alpha: number): string;
export const CHART_HEIGHT: string; // = "clamp(320px, 42vh, 640px)"
```

`resolveChartTokens()` reads `--bg`, `--text`, `--muted`, `--line`, `--line-strong`, `--green`, `--red`, `--accent`, `--amber`, `--teal` off `getComputedStyle(el ?? document.documentElement)`, falling back to the exact literal values from `dashboard/app/globals.css`'s `:root` block if a property resolves empty (defends against calling this before the stylesheet is attached — should not happen in practice since it is only ever called from a mount-time effect, but the fallback keeps behavior identical to today's hardcoded colors in that edge case rather than rendering `undefined`/black).

`hexWithAlpha(hex, alpha)` appends an 8-digit-hex alpha channel (`"#3fb950"` + `0.4` → `"#3fb95066"`) — canvas 2D `fillStyle` accepts 8-digit hex directly in every browser this app targets, so this avoids a separate rgba-string code path for colors that originate as resolved hex from `resolveChartTokens()`.

**Rule: no chart file may contain a hex literal or an `rgba(...)` literal anywhere.** Every color is either a `var(--x)` string (SVG charts) or a `resolveChartTokens()`/`hexWithAlpha()` result (canvas charts).

### 2. Categorical vs. directional color

- **Directional/signed values** (candle up/down, return cells, GEX curve above/below zero, stop/target price lines) — always `var(--green)` / `var(--red)` (or `tokens.green`/`tokens.red` for canvas charts). Never a third color for "flat"/zero; zero-ish values round to whichever sign they carry, or render muted if truly N/A.
- **Categorical/multi-state values** (RRG's four quadrants: leading/improving/weakening/lagging) are a 4-way taxonomy, not a signed value, and are exempt from the pos/neg-only rule — they use the fixed mapping `{ leading: var(--green), improving: var(--teal), weakening: var(--amber), lagging: var(--red) }` (this exact mapping lives in `lib/rotation.ts`, Task 2, and is the ONE place it is defined — every chart and every table cell that needs a quadrant color imports it from there, never redefines it locally). This is RO-01's fix mechanism: one swatch map, imported everywhere, instead of two independently-hand-rolled color tables.
- **Neutral reference values** (candle entry-price line, EMA lines that aren't inherently bullish/bearish signals) use `var(--text)` (entry — it's "where you are", not "good/bad"), `var(--accent)` (EMA 20 — matches the app's one accent hue, already `#4c8dff` = `--accent` exactly today), `var(--amber)` (EMA 50 — already `#d29922` = `--amber` exactly today), `var(--muted)` (EMA 200 / SPY overlay lines — de-emphasized reference series).

### 3. Axes, grid, reference/zero lines

- **Grid lines:** `var(--line)`, dashed (`strokeDasharray="3 3"` for Recharts `CartesianGrid`) or, for lightweight-charts, `horzLines: { color: tokens.line }` with `vertLines: { visible: false }` — **vertical gridlines are always off** on time-series canvas charts (matches `MacroChart`'s existing, correct choice; `CandleChart` currently shows both and is wrong per this rule — fixed in Task 8).
- **Axis ticks/labels:** `var(--muted)` (or `tokens.muted`), `fontSize: 11` (the data-floor size per `00-foundations-contract.md` §A.2) for Recharts; canvas charts' single `textColor` option does the equivalent job.
- **Axis border/scale line:** `var(--line-strong)` (or `tokens.lineStrong`) — **one step darker/stronger than the grid**, so the axis reads as structural, not just another gridline.
- **Reference/zero lines** (RRG's 100/100 crosshair, a future zero-GEX line) are `var(--line-strong)` (or `tokens.lineStrong`), solid (no dash) — this is a deliberate distinction from grid lines (`var(--line)`, dashed): a reference line marks a *meaningful* threshold, a grid line is just a ruler tick, and today's `RRGChart` uses the identical `var(--border)` for both, erasing that distinction. `var(--border)` itself (the legacy alias for `--line`, `globals.css`) is never referenced directly in new/edited chart code — use the canonical `--line`/`--line-strong` names.
- **Background:** canvas charts always set `layout.background: { type: ColorType.Solid, color: "transparent" }` — never a hex background — so the chart inherits whatever card/surface token (`bg-elevated`, `bg-surface`, etc.) wraps it, instead of hardcoding a shade of dark that silently drifts from the surrounding chrome (this is the literal mechanism behind X-02's "third palette" finding — `CandleChart`'s `#0b0e14` background is neither `--bg` (`#06090f`) nor Argus's own `#0b0e14`-as-`--bg`-equivalent; going transparent removes the question entirely).

### 4. Tooltip markup

One tooltip visual language, used by every chart (Recharts `<Tooltip content={...}/>` custom component; lightweight-charts has no built-in tooltip API so canvas charts that need one build the same DOM markup manually, positioned via the series' crosshair-move callback — out of scope for `MacroChart`/`CandleChart` in this phase, neither currently has a tooltip, and neither audit finding requires adding one):

```tsx
<div className="rounded border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-lg">
  <div className="font-medium text-text">{title}</div>
  <div className="text-muted">{subtitle}</div>
  <div className="mt-1 grid grid-cols-2 gap-x-3 text-muted">
    <span>{label}</span>
    <span className="text-right text-text tabular-nums">{value}</span>
    {/* one label/value pair per row; numeric values always right-aligned + tabular-nums */}
  </div>
</div>
```

This is `RRGChart.tsx`'s existing `RRGTooltip` markup verbatim — it is already correct and is the canonical reference implementation; nothing changes about it in this plan except its color values already being token-based (they are — no fix needed there).

### 5. Height policy

**One constant, `CHART_HEIGHT = "clamp(320px, 42vh, 640px)"`, replaces every hardcoded pixel height** (`RRGChart`'s `420`, `MacroChart`'s `320`, and — for `GexChart`'s later migration — whatever it currently hardcodes). Mechanism differs slightly by renderer, but the CSS value is identical everywhere:

- **Recharts:** the outer wrapping `<div>` around `<ResponsiveContainer>` gets `style={{ height: CHART_HEIGHT }}` — `ResponsiveContainer` fills whatever CSS height its parent resolves to, so a plain CSS string is sufficient, no JS measurement needed.
- **lightweight-charts:** `createChart(el, { autoSize: true, height, ... })` — with `autoSize: true` (already set on both `MacroChart` and `CandleChart` today), the library's own docs (`node_modules/lightweight-charts/dist/typings.d.ts:748-749`) state the numeric `height` option is used **only as a fallback if `ResizeObserver` fails**; the real, ongoing size comes from the container element's actual CSS box via `ResizeObserver`. Therefore: give the container `<div ref={containerRef}>` an inline `style={{ height: CHART_HEIGHT }}` (a real CSS height, so `ResizeObserver` has a genuine, viewport-responsive box to measure) and **keep** the numeric `height` prop/option exactly as today, unchanged, purely as the documented failure-fallback value — it is not the primary sizing mechanism either before or after this change, so leaving it alone is both correct and the lowest-risk diff.
- `CandleChart`'s only caller (`app/t/[ticker]/page.tsx`, out of scope — Ticker page is excluded from this phase) passes an explicit `height={420}` prop and its own `className="min-h-[420px] 2xl:min-h-[560px]"` wrapper. Applying `CHART_HEIGHT` to the container is a deliberate, in-scope, backward-compatible improvement: the `height` prop's meaning (fallback-only, per the library docs above) is unchanged, so no caller-visible prop contract breaks; only the *rendered* size on that one page becomes viewport-responsive instead of flat — the intended, generalized version of what that page's own `2xl:min-h-[560px]` breakpoint was already informally trying to achieve.

### 6. Accessibility

- Each chart's outermost wrapping element gets `role="img"` and a descriptive `aria-label` (e.g. `"Relative Rotation Graph scatter plot, N sectors"`) — charts are not independently keyboard-navigable in this phase (no finding requires that), so the label is the floor: a screen-reader user gets *told there is a chart and roughly what it shows*, and is expected to reach the equivalent data through the always-present tabular/list fallback that sits next to every chart in this app (`RotationPanel`'s table next to `RRGChart`, the gauge cards next to `MacroChart`, `ChartInfoStrip` next to `CandleChart`) — none of which this plan needs to newly create, they already exist.
- Tooltip triggers that are interactive (none of the three in-scope charts currently have a focusable/keyboard tooltip trigger *inside* the chart itself — `RRGChart`'s tooltip is Recharts' built-in hover-only `<Tooltip>`, out of scope to make keyboard-accessible here) are unaffected by this plan; `InfoTip` (Phase 1) is the primitive for anywhere a chart is annotated with a keyboard-focusable info trigger *outside* the plotted area (e.g. a header tooltip in `RotationPanel`'s table).

### 7. Assertion strategy for chart tests (binding on every task below)

Recharts' `<ResponsiveContainer>` measures its parent via `ResizeObserver`; Phase 0's jsdom stub (`test/setup.ts`) is an inert no-op (`observe()`/`unobserve()`/`disconnect()` do nothing, never fire a callback), so `ResponsiveContainer` never receives a non-zero size in tests and Recharts v3 does not render its children into the DOM in that state. lightweight-charts' `createChart()` requires a real `<canvas>` 2D context, which jsdom does not implement (`getContext()` throws `Not implemented`). Consequently:

- **Never** assert on Recharts-internal or lightweight-charts-internal rendered SVG/canvas output in a component test.
- **Do** extract every pure data transform and every color/height decision into named, exported functions/constants in a plain `.ts` file (`lib/rotation.ts`, `lib/chartConventions.ts`, or named exports colocated in the `.tsx` chart file where the logic is genuinely component-local) and unit-test those directly with plain object fixtures — no rendering required.
- **Do** component-test whatever plain-DOM JSX sits *outside* the measured/canvas element (page headers, legends, "hidden sectors" lists, empty states, gauge-card buttons) with `@/test/render` + RTL — these render fine in jsdom regardless of the chart-internal limitations above, since they are ordinary React elements, not chart-library output.
- For `CandleChart` specifically: only ever mount it in tests with `initialBars={[]}` (the component's own early-return path renders `<EmptyState>` **before** `containerRef` is ever attached to a real DOM node, so the mount effect's `if (!containerRef.current) return;` guard bails before `lightweight-charts` is even dynamically imported — this is what makes the empty-state path safe to render in jsdom while the real-data path, which would call `createChart()`, is not).

## File Structure

| File | Change | Task |
|---|---|---|
| `dashboard/lib/chartConventions.ts` | new | 1 |
| `dashboard/lib/chartConventions.test.ts` | new | 1 |
| `dashboard/lib/rotation.ts` | new | 2 |
| `dashboard/lib/rotation.test.ts` | new | 2 |
| `dashboard/components/rotation/RRGChart.tsx` | edit | 3, 4, 5 |
| `dashboard/components/rotation/__tests__/RRGChart.test.tsx` | new | 3, 4, 5 |
| `dashboard/components/today/RotationPanel.tsx` | edit | 6, 7, 8, 9 |
| `dashboard/components/today/__tests__/RotationPanel.test.tsx` | new | 6, 7, 8, 9 |
| `dashboard/app/rotation/page.tsx` | edit | 10 |
| `dashboard/app/rotation/__tests__/page.test.tsx` | new | 10 |
| `dashboard/components/macro/MacroChart.tsx` | edit | 11 |
| `dashboard/components/macro/__tests__/MacroChart.test.tsx` | new | 11 |
| `dashboard/app/macro/page.tsx` | edit | 12, 13, 14, 15 |
| `dashboard/app/macro/__tests__/page.test.tsx` | new | 12, 13, 14, 15 |
| `dashboard/components/rails/MacroGauges.tsx` | edit | 16 |
| `dashboard/components/rails/__tests__/MacroGauges.test.tsx` | new | 16 |

---

### Task 1: `lib/chartConventions.ts` — shared token resolver, height, axis style

**Files:** `dashboard/lib/chartConventions.ts` (new), `dashboard/lib/chartConventions.test.ts` (new)
**Interfaces:**
```ts
export interface ChartTokens {
  bg: string; text: string; muted: string; line: string; lineStrong: string;
  green: string; red: string; accent: string; amber: string; teal: string;
}
export function resolveChartTokens(el?: HTMLElement): ChartTokens;
export function hexWithAlpha(hex: string, alpha: number): string;
export const CHART_HEIGHT: string;
export const CHART_AXIS_STYLE: { tick: string; axisLine: string; grid: string; referenceLine: string; pointLabel: string };
```
**Audit findings closed:** none directly (foundation for X-02, consumed by Tasks 3, 11).

- [ ] Step 1: Create `dashboard/lib/chartConventions.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { resolveChartTokens, hexWithAlpha, CHART_HEIGHT, CHART_AXIS_STYLE } from "@/lib/chartConventions";

  describe("resolveChartTokens", () => {
    it("reads CSS custom properties off the given element", () => {
      const el = document.createElement("div");
      el.style.setProperty("--bg", "#111111");
      el.style.setProperty("--text", "#eeeeee");
      el.style.setProperty("--muted", "#999999");
      el.style.setProperty("--line", "#222222");
      el.style.setProperty("--line-strong", "#333333");
      el.style.setProperty("--green", "#00ff00");
      el.style.setProperty("--red", "#ff0000");
      el.style.setProperty("--accent", "#0000ff");
      el.style.setProperty("--amber", "#ffaa00");
      el.style.setProperty("--teal", "#00ffff");
      document.body.appendChild(el);
      const tokens = resolveChartTokens(el);
      expect(tokens).toEqual({
        bg: "#111111", text: "#eeeeee", muted: "#999999", line: "#222222",
        lineStrong: "#333333", green: "#00ff00", red: "#ff0000",
        accent: "#0000ff", amber: "#ffaa00", teal: "#00ffff",
      });
      document.body.removeChild(el);
    });

    it("falls back to the globals.css literal values when a property resolves empty", () => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      const tokens = resolveChartTokens(el);
      expect(tokens.bg).toBe("#06090f");
      expect(tokens.green).toBe("#3fb950");
      expect(tokens.red).toBe("#f85149");
      expect(tokens.accent).toBe("#4c8dff");
      document.body.removeChild(el);
    });
  });

  describe("hexWithAlpha", () => {
    it("appends an 8-digit alpha channel", () => {
      expect(hexWithAlpha("#3fb950", 0.4)).toBe("#3fb95066");
      expect(hexWithAlpha("#f85149", 1)).toBe("#f85149ff");
      expect(hexWithAlpha("#f85149", 0)).toBe("#f8514900");
    });
  });

  describe("chart-wide constants", () => {
    it("CHART_HEIGHT is the shared responsive clamp, not a fixed pixel value", () => {
      expect(CHART_HEIGHT).toBe("clamp(320px, 42vh, 640px)");
    });

    it("CHART_AXIS_STYLE references only design tokens, never hex literals", () => {
      Object.values(CHART_AXIS_STYLE).forEach((v) => {
        expect(v.startsWith("var(--")).toBe(true);
      });
      expect(CHART_AXIS_STYLE).toEqual({
        tick: "var(--muted)",
        axisLine: "var(--line-strong)",
        grid: "var(--line)",
        referenceLine: "var(--line-strong)",
        pointLabel: "var(--text)",
      });
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- chartConventions` — confirm it fails (`Cannot find module '@/lib/chartConventions'`).
- [ ] Step 3: Create `dashboard/lib/chartConventions.ts`:
  ```ts
  /** Shared chart-rendering conventions — colors, height, axis style — for
   *  every chart in the app (Recharts SVG charts and lightweight-charts canvas
   *  charts alike). See docs/superpowers/plans/2026-07-28-ui-audit/06-phase5-rotation-macro-charts.md
   *  "Chart Conventions Spec" for the full rationale. */

  export interface ChartTokens {
    bg: string; text: string; muted: string; line: string; lineStrong: string;
    green: string; red: string; accent: string; amber: string; teal: string;
  }

  /** globals.css `:root` literal values — used only if a custom property
   *  resolves empty (defends against calling this before the stylesheet is
   *  attached; should not happen since callers only invoke this from a
   *  mount-time effect). */
  const FALLBACK: ChartTokens = {
    bg: "#06090f", text: "#eef1f6", muted: "#7d8698", line: "#1e2634",
    lineStrong: "#2c3648", green: "#3fb950", red: "#f85149",
    accent: "#4c8dff", amber: "#d29922", teal: "#2dd4bf",
  };

  function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
    const v = style.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  }

  /** Resolve the app's CSS custom properties into literal color strings, for
   *  chart libraries (lightweight-charts) that paint to a <canvas> and cannot
   *  understand `var(--x)` references. Call once per mount/data-apply, inside
   *  a client-only effect — never at module scope. */
  export function resolveChartTokens(el: HTMLElement = document.documentElement): ChartTokens {
    const style = getComputedStyle(el);
    return {
      bg: readVar(style, "--bg", FALLBACK.bg),
      text: readVar(style, "--text", FALLBACK.text),
      muted: readVar(style, "--muted", FALLBACK.muted),
      line: readVar(style, "--line", FALLBACK.line),
      lineStrong: readVar(style, "--line-strong", FALLBACK.lineStrong),
      green: readVar(style, "--green", FALLBACK.green),
      red: readVar(style, "--red", FALLBACK.red),
      accent: readVar(style, "--accent", FALLBACK.accent),
      amber: readVar(style, "--amber", FALLBACK.amber),
      teal: readVar(style, "--teal", FALLBACK.teal),
    };
  }

  /** Append an 8-digit hex alpha channel to a resolved hex color, e.g. for
   *  canvas fillStyle transparency without a separate rgba() code path. */
  export function hexWithAlpha(hex: string, alpha: number): string {
    const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    return `${hex}${a.toString(16).padStart(2, "0")}`;
  }

  /** One responsive height for every chart — replaces every hardcoded pixel
   *  height (RRGChart's 420, MacroChart's 320). See spec §5. */
  export const CHART_HEIGHT = "clamp(320px, 42vh, 640px)";

  /** SVG/Recharts axis + grid + reference-line token colors — one place, so
   *  every Recharts-based chart resolves the same way instead of hand-rolling
   *  hex literals (RRGChart today; GexChart later). See spec §3. */
  export const CHART_AXIS_STYLE = {
    tick: "var(--muted)",
    axisLine: "var(--line-strong)",
    grid: "var(--line)",
    referenceLine: "var(--line-strong)",
    pointLabel: "var(--text)",
  } as const;
  ```
- [ ] Step 4: Run `npm run test:component -- chartConventions` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 2: `lib/rotation.ts` — shared quadrant color, degenerate split, label-collision detection

**Files:** `dashboard/lib/rotation.ts` (new), `dashboard/lib/rotation.test.ts` (new)
**Interfaces:**
```ts
export const QUADRANT_COLOR: Record<string, string>;
export function deriveQuadrant(row: { quadrant: string; rs_ratio: number; rs_mom: number }): string;
export function abbreviate(name: string, max?: number): string;
export function splitDegenerate<T extends { rs_ratio: number; rs_mom: number }>(rows: T[]): { plotted: T[]; hidden: T[] };
export function computeLabelCollisions<T extends { rs_ratio: number; rs_mom: number }>(points: T[], threshold?: number): boolean[];
```
**Audit findings closed:** foundation for RO-01, RO-06, RO-07 (extraction only — consumers migrated in Tasks 3-6).

- [ ] Step 1: Create `dashboard/lib/rotation.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { QUADRANT_COLOR, deriveQuadrant, abbreviate, splitDegenerate, computeLabelCollisions } from "@/lib/rotation";

  describe("QUADRANT_COLOR", () => {
    it("has exactly the four JdK RRG quadrants, token-referenced", () => {
      expect(QUADRANT_COLOR).toEqual({
        leading: "var(--green)",
        improving: "var(--teal)",
        weakening: "var(--amber)",
        lagging: "var(--red)",
      });
    });
  });

  describe("deriveQuadrant", () => {
    it("trusts an explicit known quadrant field", () => {
      expect(deriveQuadrant({ quadrant: "leading", rs_ratio: 50, rs_mom: 50 })).toBe("leading");
    });
    it("derives from RS-Ratio/RS-Mom when quadrant is unknown", () => {
      expect(deriveQuadrant({ quadrant: "", rs_ratio: 101, rs_mom: 101 })).toBe("leading");
      expect(deriveQuadrant({ quadrant: "", rs_ratio: 99, rs_mom: 101 })).toBe("improving");
      expect(deriveQuadrant({ quadrant: "", rs_ratio: 101, rs_mom: 99 })).toBe("weakening");
      expect(deriveQuadrant({ quadrant: "", rs_ratio: 99, rs_mom: 99 })).toBe("lagging");
    });
  });

  describe("abbreviate", () => {
    it("passes short names through", () => {
      expect(abbreviate("Energy")).toBe("Energy");
    });
    it("truncates with an ellipsis at the max length", () => {
      expect(abbreviate("Semiconductors & Equip", 10)).toBe("Semicondu…");
    });
  });

  describe("splitDegenerate", () => {
    it("separates flat 100/100 rows from real ones, and names them (RO-06)", () => {
      const rows = [
        { industry: "Energy", rs_ratio: 105, rs_mom: 98 },
        { industry: "Utilities", rs_ratio: 100.01, rs_mom: 99.98 },
        { industry: "Telecom", rs_ratio: 92, rs_mom: 110 },
      ];
      const { plotted, hidden } = splitDegenerate(rows);
      expect(plotted.map((r) => r.industry)).toEqual(["Energy", "Telecom"]);
      expect(hidden.map((r) => r.industry)).toEqual(["Utilities"]);
    });
  });

  describe("computeLabelCollisions", () => {
    it("flags points within the threshold of a neighbour, leaves isolated points unflagged", () => {
      const points = [
        { rs_ratio: 100, rs_mom: 100 },
        { rs_ratio: 100.5, rs_mom: 100.5 }, // ~0.7 units from point 0 -> collides
        { rs_ratio: 130, rs_mom: 70 }, // far from everything -> isolated
      ];
      expect(computeLabelCollisions(points, 1.5)).toEqual([true, true, false]);
    });
    it("returns all-false for a single point", () => {
      expect(computeLabelCollisions([{ rs_ratio: 100, rs_mom: 100 }])).toEqual([false]);
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- lib/rotation` — confirm it fails (`Cannot find module '@/lib/rotation'`).
- [ ] Step 3: Create `dashboard/lib/rotation.ts`:
  ```ts
  /** Shared Relative Rotation Graph (JdK RRG) domain logic — the single place
   *  RRGChart and RotationPanel both source quadrant color from (RO-01), and
   *  where the degenerate-row split (RO-06) and label-collision detection
   *  (RO-07) live so they're unit-testable without rendering a chart. */

  interface QuadrantInput {
    quadrant: string;
    rs_ratio: number;
    rs_mom: number;
  }

  /** Quadrant → chart/badge color. Human-readable labels live in the frozen
   *  `lib/labels.ts` QUADRANT_LABEL map, not here — this is colors only. */
  export const QUADRANT_COLOR: Record<string, string> = {
    leading: "var(--green)",
    improving: "var(--teal)",
    weakening: "var(--amber)",
    lagging: "var(--red)",
  };

  export function deriveQuadrant(row: QuadrantInput): string {
    if (row.quadrant in QUADRANT_COLOR) return row.quadrant;
    if (row.rs_ratio >= 100 && row.rs_mom >= 100) return "leading";
    if (row.rs_ratio < 100 && row.rs_mom >= 100) return "improving";
    if (row.rs_ratio >= 100 && row.rs_mom < 100) return "weakening";
    return "lagging";
  }

  export function abbreviate(name: string, max = 10): string {
    return name.length > max ? `${name.slice(0, max - 1)}…` : name;
  }

  /** Sectors whose relative-strength line is flat (constituent closes failed
   *  to load) come out exactly at 100/100 — meaningless points that pile up
   *  on the origin and collide. Split them out by name instead of just
   *  counting them (RO-06), so the chart can list which sectors are hidden. */
  export function splitDegenerate<T extends { rs_ratio: number; rs_mom: number }>(
    rows: T[]
  ): { plotted: T[]; hidden: T[] } {
    const plotted: T[] = [];
    const hidden: T[] = [];
    for (const r of rows) {
      const degenerate = Math.abs(r.rs_ratio - 100) < 0.05 && Math.abs(r.rs_mom - 100) < 0.05;
      (degenerate ? hidden : plotted).push(r);
    }
    return { plotted, hidden };
  }

  /** Data-space (RS-Ratio/RS-Mom unit) nearest-neighbour distance per point.
   *  RRGChart's always-on point labels collide when two sectors plot within a
   *  few axis-units of each other (RO-07) — points closer than `threshold` to
   *  their nearest neighbour are flagged so the chart can suppress their
   *  label and rely on the (always-present) hover tooltip instead. */
  export function computeLabelCollisions<T extends { rs_ratio: number; rs_mom: number }>(
    points: T[],
    threshold = 1.5
  ): boolean[] {
    return points.map((p, i) => {
      for (let j = 0; j < points.length; j++) {
        if (j === i) continue;
        const dx = p.rs_ratio - points[j].rs_ratio;
        const dy = p.rs_mom - points[j].rs_mom;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return true;
      }
      return false;
    });
  }
  ```
- [ ] Step 4: Run `npm run test:component -- lib/rotation` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 3: `RRGChart` — token colors, responsive height, a11y label

**Files:** `dashboard/components/rotation/RRGChart.tsx` (edit), `dashboard/components/rotation/__tests__/RRGChart.test.tsx` (new)
**Interfaces:** unchanged (`RRGChart({ rows: RotationRow[] })`).
**Consumes:** `@/lib/rotation` (`QUADRANT_COLOR`, `deriveQuadrant`, `abbreviate` — Task 2), `@/lib/chartConventions` (`CHART_HEIGHT`, `CHART_AXIS_STYLE` — Task 1), `@/lib/labels` (`QUADRANT_LABEL` — frozen, Phase 1).
**Audit findings closed:** RO-09 (fixed 420px height → responsive), X-02 (raw hex `#8b93a3`/`#c3c9d4` and undifferentiated `var(--border)` on grid vs. axis vs. reference lines → token-driven, distinguished per spec §3), duplicate local `QUADRANT_COLOR`/`QUADRANT_LABEL`/`deriveQuadrant`/`abbreviate` removed (half of RO-01, completed with Task 6).

- [ ] Step 1: Create `dashboard/components/rotation/__tests__/RRGChart.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import RRGChart from "../RRGChart";
  import { CHART_HEIGHT } from "@/lib/chartConventions";
  import type { RotationRow } from "@/components/today/RotationPanel";

  const rows: RotationRow[] = [
    { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
    { industry: "Utilities", quadrant: "lagging", rs_ratio: 95, rs_mom: 90, breadth: 20, n: 25, r1w: -1, r1m: -2, r3m: -3, rank: 2, drank: 0 },
  ];

  describe("RRGChart chart conventions", () => {
    it("labels the plot for assistive tech with the plotted sector count", () => {
      render(<RRGChart rows={rows} />);
      expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 2 sectors" })).toBeInTheDocument();
    });

    it("sizes the chart with the shared responsive height, not a fixed pixel value", () => {
      render(<RRGChart rows={rows} />);
      expect(screen.getByRole("img")).toHaveStyle({ height: CHART_HEIGHT });
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RRGChart` — confirm it fails (no `role="img"` element exists yet; height is `420`).
- [ ] Step 3: In `dashboard/components/rotation/RRGChart.tsx`, replace the import block and delete the local duplicate consts:
  ```tsx
  "use client";

  import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    CartesianGrid,
    ReferenceLine,
    ReferenceArea,
    Tooltip,
  } from "recharts";
  import Panel from "@/components/ui/Panel";
  import type { RotationRow } from "@/components/today/RotationPanel";
  import { QUADRANT_COLOR, deriveQuadrant, abbreviate } from "@/lib/rotation";
  import { CHART_HEIGHT, CHART_AXIS_STYLE } from "@/lib/chartConventions";
  import { QUADRANT_LABEL } from "@/lib/labels";
  ```
  (delete the local `QUADRANT_COLOR`, `QUADRANT_LABEL`, `deriveQuadrant`, `abbreviate` definitions that followed the old import block — they now come from the imports above.)
- [ ] Step 4: Replace the grid/axis/reference-line block:
  ```tsx
              <CartesianGrid stroke={CHART_AXIS_STYLE.grid} strokeDasharray="3 3" />
              <XAxis
                type="number"
                dataKey="rs_ratio"
                domain={xDomain}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{ fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
                stroke={CHART_AXIS_STYLE.axisLine}
                label={{ value: "RS-Ratio", position: "insideBottom", offset: -4, fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="rs_mom"
                domain={yDomain}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{ fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
                stroke={CHART_AXIS_STYLE.axisLine}
                label={{ value: "RS-Momentum", angle: -90, position: "insideLeft", fill: CHART_AXIS_STYLE.tick, fontSize: 11 }}
              />
              <ZAxis range={[80, 80]} />
              <ReferenceLine x={100} stroke={CHART_AXIS_STYLE.referenceLine} />
              <ReferenceLine y={100} stroke={CHART_AXIS_STYLE.referenceLine} />
  ```
  and the point-label `fill`:
  ```tsx
                      <text
                        x={p.cx + (right ? 7 : -7)}
                        y={p.cy + (up ? -3 : 9)}
                        fontSize={10}
                        fill={CHART_AXIS_STYLE.pointLabel}
  ```
  and the wrapper `<div>`:
  ```tsx
        <div
          role="img"
          aria-label={`Relative Rotation Graph scatter plot, ${plotted.length} sectors`}
          style={{ width: "100%", height: CHART_HEIGHT }}
        >
          <ResponsiveContainer width="100%" height="100%">
  ```
- [ ] Step 5: Run `npm run test:component -- RRGChart` — confirm it passes. Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 4: `RRGChart` — name the hidden (flat/no-data) sectors instead of only counting them

**Files:** `dashboard/components/rotation/RRGChart.tsx` (edit), `dashboard/components/rotation/__tests__/RRGChart.test.tsx` (edit)
**Consumes:** `@/lib/rotation`'s `splitDegenerate` (Task 2).
**Audit findings closed:** RO-06.

- [ ] Step 1: Append to `dashboard/components/rotation/__tests__/RRGChart.test.tsx`:
  ```tsx
  describe("RRGChart hidden sectors (RO-06)", () => {
    it("names the hidden (flat/no-data) sectors instead of only counting them", () => {
      const withHidden: RotationRow[] = [
        rows[0],
        { industry: "Discretionary", quadrant: "lagging", rs_ratio: 100.01, rs_mom: 99.98, breadth: null, n: null, r1w: null, r1m: null, r3m: null, rank: 2, drank: 0 },
      ];
      render(<RRGChart rows={withHidden} />);
      expect(screen.getByText(/Hidden \(flat\/no data\): Discretionary/)).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 1 sectors" })).toBeInTheDocument();
    });

    it("shows no hidden-sectors line when every row plots", () => {
      render(<RRGChart rows={[rows[0]]} />);
      expect(screen.queryByText(/Hidden \(flat\/no data\)/)).not.toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RRGChart` — confirm the two new cases fail (`isDegenerate` still only produces a count, no name list is rendered).
- [ ] Step 3: In `RRGChart.tsx`, extend the Task 3 import line to add `splitDegenerate`:
  ```tsx
  import { QUADRANT_COLOR, deriveQuadrant, abbreviate, splitDegenerate } from "@/lib/rotation";
  ```
  Delete the local `isDegenerate` function and its comment, and replace:
  ```tsx
    const plotted = rows.filter((r) => !isDegenerate(r));
    const hidden = rows.length - plotted.length;
  ```
  with:
  ```tsx
    const { plotted, hidden } = splitDegenerate(rows);
  ```
- [ ] Step 4: Update the subtitle and add the hidden-names line:
  ```tsx
      <Panel
        title="Relative Rotation Graph"
        subtitle={`RS-Ratio vs RS-Momentum · ${plotted.length} sectors${
          hidden.length > 0 ? ` · ${hidden.length} hidden (no data)` : ""
        }`}
      >
        <div
          role="img"
          aria-label={`Relative Rotation Graph scatter plot, ${plotted.length} sectors`}
          style={{ width: "100%", height: CHART_HEIGHT }}
        >
          <ResponsiveContainer width="100%" height="100%">
            {/* ...unchanged... */}
          </ResponsiveContainer>
        </div>
        {hidden.length > 0 && (
          <p className="mt-2 px-1 text-[11px] text-muted">
            Hidden (flat/no data): {hidden.map((r) => r.industry).join(", ")}
          </p>
        )}
      </Panel>
  ```
- [ ] Step 5: Run `npm run test:component -- RRGChart` — confirm all cases pass. Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 5: `RRGChart` — suppress always-on point labels for clustered sectors

**Files:** `dashboard/components/rotation/RRGChart.tsx` (edit), `dashboard/components/rotation/__tests__/RRGChart.test.tsx` (edit)
**Consumes:** `@/lib/rotation`'s `computeLabelCollisions` (Task 2, already unit-tested there — this task wires it in and smoke-tests the wiring, since Recharts' `ScatterChart` renders no children under jsdom's inert `ResizeObserver` stub, per the Chart Conventions Spec §7).
**Audit findings closed:** RO-07.

- [ ] Step 1: Append to `dashboard/components/rotation/__tests__/RRGChart.test.tsx`:
  ```tsx
  describe("RRGChart label decluttering (RO-07)", () => {
    it("mounts cleanly when several sectors cluster at nearly the same RS-Ratio/RS-Mom", () => {
      const clustered: RotationRow[] = [
        { industry: "Energy", quadrant: "leading", rs_ratio: 101, rs_mom: 101, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
        { industry: "Materials", quadrant: "leading", rs_ratio: 101.2, rs_mom: 101.3, breadth: 55, n: 28, r1w: 1, r1m: 2, r3m: 3, rank: 2, drank: 0 },
        { industry: "Industrials", quadrant: "leading", rs_ratio: 101.4, rs_mom: 100.9, breadth: 58, n: 27, r1w: 1, r1m: 2, r3m: 3, rank: 3, drank: 0 },
      ];
      render(<RRGChart rows={clustered} />);
      expect(screen.getByRole("img", { name: "Relative Rotation Graph scatter plot, 3 sectors" })).toBeInTheDocument();
    });
  });
  ```
  This is a wiring smoke-test, not a collision-logic test — `computeLabelCollisions` itself is exhaustively covered in `lib/rotation.test.ts` (Task 2); a broken wire-up here (e.g. an out-of-bounds array index) would throw during render and fail this test.
- [ ] Step 2: Run `npm run test:component -- RRGChart` — confirm it passes already (no behavior changed yet) — this establishes the pre-change baseline the next steps must keep green.
- [ ] Step 3: Extend the Task 4 import line to add `computeLabelCollisions`:
  ```tsx
  import { QUADRANT_COLOR, deriveQuadrant, abbreviate, splitDegenerate, computeLabelCollisions } from "@/lib/rotation";
  ```
  Replace the `data` construction:
  ```tsx
    const data = plotted.map((r) => ({ ...r, quadrantKey: deriveQuadrant(r) }));
  ```
  with:
  ```tsx
    const collisions = computeLabelCollisions(plotted);
    const data = plotted.map((r, i) => ({ ...r, quadrantKey: deriveQuadrant(r), labelCollision: collisions[i] }));
  ```
- [ ] Step 4: In the `Scatter`'s `shape` function, wrap the `<text>` label in the collision guard:
  ```tsx
                  return (
                    <g>
                      <circle cx={p.cx} cy={p.cy} r={4} fill={color} stroke="var(--bg)" strokeWidth={1} />
                      {!p.payload.labelCollision && (
                        <text
                          x={p.cx + (right ? 7 : -7)}
                          y={p.cy + (up ? -3 : 9)}
                          fontSize={10}
                          fill={CHART_AXIS_STYLE.pointLabel}
                          textAnchor={right ? "start" : "end"}
                          style={{
                            paintOrder: "stroke",
                            stroke: "var(--bg)",
                            strokeWidth: 3,
                            strokeLinejoin: "round",
                          }}
                        >
                          {abbreviate(p.payload.industry)}
                        </text>
                      )}
                    </g>
                  );
  ```
- [ ] Step 5: Run `npm run test:component -- RRGChart` — confirm all cases still pass. Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors (`p.payload` is typed as `(typeof data)[number]`, which now includes `labelCollision`, so no cast is needed).

### Task 6: `RotationPanel` — migrate the bespoke `<table>` to `DataTable`, dedupe the quadrant swatch

**Files:** `dashboard/components/today/RotationPanel.tsx` (edit), `dashboard/components/today/__tests__/RotationPanel.test.tsx` (new)
**Interfaces:** unchanged (`RotationPanel({ rows, defaultOpen?, collapsible? })`, `RotationRow` export unchanged).
**Consumes:** `@/components/ui/DataTable` (`Column<T>`), `@/lib/rotation`'s `QUADRANT_COLOR` (Task 2), `@/lib/labels`'s `QUADRANT_LABEL` (frozen, Phase 1).
**Audit findings closed:** RO-03 (bespoke `<table>` → shared `DataTable`), completes RO-01 (the second, independent local quadrant-color map is deleted — `RRGChart`'s copy was removed in Task 3). This migration is also a prerequisite for RO-05 (Task 9): `DataTable` has no per-row `className` hook, so the whole-row `text-muted` dimming this table currently applies to "thin" rows is structurally impossible to carry over — it disappears as a side effect of this task, ahead of RO-05's own fix (the "thin" chip) landing in Task 9.

- [ ] Step 1: Create `dashboard/components/today/__tests__/RotationPanel.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import RotationPanel, { type RotationRow } from "../RotationPanel";

  const rows: RotationRow[] = [
    { industry: "Utilities", quadrant: "lagging", rs_ratio: 95, rs_mom: 90, breadth: 20, n: 25, r1w: -1, r1m: -2, r3m: -3, rank: 2, drank: 0 },
    { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
  ];

  describe("RotationPanel table", () => {
    it("renders every row's industry and RS-Ratio/RS-Mom values", () => {
      render(<RotationPanel rows={rows} />);
      expect(screen.getByText("Energy")).toBeInTheDocument();
      expect(screen.getByText("Utilities")).toBeInTheDocument();
      expect(screen.getByText("105.0")).toBeInTheDocument();
      expect(screen.getByText("90.0")).toBeInTheDocument();
    });

    it("defaults to rank order, not input order", () => {
      render(<RotationPanel rows={rows} />);
      const cells = screen.getAllByRole("cell").map((c) => c.textContent);
      const energyIdx = cells.findIndex((t) => t === "Energy");
      const utilitiesIdx = cells.findIndex((t) => t === "Utilities");
      expect(energyIdx).toBeGreaterThan(-1);
      expect(energyIdx).toBeLessThan(utilitiesIdx);
    });

    it("renders all ten column headers", () => {
      render(<RotationPanel rows={rows} />);
      ["Industry", "Δrank", "◉", "RS-Ratio", "RS-Mom", "Breadth", "n", "1W", "1M", "3M"].forEach((h) => {
        expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
      });
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RotationPanel` — confirm it fails (current bespoke `<table>` renders fine, so this establishes the pre-migration baseline that must stay green — no assertion should fail yet; if any does, fix the fixture, not the component, before proceeding).
- [ ] Step 3: Replace the full contents of `dashboard/components/today/RotationPanel.tsx`:
  ```tsx
  "use client";

  import * as Tooltip from "@radix-ui/react-tooltip";
  import Panel from "@/components/ui/Panel";
  import DataTable, { type Column } from "@/components/ui/DataTable";
  import { QUADRANT_COLOR } from "@/lib/rotation";
  import { QUADRANT_LABEL } from "@/lib/labels";

  export interface RotationRow {
    industry: string;
    quadrant: "leading" | "improving" | "weakening" | "lagging" | string;
    rs_ratio: number;
    rs_mom: number;
    breadth: number | null;
    n: number | null;
    r1w: number | null;
    r1m: number | null;
    r3m: number | null;
    rank: number;
    drank: number | null;
  }

  interface RotationPanelProps {
    rows: RotationRow[];
    defaultOpen?: boolean;
    collapsible?: boolean;
  }

  const DRANK_TOOLTIP = "~72% of ±1 moves are noise";
  const THIN_TOOLTIP =
    "thin basket — displayed RS values are noisier than the (shrinkage-adjusted) rank suggests";
  const BREADTH_TOOLTIP =
    "% above 50-DMA — Improving + low breadth = one-name move, unconfirmed";

  function QuadrantDot({ quadrant }: { quadrant: string }) {
    const color = QUADRANT_COLOR[quadrant] ?? "var(--muted)";
    const label = QUADRANT_LABEL[quadrant] ?? quadrant;
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex cursor-default items-center justify-center">
            <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
            sideOffset={4}
          >
            {label}
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  function DRank({ drank }: { drank: number | null }) {
    if (drank === null || Math.abs(drank) < 2) {
      return (
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <span className="cursor-default text-muted">•</span>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
              sideOffset={4}
            >
              {DRANK_TOOLTIP}
              <Tooltip.Arrow className="fill-elevated" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      );
    }
    const sign = drank > 0 ? "+" : "";
    return (
      <span className={drank > 0 ? "text-pos" : "text-neg"}>
        {sign}
        {drank}
      </span>
    );
  }

  function Ret({ v }: { v: number | null }) {
    if (v == null || !Number.isFinite(v)) return <span className="text-muted">—</span>;
    const sign = v >= 0 ? "+" : "";
    return (
      <span className={v >= 0 ? "text-pos" : "text-neg"}>
        {sign}
        {v.toFixed(1)}
      </span>
    );
  }

  function GlossedHeader({ label, tooltip }: { label: string; tooltip: string }) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="cursor-default border-b border-dotted border-muted/50">{label}</span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
            sideOffset={4}
          >
            {tooltip}
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }

  const columns: Column<RotationRow>[] = [
    {
      key: "industry",
      header: "Industry",
      render: (r) =>
        r.n != null && r.n < 20 ? (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span className="cursor-default border-b border-dotted border-muted/50">{r.industry}</span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
                sideOffset={4}
              >
                {THIN_TOOLTIP}
                <Tooltip.Arrow className="fill-elevated" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          r.industry
        ),
    },
    {
      key: "drank",
      header: <GlossedHeader label="Δrank" tooltip={DRANK_TOOLTIP} />,
      align: "center",
      render: (r) => <DRank drank={r.drank} />,
    },
    { key: "quadrant", header: "◉", align: "center", render: (r) => <QuadrantDot quadrant={r.quadrant} /> },
    { key: "rs_ratio", align: "right", header: "RS-Ratio", render: (r) => r.rs_ratio.toFixed(1) },
    { key: "rs_mom", align: "right", header: "RS-Mom", render: (r) => r.rs_mom.toFixed(1) },
    {
      key: "breadth",
      align: "right",
      header: <GlossedHeader label="Breadth" tooltip={BREADTH_TOOLTIP} />,
      render: (r) => (Number.isFinite(r.breadth) ? Math.round(r.breadth!) + "%" : "—"),
    },
    { key: "n", align: "right", header: "n", render: (r) => r.n ?? "—" },
    { key: "r1w", align: "right", header: "1W", render: (r) => <Ret v={r.r1w} /> },
    { key: "r1m", align: "right", header: "1M", render: (r) => <Ret v={r.r1m} /> },
    { key: "r3m", align: "right", header: "3M", render: (r) => <Ret v={r.r3m} /> },
  ];

  export default function RotationPanel({ rows, defaultOpen = false, collapsible = true }: RotationPanelProps) {
    const sorted = [...rows].sort((a, b) => a.rank - b.rank);
    const fading = rows.filter((r) => r.quadrant === "weakening" || r.quadrant === "lagging").length;
    const leading = sorted
      .filter((r) => r.quadrant === "leading")
      .slice(0, 2)
      .map((r) => r.industry);
    const leadingText = leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
    const summary = `${leadingText} · ${fading}/${rows.length} fading`;

    return (
      <Panel title="Sector rotation" subtitle={summary} collapsible={collapsible} defaultOpen={defaultOpen} persistKey="rotation">
        <DataTable<RotationRow> columns={columns} rows={sorted} rowKey={(r) => r.industry} persistKey="rotation-table" />
      </Panel>
    );
  }
  ```
  (`DataTable`'s `persistKey` — `"rotation-table"` — is deliberately distinct from `Panel`'s own `persistKey="rotation"`: they write to different storage-key prefixes, `dash:table:rotation-table:sort` vs. `dash:panel:rotation`, but distinct strings keep the two concerns visually unambiguous in devtools/localStorage.)
- [ ] Step 4: Run `npm run test:component -- RotationPanel` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 7: `RotationPanel` — `DRank` shows the muted value instead of hiding it

**Files:** `dashboard/components/today/RotationPanel.tsx` (edit), `dashboard/components/today/__tests__/RotationPanel.test.tsx` (edit)
**Consumes:** `@/components/ui/InfoTip` (Phase 1), `@/lib/labels`'s `HEADER_GLOSS` (frozen, Phase 1) — the `Δrank` entry becomes `DRank`'s single source of truth for the noise caveat, replacing the ad-hoc local `DRANK_TOOLTIP` string (which is deleted this task, since its wording is superseded by the frozen `HEADER_GLOSS["Δrank"]` text).
**Audit findings closed:** RO-02.

- [ ] Step 1: Append to `dashboard/components/today/__tests__/RotationPanel.test.tsx`:
  ```tsx
  describe("DRank (RO-02)", () => {
    it("shows the signed value, muted, instead of hiding it behind a bare dot when below the noise threshold", () => {
      const belowThreshold: RotationRow[] = [
        { ...rows[0], industry: "Materials", drank: 1 },
      ];
      render(<RotationPanel rows={belowThreshold} />);
      expect(screen.getByText("+1")).toBeInTheDocument();
      expect(screen.queryByText("•")).not.toBeInTheDocument();
    });

    it("still shows an em dash when drank is null", () => {
      const noDrank: RotationRow[] = [{ ...rows[0], industry: "Materials", drank: null }];
      render(<RotationPanel rows={noDrank} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RotationPanel` — confirm the two new cases fail (`+1` is not in the document; a bare `•` is rendered instead).
- [ ] Step 3: In `RotationPanel.tsx`, add the imports:
  ```tsx
  import InfoTip from "@/components/ui/InfoTip";
  import { HEADER_GLOSS } from "@/lib/labels";
  ```
  delete the local `const DRANK_TOOLTIP = "~72% of ±1 moves are noise";` line, and replace the `DRank` component:
  ```tsx
  function DRank({ drank }: { drank: number | null }) {
    if (drank === null) return <span className="text-muted">—</span>;
    if (Math.abs(drank) < 2) {
      const sign = drank > 0 ? "+" : "";
      return (
        <InfoTip content={HEADER_GLOSS["Δrank"]}>
          <span className="tabular-nums text-muted">
            {sign}
            {drank}
          </span>
        </InfoTip>
      );
    }
    const sign = drank > 0 ? "+" : "";
    return (
      <span className={drank > 0 ? "text-pos" : "text-neg"}>
        {sign}
        {drank}
      </span>
    );
  }
  ```
  and replace the `GlossedHeader` usage for `Δrank` (which referenced the now-deleted `DRANK_TOOLTIP`) with `HEADER_GLOSS["Δrank"]`:
  ```tsx
    {
      key: "drank",
      header: <GlossedHeader label="Δrank" tooltip={HEADER_GLOSS["Δrank"]} />,
      align: "center",
      render: (r) => <DRank drank={r.drank} />,
    },
  ```
- [ ] Step 4: Run `npm run test:component -- RotationPanel` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 8: `RotationPanel` — accessible header glosses for the remaining unglossed headers

**Files:** `dashboard/components/today/RotationPanel.tsx` (edit), `dashboard/components/today/__tests__/RotationPanel.test.tsx` (edit)
**Consumes:** `@/components/ui/InfoTip`, `@/lib/labels`'s `HEADER_GLOSS` (both already imported in Task 7).
**Audit findings closed:** RO-04 — of the table's ten headers, only two (`Δrank`, `Breadth`) had any explanation, and both used a mouse-only Radix trigger on a non-focusable `<span>` (`00-foundations-contract.md` §B.7 names this exact `Th`/`GlossedHeader` pattern as the accessibility finding UI-09/A11Y-01 closes). This task migrates those two, plus adds glosses to the three headers the frozen `HEADER_GLOSS` map covers that previously had none (`RS-Ratio`, `RS-Mom`, `n`) and the quadrant-dot header (`◉`), onto the keyboard-accessible `InfoTip` primitive. **`Industry`, `1W`, `1M`, `3M` have no entry in the frozen `HEADER_GLOSS` map** (verified against `00-foundations-contract.md` §D — confirmed in "Audit findings that did not hold up" below) and are left as plain text headers, unchanged; inventing new gloss copy for them would violate the "frozen contract, never diverge" constraint.

- [ ] Step 1: Append to `dashboard/components/today/__tests__/RotationPanel.test.tsx`:
  ```tsx
  import { HEADER_GLOSS } from "@/lib/labels";

  describe("Header glosses (RO-04)", () => {
    it("wraps RS-Ratio, RS-Mom, n, and the quadrant header in a keyboard-focusable InfoTip", () => {
      render(<RotationPanel rows={rows} />);
      ["RS-Ratio", "RS-Mom", "n", "◉"].forEach((label) => {
        const trigger = screen.getByRole("button", { name: new RegExp(label === "◉" ? "◉" : label) });
        expect(trigger).toBeInTheDocument();
      });
    });

    it("Δrank and Breadth headers use InfoTip's real button trigger, not a non-focusable span", () => {
      render(<RotationPanel rows={rows} />);
      expect(screen.getByRole("button", { name: /Δrank/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Breadth/ })).toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RotationPanel` — confirm the new cases fail (headers are plain text or a non-focusable `Tooltip.Trigger asChild` `<span>`, not a `<button>`).
- [ ] Step 3: In `RotationPanel.tsx`, delete the `GlossedHeader` helper and the now-unused `const BREADTH_TOOLTIP = ...` line, and replace the `columns` array's `drank`, `quadrant`, `rs_ratio`, `rs_mom`, `breadth`, and `n` entries:
  ```tsx
    {
      key: "drank",
      header: (
        <InfoTip content={HEADER_GLOSS["Δrank"]}>
          <span>Δrank</span>
        </InfoTip>
      ),
      align: "center",
      render: (r) => <DRank drank={r.drank} />,
    },
    {
      key: "quadrant",
      header: (
        <InfoTip content={HEADER_GLOSS["◉"]}>
          <span>◉</span>
        </InfoTip>
      ),
      align: "center",
      render: (r) => <QuadrantDot quadrant={r.quadrant} />,
    },
    {
      key: "rs_ratio",
      align: "right",
      header: (
        <InfoTip content={HEADER_GLOSS["RS-Ratio"]}>
          <span>RS-Ratio</span>
        </InfoTip>
      ),
      render: (r) => r.rs_ratio.toFixed(1),
    },
    {
      key: "rs_mom",
      align: "right",
      header: (
        <InfoTip content={HEADER_GLOSS["RS-Mom"]}>
          <span>RS-Mom</span>
        </InfoTip>
      ),
      render: (r) => r.rs_mom.toFixed(1),
    },
    {
      key: "breadth",
      align: "right",
      header: (
        <InfoTip content={HEADER_GLOSS.Breadth}>
          <span>Breadth</span>
        </InfoTip>
      ),
      render: (r) => (Number.isFinite(r.breadth) ? Math.round(r.breadth!) + "%" : "—"),
    },
    {
      key: "n",
      align: "right",
      header: (
        <InfoTip content={HEADER_GLOSS.n}>
          <span>n</span>
        </InfoTip>
      ),
      render: (r) => r.n ?? "—",
    },
  ```
- [ ] Step 4: Run `npm run test:component -- RotationPanel` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 9: `RotationPanel` — "thin" chip instead of whole-row dimming

**Files:** `dashboard/components/today/RotationPanel.tsx` (edit), `dashboard/components/today/__tests__/RotationPanel.test.tsx` (edit)
**Consumes:** `@/components/ui/InfoTip`, `@/lib/labels`'s `HEADER_GLOSS.n` (its "Below 20, row flagged thin..." sentence is the frozen source of truth for the thin-basket caveat, replacing the ad-hoc local `THIN_TOOLTIP` string, deleted this task).
**Audit findings closed:** RO-05. The whole-row `text-muted` dimming this finding describes was already structurally removed by the Task 6 migration to `DataTable` (no per-row `className` hook exists) — this task adds the other half of the audit's prescribed fix: a discrete `thin` chip next to the industry name, at normal (non-dimmed) contrast, replacing the dotted-underline-on-the-whole-name cue.

- [ ] Step 1: Append to `dashboard/components/today/__tests__/RotationPanel.test.tsx`:
  ```tsx
  describe("Thin-basket rows (RO-05)", () => {
    it("shows a 'thin' chip next to the name instead of dimming the whole row", () => {
      const thinRow: RotationRow[] = [{ ...rows[0], industry: "Materials", n: 12 }];
      render(<RotationPanel rows={thinRow} />);
      const name = screen.getByText("Materials");
      expect(name).toBeInTheDocument();
      expect(name.className).not.toMatch(/text-muted/);
      expect(screen.getByText("thin")).toBeInTheDocument();
    });

    it("shows no chip for a normal-sized basket", () => {
      const normalRow: RotationRow[] = [{ ...rows[0], industry: "Financials", n: 40 }];
      render(<RotationPanel rows={normalRow} />);
      expect(screen.queryByText("thin")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- RotationPanel` — confirm the first new case fails (no `"thin"` text exists yet; the name is wrapped in a dotted-underline span, not evaluated for a `text-muted` class since none is applied at the cell level either way — the missing `thin` chip is the failing assertion).
- [ ] Step 3: In `RotationPanel.tsx`, delete the local `const THIN_TOOLTIP = ...` line and replace the `industry` column's `render`:
  ```tsx
    {
      key: "industry",
      header: "Industry",
      render: (r) => {
        const thin = r.n != null && r.n < 20;
        if (!thin) return r.industry;
        return (
          <span className="inline-flex items-center gap-1.5">
            {r.industry}
            <InfoTip content={HEADER_GLOSS.n}>
              <span className="rounded border border-line px-1 text-[11px] uppercase tracking-wide text-muted">
                thin
              </span>
            </InfoTip>
          </span>
        );
      },
    },
  ```
- [ ] Step 4: Run `npm run test:component -- RotationPanel` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 10: `app/rotation/page.tsx` — page header + last-updated timestamp

**Files:** `dashboard/app/rotation/page.tsx` (edit), `dashboard/app/rotation/__tests__/page.test.tsx` (new)
**Consumes:** `@/components/ui/PageHeader` (existing, pre-Phase-1), `@/lib/tz-display`'s `dualClock` (existing).
**Audit findings closed:** RO-08. There is no `/api/rotation` route (verified against `argus/argus/api/routes.py` — rotation is served purely from `reports/rotation_latest.json` via `fs.readFileSync`), so the timestamp source is the file's own mtime, not an API field.

- [ ] Step 1: Create `dashboard/app/rotation/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect, vi, afterEach } from "vitest";
  import fs from "fs";
  import { render, screen } from "@/test/render";
  import RotationPage from "../page";

  describe("RotationPage header (RO-08)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("shows a page title and the rotation file's last-modified time", () => {
      const rows = [
        { industry: "Energy", quadrant: "leading", rs_ratio: 105, rs_mom: 102, breadth: 60, n: 30, r1w: 1, r1m: 2, r3m: 3, rank: 1, drank: 0 },
      ];
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(rows));
      vi.spyOn(fs, "statSync").mockReturnValue({ mtime: new Date("2026-07-28T21:00:00Z") } as fs.Stats);

      render(<RotationPage />);

      expect(screen.getByText("Sector Rotation")).toBeInTheDocument();
      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });

    it("shows the warn banner and no timestamp when the rotation file is missing", () => {
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw new Error("ENOENT");
      });
      vi.spyOn(fs, "statSync").mockImplementation(() => {
        throw new Error("ENOENT");
      });

      render(<RotationPage />);

      expect(screen.getByText("Sector Rotation")).toBeInTheDocument();
      expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
      expect(screen.getByText("No rotation data — run_daily may have failed")).toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- app/rotation` — confirm it fails (no `"Sector Rotation"` heading exists yet).
- [ ] Step 3: Replace `dashboard/app/rotation/page.tsx`:
  ```tsx
  import fs from "fs";
  import path from "path";
  import RotationPanel, { type RotationRow } from "@/components/today/RotationPanel";
  import RRGChart from "@/components/rotation/RRGChart";
  import PageHeader from "@/components/ui/PageHeader";
  import { dualClock } from "@/lib/tz-display";

  export const dynamic = "force-dynamic";

  function reportsDir(): string {
    return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
  }

  function rotationPath(): string {
    return path.join(reportsDir(), "rotation_latest.json");
  }

  function loadRotation(): RotationRow[] | null {
    try {
      const raw = fs.readFileSync(rotationPath(), "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data as RotationRow[];
      return null;
    } catch {
      return null;
    }
  }

  function loadRotationMtime(): Date | null {
    try {
      return fs.statSync(rotationPath()).mtime;
    } catch {
      return null;
    }
  }

  export default function RotationPage() {
    const rotation = loadRotation();
    const mtime = loadRotationMtime();
    const clock = mtime ? dualClock(mtime) : null;

    return (
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <PageHeader
          title="Sector Rotation"
          subtitle={clock ? `Updated ${clock.primary} · ${clock.secondary}` : undefined}
        />
        {rotation ? (
          <>
            <RRGChart rows={rotation} />
            <RotationPanel rows={rotation} defaultOpen collapsible={false} />
          </>
        ) : (
          <div className="rounded-lg border border-warn/50 bg-warn/10 px-4 py-2.5 text-[13px] text-warn">
            No rotation data — run_daily may have failed
          </div>
        )}
      </main>
    );
  }
  ```
- [ ] Step 4: Run `npm run test:component -- app/rotation` — confirm both cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 11: `MacroChart` — token colors, responsive height, a11y label, testable empty guard

**Files:** `dashboard/components/macro/MacroChart.tsx` (edit), `dashboard/components/macro/__tests__/MacroChart.test.tsx` (new)
**Interfaces:** unchanged (`MacroChart({ points: MacroPoint[]; spx: SpxBar[] })`, `SpxBar` export unchanged).
**Consumes:** `@/lib/chartConventions` (`CHART_HEIGHT`, `resolveChartTokens` — Task 1).
**Audit findings closed:** X-02 (`#8b93a3`/`#161b24`/`#222936`/`#2f81f7` hex literals → `resolveChartTokens()`; the macro line's `#2f81f7` doesn't exactly match any single token either — same situation as `#8b93a3` vs. `--muted` — mapping it to `tokens.accent` is the deliberate convergence: it's the chart's primary/most-emphasized series, and `--accent` is the one hue the rest of the app already uses for "this is the important thing"). `layout.background` and `grid.vertLines.visible: false` are already correct today (transparent background, vertical gridlines off) and are the canonical reference this spec's §3 grid rule is built from — no change needed to either.

This task also adds a `hasData` guard (`points.length > 0 || spx.length > 0`) before the component does anything: with zero data there is nothing to plot, and per the Chart Conventions Spec §7, `createChart()` throws in jsdom (no real `<canvas>` 2D context) — so the guard is what makes this component safely testable at all, mirroring `CandleChart`'s existing `initialBars.length === 0` early-return pattern.

- [ ] Step 1: Create `dashboard/components/macro/__tests__/MacroChart.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { MacroChart } from "../MacroChart";
  import { CHART_HEIGHT } from "@/lib/chartConventions";

  describe("MacroChart chart conventions", () => {
    it("renders nothing when there is no macro or SPY data", () => {
      const { container } = render(<MacroChart points={[]} spx={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("labels the chart for assistive tech and sizes it with the shared responsive height", () => {
      render(<MacroChart points={[{ ts: "2026-07-28 10:00:00", score: 0.2, n: 5 }]} spx={[]} />);
      const img = screen.getByRole("img", { name: "Macro sentiment score over time, overlaid on SPY" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveStyle({ height: CHART_HEIGHT });
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- MacroChart` — confirm both cases fail (today the component always renders a plain `<div className="w-full" />` regardless of data, with no `role="img"` and no `style`).
- [ ] Step 3: Replace `dashboard/components/macro/MacroChart.tsx`:
  ```tsx
  "use client";

  import { useEffect, useRef } from "react";
  import type { MacroPoint } from "@/lib/macro";
  import { CHART_HEIGHT, resolveChartTokens } from "@/lib/chartConventions";

  export interface SpxBar { ts: string; Close: number }

  const toSec = (ts: string) => Math.floor(new Date(ts.replace(" ", "T")).getTime() / 1000);

  /** Ascending, de-duplicated {time, value} for lightweight-charts (it throws on
   *  unsorted or duplicate times). */
  function clean(rows: { time: number; value: number }[]) {
    const seen = new Set<number>();
    return rows
      .filter((d) => Number.isFinite(d.time) && Number.isFinite(d.value))
      .sort((a, b) => a.time - b.time)
      .filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true)));
  }

  /** Macro score (left axis, −1..1) overlaid on SPY close (right axis). */
  export function MacroChart({ points, spx }: { points: MacroPoint[]; spx: SpxBar[] }) {
    const ref = useRef<HTMLDivElement>(null);
    const hasData = points.length > 0 || spx.length > 0;

    useEffect(() => {
      if (!hasData) return;
      let destroyed = false;
      import("lightweight-charts").then(({ createChart, ColorType }) => {
        if (destroyed || !ref.current) return;
        const tokens = resolveChartTokens(ref.current);
        const chart = createChart(ref.current, {
          autoSize: true,
          height: 320,
          layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: tokens.muted, attributionLogo: false },
          grid: { vertLines: { visible: false }, horzLines: { color: tokens.line } },
          rightPriceScale: { borderColor: tokens.lineStrong },
          leftPriceScale: { visible: true, borderColor: tokens.lineStrong },
          timeScale: { borderColor: tokens.lineStrong, timeVisible: true },
        });

        const macro = chart.addLineSeries({
          color: tokens.accent, priceScaleId: "left", lineWidth: 2, title: "macro",
        });
        macro.setData(clean(points.map((p) => ({ time: toSec(p.ts), value: p.score }))) as never);

        if (spx.length) {
          const spy = chart.addLineSeries({
            color: tokens.muted, priceScaleId: "right", lineWidth: 1, title: "SPY",
            priceLineVisible: false, lastValueVisible: false,
          });
          spy.setData(clean(spx.map((b) => ({ time: toSec(b.ts), value: b.Close }))) as never);
        }

        chart.timeScale().fitContent();
        (ref.current as HTMLDivElement & { _chart?: unknown })._chart = chart;
      });

      return () => {
        destroyed = true;
        const el = ref.current as (HTMLDivElement & { _chart?: { remove: () => void } }) | null;
        el?._chart?.remove();
      };
    }, [points, spx, hasData]);

    if (!hasData) return null;

    return (
      <div
        ref={ref}
        role="img"
        aria-label="Macro sentiment score over time, overlaid on SPY"
        className="w-full"
        style={{ height: CHART_HEIGHT }}
      />
    );
  }
  ```
- [ ] Step 4: Run `npm run test:component -- MacroChart` — confirm both cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 12: `app/macro/page.tsx` — reconcile scope when the window changes

**Files:** `dashboard/app/macro/page.tsx` (edit), `dashboard/app/macro/__tests__/page.test.tsx` (new)
**Audit findings closed:** MC-02.

- [ ] Step 1: Create `dashboard/app/macro/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import MacroPage from "../page";

  const GAUGES = [
    { scope: "global", window: "1d", score: 0.1, n: 50, ts: "2026-07-28T00:00:00Z" },
    { scope: "sector:AI / Compute", window: "1d", score: 0.3, n: 10, ts: "2026-07-28T00:00:00Z" },
    { scope: "global", window: "1h", score: 0.05, n: 20, ts: "2026-07-28T00:00:00Z" },
  ];

  function mockMacroFetch() {
    mockFetchJson((url: string) => {
      if (url === "/api/argus/macro") return { gauges: GAUGES };
      if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1d", points: [] };
      if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
      return {};
    });
  }

  describe("MacroPage scope reconciliation (MC-02)", () => {
    it("resets scope to global when the selected scope has no data in the newly-picked window", async () => {
      mockMacroFetch();
      render(<MacroPage />);

      const sectorCard = await screen.findByText("AI / Compute");
      await userEvent.click(sectorCard);
      expect(await screen.findByText(/AI \/ Compute · 1d vs SPY/)).toBeInTheDocument();

      const hourButton = screen.getByRole("button", { name: "1h" });
      await userEvent.click(hourButton);

      expect(await screen.findByText(/GLOBAL · 1h vs SPY/)).toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- app/macro` — confirm it fails (the caption still reads `AI / Compute · 1h vs SPY` after switching windows, since `scope` is never reconciled).
- [ ] Step 3: In `dashboard/app/macro/page.tsx`, add the `useEffect` import and the reconciliation effect:
  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import useSWR from "swr";
  import { useMacro, useMacroSeries, scopeLabel, toneClass } from "@/lib/macro";
  import { MacroChart, type SpxBar } from "@/components/macro/MacroChart";

  const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
  const WINDOWS = ["1h", "1d", "1w"];

  export default function MacroPage() {
    const { data } = useMacro();
    const [scope, setScope] = useState("global");
    const [window, setWindow] = useState("1d");
    const { data: series } = useMacroSeries(scope, window);
    // SPY daily history already served by Argus; reuse it as the benchmark overlay.
    const { data: hist } = useSWR<{ bars: SpxBar[] }>(
      "/api/argus/history/SPY?period=1mo&interval=1d", fetcher, { shouldRetryOnError: false });

    const gauges = (data?.gauges ?? []).filter((g) => g.window === window);
    const anyData = (data?.gauges ?? []).length > 0;

    useEffect(() => {
      const stillValid = (data?.gauges ?? []).some((g) => g.window === window && g.scope === scope);
      if (!stillValid) setScope("global");
    }, [window, data, scope]);
  ```
  (the rest of the function body is unchanged in this task.)
- [ ] Step 4: Run `npm run test:component -- app/macro` — confirm it passes.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 13: `app/macro/page.tsx` — empty state replaces the chart, not appended after it

**Files:** `dashboard/app/macro/page.tsx` (edit), `dashboard/app/macro/__tests__/page.test.tsx` (edit)
**Consumes:** `@/components/ui/EmptyState` (existing).
**Audit findings closed:** MC-03.

- [ ] Step 1: Append to `dashboard/app/macro/__tests__/page.test.tsx`:
  ```tsx
  describe("MacroPage empty state (MC-03)", () => {
    it("shows the empty state in place of the chart when there is no macro data", async () => {
      mockFetchJson({
        "/api/argus/macro": { gauges: [] },
        "/api/argus/history/SPY?period=1mo&interval=1d": { bars: [] },
      });
      render(<MacroPage />);
      expect(await screen.findByText("No macro data yet — the aggregator runs every 20 min.")).toBeInTheDocument();
    });

    it("shows the chart caption, not the empty state, once gauge data exists", async () => {
      mockMacroFetch();
      render(<MacroPage />);
      await screen.findByText("AI / Compute");
      expect(screen.queryByText("No macro data yet — the aggregator runs every 20 min.")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- app/macro` — both cases already pass. Because Task 11 made `MacroChart` return `null` internally whenever `points`/`spx` are both empty, the DOM-visible symptom of MC-03 (chart-shaped element next to the empty-state text) no longer reproduces through these two assertions on its own — the append-vs-replace bug is now purely structural (an always-mounted `<MacroChart>` sitting next to a conditionally-shown paragraph, which is fragile the moment `MacroChart` ever again renders something for zero-series-but-nonzero-gauges data). Treat this task as a refactor guarded by an already-green regression suite, not a red→green step; proceed to Step 3, then re-run Step 4 to confirm nothing broke.
- [ ] Step 3: In `dashboard/app/macro/page.tsx`, add the `EmptyState` import and replace the append-after block:
  ```tsx
  import EmptyState from "@/components/ui/EmptyState";
  ```
  ```tsx
        <div className="mb-2 text-xs text-muted">
          {scopeLabel(scope)} · {window} vs SPY
        </div>
        {anyData ? (
          <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
        ) : (
          <EmptyState message="No macro data yet — the aggregator runs every 20 min." />
        )}
  ```
  replacing:
  ```tsx
        <div className="mb-2 text-xs text-muted">
          {scopeLabel(scope)} · {window} vs SPY
        </div>
        <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
        {!anyData && <p className="text-xs text-muted mt-4">No macro data yet — the aggregator runs every 20 min.</p>}
  ```
- [ ] Step 4: Run `npm run test:component -- app/macro` — confirm both cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 14: `app/macro/page.tsx` — page header, drop blanket monospace, add a chart legend

**Files:** `dashboard/app/macro/page.tsx` (edit), `dashboard/app/macro/__tests__/page.test.tsx` (edit)
**Consumes:** `@/components/ui/PageHeader` (existing).
**Audit findings closed:** MC-04. Removing the blanket `font-mono` from `<main>` also un-monospaces the two genuinely tabular numeric values that were inheriting it (`g.score`, `g.n`) — this task restores `font-mono` explicitly on those two elements so their formatting doesn't silently regress; the window-toggle button labels (`1h`/`1d`/`1w`) and the scope/window caption intentionally fall back to the app's default sans font, matching how every other toggle/caption in the app is styled (they were only ever mono here as an accidental side effect of the blanket class, not a deliberate choice).

- [ ] Step 1: Append to `dashboard/app/macro/__tests__/page.test.tsx`:
  ```tsx
  describe("MacroPage header + legend (MC-04)", () => {
    it("shows a page heading, subtitle, and a Macro/SPY legend", async () => {
      mockMacroFetch();
      render(<MacroPage />);
      expect(screen.getByText("Macro Sentiment")).toBeInTheDocument();
      expect(screen.getByText(/FinBERT-scored news/)).toBeInTheDocument();
      expect(await screen.findByText("Macro")).toBeInTheDocument();
      expect(screen.getByText("SPY")).toBeInTheDocument();
    });

    it("keeps score and n values monospaced after the blanket font-mono is removed", async () => {
      mockMacroFetch();
      render(<MacroPage />);
      const score = await screen.findByText("+0.10");
      expect(score.className).toMatch(/font-mono/);
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- app/macro` — confirm both cases fail (no `PageHeader`-rendered subtitle text exists in the expected form yet — the `<h1>`/`<p>` pair already renders similar text so the first assertions may pass, but `"Macro"`/`"SPY"` legend text does not exist — and the score element has no `font-mono` class of its own, only via ancestor inheritance which RTL's `className` check does not see).
- [ ] Step 3: In `dashboard/app/macro/page.tsx`, add the `PageHeader` import and replace the header block:
  ```tsx
  import PageHeader from "@/components/ui/PageHeader";
  ```
  ```tsx
    return (
      <main className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Macro Sentiment"
          subtitle="FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish."
        />
  ```
  replacing:
  ```tsx
    return (
      <main className="max-w-5xl mx-auto px-6 py-6 font-mono">
        <h1 className="text-lg font-semibold mb-1">Macro Sentiment</h1>
        <p className="text-xs text-muted mb-4">
          FinBERT-scored news, recency-weighted by scope. −1 bearish · +1 bullish.
        </p>
  ```
  then restore `font-mono` on the two numeric gauge-card values:
  ```tsx
              <div className={`font-mono text-sm tabular-nums ${toneClass(g.score)}`}>
                {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
              </div>
              <div className="font-mono text-[10px] text-muted opacity-60">n={g.n}</div>
  ```
  replacing:
  ```tsx
              <div className={`text-sm tabular-nums ${toneClass(g.score)}`}>
                {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted opacity-60">n={g.n}</div>
  ```
  and add the legend next to the scope/window caption:
  ```tsx
        <div className="mb-2 flex items-center gap-4 text-xs text-muted">
          <span>{scopeLabel(scope)} · {window}</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-accent" />
            Macro
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-muted" />
            SPY
          </span>
        </div>
        {anyData ? (
  ```
  replacing:
  ```tsx
        <div className="mb-2 text-xs text-muted">
          {scopeLabel(scope)} · {window} vs SPY
        </div>
        {anyData ? (
  ```
- [ ] Step 4: Run `npm run test:component -- app/macro` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 15: `app/macro/page.tsx` — gauge card `aria-pressed`, remove `opacity-60`/undersized text

**Files:** `dashboard/app/macro/page.tsx` (edit), `dashboard/app/macro/__tests__/page.test.tsx` (edit)
**Audit findings closed:** MC-05.

- [ ] Step 1: Append to `dashboard/app/macro/__tests__/page.test.tsx`:
  ```tsx
  describe("MacroPage gauge card semantics (MC-05)", () => {
    it("marks the selected scope card aria-pressed and leaves the rest unpressed", async () => {
      mockMacroFetch();
      render(<MacroPage />);
      const globalCard = await screen.findByRole("button", { name: /GLOBAL/ });
      expect(globalCard).toHaveAttribute("aria-pressed", "true");
      const sectorCard = screen.getByRole("button", { name: /AI \/ Compute/ });
      expect(sectorCard).toHaveAttribute("aria-pressed", "false");
    });

    it("renders the n= count at the data-floor size with no opacity utility", async () => {
      mockMacroFetch();
      render(<MacroPage />);
      const nEl = await screen.findByText("n=50");
      expect(nEl.className).toMatch(/text-\[11px\]/);
      expect(nEl.className).not.toMatch(/opacity-/);
    });
  });
  ```
- [ ] Step 2: Run `npm run test:component -- app/macro` — confirm both cases fail (no `aria-pressed` attribute exists; `n=50` is rendered at `text-[10px]` with `opacity-60`).
- [ ] Step 3: In `dashboard/app/macro/page.tsx`, replace the gauge card button:
  ```tsx
            <button key={g.scope} onClick={() => setScope(g.scope)}
              aria-pressed={g.scope === scope}
              className={`text-left p-2 rounded border ${g.scope === scope ? "border-accent" : "border-line"} bg-surface`}>
              <div className="text-[11px] text-muted truncate">{scopeLabel(g.scope)}</div>
              <div className={`font-mono text-sm tabular-nums ${toneClass(g.score)}`}>
                {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
              </div>
              <div className="font-mono text-[11px] text-muted">n={g.n}</div>
            </button>
  ```
  replacing:
  ```tsx
            <button key={g.scope} onClick={() => setScope(g.scope)}
              className={`text-left p-2 rounded border ${g.scope === scope ? "border-accent" : "border-line"} bg-surface`}>
              <div className="text-[11px] text-muted truncate">{scopeLabel(g.scope)}</div>
              <div className={`font-mono text-sm tabular-nums ${toneClass(g.score)}`}>
                {g.score >= 0 ? "+" : ""}{g.score.toFixed(2)}
              </div>
              <div className="font-mono text-[10px] text-muted opacity-60">n={g.n}</div>
            </button>
  ```
- [ ] Step 4: Run `npm run test:component -- app/macro` — confirm all cases pass.
- [ ] Step 5: Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

### Task 16: `MacroGauges` deep link + `app/macro/page.tsx` — carry the selected window via `?window=`

**Files:** `dashboard/components/rails/MacroGauges.tsx` (edit), `dashboard/components/rails/__tests__/MacroGauges.test.tsx` (new), `dashboard/app/macro/page.tsx` (edit), `dashboard/app/macro/__tests__/page.test.tsx` (edit)
**Mechanism:** a URL search param (`?window=1w`) — the obvious, stateless mechanism for a cross-page deep link. `MacroGauges` already has the `window` prop in scope; `/macro` reads it back via `next/navigation`'s `useSearchParams()`, defaulting to `"1d"` when absent or invalid. `useSearchParams()` requires the page to be wrapped in a `<Suspense>` boundary (Next.js 14 App Router requirement, not currently used anywhere else in this app) — introduced here via a small `MacroPageInner`/`MacroPage` split.
**Audit findings closed:** MC-06.

- [ ] Step 1: Create `dashboard/components/rails/__tests__/MacroGauges.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { MacroGauges } from "../MacroGauges";

  describe("MacroGauges deep link (MC-06)", () => {
    it("carries the selected window into the /macro link", async () => {
      mockFetchJson({
        "/api/argus/macro": { gauges: [{ scope: "global", window: "1w", score: 0.1, n: 10, ts: "2026-07-28T00:00:00Z" }] },
      });
      render(<MacroGauges window="1w" />);
      const link = await screen.findByRole("link", { name: "1w ›" });
      expect(link).toHaveAttribute("href", "/macro?window=1w");
    });
  });
  ```
  Append to `dashboard/app/macro/__tests__/page.test.tsx`:
  ```tsx
  import { vi } from "vitest";

  const searchParamsMock = vi.hoisted(() => ({ current: "" }));
  vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(searchParamsMock.current),
  }));

  describe("MacroPage window from URL (MC-06)", () => {
    it("initializes the window from a ?window= query param", async () => {
      searchParamsMock.current = "window=1w";
      mockFetchJson((url: string) => {
        if (url === "/api/argus/macro") return { gauges: [{ scope: "global", window: "1w", score: 0.1, n: 10, ts: "2026-07-28T00:00:00Z" }] };
        if (url.startsWith("/api/argus/macro/series")) return { scope: "global", window: "1w", points: [] };
        if (url.startsWith("/api/argus/history/SPY")) return { bars: [] };
        return {};
      });
      render(<MacroPage />);
      const activeWindow = await screen.findByRole("button", { name: "1w" });
      expect(activeWindow.className).toMatch(/bg-accent\/20/);
    });

    it("defaults to 1d when no query param is present", async () => {
      searchParamsMock.current = "";
      mockMacroFetch();
      render(<MacroPage />);
      const activeWindow = await screen.findByRole("button", { name: "1d" });
      expect(activeWindow.className).toMatch(/bg-accent\/20/);
    });
  });
  ```
  (this `vi.mock("next/navigation", ...)` block must be hoisted above the `MacroPage` import, matching Vitest's module-mock ordering rules — place it directly under the file's existing imports.)
- [ ] Step 2: Run `npm run test:component -- MacroGauges app/macro` — confirm the new cases fail (`MacroGauges`' link still points to plain `/macro`; `MacroPage` has no `useSearchParams` call, so `next/navigation` isn't even mocked-against yet — and without a `<Suspense>` boundary, adding `useSearchParams()` directly would otherwise break the build).
- [ ] Step 3: In `dashboard/components/rails/MacroGauges.tsx`, replace the deep link:
  ```tsx
          <Link href={`/macro?window=${window}`} className="text-[10px] font-mono text-muted hover:text-accent">{window} ›</Link>
  ```
  replacing:
  ```tsx
          <Link href="/macro" className="text-[10px] font-mono text-muted hover:text-accent">{window} ›</Link>
  ```
- [ ] Step 4: In `dashboard/app/macro/page.tsx`, add the `Suspense`/`useSearchParams` imports and wrap the component:
  ```tsx
  "use client";

  import { Suspense, useEffect, useState } from "react";
  import useSWR from "swr";
  import { useSearchParams } from "next/navigation";
  import { useMacro, useMacroSeries, scopeLabel, toneClass } from "@/lib/macro";
  import { MacroChart, type SpxBar } from "@/components/macro/MacroChart";
  import PageHeader from "@/components/ui/PageHeader";
  import EmptyState from "@/components/ui/EmptyState";

  const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
  const WINDOWS = ["1h", "1d", "1w"];
  const VALID_WINDOWS = new Set(WINDOWS);

  function MacroPageInner() {
    const searchParams = useSearchParams();
    const initialWindow = searchParams.get("window");
    const { data } = useMacro();
    const [scope, setScope] = useState("global");
    const [window, setWindow] = useState(
      initialWindow && VALID_WINDOWS.has(initialWindow) ? initialWindow : "1d"
    );
  ```
  replacing:
  ```tsx
  "use client";

  import { useEffect, useState } from "react";
  import useSWR from "swr";
  import { useMacro, useMacroSeries, scopeLabel, toneClass } from "@/lib/macro";
  import { MacroChart, type SpxBar } from "@/components/macro/MacroChart";
  import PageHeader from "@/components/ui/PageHeader";
  import EmptyState from "@/components/ui/EmptyState";

  const fetcher = (u: string) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });
  const WINDOWS = ["1h", "1d", "1w"];

  export default function MacroPage() {
    const { data } = useMacro();
    const [scope, setScope] = useState("global");
    const [window, setWindow] = useState("1d");
  ```
  and at the end of the file, close `MacroPageInner` and add the exported wrapper:
  ```tsx
      </main>
    );
  }

  export default function MacroPage() {
    return (
      <Suspense fallback={null}>
        <MacroPageInner />
      </Suspense>
    );
  }
  ```
  replacing:
  ```tsx
      </main>
    );
  }
  ```
- [ ] Step 5: Run `npm run test:component -- MacroGauges app/macro` — confirm all cases pass. Run `npx tsc --noEmit` from `dashboard/` — confirm no type errors.

## Audit findings that did not hold up

- **RO-04's header-gloss coverage.** The task brief describes `lib/labels.ts`'s `HEADER_GLOSS` as covering "ten unexplained headers (RS-Ratio, RS-Mom, Breadth, n, ◉, Δrank, 1W/1M/3M)," but the frozen `00-foundations-contract.md` §D `HEADER_GLOSS` map (read verbatim) has entries for only six keys — `RS-Ratio`, `RS-Mom`, `Breadth`, `n`, `◉`, `Δrank` — with no entries for `1W`, `1M`, `3M`, or `Industry`. Task 8 glosses only the six covered headers and leaves the other four as plain text, per the "frozen contract, never diverge" rule — inventing new gloss copy for them was not an option. This doesn't invalidate RO-04 itself (2-of-10 headers explained today is accurate, and closing to 6-of-10 is a real improvement) — it's a ceiling on how far the fix can go without a Phase 1 contract change.
- **X-02 / roadmap item 24's "Argus dev UI" half.** The finding correctly identifies `argus/argus/ui/index.html` (`#0b0e14/#e6e8ec/#5b9cf6`) as a third, independently hand-rolled palette, but that file belongs to a separate Python service's static dev UI, not `dashboard/`, and is out of scope for this (dashboard-only) plan. The dashboard-side half of the same finding — `CandleChart`'s hex literals — is real and confirmed (verified its exact `LEVEL_STYLE`/`EMA_STYLE`/`createChart` hex literals against the live source), but per the task brief `CandleChart`'s migration is owned by the Options/GexChart agent's later phase, not this one. No task in this plan touches either file; noted here so neither is silently dropped from tracking.
- **MC-05's cited code is `app/macro/page.tsx`, not `components/rails/MacroGauges.tsx`.** Both files have a component named/aliased around "Gauge," which could be misread as the same target. The finding's cited markup (`<button key={g.scope}... className={...border-accent when active...}>` with no `aria-pressed`, and `<div className="text-[10px] text-muted opacity-60">n={g.n}</div>`) is `app/macro/page.tsx`'s own inline gauge-card buttons (fixed in Task 15) — confirmed by matching the exact `n={g.n}` JSX. `components/rails/MacroGauges.tsx`'s `Gauge` component is a plain, non-interactive `<div>` (not a button, nothing to make `aria-pressed`) and belongs to the left rail, a different, not-in-scope audit section (§3). Its own `text-[10px]` instances (in `scopeLabel`, the score, and the "building…" state) are real type-scale-floor violations, but were never part of MC-05's claim; this plan touches only that file's single `/macro` `<Link>` line, for MC-06 (Task 16).

## Coverage

| ID | Finding | Closed by | Notes |
|---|---|---|---|
| RO-01 | Duplicate quadrant-color map in `RRGChart` and `RotationPanel` | Tasks 2, 3, 6 | one `QUADRANT_COLOR` in `lib/rotation.ts`, both files import it |
| RO-02 | `DRank` hides the value behind a bare `•` below the noise threshold | Task 7 | now shown muted, not hidden |
| RO-03 | `RotationPanel` uses a bespoke `<table>` instead of `DataTable` | Task 6 | |
| RO-04 | 8 of 10 table headers have no explanation | Task 8 | 6 of 10 have a frozen `HEADER_GLOSS` entry; see "did not hold up" |
| RO-05 | Thin-basket rows dim the whole row instead of flagging it | Tasks 6, 9 | whole-row dimming removed by the `DataTable` migration (6); "thin" chip added (9) |
| RO-06 | Hidden/degenerate sectors are only counted, never named | Task 4 | |
| RO-07 | Always-on point labels collide for sectors clustered near 100/100 | Task 5 | |
| RO-08 | No page header or last-updated timestamp on `/rotation` | Task 10 | timestamp from file `mtime` (no API route exists) |
| RO-09 | `RRGChart` has a fixed 420px height | Task 3 | |
| MC-01 | `/macro` missing from nav | — | owned by the Chrome agent, not this plan (per task brief) |
| MC-02 | `scope` never reconciled when `window` changes | Task 12 | |
| MC-03 | Empty-state paragraph appended after `<MacroChart>` instead of replacing it | Task 13 | |
| MC-04 | No page header, blanket `font-mono`, no SPY/macro legend | Task 14 | |
| MC-05 | Gauge card buttons: no `aria-pressed`, `opacity-60` on text | Task 15 | see "did not hold up" for the exact file this targets |
| MC-06 | `MacroGauges`' `/macro` link doesn't carry the selected window | Task 16 | `?window=` search param + `useSearchParams()` |
| X-02 | Three independently hand-rolled chart palettes; fixed pixel heights; undifferentiated grid/axis/reference-line color | Tasks 1, 3, 11 | Chart Conventions Spec (top of doc) + `RRGChart`/`MacroChart` migrations; `CandleChart` and the Argus dev UI are out of scope, see "did not hold up" |


