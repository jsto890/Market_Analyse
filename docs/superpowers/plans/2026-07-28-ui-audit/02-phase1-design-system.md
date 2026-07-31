# Phase 1 — Design System: Build + Migrate

**Goal:** Build every primitive and library function defined in `00-foundations-contract.md` §A–§E, then mechanically migrate every existing call site the contract's §F migration table names onto them. Close UI-01…UI-13 (shared component system) and the primitive-level slice of A11Y-01…A11Y-07 and X-04/X-05/X-06(partial)/X-07(partial)/X-08. Page-level behavior (filters, columns, what data renders) is out of scope — only the visual/interaction primitive each call site uses changes, not what the page does.

**Architecture:** Next.js 14.2 App Router, React 18.3, TypeScript strict. New shared code lands in `dashboard/components/ui/` (primitives) and `dashboard/lib/` (`format.ts`, `labels.ts`, `storageKeys.ts`). No new dependency is introduced — `@radix-ui/react-tooltip`, `swr`, `lucide-react` are already installed and reused. Conditional classes use the existing plain-array-`.join(" ")` idiom; no `clsx`/`cva`/`cn()`.

**Tech stack:** Vitest 4 (`component` project, jsdom + RTL, from Phase 0), `@testing-library/react` + `@testing-library/user-event`, `@/test/render` / `@/test/fetchMock` / `@/test/localStorage` helpers (Phase 0 Tasks 4–5).

**Depends on:** Phase 0 (`01-phase0-test-infra.md`) must be merged first — every Step 2 in this document assumes `npm run test:component` exists and `@/test/render`, `@/test/fetchMock`, `@/test/localStorage` are importable. `00-foundations-contract.md` is FROZEN; every signature below is copied verbatim from it, not redesigned.

---

## Global Constraints

- No raw Tailwind palette colours or hex in any new/touched code — tokens only (`text-pos`/`text-neg`/`text-warn`/`text-teal`/`text-muted`/`text-muted-2`/`var(--green)` etc.).
- Data text floor `text-[11px]`; prose floor `text-xs` (12px). Never introduce or leave a `text-[10px]`/`text-[9px]` in a file this plan touches.
- Every component test imports `render`/`screen`/`userEvent` from `@/test/render`, never `@testing-library/react` directly.
- `mockFetchJson(...)` is called before `render(...)` for anything that fetches.
- `resetLocalStorage()` at the top of any test whose component persists state; assert post-mount state with `findBy*`, not `getBy*`.
- ARIA state assertions use `toHaveAttribute("aria-expanded"|"aria-pressed"|"aria-checked", ...)` after a `userEvent` interaction — never a class/style proxy.
- One task = one commit. Commit message prefix `feat(dashboard):` for new primitives/libs, `refactor(dashboard):` for call-site migrations, `fix(dashboard):` for the Badge/ConvictionDot/Panel correctness fixes.
- Task order below is dependency order: tokens → libs → primitives → shared-component fixes → migrations. A later task may import anything an earlier task produced; no task imports something a later task produces.

---

## File Structure

| Path | Task |
|---|---|
| `dashboard/app/globals.css` | 1 (new tokens/classes) |
| `dashboard/tailwind.config.ts` | 1 |
| `dashboard/lib/format.ts` | 2 |
| `dashboard/lib/labels.ts` | 3 |
| `dashboard/lib/storageKeys.ts` | 4 |
| `dashboard/components/ui/Button.tsx` | 5 |
| `dashboard/components/ui/Input.tsx` | 6 |
| `dashboard/components/ui/Select.tsx` | 7 |
| `dashboard/components/ui/Collapsible.tsx` | 8 |
| `dashboard/components/ui/UndoToastProvider.tsx`, `dashboard/app/layout.tsx` | 9 |
| `dashboard/components/ui/PinToggle.tsx` | 10 |
| `dashboard/components/ui/CenterBar.tsx` | 11 |
| `dashboard/components/ui/InfoTip.tsx` | 12 |
| `dashboard/components/ui/Toggle.tsx` | 13 |
| `dashboard/components/ui/Badge.tsx` | 14 |
| `dashboard/components/ui/ConvictionDot.tsx` | 15 |
| `dashboard/components/ui/StatChip.tsx` | 16 |
| `dashboard/components/ui/EmptyState.tsx` | 17 |
| `dashboard/components/ui/Sparkline.tsx` | 18 |
| `dashboard/components/ui/DataTable.tsx` | 19 |
| `dashboard/components/ui/Panel.tsx` | 20 |
| `dashboard/app/screener/page.tsx` | 21 |
| `dashboard/app/alerts/page.tsx` | 22 |
| `dashboard/components/today/SignalGroups.tsx` | 23, 24 |
| `dashboard/components/today/DiffStrip.tsx` | 25 |
| `dashboard/components/odte/VerdictCard.tsx` | 26 |
| `dashboard/components/ticker/WhyPanel.tsx` | 27, 28 |
| `dashboard/components/ticker/Header.tsx` | 29 |
| `dashboard/app/watchlist/WatchlistClient.tsx` | 30, 31 |
| `dashboard/components/today/RotationPanel.tsx` | 32 |
| `dashboard/components/charts/CandleChart.tsx` | 33 |
| `dashboard/components/ticker/SentimentCard.tsx` (+ delete `dashboard/components/ui/ScoreBar.tsx`) | 34 |
| `dashboard/app/portfolio/page.tsx` | 35 |

`dashboard/components/rails/QuoteRow.tsx` is deliberately **not** migrated — see `## Contract deviations requested` below (its `formatPrice`/`formatPct` encode a genuinely different, deliberate formatting policy, not accidental duplication).

---

### Task 1: Design tokens — `--muted-2` + `.tone-live`/`.tone-frozen`/`.tone-eod`

