# Phase A: Bug Sweep (B1–B8) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Binding rules:** master plan §4.1 (`docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md`). Scope boundary: files listed per task. Out-of-scope discoveries are reported, not fixed. B3 starts with a repro — never guess-fix.

**Goal:** Every bug from the 2026-06-12 feedback session fixed and regression-guarded: chart ranges + 200MA (B1/B2), sliver rows on Today (B3), empty Sources (B4), since-called display (B5), options panel during Sydney hours (B6/B7), chart info strip (B8).

**Architecture:** The chart stops refetching per range — it loads 2Y once and switches visible range client-side, which makes the 200-EMA computable everywhere. Sources reads an env-configured CSV with a designed empty state. The options panel renders the pricing fields the API already returns and labels market state honestly. New pure helpers (`chart-range`, `market-clock`, `bar-stats`, `called-since`) carry the logic and the unit tests.

**Tech Stack:** Next.js 14, React 18, lightweight-charts, SWR, vitest (`dashboard/lib/__tests__/`), Playwright smoke harness (`dashboard/scripts/smoke.mjs`), FastAPI/yfinance (one small Argus endpoint).

**Verified starting facts (2026-06-12):**
- `/api/history/{sym}?period=` works for 3mo/1y/2y (64/251/501 bars) — the API is not the bug.
- `CandleChart.tsx` refetches per range click; `computeEma()` returns `[]` when `bars < period` → EMA-200 impossible on 3M/6M.
- `dashboard/app/t/[ticker]/page.tsx:18` server-fetches `period=6mo`.
- `dashboard/app/api/accounts/route.ts` reads hardcoded `/Users/josephstorey/Market_Review/reports/account_backtest.csv`; file doesn't exist; route returns empty silently. Generator: `cd ~/Market_Review && PYTHONPATH=src <venv-python> -m stock_chatter.cli backtest`.
- Options flow payload rows carry `lastPrice`, `bid`, `ask`, `percentChange`, `volume`, `openInterest` — UI renders none of them; the only error copy is "IBKR offline" (source is yfinance).
- `Header.tsx:144-176` renders the `flagged Xd ago … +Y% since` line (B5 target).
- Quote endpoint returns `{price, change, change_pct, volume, ts}` — no pre/post fields; no `/api/extended` exists yet.

---

### Task 1: `chart-range` helper (pure date math)

**Files:**
- Create: `dashboard/lib/chart-range.ts`
- Test: `dashboard/lib/__tests__/chart-range.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/chart-range.test.ts
import { describe, expect, it } from "vitest";
import { visibleRangeFor } from "../chart-range";

const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("visibleRangeFor", () => {
  const first = ts("2024-06-12T00:00:00Z");
  const last = ts("2026-06-11T00:00:00Z");

  it("3M window ends at last bar and starts ~3 months back", () => {
    const r = visibleRangeFor("3M", first, last);
    expect(r.to).toBe(last);
    expect(r.from).toBe(ts("2026-03-11T00:00:00Z"));
  });

  it("2Y clamps to first available bar", () => {
    const r = visibleRangeFor("2Y", first, last);
    expect(r.from).toBe(first); // exactly 2y of data — clamped, not before history
  });

  it("clamps when history is shorter than the period", () => {
    const shortFirst = ts("2026-04-01T00:00:00Z");
    const r = visibleRangeFor("1Y", shortFirst, last);
    expect(r.from).toBe(shortFirst);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd dashboard && npx vitest run lib/__tests__/chart-range.test.ts`
Expected: FAIL — cannot resolve `../chart-range`

- [ ] **Step 3: Write the helper**

```ts
// dashboard/lib/chart-range.ts
export type ChartPeriod = "3M" | "6M" | "1Y" | "2Y";

const MONTHS: Record<ChartPeriod, number> = { "3M": 3, "6M": 6, "1Y": 12, "2Y": 24 };

/** Visible window for a period, in epoch seconds, clamped to available history. */
export function visibleRangeFor(
  period: ChartPeriod,
  firstTs: number,
  lastTs: number
): { from: number; to: number } {
  const d = new Date(lastTs * 1000);
  d.setUTCMonth(d.getUTCMonth() - MONTHS[period]);
  return { from: Math.max(firstTs, Math.floor(d.getTime() / 1000)), to: lastTs };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd dashboard && npx vitest run lib/__tests__/chart-range.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/chart-range.ts dashboard/lib/__tests__/chart-range.test.ts
git commit -m "feat(dashboard): chart-range helper for client-side period switching"
```

