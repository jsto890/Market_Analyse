# Phase 3: Today, Ticker Detail & Explanatory Surfaces — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close every P0/P1/P2 finding against the Today page (`/`), the Ticker detail page (`/t/[ticker]`), and their supporting components, and ship the two missing explanatory surfaces the audit flags as dead/absent: `/sources` (currently a 404 every account chip links to) and `/glossary` (the legend the app's abbreviations and codes have never had). All new UI consumes the frozen primitives, `lib/format.ts`, `lib/labels.ts` and `lib/storageKeys.ts` from `00-foundations-contract.md` — this plan does not define any new shared primitive.

**Architecture:** Today stays a Server Component (`app/page.tsx`) composing client islands (`SignalGroups`, `DiffStrip`, `MorningReport`) that read/write `localStorage`-persisted UI state. Ticker detail stays a Server Component (`app/t/[ticker]/page.tsx`) that does the initial SQLite/CSV/history reads, but the chart + its levels move behind one new client component (`TickerChartSection`) so live levels can update without a page reload. A new `useTickerData(ticker)` SWR hook (`lib/useTickerData.ts`) becomes the single fetch point for `quote`, `action_card` and `fundamentals`, replacing five independent `useSWR` call sites across `Header`, `LevelsCard`, `WhyPanel`, `CatalystsCard` and the new `TickerChartSection`. `/sources` and `/glossary` are new Server Components; `/sources` does a real server-side aggregation over `loadBridgeSignals()` (no new data source — see Task 15 for why per-post/account-leaderboard data isn't available yet).

**Tech Stack:** Next.js 14 App Router, React 18.3, SWR 2.4, TypeScript strict, Tailwind CSS tokens only (no raw palette classes/hex), Vitest 4 (`dashboard/vitest.config.ts` `component`/`lib` projects) + React Testing Library, Playwright for one end-to-end nav spec (Task 20).

**Depends on:** Phase 0 (`01-phase0-test-infra.md` — `render`/`screen`/`userEvent` from `@/test/render`, `mockFetchJson` from `@/test/fetchMock`, `resetLocalStorage`/`seedLocalStorage` from `@/test/localStorage`), Phase 1 (`00-foundations-contract.md` — `Button`, `Input`, `Select`, `Collapsible`, `PinToggle`, `CenterBar`, `InfoTip`, `Toggle`, `UndoToastProvider`/`useUndoAction`, `lib/format.ts`, `lib/labels.ts`, `lib/storageKeys.ts`). This plan only *consumes* those primitives — it never redefines them.

## Global Constraints

- No raw Tailwind palette colours (`bg-red-500`, `text-blue-400`, etc.) and no new hex literals — use the CSS custom-property tokens (`bg-accent`, `text-pos`/`text-neg`, `border-line`, `var(--green)`/`var(--red)`/`var(--teal)`/`var(--warn)`) already defined in `app/globals.css`.
- No text below 11px for data/numerals, no text below 12px for prose (contract §A.2) — every `text-[10px]`/`text-[9px]` touched by a task in this plan is bumped to `text-[11px]` (data) or `text-[12px]` (prose) as part of that task's diff, not filed as a separate ticket.
- No new hand-rolled collapsible/tooltip/select — consume `Collapsible`/`InfoTip`/`Select` from the contract wherever this plan touches a file that has one (`DiffStrip.tsx`, `SignalGroups.tsx`'s `FilterSelect`/`InfoTip`/`HeaderTip`, `WhyPanel.tsx`'s `InfoTooltip`/votes accordion/`NetBar`, `Header.tsx`'s `InfoTooltip`).
- Every new/changed component ships a co-located test under `__tests__/` per Phase 0 conventions; no test touches `localStorage`/`fetch` directly — always through `resetLocalStorage`/`seedLocalStorage`/`mockFetchJson`.
- Every step that runs commands runs them from `/Users/josephstorey/Market_Analyse/dashboard`.
- This plan never invents a parallel formatter for something `lib/format.ts` already covers (percent, currency, compact-number) and never invents a parallel label map for something `lib/labels.ts` already covers (tier/verdict/combo/greek labels).
- Copy is written in the product's existing honest voice: "consensus, not edge", "context, not a mechanical exit system", "magnitude does not predict returns (r≈0)", "~72% of ±1 moves are noise" — carried over verbatim where the source already says it, and matched in tone for all new copy (`/sources`, `/glossary`, new disclaimer lines).

## File Structure

| File | Status | Purpose |
|---|---|---|
| `dashboard/lib/useTickerData.ts` | New | Single SWR hook: `quote`, `action_card`, `fundamentals` for a ticker (closes TK-18) |
| `dashboard/lib/__tests__/useTickerData.test.ts` | New | Hook unit tests |
| `dashboard/lib/levels.ts` | New | `deriveLevels(bridgeRow, card)` — shared live-vs-bridge level preference logic (closes TK-02, de-dupes `LevelsCard`'s inline logic) |
| `dashboard/lib/__tests__/levels.test.ts` | New | Unit tests for level preference/fallback |
| `dashboard/lib/rotation.ts` | New | `rotationSummary(rows)` extracted from `RotationPanel` (closes TD-13) |
| `dashboard/lib/__tests__/rotation.test.ts` | New | Unit tests |
| `dashboard/lib/sources.ts` | New | `aggregateAccounts(rows)` — server-side account roll-up for `/sources` (closes TK-01) |
| `dashboard/lib/__tests__/sources.test.ts` | New | Unit tests |
| `dashboard/app/page.tsx` | Modified | Date param plumbing (TD-01), single status region (TD-12), rotation summary reuse (TD-13) |
| `dashboard/app/__tests__/page.test.tsx` | New | Server-render smoke test for the date/status changes |
| `dashboard/components/today/DateStepper.tsx` | New | Date navigation control (TD-01) |
| `dashboard/components/today/__tests__/DateStepper.test.tsx` | New | Tests |
| `dashboard/components/today/MorningReport.tsx` | Modified | Skeleton/error/`Collapsible` states, `next/link` chips, 11px floor (TD-09, TD-10) |
| `dashboard/components/today/__tests__/MorningReport.test.tsx` | New | Tests |
| `dashboard/components/today/DiffStrip.tsx` | Modified | Migrate to `Collapsible` (TD-11) |
| `dashboard/components/today/__tests__/DiffStrip.test.tsx` | New | Tests |
| `dashboard/components/today/SignalGroups.tsx` | Modified | Filter feedback (TD-02), row-encoding diet + unified returns + header tooltips (TD-03/04/05/06), disclaimer + "Everything else" copy (TD-07/14), unmount-on-collapse + history cache/prefetch (TD-08), `Select`/`InfoTip` adoption, prev/next session-nav write (TK-15) |
| `dashboard/components/today/__tests__/SignalGroups.test.tsx` | New | Tests |
| `dashboard/components/ui/DataTable.tsx` | Modified | Render gate `everExpandedKeys` → `isExpanded` so collapsed subtrees unmount (TD-08) |
| `dashboard/components/ui/__tests__/DataTable.test.tsx` | New/extended | Test for unmount-on-collapse |
| `dashboard/components/today/RotationPanel.tsx` | Modified | Use extracted `rotationSummary()` (TD-13) |
| `dashboard/app/t/[ticker]/page.tsx` | Modified | Renders `TickerChartSection` instead of inline `CandleChart`, sub-nav anchors (TK-02, TK-03), retry-aware history fetch (TK-16) |
| `dashboard/components/ticker/TickerChartSection.tsx` | New | Client wrapper: live levels via `useTickerData`, sticky sub-nav (TK-02, TK-03) |
| `dashboard/components/ticker/__tests__/TickerChartSection.test.tsx` | New | Tests |
| `dashboard/components/charts/CandleChart.tsx` | Modified | Levels redraw on prop change (TK-02), semantic controls via `CenterBar`/`Toggle` (TK-12), crosshair OHLC readout (TK-13) |
| `dashboard/components/charts/__tests__/CandleChart.test.tsx` | New | Tests |
| `dashboard/components/ticker/Header.tsx` | Modified | Badge-row consolidation + one caveat line, `useTickerData` consumption, `PinToggle` adoption (TK-04) |
| `dashboard/components/ticker/__tests__/Header.test.tsx` | New | Tests |
| `dashboard/components/ticker/WhyPanel.tsx` | Modified | Labelled inflation-gap tip, split agreed/dissented + family-grouped `Collapsible` votes, positional combo decode, `CenterBar`/`InfoTip` adoption, `useTickerData` consumption (TK-05, TK-06, TK-07) |
| `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` | New | Tests |
| `dashboard/components/ticker/LevelsCard.tsx` | Modified | `PriceRail` axis labels, risk-as-%-of-account, `Input` adoption, `deriveLevels`/`useTickerData` consumption (TK-08, TK-09) |
| `dashboard/components/ticker/__tests__/LevelsCard.test.tsx` | New | Tests |
| `dashboard/components/ticker/CatalystsCard.tsx` | Modified | `useTickerData` consumption (TK-18) |
| `dashboard/components/ticker/AiPanel.tsx` | Modified | Regenerate + Copy actions, prose rendering (TK-10) |
| `dashboard/components/ticker/__tests__/AiPanel.test.tsx` | New | Tests |
| `dashboard/components/ticker/OptionsPanel.tsx` | Modified | One caveat line, P/C table heading (TK-11) |
| `dashboard/components/ticker/__tests__/OptionsPanel.test.tsx` | New | Tests |
| `dashboard/components/ticker/ChartInfoStrip.tsx` | Modified | Rewritten on `StatChip` (TK-14) |
| `dashboard/components/ticker/__tests__/ChartInfoStrip.test.tsx` | New | Tests |
| `dashboard/components/ticker/HistoryCard.tsx` | Modified | Expand toggle instead of static "+N older" (TK-17) |
| `dashboard/components/ticker/__tests__/HistoryCard.test.tsx` | New | Tests |
| `dashboard/components/ticker/SentimentCard.tsx` | Modified | `?ticker=` param on account links (TK-01) |
| `dashboard/components/ticker/TickerNav.tsx` | New | `‹ PREV / NEXT ›` + breadcrumb, reads session nav state (TK-15) |
| `dashboard/components/ticker/__tests__/TickerNav.test.tsx` | New | Tests |
| `dashboard/app/sources/page.tsx` | New | `/sources` methodology + live account cross-reference (TK-01) |
| `dashboard/app/sources/SourcesTable.tsx` | New | Client filter-by-ticker table |
| `dashboard/app/sources/__tests__/SourcesTable.test.tsx` | New | Tests |
| `dashboard/app/glossary/page.tsx` | New | Renders all `lib/labels.ts` maps with anchor IDs (roadmap #11, this phase's slice of UI-09/A11Y-01) |
| `dashboard/app/glossary/__tests__/page.test.tsx` | New | Tests |
| `dashboard/e2e/today-to-ticker-nav.spec.ts` | New | Playwright: open a name from Today, prev/next, breadcrumb back |

---

### Task 1: Extract `rotationSummary()` and wire it into the Today teaser link

**Files:**
- Create: `dashboard/lib/rotation.ts`, `dashboard/lib/__tests__/rotation.test.ts`
- Modify: `dashboard/components/today/RotationPanel.tsx`, `dashboard/app/page.tsx`

**Interfaces:**
- Consumes: `RotationRow` (`@/components/today/RotationPanel`, already exported).
- Produces: `rotationSummary(rows: RotationRow[]): string`, exported from `@/lib/rotation`.

**Audit findings closed:** TD-13 — `RotationPanel` already computes `Leading: X, Y · N/M fading` (`components/today/RotationPanel.tsx:152-154`) but `app/page.tsx:132-138` renders the generic `Sector rotation → {n} sectors tracked` instead.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/rotation.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { rotationSummary } from "@/lib/rotation";
  import type { RotationRow } from "@/components/today/RotationPanel";

  function row(overrides: Partial<RotationRow>): RotationRow {
    return {
      industry: "Semiconductors",
      quadrant: "leading",
      rs_ratio: 1.02,
      rs_mom: 1.01,
      breadth: 0.6,
      n: 12,
      r1w: 1.2,
      r1m: 3.4,
      r3m: 8.1,
      rank: 1,
      drank: 0,
      ...overrides,
    };
  }

  describe("rotationSummary", () => {
    it("lists up to two leading industries and a fading count", () => {
      const rows = [
        row({ industry: "Semiconductors", quadrant: "leading", rank: 1 }),
        row({ industry: "Software", quadrant: "leading", rank: 2 }),
        row({ industry: "Banks", quadrant: "leading", rank: 3 }),
        row({ industry: "Retail", quadrant: "weakening", rank: 4 }),
        row({ industry: "Energy", quadrant: "lagging", rank: 5 }),
      ];
      expect(rotationSummary(rows)).toBe(
        "Leading: Semiconductors, Software · 2/5 fading"
      );
    });

    it("says 'Leading: none' when no sector is in the leading quadrant", () => {
      const rows = [row({ industry: "Retail", quadrant: "weakening", rank: 1 })];
      expect(rotationSummary(rows)).toBe("Leading: none · 1/1 fading");
    });

    it("handles an empty rotation list", () => {
      expect(rotationSummary([])).toBe("Leading: none · 0/0 fading");
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/rotation.test.ts --project=lib
  ```
  Expected: fails with `Cannot find module '@/lib/rotation'`.

- [ ] **Step 3: Implement `rotationSummary()`**
  Create `dashboard/lib/rotation.ts`:
  ```ts
  import type { RotationRow } from "@/components/today/RotationPanel";

  /** Same computation RotationPanel.tsx uses for its own Panel subtitle — extracted so
   * the Today-page teaser link can show it too instead of a contentless "N sectors tracked". */
  export function rotationSummary(rows: RotationRow[]): string {
    const sorted = [...rows].sort((a, b) => a.rank - b.rank);
    const fading = rows.filter(
      (r) => r.quadrant === "weakening" || r.quadrant === "lagging"
    ).length;
    const leading = sorted
      .filter((r) => r.quadrant === "leading")
      .slice(0, 2)
      .map((r) => r.industry);
    const leadingText = leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
    return `${leadingText} · ${fading}/${rows.length} fading`;
  }
  ```

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/rotation.test.ts --project=lib
  ```
  Expected: 3 passed.

- [ ] **Step 5: Wire the extraction into both call sites**
  In `dashboard/components/today/RotationPanel.tsx`, replace the inline computation with the import (keeps the Panel subtitle byte-for-byte identical):
  ```tsx
  // add to imports
  import { rotationSummary } from "@/lib/rotation";
  ```
  Replace:
  ```tsx
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const fading = rows.filter(
    (r) => r.quadrant === "weakening" || r.quadrant === "lagging"
  ).length;
  const leading = sorted
    .filter((r) => r.quadrant === "leading")
    .slice(0, 2)
    .map((r) => r.industry);
  const leadingText =
    leading.length > 0 ? `Leading: ${leading.join(", ")}` : "Leading: none";
  const summary = `${leadingText} · ${fading}/${rows.length} fading`;
  ```
  with:
  ```tsx
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const summary = rotationSummary(rows);
  ```
  In `dashboard/app/page.tsx`, add `import { rotationSummary } from "@/lib/rotation";` to the import block, then replace:
  ```tsx
      {rotation && (
        <Link
          href="/rotation"
          className="block rounded-md border border-line bg-elevated px-4 py-2.5 text-[13px] text-muted hover:text-foreground transition-colors"
        >
          Sector rotation → {rotation.length} sectors tracked
        </Link>
      )}
  ```
  with:
  ```tsx
      {rotation && rotation.length > 0 && (
        <Link
          href="/rotation"
          className="block rounded-md border border-line bg-elevated px-4 py-2.5 text-[13px] text-muted hover:text-foreground transition-colors"
        >
          {rotationSummary(rotation)}
        </Link>
      )}
  ```
  Run the full lib + component suites to confirm nothing else broke:
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=lib --project=component
  ```
  Expected: all suites pass, including the new `rotation.test.ts`.

---

### Task 2: Date navigation on Today (`DateStepper`)

**Files:**
- Create: `dashboard/components/today/DateStepper.tsx`, `dashboard/components/today/__tests__/DateStepper.test.tsx`
- Modify: `dashboard/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/signals/dates` (`dashboard/app/api/signals/dates/route.ts`, returns `string[]` via `reportDates()`), `GET /api/signals/by-date?date=YYYY-MM-DD` (`dashboard/app/api/signals/by-date/route.ts`, returns `SignalRow[]` via `byDate(date)`), `groupSignals` (`@/lib/groups`, already handles rows with `report_group` null via `deriveGroup`), `loadYesterdayRows(todayDate?: string)` (`@/lib/diff`, already date-parameterized), `useRouter`/`useSearchParams` (`next/navigation`).
- Produces: `DateStepper` client component — `{ dates: string[]; current: string | null }` props, calls `router.push` with an updated `?date=` query param.

**Audit findings closed:** TD-01 — `app/api/signals/dates` and `app/api/signals/by-date` already exist; Today renders only "now" with no way to ask "what did this look like on Monday?" without the DB.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/DateStepper.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import DateStepper from "@/components/today/DateStepper";

  const push = vi.fn();
  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
  }));

  describe("DateStepper", () => {
    it("shows the current date and disables Next on the latest date", () => {
      render(
        <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-29" />
      );
      expect(screen.getByText("2026-07-29")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    });

    it("navigates to the previous date on click", async () => {
      const user = userEvent.setup();
      render(
        <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-29" />
      );
      await user.click(screen.getByRole("button", { name: "Previous" }));
      expect(push).toHaveBeenCalledWith("/?date=2026-07-28");
    });

    it("returns to the un-parameterised URL when stepping to the latest date", async () => {
      const user = userEvent.setup();
      render(
        <DateStepper dates={["2026-07-27", "2026-07-28", "2026-07-29"]} current="2026-07-28" />
      );
      await user.click(screen.getByRole("button", { name: "Next" }));
      expect(push).toHaveBeenCalledWith("/");
    });

    it("renders nothing when there is only one date on record", () => {
      const { container } = render(<DateStepper dates={["2026-07-29"]} current="2026-07-29" />);
      expect(container).toBeEmptyDOMElement();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/DateStepper.test.tsx --project=component
  ```
  Expected: fails with `Cannot find module '@/components/today/DateStepper'`.

- [ ] **Step 3: Implement `DateStepper`**
  Create `dashboard/components/today/DateStepper.tsx`:
  ```tsx
  "use client";

  import { useRouter } from "next/navigation";
  import { ChevronLeft, ChevronRight } from "lucide-react";

  export interface DateStepperProps {
    /** Distinct report dates, newest last (matches reportDates()'s DESC order reversed by the caller — see Task 5 Step 3). */
    dates: string[];
    /** The date currently being viewed. Null/absent means "latest" (no ?date= param). */
    current: string | null;
  }

  export default function DateStepper({ dates, current }: DateStepperProps) {
    const router = useRouter();
    if (dates.length <= 1) return null;

    const latest = dates[dates.length - 1];
    const activeDate = current ?? latest;
    const idx = dates.indexOf(activeDate);
    const prevDate = idx > 0 ? dates[idx - 1] : null;
    const nextDate = idx >= 0 && idx < dates.length - 1 ? dates[idx + 1] : null;

    function go(date: string | null) {
      if (date === null || date === latest) {
        router.push("/");
      } else {
        router.push(`/?date=${date}`);
      }
    }

    return (
      <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
        <button
          type="button"
          aria-label="Previous"
          disabled={prevDate === null}
          onClick={() => go(prevDate)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40 disabled:cursor-not-allowed hover:border-accent hover:text-accent transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="tabular-nums text-foreground">{activeDate}</span>
        {activeDate !== latest && <span className="text-warn">(viewing history)</span>}
        <button
          type="button"
          aria-label="Next"
          disabled={nextDate === null}
          onClick={() => go(nextDate)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-line disabled:opacity-40 disabled:cursor-not-allowed hover:border-accent hover:text-accent transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/DateStepper.test.tsx --project=component
  ```
  Expected: 4 passed.

- [ ] **Step 5: Wire `DateStepper` into `app/page.tsx`, driven by `?date=`**
  Replace the whole file `dashboard/app/page.tsx` with:
  ```tsx
  import fs from "fs";
  import path from "path";
  import { loadBridgeSignals } from "@/lib/bridge";
  import { groupSignals } from "@/lib/groups";
  import { diffReports, loadYesterdayRows, type DiffRow } from "@/lib/diff";
  import { byDate, reportDates } from "@/lib/signals";
  import { rotationSummary } from "@/lib/rotation";
  import type { BridgeRow, ReportGroup } from "@/types/bridge";
  import DiffStrip from "@/components/today/DiffStrip";
  import SignalGroups from "@/components/today/SignalGroups";
  import DateStepper from "@/components/today/DateStepper";
  import Link from "next/link";
  import { type RotationRow } from "@/components/today/RotationPanel";
  import { MorningReport } from "@/components/today/MorningReport";

  export const dynamic = "force-dynamic";

  function reportsDir(): string {
    return process.env.BRIDGE_DIR ?? path.join(process.cwd(), "..", "reports");
  }

  function loadMeta(): { generated_at: string | null } {
    try {
      const raw = fs.readFileSync(path.join(reportsDir(), "bridge_meta.json"), "utf-8");
      const meta = JSON.parse(raw) as { generated_at?: string };
      return { generated_at: meta.generated_at ?? null };
    } catch {
      return { generated_at: null };
    }
  }

  function loadRotation(): RotationRow[] | null {
    try {
      const raw = fs.readFileSync(path.join(reportsDir(), "rotation_latest.json"), "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data as RotationRow[];
      return null;
    } catch {
      return null;
    }
  }

  function isStale(generatedAt: string | null): boolean {
    if (!generatedAt) return false;
    const t = new Date(generatedAt).getTime();
    if (!Number.isFinite(t)) return true;
    return (Date.now() - t) / 3_600_000 > 24;
  }

  function formatTime(generatedAt: string | null): string {
    if (!generatedAt) return "unknown";
    const d = new Date(generatedAt);
    return d.toLocaleString("en-NZ", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function toDiffRow(row: BridgeRow, group: ReportGroup): DiffRow {
    return {
      ticker: row.ticker.toUpperCase(),
      report_group: group,
      sentiment_score: Number.isFinite(row.sentiment_score) ? row.sentiment_score : 0,
    };
  }

  export default async function Home({
    searchParams,
  }: {
    searchParams: { date?: string };
  }) {
    const requestedDate = searchParams?.date ?? null;

    let dates: string[] = [];
    try {
      // reportDates() is DESC (newest first); DateStepper wants ascending (oldest first).
      dates = reportDates().slice().reverse();
    } catch {
      dates = [];
    }
    const viewingHistory = requestedDate !== null && dates.includes(requestedDate);

    let rows: BridgeRow[] = [];
    if (viewingHistory) {
      try {
        rows = byDate(requestedDate) as unknown as BridgeRow[];
      } catch {
        rows = [];
      }
    } else {
      try {
        rows = loadBridgeSignals();
      } catch {
        rows = [];
      }
    }
    const groups = groupSignals(rows);

    // Build today's diff rows from derived groups (CSV report_group is not the group name).
    const todayDiffRows: DiffRow[] = [];
    (Object.keys(groups) as ReportGroup[]).forEach((g) => {
      for (const row of groups[g]) todayDiffRows.push(toDiffRow(row, g));
    });

    let diffData = {
      newTickers: [] as string[],
      dropped: [] as { ticker: string; group: string }[],
      groupMoves: [] as { ticker: string; from: string; to: string }[],
      sentimentTurns: [] as string[],
    };
    let hasYesterday = false;
    try {
      const yesterday = await loadYesterdayRows(viewingHistory ? requestedDate! : undefined);
      if (yesterday.length > 0) {
        hasYesterday = true;
        const d = diffReports(todayDiffRows, yesterday);
        diffData = {
          newTickers: Array.from(d.newTickers),
          dropped: d.dropped,
          groupMoves: d.groupMoves,
          sentimentTurns: Array.from(d.sentimentTurns),
        };
      }
    } catch {
      hasYesterday = false;
    }

    const meta = loadMeta();
    const stale = !viewingHistory && isStale(meta.generated_at);
    const rotation = viewingHistory ? null : loadRotation();

    const sectors = Array.from(
      new Set(rows.map((r) => r.industry).filter((s): s is string => !!s))
    ).sort();

    return (
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <MorningReport />
        </div>
        <DateStepper dates={dates} current={viewingHistory ? requestedDate : null} />
        {rows.length === 0 && !viewingHistory && (
          <div className="rounded-md border border-warn/50 bg-warn/10 px-4 py-2.5 text-[13px] text-warn">
            No bridge data — run_daily may have failed
          </div>
        )}
        {stale && (
          <div className="rounded-md border border-warn/50 bg-warn/10 px-4 py-2.5 text-[13px] text-warn">
            Bridge data is stale (generated {formatTime(meta.generated_at)}) — run_daily may
            have failed
          </div>
        )}

        {hasYesterday && <DiffStrip diff={diffData} />}

        <SignalGroups groups={groups} newTickers={diffData.newTickers} sectors={sectors} />

        {rotation && rotation.length > 0 && (
          <Link
            href="/rotation"
            className="block rounded-md border border-line bg-elevated px-4 py-2.5 text-[13px] text-muted hover:text-foreground transition-colors"
          >
            {rotationSummary(rotation)}
          </Link>
        )}
      </main>
    );
  }
  ```
  Note: this step also lands the TD-12 groundwork (banner conditions are tightened to `!viewingHistory`) but the full single-status-region rewrite is Task 9 — do not skip Task 9.

  Verify the dev server still boots and the route responds:
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
  ```
  Expected: no new type errors.

---

### Task 3: Today filters can no longer silently empty a group

**Files:**
- Modify: `dashboard/components/today/SignalGroups.tsx`
- Create: `dashboard/components/today/__tests__/SignalGroups.test.tsx`

**Interfaces:**
- Consumes: `Select` (`@/components/ui/Select`), `Input` (`@/components/ui/Input`), `InfoTip` (`@/components/ui/InfoTip`), `Button` (`@/components/ui/Button`) from the contract.
- No new exports — `SignalGroups`'s existing `{ groups, newTickers, sectors }` props are unchanged.

**Audit findings closed:** TD-02 — `GROUP_META.filter(g => sorted[g.key].length > 0)` removes a group whose rows were filtered out, so a persisted `hcOnly` or sector filter silently deletes e.g. ALIGNED from the page with only a small "Clear" text button as a cue.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/SignalGroups.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import SignalGroups from "@/components/today/SignalGroups";
  import type { BridgeRow } from "@/types/bridge";

  vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
  }));

  function row(overrides: Partial<BridgeRow>): BridgeRow {
    return {
      ticker: "NVDA",
      fetch_symbol: "NVDA",
      setup_label: null,
      conviction: "high",
      quality_score: null,
      cluster_overlap: null,
      cluster_confirmed: null,
      cluster_bonus: null,
      source_score: null,
      mentions: 10,
      accounts: 5,
      catalysts: null,
      top_accounts: null,
      ret_1d: 1.2,
      ret_5d: null,
      ret_20d: 3.4,
      ret_126d: null,
      ret_252d: null,
      argus_verdict: null,
      argus_score: null,
      high_conviction: true,
      agreement_pct: 80,
      long_votes: 8,
      short_votes: 1,
      wait_votes: 1,
      entry: null,
      stop: null,
      target: null,
      risk_reward: null,
      is_extended: false,
      entry_quality: null,
      stop_anchor: null,
      sentiment_score: 0.4,
      tech_score: 0.5,
      combined_score: 0.6,
      catalyst_score: null,
      gate_flags: null,
      alignment: null,
      action_label: "PRIME_LONG",
      trade_style: null,
      combo: null,
      ticker_regime: null,
      n_eff: null,
      group1: null,
      group2: null,
      near_aligned: null,
      report_group: "aligned",
      theme: null,
      industry: "Semiconductors",
      next_earnings_date: null,
      earnings_in_days: null,
      extra: null,
      ...overrides,
    } as BridgeRow;
  }

  describe("SignalGroups — filter feedback (TD-02)", () => {
    it("keeps the ALIGNED panel visible and explains a filter emptying it", async () => {
      resetLocalStorage();
      const user = userEvent.setup();
      const groups = {
        aligned: [row({ ticker: "NVDA", high_conviction: false })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);

      await screen.findByText("NVDA");
      await user.click(screen.getByRole("button", { name: /HC only/i }));

      expect(await screen.findByText(/0 shown/)).toBeInTheDocument();
      expect(screen.getByText(/1 hidden by filters/)).toBeInTheDocument();
      expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
    });

    it("renders the plain count when no filter is active", async () => {
      resetLocalStorage();
      const groups = {
        aligned: [row({ ticker: "NVDA" }), row({ ticker: "AVGO" })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      expect(await screen.findByText(/ALIGNED\s+\(2\)/)).toBeInTheDocument();
      expect(screen.queryByText(/hidden by filters/)).not.toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: fails — the ALIGNED panel and "0 shown" text are absent because the group is currently dropped from the DOM entirely.

- [ ] **Step 3: Stop dropping empty groups, and make active filters loud**
  In `dashboard/components/today/SignalGroups.tsx`, replace the imports block:
  ```tsx
  "use client";

  import { useState, useEffect, useMemo } from "react";
  import { useRouter } from "next/navigation";
  import { Search, ChevronDown, X } from "lucide-react";
  import type { BridgeRow } from "@/types/bridge";
  import { tierSort } from "@/lib/groups";
  import DataTable, { Column } from "@/components/ui/DataTable";
  import Panel from "@/components/ui/Panel";
  import { heatBg } from "@/lib/heat";
  import Badge from "@/components/ui/Badge";
  import ConvictionDot from "@/components/ui/ConvictionDot";
  import MicroBar from "@/components/ui/MicroBar";
  import Sparkline from "@/components/ui/Sparkline";
  import Select from "@/components/ui/Select";
  import Input from "@/components/ui/Input";
  import InfoTip from "@/components/ui/InfoTip";
  import Button from "@/components/ui/Button";
  ```
  The file still declares a local `function InfoTip({ text }: { text: string })` (used once more, inside `ExpandedRow`, for the "magnitude does not predict returns (r≈0)" tip) — importing the contract `InfoTip` under the same name collides with it. Rename the local one so the file compiles until Task 4 removes it outright: find `function InfoTip({ text }: { text: string }) {` and rename it (and its single remaining call site, `<InfoTip text="magnitude does not predict returns (r≈0)" />` inside `ExpandedRow`) to `LegacyInfoTip`. `MicroBar`/`Sparkline`/`ChipTooltip`/`HeaderTip` and the now-renamed `LegacyInfoTip` are all addressed by Task 4, not this task — leave those definitions in place for now.

  Delete the local `FilterSelect` function (`components/today/SignalGroups.tsx:217-245` in the pre-Task-3 file) entirely — it is fully superseded by `Select`.

  Replace the filters toolbar JSX:
  ```tsx
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2">
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={active.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search ticker…"
            className="h-8 w-52 rounded border border-line bg-raised pl-8 pr-2.5 text-[13px] text-foreground placeholder-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => update({ hcOnly: !active.hcOnly })}
          className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 text-[12px] font-medium transition-colors ${
            active.hcOnly
              ? "border-accent bg-accent-dim text-accent"
              : "border-line bg-raised text-muted hover:text-foreground"
          }`}
        >
          HC only
          <InfoTip text="consensus, not edge" />
        </button>
        <FilterSelect
          value={active.conviction}
          onChange={(v) => update({ conviction: v })}
          options={[
            ["", "All conviction"],
            ["high", "High"],
            ["med", "Med"],
            ["low", "Low"],
          ]}
        />
        <FilterSelect
          value={active.sector}
          onChange={(v) => update({ sector: v })}
          options={[["", "All sectors"], ...sectors.map((s) => [s, s] as [string, string])]}
        />
        {(active.search || active.hcOnly || active.conviction || active.sector) && (
          <button
            type="button"
            onClick={() =>
              update({ search: "", hcOnly: false, conviction: "", sector: "" })
            }
            className="inline-flex h-8 items-center gap-1 rounded px-2 text-[12px] text-muted hover:text-foreground"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>
  ```
  with:
  ```tsx
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-elevated px-3 py-2">
        <Input
          icon={<Search size={13} />}
          value={active.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search ticker…"
          className="w-52"
        />
        <button
          type="button"
          onClick={() => update({ hcOnly: !active.hcOnly })}
          aria-pressed={active.hcOnly}
          className={`inline-flex h-8 items-center gap-1 rounded border px-2.5 text-[12px] font-medium transition-colors ${
            active.hcOnly
              ? "border-accent bg-accent-dim text-accent"
              : "border-line bg-raised text-muted hover:text-foreground"
          }`}
        >
          HC only
          <InfoTip content="High-conviction — ≥75% indicator agreement. Consensus, not edge." label="What does HC only mean?" />
        </button>
        <Select
          aria-label="Filter by conviction"
          value={active.conviction}
          onChange={(e) => update({ conviction: e.target.value })}
          className="w-32"
          options={[
            { value: "", label: "All conviction" },
            { value: "high", label: "High" },
            { value: "med", label: "Med" },
            { value: "low", label: "Low" },
          ]}
        />
        <Select
          aria-label="Filter by sector"
          value={active.sector}
          onChange={(e) => update({ sector: e.target.value })}
          className="w-40"
          options={[
            { value: "", label: "All sectors" },
            ...sectors.map((s) => ({ value: s, label: s })),
          ]}
        />
        {(active.search || active.hcOnly || active.conviction || active.sector) && (
          <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={() => update({ search: "", hcOnly: false, conviction: "", sector: "" })}>
            Clear filters
          </Button>
        )}
      </div>
  ```

  Replace the group-rendering block (the fix at the heart of TD-02):
  ```tsx
      {GROUP_META.filter((g) => sorted[g.key].length > 0).map((g) => (
        <Panel
          key={g.key}
          title={`${g.title}  (${sorted[g.key].length})`}
          subtitle={g.rationale}
        >
          <GroupTable
            rows={sorted[g.key]}
            newSet={newSet}
            onOpen={onOpen}
            persistKey={`today-${g.key}`}
          />
        </Panel>
      ))}
  ```
  with:
  ```tsx
      {GROUP_META.map((g) => {
        const shown = sorted[g.key].length;
        const total = groups[g.key].length;
        const hidden = total - shown;
        const title =
          hidden > 0
            ? `${g.title}  (${shown} shown · ${hidden} hidden by filters)`
            : `${g.title}  (${shown})`;
        return (
          <Panel key={g.key} title={title} subtitle={g.rationale}>
            <GroupTable
              rows={sorted[g.key]}
              newSet={newSet}
              onOpen={onOpen}
              persistKey={`today-${g.key}`}
            />
          </Panel>
        );
      })}
  ```
  `GroupTable` already renders `<p>none today</p>` when `rows.length === 0` (`components/today/SignalGroups.tsx`'s `GroupTable`, early return), which now doubles as the "0 shown, filtered out" empty state — no change needed there.

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: 2 passed.

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass (the local `FilterSelect` deletion must not leave a dangling reference — `tsc` catches this if Step 3 was incomplete).

---

### Task 4: Row-encoding diet on `SignalGroups.tsx`

**Files:**
- Modify: `dashboard/components/today/SignalGroups.tsx`
- Modify: `dashboard/components/today/__tests__/SignalGroups.test.tsx`

**Interfaces:**
- Consumes: contract `InfoTip` (`@/components/ui/InfoTip`), already imported by Task 3.
- No new exports.

**Audit findings closed:** TD-03 (nine encodings before expansion), TD-04 (flags column appears/disappears — removing it from the main columns entirely eliminates the inconsistency), TD-05 (cryptic headers without tooltips — this task also completes the migration off every remaining hand-rolled tooltip in the file, since the global constraints require `SignalGroups.tsx` to consume `InfoTip` wherever the file is touched), TD-06 (1D/1M heat chips vs. 1W/6M/1Y text triple unified on one `Ret` component).

- [ ] **Step 1: Extend the failing test**
  Append to `dashboard/components/today/__tests__/SignalGroups.test.tsx` (reuse the `row()` helper already defined there):
  ```tsx
  import { mockFetchJson } from "@/test/fetchMock";

  describe("SignalGroups — row-encoding diet (TD-03/04/05/06)", () => {
    it("shows exactly six main columns with no bare cryptic headers", async () => {
      resetLocalStorage();
      mockFetchJson({});
      const groups = {
        aligned: [row({ ticker: "NVDA" })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      await screen.findByText("NVDA");
      const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
      expect(headers).toHaveLength(6);
      expect(screen.queryByRole("columnheader", { name: /^C$/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "⚑" })).not.toBeInTheDocument();
      expect(screen.queryByRole("columnheader", { name: "Cat" })).not.toBeInTheDocument();
    });

    it("gives the Sent · Tech · Fund header a keyboard-reachable tooltip", async () => {
      resetLocalStorage();
      mockFetchJson({});
      const groups = {
        aligned: [row({ ticker: "NVDA" })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      const user = userEvent.setup();
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      await screen.findByText("NVDA");
      await user.click(screen.getByRole("button", { name: /Sent · Tech · Fund/i }));
      expect(await screen.findByText(/all three lit = aligned/)).toBeInTheDocument();
    });

    it("moves conviction, catalyst count and flags into the expanded row, and renders 1W/6M/1Y as Ret chips", async () => {
      resetLocalStorage();
      mockFetchJson({});
      const groups = {
        aligned: [
          row({
            ticker: "NVDA",
            is_extended: true,
            earnings_in_days: 4,
            catalysts: "Guidance raise; Buyback",
            ret_5d: 2.5,
            ret_126d: -1.1,
            ret_252d: 40.2,
          }),
        ],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      const user = userEvent.setup();
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      await screen.findByText("NVDA");
      // Click the sector cell, not the ticker link — the ticker's <Link> calls
      // stopPropagation() so it navigates instead of toggling the row.
      await user.click(screen.getByText("Semiconductors"));
      // conviction, catalyst count and flags are gone from the main row's header set (checked above)
      // and now live under the expanded row's own labels:
      expect(await screen.findByText("Conviction")).toBeInTheDocument();
      expect(screen.getByText("Catalysts")).toBeInTheDocument();
      expect(screen.getByText("Flags")).toBeInTheDocument();
      expect(screen.getByText("+2.5")).toBeInTheDocument();
      expect(screen.getByText("-1.1")).toBeInTheDocument();
      expect(screen.getByText("+40.2")).toBeInTheDocument();
    });
  });
  ```
  Note: `DataTable`'s row-open control is the ticker cell click itself (see Task 6 for the exact expand/prefetch mechanics this task does not touch) — if the existing component instead requires clicking a dedicated expand affordance, adjust the click target to match `DataTable.tsx`'s actual row-open trigger; do not invent a new one.

- [ ] **Step 2: Run the tests and confirm they fail**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: the three new tests fail — the main table still renders 9 columns, `Sent · Tech · Fund` has no reachable button, and the expanded row still shows a `1W/6M/1Y ±x.x/±x.x/±x.x` text triple instead of separate labelled `Ret` chips.

- [ ] **Step 3: Demote conviction/catalyst/flags, add header tooltips, unify period returns**
  In `dashboard/components/today/SignalGroups.tsx`, drop the now-fully-unused tooltip machinery. Delete these three local functions entirely: `ChipTooltip`, `HeaderTip`, and the `LegacyInfoTip` function renamed in Task 3 (all of their call sites are being rewritten below to use the contract `InfoTip`). Also delete `@radix-ui/react-tooltip` and `Info` from the top-of-file imports — nothing in the file uses them once this step is done.

  Replace `RowFlags`:
  ```tsx
  function RowFlags({ ext, earnDays }: { ext: boolean; earnDays: number | null }) {
    const showEarn = earnDays !== null && Number.isFinite(earnDays) && earnDays <= 10;
    if (!ext && !showEarn) return <span className="text-muted">—</span>;
    return (
      <span className="inline-flex items-center gap-1">
        {ext && (
          <span className="rounded border border-line px-1 py-px text-[11px] text-muted">ext</span>
        )}
        {showEarn && (
          <InfoTip
            content={`earnings in ${earnDays}d — inside typical hold window`}
            label={`Earnings in ${earnDays} days`}
          >
            <span className="rounded border border-warn/50 bg-warn/10 px-1 py-px text-[11px] font-medium text-warn">
              E{earnDays}d
            </span>
          </InfoTip>
        )}
      </span>
    );
  }
  ```

  Replace `CatalystCount`:
  ```tsx
  function CatalystCount({ value }: { value: string | null }) {
    const list = splitCatalysts(value);
    if (list.length === 0) return <span className="text-muted">—</span>;
    return (
      <InfoTip
        content={
          <ul className="space-y-0.5">
            {list.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        }
        label={`${list.length} catalysts`}
      >
        <span className="inline-flex cursor-default items-center rounded border border-line px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
          {list.length}
        </span>
      </InfoTip>
    );
  }
  ```

  Replace `columnsFor` (drops `conv`, `flags` and `cat` from the main columns — six columns, not nine — and adds a reachable tooltip to the one header that needs explaining plus the two period-return headers):
  ```tsx
  function columnsFor(newSet: Set<string>): Column<BridgeRow>[] {
    return [
      {
        key: "ticker",
        header: "Ticker",
        render: (r) => <TickerCell row={r} isNew={newSet.has(r.ticker)} />,
      },
      {
        key: "tier",
        header: "Signal",
        render: (r) => <Badge variant="tier" value={r.action_label} />,
      },
      {
        key: "legs",
        header: (
          <span className="inline-flex items-center gap-1">
            Sent · Tech · Fund
            <InfoTip
              content="The three legs of the signal — Sentiment (X chatter), Technical (indicator ensemble), Fundamental (catalyst/valuation). Fuller green bars are stronger; all three lit = aligned."
              label="What is Sent · Tech · Fund?"
            />
          </span>
        ),
        render: (r) => <LegBars s={r.sentiment_score} t={r.tech_score} f={r.catalyst_score} />,
      },
      {
        key: "industry",
        header: "Sector",
        render: (r) => <span className="text-muted">{r.industry || "—"}</span>,
      },
      {
        key: "r1d",
        header: (
          <span className="inline-flex items-center gap-1">
            1D
            <InfoTip content="1-day % price change." label="What is 1D?" />
          </span>
        ),
        align: "right",
        sortable: true,
        sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
        render: (r) => <Ret v={r.ret_1d} />,
      },
      {
        key: "r1m",
        header: (
          <span className="inline-flex items-center gap-1">
            1M
            <InfoTip content="~20 trading-day (~1 month) % price change." label="What is 1M?" />
          </span>
        ),
        align: "right",
        sortable: true,
        sortFn: (a, b) => (a.ret_20d ?? -Infinity) - (b.ret_20d ?? -Infinity),
        render: (r) => <Ret v={r.ret_20d} />,
      },
    ];
  }
  ```

  Simplify `GroupTable` — the `anyFlag`/column-filtering `useMemo` no longer has anything to filter:
  ```tsx
  function GroupTable({
    rows,
    newSet,
    onOpen,
    persistKey,
  }: {
    rows: BridgeRow[];
    newSet: Set<string>;
    onOpen: (r: BridgeRow) => void;
    persistKey: string;
  }) {
    const columns = useMemo(() => columnsFor(newSet), [newSet]);
    if (rows.length === 0) {
      return <p className="px-1 py-2 text-[13px] text-muted">none today</p>;
    }
    return (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.ticker}
        persistKey={persistKey}
        onOpen={onOpen}
        expandedRender={(r) => <ExpandedRow row={r} />}
      />
    );
  }
  ```

  Finally, replace `ExpandedRow` — add the demoted conviction/catalyst/flags line, and swap the `fmtRet` text triple for three labelled `Ret` chips sharing the exact heat-chip component the main row uses (delete the now-unused `fmtRet` function):
  ```tsx
  function ExpandedRow({ row }: { row: BridgeRow }) {
    const [bars, setBars] = useState<number[] | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      let cancelled = false;
      fetch(`/api/argus/history/${row.fetch_symbol || row.ticker}?period=3mo`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          const raw = Array.isArray(data?.bars) ? data.bars : [];
          const closes = raw
            .map((b: { close: number }) => b.close)
            .filter((c: number) => Number.isFinite(c));
          if (closes.length >= 2) setBars(closes);
          else setFailed(true);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return () => {
        cancelled = true;
      };
    }, [row.fetch_symbol, row.ticker]);

    const accts = (row.top_accounts ?? "")
      .split(";")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 3);

    const showEarn =
      row.earnings_in_days !== null &&
      row.earnings_in_days !== undefined &&
      Number.isFinite(row.earnings_in_days) &&
      row.earnings_in_days <= 10;

    return (
      <div className="space-y-1.5 py-3 font-mono text-[13px] text-muted">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            Conviction <ConvictionDot value={row.conviction} />
          </span>
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1">
            Catalysts <CatalystCount value={row.catalysts} />
          </span>
          {(row.is_extended || showEarn) && (
            <>
              <span className="text-muted">·</span>
              <span className="inline-flex items-center gap-1">
                Flags <RowFlags ext={row.is_extended} earnDays={row.earnings_in_days} />
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            E {fmtNum(row.entry)} <span className="text-muted">S</span> {fmtNum(row.stop)}{" "}
            <span className="text-muted">T</span> {fmtNum(row.target)}
          </span>
          <span className="text-muted">·</span>
          <span>R {fmtNum(row.risk_reward, 1)}x (indicative)</span>
          {row.ret_1d != null && isFinite(row.ret_1d) && (
            <>
              <span className="text-muted">·</span>
              <span>
                ~{row.ret_1d >= 0 ? "+" : ""}{row.ret_1d.toFixed(1)}% vs entry (1d)
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1">
            comb {fmtScore(row.combined_score)}{" "}
            <InfoTip content="magnitude does not predict returns (r≈0)" label="What does comb mean?" />
          </span>
          <span className="text-muted">·</span>
          <span>quality {fmtNum(row.quality_score, 1)}</span>
          <span className="text-muted">·</span>
          <span>n_eff {fmtNum(row.n_eff, 1)}</span>
          <span className="text-muted">·</span>
          <span>regime {row.ticker_regime || "—"}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-muted">1W</span>
          <Ret v={row.ret_5d} />
          <span className="text-muted">6M</span>
          <Ret v={row.ret_126d} />
          <span className="text-muted">1Y</span>
          <Ret v={row.ret_252d} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-foreground">
            {failed || (bars && bars.length < 2) ? (
              <span className="text-muted">no chart</span>
            ) : bars ? (
              <Sparkline values={bars} />
            ) : (
              <span className="inline-block h-[32px] w-[120px] animate-pulse rounded bg-elevated" />
            )}
          </span>
          <span>{row.mentions} mentions</span>
          <span className="text-muted">·</span>
          <span>
            {row.accounts} accts{accts.length > 0 ? `: ${accts.join(" ")}` : ""}
          </span>
          {row.next_earnings_date && (
            <>
              <span className="text-muted">·</span>
              <span>earnings {row.next_earnings_date}</span>
            </>
          )}
          <span className="text-muted">·</span>
          <Link
            href={`/t/${row.ticker}`}
            onClick={(e) => e.stopPropagation()}
            className="text-accent hover:underline"
          >
            Open {row.ticker} →
          </Link>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 4: Run the tests and confirm they pass**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: 5 passed (2 from Task 3 + 3 new).

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors (confirms no dangling references to the deleted `ChipTooltip`/`HeaderTip`/`LegacyInfoTip`/`fmtRet`), all component tests pass.

---

### Task 5: Promote buried caveats to a visible line; explain "Everything else"

**Files:**
- Modify: `dashboard/components/today/SignalGroups.tsx`
- Modify: `dashboard/components/today/__tests__/SignalGroups.test.tsx`

**Interfaces:** none new — this task only changes JSX inside the existing `SignalGroups` render tree.

**Audit findings closed:** TD-07 (caveats buried in 13px mono inside tooltips/expanded rows), TD-14 ("Everything else" unexplained and defaulted closed).

- [ ] **Step 1: Extend the failing test**
  Append to `dashboard/components/today/__tests__/SignalGroups.test.tsx`:
  ```tsx
  describe("SignalGroups — visible caveats (TD-07/TD-14)", () => {
    it("shows the honest-voice disclaimer under a group title without requiring a hover", async () => {
      resetLocalStorage();
      mockFetchJson({});
      const groups = {
        aligned: [row({ ticker: "NVDA" })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      expect(
        await screen.findByText(/Score magnitude does not predict returns \(r≈0\)/)
      ).toBeInTheDocument();
    });

    it("explains why a ticker lands in Everything else", async () => {
      resetLocalStorage();
      mockFetchJson({});
      const groups = {
        aligned: [],
        pullback: [],
        tech_fund: [],
        other: [row({ ticker: "XOM" })],
      };
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      expect(
        await screen.findByText(/didn.t clear the bar for ALIGNED/)
      ).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: both new tests fail — no disclaimer text exists yet, and the "Everything else" `Panel` has no `subtitle`.

- [ ] **Step 3: Add the disclaimer line and the "Everything else" rationale**
  In `dashboard/components/today/SignalGroups.tsx`, add a module-level constant near `GROUP_META`:
  ```tsx
  const CAVEAT_LINE =
    "Levels are indicative, not orders. Score magnitude does not predict returns (r≈0). High conviction means consensus, not edge.";
  ```
  In the main `SignalGroups` render, change the `GROUP_META.map(...)` block so the disclaimer renders as the first line inside every group panel's body, above the table:
  ```tsx
      {GROUP_META.map((g) => {
        const shown = sorted[g.key].length;
        const total = groups[g.key].length;
        const hidden = total - shown;
        const title =
          hidden > 0
            ? `${g.title}  (${shown} shown · ${hidden} hidden by filters)`
            : `${g.title}  (${shown})`;
        return (
          <Panel key={g.key} title={title} subtitle={g.rationale}>
            <p className="mb-2 border-b border-line pb-2 text-[12px] text-muted">{CAVEAT_LINE}</p>
            <GroupTable
              rows={sorted[g.key]}
              newSet={newSet}
              onOpen={onOpen}
              persistKey={`today-${g.key}`}
            />
          </Panel>
        );
      })}
  ```
  Give the "Everything else" panel the same disclaimer plus a `subtitle` explaining the bucket:
  ```tsx
      <Panel
        title={`Everything else  (${sorted.other.length})`}
        subtitle="didn't clear the bar for ALIGNED, PULLING BACK or TECHNICAL+FUNDAMENTAL — mixed or partial-agreement signals"
        collapsible
        defaultOpen={false}
        persistKey="today-other"
      >
        <p className="mb-2 border-b border-line pb-2 text-[12px] text-muted">{CAVEAT_LINE}</p>
        <GroupTable
          rows={sorted.other}
          newSet={newSet}
          onOpen={onOpen}
          persistKey="today-other-table"
        />
      </Panel>
  ```

- [ ] **Step 4: Run the tests and confirm they pass**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: 7 passed (5 from Tasks 3–4 + 2 new).

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass.

---

### Task 6: Stop accumulating expanded-row DOM/requests forever; cache history; prefetch on hover

**Files:**
- Modify: `dashboard/components/ui/DataTable.tsx`
- Create: `dashboard/components/ui/__tests__/DataTable.test.tsx`
- Modify: `dashboard/components/today/SignalGroups.tsx`
- Modify: `dashboard/components/today/__tests__/SignalGroups.test.tsx`

**Interfaces:**
- `DataTable`'s props gain one new optional field: `onRowHover?: (row: T) => void`.
- No other exported signatures change.

**Audit findings closed:** TD-08 — `everExpandedKeys` only ever grows (`setEverExpandedKeys((prev) => new Set(prev).add(key))`, never deletes), so every row a user has ever expanded stays mounted (`max-height: 0px` when collapsed) for the rest of the session, and `ExpandedRow`'s `/api/argus/history/{sym}?period=3mo` fetch re-runs from scratch on every single expand with no cache.

- [ ] **Step 1: Write the failing tests**
  Create `dashboard/components/ui/__tests__/DataTable.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from "vitest";
  import { useEffect } from "react";
  import { render, screen, fireEvent } from "@/test/render";
  import DataTable, { Column } from "@/components/ui/DataTable";

  interface Row {
    id: string;
    name: string;
  }

  const columns: Column<Row>[] = [
    { key: "name", header: "Name", render: (r) => r.name },
  ];
  const rows: Row[] = [{ id: "a", name: "Alpha" }];

  function Probe({ onUnmount }: { onUnmount: () => void }) {
    useEffect(() => onUnmount, [onUnmount]);
    return <div>expanded-content</div>;
  }

  describe("DataTable — expanded-row lifecycle (TD-08)", () => {
    it("unmounts the expanded subtree on collapse instead of just hiding it", () => {
      const onUnmount = vi.fn();
      render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          expandedRender={() => <Probe onUnmount={onUnmount} />}
        />
      );
      fireEvent.click(screen.getByText("Alpha")); // expand
      expect(screen.getByText("expanded-content")).toBeInTheDocument();
      expect(onUnmount).not.toHaveBeenCalled();

      fireEvent.click(screen.getByText("Alpha")); // collapse
      expect(screen.queryByText("expanded-content")).not.toBeInTheDocument();
      expect(onUnmount).toHaveBeenCalledTimes(1);
    });

    it("calls onRowHover when the pointer enters a row", () => {
      const onRowHover = vi.fn();
      render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowHover={onRowHover}
        />
      );
      fireEvent.mouseEnter(screen.getByText("Alpha").closest("tr")!);
      expect(onRowHover).toHaveBeenCalledWith(rows[0]);
    });
  });
  ```

  Append to `dashboard/components/today/__tests__/SignalGroups.test.tsx`:
  ```tsx
  describe("SignalGroups — history cache + hover prefetch (TD-08)", () => {
    it("prefetches history on row hover so the fetch has already started by the time the row expands", async () => {
      resetLocalStorage();
      let fetchCount = 0;
      mockFetchJson((url) => {
        if (url.includes("/api/argus/history/")) fetchCount += 1;
        return { bars: [{ close: 10 }, { close: 11 }] };
      });
      const groups = {
        aligned: [row({ ticker: "NVDA" })],
        pullback: [],
        tech_fund: [],
        other: [],
      };
      const user = userEvent.setup();
      render(<SignalGroups groups={groups} newTickers={[]} sectors={["Semiconductors"]} />);
      await screen.findByText("NVDA");
      await user.hover(screen.getByText("Semiconductors"));
      expect(fetchCount).toBe(1);

      await user.click(screen.getByText("Semiconductors"));
      await screen.findByText("Conviction");
      // second call would only happen on a fresh (uncached) fetch — the hover already resolved it
      expect(fetchCount).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run the tests and confirm they fail**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ui/__tests__/DataTable.test.tsx components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: `DataTable`'s tests fail — the expanded subtree stays mounted (`everExpandedKeys` never shrinks) and there is no `onRowHover` prop at all. `SignalGroups`'s new test fails — `fetchCount` is `0` after hover (no prefetch wiring) and becomes `2` after expand (no cache).

- [ ] **Step 3a: Fix `DataTable.tsx`'s render gate and add hover prefetch**
  In `dashboard/components/ui/DataTable.tsx`, add the new prop to the interface:
  ```tsx
  export interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    rowKey: (r: T) => string;
    defaultSort?: { key: string; dir: "asc" | "desc" };
    expandedRender?: (row: T) => React.ReactNode;
    persistKey?: string;
    onOpen?: (row: T) => void;
    onRowHover?: (row: T) => void;
  }
  ```
  Destructure it in the component signature: `export default function DataTable<T>({ columns, rows, rowKey, defaultSort, expandedRender, persistKey, onOpen, onRowHover }: DataTableProps<T>) {`.

  Delete the `everExpandedKeys` state entirely (`const [everExpandedKeys, setEverExpandedKeys] = useState<Set<string>>(new Set());`) and simplify `toggleExpand`:
  ```tsx
  function toggleExpand(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  ```
  Add `onMouseEnter` to the row `<tr>` (the same one carrying `onClick`):
  ```tsx
  <tr
    ref={(el) => {
      if (el) rowRefs.current.set(key, el);
      else rowRefs.current.delete(key);
    }}
    onMouseEnter={() => onRowHover?.(row)}
    onClick={() => {
      setFocusedKey(key);
      if (expandedRender) toggleExpand(key);
      else onOpen?.(row);
    }}
    ...
  ```
  Change the expanded-row render gate from `everExpandedKeys.has(key)` to `isExpanded` and drop the now-pointless collapsed (`maxHeight: 0px`) branch, since the row is no longer kept mounted while collapsed:
  ```tsx
  {expandedRender && isExpanded && (
    <tr>
      <td colSpan={columns.length} className="border-b border-line bg-elevated">
        <div className="px-3">{expandedRender(row)}</div>
      </td>
    </tr>
  )}
  ```
  Note: this trades the old collapse-shrink animation for immediate unmount — the expand-in transition is unaffected since the subtree is freshly mounted either way; TD-08 explicitly asks for "unmount on collapse" over keeping the animation.

- [ ] **Step 3b: Add a page-lifetime history cache and wire hover prefetch in `SignalGroups.tsx`**
  In `dashboard/components/today/SignalGroups.tsx`, add near the top of the file (module scope, outside any component, so it survives re-renders and is shared by every `GroupTable` instance on the page):
  ```tsx
  // ---------- shared history cache (TD-08) ----------
  // Page-lifetime cache keyed by fetch symbol; intentionally not persisted to
  // localStorage — this is request de-duplication, not a user preference.
  type HistoryEntry = number[] | "failed" | "pending";
  const historyCache = new Map<string, HistoryEntry>();

  function fetchHistoryFor(symbol: string): Promise<number[] | "failed"> {
    const cached = historyCache.get(symbol);
    if (cached && cached !== "pending") return Promise.resolve(cached);
    if (cached === "pending") {
      return new Promise((resolve) => {
        const check = () => {
          const c = historyCache.get(symbol);
          if (c === "pending") setTimeout(check, 50);
          else resolve((c ?? "failed") as number[] | "failed");
        };
        check();
      });
    }
    historyCache.set(symbol, "pending");
    return fetch(`/api/argus/history/${symbol}?period=3mo`)
      .then((r) => r.json())
      .then((data) => {
        const raw = Array.isArray(data?.bars) ? data.bars : [];
        const closes = raw
          .map((b: { close: number }) => b.close)
          .filter((c: number) => Number.isFinite(c));
        const result: number[] | "failed" = closes.length >= 2 ? closes : "failed";
        historyCache.set(symbol, result);
        return result;
      })
      .catch(() => {
        historyCache.set(symbol, "failed");
        return "failed" as const;
      });
  }
  ```
  Update `ExpandedRow` to read from and populate the shared cache instead of fetching unconditionally:
  ```tsx
  function ExpandedRow({ row }: { row: BridgeRow }) {
    const symbol = row.fetch_symbol || row.ticker;
    const cached = historyCache.get(symbol);
    const [bars, setBars] = useState<number[] | null>(
      cached && cached !== "pending" && cached !== "failed" ? cached : null
    );
    const [failed, setFailed] = useState(cached === "failed");

    useEffect(() => {
      if (bars !== null || failed) return; // cache hit at mount, or hover-prefetch already resolved it
      let cancelled = false;
      fetchHistoryFor(symbol).then((result) => {
        if (cancelled) return;
        if (result === "failed") setFailed(true);
        else setBars(result);
      });
      return () => {
        cancelled = true;
      };
    }, [symbol, bars, failed]);

    const accts = (row.top_accounts ?? "")
      .split(";")
      .map((a) => a.trim())
      .filter(Boolean)
      .slice(0, 3);
    // ... rest of the function body (E/S/T line, comb/quality/n_eff/regime line,
    // the 1W/6M/1Y Ret line, and the sparkline/mentions/accounts/earnings/Open-link
    // line) is unchanged from Task 4.
  ```
  Wire the prefetch in `GroupTable`, passing `onRowHover` through to `DataTable`:
  ```tsx
  function GroupTable({
    rows,
    newSet,
    onOpen,
    persistKey,
  }: {
    rows: BridgeRow[];
    newSet: Set<string>;
    onOpen: (r: BridgeRow) => void;
    persistKey: string;
  }) {
    const columns = useMemo(() => columnsFor(newSet), [newSet]);
    if (rows.length === 0) {
      return <p className="px-1 py-2 text-[13px] text-muted">none today</p>;
    }
    return (
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.ticker}
        persistKey={persistKey}
        onOpen={onOpen}
        onRowHover={(r) => {
          fetchHistoryFor(r.fetch_symbol || r.ticker);
        }}
        expandedRender={(r) => <ExpandedRow row={r} />}
      />
    );
  }
  ```

- [ ] **Step 4: Run the tests and confirm they pass**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ui/__tests__/DataTable.test.tsx components/today/__tests__/SignalGroups.test.tsx --project=component
  ```
  Expected: 2 passed in `DataTable.test.tsx`, 8 passed in `SignalGroups.test.tsx` (7 from Tasks 3–5 + 1 new).

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass.

---

### Task 7: `MorningReport` gets loading/error/collapse states and honest link semantics

**Files:**
- Modify: `dashboard/components/today/MorningReport.tsx`
- Create: `dashboard/components/today/__tests__/MorningReport.test.tsx`

**Interfaces:**
- Consumes: contract `Collapsible` (`@/components/ui/Collapsible`).
- No exported signature changes — `MorningReport` still takes no props (reads `useMorningReport()` itself).

**Audit findings closed:** TD-09 (`if (!data) return null` — no loading, no error, no fold; the tallest block on a busy day has no collapse) plus the 11px data-floor violations on this component (`text-[10px]` news chips / section labels, `text-[9px]` `SessionTag`) and the `<a href>` chips that bypass Next's router (TD-10 also touches this file's watchlist-news chips).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/MorningReport.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { MorningReport } from "@/components/today/MorningReport";

  const baseReport = {
    date: "2026-07-28",
    weekday: "Tuesday",
    tone: "Cautiously constructive.",
    futures: [],
    today_events: [],
    macro_events: [],
    earnings: [],
    headlines: [],
    day_ahead: {
      synthesis: "Quiet slate.",
      earnings_today: [],
      earnings_tomorrow: [],
      gex_line: null,
      watchlist_news: [{ ticker: "NVDA", headline: "NVDA: guidance raise" }],
    },
  };

  describe("MorningReport — loading/error/collapse (TD-09)", () => {
    it("shows a skeleton while the report is loading, not nothing", () => {
      mockFetchJson(() => new Promise(() => {})); // never resolves
      render(<MorningReport />);
      expect(screen.getByLabelText(/loading morning brief/i)).toBeInTheDocument();
    });

    it("shows an error state instead of silently vanishing when the fetch fails", async () => {
      mockFetchJson(() => {
        throw new Error("500");
      });
      render(<MorningReport />);
      expect(await screen.findByText(/couldn.t load the morning brief/i)).toBeInTheDocument();
    });

    it("renders inside a foldable Collapsible once loaded", async () => {
      mockFetchJson({ "/api/argus/report/morning": baseReport });
      render(<MorningReport />);
      expect(await screen.findByRole("button", { name: /Morning Brief/i })).toBeInTheDocument();
    });

    it("links watchlist-news chips with next/link, not a bare <a>", async () => {
      mockFetchJson({ "/api/argus/report/morning": baseReport });
      render(<MorningReport />);
      const chip = await screen.findByRole("link", { name: /\$NVDA news/i });
      expect(chip).toHaveAttribute("href", "/t/NVDA");
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/MorningReport.test.tsx --project=component
  ```
  Expected: all 4 fail — the component currently renders `null` while loading and on error, and is not wrapped in anything foldable.

- [ ] **Step 3: Add skeleton/error/collapse states, fix the link and the 11px floor**
  In `dashboard/components/today/MorningReport.tsx`, change the import line and the exported function:
  ```tsx
  "use client";

  import Link from "next/link";
  import Collapsible from "@/components/ui/Collapsible";
  import { useMorningReport, plain, type MorningEvent, type DayAheadEarning } from "@/lib/report";
  ```
  Bump the two 11px-floor violations. `SessionTag`'s `text-[9px]` becomes `text-[11px]`:
  ```tsx
  function SessionTag({ session }: { session: "BMO" | "AMC" | "—" }) {
    if (session === "—") return null;
    const cls =
      session === "BMO"
        ? "border-warn/50 text-warn bg-warn/10"
        : "border-accent/50 text-accent bg-accent/10";
    return (
      <span className={`ml-1 rounded border px-1 py-px text-[11px] font-medium ${cls}`}>
        {session}
      </span>
    );
  }
  ```
  The watchlist-news chip moves from `<a href>` to `next/link`'s `<Link>` and its `text-[10px]` becomes `text-[11px]`:
  ```tsx
            <Link
              key={i}
              href={`/t/${n.ticker}`}
              title={n.headline}
              className="text-[11px] font-mono border border-line rounded px-1.5 py-px text-accent hover:bg-elevated"
            >
              ${n.ticker} news
            </Link>
  ```
  The two `text-[10px] uppercase` section labels ("What to expect", "Earnings") become `text-[11px] uppercase`.

  Replace the exported `MorningReport` function to add skeleton/error handling and wrap the existing body in `Collapsible` (`trigger` reproduces the current title row exactly):
  ```tsx
  export function MorningReport() {
    const { data, error, isLoading } = useMorningReport();

    if (isLoading) {
      return (
        <section
          className="mb-5 rounded-md border border-line bg-elevated p-4"
          aria-label="Loading Morning Brief"
        >
          <div className="h-4 w-32 animate-pulse rounded bg-raised mb-3" />
          <div className="h-3 w-full animate-pulse rounded bg-raised mb-2" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
        </section>
      );
    }

    if (error) {
      return (
        <section className="mb-5 rounded-md border border-line bg-elevated p-4">
          <p className="text-[12px] text-muted">
            Couldn't load the morning brief. It refreshes every 5 minutes — try reloading.
          </p>
        </section>
      );
    }

    if (!data) return null;

    return (
      <Collapsible
        className="mb-5 rounded-md border border-line bg-elevated p-4"
        persistKey="morning-report"
        defaultOpen
        trigger={
          <div className="flex flex-1 items-baseline justify-between">
            <h2 className="tick text-[13px] font-semibold text-foreground">Morning Brief</h2>
            <span className="text-[11px] font-mono text-muted">
              {data.weekday} {data.date}
            </span>
          </div>
        }
      >
        {data.day_ahead && data.day_ahead.synthesis !== "Quiet slate." && (
          <p className="text-xs text-foreground leading-relaxed mb-1 font-medium" id="day-ahead">
            {data.day_ahead.synthesis}
          </p>
        )}
        {data.day_ahead?.gex_line && (
          <p className="text-[11px] font-mono text-muted leading-relaxed mb-1">
            {data.day_ahead.gex_line}
          </p>
        )}
        <p className="text-xs text-foreground/90 leading-relaxed mb-2">{plain(data.tone)}</p>
        {data.day_ahead && data.day_ahead.watchlist_news.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {data.day_ahead.watchlist_news.slice(0, 5).map((n, i) => (
              <Link
                key={i}
                href={`/t/${n.ticker}`}
                title={n.headline}
                className="text-[11px] font-mono border border-line rounded px-1.5 py-px text-accent hover:bg-elevated"
              >
                ${n.ticker} news
              </Link>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {data.macro_events.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">What to expect</div>
              <ul className="text-[11px] font-mono text-foreground/80 space-y-0.5">
                {data.macro_events.slice(0, 4).map((e, i) => (
                  <li key={i}>
                    <span className={e.importance === "high" ? "text-warn" : "text-muted"}>•</span> {eventLine(e)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.day_ahead && (data.day_ahead.earnings_today.length > 0 || data.day_ahead.earnings_tomorrow.length > 0) ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">Earnings</div>
              <ul className="text-[11px] font-mono space-y-0.5">
                {data.day_ahead.earnings_today.slice(0, 3).map((e, i) => (
                  <EarningsRow key={`t${i}`} e={e} />
                ))}
                {data.day_ahead.earnings_tomorrow.slice(0, 2).map((e, i) => (
                  <li key={`m${i}`} className="text-muted">
                    tmrw · {e.ticker ?? e.event}
                    <SessionTag session={e.session} />
                  </li>
                ))}
              </ul>
            </div>
          ) : data.earnings.length > 0 ? (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted mb-0.5">Earnings</div>
              <ul className="text-[11px] font-mono text-foreground/80 space-y-0.5">
                {data.earnings.slice(0, 4).map((e, i) => (
                  <li key={i}>{e.date.slice(5)} · {e.ticker ?? e.event}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Collapsible>
    );
  }
  ```
  `SessionTag`, `EarningsRow`, `FutureChip` and `eventLine` are otherwise unchanged.

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/MorningReport.test.tsx --project=component
  ```
  Expected: 4 passed.

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass.

---

### Task 8: Migrate `DiffStrip.tsx` off its hand-rolled collapse to `Collapsible`

**Files:**
- Modify: `dashboard/components/today/DiffStrip.tsx`
- Create: `dashboard/components/today/__tests__/DiffStrip.test.tsx`

**Interfaces:**
- Consumes: contract `Collapsible` (`@/components/ui/Collapsible`).
- `DiffStrip`'s exported `DiffStripData` type and `{ diff }` prop are unchanged.

**Audit findings closed:** TD-11 — `DiffStrip` hand-rolls its own `open`/`hydrated` state, its own `dash:panel:diff` storage key, and a `max-height: 9999px`/`0px` toggle, duplicating (with a different key convention) exactly what `Collapsible` now owns.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/today/__tests__/DiffStrip.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, userEvent } from "@/test/render";
  import { resetLocalStorage, seedLocalStorage } from "@/test/localStorage";
  import DiffStrip, { type DiffStripData } from "@/components/today/DiffStrip";

  const diff: DiffStripData = {
    newTickers: ["NVDA"],
    dropped: [],
    groupMoves: [],
    sentimentTurns: [],
  };

  describe("DiffStrip — Collapsible migration (TD-11)", () => {
    it("toggles open/closed via a real button and persists under the Collapsible key convention", async () => {
      resetLocalStorage();
      const user = userEvent.setup();
      render(<DiffStrip diff={diff} />);
      const trigger = screen.getByRole("button", { name: /Changes since yesterday/i });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(localStorage.getItem("dash:collapsible:diff-strip")).toBe("false");
    });

    it("honors a previously persisted closed state under the new key", () => {
      resetLocalStorage();
      seedLocalStorage("dash:collapsible:diff-strip", "false");
      render(<DiffStrip diff={diff} />);
      expect(screen.getByRole("button", { name: /Changes since yesterday/i })).toHaveAttribute(
        "aria-expanded",
        "false"
      );
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/DiffStrip.test.tsx --project=component
  ```
  Expected: fails — the current component persists under `dash:panel:diff`, not `dash:collapsible:diff-strip`.

- [ ] **Step 3: Replace the hand-rolled toggle with `Collapsible`**
  Rewrite `dashboard/components/today/DiffStrip.tsx`:
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
        className="rounded-lg border border-line bg-surface"
        triggerClassName="px-4 py-3"
        persistKey="diff-strip"
        defaultOpen
        trigger={<span className="font-medium text-[13px]">Changes since yesterday</span>}
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
              <span className="text-muted">(info only — downgrades are not sell signals)</span>
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
  Any other reader of `DiffStrip` (only `app/page.tsx`) needs no change — the prop contract is identical.

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/today/__tests__/DiffStrip.test.tsx --project=component
  ```
  Expected: 2 passed.

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass. (Users who had the strip collapsed under the old `dash:panel:diff` key will see it default open once — an acceptable one-time reset, consistent with how Phase 1's `Collapsible` migration is documented to behave everywhere else.)

---

### Task 9: One severity-ranked status region on Today, not two stackable banners

**Files:**
- Modify: `dashboard/app/page.tsx`
- Create: `dashboard/app/__tests__/page.test.tsx`

**Interfaces:**
- `app/page.tsx` gains one new named export, `statusMessage()`, alongside its default `Home` export (page modules can export additional named helpers; Next.js only treats the default export specially).

**Audit findings closed:** TD-12 — `{rows.length === 0 && !viewingHistory && (...)}` and `{stale && (...)}` are two independently-rendered banners with identical amber styling; if the bridge file both failed to regenerate *and* is stale (the common failure mode — a dead `run_daily` leaves both conditions true), the page stacks two banners that say almost the same thing.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/__tests__/page.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { statusMessage } from "@/app/page";

  describe("statusMessage — single severity-ranked status region (TD-12)", () => {
    it("ranks 'no data' above 'stale' when both are true", () => {
      const status = statusMessage({
        rows: [],
        viewingHistory: false,
        stale: true,
        generatedAt: "2020-01-01T00:00:00Z",
      });
      expect(status).toEqual({
        level: "error",
        text: "No bridge data — run_daily may have failed",
      });
    });

    it("falls back to the stale message when data exists but is old", () => {
      const status = statusMessage({
        rows: [{ ticker: "NVDA" }] as any,
        viewingHistory: false,
        stale: true,
        generatedAt: "2020-01-01T00:00:00Z",
      });
      expect(status?.level).toBe("warn");
      expect(status?.text).toMatch(/stale/);
    });

    it("returns null when neither condition holds, or when browsing history", () => {
      expect(
        statusMessage({ rows: [{ ticker: "NVDA" }] as any, viewingHistory: false, stale: false, generatedAt: null })
      ).toBeNull();
      expect(
        statusMessage({ rows: [], viewingHistory: true, stale: false, generatedAt: null })
      ).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run app/__tests__/page.test.tsx --project=component
  ```
  Expected: fails — `statusMessage` is not exported from `app/page.tsx` yet.

- [ ] **Step 3: Add `statusMessage()` and render one region**
  In `dashboard/app/page.tsx`, add the exported helper near `formatTime`:
  ```tsx
  export type StatusMessage = { level: "error" | "warn"; text: string };

  export function statusMessage({
    rows,
    viewingHistory,
    stale,
    generatedAt,
  }: {
    rows: BridgeRow[];
    viewingHistory: boolean;
    stale: boolean;
    generatedAt: string | null;
  }): StatusMessage | null {
    if (rows.length === 0 && !viewingHistory) {
      return { level: "error", text: "No bridge data — run_daily may have failed" };
    }
    if (stale) {
      return {
        level: "warn",
        text: `Bridge data is stale (generated ${formatTime(generatedAt)}) — run_daily may have failed`,
      };
    }
    return null;
  }
  ```
  Replace the two separate banner blocks in `Home`'s JSX with one:
  ```tsx
        <DateStepper dates={dates} current={viewingHistory ? requestedDate : null} />
        {(() => {
          const status = statusMessage({ rows, viewingHistory, stale, generatedAt: meta.generated_at });
          if (!status) return null;
          const tone =
            status.level === "error"
              ? "border-neg/50 bg-neg/10 text-neg"
              : "border-warn/50 bg-warn/10 text-warn";
          return (
            <div role="status" className={`rounded-md border px-4 py-2.5 text-[13px] ${tone}`}>
              {status.text}
            </div>
          );
        })()}

        {hasYesterday && <DiffStrip diff={diffData} />}
  ```
  (This removes the old `{rows.length === 0 && !viewingHistory && (...)}` and `{stale && (...)}` blocks entirely — `statusMessage()` now owns that ranking decision as a single, independently testable function.)

- [ ] **Step 4: Run the test and confirm it passes**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run app/__tests__/page.test.tsx --project=component
  ```
  Expected: 3 passed.

- [ ] **Step 5: Type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass. This closes out the Today-page half of the plan (Tasks 1–9); Tasks 10 onward move to the Ticker detail page and the two new explanatory routes.

---

### Task 10: One `useTickerData(ticker)` hook instead of four independent SWR fetchers

**Files:**
- Create: `dashboard/lib/useTickerData.ts`, `dashboard/lib/__tests__/useTickerData.test.tsx`
- Modify: `dashboard/types/argus.ts` (add `QuoteData`; add the missing `name` field to `FundamentalsData` — see Step 3)
- Modify: `dashboard/components/ticker/Header.tsx`, `dashboard/components/ticker/LevelsCard.tsx`, `dashboard/components/ticker/WhyPanel.tsx`, `dashboard/components/ticker/CatalystsCard.tsx`

**Interfaces:**
- Produces: `useTickerData(ticker: string): { quote: SWRResponse<QuoteData>; actionCard: SWRResponse<ActionCardData>; fundamentals: SWRResponse<FundamentalsData> }`.
- Consumes: `ActionCardData`/`FundamentalsData` (`@/types/argus`, both already canonical and already used by `WhyPanel.tsx`/`CatalystsCard.tsx` respectively) plus the new `QuoteData` (added to the same file — `Header.tsx` and `LevelsCard.tsx` currently each declare their own divergent local `QuoteData`, one full and one price-only).

**Audit findings closed:** TK-18 — `Header`, `LevelsCard`, `WhyPanel` and `CatalystsCard` each independently call `useSWR` against `/api/argus/quote/{t}`, `/api/argus/action_card/{t}` or `/api/argus/fundamentals/{t}`, each with its own locally-declared response type and its own ad hoc retry config (only `WhyPanel` has the correct scoring-timeout retry-once behavior — `LevelsCard`'s `action_card` fetch doesn't share it).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/useTickerData.test.tsx`:
  ```tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { useTickerData } from "@/lib/useTickerData";

  function Probe({ ticker }: { ticker: string }) {
    const { quote, actionCard, fundamentals } = useTickerData(ticker);
    return (
      <div>
        <span>quote:{quote.data ? quote.data.price : "…"}</span>
        <span>verdict:{actionCard.data ? actionCard.data.verdict : "…"}</span>
        <span>name:{fundamentals.data ? fundamentals.data.name : "…"}</span>
      </div>
    );
  }

  describe("useTickerData (TK-18)", () => {
    it("fetches quote, action_card and fundamentals from one hook", async () => {
      mockFetchJson({
        "/api/argus/quote/NVDA": { symbol: "NVDA", price: 120.5, change: 1.2, change_pct: 1.0 },
        "/api/argus/action_card/NVDA": {
          symbol: "NVDA",
          verdict: "LONG",
          score: 0.6,
          high_conviction: true,
          entry: 118,
          stop: 110,
          target: 135,
          risk_reward: 2.1,
          long_votes: 8,
          short_votes: 1,
          wait_votes: 1,
          agreement_pct: 80,
          ret_1d: null,
          ret_5d: null,
          ret_20d: null,
          is_extended: false,
          entry_quality: "good",
          votes: [],
          agreed: [],
          dissented: [],
          notes: "",
        },
        "/api/argus/fundamentals/NVDA": { symbol: "NVDA", name: "NVIDIA Corp" },
      });
      render(<Probe ticker="NVDA" />);
      expect(await screen.findByText("quote:120.5")).toBeInTheDocument();
      expect(await screen.findByText("verdict:LONG")).toBeInTheDocument();
      expect(await screen.findByText("name:NVIDIA Corp")).toBeInTheDocument();
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/useTickerData.test.tsx --project=component
  ```
  Expected: fails — `@/lib/useTickerData` doesn't exist.

- [ ] **Step 3: Add `QuoteData` to `types/argus.ts` and widen `FundamentalsData`**
  In `dashboard/types/argus.ts`, add (near the other response-shape interfaces):
  ```ts
  export interface QuoteData {
    symbol: string;
    price: number;
    change: number;
    change_pct: number;
  }
  ```
  The existing `FundamentalsData` interface is missing the `name` field that `Header.tsx` already reads at runtime (`/api/argus/fundamentals/{ticker}` does return it — only the type was incomplete). Add it:
  ```ts
  interface FundamentalsData {
    symbol: string;
    name?: string | null;
    pe_ratio?: number | null;
    // ...unchanged
  ```
  Likewise, `ActionCardData` is missing `stop_anchor` — `LevelsCard.tsx` already reads `card.stop_anchor` off the same `/api/argus/action_card/{ticker}` payload today (via its own narrower local `ActionCard` type, which declares it). Add it next to the other optional "extended backend" fields:
  ```ts
  interface ActionCardData {
    // ...unchanged
    stop_anchor?: string | null;
    // ...unchanged (score_ci_lo, score_ci_hi, etc.)
  }
  ```
  Without this, Task 11's `deriveLevels()` (and `LevelsCard.tsx`'s own existing `card.stop_anchor` read, once it's migrated to the canonical type below) would fail to compile.

- [ ] **Step 4: Write `useTickerData.ts` and migrate the four consumers**
  Create `dashboard/lib/useTickerData.ts`:
  ```ts
  "use client";

  import useSWR from "swr";
  import type { ActionCardData, FundamentalsData, QuoteData } from "@/types/argus";

  const fetcher = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    });

  export function useTickerData(ticker: string) {
    const quote = useSWR<QuoteData>(`/api/argus/quote/${ticker}`, fetcher, {
      refreshInterval: 10000,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    });

    // Auto-retry once, but only on a scoring timeout (504) — not a true
    // outage. Keeps last-good data on screen while it retries.
    const actionCard = useSWR<ActionCardData>(`/api/argus/action_card/${ticker}`, fetcher, {
      revalidateOnFocus: false,
      shouldRetryOnError: true,
      errorRetryCount: 1,
      onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
        if ((err as Error)?.message !== "504" || retryCount > 1) return;
        setTimeout(() => revalidate({ retryCount }), 1500);
      },
    });

    const fundamentals = useSWR<FundamentalsData>(`/api/argus/fundamentals/${ticker}`, fetcher, {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

    return { quote, actionCard, fundamentals };
  }
  ```

  In `dashboard/components/ticker/Header.tsx`: delete the local `QuoteData` interface, the local `fetcher`, and the two `useSWR` calls; add `import { useTickerData } from "@/lib/useTickerData";` and replace:
  ```tsx
  const { data: quote } = useSWR<QuoteData>(`/api/argus/quote/${ticker}`, fetcher, {
    refreshInterval: 10000, revalidateOnFocus: true, shouldRetryOnError: false,
  });
  const { data: fundamentals } = useSWR<{ name?: string | null }>(`/api/argus/fundamentals/${ticker}`, fetcher, {
    shouldRetryOnError: false, revalidateOnFocus: false,
  });
  ```
  with:
  ```tsx
  const { quote: quoteRes, fundamentals: fundamentalsRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  const fundamentals = fundamentalsRes.data;
  ```
  `PinButton`'s own `useSWR("/api/watchlist", ...)` call is untouched — it isn't ticker-quote/action_card/fundamentals data, so it's out of scope for this hook. Keep the `swr` import (still needed by `PinButton`).

  In `dashboard/components/ticker/LevelsCard.tsx`: delete the local `QuoteData`/`ActionCard` interfaces and the two `useSWR` calls; add `import { useTickerData } from "@/lib/useTickerData";` and replace with:
  ```tsx
  const { quote: quoteRes, actionCard: cardRes } = useTickerData(ticker);
  const quote = quoteRes.data;
  const card = cardRes.data;
  ```
  Everything downstream in `LevelsCard.tsx` that reads `quote?.price` / `card?.entry` / `card?.stop` / etc. is unchanged (`ActionCardData`'s fields are a superset of the old local `ActionCard`'s).

  In `dashboard/components/ticker/WhyPanel.tsx`: replace the local `useSWR<ActionCardData>(...)` block with:
  ```tsx
  const { actionCard: { data, error, isLoading, isValidating, mutate } } = useTickerData(ticker);
  ```
  (`WhyPanel`'s own retry-on-504 `onErrorRetry` is now baked into the shared hook, so its local copy is deleted — remove the `fetcher` const and the `import useSWR from "swr"` line if nothing else in the file uses `useSWR` directly.)

  In `dashboard/components/ticker/CatalystsCard.tsx`: replace `useSWR<FundamentalsData>(...)` with:
  ```tsx
  const { fundamentals: { data, error, isLoading } } = useTickerData(ticker);
  ```
  (drop the local `fetcher` and `useSWR` import here too, for the same reason.)

- [ ] **Step 5: Run the test, then type-check and run the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/useTickerData.test.tsx --project=component
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: 1 passed, then no type errors and all component tests pass (this is also the point where any remaining `ActionCard`/`QuoteData` narrowing mismatches between the old per-file local types and the canonical ones in `types/argus.ts` would surface — fix any by widening the call site, never by re-narrowing the shared type).

---

### Task 11: One `deriveLevels()` so the chart and the levels card can never disagree (closes TK-02)

**Files**
- `dashboard/lib/levels.ts` (new)
- `dashboard/lib/__tests__/levels.test.ts` (new)
- `dashboard/components/ticker/TickerChartSection.tsx` (new)
- `dashboard/components/charts/__tests__/CandleChart.test.tsx` (new)
- `dashboard/components/charts/CandleChart.tsx` (modify)
- `dashboard/app/t/[ticker]/page.tsx` (modify)

**Interfaces**
```ts
// dashboard/lib/levels.ts
export interface DerivedLevels {
  entry: number | null;
  stop: number | null;
  target: number | null;
  stop_anchor: string | null;
  risk_reward: number | null;
  source: "live" | "bridge";
}
export function deriveLevels(
  bridgeRow: Pick<BridgeRow, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">,
  card: Pick<ActionCardData, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward"> | null | undefined
): DerivedLevels;
export function levelsToChartLevels(d: DerivedLevels): Level[];
```

**Audit findings closed**: TK-02 (`CandleChart` draws entry/stop/target once at mount from the *bridge* row; `LevelsCard` deliberately prefers the live `action_card` row because "bridge rows often carry degenerate placeholders" — confirmed verbatim in `LevelsCard.tsx`'s own comment above its `cardOk` check, `components/ticker/LevelsCard.tsx`. Confirmed `CandleChart.tsx`'s mount effect ends `}, []); // mount only` and its price-line loop sits directly under the comment `// levels are drawn once at mount — static per page load by design`, so the chart never sees `action_card` data at all — only the server-computed `bridgeRow`-derived levels passed once from `app/t/[ticker]/page.tsx`. Card and chart can and do show two different stops).

This task extracts `LevelsCard.tsx`'s existing `cardOk` preference logic (bridge-row fallback, live-card preferred) verbatim into a shared pure function, feeds it to the chart via a new client wrapper so the chart redraws on live data, and fixes `CandleChart` to actually redraw when its `levels` prop changes. `LevelsCard.tsx` itself is switched over to call `deriveLevels()` too in Task 16 (TK-08+09) — this task only has to stop the chart from being wrong; it does not yet touch `LevelsCard.tsx`'s file.

- [ ] **Step 1: Write the failing test for `deriveLevels`/`levelsToChartLevels`**
  ```ts
  // dashboard/lib/__tests__/levels.test.ts
  import { describe, it, expect } from "vitest";
  import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
  import type { BridgeRow } from "@/types/bridge";
  import type { ActionCardData } from "@/types/argus";

  type BridgeLevelFields = Pick<BridgeRow, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;
  type CardLevelFields = Pick<ActionCardData, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;

  const bridgeRow: BridgeLevelFields = {
    entry: 100,
    stop: 95,
    target: 115,
    stop_anchor: "ATR(14) x1.5",
    risk_reward: 3,
  };

  describe("deriveLevels", () => {
    it("falls back to the bridge row when there is no live action_card", () => {
      expect(deriveLevels(bridgeRow, null)).toEqual({
        entry: 100,
        stop: 95,
        target: 115,
        stop_anchor: "ATR(14) x1.5",
        risk_reward: 3,
        source: "bridge",
      });
    });

    it("prefers the live action_card when entry/stop are distinct and finite", () => {
      const card: CardLevelFields = {
        entry: 101.5,
        stop: 96,
        target: 118,
        stop_anchor: "swing low",
        risk_reward: 2.8,
      };
      expect(deriveLevels(bridgeRow, card)).toEqual({
        entry: 101.5,
        stop: 96,
        target: 118,
        stop_anchor: "swing low",
        risk_reward: 2.8,
        source: "live",
      });
    });

    it("ignores a degenerate action_card (entry === stop) and falls back to the bridge row", () => {
      const card: CardLevelFields = { entry: 100, stop: 100, target: 110, stop_anchor: null, risk_reward: null };
      const d = deriveLevels(bridgeRow, card);
      expect(d.source).toBe("bridge");
      expect(d.entry).toBe(100);
      expect(d.stop).toBe(95);
    });

    it("computes risk_reward from entry/stop/target when neither source provides one", () => {
      const row: BridgeLevelFields = { entry: 100, stop: 90, target: 130, stop_anchor: "swing low", risk_reward: null };
      expect(deriveLevels(row, null).risk_reward).toBe(3);
    });
  });

  describe("levelsToChartLevels", () => {
    it("drops null fields and keeps only price/kind pairs, in entry/stop/target order", () => {
      expect(
        levelsToChartLevels({ entry: 100, stop: null, target: 115, stop_anchor: null, risk_reward: null, source: "bridge" })
      ).toEqual([
        { price: 100, kind: "entry" },
        { price: 115, kind: "target" },
      ]);
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/levels.test.ts --project=lib`. Expected: fails with "Cannot find module '@/lib/levels'".

- [ ] **Step 2: Implement `lib/levels.ts`**
  ```ts
  // dashboard/lib/levels.ts
  import type { BridgeRow } from "@/types/bridge";
  import type { ActionCardData } from "@/types/argus";
  import type { Level } from "@/components/charts/CandleChart";

  export interface DerivedLevels {
    entry: number | null;
    stop: number | null;
    target: number | null;
    stop_anchor: string | null;
    risk_reward: number | null;
    source: "live" | "bridge";
  }

  type BridgeLevelFields = Pick<BridgeRow, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;
  type CardLevelFields = Pick<ActionCardData, "entry" | "stop" | "target" | "stop_anchor" | "risk_reward">;

  /**
   * Single source of truth for "what are this ticker's entry/stop/target".
   * Extracted verbatim from LevelsCard.tsx's cardOk logic (TK-02): the nightly
   * bridge row often carries degenerate (entry === stop) placeholders, so a
   * live, valid action_card always wins when one is available.
   */
  export function deriveLevels(
    bridgeRow: BridgeLevelFields,
    card: CardLevelFields | null | undefined
  ): DerivedLevels {
    const cardOk =
      card != null &&
      card.entry != null &&
      card.stop != null &&
      Number.isFinite(card.entry) &&
      Number.isFinite(card.stop) &&
      card.entry !== card.stop;

    const entry = cardOk ? (card!.entry as number) : bridgeRow.entry;
    const stop = cardOk ? (card!.stop as number) : bridgeRow.stop;
    const target = cardOk ? card!.target ?? bridgeRow.target : bridgeRow.target;
    const stop_anchor = (cardOk ? card!.stop_anchor : null) ?? bridgeRow.stop_anchor ?? null;
    const risk_reward =
      (cardOk ? card!.risk_reward : bridgeRow.risk_reward) ??
      (entry != null && stop != null && target != null && entry !== stop
        ? (target - entry) / (entry - stop)
        : null);

    return { entry, stop, target, stop_anchor, risk_reward, source: cardOk ? "live" : "bridge" };
  }

  export function levelsToChartLevels(d: DerivedLevels): Level[] {
    const out: Level[] = [];
    if (d.entry != null && Number.isFinite(d.entry)) out.push({ price: d.entry, kind: "entry" });
    if (d.stop != null && Number.isFinite(d.stop)) out.push({ price: d.stop, kind: "stop" });
    if (d.target != null && Number.isFinite(d.target)) out.push({ price: d.target, kind: "target" });
    return out;
  }
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/levels.test.ts --project=lib`. Expected: 5 passed.

- [ ] **Step 3: Write the failing test for `CandleChart`'s price-line redraw**
  `lightweight-charts` is dynamically imported inside `CandleChart`, so the test mocks the module (both static and dynamic `import()` are intercepted by `vi.mock`) with fakes narrow enough to assert only what TK-02 cares about: how many times `createPriceLine`/`removePriceLine` are called.
  ```tsx
  // dashboard/components/charts/__tests__/CandleChart.test.tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { render, waitFor } from "@/test/render";
  import CandleChart, { type Level, type Bar } from "@/components/charts/CandleChart";

  const createPriceLine = vi.fn(() => ({}));
  const removePriceLine = vi.fn();
  const candleSeries = {
    setData: vi.fn(),
    setMarkers: vi.fn(),
    createPriceLine,
    removePriceLine,
    applyOptions: vi.fn(),
  };
  const fakeSubSeries = () => ({ setData: vi.fn(), applyOptions: vi.fn() });
  const fakeScale = () => ({ applyOptions: vi.fn(), setVisibleRange: vi.fn(), fitContent: vi.fn() });
  const fakeChart = {
    addCandlestickSeries: vi.fn(() => candleSeries),
    addHistogramSeries: vi.fn(() => fakeSubSeries()),
    addLineSeries: vi.fn(() => fakeSubSeries()),
    priceScale: vi.fn(() => fakeScale()),
    timeScale: vi.fn(() => fakeScale()),
    applyOptions: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
  };

  vi.mock("lightweight-charts", () => ({
    createChart: vi.fn(() => fakeChart),
    ColorType: { Solid: "solid" },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  }));

  const bars: Bar[] = [
    { ts: "2026-06-01", open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
    { ts: "2026-06-02", open: 10.5, high: 11.5, low: 10, close: 11, volume: 1200 },
  ];

  beforeEach(() => {
    createPriceLine.mockClear();
    removePriceLine.mockClear();
  });

  describe("CandleChart price lines (TK-02)", () => {
    it("draws one price line per level on mount", async () => {
      const levels: Level[] = [
        { price: 10, kind: "entry" },
        { price: 9, kind: "stop" },
      ];
      render(<CandleChart ticker="NVDA" initialBars={bars} levels={levels} />);
      await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(2));
    });

    it("removes stale price lines and redraws when the levels prop changes", async () => {
      const { rerender } = render(
        <CandleChart ticker="NVDA" initialBars={bars} levels={[{ price: 10, kind: "entry" }]} />
      );
      await waitFor(() => expect(createPriceLine).toHaveBeenCalledTimes(1));

      rerender(<CandleChart ticker="NVDA" initialBars={bars} levels={[{ price: 12, kind: "stop" }]} />);
      await waitFor(() => expect(removePriceLine).toHaveBeenCalledTimes(1));
      expect(createPriceLine).toHaveBeenCalledTimes(2);
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/charts/__tests__/CandleChart.test.tsx --project=component`. Expected: 1st test passes (mount already draws once), 2nd test fails — `removePriceLine` is never called because the price-line loop only runs inside the `[]`-deps mount effect.

- [ ] **Step 4: Fix `CandleChart.tsx` to redraw price lines on `levels` change; add `TickerChartSection.tsx`; wire it into the ticker page**
  In `dashboard/components/charts/CandleChart.tsx`:
  1. Add `IPriceLine` to the type import: `import type { IChartApi, ISeriesApi, IPriceLine, UTCTimestamp } from "lightweight-charts";`.
  2. Add a ref next to the other series refs: `const priceLinesRef = useRef<IPriceLine[]>([]);` and `const levelsRef = useRef<Level[]>(levels);`.
  3. Add a stable helper, defined alongside `applyData`:
     ```tsx
     const syncPriceLines = useCallback((series: ISeriesApi<"Candlestick">, lvls: Level[]) => {
       for (const pl of priceLinesRef.current) {
         series.removePriceLine(pl);
       }
       priceLinesRef.current = lvls.map((l) =>
         series.createPriceLine({
           price: l.price,
           lineWidth: 1,
           axisLabelVisible: true,
           ...LEVEL_STYLE[l.kind],
           lineStyle: LEVEL_STYLE[l.kind].lineStyle as 0 | 1 | 2 | 3 | 4,
         })
       );
     }, []);
     ```
  4. In the mount effect, replace:
     ```tsx
     // levels are drawn once at mount — static per page load by design
     for (const l of levels) {
       candleSeries.createPriceLine({
         price: l.price,
         lineWidth: 1,
         axisLabelVisible: true,
         ...LEVEL_STYLE[l.kind],
         lineStyle: LEVEL_STYLE[l.kind].lineStyle as 0 | 1 | 2 | 3 | 4,
       });
     }
     ```
     with:
     ```tsx
     // initial draw only — the levels-update effect below keeps these in sync
     // with the `levels` prop as live action_card data arrives (TK-02)
     syncPriceLines(candleSeries, levelsRef.current);
     ```
  5. After the existing "Data update effect" block (`}, [initialBars, applyData]);`), add a new effect:
     ```tsx
     // Levels update effect — covers "levels changed after chart was ready".
     // Price lines used to be drawn once at mount from a stale prop and never
     // redrawn (TK-02: card and chart could show two different stops).
     useEffect(() => {
       levelsRef.current = levels;
       if (seriesRef.current) {
         syncPriceLines(seriesRef.current, levels);
       }
       // chart not ready yet → syncPriceLines runs inside the mount effect's .then() above
     }, [levels, syncPriceLines]);
     ```

  Create `dashboard/components/ticker/TickerChartSection.tsx`:
  ```tsx
  "use client";

  import { useMemo } from "react";
  import CandleChart, { type Bar, type Marker } from "@/components/charts/CandleChart";
  import { useTickerData } from "@/lib/useTickerData";
  import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
  import type { BridgeRow } from "@/types/bridge";

  interface TickerChartSectionProps {
    ticker: string;
    bridgeRow: BridgeRow | null;
    initialBars: Bar[];
    markers: Marker[];
    height?: number;
    className?: string;
  }

  export default function TickerChartSection({
    ticker,
    bridgeRow,
    initialBars,
    markers,
    height = 420,
    className,
  }: TickerChartSectionProps) {
    const { actionCard } = useTickerData(ticker);

    const levels = useMemo(
      () => (bridgeRow ? levelsToChartLevels(deriveLevels(bridgeRow, actionCard.data)) : []),
      [bridgeRow, actionCard.data]
    );

    return (
      <CandleChart
        ticker={ticker}
        initialBars={initialBars}
        initialPeriod="6M"
        levels={levels}
        markers={markers}
        height={height}
        className={className}
      />
    );
  }
  ```

  In `dashboard/app/t/[ticker]/page.tsx`: delete the server-side `levels` array construction (the three `if (Number.isFinite(bridgeRow.entry)) levels.push({ price: bridgeRow.entry, kind: "entry" })`-shaped statements — `deriveLevels` now owns that decision, reactively, client-side) and the now-unused `Level` import from the `CandleChart` import line. Replace:
  ```tsx
  <CandleChart
    ticker={ticker}
    initialBars={bars}
    initialPeriod="6M"
    levels={levels}
    markers={markers}
    height={420}
    className="min-h-[420px] 2xl:min-h-[560px]"
  />
  ```
  with:
  ```tsx
  <TickerChartSection
    ticker={ticker}
    bridgeRow={bridgeRow}
    initialBars={bars}
    markers={markers}
    height={420}
    className="min-h-[420px] 2xl:min-h-[560px]"
  />
  ```
  and add `import TickerChartSection from "@/components/ticker/TickerChartSection";` alongside the other `@/components/ticker/*` imports.

- [ ] **Step 5: Run both suites, then type-check**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/levels.test.ts --project=lib
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/charts/__tests__/CandleChart.test.tsx --project=component
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
  ```
  Expected: 5 passed, 2 passed, no type errors. The chart now redraws its price lines every time `useTickerData`'s `action_card` fetch resolves with a valid live entry/stop, so it can never again show a stop the levels card disagrees with.

---

### Task 12: Build `/sources` for real — every account chip is currently a 404 (closes TK-01)

**Files**
- `dashboard/lib/sources.ts` (new)
- `dashboard/lib/__tests__/sources.test.ts` (new)
- `dashboard/components/sources/SourcesTable.tsx` (new)
- `dashboard/components/sources/__tests__/SourcesTable.test.tsx` (new)
- `dashboard/app/sources/page.tsx` (new)
- `dashboard/components/ticker/SentimentCard.tsx` (modify)

**Interfaces**
```ts
// dashboard/lib/sources.ts
export function splitAccounts(value: string | null): string[];
export interface AccountAgg { handle: string; tickerCount: number; tickers: string[] }
export function aggregateAccounts(rows: BridgeRow[]): AccountAgg[];
```
```tsx
// dashboard/components/sources/SourcesTable.tsx
interface SourcesTableProps { rows: BridgeRow[]; initialTicker: string }
```

**Audit findings closed**: TK-01 (confirmed verbatim in `components/ticker/SentimentCard.tsx`: every account chip renders `<Link href="/sources">` — a bare, param-less link — and `app/sources/` does not exist anywhere under `dashboard/app/`, confirmed via directory listing. Worse than the audit's summary implies: the link isn't even ticker-scoped, so even a stub `/sources` page would land the user with no context about which ticker they came from).

There is no cross-ticker account leaderboard anywhere in this stack — `BridgeRow.top_accounts` is a semicolon-delimited string of handles *per ticker*, produced fresh each day by `loadBridgeSignals()`. That is the only real, evidence-based data available to this page. The page is built honestly around what that data actually supports (which accounts flagged which tickers today, and how many tickers each account touched today) rather than pretending to a win-rate/track-record leaderboard that does not exist. That gap is stated on the page itself, not hidden.

- [ ] **Step 1: Write the failing test for `lib/sources.ts`**
  ```ts
  // dashboard/lib/__tests__/sources.test.ts
  import { describe, it, expect } from "vitest";
  import { splitAccounts, aggregateAccounts } from "@/lib/sources";
  import type { BridgeRow } from "@/types/bridge";

  function row(overrides: Partial<BridgeRow> = {}): BridgeRow {
    return { ticker: "NVDA", top_accounts: "@alpha; @beta", ...overrides } as BridgeRow;
  }

  describe("splitAccounts", () => {
    it("splits on ';', trims, and drops empties", () => {
      expect(splitAccounts(" @alpha ; @beta ;; ")).toEqual(["@alpha", "@beta"]);
    });
    it("returns [] for null", () => {
      expect(splitAccounts(null)).toEqual([]);
    });
  });

  describe("aggregateAccounts", () => {
    it("counts each account once per distinct ticker, sorted by breadth desc then handle", () => {
      const rows = [
        row({ ticker: "NVDA", top_accounts: "@alpha; @beta" }),
        row({ ticker: "AMD", top_accounts: "@alpha" }),
        row({ ticker: "MSFT", top_accounts: "@beta; @gamma" }),
      ];
      expect(aggregateAccounts(rows)).toEqual([
        { handle: "@alpha", tickerCount: 2, tickers: ["AMD", "NVDA"] },
        { handle: "@beta", tickerCount: 2, tickers: ["MSFT", "NVDA"] },
        { handle: "@gamma", tickerCount: 1, tickers: ["MSFT"] },
      ]);
    });

    it("does not double-count an account mentioned twice for the same ticker", () => {
      const rows = [row({ ticker: "NVDA", top_accounts: "@alpha; @alpha" })];
      expect(aggregateAccounts(rows)).toEqual([{ handle: "@alpha", tickerCount: 1, tickers: ["NVDA"] }]);
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/sources.test.ts --project=lib`. Expected: fails, `@/lib/sources` not found.

- [ ] **Step 2: Implement `lib/sources.ts`**
  ```ts
  // dashboard/lib/sources.ts
  import type { BridgeRow } from "@/types/bridge";

  export function splitAccounts(value: string | null): string[] {
    if (!value) return [];
    return value
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  export interface AccountAgg {
    handle: string;
    tickerCount: number;
    tickers: string[];
  }

  /**
   * Cross-ticker rollup of BridgeRow.top_accounts. This is breadth-today
   * (how many tickers an account was attached to), not a track record —
   * no win-rate/follow-quality signal exists in this dataset (TK-01).
   */
  export function aggregateAccounts(rows: BridgeRow[]): AccountAgg[] {
    const byHandle = new Map<string, Set<string>>();
    for (const row of rows) {
      for (const handle of splitAccounts(row.top_accounts)) {
        if (!byHandle.has(handle)) byHandle.set(handle, new Set());
        byHandle.get(handle)!.add(row.ticker.toUpperCase());
      }
    }
    return Array.from(byHandle.entries())
      .map(([handle, tickers]) => ({
        handle,
        tickerCount: tickers.size,
        tickers: Array.from(tickers).sort(),
      }))
      .sort((a, b) => b.tickerCount - a.tickerCount || a.handle.localeCompare(b.handle));
  }
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/sources.test.ts --project=lib`. Expected: 4 passed.

- [ ] **Step 3: Write the failing test for `SourcesTable`**
  ```tsx
  // dashboard/components/sources/__tests__/SourcesTable.test.tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, fireEvent } from "@/test/render";
  import SourcesTable from "@/components/sources/SourcesTable";
  import type { BridgeRow } from "@/types/bridge";

  function row(overrides: Partial<BridgeRow> = {}): BridgeRow {
    return {
      ticker: "NVDA",
      fetch_symbol: "NVDA",
      mentions: 12,
      accounts: 3,
      source_score: 0.71,
      top_accounts: "@alpha; @beta",
      ...overrides,
    } as BridgeRow;
  }

  const rows = [
    row(),
    row({ ticker: "AMD", fetch_symbol: "AMD", mentions: 4, accounts: 1, source_score: 0.2, top_accounts: "@alpha" }),
  ];

  describe("SourcesTable", () => {
    it("shows every ticker by default", () => {
      render(<SourcesTable rows={rows} initialTicker="" />);
      expect(screen.getByText("NVDA")).toBeInTheDocument();
      expect(screen.getByText("AMD")).toBeInTheDocument();
    });

    it("seeding initialTicker (from ?ticker=) narrows both tables", () => {
      render(<SourcesTable rows={rows} initialTicker="NVDA" />);
      expect(screen.getByText("NVDA")).toBeInTheDocument();
      expect(screen.queryByText("AMD")).not.toBeInTheDocument();
      expect(screen.getByText("@alpha")).toBeInTheDocument();
      expect(screen.getByText("@beta")).toBeInTheDocument();
    });

    it("typing into the filter narrows the tickers table", () => {
      render(<SourcesTable rows={rows} initialTicker="" />);
      const input = screen.getByPlaceholderText(/filter by ticker or account/i);
      fireEvent.change(input, { target: { value: "amd" } });
      expect(screen.getByText("AMD")).toBeInTheDocument();
      expect(screen.queryByText("NVDA")).not.toBeInTheDocument();
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/sources/__tests__/SourcesTable.test.tsx --project=component`. Expected: fails, `@/components/sources/SourcesTable` not found.

- [ ] **Step 4: Implement `SourcesTable.tsx`, `app/sources/page.tsx`; fix `SentimentCard.tsx`'s link**
  ```tsx
  // dashboard/components/sources/SourcesTable.tsx
  "use client";

  import { useMemo, useState } from "react";
  import Link from "next/link";
  import DataTable, { type Column } from "@/components/ui/DataTable";
  import { Input } from "@/components/ui/Input";
  import { aggregateAccounts, splitAccounts, type AccountAgg } from "@/lib/sources";
  import type { BridgeRow } from "@/types/bridge";

  interface SourcesTableProps {
    rows: BridgeRow[];
    initialTicker: string;
  }

  export default function SourcesTable({ rows, initialTicker }: SourcesTableProps) {
    const [filter, setFilter] = useState(initialTicker);
    const needle = filter.trim().toUpperCase();

    const tickerRows = useMemo(
      () =>
        needle === ""
          ? rows
          : rows.filter(
              (r) =>
                r.ticker.toUpperCase().includes(needle) ||
                (r.top_accounts ?? "").toUpperCase().includes(needle)
            ),
      [rows, needle]
    );

    const accountRows = useMemo(() => {
      const all = aggregateAccounts(rows);
      if (needle === "") return all;
      return all.filter(
        (a) =>
          a.handle.toUpperCase().includes(needle) ||
          a.tickers.some((t) => t.includes(needle))
      );
    }, [rows, needle]);

    const tickerColumns: Column<BridgeRow>[] = [
      { key: "ticker", header: "Ticker", render: (r) => <Link href={`/t/${r.ticker}`} className="text-accent hover:underline">{r.ticker}</Link> },
      { key: "mentions", header: "Mentions", align: "right", sortable: true, sortFn: (a, b) => a.mentions - b.mentions, render: (r) => r.mentions },
      { key: "accounts", header: "Accounts", align: "right", sortable: true, sortFn: (a, b) => a.accounts - b.accounts, render: (r) => r.accounts },
      { key: "source_score", header: "Source score", align: "right", sortable: true, sortFn: (a, b) => a.source_score - b.source_score, render: (r) => r.source_score.toFixed(2) },
      {
        key: "top_accounts",
        header: "Top accounts",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {splitAccounts(r.top_accounts).map((h) => (
              <span key={h} className="rounded border border-line bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {h}
              </span>
            ))}
          </div>
        ),
      },
    ];

    const accountColumns: Column<AccountAgg>[] = [
      { key: "handle", header: "Account", render: (a) => <span className="font-mono text-[12px]">{a.handle}</span> },
      { key: "tickerCount", header: "Tickers today", align: "right", sortable: true, sortFn: (a, b) => a.tickerCount - b.tickerCount, render: (a) => a.tickerCount },
      {
        key: "tickers",
        header: "Which tickers",
        render: (a) => (
          <div className="flex flex-wrap gap-1">
            {a.tickers.map((t) => (
              <Link key={t} href={`/t/${t}`} className="text-[11px] text-muted hover:text-accent">
                {t}
              </Link>
            ))}
          </div>
        ),
      },
    ];

    return (
      <div className="space-y-6">
        <Input
          placeholder="Filter by ticker or account"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />

        <section>
          <h2 className="mb-2 text-[13px] font-medium text-muted">Today's tickers ({tickerRows.length})</h2>
          <DataTable
            columns={tickerColumns}
            rows={tickerRows}
            rowKey={(r) => r.ticker}
            defaultSort={{ key: "source_score", dir: "desc" }}
            persistKey="sources-tickers"
          />
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-medium text-muted">Today's accounts ({accountRows.length})</h2>
          <DataTable
            columns={accountColumns}
            rows={accountRows}
            rowKey={(a) => a.handle}
            defaultSort={{ key: "tickerCount", dir: "desc" }}
            persistKey="sources-accounts"
          />
        </section>
      </div>
    );
  }
  ```
  ```tsx
  // dashboard/app/sources/page.tsx
  import { loadBridgeSignals } from "@/lib/bridge";
  import SourcesTable from "@/components/sources/SourcesTable";
  import type { BridgeRow } from "@/types/bridge";

  export const dynamic = "force-dynamic";

  export default function SourcesPage({
    searchParams,
  }: {
    searchParams: { ticker?: string };
  }) {
    let rows: BridgeRow[] = [];
    try {
      rows = loadBridgeSignals();
    } catch {
      rows = [];
    }

    return (
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div className="space-y-3">
          <h1 className="text-[18px] font-semibold">Sources</h1>
          <p className="text-[13px] text-muted">
            Chatter is pulled from X/Twitter accounts tracked by a companion process, then
            cross-referenced against a ~70-agent technical ensemble before a ticker reaches the
            Today page — sentiment alone never promotes anything. "Source score" reflects how
            concentrated today's mentions were for a ticker; "mentions" and "accounts" are raw
            counts, not weighted by follower count or historical accuracy.
          </p>
          <p className="rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-[12px] text-warn">
            What this page can't show: there is no calibrated win-rate or follow-quality score
            per account — that data doesn't exist yet. "Tickers today" counts how many tickers an
            account was attached to in today's report, nothing more. Treat an account chip as
            "who flagged this," not "who to trust."
          </p>
        </div>
        <SourcesTable rows={rows} initialTicker={(searchParams.ticker ?? "").toUpperCase()} />
      </main>
    );
  }
  ```
  In `dashboard/components/ticker/SentimentCard.tsx`: delete the local `splitAccounts` function, replace with `import { splitAccounts } from "@/lib/sources";`, and change the chip's `href="/sources"` to `href={`/sources?ticker=${bridgeRow.ticker.toUpperCase()}`}`.

- [ ] **Step 5: Run both suites and type-check**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/sources.test.ts --project=lib
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/sources/__tests__/SourcesTable.test.tsx --project=component
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
  ```
  Expected: 4 passed, 3 passed, no type errors. Manually verify: `npm run dev`, visit `/t/NVDA`, click an account chip in the Sentiment panel, confirm it lands on `/sources?ticker=NVDA` with both tables pre-filtered instead of a blank/404 page.

---

### Task 13: Sticky sub-nav across the seven ticker panels; fix narrow-width ordering (closes TK-03)

**Files**
- `dashboard/components/ticker/TickerSubNav.tsx` (new)
- `dashboard/components/ticker/__tests__/TickerSubNav.test.tsx` (new)
- `dashboard/app/t/[ticker]/page.tsx` (modify)

**Interfaces**
```tsx
export const TICKER_SECTIONS: readonly { id: string; label: string }[];
export default function TickerSubNav(): JSX.Element;
```

**Audit findings closed**: TK-03 (confirmed in `app/t/[ticker]/page.tsx`: the right column renders exactly `LevelsCard → WhyPanel → CatalystsCard → NewsCard → SentimentCard → HistoryCard → AiPanel`, seven independently-collapsible panels with no shared navigation; the outer grid is `grid-cols-[62fr_38fr] gap-4 max-[1100px]:grid-cols-1`, and because the chart/options column is first in DOM order, below 1100px it renders above all seven analysis panels with no way to jump past it).

- [ ] **Step 1: Write the failing test for `TickerSubNav`**
  ```tsx
  // dashboard/components/ticker/__tests__/TickerSubNav.test.tsx
  import { describe, it, expect, beforeEach } from "vitest";
  import { render, screen } from "@/test/render";
  import TickerSubNav, { TICKER_SECTIONS } from "@/components/ticker/TickerSubNav";

  let ioCallback: IntersectionObserverCallback | null = null;
  class FakeIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      ioCallback = cb;
    }
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  beforeEach(() => {
    ioCallback = null;
    // @ts-expect-error - test shim, jsdom has no real IntersectionObserver
    global.IntersectionObserver = FakeIntersectionObserver;
  });

  describe("TickerSubNav", () => {
    it("renders one anchor per section, in order, with matching hrefs", () => {
      render(<TickerSubNav />);
      const links = screen.getAllByRole("link");
      expect(links.map((l) => l.getAttribute("href"))).toEqual(
        TICKER_SECTIONS.map((s) => `#${s.id}`)
      );
      expect(links.map((l) => l.textContent)).toEqual(TICKER_SECTIONS.map((s) => s.label));
    });

    it("marks the intersecting section's link aria-current", () => {
      render(<TickerSubNav />);
      expect(ioCallback).not.toBeNull();
      ioCallback!(
        [{ target: { id: "catalysts" }, isIntersecting: true } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
      expect(screen.getByRole("link", { name: "Catalysts" })).toHaveAttribute("aria-current", "true");
      expect(screen.getByRole("link", { name: "Levels" })).not.toHaveAttribute("aria-current");
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/TickerSubNav.test.tsx --project=component`. Expected: fails, `@/components/ticker/TickerSubNav` not found.

- [ ] **Step 2: Implement `TickerSubNav.tsx`**
  ```tsx
  // dashboard/components/ticker/TickerSubNav.tsx
  "use client";

  import { useEffect, useState } from "react";

  export const TICKER_SECTIONS = [
    { id: "levels", label: "Levels" },
    { id: "why", label: "Why" },
    { id: "catalysts", label: "Catalysts" },
    { id: "news", label: "News" },
    { id: "sentiment", label: "Sentiment" },
    { id: "history", label: "History" },
    { id: "ai", label: "AI" },
  ] as const;

  export default function TickerSubNav() {
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.find((e) => e.isIntersecting);
          if (visible) setActiveId((visible.target as HTMLElement).id);
        },
        { rootMargin: "-96px 0px -70% 0px", threshold: 0 }
      );
      for (const { id } of TICKER_SECTIONS) {
        const el = document.getElementById(id);
        if (el) observer.observe(el);
      }
      return () => observer.disconnect();
    }, []);

    return (
      <nav
        aria-label="Ticker page sections"
        className="sticky top-[var(--nav-h)] z-20 flex gap-4 overflow-x-auto border-b border-line bg-surface px-4 py-2"
      >
        {TICKER_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={activeId === s.id ? "true" : undefined}
            className={[
              "shrink-0 whitespace-nowrap border-b-2 pb-1 text-[12px] font-medium transition-colors",
              activeId === s.id
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground",
            ].join(" ")}
          >
            {s.label}
          </a>
        ))}
      </nav>
    );
  }
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/TickerSubNav.test.tsx --project=component`. Expected: 2 passed.

- [ ] **Step 3: Wire the sub-nav and section anchors into `app/t/[ticker]/page.tsx`; fix narrow-width order**
  Add `import TickerSubNav from "@/components/ticker/TickerSubNav";`, and render `<TickerSubNav />` directly after the closing `</section>` of the Header block and before the two-column `<div className="grid ...">`.

  Give each of the two grid children a mobile `order` so the analysis column comes first below 1100px (audit: "the chart + options push all analysis a full screen down"). Chart/options column (currently first in DOM):
  ```tsx
  <div className="space-y-4 max-[1100px]:order-2">
  ```
  Analysis column (currently second in DOM) — also wrap each of the seven panels in an `id`-bearing div so `TickerSubNav`'s anchors and `IntersectionObserver` have something to target:
  ```tsx
  <div className="space-y-4 max-[1100px]:order-1">
    <div id="levels" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      {bridgeRow && <LevelsCard ticker={ticker} bridgeRow={bridgeRow} />}
    </div>
    <div id="why" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <WhyPanel ticker={ticker} />
    </div>
    <div id="catalysts" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <CatalystsCard ticker={ticker} bridgeRow={bridgeRow} />
    </div>
    <div id="news" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <NewsCard ticker={ticker} />
    </div>
    <div id="sentiment" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <SentimentCard bridgeRow={bridgeRow} lastSeen={lastSeen} />
    </div>
    <div id="history" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <HistoryCard rows={history} lastClose={lastClose} />
    </div>
    <div id="ai" className="scroll-mt-[calc(var(--nav-h)+44px)]">
      <AiPanel ticker={ticker} />
    </div>
  </div>
  ```
  `scroll-mt-[calc(var(--nav-h)+44px)]` offsets anchor-jump targets by the global nav's height (`--nav-h`, 46px, `Nav.tsx`) plus the sub-nav's own ~44px, so clicking a sub-nav link doesn't tuck the target's heading under either sticky bar.

- [ ] **Step 4: `tsc` and full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component
  ```
  Expected: no type errors, all component tests pass (including the two new `TickerSubNav` tests and everything from Tasks 10-12 still green — this task only adds wrapper `<div>`s and one new import to `page.tsx`, it doesn't touch any panel's own markup or props).

- [ ] **Step 5: Manual verification**
  `cd /Users/josephstorey/Market_Analyse/dashboard && npm run dev`, visit `/t/NVDA`. Confirm: the sub-nav sits directly under the global nav and scrolls with the page until it reaches the top, then sticks; clicking each of the seven links jumps to that panel without the heading disappearing under either sticky bar; scrolling manually past a panel updates the active (accent-underlined) link; resizing below 1100px moves the seven analysis panels above the chart/options column.

---

### Task 14: Consolidate the header's five hover-only badges into one badge and one caveat line (closes TK-04)

**Files**
- `dashboard/components/ticker/Header.tsx` (modify)
- `dashboard/components/ticker/__tests__/Header.test.tsx` (new)

**Audit findings closed**: TK-04 (confirmed in `components/ui/Badge.tsx`: `BadgeProps.variant` is `"tier" | "verdict" | "style" | "flag"`, but only `TIER` and `VERDICT` color maps exist — the `style` branch falls through to the `else` and always returns `"bg-muted/15 text-muted"`, so `<Badge variant="style" value={bridgeRow.trade_style} />` in `Header.tsx` can never render a distinguishing color, confirmed. Confirmed the row also renders `ConvictionDot` (which owns its own Radix tooltip, "Display-only — not blended into the composite score") plus an `HC` chip wrapped in a `Tooltip.Root`/`Tooltip.Content` pair and, conditionally, an earnings-proximity chip with its own separate `Tooltip.Root` — hover-only detail spread across up to four separate tooltip triggers in one row).

`TIER` (`PRIME_LONG`/`BREAKOUT_LONG`/`STANDARD_LONG`/`WATCH`/`AVOID`/`WAIT`) has no `SHORT`-flavored entries, so tier and verdict aren't fully redundant — the consolidation shows tier (the richer, already-colored label) for everything except `SHORT`, where verdict is shown instead since tier has nothing to say about direction there. `Badge.tsx` itself (a pre-existing shared `components/ui/` component, not one of the Phase-1 contract-frozen primitives) is left unmodified — this task stops *using* the always-muted `style` variant in `Header.tsx` rather than editing the shared component, since other consumers of `Badge` are out of this phase's scope and haven't been audited this session.

- [ ] **Step 1: Write the failing test**
  ```tsx
  // dashboard/components/ticker/__tests__/Header.test.tsx
  import { describe, it, expect } from "vitest";
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import Header from "@/components/ticker/Header";
  import type { BridgeRow } from "@/types/bridge";

  function bridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
    return {
      ticker: "NVDA",
      action_label: "PRIME_LONG",
      argus_verdict: "LONG",
      trade_style: "MOMENTUM",
      conviction: "high",
      high_conviction: true,
      earnings_in_days: null,
      ...overrides,
    } as unknown as BridgeRow;
  }

  beforeEach(() => {
    mockFetchJson(() => ({}));
  });

  describe("Header badge row (TK-04)", () => {
    it("shows one consolidated badge (tier) plus a caveat line, not three separate badges", () => {
      render(
        <Header ticker="NVDA" bridgeRow={bridgeRow()} signalHistory={[]} lastClose={null} />
      );
      expect(screen.getByText("PRIME_LONG")).toBeInTheDocument();
      expect(screen.queryByText("LONG")).not.toBeInTheDocument();
      expect(screen.queryByText("MOMENTUM")).not.toBeInTheDocument();
      expect(
        screen.getByText(/consensus, not edge/i)
      ).toBeInTheDocument();
    });

    it("falls back to the verdict badge for SHORT, which the tier scale has no color for", () => {
      render(
        <Header
          ticker="NVDA"
          bridgeRow={bridgeRow({ action_label: "AVOID", argus_verdict: "SHORT", trade_style: "MOMENTUM" })}
          signalHistory={[]}
          lastClose={null}
        />
      );
      expect(screen.getByText("SHORT")).toBeInTheDocument();
      expect(screen.queryByText("AVOID")).not.toBeInTheDocument();
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/Header.test.tsx --project=component`. Expected: fails — both `PRIME_LONG` and `LONG` (and `MOMENTUM`) currently render simultaneously, and there is no caveat-line text matching `/consensus, not edge/i` (that phrase currently only exists inside the HC chip's hover-only `Tooltip.Content`, which isn't in the DOM until triggered).

- [ ] **Step 2: Consolidate the badge row in `Header.tsx`**
  Replace:
  ```tsx
  <Badge variant="tier" value={bridgeRow.action_label} />
  <Badge variant="verdict" value={bridgeRow.argus_verdict} />
  <Badge variant="style" value={bridgeRow.trade_style} />
  <ConvictionDot value={bridgeRow.conviction as Conviction} />
  {bridgeRow.high_conviction && (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <span className="inline-flex items-center rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[11px] font-mono text-accent cursor-default">
          HC
        </span>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="rounded bg-elevated px-2 py-1 text-[12px] text-muted shadow-lg border border-line z-50 max-w-[220px]" sideOffset={4}>
          {"≥"}75% indicator agreement — consensus, not edge
          <Tooltip.Arrow className="fill-elevated" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )}
  ```
  with:
  ```tsx
  {bridgeRow.argus_verdict === "SHORT" ? (
    <Badge variant="verdict" value={bridgeRow.argus_verdict} />
  ) : (
    <Badge variant="tier" value={bridgeRow.action_label} />
  )}
  <ConvictionDot value={bridgeRow.conviction as Conviction} />
  {bridgeRow.high_conviction && (
    <span className="inline-flex items-center rounded border border-accent/50 bg-accent/10 px-1.5 py-px text-[11px] font-mono text-accent">
      HC
    </span>
  )}
  ```
  (drops the `style` badge and the separate `verdict` badge for the non-`SHORT` case; the `HC` chip keeps its visible pill but loses its own hover-only tooltip — its meaning moves to the caveat line below).

  Then, immediately after that badge-row `<div>` closes (still inside the same `space-y-1` header block, before the flag-age paragraph), add one always-visible caveat line:
  ```tsx
  <p className="text-[11px] text-muted">
    HC = ≥75% indicator agreement (consensus, not edge) · conviction dots are display-only, not
    blended into the score.
  </p>
  ```
  Also simplify the earnings-proximity chip: replace its `earningsInDays <= 10` branch's `Tooltip.Root`/`Tooltip.Trigger`/`Tooltip.Content` wrapper with a plain `<span>` carrying the same visible text (`earnings in {earningsInDays}d`) and the same warn styling — the "inside typical hold window" detail is dropped rather than hidden behind hover, since the visible text (`earnings in Nd`, always ≤10 in this branch) already conveys "soon" without needing a tooltip.

- [ ] **Step 3: Run the test**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/Header.test.tsx --project=component
  ```
  Expected: 2 passed.

- [ ] **Step 4: `tsc` and full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component
  ```
  Expected: no type errors (in particular, confirm removing the two `Tooltip.Root` blocks didn't leave `import * as Tooltip from "@radix-ui/react-tooltip"` as an unused import — it is still used by the third, retained `Tooltip.Root` around... check: after Step 2 there are zero remaining `Tooltip.*` usages in `Header.tsx`, so delete the import entirely), all component tests pass.

- [ ] **Step 5: Manual verification**
  `cd /Users/josephstorey/Market_Analyse/dashboard && npm run dev`, visit a `LONG` ticker and a `SHORT` ticker under `/t/[ticker]`. Confirm: exactly one tier/verdict badge shows per ticker (never both, never a muted `style` pill), the caveat line is visible without hovering anything, and `HC`/earnings chips still show their text with no dependency on hover to understand them.

---

### Task 15: `WhyPanel` — a labelled inflation row, split/grouped votes, positional combo decode (closes TK-05, TK-06, TK-07)

**Files**
- `dashboard/components/ticker/WhyPanel.tsx` (modify)
- `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` (new)

**Audit findings closed**: TK-05, TK-06, TK-07 — all three confirmed directly in `components/ticker/WhyPanel.tsx`:
- TK-05: `{inflationAbove && (<div className="flex items-center gap-1"><InfoTooltip text="correlated consensus — discount" /></div>)}` — a bare "i" glyph button with no adjacent label, confirmed verbatim.
- TK-06: the votes accordion toggle renders `agent votes ({agreedCount} agreed · {dissentedCount} dissented)`, then `{allVotes.map((v) => <VoteRow .../>)}` — all votes, unsorted, ungrouped, in one flat list; `VoteRow`'s `note` span is `max-w-[120px] truncate`, confirmed verbatim. `AgentVote.family: AgentFamily` (confirmed in `types/argus.ts`) is already present per-vote, unused for grouping here (only used in the separate, higher-level `family_votes`/`FamilyRow` summary).
- TK-07: `COMBO_NOTE` has exactly 5 keys (`LSNS`/`LNLL`/`LSNL`/`LNNL`/`LLNL`); any other `combo` value (e.g. `"LNSL"`) renders as a bare `<span className="font-medium">{combo}</span>` with `comboNote` falsy, confirmed verbatim.

This task consumes `dashboard/lib/labels.ts`'s `COMBO_POSITION_LABEL`/`COMBO_LETTER_LABEL` (Phase 1, `00-foundations-contract.md` §D) — the contract's own §D note is authoritative and **corrects** the audit's guessed positional order ("trend/squeeze/oscillator/structure"): the real 2nd position is `breakout`, not `squeeze` (ground truth: `argus/argus/action_card/builder.py`'s `_combo_string()`, fixed order `ma_trend, breakout, squeeze, momentum_osc, weekly_structure`; only the first 4 characters are ever classified). `COMBO_POSITION_LABEL` only exports 4 `[family, gloss]` pairs for that reason — this task decodes `combo[0..3]` against those 4 positions and intentionally leaves `combo[4]` (`weekly_structure`) undecoded, matching the backend's own STRONG/WEAK classification which also only looks at the first 4 characters (`combo[:4] not in _WEAK_COMBOS`).

This task assumes Task 10 has already landed: `WhyPanel.tsx`'s data-fetching block is `const { actionCard: { data, error, isLoading, isValidating, mutate } } = useTickerData(ticker);` (local `useSWR`/`fetcher` deleted). Everything below that block — `InfoTooltip`, `NetBar`, `FamilyRow`, `VoteRow`, and the panel's JSX body — is unchanged by Task 10 and is what this task edits.

- [ ] **Step 1: Write the failing test**
  ```tsx
  // dashboard/components/ticker/__tests__/WhyPanel.test.tsx
  import { describe, it, expect } from "vitest";
  import { render, screen, within } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import userEvent from "@testing-library/user-event";
  import WhyPanel from "@/components/ticker/WhyPanel";
  import type { ActionCardData, AgentVote } from "@/types/argus";

  function vote(overrides: Partial<AgentVote> = {}): AgentVote {
    return { agent: "trend_follower_1", verdict: "LONG", confidence: 0.8, note: null, family: "trend", ...overrides } as AgentVote;
  }

  function card(overrides: Partial<ActionCardData> = {}): ActionCardData {
    return {
      symbol: "NVDA",
      verdict: "LONG",
      score: 0.72,
      high_conviction: true,
      entry: 100,
      stop: 95,
      target: 115,
      risk_reward: 3,
      long_votes: 2,
      short_votes: 1,
      wait_votes: 0,
      agreement_pct: 0.67,
      ret_1d: null,
      ret_5d: null,
      ret_20d: null,
      is_extended: false,
      entry_quality: "clean",
      votes: [
        vote({ agent: "trend_follower_1", verdict: "LONG", family: "trend" }),
        vote({ agent: "trend_follower_2", verdict: "LONG", family: "trend" }),
        vote({ agent: "mean_reversion_1", verdict: "SHORT", family: "oscillator", note: "overbought on daily RSI, expecting pullback soon" }),
      ],
      agreed: ["trend_follower_1", "trend_follower_2"],
      dissented: ["mean_reversion_1"],
      notes: "",
      combo: "LNSL",
      ...overrides,
    } as ActionCardData;
  }

  describe("WhyPanel (TK-05/06/07)", () => {
    it("shows a labelled amber row instead of a bare info glyph when inflation_gap is high", () => {
      mockFetchJson(() => card({ inflation_gap: 0.3 }));
      render(<WhyPanel ticker="NVDA" />);
      expect(screen.getByText(/correlated consensus, discount this score/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "info" })).not.toBeInTheDocument();
    });

    it("splits the votes accordion into Dissented (first) and Agreed (second), grouped by family", async () => {
      mockFetchJson(() => card());
      render(<WhyPanel ticker="NVDA" />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /agent votes/i }));

      const headings = screen.getAllByText(/^(Dissented|Agreed)$/);
      expect(headings.map((h) => h.textContent)).toEqual(["Dissented", "Agreed"]);

      const dissentedSection = headings[0].closest("div")!.parentElement!;
      expect(within(dissentedSection).getByText("mean_reversion_1")).toBeInTheDocument();
      expect(within(dissentedSection).queryByText("trend_follower_1")).not.toBeInTheDocument();
    });

    it("decodes the combo positionally even when it has no COMBO_NOTE gloss", () => {
      mockFetchJson(() => card({ combo: "LNSL" })); // not one of the 5 known COMBO_NOTE prefixes
      render(<WhyPanel ticker="NVDA" />);
      expect(screen.getByText("ma_trend")).toBeInTheDocument();
      expect(screen.getByText("breakout")).toBeInTheDocument();
      expect(screen.getByText("squeeze")).toBeInTheDocument();
      expect(screen.getByText("momentum_osc")).toBeInTheDocument();
    });
  });
  ```
  Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/WhyPanel.test.tsx --project=component`. Expected: all 3 fail (bare glyph still present; votes list is flat/ungrouped with no "Dissented"/"Agreed" headings; no positional decode chips).

- [ ] **Step 2: Labelled inflation row (TK-05)**
  Replace:
  ```tsx
  {inflationAbove && (
    <div className="flex items-center gap-1">
      <InfoTooltip text="correlated consensus — discount" />
    </div>
  )}
  ```
  with:
  ```tsx
  {inflationAbove && (
    <div className="flex items-start gap-1.5 rounded border border-warn/40 bg-warn/5 px-3 py-2">
      <AlertTriangle size={12} className="text-warn mt-px shrink-0" />
      <span className="font-mono text-[11px] text-warn leading-snug">
        High inflation gap — correlated consensus, discount this score.
      </span>
    </div>
  )}
  ```
  (mirrors the existing meta-analyst callout's visual language a few lines below, per the audit's fix). The local `InfoTooltip` function stays — it is still used by the `n_eff` chip's tooltip, which the audit did not flag (that one already has an adjacent "n_eff" label, it isn't orphaned).

- [ ] **Step 3: Split + family-group the votes accordion (TK-06)**
  Add a grouping helper above `WhyPanel`:
  ```tsx
  function groupVotesByFamily(
    votes: AgentVote[],
    familyOrder: string[]
  ): [string, AgentVote[]][] {
    const byFamily = new Map<string, AgentVote[]>();
    for (const v of votes) {
      if (!byFamily.has(v.family)) byFamily.set(v.family, []);
      byFamily.get(v.family)!.push(v);
    }
    const known = familyOrder
      .filter((f) => byFamily.has(f))
      .map((f): [string, AgentVote[]] => [f, byFamily.get(f)!]);
    const rest = Array.from(byFamily.entries()).filter(([f]) => !familyOrder.includes(f));
    return [...known, ...rest];
  }

  function VoteSection({
    title,
    tone,
    groups,
  }: {
    title: string;
    tone: string;
    groups: [string, AgentVote[]][];
  }) {
    if (groups.length === 0) return null;
    return (
      <div>
        <p className={`font-mono text-[11px] uppercase tracking-wide mb-1 ${tone}`}>{title}</p>
        {groups.map(([family, rows]) => (
          <div key={family} className="mb-1.5">
            <p className="font-mono text-[11px] text-muted">{family}</p>
            {rows.map((v) => (
              <VoteRow key={v.agent} agent={v.agent} direction={v.verdict} confidence={v.confidence} note={v.note} />
            ))}
          </div>
        ))}
      </div>
    );
  }
  ```
  Widen `VoteRow`'s truncated note span (part of the same finding) from `max-w-[120px]` to `max-w-[240px]` and add `title={note ?? undefined}` so the full text is reachable on hover instead of being permanently clipped.

  Inside `WhyPanel`, after `familyRowData` is built, add `const familyOrder = familyRowData.map((r) => r.family);`. Replace the accordion body:
  ```tsx
  <div id={votesId} hidden={!votesOpen} className="mt-2 space-y-0">
    {allVotes.map((v) => (
      <VoteRow key={v.agent} agent={v.agent} direction={v.verdict} confidence={v.confidence} note={v.note} />
    ))}
  </div>
  ```
  with:
  ```tsx
  <div id={votesId} hidden={!votesOpen} className="mt-2 space-y-3">
    <VoteSection title="Dissented" tone="text-neg" groups={groupVotesByFamily(dissentedVotes, familyOrder)} />
    <VoteSection title="Agreed" tone="text-pos" groups={groupVotesByFamily(agreedVotes, familyOrder)} />
  </div>
  ```
  Dissented renders first — "that's the interesting half" per the audit's fix — instead of a single unsorted, ungrouped 70-row list.

- [ ] **Step 4: Positional combo decode (TK-07)**
  Add the import: `import { COMBO_POSITION_LABEL, COMBO_LETTER_LABEL } from "@/lib/labels";` and `import InfoTip from "@/components/ui/InfoTip";`. Replace the "Combo headline" block:
  ```tsx
  {combo && (
    <div className="space-y-0.5">
      <span className="font-mono text-[12px] text-foreground">
        combo <span className="font-medium">{combo}</span>
      </span>
      {comboNote && (
        <p className="font-mono text-[11px] text-muted leading-snug">— {comboNote}</p>
      )}
    </div>
  )}
  ```
  with:
  ```tsx
  {combo && (
    <div className="space-y-1">
      <span className="font-mono text-[12px] text-foreground">
        combo <span className="font-medium">{combo}</span>
      </span>
      {comboNote && (
        <p className="font-mono text-[11px] text-muted leading-snug">— {comboNote}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {COMBO_POSITION_LABEL.map(([family, gloss], i) => {
          const letter = combo[i] as "L" | "S" | "N" | undefined;
          if (!letter) return null;
          return (
            <InfoTip key={family} content={`${gloss} ${COMBO_LETTER_LABEL[letter]}.`}>
              <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">
                {family}
                <span className={letter === "L" ? "text-pos" : letter === "S" ? "text-neg" : "text-muted"}>
                  {letter}
                </span>
              </span>
            </InfoTip>
          );
        })}
      </div>
    </div>
  )}
  ```
  This decodes every combo positionally — known (with a `comboNote` headline) or unknown (chips only) — closing "unknown combos show a 4-letter code with no gloss" for good.

- [ ] **Step 5: Run the test, then type-check and the full component suite**
  ```bash
  cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run components/ticker/__tests__/WhyPanel.test.tsx --project=component
  cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit && npx vitest run --project=component
  ```
  Expected: 3 passed, then no type errors and all component tests pass.

---

### Task 16: `LevelsCard` — a rail with real scale, and risk sizing framed as % of account (closes TK-08, TK-09)

`PriceRail` currently conveys the live price only via a `title` attribute (invisible until hover) and has no axis or tick values at all — stop/entry/target are unlabelled coloured ticks. Risk sizing is a single bare "Risk $" dollar input with no account-size or percentage framing and no fee/slippage caveat. Fix both: give the rail a visible low/high scale plus a visible price label, and replace the single dollar input with `Account $` + `Risk %` inputs so the sizing line reads "risking $X = Y% of $Z account", with the "context, not a mechanical exit system" caveat sitting directly under those numbers instead of only at the bottom of the whole card.

`LevelsCard` also still keeps its own local `useSWR` calls and a duplicate `cardOk`-style levels derivation. This task switches it onto Task 10's `useTickerData(ticker)` and Task 11's `deriveLevels()` (`@/lib/levels`), removing the local `QuoteData`/`ActionCard` interfaces and the duplicate entry/stop/target logic.

**Files:**
- `dashboard/lib/storageKeys.ts` (modify — Phase-1-owned file; add the two new keys this task introduces to the closed registry, see Step 1)
- `dashboard/components/ticker/LevelsCard.tsx` (modify)
- `dashboard/components/ticker/__tests__/LevelsCard.test.tsx` (new)

**Interfaces:**
```typescript
// storageKeys.ts additions (append to existing STATIC_KEYS)
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
  riskAccountSize: "dash:risk:accountSize",
  riskPct: "dash:risk:pct",
} as const;
```

**Audit findings closed:**
- TK-08: `PriceRail` had no axis and no tick values; the only numeric price readout was a `title` attribute, invisible without a mouse hover (confirmed, `LevelsCard.tsx` lines 69-118 pre-fix). Fixed by adding a visible low/high axis row beneath the bar and a visible price label positioned above the live-price dot (clamped so it can't clip off the container edge).
- TK-09: risk sizing was a single global dollar amount (`useLocalStorage("dash:riskUsd", 500)`) with no account-size or %-of-account framing and no fee/slippage caveat (confirmed, lines 293-324 pre-fix). Fixed by splitting into `Account $` + `Risk %` inputs, computing risk-in-dollars from the pair, showing "= N shares (risking $X = Y% of $Z account)", and putting a "No fees or slippage modeled. Context, not a mechanical exit system." line immediately under that output. The pre-existing `dash:riskUsd` key was itself never registered in `lib/storageKeys.ts`'s `STATIC_KEYS` — this task registers its two replacement keys there rather than repeating that gap.

**Note on interpretation:** "label the endpoints" is read as labelling the rail's own low/high numeric bounds (the audit's own wording is "no axis, no tick values") rather than repeating the Entry/Stop/Target numbers already shown in the 4-column grid directly above the rail, which would be redundant. "Put the price value beside the dot" is implemented literally — the label floats directly above the dot's own horizontal position, not in a fixed corner.

#### Step 1: Register the two new risk-sizing keys in `lib/storageKeys.ts`

`lib/storageKeys.ts` is Phase-1-owned but is the single enforced source of truth for `localStorage` key names (per `00-foundations-contract.md` §C-ish key-registry section) — same reasoning Task 10 used to add missing fields to `types/argus.ts`: later phases append entries they discover a real need for rather than inventing ad hoc keys at call sites.

Add the two keys to `STATIC_KEYS`:

```typescript
// dashboard/lib/storageKeys.ts
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
  riskAccountSize: "dash:risk:accountSize",
  riskPct: "dash:risk:pct",
} as const;
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors (this file has no test suite of its own — it is pure data, covered indirectly by every consumer's tests).

#### Step 2: Rewrite `PriceRail` with a visible axis and a visible price label

Open `dashboard/components/ticker/LevelsCard.tsx`. Replace the existing `PriceRail` function (the one that renders only coloured tick bars plus a `title`-only price dot) with:

```tsx
function PriceRail({
  stop,
  entry,
  target,
  price,
}: {
  stop: number;
  entry: number;
  target: number;
  price: number | null;
}) {
  const vals = [stop, entry, target, price].filter(
    (v): v is number => v !== null && Number.isFinite(v)
  );
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * 100;
  const isLong = entry < target;
  const priceLeft = price !== null ? Math.min(96, Math.max(4, pos(price))) : null;

  return (
    <div className="pt-1">
      <div className="relative h-1.5 rounded-full bg-line">
        <div
          className={`absolute top-0 h-full ${isLong ? "bg-loss/40" : "bg-gain/40"}`}
          style={{ left: `${pos(Math.min(stop, entry))}%`, width: `${Math.abs(pos(entry) - pos(stop))}%` }}
        />
        <div
          className={`absolute top-0 h-full ${isLong ? "bg-gain/40" : "bg-loss/40"}`}
          style={{ left: `${pos(Math.min(entry, target))}%`, width: `${Math.abs(pos(target) - pos(entry))}%` }}
        />
        <div className="absolute top-1/2 h-2.5 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-loss" style={{ left: `${pos(stop)}%` }} title={`stop ${stop.toFixed(2)}`} />
        <div className="absolute top-1/2 h-2.5 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-foreground" style={{ left: `${pos(entry)}%` }} title={`entry ${entry.toFixed(2)}`} />
        <div className="absolute top-1/2 h-2.5 w-[2px] -translate-x-1/2 -translate-y-1/2 bg-gain" style={{ left: `${pos(target)}%` }} title={`target ${target.toFixed(2)}`} />
        {price !== null && priceLeft !== null && (
          <>
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg"
              style={{ left: `${pos(price)}%` }}
            />
            <span
              className="absolute -top-4 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] tabular-nums text-accent"
              style={{ left: `${priceLeft}%` }}
            >
              {price.toFixed(2)}
            </span>
          </>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between font-mono text-[11px] tabular-nums text-muted">
        <span>{lo.toFixed(2)}</span>
        <span>{hi.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors (component tests come in Step 5).

#### Step 3: Switch `LevelsCard` onto `useTickerData` + `deriveLevels`

Still in `LevelsCard.tsx`, remove the local `QuoteData`/`ActionCard` interfaces, the local `fetcher`, and both local `useSWR` calls. Replace them with:

```tsx
import { useTickerData } from "@/lib/useTickerData";
import { deriveLevels } from "@/lib/levels";
```

```tsx
export default function LevelsCard({ ticker, bridgeRow }: { ticker: string; bridgeRow: BridgeRow }) {
  const { quote: quoteRes, actionCard: cardRes } = useTickerData(ticker);
  const price = quoteRes.data?.price ?? null;
  const card = cardRes.data ?? null;

  const derived = deriveLevels(bridgeRow, card);
  const { entry, stop, target, riskReward, stopAnchor, valid } = derived;
  // ...existing verdict/isLong/isShort/dir/committed logic is unchanged, now reads from `derived` instead of local cardOk block...
```

Delete the old `cardOk`, `entry`/`stop`/`target`/`stop_anchor`/`risk_reward` derivation block entirely — `deriveLevels` (Task 11) already does exactly that extraction. Keep `distToEntry` computation as-is but source `entry`/`price` from the variables above.

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: type errors pointing at any remaining reference to the deleted local `cardOk`/`entry`/`stop` block — fix each by reading from `derived` instead, then re-run until clean.

#### Step 4: Replace the risk-sizing block with `Account $` + `Risk %`

Replace the existing `dash:riskUsd`-backed input block (the `<label>Risk $</label>` + single `<input>` + share-count output + bottom "Sizing from your risk budget..." paragraph) with:

```tsx
import { STATIC_KEYS } from "@/lib/storageKeys";
```

```tsx
const [accountSize, setAccountSize] = useLocalStorage(STATIC_KEYS.riskAccountSize, 10000);
const [riskPct, setRiskPct] = useLocalStorage(STATIC_KEYS.riskPct, 1);
const riskUsd = accountSize > 0 && riskPct > 0 ? accountSize * (riskPct / 100) : 0;
const shares =
  valid && entry !== null && stop !== null && entry > stop && riskUsd > 0
    ? Math.floor(riskUsd / (entry - stop))
    : null;
```

```tsx
<div className="space-y-2 border-t border-line pt-3">
  <div className="flex flex-wrap items-center gap-2">
    <label className="font-mono text-[11px] text-muted" htmlFor="risk-account">Account $</label>
    <input
      id="risk-account"
      type="number"
      min={0}
      step={1000}
      value={accountSize}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v) && v >= 0) setAccountSize(v);
      }}
      className="w-24 rounded border border-line bg-raised px-2 py-0.5 font-mono text-[12px] tabular-nums text-foreground focus:border-accent focus:outline-none"
    />
    <label className="font-mono text-[11px] text-muted" htmlFor="risk-pct">Risk %</label>
    <input
      id="risk-pct"
      type="number"
      min={0}
      max={100}
      step={0.25}
      value={riskPct}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v) && v >= 0) setRiskPct(v);
      }}
      className="w-16 rounded border border-line bg-raised px-2 py-0.5 font-mono text-[12px] tabular-nums text-foreground focus:border-accent focus:outline-none"
    />
  </div>
  {shares !== null ? (
    <p className="font-mono text-[13px] tabular-nums text-foreground">
      = <span className="text-accent">{shares}</span> shares (risking{" "}
      ${riskUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} = {riskPct}% of $
      {accountSize.toLocaleString(undefined, { maximumFractionDigits: 0 })} account)
    </p>
  ) : (
    <span className="font-mono text-[13px] text-muted">—</span>
  )}
  <p className="text-[12px] leading-snug text-muted">
    No fees or slippage modeled. Levels are context, not a mechanical exit system.
  </p>
</div>
```

Delete the old bottom-of-card "Sizing from your risk budget ÷ (entry − stop). Levels are context, not a mechanical exit system." paragraph — its content is now covered by the inline block above, adjacent to the numbers it qualifies rather than separated at the card's end.

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 5: Test the rail's visible labels and the account/% risk framing

Create `dashboard/components/ticker/__tests__/LevelsCard.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import { resetLocalStorage, seedLocalStorage } from "@/test/localStorage";
import LevelsCard from "@/components/ticker/LevelsCard";
import type { BridgeRow } from "@/types/bridge";

function bridgeRow(overrides: Partial<BridgeRow> = {}): BridgeRow {
  return {
    ticker: "AAPL",
    argus_verdict: "LONG",
    entry: 100,
    stop: 95,
    target: 115,
    risk_reward: 3,
    stop_anchor: "supertrend",
    ...overrides,
  } as unknown as BridgeRow;
}

beforeEach(() => {
  resetLocalStorage();
  mockFetchJson({
    "/api/quote/AAPL": { price: 102.5 },
    "/api/action_card/AAPL": {},
  });
});

describe("LevelsCard", () => {
  it("shows a visible low/high axis and a visible price label on the rail", async () => {
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() => expect(screen.getByText("95.00")).toBeInTheDocument());
    expect(screen.getByText("115.00")).toBeInTheDocument();
    expect(screen.getByText("102.50")).toBeInTheDocument();
  });

  it("frames risk sizing as % of a stated account size with a fee/slippage caveat", async () => {
    const user = userEvent.setup();
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() => expect(screen.getByLabelText("Account $")).toBeInTheDocument());

    await user.clear(screen.getByLabelText("Account $"));
    await user.type(screen.getByLabelText("Account $"), "20000");
    await user.clear(screen.getByLabelText("Risk %"));
    await user.type(screen.getByLabelText("Risk %"), "2");

    await waitFor(() =>
      expect(screen.getByText(/risking \$400 = 2% of \$20,000 account/)).toBeInTheDocument()
    );
    expect(screen.getByText(/No fees or slippage modeled/)).toBeInTheDocument();
  });

  it("reads previously-saved account size and risk % from their registered storage keys", async () => {
    seedLocalStorage("dash:risk:accountSize", 50000);
    seedLocalStorage("dash:risk:pct", 0.5);
    render(<LevelsCard ticker="AAPL" bridgeRow={bridgeRow()} />);
    await waitFor(() =>
      expect(screen.getByText(/risking \$250 = 0.5% of \$50,000 account/)).toBeInTheDocument()
    );
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/LevelsCard.test.tsx && npx tsc --noEmit
```
Expected: 3 passed, then no type errors.

---

### Task 17: `AiPanel` — Regenerate, Copy, and prose instead of `<pre>` (closes TK-10)

`generate()`'s guard clause is `if (state.status === "loading" || state.status === "done") return;` (confirmed, `AiPanel.tsx` line 18) — once a report has loaded, there is no way to ask for a new one short of a full page reload. The `done` branch renders the report in a bare `<pre>` (line 74), and there is no copy affordance.

**Files:**
- `dashboard/components/ticker/AiPanel.tsx` (modify)
- `dashboard/components/ticker/__tests__/AiPanel.test.tsx` (new)

**Audit findings closed:**
- TK-10: confirmed exactly as described — `generate()`'s guard blocks re-invocation once `status === "done"`, no Regenerate/Copy actions exist, and the report renders in a raw `<pre>` rather than as prose.

#### Step 1: Drop the `done`-blocking guard so `generate()` can be called again

Open `dashboard/components/ticker/AiPanel.tsx`. Change:

```tsx
    if (state.status === "loading" || state.status === "done") return;
```

to:

```tsx
    if (state.status === "loading") return;
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 2: Add a paragraph-splitting prose renderer

Still in `AiPanel.tsx`, add above the component:

```tsx
function reportParagraphs(report: string): string[] {
  return report
    .split(/\n{2,}/)
    .flatMap((block) => (block.includes("\n") ? block.split(/\n/) : [block]))
    .map((p) => p.trim())
    .filter(Boolean);
}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors (unused-function warning is expected until Step 3 wires it in — not an error under this repo's `tsconfig`, since `noUnusedLocals` is not part of the frozen strict-mode list in `00-foundations-contract.md`; if `tsc --noEmit` does report it, proceed to Step 3 immediately, which consumes it).

#### Step 3: Render prose + Regenerate + Copy in the `done` branch

Replace the `state.status === "done"` branch with:

```tsx
        {state.status === "done" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={generate}
                className="font-mono text-[11px] text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.report);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="font-mono text-[11px] text-muted border border-line rounded px-2 py-0.5 hover:text-foreground hover:border-accent/40 transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="space-y-2 font-mono text-[12px] text-foreground leading-relaxed">
              {reportParagraphs(state.report).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        )}
```

Add the `copied` state next to the existing `state` declaration:

```tsx
  const [state, setState] = useState<State>({ status: "idle" });
  const [copied, setCopied] = useState(false);
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 4: Sanity-read the file

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && grep -n "status === \"done\"\|Regenerate\|Copy\|reportParagraphs" components/ticker/AiPanel.tsx
```
Expected: the `Regenerate`/`Copy` buttons and `reportParagraphs` all present, and no remaining `<pre>` tag in the file (confirm separately with `grep -n "<pre" components/ticker/AiPanel.tsx`, expected: no matches).

#### Step 5: Test Regenerate re-fetches and Copy writes to the clipboard

Create `dashboard/components/ticker/__tests__/AiPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import AiPanel from "@/components/ticker/AiPanel";

beforeEach(() => {
  let call = 0;
  global.fetch = vi.fn(async () => {
    call += 1;
    return {
      ok: true,
      json: async () => ({ mode: "test", report: `report v${call}\n\nsecond paragraph` }),
    } as Response;
  });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("AiPanel", () => {
  it("renders the report as paragraphs, not a <pre>", async () => {
    const user = userEvent.setup();
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());
    expect(screen.getByText("second paragraph")).toBeInTheDocument();
    expect(document.querySelector("pre")).toBeNull();
  });

  it("Regenerate re-fetches after a report is already loaded", async () => {
    const user = userEvent.setup();
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());

    await user.click(screen.getByText("Regenerate"));
    await waitFor(() => expect(screen.getByText("report v2")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("Copy writes the report text to the clipboard", async () => {
    const user = userEvent.setup();
    render(<AiPanel ticker="AAPL" />);
    await user.click(screen.getByText(/Generate analysis/));
    await waitFor(() => expect(screen.getByText("report v1")).toBeInTheDocument());

    await user.click(screen.getByText("Copy"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("report v1\n\nsecond paragraph");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/AiPanel.test.tsx && npx tsc --noEmit
```
Expected: 3 passed, then no type errors.

---

### Task 18: `OptionsPanel` — one caveat, headings for hierarchy parity (closes TK-11)

The "as of ... — robust-score (beta), validation pending" caveat is written out twice in the JSX (`components/ticker/OptionsPanel.tsx` lines 263-267 and 271-274 — two branches of the same `unusual_as_of ? ... : ... ? ... : null` chain, both rendering the identical string, confirmed). The P/C summary table and the IV row have no heading, while `UnusualTable` gives its two tables a `text-[11px] font-medium text-muted uppercase tracking-wide` label — so of the three stacked tables plus the IV row, only two have any heading at all.

**Files:**
- `dashboard/components/ticker/OptionsPanel.tsx` (modify)
- `dashboard/components/ticker/__tests__/OptionsPanel.test.tsx` (new)

**Audit findings closed:**
- TK-11: confirmed exactly — caveat text duplicated verbatim across two JSX branches; P/C summary table and IV row unlabelled while the two `UnusualTable`s are labelled, giving inconsistent hierarchy across the panel's four data blocks.

#### Step 1: Hoist the caveat to a single conditional, independent of table presence

Open `dashboard/components/ticker/OptionsPanel.tsx`. Replace the entire "Unusual activity" block (the `{(data.unusual_calls_top.length > 0 || data.unusual_puts_top.length > 0) ? ( ... ) : data.unusual_as_of ? ( ... ) : state === "closed" ? ( ... ) : null}` chain) with:

```tsx
        {/* Unusual activity */}
        {data.unusual_as_of ? (
          <p className="font-mono text-[11px] text-muted border-t border-line pt-2">
            as of {data.unusual_as_of} close (US) — robust-score (beta), validation pending
          </p>
        ) : state === "closed" ? (
          <p className="font-mono text-[11px] text-muted border-t border-line pt-2">
            unusual-activity lists rebuild from live volume during US hours; overnight
            recaps land with WS-1 snapshots
          </p>
        ) : null}
        {(data.unusual_calls_top.length > 0 || data.unusual_puts_top.length > 0) && (
          <div className="space-y-3">
            <UnusualTable rows={data.unusual_calls_top} label="Unusual Calls" />
            <UnusualTable rows={data.unusual_puts_top} label="Unusual Puts" />
          </div>
        )}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 2: Add matching headings to the P/C summary table and the IV row

Still in `OptionsPanel.tsx`, insert a label above the P/C summary `<table>`:

```tsx
        {/* P/C summary table */}
        <div>
          <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">
            P/C Summary
          </p>
          <table className="w-full font-mono text-[12px] tabular-nums border-collapse">
```

and close the new wrapping `<div>` after the table's existing `</table>` tag (the table's own closing tag is unchanged — only wrap it).

Insert the same label above the IV row:

```tsx
        {/* IV row */}
        <div className="border-t border-line pt-2">
          <p className="text-[11px] font-medium text-muted uppercase tracking-wide mb-1.5">
            Implied Volatility
          </p>
          <div className="flex flex-wrap gap-4 font-mono text-[12px] tabular-nums">
```

and close the new outer `<div>` after the existing IV row's closing `</div>` (remove the `border-t border-line pt-2` classes from the original inner `<div>` since they now live on the new outer wrapper — the visual divider position is preserved, just moved one level up).

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 3: Sanity-check no duplicate caveat text remains

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && grep -c "robust-score (beta), validation pending" components/ticker/OptionsPanel.tsx
```
Expected: `1` (was `2` before Step 1).

#### Step 4: Visual pass in the browser

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npm run dev
```
Open `http://localhost:3000/t/AAPL`, expand the Options panel. Expected: four visibly-headed blocks in order — P/C Summary, Implied Volatility, Unusual Calls, Unusual Puts (the latter two only when rows exist) — each carrying the same uppercase-tracked label style, and the beta caveat appearing exactly once regardless of whether unusual-activity rows are present.

#### Step 5: Test the single-caveat and heading-parity behavior

Create `dashboard/components/ticker/__tests__/OptionsPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import OptionsPanel from "@/components/ticker/OptionsPanel";
import type { OptionsFlowData } from "@/types/argus";

function flow(overrides: Partial<OptionsFlowData> = {}): OptionsFlowData {
  return {
    symbol: "AAPL",
    expiration: "2026-08-15",
    spot: 200,
    summary: { call_oi: 1000, put_oi: 800, call_vol: 500, put_vol: 300, pcr_oi: 0.8, pcr_vol: 0.6 },
    iv_atm_call: 0.25,
    iv_atm_put: 0.27,
    iv_skew: 0.02,
    max_pain: 200,
    flags: [],
    unusual_calls_top: [{ strike: 210, lastPrice: 3.2, bid: 3.1, ask: 3.3, percentChange: 12, vol: 500, oi: 200, type: "call" }],
    unusual_puts_top: [],
    unusual_as_of: "2026-07-28",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchJson({ "/api/argus/flow/AAPL": flow() });
});

describe("OptionsPanel", () => {
  it("renders exactly one beta-caveat line even when unusual rows exist", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("Unusual Calls")).toBeInTheDocument());
    expect(screen.getAllByText(/robust-score \(beta\), validation pending/)).toHaveLength(1);
  });

  it("gives the P/C summary and IV blocks headings matching the unusual tables", async () => {
    render(<OptionsPanel ticker="AAPL" />);
    await waitFor(() => expect(screen.getByText("P/C Summary")).toBeInTheDocument());
    expect(screen.getByText("Implied Volatility")).toBeInTheDocument();
    expect(screen.getByText("Unusual Calls")).toBeInTheDocument();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/OptionsPanel.test.tsx && npx tsc --noEmit
```
Expected: 2 passed, then no type errors.

---

### Task 19: `CandleChart` controls get real semantics; add a crosshair OHLC readout and a volume-pane label (closes TK-12, TK-13)

Confirmed in `components/charts/CandleChart.tsx`: the range pills and the log toggle share the identical active-state class `"bg-accent text-foreground"` (lines 369 and 407) despite being different control types (single-select group vs. boolean toggle); EMA chips fill their own background with a raw hex value via inline `style` (`#4c8dff` / `#d29922` / `#8b93a3`, line 393) and always render `text-foreground` on top of it — the amber `e50` swatch is a plausible contrast failure. None of the three controls carry ARIA roles matching their actual semantics (plain `<button>`s throughout). Separately, there is no OHLC/crosshair legend anywhere on the 420px chart, and the volume histogram's `"vol"` price scale (lines 278-284) has no visible label at all.

**Files:**
- `dashboard/components/charts/CandleChart.tsx` (modify)
- `dashboard/components/charts/__tests__/CandleChart.test.tsx` (modify — extend the Task 11 mock and add new tests)

**Audit findings closed:**
- TK-12: confirmed — range-pill active state and log-toggle active state both `bg-accent text-foreground`; EMA chips use raw hex fills with `text-foreground` on top (contrast risk on amber); no control carries semantic ARIA roles.
- TK-13: confirmed — no OHLC/crosshair legend on the chart; volume pane has no axis/label.

#### Step 1: Give the range pills and EMA chips real semantics

Open `dashboard/components/charts/CandleChart.tsx`. Wrap the range-pill row in a radiogroup and mark each pill's checked state:

```tsx
        <div role="radiogroup" aria-label="Chart range" className="flex gap-1">
          {(["3M", "6M", "1Y", "2Y"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={activePeriod === p}
              onClick={() => applyPeriod(p)}
              className={[
                "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                activePeriod === p
                  ? "bg-accent text-foreground"
                  : "bg-elevated text-muted hover:text-foreground",
              ].join(" ")}
            >
              {p}
            </button>
          ))}
        </div>
```

Replace the EMA-chip block so the raw-hex fill becomes a small swatch dot next to a neutral-background label, instead of filling the whole button:

```tsx
        {(["e20", "e50", "e200"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={emas[key]}
            onClick={() => setEmas((prev) => ({ ...prev, [key]: !prev[key] }))}
            className={[
              "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border border-line bg-elevated transition-colors",
              emas[key] ? "text-foreground" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: EMA_STYLE[key].color, opacity: emas[key] ? 1 : 0.35 }}
            />
            {key === "e20" ? "20" : key === "e50" ? "50" : "200"}
          </button>
        ))}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 2: Migrate the log toggle onto the `Toggle` contract primitive

Add the import:

```tsx
import Toggle from "@/components/ui/Toggle";
```

Replace the log-toggle `<button>` with:

```tsx
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] text-muted">Log</span>
          <Toggle checked={logScale} onChange={setLogScale} label="Log price scale" />
        </div>
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 3: Add a crosshair-driven OHLC legend

Add the readout state next to the other `useState` declarations:

```tsx
  const [ohlc, setOhlc] = useState<
    { date: string; open: number; high: number; low: number; close: number; volume: number } | null
  >(null);
```

Inside the mount effect's `.then(({ createChart, ColorType, LineStyle }) => { ... })` callback, right after `applyData(barsRef.current);`, seed the legend with the latest bar and subscribe to crosshair moves:

```tsx
        const seedLast = barsRef.current[barsRef.current.length - 1];
        if (seedLast) {
          setOhlc({
            date: seedLast.ts.slice(0, 10),
            open: seedLast.open,
            high: seedLast.high,
            low: seedLast.low,
            close: seedLast.close,
            volume: seedLast.volume,
          });
        }

        chart.subscribeCrosshairMove((param) => {
          const bar = param.time ? param.seriesData.get(candleSeries) : undefined;
          if (!bar || !("open" in bar)) {
            const last = barsRef.current[barsRef.current.length - 1];
            if (last) {
              setOhlc({
                date: last.ts.slice(0, 10),
                open: last.open,
                high: last.high,
                low: last.low,
                close: last.close,
                volume: last.volume,
              });
            }
            return;
          }
          const vol = param.seriesData.get(volSeries) as { value: number } | undefined;
          const t = typeof param.time === "number" ? param.time : Number(param.time);
          setOhlc({
            date: new Date(t * 1000).toISOString().slice(0, 10),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: vol?.value ?? 0,
          });
        });
```

Render the legend row between the Controls row and the chart canvas:

```tsx
      {/* OHLC legend */}
      {ohlc && (
        <div className="mb-1 flex flex-wrap gap-3 px-0.5 font-mono text-[11px] tabular-nums text-muted">
          <span>{ohlc.date}</span>
          <span>O <span className="text-foreground">{ohlc.open.toFixed(2)}</span></span>
          <span>H <span className="text-foreground">{ohlc.high.toFixed(2)}</span></span>
          <span>L <span className="text-foreground">{ohlc.low.toFixed(2)}</span></span>
          <span>
            C{" "}
            <span className={ohlc.close >= ohlc.open ? "text-pos" : "text-neg"}>
              {ohlc.close.toFixed(2)}
            </span>
          </span>
          <span>Vol <span className="text-foreground">{ohlc.volume.toLocaleString()}</span></span>
        </div>
      )}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: type error on `bar.open` (lightweight-charts' `SeriesDataItemTypeMap` union isn't narrowed by `"open" in bar` alone in strict mode) — if so, cast: `const bar = param.time ? (param.seriesData.get(candleSeries) as { open: number; high: number; low: number; close: number } | undefined) : undefined;` and drop the `"open" in bar` check in favor of `if (!bar) { ... }`. Re-run until clean.

#### Step 4: Label the volume pane

Wrap the chart canvas `<div>` in a relatively-positioned container and overlay a small label:

```tsx
      {/* Chart canvas */}
      <div className="relative w-full">
        <div ref={containerRef} className="w-full" />
        <span className="pointer-events-none absolute bottom-1 left-2 font-mono text-[11px] text-muted">
          Vol
        </span>
      </div>
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 5: Extend the Task-11 chart mock and test the new controls + legend

Open `dashboard/components/charts/__tests__/CandleChart.test.tsx`. Add `subscribeCrosshairMove: vi.fn()` to the existing `fakeChart` object literal:

```tsx
const fakeChart = {
  addCandlestickSeries: vi.fn(() => candleSeries),
  addHistogramSeries: vi.fn(() => fakeSubSeries()),
  addLineSeries: vi.fn(() => fakeSubSeries()),
  priceScale: vi.fn(() => fakeScale()),
  timeScale: vi.fn(() => fakeScale()),
  subscribeCrosshairMove: vi.fn(),
  applyOptions: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
};
```

Append a new `describe` block at the end of the file:

```tsx
describe("CandleChart controls + OHLC legend (TK-12, TK-13)", () => {
  it("exposes the range pills as a radiogroup and EMA chips as pressed toggles", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByRole("radiogroup", { name: "Chart range" })).toBeInTheDocument());
    expect(screen.getByRole("radio", { name: "6M" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "20" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the log control as a real switch, not a pill button", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Log price scale" })).toBeInTheDocument());
  });

  it("seeds the OHLC legend from the last bar on mount", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByText("11.00")).toBeInTheDocument());
  });

  it("shows a Vol label on the volume pane", async () => {
    render(<CandleChart ticker="NVDA" initialBars={bars} />);
    await waitFor(() => expect(screen.getByText("Vol")).toBeInTheDocument());
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/charts/__tests__/CandleChart.test.tsx && npx tsc --noEmit
```
Expected: 6 passed (2 from Task 11 + 4 new), then no type errors.

---

### Task 20: `ChartInfoStrip` rebuilt on `StatChip` (closes TK-14)

Confirmed in `components/ticker/ChartInfoStrip.tsx`: six facts (session state, close, day range, volume-vs-avg, 52-week range, extended-hours price) are concatenated into one 12px mono flex line with no chip boundaries between most of them (lines 30-59) — only the session-state label has a border. `components/ui/StatChip.tsx` already exists in the codebase (a pre-existing shared `components/ui/` component, bordered label+value pill with an optional `tone` and `tooltip`) and is the natural fit — this task is a pure consumption/rewrite, no new primitive.

**Files:**
- `dashboard/components/ticker/ChartInfoStrip.tsx` (modify)
- `dashboard/components/ticker/__tests__/ChartInfoStrip.test.tsx` (new)

**Audit findings closed:**
- TK-14: confirmed — six facts rendered as one run-on mono line with only one of them chip-bounded.

#### Step 1: Import `StatChip` and replace the flex line's contents

Open `dashboard/components/ticker/ChartInfoStrip.tsx`. Add the import:

```tsx
import StatChip from "@/components/ui/StatChip";
```

Replace the return block's contents (everything inside the outer `<div className="flex flex-wrap ...">`) with:

```tsx
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 px-0.5">
      <StatChip label="Session" value={STATE_LABEL[state]} />
      <StatChip label="Close" value={last.close.toFixed(2)} />
      <StatChip label="Range" value={`${last.low.toFixed(2)}–${last.high.toFixed(2)}`} />
      {volX !== null && (
        <StatChip
          label="Vol"
          value={`${volX.toFixed(1)}× avg`}
          tone={volX >= 1.5 ? "warn" : undefined}
        />
      )}
      {r52 && (
        <StatChip
          label="52w"
          value={`${r52.lo.toFixed(0)}–${r52.hi.toFixed(0)} (${Math.round(r52.pos * 100)}%)`}
        />
      )}
      {extended && ext && extPct !== null && (
        <StatChip
          label={state === "pre" ? "Pre" : "After"}
          value={`${ext.price.toFixed(2)} (${extPct >= 0 ? "+" : ""}${extPct.toFixed(1)}%)`}
          tone={extPct >= 0 ? "pos" : "neg"}
        />
      )}
    </div>
  );
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 2: Confirm the run-on mono line is gone

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && grep -n "font-mono text-\[12px\] tabular-nums text-muted" components/ticker/ChartInfoStrip.tsx
```
Expected: no matches (that class combination lived on the old single run-on `<div>`, now replaced by discrete `StatChip`s).

#### Step 3: Visual pass in the browser

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npm run dev
```
Open `http://localhost:3000/t/AAPL`. Expected: below the chart controls, a row of individually-bordered chips (Session / Close / Range / Vol / 52w[/ Pre or After]) instead of one continuous mono sentence.

#### Step 4: Confirm `StatChip`'s tone/tooltip props still type-check with no changes to `StatChip.tsx` itself

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && git diff --stat components/ui/StatChip.tsx
```
Expected: no output (this task consumes the existing primitive as-is; it is not modified).

#### Step 5: Test the chip-per-fact rendering

Create `dashboard/components/ticker/__tests__/ChartInfoStrip.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import ChartInfoStrip from "@/components/ticker/ChartInfoStrip";
import type { Bar } from "@/components/charts/CandleChart";

const bars: Bar[] = Array.from({ length: 30 }, (_, i) => ({
  ts: `2026-06-${String(i + 1).padStart(2, "0")}`,
  open: 100 + i,
  high: 101 + i,
  low: 99 + i,
  close: 100.5 + i,
  volume: 1_000_000 + i * 1000,
}));

describe("ChartInfoStrip", () => {
  it("renders each fact as a discrete labelled chip", () => {
    render(<ChartInfoStrip ticker="AAPL" bars={bars} />);
    expect(screen.getByText("Session")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();
    const last = bars[bars.length - 1];
    expect(screen.getByText(last.close.toFixed(2))).toBeInTheDocument();
  });

  it("returns null when there is no bar data", () => {
    const { container } = render(<ChartInfoStrip ticker="AAPL" bars={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/ChartInfoStrip.test.tsx && npx tsc --noEmit
```
Expected: 2 passed, then no type errors.

---

### Task 21: Prev/next ticker nav + breadcrumb (closes TK-15)

Confirmed: `app/t/[ticker]/page.tsx` has no breadcrumb and no prev/next affordance — the only way back to Today is the browser's back button, and there is no way to step to the next/previous ticker in whatever list you opened this one from. Confirmed `components/today/SignalGroups.tsx` has a single shared `onOpen = (r: BridgeRow) => router.push(...)` (line 530) passed identically to all four `GroupTable` instances (lines 598, 613, plus the two other `GROUP_META`-mapped instances) — it currently has no way to know which group's filtered/sorted row list the click came from.

Depends on Task 7 of `01-phase0-test-infra.md` (`dashboard/playwright.config.ts` + `dashboard/e2e/routes.spec.ts`, `testDir: "./e2e"`, `npm run test:e2e`) — this task's e2e spec is a sibling file in that same `e2e/` directory.

**Files:**
- `dashboard/lib/tickerNav.ts` (new)
- `dashboard/lib/__tests__/tickerNav.test.ts` (new)
- `dashboard/components/today/SignalGroups.tsx` (modify — `onOpen` becomes group-aware)
- `dashboard/components/ticker/TickerNav.tsx` (new)
- `dashboard/components/ticker/__tests__/TickerNav.test.tsx` (new)
- `dashboard/app/t/[ticker]/page.tsx` (modify — render `<TickerNav>`)
- `dashboard/e2e/today-to-ticker-nav.spec.ts` (new)

**Interfaces:**
```typescript
// lib/tickerNav.ts
export interface TickerNavState {
  group: string;
  tickers: string[];
}
export function setTickerNav(group: string, tickers: string[]): void;
export function getTickerNav(): TickerNavState | null;
```

**Audit findings closed:**
- TK-15: confirmed — no prev/next, no breadcrumb; return trip is browser-back only. Fixed with a `sessionStorage`-backed nav list (written by whichever Today group table the row was opened from) plus a breadcrumb-only fallback when that state is absent (deep link, page refresh, or a ticker outside the stored list).

**Note on storage key:** `dash:ticker-nav` is `sessionStorage`, not `localStorage` — it is deliberately not added to `lib/storageKeys.ts`'s `STATIC_KEYS`/`DYNAMIC_KEY_PREFIXES`/`LEGACY_KEY_PREFIXES`, since that registry (and `resetAllStoredPrefs()`) is scoped to persistent `localStorage` preferences, not ephemeral per-session navigation state.

#### Step 1: `lib/tickerNav.ts` — write/read the session-scoped nav list

Create `dashboard/lib/tickerNav.ts`:

```typescript
const KEY = "dash:ticker-nav";

export interface TickerNavState {
  group: string;
  tickers: string[];
}

export function setTickerNav(group: string, tickers: string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ group, tickers }));
  } catch {
    // sessionStorage unavailable (private mode, SSR) — nav degrades to breadcrumb-only
  }
}

export function getTickerNav(): TickerNavState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as TickerNavState).group === "string" &&
      Array.isArray((parsed as TickerNavState).tickers)
    ) {
      return parsed as TickerNavState;
    }
    return null;
  } catch {
    return null;
  }
}
```

Create `dashboard/lib/__tests__/tickerNav.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { setTickerNav, getTickerNav } from "@/lib/tickerNav";

beforeEach(() => sessionStorage.clear());

describe("tickerNav", () => {
  it("round-trips group + ticker list through sessionStorage", () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA", "AVGO"]);
    expect(getTickerNav()).toEqual({ group: "ALIGNED", tickers: ["AAPL", "NVDA", "AVGO"] });
  });

  it("returns null when nothing has been stored", () => {
    expect(getTickerNav()).toBeNull();
  });

  it("returns null for malformed stored JSON", () => {
    sessionStorage.setItem("dash:ticker-nav", "{not json");
    expect(getTickerNav()).toBeNull();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=lib lib/__tests__/tickerNav.test.ts
```
Expected: 3 passed.

#### Step 2: `SignalGroups.tsx` — make `onOpen` group-aware

Open `dashboard/components/today/SignalGroups.tsx`. Add the import:

```tsx
import { setTickerNav } from "@/lib/tickerNav";
```

Replace the single shared `onOpen`:

```tsx
  const onOpen = (r: BridgeRow) => router.push(`/t/${r.ticker}`);
```

with a group-aware version:

```tsx
  const onOpen = (r: BridgeRow, group: string, rows: BridgeRow[]) => {
    setTickerNav(group, rows.map((row) => row.ticker.toUpperCase()));
    router.push(`/t/${r.ticker}`);
  };
```

Update the `GROUP_META`-mapped `GroupTable` instance to close over its own group's title and row list:

```tsx
          <GroupTable
            rows={sorted[g.key]}
            newSet={newSet}
            onOpen={(r) => onOpen(r, g.title, sorted[g.key])}
            persistKey={`today-${g.key}`}
          />
```

and the "Everything else" instance:

```tsx
        <GroupTable
          rows={sorted.other}
          newSet={newSet}
          onOpen={(r) => onOpen(r, "EVERYTHING ELSE", sorted.other)}
          persistKey="today-other-table"
        />
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 3: `TickerNav.tsx` — breadcrumb, or breadcrumb + prev/next when the session list applies

Create `dashboard/components/ticker/TickerNav.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTickerNav, type TickerNavState } from "@/lib/tickerNav";

export default function TickerNav({ ticker }: { ticker: string }) {
  const [nav, setNav] = useState<TickerNavState | null>(null);
  const upper = ticker.toUpperCase();

  useEffect(() => {
    setNav(getTickerNav());
  }, []);

  if (!nav || !nav.tickers.includes(upper)) {
    return (
      <Link
        href="/"
        className="inline-flex items-center gap-1 font-mono text-[12px] text-muted hover:text-foreground transition-colors"
      >
        <ChevronLeft size={12} /> Today
      </Link>
    );
  }

  const idx = nav.tickers.indexOf(upper);
  const prev = idx > 0 ? nav.tickers[idx - 1] : null;
  const next = idx < nav.tickers.length - 1 ? nav.tickers[idx + 1] : null;

  return (
    <div className="flex items-center gap-2 font-mono text-[12px] text-muted">
      <Link href="/" className="hover:text-foreground transition-colors">
        Today
      </Link>
      <span className="text-line">/</span>
      <span>{nav.group}</span>
      <span className="text-line">|</span>
      {prev ? (
        <Link
          href={`/t/${prev}`}
          aria-label={`Previous: ${prev}`}
          className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          <ChevronLeft size={12} /> {prev}
        </Link>
      ) : (
        <span className="inline-flex items-center opacity-30">
          <ChevronLeft size={12} />
        </span>
      )}
      <span className="text-foreground">{upper}</span>
      {next ? (
        <Link
          href={`/t/${next}`}
          aria-label={`Next: ${next}`}
          className="inline-flex items-center gap-0.5 hover:text-foreground transition-colors"
        >
          {next} <ChevronRight size={12} />
        </Link>
      ) : (
        <span className="inline-flex items-center opacity-30">
          <ChevronRight size={12} />
        </span>
      )}
    </div>
  );
}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 4: Wire `TickerNav` into the ticker page

Open `dashboard/app/t/[ticker]/page.tsx`. Add the import:

```tsx
import TickerNav from "@/components/ticker/TickerNav";
```

Insert as the first child of `<main>`, before the Header section:

```tsx
    <main className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
      <TickerNav ticker={ticker} />
      <section>
        <Header
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 5: Test breadcrumb-only fallback, prev/next rendering, and the end-to-end Today→ticker→prev/next flow

Create `dashboard/components/ticker/__tests__/TickerNav.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@/test/render";
import TickerNav from "@/components/ticker/TickerNav";
import { setTickerNav } from "@/lib/tickerNav";

beforeEach(() => sessionStorage.clear());

describe("TickerNav", () => {
  it("falls back to a plain breadcrumb when no session nav state exists", async () => {
    render(<TickerNav ticker="AAPL" />);
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Previous:/)).toBeNull();
  });

  it("shows prev/next links scoped to the stored group when the ticker is in the list", async () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA", "AVGO"]);
    render(<TickerNav ticker="NVDA" />);
    expect(await screen.findByText("ALIGNED")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous: AAPL")).toHaveAttribute("href", "/t/AAPL");
    expect(screen.getByLabelText("Next: AVGO")).toHaveAttribute("href", "/t/AVGO");
  });

  it("disables the prev arrow at the start of the list and the next arrow at the end", async () => {
    setTickerNav("ALIGNED", ["AAPL", "NVDA"]);
    render(<TickerNav ticker="AAPL" />);
    await screen.findByText("ALIGNED");
    expect(screen.queryByLabelText(/Previous:/)).toBeNull();
    expect(screen.getByLabelText("Next: NVDA")).toBeInTheDocument();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/TickerNav.test.tsx
```
Expected: 3 passed.

Create `dashboard/e2e/today-to-ticker-nav.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test("opening a ticker from a Today group table enables prev/next scoped to that group", async ({ page }) => {
  await page.goto("/");
  const firstGroupPanel = page.locator("table").first();
  const firstRowTicker = await firstGroupPanel.locator("tbody tr").first().locator("td").first().innerText();

  await firstGroupPanel.locator("tbody tr").first().click();
  await expect(page).toHaveURL(new RegExp(`/t/${firstRowTicker.trim()}$`, "i"));

  await expect(page.getByText("Today")).toBeVisible();
  const nextLink = page.getByLabel(/^Next:/);
  if (await nextLink.count()) {
    await expect(nextLink).toBeVisible();
  }
});

test("visiting a ticker page directly (no Today session state) shows a breadcrumb only", async ({ page }) => {
  await page.goto("/t/AAPL");
  await expect(page.getByText("Today")).toBeVisible();
  await expect(page.getByLabel(/^Previous:/)).toHaveCount(0);
  await expect(page.getByLabel(/^Next:/)).toHaveCount(0);
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npm run test:e2e -- e2e/today-to-ticker-nav.spec.ts
```
Expected: 2 passed against a locally-booted `next dev` server. (If the bridge fixture in the dev environment has zero rows in every Today group, the first test's `firstRowTicker` extraction will be empty and the test should be treated as environment-dependent — re-run after confirming `reports/bridge_latest.csv` has at least one row per the standard dev-fixture setup used by `01-phase0-test-infra.md`.)

---

### Task 22: Distinguish "timed out" from "no data" on the ticker chart, with a real Retry (closes TK-16)

Confirmed in `app/t/[ticker]/page.tsx` lines 19-31: `fetchHistory`'s `catch` block collapses every failure mode — network error, 5s `AbortSignal.timeout`, non-OK response, and a genuinely-empty `bars` array — into the same bare `return []`. Downstream, `CandleChart` treats an empty array as one undifferentiated `<EmptyState message="no chart data" />` (confirmed, `CandleChart.tsx` line 352-354) with no retry affordance. Separately, `app/api/argus/[...path]/route.ts` (the client-reachable proxy already used by `OptionsPanel`/`AiPanel`) already distinguishes a real timeout (`504`, `{error: "argus timeout"}`) from a generic offline error (`503`) — this task reuses that existing distinction rather than inventing a new one.

**Files:**
- `dashboard/app/t/[ticker]/page.tsx` (modify)
- `dashboard/components/ticker/TickerChartSection.tsx` (modify — extends Task 11's version)
- `dashboard/components/ticker/__tests__/TickerChartSection.test.tsx` (new)

**Audit findings closed:**
- TK-16: confirmed — `fetchHistory`'s `catch` (and its `!res.ok` branch) discard the distinction between "the 5s server-side timeout fired" and "the ticker legitimately has no history", and there was no retry affordance at all.

#### Step 1: `fetchHistory` returns a discriminated result instead of a bare array

Open `dashboard/app/t/[ticker]/page.tsx`. Replace `fetchHistory`:

```tsx
type HistoryResult =
  | { status: "ok"; bars: Bar[] }
  | { status: "timeout" }
  | { status: "no-data" }
  | { status: "error" };

async function fetchHistory(ticker: string): Promise<HistoryResult> {
  try {
    const res = await fetch(
      `http://127.0.0.1:8088/api/history/${encodeURIComponent(ticker)}?period=2y`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { status: "error" };
    const json = (await res.json()) as { bars: Bar[] };
    const bars = json.bars ?? [];
    return bars.length > 0 ? { status: "ok", bars } : { status: "no-data" };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") return { status: "timeout" };
    return { status: "error" };
  }
}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: type errors at every call site that destructured `fetchHistory`'s old `Bar[]` return directly — fixed in Step 2.

#### Step 2: Adapt `TickerPage` to the discriminated result

Still in `page.tsx`, change:

```tsx
  const [bars, bridgeRow, history] = await Promise.all([
    fetchHistory(ticker),
```

to:

```tsx
  const [historyResult, bridgeRow, history] = await Promise.all([
    fetchHistory(ticker),
```

and immediately after the `Promise.all`, derive `bars` for the existing downstream consumers (markers, `lastClose`) exactly as before:

```tsx
  const bars = historyResult.status === "ok" ? historyResult.bars : [];
```

Pass the status through to `TickerChartSection` (added in Step 3):

```tsx
  <TickerChartSection
    ticker={ticker}
    bridgeRow={bridgeRow}
    initialBars={bars}
    initialStatus={historyResult.status}
    markers={markers}
    height={420}
    className="min-h-[420px] 2xl:min-h-[560px]"
  />
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 3: `TickerChartSection` renders a status-specific empty state with Retry

Open `dashboard/components/ticker/TickerChartSection.tsx` (from Task 11). Add the status type, the new prop, local `bars`/`status`/`retrying` state, and a client-side `retry()` that calls the existing `/api/argus/history/{ticker}` proxy route:

```tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import CandleChart, { type Bar, type Marker } from "@/components/charts/CandleChart";
import EmptyState from "@/components/ui/EmptyState";
import { useTickerData } from "@/lib/useTickerData";
import { deriveLevels, levelsToChartLevels } from "@/lib/levels";
import type { BridgeRow } from "@/types/bridge";

type HistoryStatus = "ok" | "timeout" | "no-data" | "error";

interface TickerChartSectionProps {
  ticker: string;
  bridgeRow: BridgeRow | null;
  initialBars: Bar[];
  initialStatus: HistoryStatus;
  markers: Marker[];
  height?: number;
  className?: string;
}

export default function TickerChartSection({
  ticker,
  bridgeRow,
  initialBars,
  initialStatus,
  markers,
  height = 420,
  className,
}: TickerChartSectionProps) {
  const [bars, setBars] = useState(initialBars);
  const [status, setStatus] = useState<HistoryStatus>(initialStatus);
  const [retrying, setRetrying] = useState(false);
  const { actionCard } = useTickerData(ticker);

  const levels = useMemo(
    () => (bridgeRow ? levelsToChartLevels(deriveLevels(bridgeRow, actionCard.data)) : []),
    [bridgeRow, actionCard.data]
  );

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/argus/history/${ticker}?period=2y`, { cache: "no-store" });
      if (res.status === 504) {
        setStatus("timeout");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const json = (await res.json()) as { bars: Bar[] };
      const nextBars = json.bars ?? [];
      if (nextBars.length === 0) {
        setStatus("no-data");
        return;
      }
      setBars(nextBars);
      setStatus("ok");
    } catch {
      setStatus("error");
    } finally {
      setRetrying(false);
    }
  }, [ticker]);

  if (status !== "ok") {
    const message =
      status === "timeout"
        ? `History request for ${ticker} timed out`
        : status === "no-data"
        ? `No historical bars available for ${ticker}`
        : `Couldn't load history for ${ticker}`;
    return (
      <div className={className}>
        <EmptyState message={message} />
        {status !== "no-data" && (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="mt-2 font-mono text-[11px] text-accent border border-accent/40 rounded px-2 py-0.5 hover:bg-accent/10 transition-colors disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}
      </div>
    );
  }

  return (
    <CandleChart
      ticker={ticker}
      initialBars={bars}
      initialPeriod="6M"
      levels={levels}
      markers={markers}
      height={height}
      className={className}
    />
  );
}
```

Note: "no-data" gets no Retry button — retrying an empty-history ticker against the same 2y window cannot change the outcome; only "timeout" and "error" are transient and worth retrying.

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 4: Confirm the proxy route's existing timeout/offline distinction is what Retry relies on

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && grep -n "TimeoutError\|504\|503" "app/api/argus/[...path]/route.ts"
```
Expected: the `GET` handler's existing `if (err instanceof Error && err.name === "TimeoutError") return Response.json({ error: "argus timeout" }, { status: 504 });` — confirms Step 3's `res.status === 504` branch maps onto a real, already-shipped distinction rather than a new backend contract.

#### Step 5: Test the three non-OK states and a successful retry

Create `dashboard/components/ticker/__tests__/TickerChartSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { mockFetchJson } from "@/test/fetchMock";
import TickerChartSection from "@/components/ticker/TickerChartSection";
import type { BridgeRow } from "@/types/bridge";

vi.mock("@/components/charts/CandleChart", () => ({
  default: ({ ticker }: { ticker: string }) => <div data-testid="chart">{ticker}</div>,
}));

beforeEach(() => {
  mockFetchJson({ "/api/action_card/AAPL": {} });
});

describe("TickerChartSection", () => {
  it("shows a timeout-specific message and a Retry button", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="timeout"
        markers={[]}
      />
    );
    expect(screen.getByText(/timed out/)).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows a no-data message with no Retry button", () => {
    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="no-data"
        markers={[]}
      />
    );
    expect(screen.getByText(/No historical bars available/)).toBeInTheDocument();
    expect(screen.queryByText("Retry")).toBeNull();
  });

  it("renders the chart on a successful retry after a timeout", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).includes("/api/action_card/")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ bars: [{ ts: "2026-06-01", open: 1, high: 2, low: 1, close: 1.5, volume: 100 }] }) } as Response;
    });

    render(
      <TickerChartSection
        ticker="AAPL"
        bridgeRow={null}
        initialBars={[]}
        initialStatus="timeout"
        markers={[]}
      />
    );
    await user.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByTestId("chart")).toBeInTheDocument());
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/TickerChartSection.test.tsx && npx tsc --noEmit
```
Expected: 3 passed, then no type errors.

---

### Task 23: `HistoryCard` gets a real expand toggle instead of static "+N older" text (closes TK-17)

Confirmed, `components/ticker/HistoryCard.tsx` lines 37-79: `shown = ordered.slice(0, 10)`, and when there are more than 10 rows the remainder is announced as a plain, non-interactive `<p>+{older} older</p>` — there is no way to actually see those rows short of a data-source change.

**Files:**
- `dashboard/components/ticker/HistoryCard.tsx` (modify)
- `dashboard/components/ticker/__tests__/HistoryCard.test.tsx` (new)

**Audit findings closed:**
- TK-17: confirmed — capped at 10 rows, "+N older" is static text with no expand affordance.

#### Step 1: Make `HistoryCard` a client component with expand state

Open `dashboard/components/ticker/HistoryCard.tsx`. Add `"use client";` as the first line and import `useState`:

```tsx
"use client";

import { useState } from "react";
import Panel from "@/components/ui/Panel";
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 2: Replace the fixed 10-row slice with expand/collapse state

Replace:

```tsx
  // Most recent first
  const ordered = [...rows].reverse();
  const shown = ordered.slice(0, 10);
  const older = ordered.length - shown.length;
```

with:

```tsx
  // Most recent first
  const ordered = [...rows].reverse();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? ordered : ordered.slice(0, 10);
  const older = ordered.length - Math.min(10, ordered.length);
```

(the `useState` call must come after the early `rows.length === 0` return, since that return happens before any hook currently in the file — move the `if (rows.length === 0) return ...` block below the `useState` declaration so hook order stays unconditional; the `ordered`/`shown`/`older` computations can stay above or below it as long as `useState` itself is never behind the conditional return).

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors (a `react-hooks/rules-of-hooks` lint error is expected if the early return still precedes `useState` — fixed by the reordering just described).

#### Step 3: Replace the static "+N older" line with a real toggle button

Replace:

```tsx
        {older > 0 && (
          <p className="text-[11px] text-muted">+{older} older</p>
        )}
```

with:

```tsx
        {older > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[11px] text-accent hover:text-foreground transition-colors"
          >
            {expanded ? "Show fewer" : `+${older} older — show all`}
          </button>
        )}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors.

#### Step 4: Sanity-read the reordered component

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && grep -n "useState\|rows.length === 0\|return" components/ticker/HistoryCard.tsx | head -10
```
Expected: `useState` call appears before the `rows.length === 0` conditional `return` in the file.

#### Step 5: Test expand/collapse reveals and re-hides the older rows

Create `dashboard/components/ticker/__tests__/HistoryCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import HistoryCard from "@/components/ticker/HistoryCard";

const rows = Array.from({ length: 13 }, (_, i) => ({
  date: `2026-0${(i % 9) + 1}-01`,
  report_group: "aligned",
  action_label: "PRIME_LONG",
  combined_score: 1.2,
  entry: 100 + i,
}));

describe("HistoryCard", () => {
  it("shows 10 rows and an expand button when there are more than 10", () => {
    render(<HistoryCard rows={rows} lastClose={110} />);
    expect(screen.getAllByRole("row")).toHaveLength(11); // 10 data rows + header
    expect(screen.getByText("+3 older — show all")).toBeInTheDocument();
  });

  it("reveals all rows on click, then collapses back on a second click", async () => {
    const user = userEvent.setup();
    render(<HistoryCard rows={rows} lastClose={110} />);

    await user.click(screen.getByText("+3 older — show all"));
    expect(screen.getAllByRole("row")).toHaveLength(14); // 13 data rows + header
    expect(screen.getByText("Show fewer")).toBeInTheDocument();

    await user.click(screen.getByText("Show fewer"));
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("renders no expand affordance when there are 10 or fewer rows", () => {
    render(<HistoryCard rows={rows.slice(0, 5)} lastClose={110} />);
    expect(screen.queryByText(/older/)).toBeNull();
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component components/ticker/__tests__/HistoryCard.test.tsx && npx tsc --noEmit
```
Expected: 3 passed, then no type errors.

---

### Task 24: `/glossary` — a real page for `lib/labels.ts`, cross-linked from the combo-decode `InfoTip` (roadmap item 11; partially closes UI-09/A11Y-01)

A11Y-01's stated fix is explicit: "a glossary page + visible legends + focusable triggers." `InfoTip` (the frozen contract primitive consumed throughout this plan) is already a real focusable `<button>` — the missing piece is a durable, linkable page behind the tooltips, so the same explanation is reachable without hover (keyboard, screen reader, touch, or a plain bookmark). `lib/labels.ts` (Phase 1) is the single source of truth for every abbreviation/status-value gloss in the app; this task renders all ten of its exported maps as one reference page and wires one concrete cross-link from this plan's own new UI (Task 15's combo-decode `InfoTip`) into it.

**Scope note:** UI-09's broader complaint — `Badge`, `ConvictionDot`, `ChipTooltip`, `CatalystCount`, `QuadrantDot`, `DRank`, `Th` wrapping non-focusable `cursor-default` spans — lives in shared primitives and `RotationPanel.tsx`, both explicitly out of this phase's scope (shared primitives are Phase 1's; Rotation-as-its-own-page is excluded per the brief). This task closes the glossary-page component of A11Y-01's fix and adds one verified cross-link from Task 15's own new `InfoTip` usage; it does not make those other components' triggers focusable.

**Files:**
- `dashboard/lib/glossarySlug.ts` (new)
- `dashboard/lib/__tests__/glossarySlug.test.ts` (new)
- `dashboard/app/glossary/page.tsx` (new)
- `dashboard/app/glossary/__tests__/page.test.tsx` (new)
- `dashboard/components/ticker/WhyPanel.tsx` (modify — retrofit Task 15's combo-decode `InfoTip` with a glossary link)

**Interfaces:**
```typescript
// lib/glossarySlug.ts
export function glossarySlug(key: string): string;
```

**Audit findings closed:**
- Roadmap item 11 (glossary page) / A11Y-01 (glossary-page component of the fix, per the note above).

#### Step 1: `lib/glossarySlug.ts` — stable anchor ids for every glossary term

`lib/labels.ts` keys include symbols (`⚑`, `◉`), short codes (`C`, `n`), and hyphenated names (`RS-Ratio`) that don't slugify cleanly by generic rules alone — an explicit override table handles those, with a generic lowercase/dash fallback for everything else (e.g. combo family keys like `ma_trend`).

Create `dashboard/lib/glossarySlug.ts`:

```typescript
const OVERRIDES: Record<string, string> = {
  "⚑": "flags",
  "◉": "quadrant",
  "Δrank": "drank",
  "RS-Ratio": "rs-ratio",
  "RS-Mom": "rs-mom",
  C: "conviction",
  Cat: "catalysts",
  Sent: "sentiment-leg",
  Tech: "technical-leg",
  Fund: "fundamental-leg",
  n: "basket-size",
};

export function glossarySlug(key: string): string {
  if (key in OVERRIDES) return OVERRIDES[key];
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

Create `dashboard/lib/__tests__/glossarySlug.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { glossarySlug } from "@/lib/glossarySlug";

describe("glossarySlug", () => {
  it("maps known symbol/abbreviation keys via the override table", () => {
    expect(glossarySlug("⚑")).toBe("flags");
    expect(glossarySlug("RS-Ratio")).toBe("rs-ratio");
    expect(glossarySlug("C")).toBe("conviction");
  });

  it("falls back to a generic lowercase-dash slug for plain keys", () => {
    expect(glossarySlug("ma_trend")).toBe("ma-trend");
    expect(glossarySlug("PRIME_LONG")).toBe("prime-long");
  });
});
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=lib lib/__tests__/glossarySlug.test.ts
```
Expected: 2 passed.

#### Step 2: `app/glossary/page.tsx` — render every `lib/labels.ts` map

Create `dashboard/app/glossary/page.tsx`:

```tsx
import Link from "next/link";
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
import { glossarySlug } from "@/lib/glossarySlug";

function GlossarySection({ title, entries }: { title: string; entries: [string, string][] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-mono text-[13px] font-medium text-foreground uppercase tracking-wide">
        {title}
      </h2>
      <dl className="space-y-2">
        {entries.map(([term, gloss]) => (
          <div
            key={term}
            id={glossarySlug(term)}
            className="scroll-mt-[calc(var(--nav-h)+12px)] border-b border-line pb-2"
          >
            <dt className="font-mono text-[13px] text-foreground">{term}</dt>
            <dd className="text-[13px] text-muted leading-relaxed">{gloss}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function GlossaryPage() {
  const greekEntries: [string, string][] = Object.entries(GREEK_LABEL).map(([k, v]) => [
    k,
    `${v.symbol} — ${v.gloss}`,
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <Link
          href="/"
          className="font-mono text-[12px] text-muted hover:text-foreground transition-colors"
        >
          ← Today
        </Link>
        <h1 className="text-[18px] font-medium text-foreground">Glossary</h1>
        <p className="text-[13px] text-muted leading-relaxed">
          Every abbreviation, badge, and status value used across the dashboard, in one place —
          the same text shown in each info-tip, reachable without a hover.
        </p>
      </div>
      <GlossarySection title="Table headers" entries={Object.entries(HEADER_GLOSS)} />
      <GlossarySection title="Rotation quadrant" entries={Object.entries(QUADRANT_LABEL)} />
      <GlossarySection title="Combo decode — positions" entries={COMBO_POSITION_LABEL}
      />
      <GlossarySection title="Combo decode — letters" entries={Object.entries(COMBO_LETTER_LABEL)} />
      <GlossarySection title="Verdict" entries={Object.entries(VERDICT_LABEL)} />
      <GlossarySection title="Conviction tier" entries={Object.entries(TIER_LABEL)} />
      <GlossarySection title="Options ladder codes" entries={Object.entries(LADDER_CODE_LABEL)} />
      <GlossarySection title="Option greeks" entries={greekEntries} />
      <GlossarySection title="Portfolio edge" entries={Object.entries(PORTFOLIO_EDGE_LABEL)} />
      <GlossarySection title="Watchlist status" entries={Object.entries(WATCHLIST_STATUS_LABEL)} />
    </main>
  );
}
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors. (`COMBO_POSITION_LABEL` is already typed as `[family: string, gloss: string][]` — matches `GlossarySection`'s `entries` prop with no cast needed.)

#### Step 3: Retrofit Task 15's combo-decode `InfoTip` to link into the glossary

Open `dashboard/components/ticker/WhyPanel.tsx`. Add the two new imports alongside the ones Task 15 already added:

```tsx
import Link from "next/link";
import { glossarySlug } from "@/lib/glossarySlug";
```

Replace the `InfoTip` inside the positional combo-decode loop (written in Task 15, Step 4):

```tsx
            <InfoTip key={family} content={`${gloss} ${COMBO_LETTER_LABEL[letter]}.`}>
```

with:

```tsx
            <InfoTip
              key={family}
              content={
                <>
                  {gloss} {COMBO_LETTER_LABEL[letter]}.{" "}
                  <Link
                    href={`/glossary#${glossarySlug(family)}`}
                    className="underline decoration-dotted text-accent"
                  >
                    Glossary ↗
                  </Link>
                </>
              }
            >
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx tsc --noEmit
```
Expected: no type errors (`InfoTip`'s `content` prop is typed `ReactNode`, so a fragment is a valid replacement for the previous plain string).

#### Step 4: Confirm every glossary anchor id is unique

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && node -e "
const { HEADER_GLOSS, QUADRANT_LABEL, COMBO_POSITION_LABEL, COMBO_LETTER_LABEL, LADDER_CODE_LABEL, GREEK_LABEL, PORTFOLIO_EDGE_LABEL, VERDICT_LABEL, TIER_LABEL, WATCHLIST_STATUS_LABEL } = require('./lib/labels.ts');
" 2>/dev/null; npx tsx -e "
import { HEADER_GLOSS, QUADRANT_LABEL, COMBO_POSITION_LABEL, COMBO_LETTER_LABEL, LADDER_CODE_LABEL, GREEK_LABEL, PORTFOLIO_EDGE_LABEL, VERDICT_LABEL, TIER_LABEL, WATCHLIST_STATUS_LABEL } from './lib/labels';
import { glossarySlug } from './lib/glossarySlug';
const allKeys = [
  ...Object.keys(HEADER_GLOSS), ...Object.keys(QUADRANT_LABEL),
  ...COMBO_POSITION_LABEL.map(([f]) => f), ...Object.keys(COMBO_LETTER_LABEL),
  ...Object.keys(LADDER_CODE_LABEL), ...Object.keys(GREEK_LABEL),
  ...Object.keys(PORTFOLIO_EDGE_LABEL), ...Object.keys(VERDICT_LABEL),
  ...Object.keys(TIER_LABEL), ...Object.keys(WATCHLIST_STATUS_LABEL),
];
const slugs = allKeys.map(glossarySlug);
const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
console.log(dupes.length === 0 ? 'no duplicate slugs' : \`DUPLICATES: \${dupes.join(', ')}\`);
"
```
Expected: `no duplicate slugs`. (If a real collision surfaces — e.g. two maps independently using the key `"WAIT"` — add a per-section prefix to `GlossarySection`'s `id` before proceeding; the ids are per-section table rows, and `VERDICT_LABEL`/`TIER_LABEL` both legitimately have a `WAIT` entry, so this check is expected to actually catch that collision — resolve it by making `GlossarySection`'s id `${sectionSlug}-${glossarySlug(term)}` instead of a bare term slug, and update Step 3's link to `/glossary#combo-decode---positions-${glossarySlug(family)}` accordingly... concretely: prefix every section's ids with a short fixed section key (`headers-`, `quadrant-`, `combo-pos-`, `combo-letter-`, `verdict-`, `tier-`, `ladder-`, `greek-`, `edge-`, `watchlist-`) passed as a new `idPrefix` prop on `GlossarySection`, and update Step 3's href to `combo-pos-${glossarySlug(family)}`.)

#### Step 5: Test the page renders every section and the retrofit test

Create `dashboard/app/glossary/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import GlossaryPage from "@/app/glossary/page";

describe("GlossaryPage", () => {
  it("renders a HEADER_GLOSS term with an anchor id matching glossarySlug()", () => {
    render(<GlossaryPage />);
    const dt = screen.getByText("RS-Ratio");
    expect(dt.closest("div")).toHaveAttribute("id", "rs-ratio");
  });

  it("renders the combo-decode positions and letters sections", () => {
    render(<GlossaryPage />);
    expect(screen.getByText("ma_trend")).toBeInTheDocument();
    expect(screen.getByText("breakout")).toBeInTheDocument();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("links back to Today", () => {
    render(<GlossaryPage />);
    expect(screen.getByText("← Today")).toHaveAttribute("href", "/");
  });
});
```

Add a fourth test to `dashboard/components/ticker/__tests__/WhyPanel.test.tsx` (created in Task 15) confirming the retrofitted link:

```tsx
  it("links the combo-decode info-tip into the glossary", async () => {
    const user = userEvent.setup();
    mockFetchJson({ [`/api/action_card/AAPL`]: card({ combo: "LSNL" }) });
    render(<WhyPanel ticker="AAPL" />);
    await user.click(await screen.findByText("ma_trend"));
    expect(screen.getByText("Glossary ↗")).toHaveAttribute("href", "/glossary#ma-trend");
  });
```

Run:
```bash
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run --project=component app/glossary/__tests__/page.test.tsx components/ticker/__tests__/WhyPanel.test.tsx && npx tsc --noEmit
```
Expected: 3 passed (glossary page) + 4 passed (WhyPanel, 3 from Task 15 + 1 new), then no type errors.

---

## Audit findings that did not hold up

None. Every TD-xx (01–14) and TK-xx (01–18) finding cited in §5/§6 of `MARKET_ANALYSE_UI_AUDIT.md` was independently re-verified against the live source file before a task was written against it, per the brief's "verify before writing" requirement. TK-18 required no dedicated task — it was closed as a side effect of Task 10's `useTickerData()` hook, built primarily to satisfy TK-08/TK-09/TK-02's need for one non-duplicated ticker fetch.

## Roadmap items 11, 13, 17, 18, 20 — mapping confirmed

- **Item 11** (glossary/legend page; focusable tooltip triggers) — `Task 24`. `InfoTip` (contract-frozen, already a focusable `<button>`) supplies the trigger half; Task 24 supplies the missing durable page. Partial: UI-09's non-`InfoTip` triggers (`Badge`, `ConvictionDot`, `ChipTooltip`, `CatalystCount`, `QuadrantDot`, `DRank`, `Th`) live in shared primitives / `RotationPanel.tsx`, both out of this phase's scope — see Task 24's Scope note.
- **Item 13** (row-encoding diet on Today; unify period returns) — `Task 4` (TD-03/04/05/06, including the single `Ret` component unifying the 1D/1M heat chips with the 1W/6M/1Y text triple).
- **Item 17** (`useTickerData()` + `useMarketClock()` hooks) — split finding. `useTickerData()` (TK-18) closed by `Task 10`. `useMarketClock()` (G-05) is **not** in this plan: its fix targets `ContextStrip` and `LeftRail`'s `EquityBadge`, both explicitly out of scope (global nav/rails/context-strip); `ChartInfoStrip` — the one G-05-adjacent file this phase does touch, in Task 20 — was rewritten for chip layout only, not given a live tick, since a shared clock hook that only one of its three call sites could adopt would leave the other two (out of scope) still drifting. Recommend G-05 as a standalone Phase-1-or-later task once `ContextStrip`/`LeftRail` are in scope, so `useMarketClock()` is built once and adopted by all three sites together.
- **Item 18** (date navigation on Today) — `Task 2` (TD-01).
- **Item 20** (split votes accordion: agreement + family) — `Task 15` (TK-06, `WhyPanel`'s vote list grouped/sorted instead of dumped raw).

## Coverage table

| ID | Finding | Closed by |
|---|---|---|
| TD-01 | No date navigation | Task 2 |
| TD-02 | Filters silently empty a group | Task 3 |
| TD-03 | Nine encodings per row before expansion | Task 4 |
| TD-04 | Flags column appears/disappears across tables | Task 4 |
| TD-05 | Cryptic headers, inconsistently explained | Task 4 |
| TD-06 | Same metric, two representations (1D/1M chips vs 1W/6M/1Y text) | Task 4 |
| TD-07 | Caveats buried in tooltips/expanded rows | Task 5 |
| TD-08 | Expanded rows fetch per row, forever mounted | Task 6 |
| TD-09 | Morning Brief has no loading/error/collapse state | Task 7 |
| TD-10 | Brief news chips are plain `<a>`, full page loads | Task 7 |
| TD-11 | `DiffStrip` is a second collapsible implementation | Task 8 |
| TD-12 | Two warning banners can stack identically | Task 9 |
| TD-13 | Rotation summary computed but not rendered on Today | Task 1 |
| TD-14 | "Everything else" unexplained and defaulted closed | Task 5 |
| TK-01 | `/sources` chips are 404s | Task 12 |
| TK-02 | Chart levels never update (bridge vs `action_card`) | Task 11 |
| TK-03 | Seven stacked panels, no in-page navigation | Task 13 |
| TK-04 | Header's five hover-only badges, dead `style` color map | Task 14 |
| TK-05 | Orphan tooltip glyph (inflation gap) | Task 15 |
| TK-06 | Votes accordion ignores its own agreed/dissented summary | Task 15 |
| TK-07 | `COMBO_NOTE` 4-letter code with no gloss | Task 15 |
| TK-08 | `PriceRail` has no scale | Task 16 |
| TK-09 | Risk sizing is context-free (no account-% framing) | Task 16 |
| TK-10 | `AiPanel` can't be regenerated, output is raw `<pre>` | Task 17 |
| TK-11 | `OptionsPanel` repeats its own caveat, no table hierarchy | Task 18 |
| TK-12 | Chart controls conflate two toggle types | Task 19 |
| TK-13 | No OHLC/crosshair legend on the chart | Task 19 |
| TK-14 | `ChartInfoStrip` is one run-on mono line | Task 20 |
| TK-15 | No prev/next ticker, no back-to-Today | Task 21 |
| TK-16 | History timeout and no-data are indistinguishable | Task 22 |
| TK-17 | `HistoryCard` caps 10 rows, no expand | Task 23 |
| TK-18 | Duplicate SWR fetches held together by comments | Task 10 (built to satisfy TK-08/09/02's shared-fetch need; closes TK-18 as a side effect) |

**Not in this plan (confirmed out of scope, not skipped by oversight):** G-01/G-02/G-05/G-14 (global nav/rails/context-strip), SC-01/SC-02 (Screener), PF-01–04 (Portfolio), AL-01/AL-02 (Alerts), OD-01–03 (odte/Options), MC-01 (Macro), RO-03 (Rotation-as-page), LR-01/LR-05 (left rail), UI-02/08/10/12, X-01–08 (shared primitives — Phase 1's).