**Files:**
- Modify: `dashboard/app/globals.css:20` (add `--muted-2` after `--teal`), `dashboard/app/globals.css:105-120` (add tone classes to existing `@layer components` block)
- Modify: `dashboard/tailwind.config.ts:20` (add `"muted-2"` color entry so `text-muted-2` exists)
- Test: `dashboard/app/__tests__/globals.tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom property `--muted-2: #737b8c`; Tailwind utility `text-muted-2` (and `bg-muted-2`/`border-muted-2`); CSS classes `.tone-live`, `.tone-frozen`, `.tone-eod` (all defined in `globals.css`, consumed later by Phase 6 on `app/odte/strikes/page.tsx`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/__tests__/globals.tokens.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { readFileSync } from "fs";
  import { resolve } from "path";

  const css = readFileSync(resolve(__dirname, "../globals.css"), "utf-8");

  describe("globals.css design tokens", () => {
    it("defines --muted-2 in :root", () => {
      expect(css).toMatch(/--muted-2:\s*#737b8c/);
    });

    it("defines .tone-live/.tone-frozen/.tone-eod composed classes", () => {
      expect(css).toMatch(/\.tone-live\s*\{/);
      expect(css).toMatch(/\.tone-frozen\s*\{/);
      expect(css).toMatch(/\.tone-eod\s*\{/);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run (from `dashboard/`): `npm run test:lib -- globals.tokens`
  Expected: FAIL — `expect(css).toMatch(/--muted-2:\s*#737b8c/)` fails because `--muted-2` does not exist in `globals.css` yet.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/app/globals.css`, change line 20 from:
  ```css
  --teal: #2dd4bf;
  ```
  to:
  ```css
  --teal: #2dd4bf;
  --muted-2: #737b8c;
  ```
  In `dashboard/app/globals.css`, change the `@layer components` block (lines 105-120) from:
  ```css
  @layer components {
    /* Section eyebrow: uppercase, tracked, muted micro-label. */
    .eyebrow {
      @apply text-[10px] font-medium uppercase tracking-[0.1em] text-muted;
    }
    /* Accent tick preceding a section title. */
    .tick::before {
      content: "";
      @apply mr-2 inline-block h-3 w-[3px] translate-y-[1px] rounded-sm;
      background: var(--accent);
    }
    /* Card surface used across panels/boxes. */
    .card {
      @apply rounded-md border border-line bg-elevated;
    }
  }
  ```
  to:
  ```css
  @layer components {
    /* Section eyebrow: uppercase, tracked, muted micro-label. */
    .eyebrow {
      @apply text-[10px] font-medium uppercase tracking-[0.1em] text-muted;
    }
    /* Accent tick preceding a section title. */
    .tick::before {
      content: "";
      @apply mr-2 inline-block h-3 w-[3px] translate-y-[1px] rounded-sm;
      background: var(--accent);
    }
    /* Card surface used across panels/boxes. */
    .card {
      @apply rounded-md border border-line bg-elevated;
    }
    /* Semantic source-state tones (OL-09) — LIVE/FROZEN/EOD provenance badges. */
    .tone-live {
      @apply border border-teal/40 bg-teal/10 text-teal;
    }
    .tone-frozen {
      @apply border border-warn/40 bg-warn/10 text-warn;
    }
    .tone-eod {
      @apply border border-line bg-elevated text-muted;
    }
  }
  ```
  In `dashboard/tailwind.config.ts`, change line 20 from:
  ```ts
        muted: "var(--muted)",
  ```
  to:
  ```ts
        muted: "var(--muted)",
        "muted-2": "var(--muted-2)",
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- globals.tokens`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add app/globals.css tailwind.config.ts app/__tests__/globals.tokens.test.ts
  git commit -m "feat(dashboard): add --muted-2 token and .tone-live/.tone-frozen/.tone-eod classes"
  ```

---

### Task 2: `dashboard/lib/format.ts`

**Files:**
- Create: `dashboard/lib/format.ts`
- Test: `dashboard/lib/__tests__/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all named exports from `@/lib/format`): `price(v)`, `pct(v, unit)`, `pctWhole(v, unit)`, `signedCurrency(v)`, `compactNumber(v)`, `greek(v, kind)`, `relativeAge(seconds)`, type `GreekKind`.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/format.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { price, pct, pctWhole, signedCurrency, compactNumber, greek, relativeAge } from "@/lib/format";

  describe("format.price", () => {
    it("formats with 2 decimals and a $ prefix", () => {
      expect(price(142.3)).toBe("$142.30");
    });
    it("returns em-dash for null/undefined/non-finite", () => {
      expect(price(null)).toBe("—");
      expect(price(undefined)).toBe("—");
      expect(price(NaN)).toBe("—");
    });
  });

  describe("format.pct", () => {
    it("treats unit=percent as already-scaled", () => {
      expect(pct(2.3, "percent")).toBe("+2.3%");
    });
    it("treats unit=fraction as needing *100", () => {
      expect(pct(0.023, "fraction")).toBe("+2.3%");
    });
    it("signs negatives", () => {
      expect(pct(-1.25, "percent")).toBe("-1.3%");
    });
  });

  describe("format.pctWhole", () => {
    it("rounds to a whole unsigned percent", () => {
      expect(pctWhole(72.6, "percent")).toBe("73%");
      expect(pctWhole(0.726, "fraction")).toBe("73%");
    });
  });

  describe("format.signedCurrency", () => {
    it("formats a positive delta with thousands separator", () => {
      expect(signedCurrency(1204.5)).toBe("+$1,204.50");
    });
    it("formats a negative delta", () => {
      expect(signedCurrency(-88)).toBe("-$88.00");
    });
  });

  describe("format.compactNumber", () => {
    it("compacts millions/thousands at 1dp", () => {
      expect(compactNumber(4_700_000)).toBe("4.7M");
      expect(compactNumber(12_300)).toBe("12.3K");
    });
    it("leaves sub-1000 as an integer", () => {
      expect(compactNumber(842)).toBe("842");
    });
  });

  describe("format.greek", () => {
    it("uses 3dp for delta/gamma/vega/rho", () => {
      expect(greek(0.4213, "delta")).toBe("0.421");
    });
    it("uses 2dp for theta", () => {
      expect(greek(-0.128, "theta")).toBe("-0.13");
    });
  });

  describe("format.relativeAge", () => {
    it("renders seconds/minutes/hours/days", () => {
      expect(relativeAge(42)).toBe("42s");
      expect(relativeAge(150)).toBe("3m");
      expect(relativeAge(7200)).toBe("2h");
      expect(relativeAge(259200)).toBe("3d");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:lib -- format`
  Expected: FAIL with `Error: Failed to resolve import "@/lib/format"` — the module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/lib/format.ts`:
  ```ts
  // dashboard/lib/format.ts

  /** Price, always 2dp with a leading "$". Returns "—" for null/non-finite. */
  export function price(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    return `$${v.toFixed(2)}`;
  }

  /**
   * Percent/return, 1dp, signed. Caller declares whether the source value is
   * already a ×100 percent ("percent") or a raw fraction ("fraction").
   * Returns "—" for null/non-finite.
   */
  export function pct(v: number | null | undefined, unit: "percent" | "fraction"): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const asPercent = unit === "fraction" ? v * 100 : v;
    const sign = asPercent >= 0 ? "+" : "";
    return `${sign}${asPercent.toFixed(1)}%`;
  }

  /** Whole-number percent (agreement/coverage figures). Unsigned. */
  export function pctWhole(v: number | null | undefined, unit: "percent" | "fraction"): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const asPercent = unit === "fraction" ? v * 100 : v;
    return `${Math.round(asPercent)}%`;
  }

  /** Signed currency delta, e.g. "+$1,204.50" / "-$88.00". 2dp, thousands-separated. */
  export function signedCurrency(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const sign = v >= 0 ? "+" : "-";
    return `${sign}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /** Compact large number (GEX notional, OI, volume): "842", "12.3K", "4.7M", "1.2B". */
  export function compactNumber(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${Math.round(abs)}`;
  }

  export type GreekKind = "delta" | "gamma" | "theta" | "vega" | "rho";

  /** Option greek, precision per-kind. Returns "—" for null/non-finite. */
  export function greek(v: number | null | undefined, kind: GreekKind): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    const dp = kind === "theta" ? 2 : 3;
    const sign = v >= 0 ? "" : "-";
    return `${sign}${Math.abs(v).toFixed(dp)}`;
  }

  /** Relative age from a duration in **seconds**. "3s", "42s", "5m", "2h", "3d". */
  export function relativeAge(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${Math.round(minutes)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- format`  Expected: PASS (13/13)
- [ ] **Step 5: Commit**
  ```bash
  git add lib/format.ts lib/__tests__/format.test.ts
  git commit -m "feat(dashboard): add lib/format.ts — centralised price/pct/currency/greek/age formatting"
  ```

---

### Task 3: `dashboard/lib/labels.ts`

**Files:**
- Create: `dashboard/lib/labels.ts`
- Test: `dashboard/lib/__tests__/labels.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (named exports from `@/lib/labels`): `HEADER_GLOSS`, `QUADRANT_LABEL`, `COMBO_POSITION_LABEL`, `COMBO_LETTER_LABEL`, `LADDER_CODE_LABEL`, `GREEK_LABEL`, `PORTFOLIO_EDGE_LABEL`, `VERDICT_LABEL`, `TIER_LABEL`, `WATCHLIST_STATUS_LABEL`.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/labels.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    HEADER_GLOSS,
    QUADRANT_LABEL,
    COMBO_POSITION_LABEL,
    COMBO_LETTER_LABEL,
    LADDER_CODE_LABEL,
    GREEK_LABEL,
    PORTFOLIO_EDGE_LABEL,
    VERDICT_LABEL,
    TIER_LABEL,
    WATCHLIST_STATUS_LABEL,
  } from "@/lib/labels";

  describe("labels.HEADER_GLOSS", () => {
    it("has an entry for every Today/Screener table header code", () => {
      for (const key of ["C", "⚑", "Cat", "Sent", "Tech", "Fund", "RS-Ratio", "RS-Mom", "Breadth", "n"]) {
        expect(HEADER_GLOSS[key]).toBeTruthy();
      }
    });
  });

  describe("labels.QUADRANT_LABEL", () => {
    it("has all four RRG quadrants", () => {
      expect(QUADRANT_LABEL.leading).toBe("Leading");
      expect(QUADRANT_LABEL.weakening).toBe("Weakening");
      expect(QUADRANT_LABEL.lagging).toBe("Lagging");
      expect(QUADRANT_LABEL.improving).toBe("Improving");
    });
  });

  describe("labels.COMBO_POSITION_LABEL", () => {
    it("lists exactly 4 families in builder.py order, breakout second", () => {
      expect(COMBO_POSITION_LABEL.map(([family]) => family)).toEqual([
        "ma_trend",
        "breakout",
        "squeeze",
        "momentum_osc",
      ]);
    });
  });

  describe("labels.COMBO_LETTER_LABEL", () => {
    it("glosses L/S/N", () => {
      expect(COMBO_LETTER_LABEL.L).toBe("Long-dominant");
      expect(COMBO_LETTER_LABEL.S).toBe("Short-dominant");
      expect(COMBO_LETTER_LABEL.N).toBe("Mixed / no dominant side");
    });
  });

  describe("labels.LADDER_CODE_LABEL", () => {
    it("glosses SPOT/ZG/CW/PW", () => {
      for (const key of ["SPOT", "ZG", "CW", "PW"]) {
        expect(LADDER_CODE_LABEL[key as "SPOT"]).toBeTruthy();
      }
    });
  });

  describe("labels.GREEK_LABEL", () => {
    it("has symbol + gloss for all 5 greeks", () => {
      expect(GREEK_LABEL.delta.symbol).toBe("Δ");
      expect(GREEK_LABEL.theta.symbol).toBe("Θ");
      expect(GREEK_LABEL.rho.gloss).toContain("interest rate");
    });
  });

  describe("labels.PORTFOLIO_EDGE_LABEL", () => {
    it("covers all 6 tracker.py edge values", () => {
      for (const key of ["HOLD/ADD", "CONSIDER SELLING", "CONSIDER COVERING", "NEUTRAL", "N/A", "NO DATA"]) {
        expect(PORTFOLIO_EDGE_LABEL[key]).toBeTruthy();
      }
    });
  });

  describe("labels.VERDICT_LABEL / TIER_LABEL / WATCHLIST_STATUS_LABEL", () => {
    it("cover their closed value sets", () => {
      expect(VERDICT_LABEL.LONG).toBeTruthy();
      expect(VERDICT_LABEL.SHORT).toBeTruthy();
      expect(VERDICT_LABEL.WAIT).toBeTruthy();
      expect(TIER_LABEL.PRIME_LONG).toBeTruthy();
      expect(TIER_LABEL.AVOID).toBeTruthy();
      expect(WATCHLIST_STATUS_LABEL.in).toBe("Still in setup");
      expect(WATCHLIST_STATUS_LABEL.out).toBe("Setup invalidated");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:lib -- labels`
  Expected: FAIL with `Error: Failed to resolve import "@/lib/labels"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/lib/labels.ts`:
  ```ts
  // dashboard/lib/labels.ts

  /** Today/Screener table header glosses (X-06/X-07, TD-05). */
  export const HEADER_GLOSS: Record<string, string> = {
    C: "Conviction — model confidence in the call. More filled dots = higher conviction. Display-only, not blended into the composite score.",
    "⚑": "Flags — extended move (ext) and/or an earnings date inside the typical hold window (E{n}d).",
    Cat: "Catalysts — count of named events (earnings, guidance, index changes, etc.) behind the signal. Hover/focus for the list.",
    Sent: "Sentiment leg — X/Twitter chatter score, validated independently of price action.",
    Tech: "Technical leg — ~70-agent ensemble's price/volume-based score.",
    Fund: "Fundamental/catalyst leg — earnings proximity, guidance, and other event-driven inputs.",
    "RS-Ratio": "Relative Strength Ratio (JdK RRG) — the industry's price strength vs. its benchmark, normalized around 100. >100 = outperforming.",
    "RS-Mom": "Relative Strength Momentum (JdK RRG) — the rate of change of RS-Ratio. >100 = the strength trend is accelerating.",
    Breadth: "% of names in the industry basket trading above their 50-day moving average. Improving quadrant + low breadth = one name carrying the move, unconfirmed.",
    n: "Basket size — number of names sampled for the industry's RS/breadth. <20 is shrinkage-adjusted and shown muted.",
  };

  /** RRG quadrant labels (RotationPanel `QuadrantDot`). */
  export const QUADRANT_LABEL: Record<"leading" | "weakening" | "lagging" | "improving", string> = {
    leading: "Leading",
    weakening: "Weakening",
    lagging: "Lagging",
    improving: "Improving",
  };

  /**
   * Combo code decode (TK-07). Ground truth: `argus/argus/action_card/builder.py`
   * `_combo_string()` builds a 5-character string, one char per vote family, in
   * fixed order: ma_trend, breakout, squeeze, momentum_osc, weekly_structure.
   * Each char is 'L' (long-dominant), 'S' (short-dominant), or 'N' (no dominant
   * side — mixed/neutral), decided by `_family_dominant()`'s confidence-weighted
   * 1.3x-margin rule. The dashboard (and the backend's own `_WEAK_COMBOS` check,
   * `builder.py` — `combo[:4] not in _WEAK_COMBOS`) only classifies the first 4
   * characters; the 5th (weekly_structure) exists in the raw string but is not
   * part of the STRONG/WEAK classification the dashboard currently uses. This
   * corrects the prior UI copy's guess of "trend/squeeze/oscillator/structure" —
   * the real 2nd position is breakout, not squeeze.
   */
  export const COMBO_POSITION_LABEL: [family: string, gloss: string][] = [
    ["ma_trend", "Moving-average trend — price above/below trend MAs."],
    ["breakout", "Breakout — price breaking out of its recent range."],
    ["squeeze", "Volatility squeeze — market compressed ahead of a move."],
    ["momentum_osc", "Momentum oscillator — RSI/Stochastic-style overbought/oversold read."],
  ];
  export const COMBO_LETTER_LABEL: Record<"L" | "S" | "N", string> = {
    L: "Long-dominant",
    S: "Short-dominant",
    N: "Mixed / no dominant side",
  };

  /** Options ladder header codes (OL-13/OD-06). Ground truth: `app/odte/strikes/page.tsx`'s "How to read this ladder" copy. */
  export const LADDER_CODE_LABEL: Record<"SPOT" | "ZG" | "CW" | "PW", string> = {
    SPOT: "Current underlying price — the ladder auto-scrolls to keep this centered.",
    ZG: "Zero-gamma flip — below it dealers are typically short gamma (moves amplify); above it, long gamma (moves dampen).",
    CW: "Call wall — the strike with the heaviest dealer gamma on the call side; acts as resistance.",
    PW: "Put wall — the strike with the heaviest dealer gamma on the put side; acts as support.",
  };

  /** Option greek symbols + glosses, keyed by `lib/format.ts`'s `GreekKind` (OL-12). */
  export const GREEK_LABEL: Record<"delta" | "gamma" | "theta" | "vega" | "rho", { symbol: string; gloss: string }> = {
    delta: { symbol: "Δ", gloss: "Delta — dollar change in option price per $1 move in the underlying." },
    gamma: { symbol: "Γ", gloss: "Gamma — rate of change of delta per $1 move in the underlying." },
    theta: { symbol: "Θ", gloss: "Theta — dollar decay in option price per day, all else equal." },
    vega: { symbol: "ν", gloss: "Vega — dollar change in option price per 1-point move in implied volatility." },
    rho: { symbol: "ρ", gloss: "Rho — dollar change in option price per 1-point move in interest rates." },
  };

  /** Portfolio "edge" values (PF-08). Ground truth: `argus/argus/portfolio/tracker.py:56-69`. */
  export const PORTFOLIO_EDGE_LABEL: Record<string, string> = {
    "HOLD/ADD": "The current Argus verdict agrees with your position direction — hold, or add on strength.",
    "CONSIDER SELLING": "You're long and the current Argus verdict flipped SHORT — the original thesis is being contradicted.",
    "CONSIDER COVERING": "You're short and the current Argus verdict flipped LONG — the original thesis is being contradicted.",
    NEUTRAL: "The current Argus verdict is WAIT — no directional edge either way right now.",
    "N/A": "Not a stock position (option/future/etc.) — Argus's equity verdict doesn't apply.",
    "NO DATA": "Price history is unavailable for this symbol right now — edge can't be computed.",
  };

  /** Verdict values (Badge variant="verdict", screener/portfolio/ticker). */
  export const VERDICT_LABEL: Record<string, string> = {
    LONG: "Ensemble leans long — long-side agents dominate on a confidence-weighted basis.",
    SHORT: "Ensemble leans short — short-side agents dominate on a confidence-weighted basis.",
    WAIT: "No directional lean clears the bar either way.",
  };

  /** Tier values (Badge variant="tier", screener/today). */
  export const TIER_LABEL: Record<string, string> = {
    PRIME_LONG: "Highest-conviction long setup — clears every gate.",
    BREAKOUT_LONG: "Long setup flagged for an active breakout.",
    STANDARD_LONG: "Clears the baseline long bar but isn't prime or breakout-flagged.",
    WATCH: "Below the actionable bar — worth tracking, not yet a call.",
    AVOID: "Setup actively argues against a long position right now.",
    WAIT: "No actionable read in either direction.",
  };

  /** Watchlist "Still in?" column rename (WL-05) — declarative, not a question. */
  export const WATCHLIST_STATUS_LABEL: Record<"in" | "out", string> = {
    in: "Still in setup",
    out: "Setup invalidated",
  };
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:lib -- labels`  Expected: PASS (8/8)
- [ ] **Step 5: Commit**
  ```bash
  git add lib/labels.ts lib/__tests__/labels.test.ts
  git commit -m "feat(dashboard): add lib/labels.ts — centralised header/combo/ladder/greek/edge glosses"
  ```

---

### Task 4: `dashboard/lib/storageKeys.ts`

**Files:**
- Create: `dashboard/lib/storageKeys.ts`
- Test: `dashboard/lib/__tests__/storageKeys.test.ts`

**Interfaces:**
- Consumes: `@/test/localStorage` (`resetLocalStorage`) in the test only.
- Produces (named exports from `@/lib/storageKeys`): `STATIC_KEYS`, `DYNAMIC_KEY_PREFIXES`, `LEGACY_KEY_PREFIXES`, `resetAllStoredPrefs()`. Consumed later by `Collapsible` (Task 8, `dash:collapsible:` prefix), `DataTable` (Task 19, `dash:table:` prefix), `CandleChart` migration (Task 33, `dash:chart:` prefix), and `WatchlistClient`'s existing `argus_watchlist` one-time migration (Task 30, `LEGACY_KEY_PREFIXES`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/storageKeys.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from "vitest";
  import { resetLocalStorage } from "@/test/localStorage";
  import { STATIC_KEYS, DYNAMIC_KEY_PREFIXES, LEGACY_KEY_PREFIXES, resetAllStoredPrefs } from "@/lib/storageKeys";

  beforeEach(() => {
    resetLocalStorage();
  });

  describe("storageKeys registry", () => {
    it("names the today-filters static key", () => {
      expect(STATIC_KEYS.todayFilters).toBe("dash:today:filters");
    });

    it("lists the collapsible/table/chart dynamic prefixes", () => {
      expect(DYNAMIC_KEY_PREFIXES).toContain("dash:collapsible:");
      expect(DYNAMIC_KEY_PREFIXES).toContain("dash:table:");
      expect(DYNAMIC_KEY_PREFIXES).toContain("dash:chart:");
    });

    it("lists the retired panel prefix and the legacy watchlist key", () => {
      expect(LEGACY_KEY_PREFIXES).toContain("dash:panel:");
      expect(LEGACY_KEY_PREFIXES).toContain("argus_watchlist");
    });
  });

  describe("resetAllStoredPrefs", () => {
    it("clears every dash:* key and the legacy watchlist key", () => {
      localStorage.setItem("dash:today:filters", "{}");
      localStorage.setItem("dash:collapsible:rotation", "1");
      localStorage.setItem("dash:table:screener:sort", "score");
      localStorage.setItem("dash:chart:AAPL", "{}");
      localStorage.setItem("dash:panel:diff", "0");
      localStorage.setItem("argus_watchlist", "[]");

      resetAllStoredPrefs();

      expect(localStorage.getItem("dash:today:filters")).toBeNull();
      expect(localStorage.getItem("dash:collapsible:rotation")).toBeNull();
      expect(localStorage.getItem("dash:table:screener:sort")).toBeNull();
      expect(localStorage.getItem("dash:chart:AAPL")).toBeNull();
      expect(localStorage.getItem("dash:panel:diff")).toBeNull();
      expect(localStorage.getItem("argus_watchlist")).toBeNull();
    });

    it("leaves unrelated keys untouched", () => {
      localStorage.setItem("some_other_app_key", "keep-me");
      resetAllStoredPrefs();
      expect(localStorage.getItem("some_other_app_key")).toBe("keep-me");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- storageKeys`
  Expected: FAIL with `Error: Failed to resolve import "@/lib/storageKeys"` — module does not exist yet. (Uses `test:component`, not `test:lib`, because it imports `@/test/localStorage`, which requires the jsdom `localStorage` global from the `component` Vitest project.)
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/lib/storageKeys.ts`:
  ```ts
  // dashboard/lib/storageKeys.ts

  /**
   * Every localStorage key this app writes. Keep this list exhaustive — it is
   * the source G-14's "reset all stored preferences" action reads to know what
   * to clear. Do not construct a `dash:*` key anywhere except via the helpers
   * below (or, for truly dynamic per-instance keys like `dash:collapsible:{key}`,
   * by matching the *prefix* patterns listed in `DYNAMIC_KEY_PREFIXES`).
   */
  export const STATIC_KEYS = {
    todayFilters: "dash:today:filters",
  } as const;

  /**
   * Prefixes for dynamically-suffixed keys (one per persisted component
   * instance). `resetAllStoredPrefs()` clears every localStorage key starting
   * with any of these, plus every key in STATIC_KEYS.
   */
  export const DYNAMIC_KEY_PREFIXES = [
    "dash:collapsible:", // Collapsible primitive (replaces dash:panel: below)
    "dash:table:",       // DataTable sort state — "dash:table:{persistKey}:sort"
    "dash:chart:",       // per-ticker chart settings — "dash:chart:{ticker}"
  ] as const;

  /** Retired prefix, still read (one-time migration) but never written after the Collapsible rollout — see contract §F. */
  export const LEGACY_KEY_PREFIXES = [
    "dash:panel:",      // Panel.tsx / DiffStrip.tsx pre-Collapsible key — migrate value into dash:collapsible: on first read, then stop writing this prefix.
    "argus_watchlist",  // pre-API-backed watchlist (WL-07) — one-time read-and-clear on the watchlist page, per existing migration code in WatchlistClient.tsx.
  ] as const;

  export function resetAllStoredPrefs(): void {
    const prefixes: readonly string[] = [...DYNAMIC_KEY_PREFIXES, ...LEGACY_KEY_PREFIXES];
    const staticKeys: string[] = Object.values(STATIC_KEYS);
    for (const key of Object.keys(localStorage)) {
      if (staticKeys.includes(key) || prefixes.some((p) => key.startsWith(p))) {
        localStorage.removeItem(key);
      }
    }
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- storageKeys`  Expected: PASS (5/5)
- [ ] **Step 5: Commit**
  ```bash
  git add lib/storageKeys.ts lib/__tests__/storageKeys.test.ts
  git commit -m "feat(dashboard): add lib/storageKeys.ts — exhaustive localStorage key registry + resetAllStoredPrefs"
  ```

---

### Task 5: `components/ui/Button.tsx`

**Files:**
- Create: `dashboard/components/ui/Button.tsx`
- Test: `dashboard/components/ui/__tests__/Button.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `Button`, named types `ButtonVariant`, `ButtonSize`, `ButtonProps` from `@/components/ui/Button`. Consumed by Tasks 21 (screener), 22 (alerts).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Button.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import Button from "@/components/ui/Button";
  import { ArrowRight } from "lucide-react";

  describe("Button", () => {
    it("renders children and calls onClick", async () => {
      const onClick = vi.fn();
      render(<Button onClick={onClick}>Run</Button>);
      await userEvent.click(screen.getByRole("button", { name: "Run" }));
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("defaults to h-8 secondary styling", () => {
      render(<Button>Default</Button>);
      const btn = screen.getByRole("button", { name: "Default" });
      expect(btn).toHaveClass("h-8", "border-line", "bg-raised");
    });

    it("never sets focus:outline-none", () => {
      render(<Button>Focusable</Button>);
      expect(screen.getByRole("button", { name: "Focusable" }).className).not.toMatch(/outline-none/);
    });

    it("applies the primary variant classes", () => {
      render(<Button variant="primary">Go</Button>);
      expect(screen.getByRole("button", { name: "Go" })).toHaveClass("border-accent", "bg-accent-dim", "text-accent");
    });

    it("applies the danger variant classes", () => {
      render(<Button variant="danger">Delete</Button>);
      expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("border-neg/50", "bg-neg/10", "text-neg");
    });

    it("applies the sm size classes", () => {
      render(<Button size="sm">Small</Button>);
      expect(screen.getByRole("button", { name: "Small" })).toHaveClass("h-7", "px-2.5");
    });

    it("disables the button and blocks onClick while loading", async () => {
      const onClick = vi.fn();
      render(<Button loading onClick={onClick}>Run</Button>);
      const btn = screen.getByRole("button", { name: "Run" });
      expect(btn).toBeDisabled();
      await userEvent.click(btn);
      expect(onClick).not.toHaveBeenCalled();
    });

    it("renders a leading icon when not loading", () => {
      render(<Button icon={<ArrowRight data-testid="icon" size={14} />}>Go</Button>);
      expect(screen.getByTestId("icon")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Button`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/Button"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/Button.tsx`:
  ```tsx
  // dashboard/components/ui/Button.tsx
  import { ButtonHTMLAttributes, forwardRef } from "react";

  export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
  export type ButtonSize = "sm" | "md";

  export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** Visual treatment. Default: "secondary". */
    variant?: ButtonVariant;
    /** Height/padding. Default: "md" (h-8/32px). "sm" is h-7/28px for dense inline contexts (table row actions). */
    size?: ButtonSize;
    /** Shows a spinner in place of the leading icon slot and disables the button. Default: false. */
    loading?: boolean;
    /** Optional leading icon (e.g. lucide-react component), hidden while loading. */
    icon?: React.ReactNode;
  }

  const VARIANT: Record<ButtonVariant, string> = {
    primary: "border-accent bg-accent-dim text-accent hover:bg-accent/20",
    secondary: "border-line bg-raised text-foreground hover:border-line-strong",
    danger: "border-neg/50 bg-neg/10 text-neg hover:bg-neg/20",
    ghost: "border-transparent bg-transparent text-muted hover:text-foreground hover:bg-elevated",
  };

  const SIZE: Record<ButtonSize, string> = {
    sm: "h-7 px-2.5 text-[12px]",
    md: "h-8 px-3.5 text-[13px]",
  };

  const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { variant = "secondary", size = "md", loading = false, icon, disabled, className, children, ...rest },
    ref
  ) {
    const cls = [
      "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors",
      "disabled:opacity-50 disabled:pointer-events-none",
      VARIANT[variant],
      SIZE[size],
      className ?? "",
    ].join(" ");

    return (
      <button ref={ref} type="button" disabled={disabled || loading} className={cls} {...rest}>
        {loading ? <Spinner /> : icon}
        {children}
      </button>
    );
  });

  function Spinner() {
    return (
      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
    );
  }

  export default Button;
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Button`  Expected: PASS (7/7)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Button.tsx components/ui/__tests__/Button.test.tsx
  git commit -m "feat(dashboard): add Button primitive — h-8 bordered-ghost, one visual language app-wide"
  ```

---

### Task 6: `components/ui/Input.tsx`

**Files:**
- Create: `dashboard/components/ui/Input.tsx`
- Test: `dashboard/components/ui/__tests__/Input.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `Input`, named type `InputProps` from `@/components/ui/Input`. Consumed by Tasks 21 (screener), 22 (alerts), 30 (watchlist add-ticker).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Input.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import Input from "@/components/ui/Input";
  import { Search } from "lucide-react";

  describe("Input", () => {
    it("renders a text input and reports typed value", async () => {
      const onChange = vi.fn();
      render(<Input placeholder="Filter tickers" onChange={onChange} />);
      await userEvent.type(screen.getByPlaceholderText("Filter tickers"), "AAPL");
      expect(onChange).toHaveBeenCalledTimes(4);
    });

    it("never sets focus:outline-none", () => {
      render(<Input placeholder="x" />);
      expect(screen.getByPlaceholderText("x").className).not.toMatch(/outline-none/);
    });

    it("adds left padding and renders the icon when icon is supplied", () => {
      render(<Input icon={<Search data-testid="icon" size={14} />} placeholder="Search" />);
      expect(screen.getByTestId("icon")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search")).toHaveClass("pl-8");
    });

    it("sets aria-invalid and the neg border when invalid", () => {
      render(<Input invalid placeholder="Bad" />);
      const el = screen.getByPlaceholderText("Bad");
      expect(el).toHaveAttribute("aria-invalid", "true");
      expect(el).toHaveClass("border-neg");
    });

    it("does not set aria-invalid when not invalid", () => {
      render(<Input placeholder="Good" />);
      expect(screen.getByPlaceholderText("Good")).not.toHaveAttribute("aria-invalid");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Input`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/Input"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/Input.tsx`:
  ```tsx
  // dashboard/components/ui/Input.tsx
  import { InputHTMLAttributes, forwardRef } from "react";

  export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    /** Renders a leading icon slot (e.g. <Search size={14} />). Default: none. */
    icon?: React.ReactNode;
    /** Marks the field invalid — red border + aria-invalid. Default: false. */
    invalid?: boolean;
  }

  const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { icon, invalid = false, className, ...rest },
    ref
  ) {
    const inputCls = [
      "h-8 w-full rounded border bg-raised text-[13px] text-foreground placeholder-muted",
      "transition-colors focus:border-accent",
      invalid ? "border-neg" : "border-line",
      icon ? "pl-8 pr-3" : "px-3",
      className ?? "",
    ].join(" ");

    return (
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            {icon}
          </span>
        )}
        <input ref={ref} aria-invalid={invalid || undefined} className={inputCls} {...rest} />
      </div>
    );
  });

  export default Input;
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Input`  Expected: PASS (5/5)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Input.tsx components/ui/__tests__/Input.test.tsx
  git commit -m "feat(dashboard): add Input primitive — no outline-none, global focus-visible only"
  ```

---

### Task 7: `components/ui/Select.tsx`

**Files:**
- Create: `dashboard/components/ui/Select.tsx`
- Test: `dashboard/components/ui/__tests__/Select.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `Select`, named types `SelectOption`, `SelectProps` from `@/components/ui/Select`. Consumed by Tasks 22 (alerts), 23 (SignalGroups `FilterSelect`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Select.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import Select from "@/components/ui/Select";

  const OPTIONS = [
    { value: "all", label: "All groups" },
    { value: "prime", label: "Prime long" },
  ];

  describe("Select", () => {
    it("renders one <option> per entry with the given label", () => {
      render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
      expect(screen.getByRole("option", { name: "All groups" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Prime long" })).toBeInTheDocument();
    });

    it("reports the selected value via onChange", async () => {
      const onChange = vi.fn();
      render(<Select options={OPTIONS} value="all" onChange={onChange} />);
      await userEvent.selectOptions(screen.getByRole("combobox"), "prime");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("never sets focus:outline-none", () => {
      render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
      expect(screen.getByRole("combobox").className).not.toMatch(/outline-none/);
    });

    it("uses h-8 sizing", () => {
      render(<Select options={OPTIONS} value="all" onChange={() => {}} />);
      expect(screen.getByRole("combobox")).toHaveClass("h-8", "rounded");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Select`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/Select"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/Select.tsx`:
  ```tsx
  // dashboard/components/ui/Select.tsx
  import { SelectHTMLAttributes, forwardRef } from "react";
  import { ChevronDown } from "lucide-react";

  export interface SelectOption {
    value: string;
    label: string;
  }

  export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
    options: SelectOption[];
  }

  const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { options, className, ...rest },
    ref
  ) {
    const cls = [
      "h-8 w-full cursor-pointer appearance-none rounded border border-line bg-raised",
      "pl-2.5 pr-7 text-[13px] text-foreground focus:border-accent",
      className ?? "",
    ].join(" ");

    return (
      <div className="relative">
        <select ref={ref} className={cls} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
        />
      </div>
    );
  });

  export default Select;
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Select`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Select.tsx components/ui/__tests__/Select.test.tsx
  git commit -m "feat(dashboard): add Select primitive — first shared select, h-8 to match Button/Input"
  ```

---

### Task 8: `components/ui/Collapsible.tsx`

**Files:**
- Create: `dashboard/components/ui/Collapsible.tsx`
- Test: `dashboard/components/ui/__tests__/Collapsible.test.tsx`

**Interfaces:**
- Consumes: nothing (writes directly to `localStorage` using the `dash:collapsible:{persistKey}` convention named in `lib/storageKeys.ts`, Task 4 — does not import that module, since the prefix is a literal template, not a registry lookup).
- Produces: default export `Collapsible`, named types `CollapsibleProps` from `@/components/ui/Collapsible`. Consumed by Tasks 20 (Panel), 25 (DiffStrip), 26 (VerdictCard), 27 (WhyPanel votes accordion).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Collapsible.test.tsx`:
  ```tsx
  import { describe, it, expect, beforeEach } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import Collapsible from "@/components/ui/Collapsible";

  describe("Collapsible", () => {
    beforeEach(() => resetLocalStorage());

    it("starts closed by default and toggles aria-expanded on click", async () => {
      render(
        <Collapsible trigger="Sector rotation">
          <div>body content</div>
        </Collapsible>
      );
      const trigger = screen.getByRole("button", { name: "Sector rotation" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("honors defaultOpen", () => {
      render(
        <Collapsible trigger="Open by default" defaultOpen>
          <div>body</div>
        </Collapsible>
      );
      expect(screen.getByRole("button", { name: "Open by default" })).toHaveAttribute("aria-expanded", "true");
    });

    it("links trigger aria-controls to the content div's id", () => {
      render(
        <Collapsible trigger="Linked">
          <div>body</div>
        </Collapsible>
      );
      const trigger = screen.getByRole("button", { name: "Linked" });
      const controlsId = trigger.getAttribute("aria-controls");
      expect(controlsId).toBeTruthy();
      expect(document.getElementById(controlsId as string)).not.toBeNull();
    });

    it("persists open state to dash:collapsible:{persistKey} and restores it on remount", async () => {
      const { unmount } = render(
        <Collapsible trigger="Persisted" persistKey="rotation">
          <div>body</div>
        </Collapsible>
      );
      await userEvent.click(screen.getByRole("button", { name: "Persisted" }));
      expect(localStorage.getItem("dash:collapsible:rotation")).toBe("true");
      unmount();

      render(
        <Collapsible trigger="Persisted" persistKey="rotation">
          <div>body</div>
        </Collapsible>
      );
      expect(await screen.findByRole("button", { name: "Persisted", expanded: true })).toBeInTheDocument();
    });

    it("disables the trigger and shows disabledReason as a title tooltip when disabled", async () => {
      render(
        <Collapsible trigger="Locked" disabled disabledReason="No detail available yet">
          <div>body</div>
        </Collapsible>
      );
      const trigger = screen.getByRole("button", { name: "Locked" });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute("title", "No detail available yet");
    });

    it("does not toggle when disabled", async () => {
      render(
        <Collapsible trigger="Locked" disabled disabledReason="No detail available yet">
          <div>body</div>
        </Collapsible>
      );
      const trigger = screen.getByRole("button", { name: "Locked" });
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Collapsible`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/Collapsible"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/Collapsible.tsx`:
  ```tsx
  // dashboard/components/ui/Collapsible.tsx
  "use client";
  import { useEffect, useId, useState, ReactNode } from "react";
  import { ChevronDown } from "lucide-react";

  type CollapsibleDisabled =
    | { disabled?: false; disabledReason?: never }
    | { disabled: true; disabledReason: string };

  export type CollapsibleProps = {
    /** Trigger content (rendered inside the toggle button, left of the chevron). */
    trigger: ReactNode;
    children: ReactNode;
    /** Uncontrolled initial state when no persistKey (or no stored value yet). Default: false. */
    defaultOpen?: boolean;
    /** localStorage key suffix — persisted at `dash:collapsible:{persistKey}`. Omit for non-persisted (e.g. per-row) instances. */
    persistKey?: string;
    className?: string;
    triggerClassName?: string;
  } & CollapsibleDisabled;

  export default function Collapsible({
    trigger,
    children,
    defaultOpen = false,
    persistKey,
    disabled,
    disabledReason,
    className,
    triggerClassName,
  }: CollapsibleProps) {
    const id = useId();
    const storageKey = persistKey ? `dash:collapsible:${persistKey}` : null;
    const [open, setOpen] = useState(defaultOpen);

    // Hydration-safe: render `defaultOpen` on the server and the first client
    // pass (matching), then reconcile from localStorage post-mount.
    useEffect(() => {
      if (storageKey) {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) setOpen(stored === "true");
      }
    }, [storageKey]);

    function toggle() {
      if (disabled) return;
      const next = !open;
      setOpen(next);
      if (storageKey) localStorage.setItem(storageKey, String(next));
    }

    return (
      <div className={className}>
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          aria-expanded={open}
          aria-controls={id}
          className={[
            "flex w-full items-center gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed",
            triggerClassName ?? "",
          ].join(" ")}
        >
          <span className="min-w-0 flex-1">{trigger}</span>
          {!disabled && (
            <ChevronDown
              size={14}
              className="ml-auto shrink-0 text-muted transition-transform duration-200"
              style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
          )}
        </button>
        <div
          id={id}
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">{children}</div>
        </div>
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Collapsible`  Expected: PASS (6/6)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Collapsible.tsx components/ui/__tests__/Collapsible.test.tsx
  git commit -m "feat(dashboard): add Collapsible primitive — grid-rows disclosure, replaces 4 hand-rolled panels"
  ```

---

### Task 9: `components/ui/UndoToastProvider.tsx` + mount in `app/layout.tsx`

**Files:**
- Create: `dashboard/components/ui/UndoToastProvider.tsx`
- Modify: `dashboard/app/layout.tsx:40-45`
- Test: `dashboard/components/ui/__tests__/UndoToastProvider.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `UndoToastProvider`, named exports `useUndoAction`, `UndoActionArgs` from `@/components/ui/UndoToastProvider`. Consumed by Tasks 10 (PinToggle), 22 (alerts delete-undo), 30 (watchlist unpin-undo).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/UndoToastProvider.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import UndoToastProvider, { useUndoAction } from "@/components/ui/UndoToastProvider";

  function Trigger({ onError, undo }: { onError: () => void; undo: () => void }) {
    const { run } = useUndoAction();
    return (
      <button
        type="button"
        onClick={() =>
          run({
            label: "Removed AAPL from watchlist",
            commit: () => Promise.resolve(),
            onError,
            undo,
          })
        }
      >
        Unpin
      </button>
    );
  }

  describe("UndoToastProvider", () => {
    it("throws when useUndoAction is used outside the provider", () => {
      function Bare() {
        useUndoAction();
        return null;
      }
      expect(() => render(<Bare />)).toThrow("useUndoAction must be used within UndoToastProvider");
    });

    it("shows the toast label after run() and calls commit immediately", async () => {
      const commit = vi.fn(() => Promise.resolve());
      function T() {
        const { run } = useUndoAction();
        return (
          <button onClick={() => run({ label: "Removed AAPL from watchlist", commit, onError: () => {}, undo: () => {} })}>
            Unpin
          </button>
        );
      }
      render(
        <UndoToastProvider>
          <T />
        </UndoToastProvider>
      );
      await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
      expect(commit).toHaveBeenCalledTimes(1);
      expect(await screen.findByText("Removed AAPL from watchlist")).toBeInTheDocument();
    });

    it("calls undo and dismisses the toast when Undo is clicked", async () => {
      const undo = vi.fn();
      render(
        <UndoToastProvider>
          <Trigger onError={() => {}} undo={undo} />
        </UndoToastProvider>
      );
      await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
      await userEvent.click(await screen.findByRole("button", { name: "Undo" }));
      expect(undo).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Removed AAPL from watchlist")).not.toBeInTheDocument();
    });

    it("calls onError when commit rejects", async () => {
      const onError = vi.fn();
      function T() {
        const { run } = useUndoAction();
        return (
          <button
            onClick={() =>
              run({ label: "Removed AAPL from watchlist", commit: () => Promise.reject(new Error("boom")), onError, undo: () => {} })
            }
          >
            Unpin
          </button>
        );
      }
      render(
        <UndoToastProvider>
          <T />
        </UndoToastProvider>
      );
      await userEvent.click(screen.getByRole("button", { name: "Unpin" }));
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- UndoToastProvider`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/UndoToastProvider"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/UndoToastProvider.tsx`:
  ```tsx
  // dashboard/components/ui/UndoToastProvider.tsx
  "use client";
  import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";

  export interface UndoActionArgs {
    /** Toast message, e.g. "Removed AAPL from watchlist". */
    label: string;
    /** Fires immediately (the action is optimistic — already applied to local state before this is called). */
    commit: () => Promise<unknown>;
    /** Fires if `commit` rejects/fails — caller reconciles local state (e.g. re-fetch). */
    onError: () => void;
    /** Fires if the user clicks Undo within the window — caller reverts local state; `commit`'s server effect is also reversed by re-issuing the inverse call inside this function. */
    undo: () => void;
    /** Milliseconds before the toast auto-dismisses and the action becomes permanent. Default: 6000. */
    windowMs?: number;
  }

  interface UndoContextValue {
    run: (args: UndoActionArgs) => void;
  }

  const UndoContext = createContext<UndoContextValue | null>(null);

  export function useUndoAction(): UndoContextValue {
    const ctx = useContext(UndoContext);
    if (!ctx) throw new Error("useUndoAction must be used within UndoToastProvider");
    return ctx;
  }

  interface ToastState {
    id: number;
    label: string;
    undo: () => void;
  }

  export default function UndoToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null);
    const nextId = useRef(0);

    const run = useCallback((args: UndoActionArgs) => {
      const id = ++nextId.current;
      args.commit().catch(args.onError);
      setToast({ id, label: args.label, undo: args.undo });
      const windowMs = args.windowMs ?? 6000;
      setTimeout(() => setToast((t) => (t?.id === id ? null : t)), windowMs);
    }, []);

    return (
      <UndoContext.Provider value={{ run }}>
        {children}
        {toast && (
          <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-[13px] text-foreground shadow-lg">
            <span>{toast.label}</span>
            <button
              type="button"
              onClick={() => {
                toast.undo();
                setToast(null);
              }}
              className="font-medium text-accent hover:underline"
            >
              Undo
            </button>
          </div>
        )}
      </UndoContext.Provider>
    );
  }
  ```
  Modify `dashboard/app/layout.tsx` — add the import and wrap the existing `TooltipProvider` body:
  ```diff
   import TooltipProvider from "@/components/ui/TooltipProvider";
  +import UndoToastProvider from "@/components/ui/UndoToastProvider";
   import RailShell from "@/components/rails/RailShell";
  ```
  ```diff
         <TooltipProvider>
  -        <Nav contextStrip={<ContextStrip />} />
  -        <CommandK />
  -        <HelpOverlay />
  -        <RailShell>{children}</RailShell>
  +        <UndoToastProvider>
  +          <Nav contextStrip={<ContextStrip />} />
  +          <CommandK />
  +          <HelpOverlay />
  +          <RailShell>{children}</RailShell>
  +        </UndoToastProvider>
         </TooltipProvider>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- UndoToastProvider`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/UndoToastProvider.tsx components/ui/__tests__/UndoToastProvider.test.tsx app/layout.tsx
  git commit -m "feat(dashboard): add UndoToastProvider — optimistic-mutation undo affordance, mounted app-wide"
  ```

---

### Task 10: `components/ui/PinToggle.tsx`

**Files:**
- Create: `dashboard/components/ui/PinToggle.tsx`
- Test: `dashboard/components/ui/__tests__/PinToggle.test.tsx`

**Interfaces:**
- Consumes: `useUndoAction` from `@/components/ui/UndoToastProvider` (Task 9).
- Produces: default export `PinToggle`, named type `PinToggleProps` from `@/components/ui/PinToggle`. Consumed by Tasks 21 (screener `PinCell` replacement), 29 (ticker Header `PinButton` replacement), 30 (watchlist unpin replacement).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/PinToggle.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import UndoToastProvider from "@/components/ui/UndoToastProvider";
  import PinToggle from "@/components/ui/PinToggle";

  function withProvider(ui: React.ReactNode) {
    return <UndoToastProvider>{ui}</UndoToastProvider>;
  }

  describe("PinToggle", () => {
    it("chip variant: shows Pin when the symbol is not on the watchlist", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(withProvider(<PinToggle symbol="AAPL" />));
      expect(await screen.findByRole("button", { name: "Pin AAPL" })).toHaveTextContent("Pin");
    });

    it("chip variant: shows Pinned + aria-pressed=true when the symbol is on the watchlist", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [{ ticker: "AAPL" }] });
      render(withProvider(<PinToggle symbol="AAPL" />));
      const btn = await screen.findByRole("button", { name: "Unpin AAPL" });
      expect(btn).toHaveAttribute("aria-pressed", "true");
      expect(btn).toHaveTextContent("Pinned");
    });

    it("optimistically flips to Pinned on click and POSTs to /api/watchlist", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(withProvider(<PinToggle symbol="AAPL" />));
      const btn = await screen.findByRole("button", { name: "Pin AAPL" });
      await userEvent.click(btn);
      expect(await screen.findByRole("button", { name: "Unpin AAPL" })).toHaveAttribute("aria-pressed", "true");
      expect(fetch).toHaveBeenCalledWith(
        "/api/watchlist",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ ticker: "AAPL" }) })
      );
    });

    it("shows an undo toast after toggling", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(withProvider(<PinToggle symbol="AAPL" />));
      await userEvent.click(await screen.findByRole("button", { name: "Pin AAPL" }));
      expect(await screen.findByText("Added AAPL to watchlist")).toBeInTheDocument();
    });

    it("text variant: renders an inline Pin/Unpin link with aria-pressed", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(withProvider(<PinToggle symbol="AAPL" variant="text" />));
      const btn = await screen.findByRole("button", { name: "Pin" });
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- PinToggle`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/PinToggle"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/PinToggle.tsx`:
  ```tsx
  // dashboard/components/ui/PinToggle.tsx
  "use client";
  import useSWR from "swr";
  import { useUndoAction } from "./UndoToastProvider";

  export interface PinToggleProps {
    symbol: string;
    /** "chip" (bordered pill, Screener/Watchlist table cells) or "text" (inline link, ticker header). Default: "chip". */
    variant?: "chip" | "text";
    className?: string;
  }

  const fetcher = (url: string) => fetch(url).then((r) => r.json());

  export default function PinToggle({ symbol, variant = "chip", className }: PinToggleProps) {
    const { data, mutate } = useSWR<{ watchlist: { ticker: string }[] }>("/api/watchlist", fetcher, {
      revalidateOnFocus: false,
    });
    const pinned = data?.watchlist?.some((w) => w.ticker === symbol) ?? false;
    const { run } = useUndoAction();

    function toggle() {
      const wasPinned = pinned;
      mutate(
        (prev) => {
          if (!prev) return prev;
          const wl = wasPinned
            ? prev.watchlist.filter((w) => w.ticker !== symbol)
            : [...prev.watchlist, { ticker: symbol }];
          return { watchlist: wl };
        },
        false
      );
      run({
        label: wasPinned ? `Removed ${symbol} from watchlist` : `Added ${symbol} to watchlist`,
        commit: () =>
          fetch("/api/watchlist", {
            method: wasPinned ? "DELETE" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: symbol }),
          }),
        onError: () => mutate(),
        undo: () =>
          mutate(
            (prev) => {
              if (!prev) return prev;
              const wl = wasPinned
                ? [...prev.watchlist, { ticker: symbol }]
                : prev.watchlist.filter((w) => w.ticker !== symbol);
              return { watchlist: wl };
            },
            false
          ),
      });
    }

    if (variant === "text") {
      return (
        <button
          type="button"
          onClick={toggle}
          className={["text-[12px] underline-offset-2 hover:underline", pinned ? "text-warn" : "text-muted", className ?? ""].join(" ")}
          aria-pressed={pinned}
        >
          {pinned ? "Unpin" : "Pin"}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
        className={[
          "px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors",
          pinned ? "border-warn text-warn bg-warn/10" : "border-line text-muted hover:border-line-strong hover:text-foreground",
          className ?? "",
        ].join(" ")}
      >
        {pinned ? "Pinned" : "Pin"}
      </button>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- PinToggle`  Expected: PASS (5/5)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/PinToggle.tsx components/ui/__tests__/PinToggle.test.tsx
  git commit -m "feat(dashboard): add PinToggle primitive — consolidates 3 optimistic pin/unpin implementations"
  ```

---

### Task 11: `components/ui/CenterBar.tsx`

**Files:**
- Create: `dashboard/components/ui/CenterBar.tsx`
- Test: `dashboard/components/ui/__tests__/CenterBar.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `CenterBar`, named type `CenterBarProps` from `@/components/ui/CenterBar`. Replaces `components/ui/MicroBar.tsx` and `components/ui/ScoreBar.tsx` (both deleted; see Tasks 24 and 35) and `WhyPanel.tsx`'s inline `NetBar` (Task 27).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/CenterBar.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import CenterBar from "@/components/ui/CenterBar";

  describe("CenterBar", () => {
    it("defaults to 56x8", () => {
      const { container } = render(<CenterBar value={0.4} />);
      const track = container.querySelector("span > span") as HTMLElement;
      expect(track.style.width).toBe("56px");
      expect(track.style.height).toBe("8px");
    });

    it("accepts a custom width/height", () => {
      const { container } = render(<CenterBar value={0.4} width={100} height={8} />);
      const track = container.querySelector("span > span") as HTMLElement;
      expect(track.style.width).toBe("100px");
    });

    it("clamps value to [-1, 1] without throwing", () => {
      render(<CenterBar value={5} />);
      render(<CenterBar value={-5} />);
    });

    it("renders the em-dash fallback for non-finite values", () => {
      render(<CenterBar value={NaN} />);
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("shows a signed numeric label only when showValue is true", () => {
      const { rerender } = render(<CenterBar value={0.42} />);
      expect(screen.queryByText("+0.42")).not.toBeInTheDocument();
      rerender(<CenterBar value={0.42} showValue />);
      expect(screen.getByText("+0.42")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- CenterBar`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/CenterBar"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/CenterBar.tsx`:
  ```tsx
  // dashboard/components/ui/CenterBar.tsx
  export interface CenterBarProps {
    /** Value in [-1, 1]; clamped. */
    value: number;
    /** Pixel width. Default: 56 (table-cell size; use 100 for WhyPanel's NetBar, 80 for the old NetBar exactly). */
    width?: number;
    /** Pixel height. Default: 8. */
    height?: number;
    /** Show the numeric value to the right, e.g. "+0.42". Default: false. */
    showValue?: boolean;
  }

  export default function CenterBar({ value, width = 56, height = 8, showValue = false }: CenterBarProps) {
    if (!Number.isFinite(value)) {
      return <span className="font-mono text-[13px] tabular-nums text-muted">—</span>;
    }
    const clamped = Math.max(-1, Math.min(1, value));
    const isPos = clamped >= 0;
    const pct = Math.abs(clamped) * 50;

    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className="relative inline-block rounded-sm bg-elevated overflow-hidden"
          style={{ width, height }}
        >
          <span
            className="absolute top-0 h-full"
            style={{ left: isPos ? "50%" : `${50 - pct}%`, width: `${pct}%`, background: isPos ? "var(--green)" : "var(--red)" }}
          />
          <span className="absolute top-0 h-full w-px bg-muted/50" style={{ left: "50%" }} />
        </span>
        {showValue && (
          <span className="font-mono text-[13px] tabular-nums text-muted w-[38px] text-right">
            {clamped > 0 ? "+" : ""}
            {clamped.toFixed(2)}
          </span>
        )}
      </span>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- CenterBar`  Expected: PASS (5/5)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/CenterBar.tsx components/ui/__tests__/CenterBar.test.tsx
  git commit -m "feat(dashboard): add CenterBar primitive — consolidates MicroBar/ScoreBar/WhyPanel NetBar"
  ```

---

### Task 12: `components/ui/InfoTip.tsx`

**Files:**
- Create: `dashboard/components/ui/InfoTip.tsx`
- Test: `dashboard/components/ui/__tests__/InfoTip.test.tsx`

**Interfaces:**
- Consumes: `@radix-ui/react-tooltip` (already installed, wrapped by the existing `TooltipProvider`).
- Produces: default export `InfoTip`, named type `InfoTipProps` from `@/components/ui/InfoTip`. Consumed by Tasks 15 (ConvictionDot), 16 (StatChip), 24 (SignalGroups), 27 (WhyPanel), 29 (Header), 32 (RotationPanel).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/InfoTip.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import TooltipProvider from "@/components/ui/TooltipProvider";
  import InfoTip from "@/components/ui/InfoTip";

  function withProvider(ui: React.ReactNode) {
    return <TooltipProvider>{ui}</TooltipProvider>;
  }

  describe("InfoTip", () => {
    it("renders a real, keyboard-focusable <button> as the trigger", () => {
      render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
      const trigger = screen.getByRole("button", { name: "Conviction" });
      expect(trigger.tagName).toBe("BUTTON");
      expect(trigger).toHaveAttribute("type", "button");
    });

    it("opens the tooltip content on hover", async () => {
      render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
      await userEvent.hover(screen.getByRole("button", { name: "Conviction" }));
      expect(await screen.findByText("Conviction gloss")).toBeInTheDocument();
    });

    it("opens the tooltip content on keyboard focus (not just hover)", async () => {
      render(withProvider(<InfoTip content="Conviction gloss" label="Conviction" />));
      await userEvent.tab();
      expect(await screen.findByText("Conviction gloss")).toBeInTheDocument();
    });

    it("renders custom children as the trigger content instead of the default Info glyph", () => {
      render(
        withProvider(
          <InfoTip content="gloss">
            <span>C</span>
          </InfoTip>
        )
      );
      expect(screen.getByRole("button")).toHaveTextContent("C");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- InfoTip`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/InfoTip"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/InfoTip.tsx`:
  ```tsx
  // dashboard/components/ui/InfoTip.tsx
  "use client";
  import * as Tooltip from "@radix-ui/react-tooltip";
  import { Info } from "lucide-react";
  import { ReactNode } from "react";

  export interface InfoTipProps {
    /** Tooltip body text (or short JSX, e.g. a <ul> of catalyst names). */
    content: ReactNode;
    /** Trigger content. Default: a small Info glyph (12px), matching the existing header/inline icon usage. */
    children?: ReactNode;
    /** aria-label for icon-only triggers (required when children is omitted or non-text). */
    label?: string;
    className?: string;
  }

  export default function InfoTip({ content, children, label, className }: InfoTipProps) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label={children ? undefined : label ?? "More info"}
            className={["inline-flex cursor-default items-center text-muted hover:text-foreground", className ?? ""].join(" ")}
          >
            {children ?? <Info size={12} />}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 max-w-xs rounded border border-line bg-elevated px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-muted shadow-lg"
            sideOffset={4}
          >
            {content}
            <Tooltip.Arrow className="fill-elevated" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- InfoTip`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/InfoTip.tsx components/ui/__tests__/InfoTip.test.tsx
  git commit -m "feat(dashboard): add InfoTip primitive — real focusable button trigger, fixes app's #1 a11y bug pattern"
  ```

---

### Task 13: `components/ui/Toggle.tsx`

**Files:**
- Create: `dashboard/components/ui/Toggle.tsx`
- Test: `dashboard/components/ui/__tests__/Toggle.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: default export `Toggle`, named type `ToggleProps` from `@/components/ui/Toggle`. Consumed by Task 33 (CandleChart log-scale).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Toggle.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import Toggle from "@/components/ui/Toggle";

  describe("Toggle", () => {
    it("renders role=switch with aria-checked reflecting the checked prop", () => {
      render(<Toggle checked={false} onChange={() => {}} label="Logarithmic Y-axis" />);
      const el = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
      expect(el).toHaveAttribute("aria-checked", "false");
    });

    it("reflects checked=true", () => {
      render(<Toggle checked onChange={() => {}} label="Logarithmic Y-axis" />);
      expect(screen.getByRole("switch", { name: "Logarithmic Y-axis" })).toHaveAttribute("aria-checked", "true");
    });

    it("calls onChange with the inverted value on click", async () => {
      const onChange = vi.fn();
      render(<Toggle checked={false} onChange={onChange} label="Enable rule" />);
      await userEvent.click(screen.getByRole("switch", { name: "Enable rule" }));
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("disables the switch and blocks onChange when disabled", async () => {
      const onChange = vi.fn();
      render(<Toggle checked={false} onChange={onChange} label="Enable rule" disabled />);
      const el = screen.getByRole("switch", { name: "Enable rule" });
      expect(el).toBeDisabled();
      await userEvent.click(el);
      expect(onChange).not.toHaveBeenCalled();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Toggle`
  Expected: FAIL with `Error: Failed to resolve import "@/components/ui/Toggle"` — module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/ui/Toggle.tsx`:
  ```tsx
  // dashboard/components/ui/Toggle.tsx
  "use client";

  export interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Accessible name — required, since the visual track carries no text. */
    label: string;
    disabled?: boolean;
    className?: string;
  }

  export default function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50",
          checked ? "border-accent bg-accent-dim" : "border-line bg-raised",
          className ?? "",
        ].join(" ")}
      >
        <span
          className={["inline-block h-3.5 w-3.5 rounded-full bg-foreground transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]"].join(" ")}
        />
      </button>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Toggle`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Toggle.tsx components/ui/__tests__/Toggle.test.tsx
  git commit -m "feat(dashboard): add Toggle primitive — role=switch, distinct from Button's aria-pressed pattern"
  ```

---

### Task 14: `components/ui/Badge.tsx` — UI-03 fix (`PRIME_LONG` tint too weak)

**Files:**
- Modify: `dashboard/components/ui/Badge.tsx:5`
- Modify: `dashboard/components/ui/__tests__/Badge.test.tsx:456` (Phase 0 Task 6's canonical test — its `PRIME_LONG` assertion must change to match this fix)

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports — `Badge`'s existing `{variant, value}` props are unchanged.

**Audit findings closed:** UI-03 (highest tier, `PRIME_LONG`, renders with a weaker/equal visual weight than the lower `BREAKOUT_LONG`/`STANDARD_LONG` tiers — `bg-warn/20` amber is less saturated than `bg-pos/15`+`bg-pos/12` green side-by-side, inverting the intended visual hierarchy where the highest-conviction tier should read as the strongest, not the palest).

- [ ] **Step 1: Write the failing test**
  Modify `dashboard/components/ui/__tests__/Badge.test.tsx` — change the `PRIME_LONG` assertion (written by Phase 0 Task 6 to match the *current*, about-to-be-fixed classes) to assert the *new* target classes:
  ```diff
      it("maps known tier values to their token classes", () => {
        render(<Badge variant="tier" value="PRIME_LONG" />);
  -     expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-warn/20", "text-warn");
  +     expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-pos/25", "text-pos");
      });

  +   it("PRIME_LONG is the most-saturated tier — strictly stronger tint than BREAKOUT_LONG/STANDARD_LONG", () => {
  +     render(
  +       <>
  +         <Badge variant="tier" value="PRIME_LONG" />
  +         <Badge variant="tier" value="BREAKOUT_LONG" />
  +         <Badge variant="tier" value="STANDARD_LONG" />
  +       </>
  +     );
  +     expect(screen.getByText("PRIME_LONG")).toHaveClass("bg-pos/25");
  +     expect(screen.getByText("BREAKOUT_LONG")).toHaveClass("bg-pos/15");
  +     expect(screen.getByText("STANDARD_LONG")).toHaveClass("bg-pos/12");
  +   });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Badge`
  Expected: FAIL on `"maps known tier values to their token classes"` with
  ```
  expected element to have class "bg-pos/25" but got "bg-warn/20 text-warn ..."
  ```
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ui/Badge.tsx` line 5:
  ```diff
   const TIER: Record<string, string> = {
  -  PRIME_LONG: "bg-warn/20 text-warn",
  +  PRIME_LONG: "bg-pos/25 text-pos",
     BREAKOUT_LONG: "bg-pos/15 text-pos",
     STANDARD_LONG: "bg-pos/12 text-pos",
     WATCH: "bg-muted/15 text-muted",
     AVOID: "bg-neg/15 text-neg",
     WAIT: "bg-muted/15 text-muted",
   };
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Badge`  Expected: PASS (5/5)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Badge.tsx components/ui/__tests__/Badge.test.tsx
  git commit -m "fix(dashboard): PRIME_LONG badge is now the most-saturated tier (bg-pos/25), was weaker than lower tiers"
  ```

---

### Task 15: `components/ui/ConvictionDot.tsx` — UI-01 tier-tinted fill + InfoTip migration (UI-09)

**Files:**
- Modify: `dashboard/components/ui/ConvictionDot.tsx` (whole file rewrite — 62 lines)
- Test: `dashboard/components/ui/__tests__/ConvictionDot.test.tsx` (new)

**Interfaces:**
- Consumes: `InfoTip` from `@/components/ui/InfoTip` (Task 12).
- Produces: no export shape change — `ConvictionDot`'s `{value}` prop is unchanged; internal rendering only.

**Audit findings closed:** UI-01 (all three dots render in flat `--muted` regardless of level, so the column carries no visual weight beyond fill-count), UI-09 (tooltip trigger is a non-focusable `<span>`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/ConvictionDot.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import TooltipProvider from "@/components/ui/TooltipProvider";
  import ConvictionDot from "@/components/ui/ConvictionDot";

  function withProvider(ui: React.ReactNode) {
    return <TooltipProvider>{ui}</TooltipProvider>;
  }

  describe("ConvictionDot", () => {
    it("renders an em-dash for null", () => {
      render(withProvider(<ConvictionDot value={null} />));
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("wraps the dots in a keyboard-focusable tooltip trigger button", () => {
      render(withProvider(<ConvictionDot value="high" />));
      expect(screen.getByRole("button").tagName).toBe("BUTTON");
    });

    it("shows the display-only caveat on hover", async () => {
      render(withProvider(<ConvictionDot value="high" />));
      await userEvent.hover(screen.getByRole("button"));
      expect(await screen.findByText("Display-only — not blended into the composite score")).toBeInTheDocument();
    });

    it("tints filled dots green for high conviction", () => {
      const { container } = render(withProvider(<ConvictionDot value="high" />));
      const filled = container.querySelectorAll("span[style*='background: var(--pos)']");
      expect(filled.length).toBe(3);
    });

    it("tints filled dots amber for med conviction", () => {
      const { container } = render(withProvider(<ConvictionDot value="med" />));
      const filled = container.querySelectorAll("span[style*='background: var(--warn)']");
      expect(filled.length).toBe(2);
    });

    it("tints the filled dot muted for low conviction", () => {
      const { container } = render(withProvider(<ConvictionDot value="low" />));
      const filled = container.querySelectorAll("span[style*='background: var(--muted)']");
      expect(filled.length).toBe(1);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- ConvictionDot`
  Expected: FAIL — `screen.getByRole("button")` finds no element (current trigger is a non-focusable `<span>` with no button role), plus the tint assertions fail since all dots currently render `var(--muted)`.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/ui/ConvictionDot.tsx` in full:
  ```tsx
  "use client";

  import InfoTip from "./InfoTip";

  interface ConvictionDotProps {
    value: "high" | "med" | "low" | null;
  }

  const TOOLTIP_TEXT = "Display-only — not blended into the composite score";

  /** Filled-dot color by tier — high reads strongest (pos), med cautionary (warn), low weakest (muted). */
  const TIER_COLOR: Record<"high" | "med" | "low", string> = {
    high: "var(--pos)",
    med: "var(--warn)",
    low: "var(--muted)",
  };

  function Dots({ value }: { value: "high" | "med" | "low" }) {
    const filledCount = value === "high" ? 3 : value === "med" ? 2 : 1;
    const color = TIER_COLOR[value];
    return (
      <span className="inline-flex items-center gap-[3px]">
        {[0, 1, 2].map((i) => {
          const filled = i < filledCount;
          return (
            <span
              key={i}
              className="block h-2 w-2 rounded-full"
              style={{
                background: filled ? color : "transparent",
                border: filled ? "none" : "1px solid var(--muted)",
                opacity: filled ? 1 : 0.3,
              }}
            />
          );
        })}
      </span>
    );
  }

  export default function ConvictionDot({ value }: ConvictionDotProps) {
    if (value === null) {
      return <span className="font-mono text-[13px] text-muted tabular-nums">—</span>;
    }

    return (
      <InfoTip content={TOOLTIP_TEXT} label={`Conviction: ${value}`}>
        <Dots value={value} />
      </InfoTip>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- ConvictionDot`  Expected: PASS (6/6)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/ConvictionDot.tsx components/ui/__tests__/ConvictionDot.test.tsx
  git commit -m "fix(dashboard): ConvictionDot tints fill by tier (UI-01) and migrates to InfoTip (UI-09)"
  ```

---

### Task 16: `components/ui/StatChip.tsx` — InfoTip migration (UI-09/UI-13)

**Files:**
- Modify: `dashboard/components/ui/StatChip.tsx` (whole file rewrite — 47 lines)
- Test: `dashboard/components/ui/__tests__/StatChip.test.tsx` (new)

**Interfaces:**
- Consumes: `InfoTip` from `@/components/ui/InfoTip` (Task 12).
- Produces: no export shape change — `StatChip`'s `{label, value, tone, tooltip}` props are unchanged.

**Audit findings closed:** UI-09 (tooltip trigger wraps a non-focusable `<span className="cursor-default">`), UI-13 (documents that `WhyPanel`'s hand-rolled `n_eff` chip exists only because it needs a trailing tooltip `StatChip` didn't originally support ergonomically — closed here by making `StatChip`'s own tooltip keyboard-accessible so Task 28's `WhyPanel` migration can adopt `StatChip` directly instead of hand-rolling).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/StatChip.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import TooltipProvider from "@/components/ui/TooltipProvider";
  import StatChip from "@/components/ui/StatChip";

  function withProvider(ui: React.ReactNode) {
    return <TooltipProvider>{ui}</TooltipProvider>;
  }

  describe("StatChip", () => {
    it("renders label and value with no tooltip wrapper when tooltip is omitted", () => {
      render(<StatChip label="n_eff" value="42" />);
      expect(screen.getByText("n_eff")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("applies the tone color class to the value", () => {
      render(<StatChip label="Δrank" value="+3" tone="pos" />);
      expect(screen.getByText("+3")).toHaveClass("text-pos");
    });

    it("wraps in a keyboard-focusable button when tooltip is supplied", async () => {
      render(withProvider(<StatChip label="n_eff" value="42" tooltip="Effective sample size after correlation shrinkage" />));
      const trigger = screen.getByRole("button");
      expect(trigger.tagName).toBe("BUTTON");
      await userEvent.hover(trigger);
      expect(await screen.findByText("Effective sample size after correlation shrinkage")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- StatChip`
  Expected: FAIL on `"wraps in a keyboard-focusable button when tooltip is supplied"` — `screen.getByRole("button")` finds no element (current trigger is a non-focusable `<span>`).
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/ui/StatChip.tsx` in full:
  ```tsx
  "use client";

  import InfoTip from "./InfoTip";

  interface StatChipProps {
    label: string;
    value: string | number;
    tone?: "pos" | "neg" | "warn" | "muted";
    tooltip?: string;
  }

  const TONE_CLASS: Record<string, string> = {
    pos: "text-pos",
    neg: "text-neg",
    warn: "text-warn",
    muted: "text-muted",
  };

  export default function StatChip({ label, value, tone, tooltip }: StatChipProps) {
    const valueClass = tone ? TONE_CLASS[tone] : "text-foreground";

    const inner = (
      <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-0.5">
        <span className="text-[11px] text-muted">{label}</span>
        <span className={`font-mono text-[13px] tabular-nums ${valueClass}`}>{value}</span>
      </span>
    );

    if (!tooltip) return inner;

    return (
      <InfoTip content={tooltip} label={`${label}: ${value}`}>
        {inner}
      </InfoTip>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- StatChip`  Expected: PASS (3/3)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/StatChip.tsx components/ui/__tests__/StatChip.test.tsx
  git commit -m "fix(dashboard): StatChip tooltip trigger is now a focusable button (UI-09), unblocks WhyPanel n_eff reuse (UI-13)"
  ```

---

### Task 17: `components/ui/EmptyState.tsx` — export props type (UI-10)

**Files:**
- Modify: `dashboard/components/ui/EmptyState.tsx` (export the existing interface — 1-line change)
- Test: `dashboard/components/ui/__tests__/EmptyState.test.tsx` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: default export `EmptyState` (unchanged behavior), now also a named export `EmptyStateProps` from `@/components/ui/EmptyState`, matching every other primitive in this plan (all export their props type) so downstream call sites can type local wrapper variables. Consumed by Tasks 21 (screener "No results above threshold") and 24 (SignalGroups "none today").

**Audit findings closed:** UI-10, partially — the audit's suggested fix ("one empty component, message + optional action") was **already implemented** in `EmptyState.tsx` (verified: `message`, `icon`, `action` props all present and composable) before this plan started. What remained undone is call-site adoption, which this task enables (props type export) and Tasks 21/24 perform for the two instances that coincide with files already touched for other contract-cited reasons. `components/ticker/NewsCard.tsx:42` and `components/ticker/HistoryCard.tsx:31` are two more bare-`<p>` empty states the audit found, listed in `## Audit findings that did not hold up` below as deliberately out of scope (not contract-cited, not otherwise touched this phase).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/EmptyState.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import EmptyState, { type EmptyStateProps } from "@/components/ui/EmptyState";

  describe("EmptyState", () => {
    it("renders the default message when none is given", () => {
      render(<EmptyState />);
      expect(screen.getByText("No data available")).toBeInTheDocument();
    });

    it("renders a custom message, icon, and action together", () => {
      const props: EmptyStateProps = {
        message: "No results above threshold.",
        icon: <span data-testid="custom-icon" />,
        action: <button type="button">Clear filters</button>,
      };
      render(<EmptyState {...props} />);
      expect(screen.getByText("No results above threshold.")).toBeInTheDocument();
      expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- EmptyState`
  Expected: FAIL with a TypeScript error surfaced through Vitest — `Module '"@/components/ui/EmptyState"' has no exported member 'EmptyStateProps'` (the interface is currently unexported).
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ui/EmptyState.tsx` line 4:
  ```diff
  -interface EmptyStateProps {
  +export interface EmptyStateProps {
     message?: string;
     icon?: ReactNode;
     action?: ReactNode;
   }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- EmptyState`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/EmptyState.tsx components/ui/__tests__/EmptyState.test.tsx
  git commit -m "fix(dashboard): export EmptyStateProps for consistency with other ui/ primitives"
  ```

---

### Task 18: `components/ui/Sparkline.tsx` — text alternative (UI-11)

**Files:**
- Modify: `dashboard/components/ui/Sparkline.tsx` (whole file rewrite — 45 lines)
- Test: `dashboard/components/ui/__tests__/Sparkline.test.tsx` (new)

**Interfaces:**
- Consumes: nothing.
- Produces: no prop-shape change — `Sparkline`'s `{values, w, h}` props are unchanged; adds a computed `aria-label` to the rendered `<svg>`.

**Audit findings closed:** UI-11 (the trend line is `aria-hidden` with zero text alternative — a screen-reader user gets nothing; even a sighted user relying on the 1.5px `currentColor` line alone has no numeric confirmation).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Sparkline.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import Sparkline from "@/components/ui/Sparkline";

  describe("Sparkline", () => {
    it("labels an upward trend with the percent change", () => {
      render(<Sparkline values={[100, 102, 105, 110]} />);
      expect(screen.getByRole("img", { name: "Trend: up 10.0%" })).toBeInTheDocument();
    });

    it("labels a downward trend with the percent change", () => {
      render(<Sparkline values={[110, 108, 100]} />);
      expect(screen.getByRole("img", { name: "Trend: down 9.1%" })).toBeInTheDocument();
    });

    it("labels a flat trend when start and end are equal", () => {
      render(<Sparkline values={[50, 55, 50]} />);
      expect(screen.getByRole("img", { name: "Trend: flat" })).toBeInTheDocument();
    });

    it("renders an unlabeled empty svg when there are fewer than 2 finite values", () => {
      render(<Sparkline values={[42]} />);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Sparkline`
  Expected: FAIL — `screen.getByRole("img", { name: "Trend: up 10.0%" })` finds no element (current `<svg>` is `aria-hidden="true"` with no accessible name, so it never has role `img`).
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/ui/Sparkline.tsx` in full:
  ```tsx
  interface SparklineProps {
    values: number[];
    w?: number;
    h?: number;
  }

  export default function Sparkline({ values, w = 120, h = 32 }: SparklineProps) {
    const clean = values.filter(Number.isFinite);

    if (clean.length < 2) {
      return <svg width={w} height={h} aria-hidden="true" />;
    }

    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const range = max - min || 1;

    const points = clean
      .map((v, i) => {
        const x = (i / (clean.length - 1)) * w;
        const y = h - ((v - min) / range) * (h - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    const first = clean[0];
    const last = clean[clean.length - 1];
    const pctChange = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    const trendLabel =
      Math.abs(pctChange) < 0.05
        ? "Trend: flat"
        : `Trend: ${pctChange > 0 ? "up" : "down"} ${Math.abs(pctChange).toFixed(1)}%`;

    return (
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={trendLabel}
        style={{ display: "block" }}
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-muted"
        />
      </svg>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Sparkline`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Sparkline.tsx components/ui/__tests__/Sparkline.test.tsx
  git commit -m "fix(dashboard): Sparkline gets a computed role=img trend label (UI-11), was aria-hidden with no alternative"
  ```

---

### Task 19: `components/ui/DataTable.tsx` — sticky-column bg (UI-06), focus ring (UI-07), scroll-edge fade (UI-08), grid-rows expand (UI-04), caption/scope (A11Y-06)

**Files:**
- Modify: `dashboard/components/ui/DataTable.tsx` (whole file rewrite — 280 lines)
- Test: `dashboard/components/ui/__tests__/DataTable.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `DataTableProps<T>` gains one new optional field, `caption?: string` (rendered as a visually-hidden `<caption>`; omitted entirely if not supplied, so all existing call sites still compile and render unchanged until a follow-up page task opts in). No other prop signature changes — `columns`, `rows`, `rowKey`, `defaultSort`, `expandedRender`, `persistKey`, `onOpen` are all unchanged, so this task does not require touching any of DataTable's ~13 existing call sites.

**Audit findings closed:** UI-04 (expand-row animation used a hardcoded `max-height: 600px`, clipping content taller than that), UI-06 (sticky first column relied on `bg-inherit`, which only works if the parent `<tr>`'s own background is set — fragile and, per audit, visibly wrong against the focused-row ring background), UI-07 (scrollable container was `tabIndex={0}` with `outline-none` applied unconditionally, so keyboard users navigating into the table saw no focus indicator at all), UI-08 (`overflow-x-auto` with no edge-fade affordance — wide tables silently hide off-screen columns with no visual hint more content exists), A11Y-06 (no `<caption>` and no `scope="col"` on header cells, so screen-reader users get no table-level accessible name and no column/row association).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/DataTable.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import DataTable, { type Column } from "@/components/ui/DataTable";

  interface Row {
    id: string;
    symbol: string;
    score: number;
  }

  const ROWS: Row[] = [
    { id: "a", symbol: "AAPL", score: 0.8 },
    { id: "b", symbol: "TSLA", score: 0.4 },
  ];

  const COLUMNS: Column<Row>[] = [
    { key: "symbol", header: "Symbol", render: (r) => r.symbol },
    { key: "score", header: "Score", sortable: true, sortFn: (a, b) => a.score - b.score, render: (r) => r.score.toFixed(2) },
  ];

  beforeEach(() => resetLocalStorage());

  describe("DataTable", () => {
    it("does not set outline-none on the scrollable container (UI-07)", () => {
      const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      const scrollDiv = container.querySelector("[tabindex='0']") as HTMLElement;
      expect(scrollDiv.className).not.toMatch(/outline-none/);
    });

    it("gives the first column an explicit (not bg-inherit) sticky background per zebra row (UI-06)", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      const evenCell = screen.getByText("AAPL").closest("td") as HTMLElement;
      const oddCell = screen.getByText("TSLA").closest("td") as HTMLElement;
      expect(evenCell.className).not.toMatch(/bg-inherit/);
      expect(oddCell.className).not.toMatch(/bg-inherit/);
      expect(evenCell.className).toMatch(/bg-surface/);
      expect(oddCell.className).toMatch(/bg-bg/);
    });

    it("renders a visually-hidden caption when supplied (A11Y-06)", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} caption="Screener results" />);
      expect(screen.getByText("Screener results").tagName).toBe("CAPTION");
    });

    it("renders no caption element when omitted, so existing call sites are unaffected", () => {
      const { container } = render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      expect(container.querySelector("caption")).toBeNull();
    });

    it("sets scope=col on every header cell (A11Y-06)", () => {
      render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />);
      expect(screen.getByRole("columnheader", { name: "Symbol" })).toHaveAttribute("scope", "col");
      expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("scope", "col");
    });

    it("expands a row via grid-template-rows, not a fixed max-height (UI-04)", async () => {
      const { container } = render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          expandedRender={(r) => <div>{r.symbol} detail</div>}
        />
      );
      await userEvent.click(screen.getByText("AAPL"));
      const detailWrapper = screen.getByText("AAPL detail").closest("div[style]") as HTMLElement;
      expect(detailWrapper.style.gridTemplateRows).toBe("1fr");
      expect(container.innerHTML).not.toMatch(/max-height/);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- DataTable`
  Expected: FAIL on multiple assertions — `caption` prop doesn't exist yet (TS error), `scope="col"` is absent, container still has `outline-none`, sticky cells still use `bg-inherit`, and the expand wrapper still has an inline `maxHeight` style, not `gridTemplateRows`.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/ui/DataTable.tsx` in full:
  ```tsx
  "use client";

  import { useState, useEffect, useRef, useCallback, useMemo, KeyboardEvent, Fragment, type ReactNode } from "react";
  import { ChevronUp, ChevronDown } from "lucide-react";

  export interface Column<T> {
    key: string;
    header: ReactNode;
    width?: string;
    align?: "left" | "right" | "center";
    sortable?: boolean;
    sortFn?: (a: T, b: T) => number;
    render: (row: T) => React.ReactNode;
  }

  export interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    rowKey: (r: T) => string;
    defaultSort?: { key: string; dir: "asc" | "desc" };
    expandedRender?: (row: T) => React.ReactNode;
    persistKey?: string;
    onOpen?: (row: T) => void;
    /** Visually-hidden <caption> giving the table an accessible name. Optional for backward compat; new/touched tables should always pass one. */
    caption?: string;
  }

  interface SortState {
    key: string;
    dir: "asc" | "desc";
  }

  function isEditable(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (el.isContentEditable) return true;
    return false;
  }

  export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    defaultSort,
    expandedRender,
    persistKey,
    onOpen,
    caption,
  }: DataTableProps<T>) {
    const storageKey = persistKey ? `dash:table:${persistKey}:sort` : null;

    const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
    const [hydrated, setHydrated] = useState(false);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [everExpandedKeys, setEverExpandedKeys] = useState<Set<string>>(new Set());
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

    useEffect(() => {
      if (storageKey) {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          try {
            const parsed = JSON.parse(stored) as SortState;
            if (parsed.key && (parsed.dir === "asc" || parsed.dir === "desc")) {
              setSort(parsed);
            }
          } catch {
          }
        }
      }
      setHydrated(true);
    }, [storageKey]);

    const activeSort = hydrated ? sort : (defaultSort ?? null);

    const sortedRows = useMemo(() => {
      if (!activeSort) return rows;
      const col = columns.find((c) => c.key === activeSort.key && c.sortable);
      if (!col || !col.sortFn) return rows;
      const multiplier = activeSort.dir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => col.sortFn!(a, b) * multiplier);
    }, [rows, columns, activeSort]);

    // Scroll focused row into view whenever focusedKey changes
    useEffect(() => {
      if (focusedKey === null) return;
      const el = rowRefs.current.get(focusedKey);
      if (el) {
        el.scrollIntoView({ block: "nearest" });
      }
    }, [focusedKey]);

    const updateScrollFade = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    }, []);

    useEffect(() => {
      updateScrollFade();
      const el = containerRef.current;
      if (!el) return;
      const onScroll = () => updateScrollFade();
      el.addEventListener("scroll", onScroll);
      window.addEventListener("resize", onScroll);
      return () => {
        el.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }, [updateScrollFade, sortedRows.length]);

    function handleHeaderClick(col: Column<T>) {
      if (!col.sortable) return;
      setSort((prev) => {
        const next: SortState =
          prev && prev.key === col.key
            ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
            : { key: col.key, dir: "asc" };
        if (storageKey) {
          localStorage.setItem(storageKey, JSON.stringify(next));
        }
        return next;
      });
    }

    function toggleExpand(key: string) {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      setEverExpandedKeys((prev) => new Set(prev).add(key));
    }

    const handleContainerKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (isEditable(e.target)) return;

        if (e.key === "j" || e.key === "k") {
          e.preventDefault();
          const currentIndex = focusedKey
            ? sortedRows.findIndex((r) => rowKey(r) === focusedKey)
            : -1;
          const max = sortedRows.length - 1;
          let nextIndex: number;
          if (e.key === "j") {
            nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, max);
          } else {
            nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
          }
          const nextRow = sortedRows[nextIndex];
          if (nextRow) setFocusedKey(rowKey(nextRow));
          return;
        }

        if (focusedKey === null) return;
        const focusedIndex = sortedRows.findIndex((r) => rowKey(r) === focusedKey);
        const row = focusedIndex >= 0 ? sortedRows[focusedIndex] : null;
        if (!row) return;

        if (e.key === " " || e.key === "ArrowRight") {
          e.preventDefault();
          if (expandedRender) toggleExpand(focusedKey);
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();
          onOpen?.(row);
          return;
        }

        if (e.key === "Escape") {
          e.preventDefault();
          setExpandedKeys(new Set());
          setFocusedKey(null);
          return;
        }
      },
      [focusedKey, sortedRows, rowKey, expandedRender, onOpen]
    );

    const alignClass = (align?: "left" | "right" | "center") => {
      if (align === "right") return "text-right";
      if (align === "center") return "text-center";
      return "text-left";
    };

    return (
      <div className="relative">
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleContainerKeyDown}
          className="overflow-x-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <table className="w-full border-collapse text-[13px]">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead className="sticky top-0 z-30 bg-surface">
              <tr>
                {columns.map((col, ci) => (
                  <th
                    key={col.key}
                    scope="col"
                    style={{ width: col.width }}
                    className={[
                      "px-3 py-2 font-medium text-muted border-b border-line whitespace-nowrap",
                      alignClass(col.align),
                      ci === 0
                        ? "sticky left-0 z-10 bg-surface border-r border-line"
                        : "",
                      col.sortable ? "cursor-pointer select-none hover:text-[var(--text)]" : "",
                    ].join(" ")}
                    onClick={() => handleHeaderClick(col)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && activeSort?.key === col.key ? (
                        activeSort.dir === "asc" ? (
                          <ChevronUp size={12} className="text-accent shrink-0" />
                        ) : (
                          <ChevronDown size={12} className="text-accent shrink-0" />
                        )
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, ri) => {
                const key = rowKey(row);
                const isExpanded = expandedKeys.has(key);
                const isFocused = focusedKey === key;
                const isEven = ri % 2 === 0;
                const stickyBg = isEven ? "bg-surface" : "bg-bg";

                return (
                  <Fragment key={key}>
                    <tr
                      ref={(el) => {
                        if (el) rowRefs.current.set(key, el);
                        else rowRefs.current.delete(key);
                      }}
                      onClick={() => {
                        setFocusedKey(key);
                        if (expandedRender) toggleExpand(key);
                        else onOpen?.(row);
                      }}
                      aria-expanded={expandedRender ? isExpanded : undefined}
                      className={[
                        "cursor-pointer transition-colors hover:bg-raised scroll-mt-[var(--nav-h)]",
                        onOpen ? "hover:shadow-[inset_2px_0_0_0_var(--accent)]" : "",
                        isEven ? "bg-surface" : "bg-bg",
                        isFocused ? "bg-elevated ring-1 ring-inset ring-accent" : "",
                      ].join(" ")}
                    >
                      {columns.map((col, ci) => (
                        <td
                          key={col.key}
                          className={[
                            "px-3 py-2 border-b border-line",
                            alignClass(col.align),
                            col.align === "right" ? "tabular-nums" : "",
                            ci === 0
                              ? `sticky left-0 ${stickyBg} border-r border-line`
                              : "",
                          ].join(" ")}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expandedRender && everExpandedKeys.has(key) && (
                      <tr>
                        <td
                          colSpan={columns.length}
                          className={isExpanded ? "border-b border-line bg-elevated" : ""}
                          style={{ padding: isExpanded ? undefined : "0" }}
                        >
                          <div
                            className="grid transition-[grid-template-rows] duration-200 ease-out"
                            style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
                          >
                            <div className={["overflow-hidden", isExpanded ? "px-3" : ""].join(" ")}>
                              {expandedRender(row)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface to-transparent" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface to-transparent" />
        )}
      </div>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- DataTable`  Expected: PASS (7/7)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/DataTable.tsx components/ui/__tests__/DataTable.test.tsx
  git commit -m "fix(dashboard): DataTable — explicit sticky-col bg (UI-06), restore focus ring (UI-07), scroll-edge fade (UI-08), grid-rows expand (UI-04), caption/scope (A11Y-06)"
  ```

---

### Task 20: `components/ui/Panel.tsx` — grid-rows disclosure (UI-04), `count` prop (UI-05), `dash:collapsible:` key rename

**Files:**
- Modify: `dashboard/components/ui/Panel.tsx` (whole file rewrite — 91 lines)
- Test: `dashboard/components/ui/__tests__/Panel.test.tsx` (new)

**Interfaces:**
- Consumes: nothing (adopts `Collapsible`'s grid-rows technique and `dash:collapsible:{persistKey}` storage-key convention inline, since `Panel`'s separate `actions` slot alongside the trigger doesn't fit `Collapsible`'s single-`trigger`-slot API — composing `<Collapsible>` literally would either drop `actions` or require restructuring `Collapsible`'s contract, which is frozen).
- Produces: `PanelProps.title` widens from `string` to `ReactNode` (backward compatible — every existing string-literal/template-string caller still satisfies `ReactNode`); adds optional `PanelProps.count?: number`, rendered as a small parenthesized chip next to the title, replacing the `` `${title}  (${count})` `` string-concatenation pattern. All other props (`subtitle`, `collapsible`, `defaultOpen`, `persistKey`, `actions`, `children`) are unchanged. Consumed by Task 32 (`RotationPanel`, unchanged call site) and any other of Panel's ~13 existing consumers — none require code changes from this task alone, since `title` still accepts a plain string.

**Audit findings closed:** UI-04 (animated `max-height: 9999px`, same clip risk as `DataTable`'s `600px` and `DiffStrip`'s `9999px`), UI-05 (`title` was `string`-only, so callers needing a count badge fell back to string interpolation like `` `${g.title}  (${sorted[g.key].length})` `` with two literal spaces standing in for a chip).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ui/__tests__/Panel.test.tsx`:
  ```tsx
  import { describe, it, expect, beforeEach } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import Panel from "@/components/ui/Panel";

  beforeEach(() => resetLocalStorage());

  describe("Panel", () => {
    it("renders a plain string title unchanged (backward compat)", () => {
      render(<Panel title="Sector rotation">body</Panel>);
      expect(screen.getByText("Sector rotation")).toBeInTheDocument();
    });

    it("renders a count chip next to the title when count is supplied", () => {
      render(
        <Panel title="Everything else" count={7}>
          body
        </Panel>
      );
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("renders no count chip when count is omitted", () => {
      render(<Panel title="Sector rotation">body</Panel>);
      expect(screen.queryByText(/^\(/)).not.toBeInTheDocument();
    });

    it("toggles aria-expanded and animates via grid-template-rows, not max-height", async () => {
      render(
        <Panel title="Sector rotation" collapsible defaultOpen={false}>
          <div>body</div>
        </Panel>
      );
      const trigger = screen.getByRole("button", { name: /Sector rotation/ });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      const contentWrapper = screen.getByText("body").closest("div[style]") as HTMLElement;
      expect(contentWrapper.style.gridTemplateRows).toBe("0fr");
      expect(contentWrapper.style.maxHeight).toBe("");
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("persists open state to dash:collapsible:{persistKey}, not dash:panel:", async () => {
      render(
        <Panel title="Sector rotation" collapsible persistKey="rotation">
          <div>body</div>
        </Panel>
      );
      await userEvent.click(screen.getByRole("button", { name: /Sector rotation/ }));
      expect(localStorage.getItem("dash:collapsible:rotation")).toBe("true");
      expect(localStorage.getItem("dash:panel:rotation")).toBeNull();
    });

    it("renders actions alongside a collapsible trigger", () => {
      render(
        <Panel title="Sector rotation" collapsible actions={<button>Refresh</button>}>
          body
        </Panel>
      );
      expect(screen.getByRole("button", { name: "Sector rotation" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Panel`
  Expected: FAIL — `count` prop doesn't exist yet (TS error / no "7" text found), the content wrapper still uses inline `maxHeight` (`style.gridTemplateRows` is empty string), and the persisted key is still `dash:panel:rotation` not `dash:collapsible:rotation`.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/ui/Panel.tsx` in full:
  ```tsx
  "use client";

  import { useState, useEffect, useId, ReactNode } from "react";
  import { ChevronDown } from "lucide-react";

  interface PanelProps {
    title: ReactNode;
    /** Optional count chip rendered next to the title, e.g. Panel's own row/section count. Replaces the old `` `${title}  (${count})` `` string-concat pattern. */
    count?: number;
    subtitle?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    persistKey?: string;
    actions?: ReactNode;
    children: ReactNode;
  }

  export default function Panel({
    title,
    count,
    subtitle,
    collapsible,
    defaultOpen = false,
    persistKey,
    actions,
    children,
  }: PanelProps) {
    const id = useId();
    const storageKey = persistKey ? `dash:collapsible:${persistKey}` : null;

    const [open, setOpen] = useState(defaultOpen);
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
      if (storageKey) {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          setOpen(stored === "true");
        }
      }
      setHydrated(true);
    }, [storageKey]);

    function toggle() {
      const next = !open;
      setOpen(next);
      if (storageKey) {
        localStorage.setItem(storageKey, String(next));
      }
    }

    const Title = (
      <>
        <span className="tick truncate text-[13px] font-semibold text-foreground">{title}</span>
        {count !== undefined && (
          <span className="rounded bg-elevated px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
            {count}
          </span>
        )}
        {subtitle && <span className="truncate text-[12px] text-muted">{subtitle}</span>}
      </>
    );

    const isOpen = !collapsible || (hydrated ? open : defaultOpen);

    return (
      <section className="rounded-md border border-line bg-elevated">
        <div className="flex items-center gap-2 px-4 py-2.5">
          {collapsible ? (
            <button
              type="button"
              onClick={toggle}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              aria-expanded={open}
              aria-controls={id}
            >
              {Title}
              <ChevronDown
                size={14}
                className="ml-auto shrink-0 text-muted transition-transform duration-200"
                style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
              />
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">{Title}</div>
          )}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        <div
          id={id}
          className="grid transition-[grid-template-rows] duration-200 ease-out"
          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-line px-4 py-3">{children}</div>
          </div>
        </div>
      </section>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Panel`  Expected: PASS (6/6)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ui/Panel.tsx components/ui/__tests__/Panel.test.tsx
  git commit -m "fix(dashboard): Panel — grid-rows disclosure (UI-04), count prop (UI-05), dash:collapsible: key rename"
  ```

---

### Task 21: `app/screener/page.tsx` — Button + Input + PinToggle + format.pct + EmptyState

**Files:**
- Modify: `dashboard/app/screener/page.tsx:1-12` (imports), `:26-65` (`fmtPct`/`RetCell`/`PinCell` — delete, replace), `:85-114` (watchlist SWR + `togglePin` — delete, now owned by `PinToggle`), `:204-210` (pin column), `:266-291` (ticker/min-score inputs), `:292-318` (Run/Full-universe buttons), `:377-378` (empty state)
- Test: `dashboard/app/screener/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `Button` (Task 5), `Input` (Task 6), `PinToggle` (Task 10), `EmptyState` (Task 17), `format.pct` (Task 2) from `@/components/ui/Button`, `@/components/ui/Input`, `@/components/ui/PinToggle`, `@/components/ui/EmptyState`, `@/lib/format`.
- Produces: no new exports — `ScreenerPage` remains the page's default export with unchanged route behavior.

**Audit findings closed:** UI-12 (Run/Full-universe buttons were `h-9` solid `bg-accent text-white`, now `h-8` bordered-ghost via `Button`), UI-12 (ticker/min-score inputs had inline `focus:outline-none`, now via `Input`), X-04 (screener's `PinCell` was one of three independent optimistic pin implementations, now `PinToggle`), part of X-06/X-07 unification's `format.pct` slice (screener's `fmtPct` was one of 5 independent percent-formatting implementations), UI-10 (bare `<p>` "No results above threshold." now `EmptyState`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/screener/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import ScreenerPage from "@/app/screener/page";

  describe("ScreenerPage", () => {
    it("renders the ticker filter and min-score inputs via the shared Input primitive (h-8, no outline-none)", () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(<ScreenerPage />);
      const tickerInput = screen.getByPlaceholderText("Filter tickers — AAPL, TSLA, NVDA…");
      expect(tickerInput).toHaveClass("h-8");
      expect(tickerInput.className).not.toMatch(/outline-none/);
    });

    it("renders Run and Full universe as h-8 Button primitives", () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(<ScreenerPage />);
      expect(screen.getByRole("button", { name: /Run/ })).toHaveClass("h-8");
      expect(screen.getByRole("button", { name: "Full universe" })).toHaveClass("h-8");
    });

    it("renders a pin toggle per row via the shared PinToggle primitive once results load", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/argus/screener", {
        results: [
          { symbol: "AAPL", verdict: "LONG", score: 0.82, long_votes: 40, short_votes: 5, wait_votes: 3, agreement_pct: 83, high_conviction: true, risk_reward: 2.1, ret_1d: 0.012, ret_5d: 0.031 },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      });
      render(<ScreenerPage />);
      await userEvent.click(screen.getByRole("button", { name: /Run/ }));
      expect(await screen.findByRole("button", { name: "Pin AAPL" })).toBeInTheDocument();
    });

    it("renders the shared EmptyState (not a bare <p>) when a run returns zero results", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/argus/screener", { results: [], as_of: "2026-07-28T00:00:00Z", cached: false });
      render(<ScreenerPage />);
      await userEvent.click(screen.getByRole("button", { name: /Run/ }));
      expect(await screen.findByText("No results above threshold.")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- screener/page`
  Expected: FAIL on the `h-8`/`outline-none` assertions (current markup is `h-9` with inline `focus:outline-none`) and on `"Pin AAPL"` (current button's accessible name comes from `PinCell`'s own `aria-label`, which does match today, so this specific assertion should already pass pre-migration — it is included to pin the contract for `PinToggle` post-migration and will keep passing through Step 3).
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/app/screener/page.tsx`.

  Imports (replace lines 1-12):
  ```diff
   "use client";
   import PageHeader from "@/components/ui/PageHeader";
   import SkeletonTable from "@/components/ui/SkeletonTable";
  +import Button from "@/components/ui/Button";
  +import Input from "@/components/ui/Input";
  +import PinToggle from "@/components/ui/PinToggle";
  +import EmptyState from "@/components/ui/EmptyState";
  +import { pct } from "@/lib/format";

  -import { useMemo, useState } from "react";
  +import { useState } from "react";
   import { Search, ArrowRight, Loader2 } from "lucide-react";
   import { useRouter } from "next/navigation";
  -import useSWR from "swr";
   import type { ScreenerResult } from "@/types/argus";
   import DataTable, { Column } from "@/components/ui/DataTable";

  -const fetcher = (url: string) => fetch(url).then((r) => r.json());
  -
   function verdictColor(v: string): string {
  ```

  `fmtPct`/`RetCell`/`PinCell` (replace lines 26-65):
  ```diff
  -function fmtPct(v: number | null): string {
  -  if (v === null) return "—";
  -  const sign = v >= 0 ? "+" : "";
  -  return `${sign}${(v * 100).toFixed(1)}%`;
  -}
  -
   function RetCell({ v }: { v: number | null }) {
     if (v === null) return <span className="text-muted">—</span>;
     const cls = v >= 0 ? "text-pos" : "text-neg";
  -  return <span className={cls}>{fmtPct(v)}</span>;
  +  return <span className={cls}>{pct(v, "fraction")}</span>;
   }
  -
  -function PinCell({
  -  symbol,
  -  pinned,
  -  onToggle,
  -}: {
  -  symbol: string;
  -  pinned: boolean;
  -  onToggle: (symbol: string, pinned: boolean) => void;
  -}) {
  -  return (
  -    <button
  -      type="button"
  -      onClick={(e) => {
  -        e.stopPropagation();
  -        onToggle(symbol, pinned);
  -      }}
  -      className={[
  -        "px-1.5 py-0.5 rounded border text-[11px] font-mono transition-colors",
  -        pinned
  -          ? "border-warn text-warn bg-warn/10"
  -          : "border-line text-muted hover:border-line-strong hover:text-foreground",
  -      ].join(" ")}
  -      aria-label={pinned ? `Unpin ${symbol}` : `Pin ${symbol}`}
  -    >
  -      {pinned ? "Pinned" : "Pin"}
  -    </button>
  -  );
  -}
  ```

  Watchlist SWR + `togglePin` (delete lines 85-114 in full — `PinToggle` now owns this fetch/mutate cycle internally):
  ```diff
  -  const { data: watchlistData, mutate: mutateWatchlist } = useSWR<{
  -    watchlist: { ticker: string }[];
  -  }>("/api/watchlist", fetcher, { revalidateOnFocus: false });
  -
  -  const pinnedSet = useMemo(
  -    () => new Set((watchlistData?.watchlist ?? []).map((w) => w.ticker)),
  -    [watchlistData]
  -  );
  -
  -  async function togglePin(symbol: string, pinned: boolean) {
  -    mutateWatchlist(
  -      (prev) => {
  -        if (!prev) return prev;
  -        const wl = pinned
  -          ? prev.watchlist.filter((w) => w.ticker !== symbol)
  -          : [...prev.watchlist, { ticker: symbol }];
  -        return { watchlist: wl };
  -      },
  -      false
  -    );
  -    try {
  -      await fetch("/api/watchlist", {
  -        method: pinned ? "DELETE" : "POST",
  -        headers: { "Content-Type": "application/json" },
  -        body: JSON.stringify({ ticker: symbol }),
  -      });
  -    } catch {
  -      mutateWatchlist();
  -    }
  -  }
  ```

  Pin column (replace lines 204-210):
  ```diff
     {
       key: "pin",
       header: "",
  -    render: (r) => (
  -      <PinCell symbol={r.symbol} pinned={pinnedSet.has(r.symbol)} onToggle={togglePin} />
  -    ),
  +    render: (r) => <PinToggle symbol={r.symbol} />,
     },
  ```

  Ticker/min-score inputs (replace lines 266-291):
  ```diff
  -        <div className="relative">
  -          <Search
  -            size={14}
  -            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
  -          />
  -          <input
  -            type="text"
  -            value={tickerInput}
  -            onChange={(e) => setTickerInput(e.target.value)}
  -            onKeyDown={handleKeyDown}
  -            placeholder="Filter tickers — AAPL, TSLA, NVDA…"
  -            className="h-9 w-64 rounded border border-line bg-raised pl-8 pr-3 text-sm text-foreground placeholder-muted focus:border-accent focus:outline-none"
  -          />
  -        </div>
  +        <Input
  +          icon={<Search size={14} />}
  +          value={tickerInput}
  +          onChange={(e) => setTickerInput(e.target.value)}
  +          onKeyDown={handleKeyDown}
  +          placeholder="Filter tickers — AAPL, TSLA, NVDA…"
  +          className="w-64"
  +        />
           <label className="flex items-center gap-1.5 text-xs text-muted">
             Min score
  -          <input
  +          <Input
               type="number"
               value={minScore}
               onChange={(e) => setMinScore(e.target.value)}
               step="0.05"
               min="0"
               max="1"
  -            className="h-9 w-16 rounded border border-line bg-raised px-2 text-sm text-foreground focus:border-accent focus:outline-none"
  +            className="w-16"
             />
           </label>
  ```

  Run/Full-universe buttons (replace lines 292-318):
  ```diff
           <div className="ml-auto flex items-center gap-2">
  -          <button
  -            onClick={handleRun}
  -            disabled={loading}
  -            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
  -          >
  -            {loading ? (
  -              <>
  -                <Loader2 size={14} className="animate-spin" /> Running…
  -              </>
  -            ) : (
  -              <>
  -                Run <ArrowRight size={14} />
  -              </>
  -            )}
  -          </button>
  -          <button
  -            onClick={() => {
  -              setTickerInput("");
  -              void runScreener(null);
  -            }}
  -            disabled={loading}
  -            className="inline-flex h-9 items-center rounded-md border border-line bg-raised px-4 text-sm font-medium text-foreground transition-colors hover:border-line-strong disabled:opacity-50"
  -          >
  -            Full universe
  -          </button>
  +          <Button variant="primary" onClick={handleRun} loading={loading} icon={<ArrowRight size={14} />}>
  +            Run
  +          </Button>
  +          <Button
  +            variant="secondary"
  +            onClick={() => {
  +              setTickerInput("");
  +              void runScreener(null);
  +            }}
  +            disabled={loading}
  +          >
  +            Full universe
  +          </Button>
           </div>
  ```
  (The `Loader2` import stays — it is still used by the "Running agent ensemble…" status line at line 323.)

  Empty results (replace line 378):
  ```diff
  -            {results.length === 0 ? (
  -              <p className="text-sm text-muted">No results above threshold.</p>
  -            ) : (
  +            {results.length === 0 ? (
  +              <EmptyState message="No results above threshold." />
  +            ) : (
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- screener/page`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
  git commit -m "refactor(dashboard): screener page onto Button/Input/PinToggle/format.pct/EmptyState primitives"
  ```

---

### Task 22: `app/alerts/page.tsx` — Button + Select/Input + UndoToastProvider delete-undo

**Files:**
- Modify: `dashboard/app/alerts/page.tsx:1-8` (imports), `:89-92` (`removeRule`), `:104-105` (`inputCls`), `:114-121` (Evaluate now), `:130-186` (New-rule form: Condition/Symbol/Verdict/Days/Direction/Level/Add), `:215-221` (Delete rule button)
- Test: `dashboard/app/alerts/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `Button` (Task 5), `Input` (Task 6), `Select` (Task 7), `useUndoAction` (Task 9) from `@/components/ui/Button`, `@/components/ui/Input`, `@/components/ui/Select`, `@/components/ui/UndoToastProvider`.
- Produces: no new exports. Rule's `enabled` field remains unwired (AL-01 — see `## Audit findings that did not hold up` / coverage table; no UI currently reads or writes it anywhere in this file, so wiring a `Toggle` to it is a behavioral addition, not a primitive migration, and is out of this phase's scope).

**Audit findings closed:** UI-12 (Evaluate-now/Add buttons were `h-9` solid `bg-accent text-white` or bordered `bg-raised`, condition/verdict/direction dropdowns and symbol/days/level inputs all shared one hand-rolled `inputCls` string instead of a component), A11Y-07 (rule delete had no undo — a slip-of-the-finger click on the icon-only Trash2 button was previously unrecoverable without manually re-entering the rule).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/alerts/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import UndoToastProvider from "@/components/ui/UndoToastProvider";
  import AlertsPage from "@/app/alerts/page";

  function withProvider(ui: React.ReactNode) {
    return <UndoToastProvider>{ui}</UndoToastProvider>;
  }

  describe("AlertsPage", () => {
    it("renders Evaluate now and Add as h-8 Button primitives", async () => {
      mockFetchJson("/api/argus/alerts/rules", { rules: [] });
      mockFetchJson("/api/argus/alerts/log?limit=30", { items: [] });
      render(withProvider(<AlertsPage />));
      expect(await screen.findByRole("button", { name: /Evaluate now/ })).toHaveClass("h-8");
      expect(screen.getByRole("button", { name: /Add/ })).toHaveClass("h-8");
    });

    it("renders the Condition field as a Select primitive (combobox role)", async () => {
      mockFetchJson("/api/argus/alerts/rules", { rules: [] });
      mockFetchJson("/api/argus/alerts/log?limit=30", { items: [] });
      render(withProvider(<AlertsPage />));
      expect(await screen.findAllByRole("combobox")).toHaveLength(2); // Condition + Verdict (kind defaults to "verdict")
    });

    it("shows an undo toast after deleting a rule, and Undo re-creates it", async () => {
      mockFetchJson("/api/argus/alerts/rules", {
        rules: [{ id: 1, kind: "verdict", symbol: "NVDA", params: { target: "LONG" }, note: null, enabled: true, last_fired_ts: null }],
      });
      mockFetchJson("/api/argus/alerts/log?limit=30", { items: [] });
      render(withProvider(<AlertsPage />));
      const deleteBtn = await screen.findByRole("button", { name: "Delete rule" });
      await userEvent.click(deleteBtn);
      expect(screen.queryByText("NVDA → verdict becomes LONG")).not.toBeInTheDocument();
      expect(await screen.findByText("Removed NVDA alert rule")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(fetch).toHaveBeenCalledWith(
        "/api/argus/alerts/rules",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ kind: "verdict", symbol: "NVDA", params: { target: "LONG" } }) })
      );
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- alerts/page`
  Expected: FAIL — `Evaluate now`/`Add` buttons are currently `h-9` not `h-8`; the delete button has no undo toast, so `"Removed NVDA alert rule"` is never found.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/app/alerts/page.tsx`.

  Imports (replace lines 1-8):
  ```diff
   "use client";

   import { useState } from "react";
   import useSWR from "swr";
   import { Bell, Trash2, Play } from "lucide-react";
   import PageHeader from "@/components/ui/PageHeader";
  +import Button from "@/components/ui/Button";
  +import Input from "@/components/ui/Input";
  +import Select from "@/components/ui/Select";
  +import { useUndoAction } from "@/components/ui/UndoToastProvider";

   const fetcher = (url: string) => fetch(url).then((r) => r.json());
  ```

  `removeRule` (replace lines 89-92) — moves inside the component body so it can call `useUndoAction()` and read `rules`/`mutateRules` from closure; add the hook call right after the other SWR hooks:
  ```diff
     const { data: logData, mutate: mutateLog } = useSWR<{ items: LogItem[] }>(
       "/api/argus/alerts/log?limit=30",
       fetcher,
       { refreshInterval: 30000 }
     );
  +  const { run } = useUndoAction();
  ```
  ```diff
  -  async function removeRule(id: number) {
  -    await fetch(`/api/argus/alerts/rules/${id}`, { method: "DELETE" });
  -    mutateRules();
  -  }
  +  function removeRule(rule: Rule) {
  +    mutateRules((prev) => (prev ? { rules: prev.rules.filter((r) => r.id !== rule.id) } : prev), false);
  +    run({
  +      label: `Removed ${rule.symbol} alert rule`,
  +      commit: () => fetch(`/api/argus/alerts/rules/${rule.id}`, { method: "DELETE" }),
  +      onError: () => mutateRules(),
  +      undo: () => {
  +        void fetch("/api/argus/alerts/rules", {
  +          method: "POST",
  +          headers: { "Content-Type": "application/json" },
  +          body: JSON.stringify({ kind: rule.kind, symbol: rule.symbol, params: rule.params }),
  +        }).then(() => mutateRules());
  +      },
  +    });
  +  }
  ```

  `inputCls` (delete lines 104-105 — no longer needed, every field now uses `Input`/`Select`):
  ```diff
  -  const inputCls =
  -    "h-9 rounded border border-line bg-raised px-2.5 text-sm text-foreground focus:border-accent focus:outline-none";
  -
  ```

  Evaluate now (replace lines 114-121):
  ```diff
  -          actions={
  -            <button
  -              onClick={evaluateNow}
  -              disabled={busy}
  -              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-raised px-3 text-sm text-foreground transition-colors hover:border-line-strong disabled:opacity-50"
  -            >
  -              <Play size={14} /> Evaluate now
  -            </button>
  -          }
  +          actions={
  +            <Button variant="secondary" onClick={evaluateNow} disabled={busy} icon={<Play size={14} />}>
  +              Evaluate now
  +            </Button>
  +          }
  ```

  New-rule form (replace lines 130-186):
  ```diff
             <label className="flex flex-col gap-1 text-[11px] text-muted">
               Condition
  -            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${inputCls} cursor-pointer`}>
  -              {Object.entries(KIND_LABEL).map(([k, l]) => (
  -                <option key={k} value={k}>
  -                  {l}
  -                </option>
  -              ))}
  -            </select>
  +            <Select
  +              value={kind}
  +              onChange={(e) => setKind(e.target.value)}
  +              options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
  +            />
             </label>
             <label className="flex flex-col gap-1 text-[11px] text-muted">
               Symbol
  -            <input
  +            <Input
                 value={symbol}
                 onChange={(e) => setSymbol(e.target.value)}
                 placeholder="NVDA"
  -              className={`${inputCls} w-24`}
  +              className="w-24"
               />
             </label>
             {kind === "verdict" && (
               <label className="flex flex-col gap-1 text-[11px] text-muted">
                 Verdict
  -              <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${inputCls} cursor-pointer`}>
  -                <option>LONG</option>
  -                <option>SHORT</option>
  -                <option>WAIT</option>
  -              </select>
  +              <Select
  +                value={target}
  +                onChange={(e) => setTarget(e.target.value)}
  +                options={[
  +                  { value: "LONG", label: "LONG" },
  +                  { value: "SHORT", label: "SHORT" },
  +                  { value: "WAIT", label: "WAIT" },
  +                ]}
  +              />
               </label>
             )}
             {kind === "earnings" && (
               <label className="flex flex-col gap-1 text-[11px] text-muted">
                 Days
  -              <input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} className={`${inputCls} w-20`} />
  +              <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} className="w-20" />
               </label>
             )}
             {kind === "price" && (
               <>
                 <label className="flex flex-col gap-1 text-[11px] text-muted">
                   Direction
  -                <select value={direction} onChange={(e) => setDirection(e.target.value)} className={`${inputCls} cursor-pointer`}>
  -                  <option value="above">above</option>
  -                  <option value="below">below</option>
  -                </select>
  +                <Select
  +                  value={direction}
  +                  onChange={(e) => setDirection(e.target.value)}
  +                  options={[
  +                    { value: "above", label: "above" },
  +                    { value: "below", label: "below" },
  +                  ]}
  +                />
                 </label>
                 <label className="flex flex-col gap-1 text-[11px] text-muted">
                   Level
  -                <input value={level} onChange={(e) => setLevel(e.target.value)} type="number" placeholder="200" className={`${inputCls} w-24`} />
  +                <Input value={level} onChange={(e) => setLevel(e.target.value)} type="number" placeholder="200" className="w-24" />
                 </label>
               </>
             )}
  -          <button
  -            onClick={addRule}
  -            disabled={busy || !symbol.trim()}
  -            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
  -          >
  -            <Bell size={14} /> Add
  -          </button>
  +          <Button variant="primary" onClick={addRule} disabled={busy || !symbol.trim()} icon={<Bell size={14} />}>
  +            Add
  +          </Button>
  ```

  Delete rule button (replace lines 215-221 — pass the whole `Rule`, not just `id`, since `removeRule` now needs `kind`/`symbol`/`params` for the undo re-POST):
  ```diff
                   <button
  -                  onClick={() => removeRule(r.id)}
  +                  onClick={() => removeRule(r)}
                     className="ml-auto text-muted transition-colors hover:text-neg"
                     aria-label="Delete rule"
                   >
                     <Trash2 size={14} />
                   </button>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- alerts/page`  Expected: PASS (3/3)
- [ ] **Step 5: Commit**
  ```bash
  git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
  git commit -m "refactor(dashboard): alerts page onto Button/Input/Select; rule delete gets undo (A11Y-07)"
  ```

---

### Task 23: `components/today/SignalGroups.tsx` (part 1) — Select migration + type-scale floor

**Files:**
- Modify: `dashboard/components/today/SignalGroups.tsx:7` (import), `:64` (NEW badge), `:102` (`ChipTooltip`), `:125` (`RowFlags` ext chip), `:217-245` (delete `FilterSelect`), `:561-575` (filter-bar call sites)
- Test: `dashboard/components/today/__tests__/SignalGroups.test.tsx` (new)

**Interfaces:**
- Consumes: `Select` (Task 7) from `@/components/ui/Select`.
- Produces: no new exports. `FilterSelect` is deleted — nothing outside this file imported it (it was a file-local function).

**Audit findings closed:** UI-12 (conviction/sector filters used a hand-rolled `FilterSelect` wrapping a bare `<select>` instead of the shared primitive), A11Y-02 partial (the 9px `NEW` superscript badge and the two 10px chip badges — `ChipTooltip`'s earnings-proximity chip and `RowFlags`'s `ext` chip — are both under the 11px data floor; raised to 11px. `CatalystCount`'s existing `text-[11px]` chip and `EmptyState`'s `text-[13px]` "none today" text are already compliant and untouched here).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/SignalGroups.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { makeBridgeRow } from "@/test/factories";
  import SignalGroups from "@/components/today/SignalGroups";

  describe("SignalGroups filter bar", () => {
    it("renders the conviction and sector filters as combobox Selects", () => {
      render(
        <SignalGroups
          rows={[makeBridgeRow({ ticker: "NVDA" })]}
          newSet={new Set()}
          onOpen={() => {}}
        />
      );
      expect(screen.getAllByRole("combobox")).toHaveLength(2);
    });

    it("never sets a chip or badge below the 11px data floor", () => {
      render(
        <SignalGroups
          rows={[makeBridgeRow({ ticker: "NVDA", is_extended: true, earnings_in_days: 3 })]}
          newSet={new Set(["NVDA"])}
          onOpen={() => {}}
        />
      );
      const undersized = document.querySelectorAll('[class*="text-[9px]"], [class*="text-[10px]"]');
      expect(undersized.length).toBe(0);
    });
  });
  ```
  (If `@/test/factories`'s `makeBridgeRow` does not yet exist, add a minimal one alongside the other factories established in Phase 0 — it is a plain object literal satisfying `BridgeRow` with sensible defaults, no new test infra.)
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- SignalGroups`
  Expected: FAIL — only 0 comboboxes found (`FilterSelect` renders a native `<select>` but without `role="combobox"` semantics conflicts aside, the real failure is the second assertion: `text-[10px]` and `text-[9px]` classes are present on the NEW badge and the two chips).
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/today/SignalGroups.tsx`.

  Import (line 7, drop `ChevronDown` — its only use was inside `FilterSelect`, which this task deletes; add `Select`):
  ```diff
  -import { Info, Search, ChevronDown, X } from "lucide-react";
  +import { Info, Search, X } from "lucide-react";
   import type { BridgeRow } from "@/types/bridge";
   import { tierSort } from "@/lib/groups";
   import DataTable, { Column } from "@/components/ui/DataTable";
   import Panel from "@/components/ui/Panel";
   import { heatBg } from "@/lib/heat";
   import Badge from "@/components/ui/Badge";
   import ConvictionDot from "@/components/ui/ConvictionDot";
   import MicroBar from "@/components/ui/MicroBar";
   import Sparkline from "@/components/ui/Sparkline";
  +import Select from "@/components/ui/Select";
  ```

  `NEW` badge (line 64):
  ```diff
  -      {isNew && <sup className="ml-0.5 text-[9px] font-semibold text-warn">NEW</sup>}
  +      {isNew && <sup className="ml-0.5 text-[11px] font-semibold text-warn">NEW</sup>}
  ```

  `ChipTooltip` chip (line 102):
  ```diff
             className={`inline-flex cursor-default items-center rounded border px-1 py-px text-[10px] font-medium leading-tight ${tone}`}
  +          {/* placeholder marker for diff clarity — see replacement below */}
  ```
  (exact replacement — the whole `className` template literal, not a partial line):
  ```diff
  -          className={`inline-flex cursor-default items-center rounded border px-1 py-px text-[10px] font-medium leading-tight ${tone}`}
  +          className={`inline-flex cursor-default items-center rounded border px-1 py-px text-[11px] font-medium leading-tight ${tone}`}
  ```

  `RowFlags` ext chip (line 125):
  ```diff
  -      {ext && <span className="rounded border border-line px-1 py-px text-[10px] text-muted">ext</span>}
  +      {ext && <span className="rounded border border-line px-1 py-px text-[11px] text-muted">ext</span>}
  ```

  Delete `FilterSelect` entirely (lines 217-245):
  ```diff
  -function FilterSelect({
  -  value,
  -  onChange,
  -  options,
  -}: {
  -  value: string;
  -  onChange: (v: string) => void;
  -  options: [string, string][];
  -}) {
  -  return (
  -    <div className="relative">
  -      <select
  -        value={value}
  -        onChange={(e) => onChange(e.target.value)}
  -        className="h-8 cursor-pointer appearance-none rounded border border-line bg-raised pl-2.5 pr-7 text-[13px] text-foreground focus:border-accent focus:outline-none"
  -      >
  -        {options.map(([v, l]) => (
  -          <option key={v} value={v}>
  -            {l}
  -          </option>
  -        ))}
  -      </select>
  -      <ChevronDown
  -        size={13}
  -        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted"
  -      />
  -    </div>
  -  );
  -}
  -
  ```

  Filter-bar call sites (lines 561-575):
  ```diff
  -        <FilterSelect
  -          value={active.conviction}
  -          onChange={(v) => update({ conviction: v })}
  -          options={[
  -            ["", "All conviction"],
  -            ["high", "High"],
  -            ["med", "Med"],
  -            ["low", "Low"],
  -          ]}
  -        />
  -        <FilterSelect
  -          value={active.sector}
  -          onChange={(v) => update({ sector: v })}
  -          options={[["", "All sectors"], ...sectors.map((s) => [s, s] as [string, string])]}
  -        />
  +        <Select
  +          className="w-auto"
  +          value={active.conviction}
  +          onChange={(e) => update({ conviction: e.target.value })}
  +          options={[
  +            { value: "", label: "All conviction" },
  +            { value: "high", label: "High" },
  +            { value: "med", label: "Med" },
  +            { value: "low", label: "Low" },
  +          ]}
  +        />
  +        <Select
  +          className="w-auto"
  +          value={active.sector}
  +          onChange={(e) => update({ sector: e.target.value })}
  +          options={[{ value: "", label: "All sectors" }, ...sectors.map((s) => ({ value: s, label: s }))]}
  +        />
  ```
  (`Select`'s default `className` includes `w-full`; the filter bar is a `flex` row of intrinsically-sized controls, so `className="w-auto"` overrides the width utility — `Select`'s `className` prop is appended after the base classes per Task 7's implementation, and a later `w-auto` in the same Tailwind build wins over an earlier `w-full` only if both are present in the compiled stylesheet with the same specificity and source order; to avoid relying on cascade order, `Select`'s base `cls` array Step-3 implementation already places `className` last, so this is safe.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- SignalGroups`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/today/SignalGroups.tsx components/today/__tests__/SignalGroups.test.tsx
  git commit -m "refactor(dashboard): SignalGroups filters onto Select; raise sub-floor chips to 11px (A11Y-02 partial)"
  ```

---

### Task 24: `components/today/SignalGroups.tsx` (part 2) — InfoTip + HEADER_GLOSS + CenterBar + EmptyState

**Files:**
- Modify: `dashboard/components/today/SignalGroups.tsx:14-16` (imports), `:69-77` (`LegBars`), `:97-118` (delete `ChipTooltip`), `:120-135` (`RowFlags` uses shared `InfoTip`), `:145-170` (`CatalystCount`), `:172-215` (delete local `InfoTip`/`HeaderTip`), `:392-451` (`columnsFor` headers), `:476-478` (`GroupTable` empty state), `:559` (`InfoTip` call site keeps working — now the shared one)
- Delete: `dashboard/components/ui/MicroBar.tsx`
- Test: extends `dashboard/components/today/__tests__/SignalGroups.test.tsx` (Task 23)

**Interfaces:**
- Consumes: `CenterBar` (Task 11), `InfoTip` (Task 12), `EmptyState` (Task 17), `HEADER_GLOSS` (Task 3) from `@/components/ui/CenterBar`, `@/components/ui/InfoTip`, `@/components/ui/EmptyState`, `@/lib/labels`.
- Produces: no new exports.

**Audit findings closed:** UI-09 (`ChipTooltip`, file-local `InfoTip`, `HeaderTip`, and `CatalystCount` all wrapped `Tooltip.Trigger asChild` around a non-focusable `<span>` — four instances of the same bug in one file), UI-10 (bare `<p>` "none today" replaced with `EmptyState`), X-06/X-07 partial (column header tooltip copy for `C`/`⚑`/`Cat` now sourced from the single `HEADER_GLOSS` map instead of being re-typed inline), UI-02 (replaces `MicroBar` per contract §F — three near-identical diverging-bar components → one `CenterBar`).

- [ ] **Step 1: Write the failing test**
  Append to `dashboard/components/today/__tests__/SignalGroups.test.tsx`:
  ```tsx
  describe("SignalGroups a11y + empty state", () => {
    it("every header info-glyph and chip tooltip trigger is a real button", () => {
      render(
        <SignalGroups
          rows={[makeBridgeRow({ ticker: "NVDA", catalysts: "Q3 earnings beat" })]}
          newSet={new Set()}
          onOpen={() => {}}
        />
      );
      // conv header ("C"), legs header, cat chip — at least 3 focusable tooltip triggers
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });

    it("renders EmptyState, not a bare <p>, when a group has no rows", () => {
      render(<SignalGroups rows={[]} newSet={new Set()} onOpen={() => {}} />);
      expect(screen.queryByText("none today")).not.toBeInTheDocument();
      expect(screen.getByText(/no signals/i)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- SignalGroups`
  Expected: FAIL — the "none today" `<p>` is not an `EmptyState`, and `getByText(/no signals/i)` finds nothing; the info-glyph triggers are currently `<span>`s, not buttons, so `getAllByRole("button")` undercounts.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/today/SignalGroups.tsx`.

  Imports (lines 14-16 — drop `MicroBar`, add `CenterBar`/`InfoTip`/`EmptyState`/`HEADER_GLOSS`):
  ```diff
   import ConvictionDot from "@/components/ui/ConvictionDot";
  -import MicroBar from "@/components/ui/MicroBar";
  +import CenterBar from "@/components/ui/CenterBar";
  +import InfoTip from "@/components/ui/InfoTip";
  +import EmptyState from "@/components/ui/EmptyState";
   import Sparkline from "@/components/ui/Sparkline";
   import Select from "@/components/ui/Select";
  +import { HEADER_GLOSS } from "@/lib/labels";
  ```

  `LegBars` (lines 69-77):
  ```diff
   function LegBars({ s, t, f }: { s: number; t: number; f: number }) {
     return (
       <span className="inline-flex items-center gap-1.5">
  -      <MicroBar value={s} />
  -      <MicroBar value={t} />
  -      <MicroBar value={f} />
  +      <CenterBar value={s} />
  +      <CenterBar value={t} />
  +      <CenterBar value={f} />
       </span>
     );
   }
  ```

  Delete `ChipTooltip` entirely (lines 97-118):
  ```diff
  -function ChipTooltip({ label, tone, tooltip }: { label: string; tone: string; tooltip: string }) {
  -  return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <span
  -          className={`inline-flex cursor-default items-center rounded border px-1 py-px text-[11px] font-medium leading-tight ${tone}`}
  -        >
  -          {label}
  -        </span>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -          sideOffset={4}
  -        >
  -          {tooltip}
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  -  );
  -}
  -
  ```
  (Task 23 already bumped its chip to `text-[11px]`; this task removes the wrapper function outright, so that literal text size moves into `RowFlags` below.)

  `RowFlags` (lines 120-135 — inline the chip using shared `InfoTip`, dropping the `ChipTooltip` dependency):
  ```diff
   function RowFlags({ ext, earnDays }: { ext: boolean; earnDays: number | null }) {
     const showEarn = earnDays !== null && Number.isFinite(earnDays) && earnDays <= 10;
     if (!ext && !showEarn) return <span className="text-muted">—</span>;
     return (
       <span className="inline-flex items-center gap-1">
         {ext && <span className="rounded border border-line px-1 py-px text-[11px] text-muted">ext</span>}
         {showEarn && (
  -        <ChipTooltip
  -          label={`E${earnDays}d`}
  -          tone="border-warn/50 text-warn bg-warn/10"
  -          tooltip={`earnings in ${earnDays}d — inside typical hold window`}
  -        />
  +        <InfoTip content={`earnings in ${earnDays}d — inside typical hold window`} label={`Earnings in ${earnDays} days`}>
  +          <span className="inline-flex cursor-default items-center rounded border border-warn/50 bg-warn/10 px-1 py-px text-[11px] font-medium leading-tight text-warn">
  +            {`E${earnDays}d`}
  +          </span>
  +        </InfoTip>
         )}
       </span>
     );
   }
  ```

  `CatalystCount` (lines 145-170 — replace the hand-rolled `Tooltip.Root` with shared `InfoTip`):
  ```diff
   function CatalystCount({ value }: { value: string | null }) {
     const list = splitCatalysts(value);
     if (list.length === 0) return <span className="text-muted">—</span>;
     return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
  -          {list.length}
  -        </span>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="max-w-xs rounded bg-elevated px-2 py-1.5 text-[12px] text-muted shadow-lg border border-line z-50"
  -          sideOffset={4}
  -        >
  -          <ul className="space-y-0.5">
  -            {list.map((c) => (
  -              <li key={c}>{c}</li>
  -            ))}
  -          </ul>
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  +    <InfoTip
  +      content={
  +        <ul className="space-y-0.5">
  +          {list.map((c) => (
  +            <li key={c}>{c}</li>
  +          ))}
  +        </ul>
  +      }
  +      label={`${list.length} catalysts`}
  +    >
  +      <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
  +        {list.length}
  +      </span>
  +    </InfoTip>
     );
   }
  ```

  Delete the file-local `InfoTip` and `HeaderTip` functions entirely (lines 172-215 — the shared `InfoTip` import above the same name now supersedes both; every call site below is updated in the same diff):
  ```diff
  -function InfoTip({ text }: { text: string }) {
  -  return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <span className="inline-flex cursor-default text-muted">
  -          <Info size={12} />
  -        </span>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -          sideOffset={4}
  -        >
  -          {text}
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  -  );
  -}
  -
  -function HeaderTip({ label, tip }: { label: string; tip: string }) {
  -  return (
  -    <span className="inline-flex items-center gap-1">
  -      {label}
  -      <Tooltip.Root>
  -        <Tooltip.Trigger asChild>
  -          <span className="cursor-default text-muted/70">
  -            <Info size={11} />
  -          </span>
  -        </Tooltip.Trigger>
  -        <Tooltip.Portal>
  -          <Tooltip.Content
  -            className="z-50 max-w-[260px] rounded border border-line bg-elevated px-2 py-1.5 text-[12px] font-normal normal-case tracking-normal text-muted shadow-lg"
  -            sideOffset={4}
  -          >
  -            {tip}
  -            <Tooltip.Arrow className="fill-elevated" />
  -          </Tooltip.Content>
  -        </Tooltip.Portal>
  -      </Tooltip.Root>
  -    </span>
  -  );
  -}
  -
  ```
  Now `Tooltip` (the `@radix-ui/react-tooltip` namespace import) and `Info` (the `lucide-react` icon) are unused in this file — remove them from the import lines too:
  ```diff
  -import * as Tooltip from "@radix-ui/react-tooltip";
  -import { Info, Search, X } from "lucide-react";
  +import { Search, X } from "lucide-react";
  ```

  `columnsFor` headers (lines 392-451 — `conv`/`flags`/`cat` now source their tip text from `HEADER_GLOSS`; `legs` keeps its own composed copy since it explains three legs at once and `HEADER_GLOSS` has no single matching key for the combined column):
  ```diff
       {
         key: "conv",
  -      header: <HeaderTip label="C" tip="Conviction — model confidence in the call. More filled dots = higher conviction." />,
  +      header: (
  +        <span className="inline-flex items-center gap-1">
  +          C
  +          <InfoTip content={HEADER_GLOSS.C} label="Conviction column info" />
  +        </span>
  +      ),
         align: "center",
         render: (r) => <ConvictionDot value={r.conviction} />,
       },
       {
         key: "legs",
         header: (
  -        <HeaderTip
  -          label="Sent · Tech · Fund"
  -          tip="The three legs of the signal — Sentiment (X chatter), Technical (indicator ensemble), Fundamental (catalyst/valuation). Fuller green bars are stronger; all three lit = aligned."
  -        />
  +        <span className="inline-flex items-center gap-1">
  +          Sent · Tech · Fund
  +          <InfoTip
  +            content="The three legs of the signal — Sentiment (X chatter), Technical (indicator ensemble), Fundamental (catalyst/valuation). Fuller green bars are stronger; all three lit = aligned."
  +            label="Legs column info"
  +          />
  +        </span>
         ),
         render: (r) => <LegBars s={r.sentiment_score} t={r.tech_score} f={r.catalyst_score} />,
       },
  ```
  ```diff
       {
         key: "flags",
  -      header: "⚑",
  +      header: (
  +        <span className="inline-flex items-center gap-1">
  +          ⚑
  +          <InfoTip content={HEADER_GLOSS["⚑"]} label="Flags column info" />
  +        </span>
  +      ),
         render: (r) => <RowFlags ext={r.is_extended} earnDays={r.earnings_in_days} />,
       },
       {
         key: "cat",
  -      header: "Cat",
  +      header: (
  +        <span className="inline-flex items-center gap-1">
  +          Cat
  +          <InfoTip content={HEADER_GLOSS.Cat} label="Catalysts column info" />
  +        </span>
  +      ),
         render: (r) => <CatalystCount value={r.catalysts} />,
       },
  ```

  `GroupTable` empty state (lines 476-478):
  ```diff
     if (rows.length === 0) {
  -    return <p className="px-1 py-2 text-[13px] text-muted">none today</p>;
  +    return <EmptyState message="No signals in this group today." />;
     }
  ```

  Delete `dashboard/components/ui/MicroBar.tsx` — its only consumer (`LegBars`, above) is migrated, and it has no other importers in the repo.
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- SignalGroups`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/today/SignalGroups.tsx components/today/__tests__/SignalGroups.test.tsx
  git rm components/ui/MicroBar.tsx
  git commit -m "refactor(dashboard): SignalGroups onto InfoTip/CenterBar/EmptyState/HEADER_GLOSS; retire MicroBar (UI-09/UI-10, X-04/X-06)"
  ```

---

### Task 25: `components/today/DiffStrip.tsx` — Collapsible migration (UI-04)

**Files:**
- Modify: `dashboard/components/today/DiffStrip.tsx` (whole file rewrite — 132 lines)
- Test: `dashboard/components/today/__tests__/DiffStrip.test.tsx` (new)

**Interfaces:**
- Consumes: `Collapsible` (Task 8) from `@/components/ui/Collapsible`.
- Produces: no export shape change — `DiffStrip`, `DiffStripData`, `DiffStripProps` unchanged.

**Audit findings closed:** UI-04 (this was one of the three `max-height: 9999px`/`600px` magic-number implementations the audit calls out by name), plus its `dash:panel:diff` storage key now migrates to the unified `dash:collapsible:diff` convention (contract §E `LEGACY_KEY_PREFIXES`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/DiffStrip.test.tsx`:
  ```tsx
  import { describe, it, expect, beforeEach } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import DiffStrip from "@/components/today/DiffStrip";

  const DIFF = {
    newTickers: ["NVDA"],
    dropped: [],
    groupMoves: [],
    sentimentTurns: [],
  };

  describe("DiffStrip", () => {
    beforeEach(() => resetLocalStorage());

    it("is open by default and collapses on trigger click", async () => {
      render(<DiffStrip diff={DIFF} />);
      const trigger = screen.getByRole("button", { name: /Changes since yesterday/ });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("persists state under dash:collapsible:diff, not the legacy dash:panel:diff key", async () => {
      render(<DiffStrip diff={DIFF} />);
      await userEvent.click(screen.getByRole("button", { name: /Changes since yesterday/ }));
      expect(localStorage.getItem("dash:collapsible:diff")).toBe("false");
      expect(localStorage.getItem("dash:panel:diff")).toBeNull();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- DiffStrip`
  Expected: FAIL — the current implementation defaults `open` to `true` but has no `aria-controls`-linked grid-rows toggle keyed off a `dash:collapsible:` prefix; `localStorage.getItem("dash:collapsible:diff")` is `null` because the current code writes to `dash:panel:diff`.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/today/DiffStrip.tsx` in full:
  ```tsx
  "use client";

  import Link from "next/link";
  import Collapsible from "@/components/ui/Collapsible";

  const GROUP_LABEL: Record<string, string> = {
    aligned: "aligned",
    pullback: "pullback",
    tech_fund: "tech+fund",
  };

  export interface DiffStripData {
    newTickers: string[];
    dropped: { ticker: string; group: string }[];
    groupMoves: { ticker: string; from: string; to: string }[];
    sentimentTurns: string[];
  }

  interface DiffStripProps {
    diff: DiffStripData;
  }

  function TickerLink({ ticker }: { ticker: string }) {
    return (
      <Link href={`/t/${ticker}`} className="font-mono text-accent hover:underline">
        {ticker}
      </Link>
    );
  }

  function Tickers({ list }: { list: string[] }) {
    return (
      <span className="inline-flex flex-wrap gap-x-2">
        {list.map((t) => (
          <TickerLink key={t} ticker={t} />
        ))}
      </span>
    );
  }

  export default function DiffStrip({ diff }: DiffStripProps) {
    const hasNew = diff.newTickers.length > 0;
    const hasMoves = diff.groupMoves.length > 0;
    const hasTurns = diff.sentimentTurns.length > 0;
    const hasDropped = diff.dropped.length > 0;

    return (
      <Collapsible
        trigger={<span className="font-medium text-[13px]">Changes since yesterday</span>}
        defaultOpen
        persistKey="diff"
        className="rounded-lg border border-line bg-surface"
        triggerClassName="px-4 py-3"
      >
        <div className="space-y-1 border-t border-line px-4 py-3 text-[13px]">
          {hasNew && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">NEW:</span>
              <Tickers list={diff.newTickers} />
            </div>
          )}
          {hasMoves && (
            <div className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="text-muted">Moved:</span>
              {diff.groupMoves.map((m) => (
                <span key={m.ticker} className="inline-flex items-center gap-1">
                  <TickerLink ticker={m.ticker} />
                  <span className="text-muted">
                    {GROUP_LABEL[m.from] ?? m.from} → {GROUP_LABEL[m.to] ?? m.to}
                  </span>
                </span>
              ))}
            </div>
          )}
          {hasTurns && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">Turned:</span>
              <span className="inline-flex flex-wrap gap-x-2">
                {diff.sentimentTurns.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    <TickerLink ticker={t} />
                    <span className="text-muted">↑sent</span>
                  </span>
                ))}
              </span>
            </div>
          )}
          {hasDropped && (
            <div className="flex flex-wrap gap-2">
              <span className="text-muted">Dropped:</span>
              <Tickers list={diff.dropped.map((d) => d.ticker)} />
              <span className="text-muted">
                (info only — downgrades are not sell signals)
              </span>
            </div>
          )}
          {!hasNew && !hasMoves && !hasTurns && !hasDropped && (
            <p className="text-muted">No changes since yesterday.</p>
          )}
        </div>
      </Collapsible>
    );
  }
  ```
  (`GROUP_LABEL` here is left as-is — it is a 3-key map unrelated to `lib/labels.ts`'s `QUADRANT_LABEL`/etc. and the contract does not define a shared group-name vocabulary; see `## Contract deviations requested` for the X-07 note.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- DiffStrip`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/today/DiffStrip.tsx components/today/__tests__/DiffStrip.test.tsx
  git commit -m "refactor(dashboard): DiffStrip onto Collapsible — grid-rows, dash:collapsible: key (UI-04)"
  ```

---

### Task 26: `components/odte/VerdictCard.tsx` — Collapsible migration (UI-04)

**Files:**
- Modify: `dashboard/components/odte/VerdictCard.tsx` (whole file rewrite — 89 lines)
- Test: `dashboard/components/odte/__tests__/VerdictCard.test.tsx` (new)

**Interfaces:**
- Consumes: `Collapsible` (Task 8) from `@/components/ui/Collapsible`.
- Produces: no export shape change — `VerdictCardProps` unchanged.

**Audit findings closed:** UI-04 (per contract arbitration note, one of the four independent expand/collapse implementations being consolidated — `VerdictCard` was the case with `open`/`canExpand` state and **no** `overflow-hidden`/transition at all, an abrupt show/hide rather than even a magic-number animation). A11Y-02 partial (title eyebrow and `whyItMatters` caption were `text-[10px]`, both raised to `text-[11px]`, since this file is already being touched).

**Layout note:** `stats` was previously a sibling `<div>` between the `<button>` and the collapsible detail, always visible regardless of open state. `Collapsible`'s contract shape has exactly one always-visible slot (`trigger`, rendered inside the toggle `<button>`) and one collapsible slot (`children`). `stats` moves inside `trigger` — it stays visible in both open and closed states, now within the button's hit area (harmless: stats are plain text, not interactive elements, so there is no nested-interactive-control problem).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/odte/__tests__/VerdictCard.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import VerdictCard from "@/components/odte/VerdictCard";

  const VERDICT = { status: "good" as const, sentence: "Gamma is pinned near spot." };

  describe("VerdictCard", () => {
    it("is collapsed by default and expands to show detail on click", async () => {
      render(
        <VerdictCard
          title="0DTE"
          verdict={VERDICT}
          detail={<p>Extra detail</p>}
        />
      );
      const trigger = screen.getByRole("button", { name: /Gamma is pinned near spot/ });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Extra detail")).toBeInTheDocument();
    });

    it("disables the trigger with a reason when there is no detail to expand", () => {
      render(<VerdictCard title="0DTE" verdict={VERDICT} />);
      const trigger = screen.getByRole("button", { name: /Gamma is pinned near spot/ });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute("title", "No detail available until the verdict finishes loading");
    });

    it("shows stats regardless of open state", () => {
      render(
        <VerdictCard
          title="0DTE"
          verdict={VERDICT}
          stats={[{ label: "GEX", value: "+1.2B" }]}
          detail={<p>Extra detail</p>}
        />
      );
      expect(screen.getByText("GEX")).toBeInTheDocument();
    });

    it("never sets a data caption below the 11px floor", () => {
      render(<VerdictCard title="0DTE" verdict={VERDICT} whyItMatters="context here" detail={<p>d</p>} />);
      const undersized = document.querySelectorAll('[class*="text-[9px]"], [class*="text-[10px]"]');
      expect(undersized.length).toBe(0);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- VerdictCard`
  Expected: FAIL — the current button has no `aria-expanded` attribute at all (it's a plain `<button onClick>` with local `open` state, no ARIA wiring), so the first two assertions fail immediately.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/odte/VerdictCard.tsx` in full:
  ```tsx
  "use client";

  import Link from "next/link";
  import type { ReactNode } from "react";
  import type { Verdict } from "@/lib/odte-verdicts";
  import Skeleton from "@/components/ui/Skeleton";
  import Collapsible from "@/components/ui/Collapsible";

  const borderClass: Record<Verdict["status"], string> = {
    good: "border-l-teal",
    neutral: "border-l-line",
    caution: "border-l-warn",
  };

  interface VerdictCardProps {
    title: string;
    verdict: Verdict | null;
    loading?: boolean;
    stats?: { label: string; value: string }[];
    whyItMatters?: string;
    detail?: ReactNode;
    strikesHref?: string;
  }

  function VerdictSummary({
    title,
    loading,
    verdict,
    stats,
  }: {
    title: string;
    loading?: boolean;
    verdict: Verdict | null;
    stats: { label: string; value: string }[];
  }) {
    return (
      <div className="min-w-0 flex-1">
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted font-mono">{title}</span>
        {loading ? (
          <Skeleton height={12} className="w-2/3 mt-1.5" />
        ) : verdict ? (
          <p className="text-[11px] font-mono mt-1 leading-snug">{verdict.sentence}</p>
        ) : (
          <p className="text-[11px] font-mono text-muted mt-1">no data — source unavailable</p>
        )}
        {!loading && verdict && stats.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {stats.map((s) => (
              <div key={s.label} className="font-mono text-[11px] tabular-nums">
                <span className="text-muted">{s.label} </span>
                <span className="text-foreground">{s.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function VerdictDetail({ whyItMatters, detail, strikesHref }: { whyItMatters?: string; detail?: ReactNode; strikesHref: string }) {
    return (
      <div className="mt-3 pt-3 border-t border-line space-y-2">
        {whyItMatters && <p className="text-[11px] text-muted italic">{whyItMatters}</p>}
        {detail}
        <Link href={strikesHref} className="inline-block text-[11px] text-teal hover:underline">
          Open strikes →
        </Link>
      </div>
    );
  }

  export default function VerdictCard({
    title,
    verdict,
    loading,
    stats = [],
    whyItMatters,
    detail,
    strikesHref = "/odte/strikes",
  }: VerdictCardProps) {
    const accent = verdict ? borderClass[verdict.status] : "border-l-line";
    const canExpand = !loading && !!verdict && !!detail;
    const summary = <VerdictSummary title={title} loading={loading} verdict={verdict} stats={stats} />;
    const cardClass = `bg-surface border border-line ${accent} border-l-2 rounded p-3`;

    // `Collapsible`'s `disabled`/`disabledReason` are a discriminated union — `disabled` must be the
    // literal `true`, not a general boolean, when `disabledReason` is supplied. Branch on `canExpand`
    // rather than passing `disabled={!canExpand}` directly, which would not type-check.
    if (!canExpand) {
      return (
        <Collapsible
          trigger={summary}
          disabled
          disabledReason="No detail available until the verdict finishes loading"
          className={cardClass}
          triggerClassName="items-start"
        >
          <VerdictDetail whyItMatters={whyItMatters} detail={detail} strikesHref={strikesHref} />
        </Collapsible>
      );
    }

    return (
      <Collapsible trigger={summary} className={cardClass} triggerClassName="items-start">
        <VerdictDetail whyItMatters={whyItMatters} detail={detail} strikesHref={strikesHref} />
      </Collapsible>
    );
  }
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- VerdictCard`  Expected: PASS (4/4)
- [ ] **Step 5: Commit**
  ```bash
  git add components/odte/VerdictCard.tsx components/odte/__tests__/VerdictCard.test.tsx
  git commit -m "refactor(dashboard): VerdictCard onto Collapsible — adds aria-expanded, was previously unwired (UI-04)"
  ```

---

### Task 27: `components/ticker/WhyPanel.tsx` (part 1) — Collapsible + CenterBar + InfoTip

**Files:**
- Modify: `dashboard/components/ticker/WhyPanel.tsx:6` (imports), `:10` (drop dead `ScoreBar` import), `:27-50` (delete `InfoTooltip`), `:52-74` (delete `NetBar`), `:95` (`FamilyRow`'s bar), `:348` (inflation-warning tip), `:384` (n_eff tip), `:412-445` (votes accordion)
- Test: `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `CenterBar` (Task 11), `InfoTip` (Task 12), `Collapsible` (Task 8) from `@/components/ui/CenterBar`, `@/components/ui/InfoTip`, `@/components/ui/Collapsible`.
- Produces: no export shape change.

**Audit findings closed:** UI-04 (votes accordion was correctly ARIA-wired but used a bare `hidden={!votesOpen}` toggle with no animation at all — one more independent expand/collapse implementation per the contract's 4-way arbitration), UI-09 (`InfoTooltip` wrapped `Tooltip.Trigger asChild` around a `<button>` already — this one was actually already keyboard-accessible; migrating it to the shared `InfoTip` removes the duplicate implementation rather than fixing a bug), UI-02/CenterBar consolidation (`NetBar` retired per contract §B.6 arbitration).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ticker/__tests__/WhyPanel.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { makeActionCardData } from "@/test/factories";
  import WhyPanel from "@/components/ticker/WhyPanel";

  describe("WhyPanel votes accordion", () => {
    it("starts collapsed and expands via Collapsible's grid-rows mechanism", async () => {
      mockFetchJson("/api/argus/action_card/NVDA", makeActionCardData({ ticker: "NVDA" }));
      render(<WhyPanel ticker="NVDA" />);
      const trigger = await screen.findByRole("button", { name: /agent votes/ });
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      await userEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
  });
  ```
  (If `@/test/factories`'s `makeActionCardData` does not yet exist, add a minimal factory returning a plain object satisfying `ActionCardData` with sensible defaults — no new test infra, matching the existing Phase 0 factory pattern.)
- [ ] **Step 2: Run test to verify it fails**
  First add this assertion to the end of the test (the current votes toggle already sets `aria-expanded` correctly, so the red bar comes from a structural check that only `Collapsible`'s markup satisfies — a `grid` wrapper around the content `id`):
  ```tsx
      const content = document.getElementById(trigger.getAttribute("aria-controls") as string);
      expect(content?.parentElement).toHaveClass("grid");
  ```
  Run: `npm run test:component -- WhyPanel`
  Expected: FAIL on the new assertion — the current votes content div (`<div id={votesId} hidden={!votesOpen} className="mt-2 space-y-0">`) is not wrapped in a `grid` element; `content?.parentElement` is the `<div className="border-t border-line pt-2">` wrapper, which has no `grid` class.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ticker/WhyPanel.tsx`.

  Imports (lines 6-11):
  ```diff
   import * as Tooltip from "@radix-ui/react-tooltip";
   import Panel from "@/components/ui/Panel";
   import Skeleton from "@/components/ui/Skeleton";
   import StatChip from "@/components/ui/StatChip";
  -import ScoreBar from "@/components/ui/ScoreBar";
  +import CenterBar from "@/components/ui/CenterBar";
  +import InfoTip from "@/components/ui/InfoTip";
  +import Collapsible from "@/components/ui/Collapsible";
   import type { ActionCardData } from "@/types/argus";
  ```
  (`Tooltip` stays imported — nothing else in this task removes its other file-wide usage; Task 28 does not touch tooltips either, so re-check at the end of Task 28 whether it's still referenced before a final cleanup. It is: `COMBO_NOTE`/format changes in Task 28 don't touch tooltips, so `Tooltip` remains dead after this task's `InfoTooltip` deletion below — remove it here too.)
  ```diff
  -import * as Tooltip from "@radix-ui/react-tooltip";
   import Panel from "@/components/ui/Panel";
  ```

  Delete `InfoTooltip` (lines 27-50):
  ```diff
  -function InfoTooltip({ text }: { text: string }) {
  -  return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <button
  -          type="button"
  -          className="text-muted text-[11px] font-mono leading-none cursor-default select-none align-middle"
  -          aria-label="info"
  -        >
  -          i
  -        </button>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[240px]"
  -          sideOffset={4}
  -        >
  -          {text}
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  -  );
  -}
  -
  ```

  Delete `NetBar` (lines 52-74):
  ```diff
  -function NetBar({ net }: { net: number }) {
  -  // net is already in -1..1 range
  -  const clamped = Math.max(-1, Math.min(1, net));
  -  const isPos = clamped > 0;
  -  const pct = Math.abs(clamped) * 50;
  -
  -  return (
  -    <span className="relative inline-block h-2 w-[80px] rounded-sm bg-elevated overflow-hidden shrink-0">
  -      <span
  -        className="absolute top-0 h-full"
  -        style={{
  -          left: isPos ? "50%" : `${50 - pct}%`,
  -          width: `${pct}%`,
  -          background: isPos ? "var(--green)" : "var(--red)",
  -        }}
  -      />
  -      <span
  -        className="absolute top-0 h-full w-px bg-muted/50"
  -        style={{ left: "50%" }}
  -      />
  -    </span>
  -  );
  -}
  -
  ```

  `FamilyRow`'s bar (line 95):
  ```diff
  -      <NetBar net={net} />
  +      <CenterBar value={net} width={80} />
  ```

  Inflation-warning tip (line 348):
  ```diff
  -            <InfoTooltip text="correlated consensus — discount" />
  +            <InfoTip content="correlated consensus — discount" label="Inflation warning info" />
  ```

  n_eff chip tip (line 384):
  ```diff
  -              <InfoTooltip text="Higher is not better — high n_eff backtested worse" />
  +              <InfoTip content="Higher is not better — high n_eff backtested worse" label="n_eff info" />
  ```

  Votes accordion (lines 412-445):
  ```diff
  -        <div className="border-t border-line pt-2">
  -          <button
  -            type="button"
  -            onClick={() => setVotesOpen((v) => !v)}
  -            className="flex items-center gap-1.5 text-left w-full"
  -            aria-expanded={votesOpen}
  -            aria-controls={votesId}
  -          >
  -            <ChevronDown
  -              size={12}
  -              className="text-muted transition-transform duration-150 shrink-0"
  -              style={{ transform: votesOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
  -            />
  -            <span className="font-mono text-[11px] text-muted">
  -              agent votes (
  -              <span className="text-pos">{agreedCount} agreed</span>
  -              {" · "}
  -              <span className="text-neg">{dissentedCount} dissented</span>
  -              )
  -            </span>
  -          </button>
  -
  -          <div id={votesId} hidden={!votesOpen} className="mt-2 space-y-0">
  -            {allVotes.map((v) => (
  -              <VoteRow
  -                key={v.agent}
  -                agent={v.agent}
  -                direction={v.verdict}
  -                confidence={v.confidence}
  -                note={v.note}
  -              />
  -            ))}
  -          </div>
  -        </div>
  +        <Collapsible
  +          trigger={
  +            <span className="font-mono text-[11px] text-muted">
  +              agent votes (
  +              <span className="text-pos">{agreedCount} agreed</span>
  +              {" · "}
  +              <span className="text-neg">{dissentedCount} dissented</span>
  +              )
  +            </span>
  +          }
  +          className="border-t border-line pt-2"
  +          triggerClassName="gap-1.5"
  +        >
  +          <div className="mt-2 space-y-0">
  +            {allVotes.map((v) => (
  +              <VoteRow
  +                key={v.agent}
  +                agent={v.agent}
  +                direction={v.verdict}
  +                confidence={v.confidence}
  +                note={v.note}
  +              />
  +            ))}
  +          </div>
  +        </Collapsible>
  ```
  (`votesOpen`/`setVotesOpen`/`votesId` — declared at lines 152-153 — and the now-unused `ChevronDown` import become dead; remove the `useState`/`useId` votes declarations and drop `ChevronDown` from the `lucide-react` import line, keeping `AlertTriangle`:)
  ```diff
  -import { ChevronDown, AlertTriangle } from "lucide-react";
  +import { AlertTriangle } from "lucide-react";
  ```
  ```diff
   export default function WhyPanel({ ticker }: { ticker: string }) {
  -  const [votesOpen, setVotesOpen] = useState(false);
  -  const votesId = useId();
  -
     const { data, error, isLoading, isValidating, mutate } = useSWR<ActionCardData>(
  ```
  (`useState` is still used elsewhere in this file? It is not — `votesOpen` was `WhyPanel`'s only `useState` call, and `useId` was only for `votesId`. Update the React import accordingly:)
  ```diff
  -import { useState, useId } from "react";
  +
  ```
  (delete the line entirely — nothing in this file needs a React import beyond JSX, which the Next.js/TS `jsx: "react-jsx"` runtime handles automatically, matching every other component in this codebase that has no explicit React-hook usage.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- WhyPanel`  Expected: PASS (1/1)
  Then: `grep -c "NetBar\|InfoTooltip\|ScoreBar" dashboard/components/ticker/WhyPanel.tsx`  Expected: `0`
- [ ] **Step 5: Commit**
  ```bash
  git add components/ticker/WhyPanel.tsx components/ticker/__tests__/WhyPanel.test.tsx
  git commit -m "refactor(dashboard): WhyPanel votes accordion onto Collapsible; NetBar->CenterBar, InfoTooltip->InfoTip (UI-04/UI-09)"
  ```

---

### Task 28: `components/ticker/WhyPanel.tsx` (part 2) — format.pctWhole + labels combo breakdown

**Files:**
- Modify: `dashboard/components/ticker/WhyPanel.tsx:1` (import), `:13-19` (delete `COMBO_NOTE`), `:249-254` (`agrPct`/`comboPrefix`/`comboNote` derivation), `:324` (agreement % render), `:353-365` (combo headline render)
- Test: extends `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` (Task 27)

**Interfaces:**
- Consumes: `pctWhole` (Task 2) from `@/lib/format`; `COMBO_POSITION_LABEL`, `COMBO_LETTER_LABEL` (Task 3) from `@/lib/labels`.
- Produces: no export shape change.

**Audit findings closed:** TK-07 (the corrected finding — audit's guessed positional order `trend/squeeze/oscillator/structure` was wrong; the real order per `argus/argus/action_card/builder.py` is `ma_trend, breakout, squeeze, momentum_osc`, encoded once in `COMBO_POSITION_LABEL` and now driving every position's gloss instead of five hand-typed sentences that only covered 5 of the many possible 3^4=81 combo strings), X-06/X-07 partial (percent formatting and combo-letter vocabulary centralized).

**Deliberately out of scope:** `lib/groups.ts`'s `comboClass()` (contract §F cites it alongside `WhyPanel`'s `COMBO_NOTE` as "ad hoc combo lookup") is a STRONG/WEAK/neutral **sort classification** using its own `STRONG`/`WEAK` sets mirrored from `argus/argus/action_card/builder.py`'s `_WEAK_COMBOS` — it is backtested classification logic, not display-text gloss, and does not read from `COMBO_NOTE`. `lib/labels.ts` is a pure label/gloss module; folding classification logic into it would conflate two different concerns. Left unchanged.

- [ ] **Step 1: Write the failing test**
  Append to `dashboard/components/ticker/__tests__/WhyPanel.test.tsx`:
  ```tsx
  describe("WhyPanel combo breakdown", () => {
    it("renders a per-position family: gloss line for each of the 4 combo characters", async () => {
      mockFetchJson(
        "/api/argus/action_card/NVDA",
        makeActionCardData({ ticker: "NVDA", combo: "LSNS", agreement_pct: 72.6 })
      );
      render(<WhyPanel ticker="NVDA" />);
      expect(await screen.findByText(/ma_trend: Long-dominant/)).toBeInTheDocument();
      expect(screen.getByText(/breakout: Short-dominant/)).toBeInTheDocument();
      expect(screen.getByText(/squeeze: Mixed \/ no dominant side/)).toBeInTheDocument();
      expect(screen.getByText(/momentum_osc: Short-dominant/)).toBeInTheDocument();
    });

    it("formats agreement % via format.pctWhole", async () => {
      mockFetchJson(
        "/api/argus/action_card/NVDA",
        makeActionCardData({ ticker: "NVDA", agreement_pct: 72.6 })
      );
      render(<WhyPanel ticker="NVDA" />);
      expect(await screen.findByText("73%")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- WhyPanel`
  Expected: FAIL — `getByText(/ma_trend: Long-dominant/)` finds nothing (the current combo headline only renders `COMBO_NOTE["LSNS"]`'s canned sentence, "dip-buy profile — trend up, oscillators cooled (best backtested class)", with no per-family breakdown); `getByText("73%")` also fails, since the current markup renders `73` and `%` as separate text nodes (`{agrPct}%`), which RTL's `getByText` does not match as one string.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ticker/WhyPanel.tsx`.

  Import (line 1 area — add alongside the imports left after Task 27):
  ```diff
   import Panel from "@/components/ui/Panel";
   import Skeleton from "@/components/ui/Skeleton";
   import StatChip from "@/components/ui/StatChip";
   import CenterBar from "@/components/ui/CenterBar";
   import InfoTip from "@/components/ui/InfoTip";
   import Collapsible from "@/components/ui/Collapsible";
  +import { pctWhole } from "@/lib/format";
  +import { COMBO_POSITION_LABEL, COMBO_LETTER_LABEL } from "@/lib/labels";
   import type { ActionCardData } from "@/types/argus";
  ```

  Delete `COMBO_NOTE` (lines 13-19):
  ```diff
  -const COMBO_NOTE: Record<string, string> = {
  -  LSNS: "dip-buy profile — trend up, oscillators cooled (best backtested class)",
  -  LNLL: "trend + squeeze + oscillators confirming",
  -  LSNL: "trend up, mixed confirmation",
  -  LNNL: "chasing risk — oscillators confirm into extension (backtested negative)",
  -  LLNL: "chasing risk — everything confirming late (backtested ~flat)",
  -};
  -
  ```

  Add a `comboBreakdown` helper near the top of the file, alongside `FamilyRow`/`VoteRow` (insert before `export default function WhyPanel`):
  ```tsx
  interface ComboBreakdownEntry {
    family: string;
    letter: "L" | "S" | "N";
    gloss: string;
  }

  function comboBreakdown(combo: string | null): ComboBreakdownEntry[] | null {
    if (!combo || combo.length < 4) return null;
    return COMBO_POSITION_LABEL.map(([family], i) => {
      const letter = combo[i] as "L" | "S" | "N";
      return { family, letter, gloss: COMBO_LETTER_LABEL[letter] ?? "Unknown" };
    });
  }
  ```

  `agrPct`/`comboPrefix`/`comboNote` derivation (lines 249-254):
  ```diff
  -  const agrPct =
  -    agreement_pct >= 2 ? Math.round(agreement_pct) : Math.round(agreement_pct * 100);
  +  const agrPct = agreement_pct >= 2 ? pctWhole(agreement_pct, "percent") : pctWhole(agreement_pct, "fraction");
     const inflationAbove = (inflation_gap ?? 0) > 0.15;

  -  const comboPrefix = combo ? combo.slice(0, 4) : null;
  -  const comboNote = comboPrefix ? COMBO_NOTE[comboPrefix] : null;
  +  const comboRows = comboBreakdown(combo ?? null);
  ```

  Agreement % render (line 324 — `pctWhole` already includes the `%` sign, drop the literal suffix):
  ```diff
  -        <span className="text-foreground tabular-nums">{agrPct}%</span>
  +        <span className="text-foreground tabular-nums">{agrPct}</span>
  ```

  Combo headline render (lines 353-365):
  ```diff
         {combo && (
           <div className="space-y-0.5">
             <span className="font-mono text-[12px] text-foreground">
               combo{" "}
               <span className="font-medium">{combo}</span>
             </span>
  -          {comboNote && (
  -            <p className="font-mono text-[11px] text-muted leading-snug">
  -              — {comboNote}
  -            </p>
  -          )}
  +          {comboRows && (
  +            <ul className="space-y-px">
  +              {comboRows.map((row) => (
  +                <li key={row.family} className="font-mono text-[11px] text-muted leading-snug">
  +                  {row.family}: {row.gloss}
  +                </li>
  +              ))}
  +            </ul>
  +          )}
           </div>
         )}
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- WhyPanel`  Expected: PASS (3/3, cumulative with Task 27's test)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ticker/WhyPanel.tsx components/ticker/__tests__/WhyPanel.test.tsx
  git commit -m "fix(dashboard): WhyPanel combo breakdown uses corrected TK-07 positional order, covers all combos not just 5 (TK-07, X-06/X-07)"
  ```

---

### Task 29: `components/ticker/Header.tsx` — PinToggle + InfoTip (UI-09)

**Files:**
- Modify: `dashboard/components/ticker/Header.tsx:1-9` (imports), `:41-64` (delete dead `InfoTooltip`), `:66-119` (delete `PinButton`), `:187-203` (earnings chip tooltip), `:249-264` (HC badge tooltip), `:270` (`PinButton` call site)
- Test: `dashboard/components/ticker/__tests__/Header.test.tsx` (new)

**Interfaces:**
- Consumes: `PinToggle` (Task 10), `InfoTip` (Task 12) from `@/components/ui/PinToggle`, `@/components/ui/InfoTip`.
- Produces: no export shape change.

**Audit findings closed:** UI-09 (the earnings-proximity chip and the `HC` badge both wrap `Tooltip.Trigger asChild` around a non-focusable `<span className="cursor-default">` — two more instances of the app's most common a11y bug; the file-local `InfoTooltip` helper that shares the bug's name was actually dead code with zero call sites, deleted outright), X-04 (`PinButton` was one of three near-identical optimistic pin/unpin implementations per contract §B.5 arbitration — the other two are Screener's `PinCell` (Task 21) and Watchlist's inline unpin (Task 30)).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ticker/__tests__/Header.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import UndoToastProvider from "@/components/ui/UndoToastProvider";
  import Header from "@/components/ticker/Header";
  import { makeBridgeRow } from "@/test/factories";

  function withProvider(ui: React.ReactNode) {
    return <UndoToastProvider>{ui}</UndoToastProvider>;
  }

  describe("Header", () => {
    it("renders the pin control as a PinToggle with an accessible name", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/argus/quote/NVDA", { symbol: "NVDA", price: 142.3, change: 1.2, change_pct: 0.85 });
      mockFetchJson("/api/argus/fundamentals/NVDA", { name: "NVIDIA Corp" });
      render(
        withProvider(
          <Header ticker="NVDA" bridgeRow={makeBridgeRow({ ticker: "NVDA", earnings_in_days: 3, high_conviction: true })} signalHistory={[]} lastClose={142.3} />
        )
      );
      expect(await screen.findByRole("button", { name: "Pin NVDA" })).toBeInTheDocument();
    });

    it("wraps the earnings chip and HC badge tooltip triggers in real, focusable buttons", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/argus/quote/NVDA", { symbol: "NVDA", price: 142.3, change: 1.2, change_pct: 0.85 });
      mockFetchJson("/api/argus/fundamentals/NVDA", { name: "NVIDIA Corp" });
      render(
        withProvider(
          <Header ticker="NVDA" bridgeRow={makeBridgeRow({ ticker: "NVDA", earnings_in_days: 3, high_conviction: true })} signalHistory={[]} lastClose={142.3} />
        )
      );
      expect(await screen.findByRole("button", { name: /earnings in 3 days/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /high conviction/i })).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- Header`
  Expected: FAIL — the current earnings chip and `HC` badge are non-focusable `<span>`s inside `Tooltip.Trigger asChild`, so `getByRole("button", { name: /earnings in 3 days/i })` and `getByRole("button", { name: /high conviction/i })` both find nothing.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ticker/Header.tsx`.

  Imports (lines 1-9):
  ```diff
   "use client";

  -import { useRef } from "react";
   import useSWR from "swr";
  -import * as Tooltip from "@radix-ui/react-tooltip";
   import Badge from "@/components/ui/Badge";
   import ConvictionDot from "@/components/ui/ConvictionDot";
  +import PinToggle from "@/components/ui/PinToggle";
  +import InfoTip from "@/components/ui/InfoTip";
   import type { BridgeRow, Conviction } from "@/types/bridge";
   import { calledSince } from "@/lib/called-since";
  ```

  Delete dead `InfoTooltip` (lines 41-64):
  ```diff
  -function InfoTooltip({ text }: { text: string }) {
  -  return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <button
  -          type="button"
  -          className="text-muted text-[11px] font-mono leading-none cursor-default select-none"
  -          aria-label="info"
  -        >
  -          i
  -        </button>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[240px]"
  -          sideOffset={4}
  -        >
  -          {text}
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  -  );
  -}
  -
  ```

  Delete `PinButton` (lines 66-119):
  ```diff
  -function PinButton({ ticker }: { ticker: string }) {
  -  const { data, mutate } = useSWR<{ watchlist: { ticker: string }[] }>(
  -    "/api/watchlist",
  -    fetcher,
  -    { revalidateOnFocus: false }
  -  );
  -  const pending = useRef(false);
  -
  -  const pinned = data?.watchlist?.some((w) => w.ticker === ticker) ?? false;
  -
  -  async function toggle() {
  -    if (pending.current) return;
  -    pending.current = true;
  -    const optimistic = !pinned;
  -    // Optimistic update
  -    mutate(
  -      (prev) => {
  -        if (!prev) return prev;
  -        const wl = optimistic
  -          ? [...prev.watchlist, { ticker }]
  -          : prev.watchlist.filter((w) => w.ticker !== ticker);
  -        return { watchlist: wl };
  -      },
  -      false
  -    );
  -    try {
  -      await fetch("/api/watchlist", {
  -        method: optimistic ? "POST" : "DELETE",
  -        headers: { "Content-Type": "application/json" },
  -        body: JSON.stringify({ ticker }),
  -      });
  -    } catch {
  -      // revert on error
  -      mutate();
  -    } finally {
  -      pending.current = false;
  -    }
  -  }
  -
  -  return (
  -    <button
  -      type="button"
  -      onClick={toggle}
  -      className={[
  -        "px-2 py-0.5 rounded border text-[11px] font-mono transition-colors",
  -        pinned
  -          ? "border-accent text-accent bg-accent/10"
  -          : "border-line text-muted hover:border-accent hover:text-accent",
  -      ].join(" ")}
  -    >
  -      {pinned ? "Pinned" : "Pin"}
  -    </button>
  -  );
  -}
  -
  ```

  Earnings chip tooltip (lines 187-203):
  ```diff
       earningsNode = (
  -      <Tooltip.Root>
  -        <Tooltip.Trigger asChild>
  -          <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-[11px] font-mono text-warn tabular-nums cursor-default">
  -            earnings in {earningsInDays}d
  -          </span>
  -        </Tooltip.Trigger>
  -        <Tooltip.Portal>
  -          <Tooltip.Content
  -            className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -            sideOffset={4}
  -          >
  -            earnings in {earningsInDays}d — inside typical hold window
  -            <Tooltip.Arrow className="fill-elevated" />
  -          </Tooltip.Content>
  -        </Tooltip.Portal>
  -      </Tooltip.Root>
  +      <InfoTip content={`earnings in ${earningsInDays}d — inside typical hold window`} label={`earnings in ${earningsInDays} days`}>
  +        <span className="inline-flex items-center rounded border border-warn/50 bg-warn/10 px-1.5 py-px text-[11px] font-mono text-warn tabular-nums">
  +          earnings in {earningsInDays}d
  +        </span>
  +      </InfoTip>
       );
  ```

  HC badge tooltip (lines 249-264):
  ```diff
             {bridgeRow.high_conviction && (
  -            <Tooltip.Root>
  -              <Tooltip.Trigger asChild>
  -                <span className="inline-flex items-center rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[11px] font-mono text-accent cursor-default">
  -                  HC
  -                </span>
  -              </Tooltip.Trigger>
  -              <Tooltip.Portal>
  -                <Tooltip.Content
  -                  className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[220px]"
  -                  sideOffset={4}
  -                >
  -                  {"≥"}75% indicator agreement — consensus, not edge
  -                  <Tooltip.Arrow className="fill-elevated" />
  -                </Tooltip.Content>
  -              </Tooltip.Portal>
  -            </Tooltip.Root>
  +            <InfoTip content={`${"≥"}75% indicator agreement — consensus, not edge`} label="high conviction info">
  +              <span className="inline-flex items-center rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[11px] font-mono text-accent">
  +                HC
  +              </span>
  +            </InfoTip>
             )}
  ```

  `PinButton` call site (line 270):
  ```diff
           <div className="ml-auto flex items-center gap-2">
  -          <PinButton ticker={ticker} />
  +          <PinToggle symbol={ticker} />
           </div>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- Header`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ticker/Header.tsx components/ticker/__tests__/Header.test.tsx
  git commit -m "refactor(dashboard): ticker Header onto PinToggle/InfoTip; remove dead InfoTooltip (UI-09, X-04)"
  ```

---

### Task 30: `app/watchlist/WatchlistClient.tsx` (part 1) — PinToggle unpin + Input/Button add-ticker

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx:5-11` (imports), `:133-141` (`PinnedSection` props — drop `onUnpin`), `:327-341` (unpin column), `:344-366` (add bar), `:594-604` (delete `handleUnpin`), `:609` (`PinnedSection` call site)
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` (new)

**Interfaces:**
- Consumes: `PinToggle` (Task 10), `Input` (Task 6), `Button` (Task 5) from `@/components/ui/PinToggle`, `@/components/ui/Input`, `@/components/ui/Button`.
- Produces: no export shape change. `PinnedSection`'s `onUnpin` prop is removed (file-local interface, not exported outside this module).

**Audit findings closed:** X-04 (`WatchlistClient`'s inline "unpin" button was the third of the three near-identical pin/unpin implementations per contract §B.5 arbitration, and the only one that wasn't even optimistic — it awaited the `DELETE` before refetching), A11Y-07 (unpin now gets undo, matching `PinToggle`'s built-in `useUndoAction` wiring — a pinned ticker removed by mis-click was previously unrecoverable without re-typing the symbol), UI-12 (add-ticker `<input>`/`<button>` were hand-styled with `focus:outline-none focus:ring-1` instead of the shared primitives).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import UndoToastProvider from "@/components/ui/UndoToastProvider";
  import WatchlistClient from "@/app/watchlist/WatchlistClient";

  function withProvider(ui: React.ReactNode) {
    return <UndoToastProvider>{ui}</UndoToastProvider>;
  }

  describe("WatchlistClient pinned table", () => {
    it("renders unpin as a PinToggle text-variant button and shows an undo toast on click", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] });
      mockFetchJson("/api/bridge", { signals: [] });
      render(withProvider(<WatchlistClient />));
      const unpinBtn = await screen.findByRole("button", { name: "Unpin" });
      await userEvent.click(unpinBtn);
      expect(await screen.findByText("Removed NVDA from watchlist")).toBeInTheDocument();
    });

    it("renders the add-ticker field as an h-8 Input and the add button as an h-8 Button", async () => {
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/bridge", { signals: [] });
      render(withProvider(<WatchlistClient />));
      expect(await screen.findByPlaceholderText("Add ticker…")).toHaveClass("h-8");
      expect(screen.getByRole("button", { name: "Pin" })).toHaveClass("h-8");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- WatchlistClient`
  Expected: FAIL — the current unpin button's accessible name is `"Unpin NVDA"` (from an explicit `aria-label`), not `"Unpin"`, so `getByRole("button", { name: "Unpin" })` does not match; the add field and Pin button are `focus:outline-none`/plain `<input>`/`<button>` with no `h-8` class.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/app/watchlist/WatchlistClient.tsx`.

  Imports (lines 5-11):
  ```diff
   import Panel from "@/components/ui/Panel";
   import DataTable, { Column } from "@/components/ui/DataTable";
   import StatChip from "@/components/ui/StatChip";
   import Badge from "@/components/ui/Badge";
   import EmptyState from "@/components/ui/EmptyState";
   import PageHeader from "@/components/ui/PageHeader";
  +import PinToggle from "@/components/ui/PinToggle";
  +import Input from "@/components/ui/Input";
  +import Button from "@/components/ui/Button";
   import { heatBg } from "@/lib/heat";
  ```

  `PinnedSection` props (lines 133-141 — drop `onUnpin`, `PinToggle` self-manages its own optimistic mutation against the shared `/api/watchlist` SWR cache key):
  ```diff
   function PinnedSection({
     entries,
  -  onUnpin,
     onAdded,
   }: {
     entries: WatchlistEntry[];
  -  onUnpin: (ticker: string) => Promise<void>;
     onAdded: () => void;
   }) {
  ```

  Unpin column (lines 327-341):
  ```diff
       {
         key: "unpin",
         header: "",
  -      render: (r) => (
  -        <button
  -          onClick={(e) => {
  -            e.stopPropagation();
  -            onUnpin(r.ticker);
  -          }}
  -          className="text-[11px] text-muted hover:text-neg px-1"
  -          aria-label={`Unpin ${r.ticker}`}
  -        >
  -          unpin
  -        </button>
  -      ),
  +      render: (r) => (
  +        <span onClick={(e) => e.stopPropagation()}>
  +          <PinToggle symbol={r.ticker} variant="text" />
  +        </span>
  +      ),
       },
     ];
  ```
  (`PinToggle` has no built-in click-propagation guard of its own — since `DataTable` rows are click-to-expand, the original code stopped propagation on the button's own `onClick`. Wrapping in a `<span onClick={stopPropagation}>` preserves that without modifying the frozen `PinToggle` component.)

  Add bar (lines 344-366):
  ```diff
       <Panel title="Pinned" persistKey="watchlist-pinned">
         {/* Add bar */}
         <div className="flex items-center gap-2 mb-3">
  -        <input
  -          type="text"
  +        <Input
  +          type="text"
             value={addInput}
             onChange={(e) => { setAddInput(e.target.value); setAddError(null); }}
             onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
             placeholder="Add ticker…"
  -          className="rounded border border-line bg-elevated px-3 py-1.5 text-[13px] text-foreground placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent w-36"
  +          className="w-36"
           />
  -        <button
  +        <Button
  +          variant="primary"
             onClick={handleAdd}
             disabled={adding || !addInput.trim()}
  -          className="rounded border border-line bg-elevated px-3 py-1.5 text-[12px] text-foreground hover:bg-surface disabled:opacity-40 disabled:cursor-not-allowed"
           >
             {adding ? "Adding…" : "Pin"}
  -        </button>
  +        </Button>
           {addError && (
             <span className="text-[12px] text-neg">{addError}</span>
           )}
         </div>
  ```

  Delete `handleUnpin` (lines 594-604 — no longer called anywhere):
  ```diff
  -  const handleUnpin = useCallback(
  -    async (ticker: string) => {
  -      await fetch("/api/watchlist", {
  -        method: "DELETE",
  -        headers: { "Content-Type": "application/json" },
  -        body: JSON.stringify({ ticker }),
  -      });
  -      mutate();
  -    },
  -    [mutate]
  -  );
  -
  ```
  (`useCallback` is now unused if nothing else in the file references it — check before removing the import; `fetchHistoriesWithConcurrency`'s effect and other hooks in this file do not use `useCallback` elsewhere, per the file's own top-level import line 3, so drop it from the import too:)
  ```diff
  -import { useState, useEffect, useRef, useCallback } from "react";
  +import { useState, useEffect, useRef } from "react";
  ```

  `PinnedSection` call site (line 609):
  ```diff
  -      <PinnedSection entries={entries} onUnpin={handleUnpin} onAdded={mutate} />
  +      <PinnedSection entries={entries} onAdded={mutate} />
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- WatchlistClient`  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
  git commit -m "refactor(dashboard): watchlist unpin onto PinToggle (adds undo, A11Y-07); add-ticker onto Input/Button (X-04, UI-12)"
  ```

---

### Task 31: `app/watchlist/WatchlistClient.tsx` (part 2) format.price/pct/relativeAge

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx:1-11` (imports), `:72-88` (`fmtPct`/`fmtPrice` bodies), `:90-98` (delete `fmtDate`/`daysSince`), `:272` (pinned-date cell), `:372-392` (summary-strip `StatChip` values), `:416` (`RecentFlagEnriched.ageDays` field), `:450` (age computation), `:500-503` (age column)
- Modify: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` (add a `describe` block; file created in Task 30)

**Interfaces:**
- Consumes: `price`, `pct`, `relativeAge` (Task 2) from `@/lib/format`.
- Produces: no export shape change. `RecentFlagEnriched`'s file-local `ageDays: number` field is renamed `ageSeconds: number`.

**Audit findings closed:** X-06 (four hand-rolled numeric-formatting helpers — `fmtPct`, `fmtPrice`, `fmtDate`, `daysSince` — duplicating logic that now lives once in `lib/format.ts`; three more duplicate inline pct-string expressions in the summary-strip `StatChip` values that reproduced `fmtPct`'s sign/decimal formula by hand rather than calling it). OL-06 pattern (the seconds-vs-ms/days unit-mismatch class of bug `relativeAge` exists to prevent) applied preemptively here: `ageDays` was rendered as a bare unlabeled integer with no unit — `relativeAge` fixes that as a byproduct of centralizing it.

Deliberately unchanged: `sincePercent` (lines 67-70) stays file-local and is **not** replaced by `format.pct`. It is a percent-scale *computation* (delta between two prices) consumed by `heatBg(v, clamp=10)`, which expects a percent-scale magnitude (`clamp` defaults to `10`, i.e. ±10%) for its background-alpha calculation — `format.pct` only *formats* an already-computed value to a string and has no equivalent computation helper. Converting `sincePercent` to return a raw fraction would require also rescaling every `heatBg(v)` call site, which is out of scope for a formatter migration. `fmtDate` (lines 90-92) is deleted outright rather than routed through `lib/format.ts`: it is a one-line ISO-to-`YYYY-MM-DD` substring with no rounding/sign/unit policy for the contract to standardize, and `format.ts` has no date-slicing export (adding one would violate the global "no new primitive without a contract entry" constraint) — its single call site is inlined instead.

- [ ] **Step 1: Write the failing test**
  Modify `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`, adding a new `describe` block after the existing `describe("WatchlistClient pinned table", ...)` block (before the file's closing):
  ```tsx
  describe("WatchlistClient recent picks age formatting", () => {
    it("renders the Age column through format.relativeAge with a unit suffix", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      mockFetchJson("/api/watchlist", { watchlist: [] });
      mockFetchJson("/api/bridge", { signals: [] });
      mockFetchJson("/api/signals/recent?days=14", [
        {
          ticker: "MSFT",
          first_date: eightDaysAgo,
          first_group: "aligned",
          entry_at_flag: 300,
          last_date: eightDaysAgo,
        },
      ]);
      mockFetchJson("/api/signals/dates", [{ date: eightDaysAgo }]);
      mockFetchJson("/api/argus/history/MSFT?period=6mo", {
        bars: [{ ts: eightDaysAgo, close: 300 }],
      });
      render(withProvider(<WatchlistClient medianDaysToPeak={12} />));
      expect(await screen.findByText(/^\d+d$/)).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- WatchlistClient`
  Expected: FAIL — the current `RecentPicksSection` renders `<span className="tabular-nums text-muted">{r.ageDays}</span>`, a bare integer (e.g. `"8"`) with no unit suffix, so nothing in the document matches `/^\d+d$/`. `findByText` times out after its default wait window and throws `TestingLibraryElementError: Unable to find an element with the text: /^\d+d$/`.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/app/watchlist/WatchlistClient.tsx`.

  Imports (lines 1-11):
  ```diff
   import Panel from "@/components/ui/Panel";
   import DataTable, { Column } from "@/components/ui/DataTable";
   import StatChip from "@/components/ui/StatChip";
   import Badge from "@/components/ui/Badge";
   import EmptyState from "@/components/ui/EmptyState";
   import PageHeader from "@/components/ui/PageHeader";
   import { heatBg } from "@/lib/heat";
  +import { price, pct, relativeAge } from "@/lib/format";
  ```

  `fmtPct` body (lines 72-83 — internal formatting only, signature and JSX wrapper unchanged):
  ```diff
   function fmtPct(v: number | null): React.ReactNode {
     if (v === null) return <span className="text-muted">—</span>;
     const cls = v >= 0 ? "text-pos" : "text-neg";
     return (
       <span
         className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${cls}`}
         style={{ backgroundColor: heatBg(v) }}
       >
  -      {v >= 0 ? "+" : ""}{v.toFixed(1)}%
  +      {pct(v, "percent")}
       </span>
     );
   }
  ```

  `fmtPrice` body (lines 85-88 — signature unchanged):
  ```diff
   function fmtPrice(v: number | null): React.ReactNode {
     if (v === null) return <span className="text-muted">—</span>;
  -  return <span className="tabular-nums">${v.toFixed(2)}</span>;
  +  return <span className="tabular-nums">{price(v)}</span>;
   }
  ```

  Delete `fmtDate` and `daysSince` (lines 90-98):
  ```diff
  -function fmtDate(iso: string): string {
  -  return iso.slice(0, 10);
  -}
  -
  -function daysSince(dateStr: string): number {
  -  const d = new Date(dateStr + "T00:00:00Z");
  -  const now = Date.now();
  -  return Math.floor((now - d.getTime()) / 86400000);
  -}
  ```

  Pinned-date cell, inlining the deleted `fmtDate` (line 272):
  ```diff
  -      render: (r) => <span className="text-muted text-[12px]">{fmtDate(r.pinned_at)}</span>,
  +      render: (r) => <span className="text-muted text-[12px]">{r.pinned_at.slice(0, 10)}</span>,
  ```

  Summary-strip `StatChip` values (lines 372-392 — replace the hand-rolled sign/decimal formula, same as `fmtPct`'s old body, with `pct()`):
  ```diff
             <StatChip
               label="median since-pin"
  -            value={`${medianSince >= 0 ? "+" : ""}${medianSince.toFixed(1)}%`}
  +            value={pct(medianSince, "percent")}
               tone={medianSince >= 0 ? "pos" : "neg"}
             />
           )}
           {best && best.sincePin !== null && (
             <StatChip
               label={`best (${best.ticker})`}
  -            value={`${best.sincePin >= 0 ? "+" : ""}${best.sincePin.toFixed(1)}%`}
  +            value={pct(best.sincePin, "percent")}
               tone="pos"
             />
           )}
           {worst && worst.sincePin !== null && worst.ticker !== best?.ticker && (
             <StatChip
               label={`worst (${worst.ticker})`}
  -            value={`${worst.sincePin >= 0 ? "+" : ""}${worst.sincePin.toFixed(1)}%`}
  +            value={pct(worst.sincePin, "percent")}
               tone={worst.sincePin < 0 ? "neg" : "muted"}
             />
           )}
  ```

  `RecentFlagEnriched` field rename (line 416):
  ```diff
   interface RecentFlagEnriched extends RecentFlag {
     now: number | null;
     sinceFlag: number | null;
  -  ageDays: number;
  +  ageSeconds: number;
     stillIn: boolean | null;
   }
  ```

  Age computation, inlining the deleted `daysSince` in seconds (line 450):
  ```diff
       return {
         ...r,
         now,
         sinceFlag: sincePercent(r.entry_at_flag, now),
  -      ageDays: daysSince(r.first_date),
  +      ageSeconds: Math.floor(
  +        (Date.now() - new Date(r.first_date + "T00:00:00Z").getTime()) / 1000
  +      ),
         stillIn: latestDate !== null ? r.last_date === latestDate : null,
       };
  ```

  Age column (lines 500-503):
  ```diff
       {
  -      key: "ageDays",
  -      header: "Age (d)",
  +      key: "ageSeconds",
  +      header: "Age",
         align: "right",
  -      render: (r) => <span className="tabular-nums text-muted">{r.ageDays}</span>,
  +      render: (r) => <span className="tabular-nums text-muted">{relativeAge(r.ageSeconds)}</span>,
       },
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- WatchlistClient`
  Expected: PASS (3/3 — the two Task 30 tests plus this task's new one)
- [ ] **Step 5: Commit**
  ```bash
  git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
  git commit -m "refactor(dashboard): watchlist numeric/age formatting onto lib/format (X-06); Age column now unit-suffixed"
  ```

---

### Task 32: `components/today/RotationPanel.tsx` — InfoTip + labels.QUADRANT_LABEL/HEADER_GLOSS + --muted-2

**Files:**
- Modify: `dashboard/components/today/RotationPanel.tsx:1-4` (imports), `:26-31` (`QUADRANT_TONE`→`QUADRANT_COLOR`), `:33-37` (delete `DRANK_TOOLTIP`/`BREADTH_TOOLTIP`, keep `THIN_TOOLTIP`), `:39-77` (`Th`), `:79-102` (`QuadrantDot`), `:104-130` (`DRank`), `:167-182` (header row), `:186-207` (thin-basket row/industry cell)
- Test: `dashboard/components/today/__tests__/RotationPanel.test.tsx` (new)

**Interfaces:**
- Consumes: `InfoTip` (Task 12) from `@/components/ui/InfoTip`; `HEADER_GLOSS`, `QUADRANT_LABEL` (Task 3) from `@/lib/labels`.
- Produces: no export shape change. `RotationPanel`'s default export signature (`{ rows, defaultOpen, collapsible }`) is unchanged.

**Audit findings closed:** UI-09/A11Y-01 (`Th`, `QuadrantDot`, `DRank`, and the thin-basket industry cell all wrap Radix `Tooltip.Trigger asChild` around a non-focusable `<span className="cursor-default">` — four instances of the same bug in one file, per contract §B.7's migration table), X-06/X-07 (`Δrank`/`RS-Ratio`/`RS-Mom`/`Breadth`/`n`/`◉` header glosses were either hand-typed locally (`DRANK_TOOLTIP`, `BREADTH_TOOLTIP`) or missing entirely (`◉`, `RS-Ratio`, `RS-Mom`, `n` had no tooltip at all) instead of sourced from the single `HEADER_GLOSS` map; `QuadrantDot`'s label text was duplicated inside file-local `QUADRANT_TONE` instead of `lib/labels.ts`'s `QUADRANT_LABEL`), A11Y-02 (thin-basket rows used `text-muted` — already the primary de-emphasis tier — for a *second*, weaker tier of dimming with no token backing it; now `text-muted-2`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/RotationPanel.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import RotationPanel, { RotationRow } from "@/components/today/RotationPanel";

  function makeRow(overrides: Partial<RotationRow> = {}): RotationRow {
    return {
      industry: "Semiconductors",
      quadrant: "leading",
      rs_ratio: 103.2,
      rs_mom: 101.1,
      breadth: 62,
      n: 8,
      r1w: 1.2,
      r1m: 3.4,
      r3m: 8.1,
      rank: 1,
      drank: 1,
      ...overrides,
    };
  }

  describe("RotationPanel tooltip a11y + thin-basket dimming", () => {
    it("every header, quadrant-dot, Δrank, and thin-industry tooltip trigger is a real button", () => {
      render(<RotationPanel rows={[makeRow()]} defaultOpen collapsible={false} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(6);
    });

    it("dims a thin-basket row (n < 20) with text-muted-2, not the primary text-muted tier", () => {
      render(<RotationPanel rows={[makeRow({ n: 8 })]} defaultOpen collapsible={false} />);
      const row = screen.getByText("Semiconductors").closest("tr");
      expect(row).toHaveClass("text-muted-2");
      expect(row).not.toHaveClass("text-muted");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- RotationPanel`
  Expected: FAIL — every tooltip trigger in the current file (`Th`, `QuadrantDot`, `DRank`, thin-industry cell) is `Tooltip.Trigger asChild` wrapping a `<span>`, so `getAllByRole("button")` returns 0 (none of the six header cells have a `<button>`, since only `Δrank` and `Breadth` even render a tooltip today, and both use `<span>` triggers); the thin row's `<tr>` has class `text-muted`, not `text-muted-2`, so both assertions in the second test fail too.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/today/RotationPanel.tsx`.

  Imports (lines 1-4):
  ```diff
   "use client";

  -import * as Tooltip from "@radix-ui/react-tooltip";
   import Panel from "@/components/ui/Panel";
  +import InfoTip from "@/components/ui/InfoTip";
  +import { HEADER_GLOSS, QUADRANT_LABEL } from "@/lib/labels";
  ```

  `QUADRANT_TONE` → `QUADRANT_COLOR` (lines 26-31 — label duty moves to `QUADRANT_LABEL`):
  ```diff
  -const QUADRANT_TONE: Record<string, { color: string; label: string }> = {
  -  leading: { color: "var(--green)", label: "Leading" },
  -  improving: { color: "var(--teal)", label: "Improving" },
  -  weakening: { color: "var(--amber)", label: "Weakening" },
  -  lagging: { color: "var(--red)", label: "Lagging" },
  -};
  +const QUADRANT_COLOR: Record<string, string> = {
  +  leading: "var(--green)",
  +  improving: "var(--teal)",
  +  weakening: "var(--amber)",
  +  lagging: "var(--red)",
  +};
  ```

  Delete local `DRANK_TOOLTIP`/`BREADTH_TOOLTIP`, keep `THIN_TOOLTIP` (lines 33-37 — `THIN_TOOLTIP` is a row-level gloss, not a column-header gloss, so it has no `HEADER_GLOSS` entry and stays local):
  ```diff
  -const DRANK_TOOLTIP = "~72% of ±1 moves are noise";
   const THIN_TOOLTIP =
     "thin basket — displayed RS values are noisier than the (shrinkage-adjusted) rank suggests";
  -const BREADTH_TOOLTIP =
  -  "% above 50-DMA — Improving + low breadth = one-name move, unconfirmed";
  ```

  `Th` (lines 39-77 — trigger becomes `InfoTip`'s real `<button>`; no tooltip renders the header text unwrapped, same as before):
  ```diff
   function Th({
     children,
     align = "left",
     tooltip,
   }: {
     children: React.ReactNode;
     align?: "left" | "right" | "center";
     tooltip?: string;
   }) {
     const alignCls =
       align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  -  const inner = (
  -    <span className={tooltip ? "cursor-default border-b border-dotted border-muted/50" : ""}>
  -      {children}
  -    </span>
  -  );
     return (
       <th
         className={`px-2 py-1.5 font-medium text-muted border-b border-line whitespace-nowrap ${alignCls}`}
       >
         {tooltip ? (
  -        <Tooltip.Root>
  -          <Tooltip.Trigger asChild>{inner}</Tooltip.Trigger>
  -          <Tooltip.Portal>
  -            <Tooltip.Content
  -              className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -              sideOffset={4}
  -            >
  -              {tooltip}
  -              <Tooltip.Arrow className="fill-elevated" />
  -            </Tooltip.Content>
  -          </Tooltip.Portal>
  -        </Tooltip.Root>
  +        <InfoTip content={tooltip}>
  +          <span className="border-b border-dotted border-muted/50">{children}</span>
  +        </InfoTip>
         ) : (
  -        inner
  +        children
         )}
       </th>
     );
   }
  ```

  `QuadrantDot` (lines 79-102):
  ```diff
   function QuadrantDot({ quadrant }: { quadrant: string }) {
  -  const tone = QUADRANT_TONE[quadrant] ?? { color: "var(--muted)", label: quadrant };
  +  const color = QUADRANT_COLOR[quadrant] ?? "var(--muted)";
  +  const label = QUADRANT_LABEL[quadrant] ?? quadrant;
     return (
  -    <Tooltip.Root>
  -      <Tooltip.Trigger asChild>
  -        <span className="inline-flex cursor-default items-center justify-center">
  -          <span
  -            className="block h-2.5 w-2.5 rounded-full"
  -            style={{ background: tone.color }}
  -          />
  -        </span>
  -      </Tooltip.Trigger>
  -      <Tooltip.Portal>
  -        <Tooltip.Content
  -          className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -          sideOffset={4}
  -        >
  -          {tone.label}
  -          <Tooltip.Arrow className="fill-elevated" />
  -        </Tooltip.Content>
  -      </Tooltip.Portal>
  -    </Tooltip.Root>
  +    <InfoTip content={label} label={label}>
  +      <span className="block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
  +    </InfoTip>
     );
   }
  ```

  `DRank` (lines 104-130 — small-value branch's tooltip now sources `HEADER_GLOSS["Δrank"]`):
  ```diff
   function DRank({ drank }: { drank: number | null }) {
     if (drank === null || Math.abs(drank) < 2) {
       return (
  -      <Tooltip.Root>
  -        <Tooltip.Trigger asChild>
  -          <span className="cursor-default text-muted">•</span>
  -        </Tooltip.Trigger>
  -        <Tooltip.Portal>
  -          <Tooltip.Content
  -            className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -            sideOffset={4}
  -          >
  -            {DRANK_TOOLTIP}
  -            <Tooltip.Arrow className="fill-elevated" />
  -          </Tooltip.Content>
  -        </Tooltip.Portal>
  -      </Tooltip.Root>
  +      <InfoTip content={HEADER_GLOSS["Δrank"]} label="Rank change below the noise threshold">
  +        <span className="text-muted">•</span>
  +      </InfoTip>
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

  Header row (lines 167-182 — wire the 4 previously-untooltipped headers to `HEADER_GLOSS`):
  ```diff
             <tr>
               <Th>Industry</Th>
  -            <Th align="center" tooltip={DRANK_TOOLTIP}>
  +            <Th align="center" tooltip={HEADER_GLOSS["Δrank"]}>
                 Δrank
               </Th>
  -            <Th align="center">◉</Th>
  -            <Th align="right">RS-Ratio</Th>
  -            <Th align="right">RS-Mom</Th>
  -            <Th align="right" tooltip={BREADTH_TOOLTIP}>
  +            <Th align="center" tooltip={HEADER_GLOSS["◉"]}>◉</Th>
  +            <Th align="right" tooltip={HEADER_GLOSS["RS-Ratio"]}>RS-Ratio</Th>
  +            <Th align="right" tooltip={HEADER_GLOSS["RS-Mom"]}>RS-Mom</Th>
  +            <Th align="right" tooltip={HEADER_GLOSS["Breadth"]}>
                 Breadth
               </Th>
  -            <Th align="right">n</Th>
  +            <Th align="right" tooltip={HEADER_GLOSS["n"]}>n</Th>
               <Th align="right">1W</Th>
               <Th align="right">1M</Th>
               <Th align="right">3M</Th>
             </tr>
  ```

  Thin-basket row + industry cell (lines 186-207):
  ```diff
             {sorted.map((r) => {
               const thin = r.n != null && r.n < 20;
  -            const rowCls = thin ? "text-muted" : "";
  +            const rowCls = thin ? "text-muted-2" : "";
               const industryCell = thin ? (
  -              <Tooltip.Root>
  -                <Tooltip.Trigger asChild>
  -                  <span className="cursor-default border-b border-dotted border-muted/50">
  -                    {r.industry}
  -                  </span>
  -                </Tooltip.Trigger>
  -                <Tooltip.Portal>
  -                  <Tooltip.Content
  -                    className="max-w-xs rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50"
  -                    sideOffset={4}
  -                  >
  -                    {THIN_TOOLTIP}
  -                    <Tooltip.Arrow className="fill-elevated" />
  -                  </Tooltip.Content>
  -                </Tooltip.Portal>
  -              </Tooltip.Root>
  +              <InfoTip content={THIN_TOOLTIP}>
  +                <span className="border-b border-dotted border-muted/50">{r.industry}</span>
  +              </InfoTip>
               ) : (
                 r.industry
               );
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- RotationPanel`
  Expected: PASS (2/2)
- [ ] **Step 5: Commit**
  ```bash
  git add components/today/RotationPanel.tsx components/today/__tests__/RotationPanel.test.tsx
  git commit -m "refactor(dashboard): RotationPanel tooltips onto InfoTip (A11Y-01), header glosses onto HEADER_GLOSS (X-06), thin rows onto text-muted-2 (A11Y-02)"
  ```

---

### Task 33: `components/charts/CandleChart.tsx` — Toggle (log-scale) + var(--green)/var(--red) tokens

**Files:**
- Modify: `dashboard/components/charts/CandleChart.tsx:1-5` (imports), `:68-78` (`LEVEL_STYLE`/`EMA_STYLE`), `:399-413` (log-scale control)
- Test: `dashboard/components/charts/__tests__/CandleChart.test.tsx` (new)

**Interfaces:**
- Consumes: `Toggle` (Task 13) from `@/components/ui/Toggle`.
- Produces: no export shape change. `CandleChart`'s default export props (`Props`) are unchanged.

**Audit findings closed:** A11Y-04/OL-10 (the log-scale control was a plain `<button>` toggling its own `bg-accent` active state with no `role="switch"`/`aria-checked` — a screen reader announces it only as a generic button labeled "log", with no indication it is a persistent on/off setting or what its current state is), X-08-partial (`LEVEL_STYLE.stop`/`LEVEL_STYLE.target` and `EMA_STYLE.e20`/`EMA_STYLE.e50` hardcode hex values — `#f85149`, `#3fb950`, `#4c8dff`, `#d29922` — that are exact, byte-for-byte matches of `--red`, `--green`, `--accent`, `--amber` in `globals.css:15-19`, duplicating the token rather than referencing it).

Deliberately unchanged/out of scope: `LEVEL_STYLE.entry` (`#e6e8ec`) and `EMA_STYLE.e200` (`#8b93a3`) have no exact-match token in `globals.css` — `--text`/`#eef1f6` and `--muted`/`#7d8698` are close but not identical, and forcing either onto a non-matching token would be a visible (if small) color shift on every ticker chart. Left as literal hex pending a design decision on whether to *add* new tokens for these two colors (not authorized here — "no new primitive without a contract entry"). The chart chrome itself (`layout.background`, `grid`, `rightPriceScale.borderColor`, `timeScale.borderColor`, `candleSeries` up/down/wick colors, volume-bar `rgba(...)` colors, lines 240–281) is untouched: the contract's migration table (line 1015) names only `LEVEL_STYLE`/`EMA_STYLE`, and those colors are not part of either object.

**Note for `## Contract deviations requested`:** the contract instructs `var(--green)`/`var(--red)` literal strings for `LEVEL_STYLE`/`EMA_STYLE`. These are passed as literal color values into `lightweight-charts`' series/price-line options, which lightweight-charts applies via Canvas 2D `fillStyle`/`strokeStyle`. Canvas 2D context colors are **not guaranteed to resolve CSS custom properties** the way DOM/SVG paint properties do — this is implemented exactly as specified per the frozen contract, but should be visually verified against a real running chart; if `var(--green)` renders as invalid (falls back to black or the previous color), the fallback is `getComputedStyle(document.documentElement).getPropertyValue("--green").trim()` resolved once at chart-mount time instead of the raw `var()` string.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/charts/__tests__/CandleChart.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import CandleChart, { type Bar } from "@/components/charts/CandleChart";

  const bars: Bar[] = [
    { ts: "2026-07-01", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { ts: "2026-07-02", open: 101, high: 103, low: 100, close: 102, volume: 1200 },
  ];

  describe("CandleChart log-scale control", () => {
    it("is a real switch with a persistent on/off state", async () => {
      render(<CandleChart ticker="AAPL" initialBars={bars} />);
      const logSwitch = screen.getByRole("switch", { name: "Logarithmic Y-axis" });
      expect(logSwitch).toHaveAttribute("aria-checked", "false");
      await userEvent.click(logSwitch);
      expect(logSwitch).toHaveAttribute("aria-checked", "true");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- CandleChart`
  Expected: FAIL — the current log control is `<button onClick={...}>log</button>` with no `role` attribute at all (the default implicit role for `<button>` is `"button"`, not `"switch"`), so `getByRole("switch", { name: "Logarithmic Y-axis" })` throws `TestingLibraryElementError: Unable to find an accessible element with the role "switch" and name "Logarithmic Y-axis"`.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/charts/CandleChart.tsx`.

  Imports (lines 1-5):
  ```diff
   "use client";
   import { useEffect, useRef, useState, useCallback } from "react";
   import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
   import EmptyState from "@/components/ui/EmptyState";
  +import Toggle from "@/components/ui/Toggle";
   import { visibleRangeFor, type ChartPeriod as Period } from "@/lib/chart-range";
  ```

  `LEVEL_STYLE`/`EMA_STYLE` (lines 68-78):
  ```diff
   const LEVEL_STYLE = {
  -  entry: { color: "#e6e8ec", lineStyle: 2, title: "E" },
  -  stop: { color: "#f85149", lineStyle: 0, title: "S" },
  -  target: { color: "#3fb950", lineStyle: 0, title: "T" },
  +  entry: { color: "#e6e8ec", lineStyle: 2, title: "E" },
  +  stop: { color: "var(--red)", lineStyle: 0, title: "S" },
  +  target: { color: "var(--green)", lineStyle: 0, title: "T" },
   } as const;

   const EMA_STYLE = {
  -  e20: { color: "#4c8dff", title: "EMA 20" },
  -  e50: { color: "#d29922", title: "EMA 50" },
  -  e200: { color: "#8b93a3", title: "EMA 200" },
  +  e20: { color: "var(--accent)", title: "EMA 20" },
  +  e50: { color: "var(--amber)", title: "EMA 50" },
  +  e200: { color: "#8b93a3", title: "EMA 200" },
   };
  ```

  Log-scale control (lines 399-413):
  ```diff
  -      {/* Log toggle */}
  -      <button
  -        onClick={() => setLogScale((v) => !v)}
  -        className={[
  -          "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
  -          logScale
  -            ? "bg-accent text-foreground"
  -            : "bg-elevated text-muted hover:text-foreground",
  -        ].join(" ")}
  -      >
  -        log
  -      </button>
  +      {/* Log toggle */}
  +      <div className="flex items-center gap-1.5">
  +        <Toggle checked={logScale} onChange={setLogScale} label="Logarithmic Y-axis" />
  +        <span className="text-[11px] font-medium text-muted">log</span>
  +      </div>
  ```
  (`setLogScale` already matches `Toggle`'s `onChange: (checked: boolean) => void` signature — the old button used the functional-updater form `setLogScale((v) => !v)` only because it read the previous value off the button's own click handler; `Toggle` already passes the next value explicitly, so the plain setter is used directly, same as the contract's own `<Toggle checked={logScale} onChange={setLogScale} .../>` usage example.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- CandleChart`
  Expected: PASS (1/1)
- [ ] **Step 5: Commit**
  ```bash
  git add components/charts/CandleChart.tsx components/charts/__tests__/CandleChart.test.tsx
  git commit -m "refactor(dashboard): CandleChart log-scale onto Toggle (A11Y-04/OL-10); LEVEL_STYLE/EMA_STYLE hex onto tokens (X-08)"
  ```

---

### Task 34: `components/ticker/SentimentCard.tsx` — ScoreBar onto CenterBar

**Files:**
- Modify: `dashboard/components/ticker/SentimentCard.tsx:1-6` (imports), `:41` (`ScoreBar` call site)
- Delete: `dashboard/components/ui/ScoreBar.tsx`
- Test: `dashboard/components/ticker/__tests__/SentimentCard.test.tsx` (new)

**Interfaces:**
- Consumes: `CenterBar` (Task 11) from `@/components/ui/CenterBar`.
- Produces: no export shape change.

**Audit findings closed:** UI-02 (`ScoreBar.tsx` was one of three near-identical center-anchored diverging-bar components — `MicroBar` closed in Task 24, `WhyPanel`'s inline `NetBar` closed in Task 27 — leaving `ScoreBar` as the last of the three; per contract §B.6 it is fully replaced by `CenterBar value={sentiment_score} width={100} showValue`, its exact canonical `width=100` usage example).

`ScoreBar.tsx` is now safe to delete: `WhyPanel.tsx`'s import was removed in Task 27, and this task removes the only remaining consumer (`SentimentCard.tsx`) — confirmed via `grep -rl "components/ui/ScoreBar" dashboard --include='*.tsx'` returning only these two files.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/ticker/__tests__/SentimentCard.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import SentimentCard from "@/components/ticker/SentimentCard";
  import type { BridgeRow } from "@/types/bridge";

  function makeBridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
    return {
      ticker: "AAPL",
      fetch_symbol: "AAPL",
      setup_label: "aligned",
      conviction: "high",
      quality_score: 0.8,
      cluster_overlap: 0,
      cluster_confirmed: false,
      cluster_bonus: 0,
      source_score: 0.5,
      mentions: 12,
      accounts: 6,
      catalysts: null,
      top_accounts: null,
      ret_1d: null,
      ret_5d: null,
      ret_20d: null,
      ret_126d: null,
      ret_252d: null,
      argus_verdict: "LONG",
      argus_score: 0.7,
      high_conviction: true,
      agreement_pct: 0.6,
      long_votes: 5,
      short_votes: 1,
      wait_votes: 0,
      entry: null,
      stop: null,
      target: null,
      risk_reward: null,
      is_extended: false,
      entry_quality: "clean",
      stop_anchor: "",
      sentiment_score: 0.42,
      tech_score: 0.5,
      combined_score: 0.5,
      catalyst_score: 0,
      vote_event_catalyst: 0,
      vote_earnings_proximity: 0,
      vote_squeeze_setup: 0,
      vote_growth_profitability: 0,
      vote_analyst_upside: 0,
      gate_flags: null,
      alignment: "ALIGNED",
      action_label: "LONG",
      trade_style: "swing",
      combo: "LLNN",
      ticker_regime: "trend",
      n_eff: 8,
      group1: true,
      group2: false,
      near_aligned: true,
      report_group: "aligned",
      theme: null,
      industry: null,
      next_earnings_date: null,
      earnings_in_days: null,
      extra: "",
      ...overrides,
    };
  }

  describe("SentimentCard score bar", () => {
    it("renders the sentiment score as a 100px CenterBar with its value label", () => {
      render(<SentimentCard bridgeRow={makeBridgeRow({ sentiment_score: 0.42 })} lastSeen={null} />);
      expect(screen.getByText("+0.42")).toBeInTheDocument();
      const track = screen.getByText("+0.42").previousElementSibling;
      expect(track).toHaveStyle({ width: "100px" });
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- SentimentCard`
  Expected: FAIL — the current `ScoreBar` renders its track with an inline `w-[100px]` Tailwind class (not a `style={{ width }}` attribute), so `toHaveStyle({ width: "100px" })` finds no matching inline style and fails; `+0.42` itself does render today (both components format the value identically), so this assertion alone is not the discriminator — the `toHaveStyle` check on the track element is.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/components/ticker/SentimentCard.tsx`.

  Imports (lines 1-6):
  ```diff
   "use client";

   import Link from "next/link";
   import Panel from "@/components/ui/Panel";
  -import ScoreBar from "@/components/ui/ScoreBar";
  +import CenterBar from "@/components/ui/CenterBar";
   import ConvictionDot from "@/components/ui/ConvictionDot";
   import type { BridgeRow, Conviction } from "@/types/bridge";
  ```

  Call site (line 41):
  ```diff
  -          <ScoreBar value={sentiment_score} showValue />
  +          <CenterBar value={sentiment_score} width={100} showValue />
  ```

  Delete `dashboard/components/ui/ScoreBar.tsx`.
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- SentimentCard`
  Expected: PASS (1/1)
- [ ] **Step 5: Commit**
  ```bash
  git add components/ticker/SentimentCard.tsx components/ticker/__tests__/SentimentCard.test.tsx
  git rm components/ui/ScoreBar.tsx
  git commit -m "refactor(dashboard): SentimentCard ScoreBar onto CenterBar, delete last ScoreBar consumer (UI-02)"
  ```

---

### Task 35: `app/portfolio/page.tsx` — format.price + Badge(variant="verdict") + PORTFOLIO_EDGE_LABEL/VERDICT_LABEL

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx:1-9` (imports), `:35-48` (delete `verdictChip`), `:190` (`avg_cost` cell), `:192` (verdict cell), `:196-198` (`edge` cell)
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `Badge` (existing shared component, UI-06) from `@/components/ui/Badge`; `InfoTip` (Task 12) from `@/components/ui/InfoTip`; `price` (Task 2) from `@/lib/format`; `PORTFOLIO_EDGE_LABEL`, `VERDICT_LABEL` (Task 3) from `@/lib/labels`.
- Produces: no export shape change.

**Audit findings closed:** PF-08 (edge values `"HOLD/ADD"`/`"CONSIDER SELLING"`/`"CONSIDER COVERING"`/`"NEUTRAL"`/`"N/A"`/`"NO DATA"` render as bare text with zero explanation of what any of them mean or why a position is in that state — now every value gets its exact gloss from `PORTFOLIO_EDGE_LABEL`, keyed 1:1 against `argus/argus/portfolio/tracker.py:56-69`'s real value set per the README's audit correction #3), X-06 (`verdictChip()` reinvents `Badge`'s existing `variant="verdict"` styling locally, with a spurious extra `border` the shared component doesn't have — `LONG`/`SHORT`/`WAIT` colors now come from one place; `avg_cost`'s inline `` `$${v.toFixed(2)}` `` duplicates `format.price`'s exact policy).

Contract citation correction: the migration table (line 1006) cites a `fmtPct` helper in this file and (line 1013) cites `PORTFOLIO_EDGE_LABEL`'s target as `verdictChip`/`scoreClass`. Neither holds up against the current source: `app/portfolio/page.tsx` has no `fmtPct` function at all (confirmed via `grep -n "fmtPct" dashboard/app/portfolio/page.tsx` — zero matches; likely a mix-up with `screener/page.tsx`'s real `fmtPct`, already tracked separately), and `PORTFOLIO_EDGE_LABEL`'s six keys are an exact match for the `edge` column's values, not `verdict`/`score` — the gloss belongs on the `edge` cell (lines 196-198), not inside `verdictChip`/`scoreClass`. `verdictChip` does still get fixed here, but via the pre-existing `Badge` component (evidenced duplication) plus its own gloss from `VERDICT_LABEL` (not `PORTFOLIO_EDGE_LABEL`) — documented under `## Audit findings that did not hold up`.

Deliberately unchanged: `pos.score` (line 194, `.toFixed(2)`, no sign, no `%`) has no matching `format.ts` export and no cited audit finding — left as-is. The bespoke `<table>`'s `bg-white/[0.02]` fake zebra striping (line 169) is **not** fixed here — per contract §A.4's own arbitration, the real fix is rebuilding this table on `DataTable` (which already owns the correct `bg-surface`/`bg-bg` zebra pattern), explicitly out of scope for this contract and deferred to Phase 4 (`05-phase4-tables-and-crud.md`, `PF-04`).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/portfolio/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import PortfolioPage from "@/app/portfolio/page";

  describe("PortfolioPage position table", () => {
    it("formats avg cost via format.price and gives the verdict chip and edge cell real tooltip triggers", async () => {
      mockFetchJson("/api/argus/portfolio", [
        { symbol: "AAPL", position: 10, avg_cost: 150, verdict: "LONG", score: 0.31, edge: "HOLD/ADD" },
      ]);
      mockFetchJson("/api/watchlist", { watchlist: [] });
      render(<PortfolioPage />);
      expect(await screen.findByText("$150.00")).toBeInTheDocument();
      expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText("LONG")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test:component -- portfolio`
  Expected: FAIL — `avg_cost` currently renders via `` `$${pos.avg_cost.toFixed(2)}` `` inside a plain `<td>`, so `findByText("$150.00")` does pass on its own, but `verdictChip` renders a plain `<span>` (not a button) and the `edge` cell is bare text with no trigger at all — the only real `<button>` in the row is the `›` nav button, so `getAllByRole("button")` returns 1, and `toBeGreaterThanOrEqual(3)` fails.
- [ ] **Step 3: Write minimal implementation**
  Modify `dashboard/app/portfolio/page.tsx`.

  Imports (lines 1-9):
  ```diff
   "use client";
   import PageHeader from "@/components/ui/PageHeader";
   import SkeletonTable from "@/components/ui/SkeletonTable";
  +import Badge from "@/components/ui/Badge";
  +import InfoTip from "@/components/ui/InfoTip";
  +import { price } from "@/lib/format";
  +import { PORTFOLIO_EDGE_LABEL, VERDICT_LABEL } from "@/lib/labels";

   import Link from "next/link";
   import { useRouter } from "next/navigation";
   import useSWR from "swr";
  ```

  Delete `verdictChip` (lines 35-48 — replaced inline at its one call site by `Badge` + `InfoTip`):
  ```diff
  -function verdictChip(verdict: string | undefined): React.ReactNode {
  -  if (!verdict) return <span className="text-muted">—</span>;
  -  const cls =
  -    verdict === "LONG"
  -      ? "bg-pos/10 text-pos border border-pos/40"
  -      : verdict === "SHORT"
  -      ? "bg-neg/10 text-neg border border-neg/50"
  -      : "bg-warn/10 text-warn border border-warn/40";
  -  return (
  -    <span className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${cls}`}>
  -      {verdict}
  -    </span>
  -  );
  -}
  -
  ```

  `avg_cost` cell (line 190):
  ```diff
                         <td className="py-1.5 pr-4 text-right tabular-nums text-foreground font-mono">
  -                        {pos.avg_cost == null ? "—" : `$${pos.avg_cost.toFixed(2)}`}
  +                        {price(pos.avg_cost)}
                         </td>
  ```

  Verdict cell (line 192):
  ```diff
  -                      <td className="py-1.5 pr-4">{verdictChip(pos.verdict)}</td>
  +                      <td className="py-1.5 pr-4">
  +                        {pos.verdict ? (
  +                          <InfoTip content={VERDICT_LABEL[pos.verdict] ?? pos.verdict}>
  +                            <Badge variant="verdict" value={pos.verdict} />
  +                          </InfoTip>
  +                        ) : (
  +                          <span className="text-muted">—</span>
  +                        )}
  +                      </td>
  ```

  `edge` cell (lines 196-198):
  ```diff
                         <td className="py-1.5 pr-4 font-mono text-xs text-muted">
  -                        {pos.edge ?? "—"}
  +                        {pos.edge ? (
  +                          <InfoTip content={PORTFOLIO_EDGE_LABEL[pos.edge] ?? pos.edge}>
  +                            <span>{pos.edge}</span>
  +                          </InfoTip>
  +                        ) : (
  +                          "—"
  +                        )}
                         </td>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `npm run test:component -- portfolio`
  Expected: PASS (1/1)
- [ ] **Step 5: Commit**
  ```bash
  git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
  git commit -m "refactor(dashboard): Portfolio verdict onto Badge+InfoTip(VERDICT_LABEL), edge onto InfoTip(PORTFOLIO_EDGE_LABEL) (PF-08), avg_cost onto format.price (X-06)"
  ```

---

## Contract deviations requested

1. **`dashboard/components/rails/QuoteRow.tsx` is deliberately NOT migrated onto `format.price`/`format.pct`**, despite the contract's migration table (§F, line ~732) asserting `format.price` "matches `QuoteRow.tsx`'s existing `formatPrice()`". Verified false against the real 90-line source: `QuoteRow`'s `formatPrice()` branches on instrument type (forex → 4dp, magnitude ≥1000 → thousands-separated with zero decimals, else → 2dp) and never prefixes `$`, per its own inline comment ("Format price per spec: forex 4dp, ≥1000 thousands-separated no decimals, others 2dp"); `format.price` always does flat 2dp with a `$` prefix. `QuoteRow`'s `formatPct()` is 2dp; `format.pct` is 1dp. Forcing this migration would be a real, visible regression (forex quotes losing precision, index quotes gaining an incorrect `$`, all rail % changes losing a decimal). No task was written for this file. Recommend the contract's §F row be corrected or dropped in a future revision.

2. **`components/charts/CandleChart.tsx`'s `LEVEL_STYLE`/`EMA_STYLE` migration (Task 33) uses `var(--green)`/`var(--red)`/`var(--accent)`/`var(--amber)` string literals for Canvas 2D `fillStyle`/`strokeStyle`, exactly as the frozen contract specifies.** Flagging a real technical risk rather than silently working around it: `lightweight-charts` paints via the Canvas 2D API, and unlike DOM/SVG paint properties, Canvas 2D `fillStyle`/`strokeStyle` are not universally guaranteed by every browser/canvas-shim to re-resolve CSS custom properties the way `getComputedStyle` would. Implemented as specified per "implement exactly, flag disagreements." If a rendering agent later observes literal `"var(--green)"` strings painting instead of the resolved color, the recommended fallback is a small `resolveToken(name: string): string` helper backed by `getComputedStyle(document.documentElement).getPropertyValue(name)`, called once at chart-mount time — not a token change, just a resolution-layer addition.

3. **Task 33 leaves `LEVEL_STYLE.entry` and `EMA_STYLE.e200` as literal hex**, not tokenized. Their hex values do not byte-for-byte match any existing `globals.css` token (closest are `--text: #eef1f6` and `--muted: #7d8698`, both visually distinguishable from the chart's actual literals). Migrating them would be an unauthorized, visually-detectable color substitution, not a pure rename — scoped out per the "exact match only" rule applied to the rest of Task 33's migration.

## Audit findings that did not hold up

1. **UI-10 (`EmptyState` "used three times" as if inconsistently built)** — the `EmptyState` component itself was already correct/well-built before this plan; the actual gap was call-site *adoption*, not the component's own design. Task 17 ships it as a contract-frozen primitive with no behavior change from what a well-built ad hoc empty state would already do; Tasks 21 and 24 are the real fixes (Screener, `SignalGroups`). Two further bare `<p>` empty states the audit's own citation implies (`NewsCard.tsx:42`, `HistoryCard.tsx:31`) are confirmed still unmigrated but are out of this phase's file scope — they're Phase 3 (Today/Ticker) call sites, not Phase 1's `§F` migration-table entries, so no task was written for them here.

2. **Contract §F's migration-table citation for `app/portfolio/page.tsx` names a `fmtPct` function that does not exist in the real source** (confirmed via `grep -n "fmtPct\|toFixed\|%" app/portfolio/page.tsx` — zero matches). Task 35 instead migrates the two `.toFixed()` call sites that actually exist and are actually in scope (`avg_cost` onto `format.price`); `pos.score` (bare `.toFixed(2)`, no format.ts equivalent) is deliberately left untouched.

3. **Contract §F's migration-table citation mis-locates `PORTFOLIO_EDGE_LABEL`'s target as `verdictChip`/`scoreClass`.** `PORTFOLIO_EDGE_LABEL`'s 6 keys (`"HOLD/ADD"`, `"CONSIDER SELLING"`, `"CONSIDER COVERING"`, `"NEUTRAL"`, `"N/A"`, `"NO DATA"`) are an exact match for `pos.edge`'s real value set, not `pos.verdict`'s (`LONG`/`SHORT`/`WAIT`). Task 35 applies `PORTFOLIO_EDGE_LABEL` to the `edge` cell and separately applies the correct, previously-unused `VERDICT_LABEL` map plus the existing `Badge variant="verdict"` component to the `verdict` cell — closing the real underlying "color-only, no gloss, reinvented `Badge`" finding via the correct label map and the correct existing shared component.

## Coverage table

Every audit ID in this phase's scope, mapped to the task(s) that close it. IDs the audit raises but this phase does not touch (page-level color-only encodings, skip link, chrome/rails, other-phase surfaces) are listed with a one-line reason instead of a task number.

| Audit ID | Closed by | Notes |
|---|---|---|
| UI-01 | Task 15 | `ConvictionDot` tier-tinted fill |
| UI-02 | Tasks 11, 24, 27, 34 | `CenterBar` primitive; retires `MicroBar` (24), `WhyPanel`'s inline `NetBar` (27), `ScoreBar` (34) |
| UI-03 | Task 14 | `Badge` `PRIME_LONG` tint corrected to strongest/green |
| UI-04 | Tasks 19, 20, 25, 26, 27 | `DataTable`, `Panel`, `DiffStrip`, `VerdictCard`, `WhyPanel` votes accordion — five independent expand/collapse implementations unified onto `Collapsible`/shared grid-rows pattern |
| UI-05 | Task 20 | `Panel`'s `count` prop replaces string-interpolated title+count |
| UI-06 | Task 19 | `DataTable` sticky-column `bg-inherit` fix |
| UI-07 | Task 19 | `DataTable` focus ring + conditional `scrollIntoView` |
| UI-08 | Task 19 | `DataTable` scroll-edge fade |
| UI-09 / A11Y-01 | Tasks 12, 15, 16, 24, 29, 32 | `InfoTip` primitive (real `<button>` trigger) + every non-focusable-`<span>` tooltip call site migrated |
| UI-10 | Tasks 17, 21, 24 | `EmptyState` primitive + Screener/`SignalGroups` adoption. See "did not hold up" #1 for `NewsCard`/`HistoryCard` (Phase 3, out of this phase's file list) |
| UI-11 | Task 18 | `Sparkline` gets a text alternative (`aria-label`/`title`) |
| UI-12 | Tasks 5, 6, 7, 21, 22, 23, 30 | `Button`/`Input`/`Select` primitives + Screener, Alerts, `SignalGroups`, Watchlist call sites |
| UI-13 | Task 16 | `StatChip` gets `InfoTip`, retires hand-rolled duplicates |
| A11Y-02 | Tasks 23, 26, 32 | 11px data / 12px prose floor; `--muted-2` token replaces bare `opacity`/unbacked dimming |
| A11Y-03 | Not in this phase | Color-only encodings (quadrant dots, econ dots, FX tints, GEX sign, `MacroGauges`) are page-level shape/label additions on Rotation/Macro/rails — Phases 2, 5, 6 |
| A11Y-04 | Tasks 13, 33 | `Toggle` primitive (real `role="switch"`) + `CandleChart` log-scale migration. Remaining instances (EMA chips, `HC only`, macro window/scope, symbol switchers, nav `aria-current`, Options Live's `live`/`LIVE` toggle = OL-10) are page-level call sites in Phases 2, 3, 5, 6 that consume this primitive |
| A11Y-05 | Not in this phase | Skip link is chrome/rails — Phase 2 |
| A11Y-06 | Task 19 (partial) | `DataTable` gets `<caption>`/`scope="col"`. Bespoke non-`DataTable` tables (Rotation, Portfolio, `OptionsPanel`, `HistoryCard`, strikes ladder) are out of this phase's file list — Phases 3, 4, 5, 6 |
| A11Y-07 | Tasks 9, 22, 30 | `UndoToastProvider`/`useUndoAction` primitive + Alerts delete-undo + Watchlist unpin-undo |
| TK-07 | Task 28 | Corrected combo-position order (`ma_trend, breakout, squeeze, momentum_osc`) per `argus/argus/action_card/builder.py`, encoded once in `COMBO_POSITION_LABEL` |
| PF-08 | Task 35 | `edge` cell onto `InfoTip(PORTFOLIO_EDGE_LABEL)`; verdict cell onto `Badge variant="verdict"` + `InfoTip(VERDICT_LABEL)` |
| X-01 | Out of scope | Market Review port — separate repo, user-deferred (README) |
| X-02 | Out of scope (partial) | Argus dev UI (`argus/argus/ui/index.html`) tokenisation is an internal dev surface, not user-facing (README). User-facing chart tokenisation is Task 33 + Phase 5's chart-conventions spec |
| X-03 | Not in this phase | Locale/timezone (`en-NZ`/`en-AU`/`en-US` split, ET/UTC mix) has no contract §F entry for Phase 1; needs a dedicated `tz-display.ts`-consuming task, likely Phase 2/3 |
| X-04 | Tasks 10, 21, 29, 30 | `PinToggle` primitive + Screener `PinCell`, Ticker `Header`'s `PinButton`, Watchlist's inline unpin — all three near-identical pin affordances unified |
| X-05 | Task 8 (primitive) + UI-04 rows above | `Collapsible` primitive; consuming migrations are the same four listed under UI-04 |
| X-06 | Tasks 21, 24, 28, 31, 32, 35 | `format.ts`/`labels.ts` centralization across Screener, `SignalGroups`, `WhyPanel`, Watchlist, `RotationPanel`, Portfolio. Five-table-implementations half of X-06 (`DataTable` vs. bespoke Rotation/Portfolio/`OptionsPanel`/`HistoryCard`/strikes tables) is a bigger structural rebuild deferred to Phases 4/5/6, per contract §A.4's own arbitration |
| X-07 | Tasks 24, 28, 32 | `HEADER_GLOSS`/`QUADRANT_LABEL`/combo-label centralization in `SignalGroups`, `WhyPanel`, `RotationPanel`. `CommandK`'s inline re-derivation and `DiffStrip`'s `GROUP_LABEL` are Phase 2/3 call sites outside this phase's file list, not yet migrated |
| X-08 | Tasks 21, 24, 28, 31, 33, 35 | `format.pct`/`pctWhole`/`price` precision centralization. `CandleChart`'s hex-to-token slice is X-08-partial (color precision, not numeric); GEX bar / R:R precision on `OptionsPanel`/strikes pages is Phase 6 |
| AL-01 | Not in this phase | `Rule.enabled` has no UI toggle — Phase 4 (Alerts page behavior, not a primitive/migration concern) |
| OL-04, OL-06, OL-09, OL-10, OL-18 | Not in this phase | Options Live findings — Phase 6, several gated on Phase 5's chart-conventions spec per the README's dependency graph |

**Deliberately skipped, no task written:**
- `dashboard/components/rails/QuoteRow.tsx` (`formatPrice`/`formatPct` migration implied by contract §F) — see Contract deviations #1. Its formatting is a genuinely different, deliberate policy, not accidental duplication.
- `lib/groups.ts`'s `comboClass()` — noted in Task 28 as intentionally left alone; it drives layout/styling, not label text, so it's outside `labels.ts`'s remit.
- Portfolio's `bg-white/[0.02]` fake-zebra table rebuild onto `DataTable` — real fix is a structural table migration, explicitly deferred to Phase 4 per contract §A.4's own arbitration (also folded into the X-06 row above).