---

### Task 2: B1+B2 — CandleChart loads 2Y once, switches ranges client-side

**Files:**
- Modify: `dashboard/components/charts/CandleChart.tsx`
- Modify: `dashboard/app/t/[ticker]/page.tsx:18` (`period=6mo` → `period=2y`)

- [ ] **Step 1: Server fetch becomes 2Y** — in `page.tsx` change the fetch URL to `?period=2y`.

- [ ] **Step 2: Rework CandleChart.** The shape of the change (apply all bullets):

  1. Replace the local `type Period` with `import { visibleRangeFor, type ChartPeriod as Period } from "@/lib/chart-range";` and delete `PERIOD_PARAM`.
  2. Delete `fetchPeriod`, the `loading` and `fetchError` state, and every reference to them (button `disabled`, opacity classes, the error `<span>`).
  3. Add a period ref so data updates re-apply the current window without stale closures:

```ts
  const periodRef = useRef<Period>(initialPeriod ?? DEFAULT_PERSIST.period);
```

  4. Add the range applier and use it from the buttons:

```ts
  const applyPeriod = useCallback((p: Period) => {
    periodRef.current = p;
    setActivePeriod(p);
    const bars = barsRef.current;
    if (!chartRef.current || bars.length < 2) return;
    const { from, to } = visibleRangeFor(
      p,
      toUTC(bars[0].ts) as number,
      toUTC(bars[bars.length - 1].ts) as number
    );
    chartRef.current.timeScale().setVisibleRange({
      from: from as UTCTimestamp,
      to: to as UTCTimestamp,
    });
  }, []);
```

  Range pill `onClick` becomes `() => applyPeriod(p)`.

  5. In `applyData`, replace `chartRef.current?.timeScale().fitContent();` with:

```ts
    const all = barsRef.current;
    if (chartRef.current && all.length >= 2) {
      const { from, to } = visibleRangeFor(
        periodRef.current,
        toUTC(all[0].ts) as number,
        toUTC(all[all.length - 1].ts) as number
      );
      chartRef.current.timeScale().setVisibleRange({
        from: from as UTCTimestamp,
        to: to as UTCTimestamp,
      });
    }
```

  6. In the localStorage hydration effect, after `setActivePeriod(saved.period)` also set `periodRef.current = saved.period;` and, if the chart is ready, call `applyPeriod(saved.period)` — this fixes the pill/data disagreement on load (B1b).

- [ ] **Step 3: Manual verification**

Run dev server, open `http://localhost:3000/t/AMD`:
- click 3M/6M/1Y/2Y — window changes instantly, no network request (check DevTools Network: zero `/api/argus/history` calls after load);
- toggle `200` — EMA-200 line renders on every period including 3M (it has 501 bars to seed from);
- reload — persisted period applies to both pill *and* visible window.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/charts/CandleChart.tsx "dashboard/app/t/[ticker]/page.tsx"
git commit -m "fix(dashboard): chart ranges client-side over single 2Y fetch; 200-EMA renders on all periods (B1, B2)"
```

---

### Task 3: B3 — sliver rows on Today: repro, diagnose, fix

**Files:**
- Create: `dashboard/scripts/row-heights.mjs` (repro tool, kept as regression check)
- Modify (likely): `dashboard/components/ui/DataTable.tsx`

- [ ] **Step 1: Write the repro script**

```js
// dashboard/scripts/row-heights.mjs — measures Today-table row heights; exits 1 on slivers
import { chromium } from "playwright";

const URL = process.env.SMOKE_URL ?? "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle" });

const rows = await page.$$eval("tbody tr", (els) =>
  els.map((el) => ({
    h: Math.round(el.getBoundingClientRect().height),
    text: (el.textContent ?? "").trim().slice(0, 40),
  }))
);
const slivers = rows.filter((r) => r.h > 0 && r.h < 16 && r.text.length > 0);
console.log(`rows=${rows.length} slivers=${slivers.length}`);
for (const s of slivers) console.log(`  h=${s.h}px  "${s.text}"`);
await browser.close();
process.exit(slivers.length > 0 ? 1 : 0);
```

- [ ] **Step 2: Run it against the live page**

Run: `cd dashboard && node scripts/row-heights.mjs`
Expected: exit 1 with sliver rows listed (reproduces the report) — or exit 0, in which case vary viewport width (`width: 1100`) and re-run; record which condition reproduces.

- [ ] **Step 3: Diagnose — check these hypotheses in order, stop at the first confirmed**

  - **H1 — phantom expansion rows.** `DataTable.tsx:250-271` renders a second `<tr>` after *every* data row when `expandedRender` is set; collapsed, its `<td>` has `padding: 0` but the `<tr>` still participates in layout and hit-testing. Check in the repro output whether sliver `text` is the *expanded-content* text (E/S/T levels) — that fingerprint confirms H1.
  - **H2 — sticky first column over a collapsed row.** `DataTable.tsx:242` gives the first cell `sticky left-0 bg-inherit`; on horizontal scroll a sticky cell from an adjacent row can overpaint a short row. Check: does the sliver disappear with horizontal scroll at far left?
  - **H3 — content clipping from the row-expand transition.** The `maxHeight: 600px` cap (`DataTable.tsx:260`): expanded content taller than 600px clips and visually "hides" the row beneath. Check: expand the tallest row and measure.

- [ ] **Step 4: Apply the matching fix.** For H1 (most likely), make the expansion row conditional — in `DataTable.tsx`, replace the expansion block:

```tsx
                {expandedRender && everExpandedKeys.has(key) && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className={isExpanded ? "border-b border-line bg-elevated" : ""}
                      style={{ padding: isExpanded ? undefined : "0" }}
                    >
                      <div
                        style={{
                          maxHeight: isExpanded ? "600px" : "0px",
                          overflow: "hidden",
                          transition: "max-height 150ms ease-out",
                        }}
                        className={isExpanded ? "px-3" : ""}
                      >
                        {expandedRender(row)}
                      </div>
                    </td>
                  </tr>
                )}
```

(Never-expanded rows now render no second `<tr>` at all; previously-expanded rows keep the collapse animation.) For H2: add `z-0` to the sticky cell and `relative z-[1]` to the row. For H3: raise the cap to `1200px` and add `overflow-y: auto`. If none of H1–H3 is confirmed, **stop and report findings** — do not improvise (§4.1).

- [ ] **Step 5: Verify + regression-guard**

Run: `cd dashboard && node scripts/row-heights.mjs`
Expected: exit 0, `slivers=0`. Then expand/collapse a row manually — animation still works.

- [ ] **Step 6: Commit**

```bash
git add dashboard/scripts/row-heights.mjs dashboard/components/ui/DataTable.tsx
git commit -m "fix(dashboard): Today-table sliver rows — <confirmed cause>; add row-height regression check (B3)"
```

---

### Task 4: B4 — Sources tab: env path, meta, designed empty state

**Files:**
- Modify: `dashboard/app/api/accounts/route.ts`
- Modify: `dashboard/app/sources/page.tsx`
- Modify: `dashboard/types/accounts.ts` (add `meta` to `AccountsData`)

- [ ] **Step 1: Generate the artifact once** (so success is testable):

Run: `sed -n '1,15p' ~/Market_Review/scripts/run_daily.sh` to confirm the `PYTHON=` interpreter, then:
`cd ~/Market_Review && PYTHONPATH=src <that-python> -m stock_chatter.cli backtest && head -3 reports/account_backtest.csv`
Expected: CSV with an `account,…` header. If the command fails on missing inputs, record the error and continue — the empty state below is then the verified behaviour, and the daily generation lands in Phase B-0 Task 8.

- [ ] **Step 2: Route — env path + meta.** In `route.ts`, replace the `CSV_PATH` constant:

```ts
const CSV_PATH =
  process.env.ACCOUNTS_CSV ??
  "/Users/josephstorey/Market_Review/reports/account_backtest.csv";
```

In the catch branch (file unreadable), return the meta so the UI can explain itself:

```ts
    const empty: AccountsData = {
      accounts: [],
      by_tier: Object.fromEntries(TIER_ORDER.map((t) => [t, []])) as unknown as Record<AccountTier, AccountStat[]>,
      meta: { path: CSV_PATH, exists: false },
    };
    return NextResponse.json(empty);
```

and add `meta: { path: CSV_PATH, exists: true }` to the success payload. In `types/accounts.ts` extend the type:

```ts
export interface AccountsData {
  accounts: AccountStat[];
  by_tier: Record<AccountTier, AccountStat[]>;
  meta?: { path: string; exists: boolean };
}
```

- [ ] **Step 3: Designed empty state.** In `sources/page.tsx`, where the page would render zero accounts, render instead (using the existing `EmptyState` component):

```tsx
  if (data && data.accounts.length === 0) {
    return (
      <EmptyState
        message={`No account data yet — expected CSV at ${data.meta?.path ?? "ACCOUNTS_CSV"}. It is produced by the daily pipeline's account-backtest step (see scripts/run_daily.sh).`}
      />
    );
  }
```

(Adjust placement to the page's actual render flow; the rule: an empty Sources tab must name the path it looked at and who produces the file — never a blank page.)

- [ ] **Step 4: Verify both states**

With CSV present: `/sources` shows tier tables. Then `ACCOUNTS_CSV=/tmp/nope.csv npm run dev` → `/sources` shows the designed empty state naming `/tmp/nope.csv`.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/api/accounts/route.ts dashboard/app/sources/page.tsx dashboard/types/accounts.ts
git commit -m "fix(dashboard): Sources reads ACCOUNTS_CSV env with designed empty state (B4)"
```

---

### Task 5: B5 — "since called" display

**Files:**
- Create: `dashboard/lib/called-since.ts`
- Test: `dashboard/lib/__tests__/called-since.test.ts`
- Modify: `dashboard/components/ticker/Header.tsx:144-176`

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/called-since.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calledSince } from "../called-since";

describe("calledSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-12T00:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("formats date, days and pct", () => {
    const r = calledSince("2026-05-21", 42.1, 48.77);
    expect(r).not.toBeNull();
    expect(r!.days).toBe(22);
    expect(r!.pct).toBeCloseTo(15.84, 1);
    expect(r!.dateLabel).toBe("21 May");
  });

  it("null pct when entry missing", () => {
    const r = calledSince("2026-05-21", null, 48.77);
    expect(r!.pct).toBeNull();
  });

  it("null on garbage date", () => {
    expect(calledSince("not-a-date", 1, 2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd dashboard && npx vitest run lib/__tests__/called-since.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write the helper**

```ts
// dashboard/lib/called-since.ts
export interface CalledSince {
  dateLabel: string; // "21 May"
  days: number;      // calendar days since the call
  pct: number | null;
}

export function calledSince(
  firstDate: string,
  entry: number | null,
  lastClose: number | null
): CalledSince | null {
  const d = new Date(`${firstDate.slice(0, 10)}T00:00:00Z`);
  if (isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  const dateLabel = d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const pct =
    entry != null && entry !== 0 && lastClose != null && isFinite(entry) && isFinite(lastClose)
      ? ((lastClose - entry) / entry) * 100
      : null;
  return { dateLabel, days, pct };
}
```

- [ ] **Step 4: Run to verify pass** — 3 passed.

- [ ] **Step 5: Replace the Header line.** In `Header.tsx`, replace the body of the `if (firstRow) { … }` block (lines ~147-176) with:

```tsx
    const cs = calledSince(firstRow.date, firstRow.entry, lastClose);
    if (cs) {
      flagAgeLine = (
        <p className="text-[12px] text-muted font-mono tabular-nums mt-1">
          called {cs.dateLabel}
          {firstRow.entry !== null ? ` @ ${firstRow.entry.toFixed(2)}` : ""}
          {cs.pct !== null && lastClose !== null ? (
            <>
              {" → "}
              {lastClose.toFixed(2)}{" "}
              <span className={cs.pct >= 0 ? "text-pos" : "text-neg"}>
                ({cs.pct >= 0 ? "+" : ""}
                {cs.pct.toFixed(1)}%, {cs.days}d)
              </span>
            </>
          ) : null}
          {" · "}
          <span className="text-muted">
            median pick peaks +{medianPeakPct}% @ ~{medianDaysToPeak}d
          </span>
        </p>
      );
    }
```

Add `import { calledSince } from "@/lib/called-since";` at the top. Delete the now-unused `daysAgo`/`sinceStr` computation. No header sparkline (master plan B5 — the chart below is the sparkline).

- [ ] **Step 6: Verify** — `/t/<ticker-with-history>` header reads `called 21 May @ 42.10 → 48.77 (+15.8%, 22d) · median pick peaks…`.

- [ ] **Step 7: Commit**

```bash
git add dashboard/lib/called-since.ts dashboard/lib/__tests__/called-since.test.ts dashboard/components/ticker/Header.tsx
git commit -m "fix(dashboard): coherent since-called line — date @ basis → now (pct, days) (B5)"
```

---

### Task 6: `market-clock` helper (US session state)

**Files:**
- Create: `dashboard/lib/market-clock.ts`
- Test: `dashboard/lib/__tests__/market-clock.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/market-clock.test.ts
import { describe, expect, it } from "vitest";
import { usMarketState } from "../market-clock";

// June dates = EDT (UTC-4); January dates = EST (UTC-5)
describe("usMarketState", () => {
  it("regular hours (June, 10:30 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T14:30:00Z"))).toBe("regular"));
  it("pre-market (June, 05:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T09:00:00Z"))).toBe("pre"));
  it("after-hours (June, 17:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-12T21:00:00Z"))).toBe("after"));
  it("overnight closed (June, 23:00 ET)", () =>
    expect(usMarketState(new Date("2026-06-13T03:00:00Z"))).toBe("closed"));
  it("weekend closed (Saturday June 13 ET)", () =>
    expect(usMarketState(new Date("2026-06-13T15:00:00Z"))).toBe("closed"));
  it("EST handled (January, 10:30 ET = 15:30Z)", () =>
    expect(usMarketState(new Date("2026-01-13T15:30:00Z"))).toBe("regular"));
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: write the helper**

```ts
// dashboard/lib/market-clock.ts
export type UsMarketState = "pre" | "regular" | "after" | "closed";

/** US equity session state, DST-safe via Intl (no schedule data, no holidays). */
export function usMarketState(now: Date = new Date()): UsMarketState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  if (wd === "Sat" || wd === "Sun") return "closed";
  const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return "pre";
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return "regular";
  if (mins >= 16 * 60 && mins < 20 * 60) return "after";
  return "closed";
}

export const STATE_LABEL: Record<UsMarketState, string> = {
  pre: "PRE",
  regular: "REG",
  after: "AFTER",
  closed: "CLOSED",
};
```

- [ ] **Step 4: Run to verify pass** — 6 passed. (Known limitation, acceptable: US market holidays read as their weekday state; noted in the file header.)

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/market-clock.ts dashboard/lib/__tests__/market-clock.test.ts
git commit -m "feat(dashboard): US session-state helper (DST-safe)"
```

---

### Task 7: B6+B7 — options panel: pricing columns, honest errors, market-state label

**Files:**
- Modify: `dashboard/components/ticker/OptionsPanel.tsx`

- [ ] **Step 1: Render the pricing fields.** Extend `UnusualRow` and the table:

```ts
interface UnusualRow {
  strike?: unknown;
  expiry?: unknown;
  vol?: unknown;
  volume?: unknown;        // yfinance field name
  oi?: unknown;
  openInterest?: unknown;  // yfinance field name
  type?: unknown;
  lastPrice?: unknown;
  bid?: unknown;
  ask?: unknown;
  percentChange?: unknown;
  [key: string]: unknown;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
```

Replace the `UnusualTable` header/body columns with: Strike · Last · Bid×Ask · Δ% · Vol · OI · Type:

```tsx
        <thead>
          <tr className="text-left text-muted text-[11px] border-b border-line">
            <th className="pb-1 pr-3 font-medium">Strike</th>
            <th className="pb-1 pr-3 font-medium text-right">Last</th>
            <th className="pb-1 pr-3 font-medium text-right">Bid×Ask</th>
            <th className="pb-1 pr-3 font-medium text-right">Δ%</th>
            <th className="pb-1 pr-3 font-medium text-right">Vol</th>
            <th className="pb-1 pr-3 font-medium text-right">OI</th>
            <th className="pb-1 font-medium">Type</th>
          </tr>
        </thead>
        <tbody>
          {valid.map((row, i) => {
            const last = num(row.lastPrice);
            const bid = num(row.bid);
            const ask = num(row.ask);
            const chg = num(row.percentChange);
            const vol = num(row.vol) ?? num(row.volume);
            const oi = num(row.oi) ?? num(row.openInterest);
            return (
              <tr key={i} className="border-t border-line">
                <td className="py-1 pr-3 text-foreground">{String(row.strike ?? "—")}</td>
                <td className="py-1 pr-3 text-right text-foreground">{last !== null ? last.toFixed(2) : "—"}</td>
                <td className="py-1 pr-3 text-right text-muted">
                  {bid !== null && ask !== null ? `${bid.toFixed(2)}×${ask.toFixed(2)}` : "—"}
                </td>
                <td className={`py-1 pr-3 text-right ${chg === null ? "text-muted" : chg >= 0 ? "text-pos" : "text-neg"}`}>
                  {chg !== null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(0)}%` : "—"}
                </td>
                <td className="py-1 pr-3 text-right text-muted">{vol !== null ? vol.toLocaleString() : "—"}</td>
                <td className="py-1 pr-3 text-right text-muted">{oi !== null ? oi.toLocaleString() : "—"}</td>
                <td className="py-1 text-muted">{String(row.type ?? "—")}</td>
              </tr>
            );
          })}
        </tbody>
```

(The `expiry` column drops — the panel subtitle already shows the expiration.)

- [ ] **Step 2: Honest error states.** Replace the single `offline` branch with two:

```tsx
  const argusDown = error != null; // proxy 503/504 → fetcher threw
  const noChain = data != null && isErrorResponse(data); // flow returned {error: "no chain"}
```

`argusDown` panel copy: `Argus API offline` + Retry (as now). `noChain` copy: `no options chain for {upper} (source: yfinance)` — no Retry button (retry won't help an unlisted chain).

- [ ] **Step 3: Market-state subtitle.** Add `import { usMarketState } from "@/lib/market-clock";` and compute once in the success render:

```tsx
  const state = usMarketState();
  const stateLabel =
    state === "regular" ? "live" : state === "pre" ? "pre-market" : state === "after" ? "after-hours" : "US closed — last session";
```

Panel subtitle becomes `` `${data.expiration} · ${stateLabel}` ``. Additionally, when `state === "closed"` and both unusual lists are empty, render under the IV row:

```tsx
          <p className="font-mono text-[11px] text-muted border-t border-line pt-2">
            unusual-activity lists rebuild from live volume during US hours; overnight
            recaps land with WS-1 snapshots
          </p>
```

(The honest interim state until WS-1's snapshot recap ships — never a silent blank.)

- [ ] **Step 4: Verify.** With the dev server up during Sydney daytime: `/t/AAPL` options panel shows P/C tables, the closed-market subtitle, the explanation line instead of blank lists; rows (when present) show Last/Bid×Ask/Δ%. Temporarily stop the Argus API (`launchctl kill SIGTERM gui/$(id -u)/ai.argus.api`) → panel says "Argus API offline" with Retry; restart it (`launchctl kickstart -k gui/$(id -u)/ai.argus.api`).

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/ticker/OptionsPanel.tsx
git commit -m "fix(dashboard): options panel — pricing columns, honest error/market-state copy (B6, B7)"
```

---

### Task 8: B8 — chart info strip (+ tiny Argus extended-quote endpoint)

**Files:**
- Create: `dashboard/lib/bar-stats.ts`, `dashboard/components/ticker/ChartInfoStrip.tsx`
- Test: `dashboard/lib/__tests__/bar-stats.test.ts`
- Modify: `argus/argus/data/market.py` (add `get_extended_quote`), `argus/argus/api/routes.py` (add `/api/extended/{symbol}`), `dashboard/app/t/[ticker]/page.tsx` (render strip under chart)

- [ ] **Step 1: Failing tests for the stats helpers**

```ts
// dashboard/lib/__tests__/bar-stats.test.ts
import { describe, expect, it } from "vitest";
import { range52w, volumeVsAvg } from "../bar-stats";

const mkBar = (close: number, volume: number, i: number) => ({
  ts: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  open: close, high: close * 1.01, low: close * 0.99, close, volume,
});

describe("volumeVsAvg", () => {
  it("ratio of last volume vs prior 20-bar average", () => {
    const bars = Array.from({ length: 21 }, (_, i) => mkBar(10, 100, i));
    bars.push(mkBar(10, 250, 21));
    expect(volumeVsAvg(bars)).toBeCloseTo(2.5, 5);
  });
  it("null when too short", () => {
    expect(volumeVsAvg(Array.from({ length: 5 }, (_, i) => mkBar(10, 100, i)))).toBeNull();
  });
});

describe("range52w", () => {
  it("position within window high/low", () => {
    const bars = Array.from({ length: 252 }, (_, i) => mkBar(100 + (i % 50), 100, i));
    const r = range52w(bars);
    expect(r).not.toBeNull();
    expect(r!.pos).toBeGreaterThanOrEqual(0);
    expect(r!.pos).toBeLessThanOrEqual(1);
    expect(r!.hi).toBeGreaterThan(r!.lo);
  });
  it("null when under 60 bars", () => {
    expect(range52w(Array.from({ length: 30 }, (_, i) => mkBar(10, 100, i)))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: write the helpers**

```ts
// dashboard/lib/bar-stats.ts
import type { Bar } from "@/components/charts/CandleChart";

export function volumeVsAvg(bars: Bar[], lookback = 20): number | null {
  if (bars.length < lookback + 2) return null;
  const last = bars[bars.length - 1].volume;
  const prior = bars.slice(-(lookback + 1), -1);
  const avg = prior.reduce((a, b) => a + b.volume, 0) / lookback;
  return avg > 0 ? last / avg : null;
}

export function range52w(bars: Bar[]): { lo: number; hi: number; pos: number } | null {
  const win = bars.slice(-252);
  if (win.length < 60) return null;
  const lo = Math.min(...win.map((b) => b.low));
  const hi = Math.max(...win.map((b) => b.high));
  if (!(hi > lo)) return null;
  const close = win[win.length - 1].close;
  return { lo, hi, pos: (close - lo) / (hi - lo) };
}
```

- [ ] **Step 4: Run to verify pass** (4 passed), commit the helpers:

```bash
git add dashboard/lib/bar-stats.ts dashboard/lib/__tests__/bar-stats.test.ts
git commit -m "feat(dashboard): bar-stats helpers for chart info strip"
```

- [ ] **Step 5: Argus extended quote.** In `argus/argus/data/market.py`, after `get_quote`:

```python
def get_extended_quote(symbol: str) -> Optional[dict]:
    """Last traded price including pre/post sessions (1m prepost bars)."""
    sym = symbol.upper()
    try:
        df = yf.Ticker(sym).history(period="1d", interval="1m", prepost=True)
    except Exception:
        return None
    if df is None or df.empty:
        return None
    df.columns = [str(c).lower() for c in df.columns]
    last = df.iloc[-1]
    return {"symbol": sym, "price": float(last["close"]), "ts": str(df.index[-1])}
```

In `argus/argus/api/routes.py`, import `get_extended_quote` alongside the existing `..data` imports and add next to `quote`:

```python
    @app.get("/api/extended/{symbol}")
    def extended(symbol: str):
        q = get_extended_quote(symbol)
        if not q:
            raise HTTPException(404, "no data")
        return q
```

Verify: `launchctl kickstart -k gui/$(id -u)/ai.argus.api && sleep 3 && curl -s http://127.0.0.1:8088/api/extended/AAPL`
Expected: `{"symbol":"AAPL","price":…,"ts":"…"}` (404 only if yfinance has no prepost data right now — acceptable; the strip handles it).

```bash
git add argus/argus/data/market.py argus/argus/api/routes.py
git commit -m "feat(argus): /api/extended/{symbol} — pre/post-session last price"
```

- [ ] **Step 6: The strip component**

```tsx
// dashboard/components/ticker/ChartInfoStrip.tsx
"use client";

import useSWR from "swr";
import type { Bar } from "@/components/charts/CandleChart";
import { range52w, volumeVsAvg } from "@/lib/bar-stats";
import { STATE_LABEL, usMarketState } from "@/lib/market-clock";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function ChartInfoStrip({ ticker, bars }: { ticker: string; bars: Bar[] }) {
  const state = usMarketState();
  const extended = state === "pre" || state === "after";
  const { data: ext } = useSWR<{ price: number }>(
    extended ? `/api/argus/extended/${ticker}` : null,
    fetcher,
    { refreshInterval: 60_000, shouldRetryOnError: false }
  );

  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const volX = volumeVsAvg(bars);
  const r52 = range52w(bars);
  const extPct = ext && last.close > 0 ? ((ext.price - last.close) / last.close) * 100 : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12px] tabular-nums text-muted mt-2 px-0.5">
      <span className="inline-flex items-center rounded border border-line bg-elevated px-1.5 py-px text-[10px]">
        {STATE_LABEL[state]}
      </span>
      <span>
        close <span className="text-foreground">{last.close.toFixed(2)}</span>
      </span>
      <span>
        range {last.low.toFixed(2)}–{last.high.toFixed(2)}
      </span>
      {volX !== null && (
        <span>
          vol <span className={volX >= 1.5 ? "text-warn" : "text-foreground"}>{volX.toFixed(1)}×</span> avg
        </span>
      )}
      {r52 && (
        <span>
          52w {r52.lo.toFixed(0)}–{r52.hi.toFixed(0)} ({Math.round(r52.pos * 100)}%)
        </span>
      )}
      {extended && ext && extPct !== null && (
        <span>
          {state === "pre" ? "pre" : "after"}{" "}
          <span className={extPct >= 0 ? "text-pos" : "text-neg"}>
            {ext.price.toFixed(2)} ({extPct >= 0 ? "+" : ""}
            {extPct.toFixed(1)}%)
          </span>
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Render it.** In `dashboard/app/t/[ticker]/page.tsx`, import the component and add directly under `<CandleChart … />` (inside the same Panel):

```tsx
              <ChartInfoStrip ticker={ticker} bars={bars} />
```

- [ ] **Step 8: Verify** — `/t/AMD`: strip shows session badge + close/range/vol×/52w; during Sydney daytime badge reads `CLOSED` and no ext price (correct); during US pre/after an extended price with % renders.

- [ ] **Step 9: Commit**

```bash
git add dashboard/components/ticker/ChartInfoStrip.tsx "dashboard/app/t/[ticker]/page.tsx"
git commit -m "feat(dashboard): chart info strip — session, range, volume, 52w, extended price (B8)"
```

---

### Task 9: Regression sweep, docs, status board

**Files:**
- Modify: `dashboard/scripts/smoke.mjs` (chart-pill check), `dashboard/README.md`, `docs/SESSION_HANDOFF.md`, master plan §9 board

- [ ] **Step 1: Add a chart-pill check to the smoke harness.** In `smoke.mjs`, add this function near the other helpers and call it after navigation for the two `ticker-*` routes:

```js
async function checkChartPills(page, label) {
  for (const pill of ["3M", "1Y", "2Y", "6M"]) {
    const btn = page.locator(`button:text-is("${pill}")`).first();
    if ((await btn.count()) === 0) return `${label}: no chart pills`;
    await btn.click();
    await page.waitForTimeout(150);
  }
  const err = await page.locator("text=failed to load").count();
  return err > 0 ? `${label}: chart shows 'failed to load'` : null;
}
```

(Follow the file's existing pattern for collecting failures; treat a non-null return as a failure entry.)

- [ ] **Step 2: Full verification sweep**

```bash
cd dashboard && npx vitest run && node scripts/row-heights.mjs && node scripts/smoke.mjs
cd ../argus && .venv/bin/python -m pytest tests/ -v
```
Expected: all green (smoke acceptable-fails list already tolerates IBKR-dependent endpoints).

- [ ] **Step 3: Update docs**
  - `dashboard/README.md`: note the chart's single-2Y-fetch design, `ACCOUNTS_CSV` env, new helpers (`chart-range`, `market-clock`, `bar-stats`, `called-since`), and the two regression scripts.
  - `docs/SESSION_HANDOFF.md`: rewrite per §4.1 (Phase A done, commits, next: Phase B-0 / WS-1 plan).
  - Master plan §9: Phase A row → `Done`, link `2026-06-12-phase-a-bug-sweep.md`, date.

- [ ] **Step 4: Commit**

```bash
git add dashboard/scripts/smoke.mjs dashboard/README.md docs/SESSION_HANDOFF.md docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md
git commit -m "chore(dashboard): smoke chart-pill check, docs + status board for Phase A"
```

---

## Acceptance (whole phase — mirrors WS-0 acceptance in the master plan)

1. All range pills + 200-EMA work on every period with zero refetches; persisted period applies to pill *and* window.
2. `row-heights.mjs` exits 0; expansion animation intact.
3. Sources renders data, or a designed empty state naming the resolved CSV path.
4. Header shows `called <date> @ <basis> → <now> (<pct>, <days>d)`.
5. Options panel: pricing columns rendered; "Argus API offline" vs "no options chain" vs market-state subtitle all distinguishable; overnight shows the explanation line, never silent blanks.
6. Chart info strip renders session badge, close/range/volume×avg/52w, extended price in pre/after.
7. `vitest`, argus `pytest`, `smoke.mjs` all green; READMEs + handoff + status board updated.
