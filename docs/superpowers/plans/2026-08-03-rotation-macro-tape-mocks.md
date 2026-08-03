# Rotation, Macro and Today's Tape — Mock Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `/rotation`, `/macro` and the Today page's tape band into line with the 2026-08-02 mocks (`docs/design/mockups/3b-rotation.html`, `3c-macro.html`, `screen-1a-today.html`), building only what a live feed backs.

**Architecture:** Three independent screens, no shared new modules except two additions to `dashboard/lib/tape.ts`. Rotation and macro each gain a two-column layout (chart left, rail right) built from their existing components; the rail cards are new files under `components/rotation/` and reuse of `components/macro/`. The tape keeps its existing ET-native geometry and changes only what it *prints* — the axis, session boundaries and lane maths stay in New York minutes, because those are facts about the exchange.

**Tech Stack:** Next.js 14.2 App Router, React 18.3, TypeScript, SWR, Recharts 3.8.1, Tailwind, Vitest 4 + React Testing Library 16.3.

## Global Constraints

- **No-feed rule.** A field with no backing feed renders nothing. Never render an empty cell, a dash placeholder, or invented copy to match the mock's shape.
- **Mocks are the spec for layout and copy, not for data.** Where a mock shows a number we do not have, it is CUT (list below).
- **Chart token contract.** No hex or `rgba()` literals in chart files. Use `lib/chartConventions.ts` (`CHART_HEIGHT`, `CHART_AXIS_STYLE`) and CSS vars (`var(--green)`, `var(--muted)`).
- **Every new localStorage key must be registered** in `STATIC_KEYS` in `dashboard/lib/storageKeys.ts` — that object feeds "reset all stored preferences" and must stay exhaustive.
- **Model output is never P&L green/red.** Sentiment scores and rank changes use `text-model` / `toneClass`, not `text-pos` / `text-neg`.
- **Run tests from `dashboard/`:** `npm run test -- <path>` for a single file, `npm run test:all` before the final commit of each screen.
- **Times.** The tape prints **Sydney local time** (user instruction, overriding the mock's "all times ET" label). The tape's internal geometry stays ET.

### CUT — in the mocks, no feed behind them

| Mock element | Screen | Why |
|---|---|---|
| Verdict paragraph ("Tech and communications are leading and still accelerating…") | 3b rotation | No model writes rotation prose. |
| "Ahead of it" prose card | 3b rotation | Same. |
| ETF chips (Technology XLK, Comms XLC, Real Estate XLRE…) | 3b rotation | Our universe is yfinance *industries* ("Semiconductor Equipment & Materials", "Uranium", "Quantum Computing"), not 11 GICS sectors with ETF proxies. |
| "Macro tone for this sector +0.31 ▲" | 3b rotation | Macro scopes are `sector:<sector_taxonomy family>`; rotation rows are yfinance industries. No exact join exists, so this renders nothing on every live scope. |
| "Rotation quadrant · Technology · Leading" | 3c macro | Same join failure, opposite direction. |
| "All 412 articles →" link | 3c macro | There is no articles route (`app/` has no `news/`). The headline **count** stays; the link goes. |
| Release actuals ("Chicago PMI 51.2 vs 49.8 est") | 1a tape | The morning-report feed carries no actual or consensus values. |

### Deviations from the mocks — deliberate, keep

- **RRG points stay numbered, not named.** The mock labels each dot with a short GICS sector name. Our industry names are long enough to ellipsise at chart scale; `RRGChart.tsx:312-315` records the prior decision to number the points and key them to the table. Keep the numbers.
- **Methodology copy uses our real values,** not the mock's. The mock claims a 6-hour half-life, per-sentence FinBERT averaged per article, 34 wire sources, and a 0.6–1.0 reliability multiplier. Ours is headline-only FinBERT with the half-life from `WINDOW_META` (12h on the 1d window) and no reliability multiplier. Copy the numbers from `WINDOW_META`, never from the mock.

## File Structure

**Tape**
- Modify: `dashboard/lib/tape.ts` — rename `fmtEtClock` → `fmtClock`; add `localOffsetMin()` and `fmtLocalClock()`.
- Modify: `dashboard/components/today/TodaysTape.tsx` — print Sydney clocks, `·` separators, drop the `actions` slot.
- Modify: `dashboard/app/page.tsx` — drop the date stepper and the `?date=` history branch.
- Delete: `dashboard/components/today/DateStepper.tsx`, `dashboard/components/today/__tests__/DateStepper.test.tsx`.
- Test: `dashboard/lib/__tests__/tape.test.ts`, `dashboard/components/today/__tests__/TodaysTape.test.tsx`.

**Rotation**
- Modify: `dashboard/app/rotation/page.tsx` — hand raw trail history to the client instead of prebuilt trails.
- Modify: `dashboard/components/rotation/RotationView.tsx` — owns the trail-length control, the two-column layout, and the rail.
- Modify: `dashboard/components/rotation/RRGChart.tsx` — add the ReadThis strip, drop the foot "on today's list" strip (the rail carries it).
- Create: `dashboard/components/rotation/MovedMost.tsx` — the "Moved most" rail card.
- Create: `dashboard/components/rotation/SectorCard.tsx` — the focused-sector rail card.
- Modify: `dashboard/lib/storageKeys.ts` — register `rotationTrail`.
- Test: `dashboard/components/rotation/__tests__/MovedMost.test.tsx`, `.../SectorCard.test.tsx`, `.../RotationView.test.tsx`.

**Macro**
- Modify: `dashboard/app/macro/page.tsx` — 4-column collapsible methodology, 5-up tiles, two-column layout.
- Modify: `dashboard/components/macro/Contributors.tsx` — per-item `w <weight> · HH:MM · Source` line, rail-width layout.
- Modify: `dashboard/components/macro/ScopeBand.tsx` — stacked card for the rail instead of a horizontal band.
- Test: `dashboard/components/macro/__tests__/Contributors.test.tsx`, `.../ScopeBand.test.tsx`, `dashboard/app/__tests__/macro.test.tsx` (create if absent).

---

## Task 1: Sydney clock helpers in `lib/tape.ts`

**Files:**
- Modify: `dashboard/lib/tape.ts:35-45`
- Test: `dashboard/lib/__tests__/tape.test.ts`

**Interfaces:**
- Consumes: `TAPE_SESSIONS`, `etMinutes`, `nowEtMinutes` (unchanged).
- Produces:
  - `fmtClock(minutes: number): string` — renamed from `fmtEtClock`, same behaviour.
  - `localOffsetMin(at?: Date): number` — minutes to add to a New York clock reading to get the Sydney one, in `[0, 1440)`.
  - `fmtLocalClock(minutes: number, offsetMin: number): { clock: string; dayShift: 0 | 1 }`.

- [ ] **Step 1: Write the failing tests**

Append to `dashboard/lib/__tests__/tape.test.ts`:

```ts
import { localOffsetMin, fmtLocalClock } from "@/lib/tape";

describe("localOffsetMin", () => {
  it("is +14h while New York is on EDT and Sydney on AEST", () => {
    // 2026-08-03: NY = UTC-4, Sydney = UTC+10.
    expect(localOffsetMin(new Date("2026-08-03T12:00:00Z"))).toBe(14 * 60);
  });

  it("is +16h in January, when both sides have swapped", () => {
    // 2026-01-15: NY = UTC-5 (EST), Sydney = UTC+11 (AEDT).
    expect(localOffsetMin(new Date("2026-01-15T12:00:00Z"))).toBe(16 * 60);
  });
});

describe("fmtLocalClock", () => {
  it("prints an ET minute on the Sydney clock", () => {
    expect(fmtLocalClock(4 * 60, 14 * 60)).toEqual({ clock: "18:00", dayShift: 0 });
    expect(fmtLocalClock(9 * 60 + 30, 14 * 60)).toEqual({ clock: "23:30", dayShift: 0 });
  });

  it("flags the roll past midnight rather than printing a time that reads earlier", () => {
    expect(fmtLocalClock(16 * 60, 14 * 60)).toEqual({ clock: "06:00", dayShift: 1 });
    expect(fmtLocalClock(20 * 60, 14 * 60)).toEqual({ clock: "10:00", dayShift: 1 });
  });
});
```

Also rewrite the three existing `fmtEtClock` assertions (`tape.test.ts:32-34`) to call `fmtClock`, and rename the describe block on line 14 to `"etMinutes / fmtClock"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dashboard && npm run test -- lib/__tests__/tape.test.ts`
Expected: FAIL — `localOffsetMin is not a function`, `fmtClock is not a function`.

- [ ] **Step 3: Implement**

In `dashboard/lib/tape.ts`, rename `fmtEtClock` to `fmtClock` (keep the body byte-for-byte) and append:

```ts
/** Where the tape runs. The axis and the session boundaries are facts about
 *  this exchange and never move. */
export const TAPE_TZ = "America/New_York";
/** Where it is read. Only the printed clock moves. */
export const LOCAL_TZ = "Australia/Sydney";

function tzMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  const [h, m] = parts.split(":").map(Number);
  return (h % 24) * 60 + m;
}

/** Minutes to add to a New York clock reading to get the Sydney one, in
 *  [0, 1440). Read off the current instant, so it follows both hemispheres'
 *  daylight saving without a table. */
export function localOffsetMin(at: Date = new Date()): number {
  return (((tzMinutes(at, LOCAL_TZ) - tzMinutes(at, TAPE_TZ)) % 1440) + 1440) % 1440;
}

/** An ET minute-of-day printed on the Sydney clock. The tape spans 04:00–20:00
 *  in New York, which is one calendar day there and two here — `dayShift` is 1
 *  once the reading has rolled past midnight, so 06:00 after 23:30 does not read
 *  as going backwards. */
export function fmtLocalClock(
  minutes: number,
  offsetMin: number
): { clock: string; dayShift: 0 | 1 } {
  const shifted = minutes + offsetMin;
  return { clock: fmtClock(shifted % 1440), dayShift: shifted >= 1440 ? 1 : 0 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- lib/__tests__/tape.test.ts`
Expected: PASS. `npx tsc --noEmit` will still fail on `TodaysTape.tsx` — that is Task 2.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/tape.ts dashboard/lib/__tests__/tape.test.ts
git commit -m "Give the tape a Sydney clock without moving its axis"
```

---

## Task 2: The tape prints Sydney time

**Files:**
- Modify: `dashboard/components/today/TodaysTape.tsx`
- Test: `dashboard/components/today/__tests__/TodaysTape.test.tsx`

**Interfaces:**
- Consumes: `fmtClock`, `fmtLocalClock`, `localOffsetMin` from Task 1.
- Produces: `TapeBand` gains an `offsetMin?: number` prop (defaults to `localOffsetMin()`) so tests are deterministic. `EarningsMark` / `ReleaseMark` gain an `offsetMin: number` prop.

- [ ] **Step 1: Write the failing tests**

In `dashboard/components/today/__tests__/TodaysTape.test.tsx`, pass `offsetMin={14 * 60}` to every `<TapeBand>` render, then replace the clock assertions:

```tsx
describe("TodaysTape — Sydney clock", () => {
  it("prints release times on the Sydney clock, not the New York one", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} offsetMin={14 * 60} />);
    expect(laneBox("CPI").textContent).toBe("22:30 · CPI");
  });

  it("marks the roll past midnight on an after-hours print", () => {
    render(
      <TapeBand
        events={[event({ time_et: "16:05", event: "NVDA earnings", category: "earnings", ticker: "NVDA" })]}
        nowMin={10 * 60}
        offsetMin={14 * 60}
      />
    );
    expect(screen.getByText("06:05 +1")).toBeInTheDocument();
  });

  it("labels the panel Sydney, and the session bar with Sydney boundaries", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} offsetMin={14 * 60} />);
    expect(screen.getByText("all times Sydney")).toBeInTheDocument();
    expect(screen.getByText("Pre · 18:00")).toBeInTheDocument();
    expect(screen.getByText("Regular · 23:30")).toBeInTheDocument();
    expect(screen.getByText("After · 06:00 +1")).toBeInTheDocument();
  });

  it("prints the now pill on the Sydney clock", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60 + 15} offsetMin={14 * 60} />);
    expect(screen.getByText("now 00:15 +1")).toBeInTheDocument();
  });
});
```

Delete the superseded assertions: `"now 10:15 ET"` (lines 136, 146), `expect(screen.queryByText("all times ET"))` (line 104 → assert `"all times Sydney"` instead), and the `laneBox("CPI").textContent).toBe("08:30CPI")` assertion (line 216 → `"22:30 · CPI"`). The regular-band geometry assertions (`left` `34.375%`, `width` `40.625%`) must **not** change — the axis is still ET.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd dashboard && npm run test -- components/today/__tests__/TodaysTape.test.tsx`
Expected: FAIL — "22:30 · CPI" not found; still prints "08:30".

- [ ] **Step 3: Implement**

In `dashboard/components/today/TodaysTape.tsx`:

Change the import block to:

```tsx
import {
  TAPE_SESSIONS,
  assignLanes,
  etMinutes,
  fmtLocalClock,
  laneCount,
  localOffsetMin,
  nowEtMinutes,
  nowOnAxis,
  tapeFraction,
} from "@/lib/tape";
```

Add a shared clock renderer above `EarningsMark`:

```tsx
/** One clock reading, plus the `+1` that says it has rolled into tomorrow here.
 *  The suffix is not decoration: a bare "06:00" printed to the right of "23:30"
 *  reads as the tape running backwards. */
function Clock({ minutes, offsetMin }: { minutes: number; offsetMin: number }) {
  const { clock, dayShift } = fmtLocalClock(minutes, offsetMin);
  return (
    <>
      {clock}
      {dayShift === 1 && <span className="text-muted-2"> +1</span>}
    </>
  );
}
```

In `EarningsMark`, take `offsetMin` and replace the chip's inner block:

```tsx
function EarningsMark({ mark, lane, offsetMin }: { mark: Mark; lane: number; offsetMin: number }) {
```

```tsx
  const inner = (
    <>
      <span>
        <Clock minutes={mark.minutes} offsetMin={offsetMin} />
      </span>
      <span>·</span>
      <span>{mark.label}</span>
    </>
  );
```

In `ReleaseMark`, take `offsetMin` and replace the clock span:

```tsx
function ReleaseMark({ mark, lane, offsetMin }: { mark: Mark; lane: number; offsetMin: number }) {
```

```tsx
      <span className="text-data text-muted">
        <Clock minutes={mark.minutes} offsetMin={offsetMin} />
      </span>
      <span className="text-body text-muted">·</span>
```

In `TapeBand`, add the prop and thread it:

```tsx
export function TapeBand({
  events,
  nowMin = nowEtMinutes(),
  offsetMin = localOffsetMin(),
}: {
  events: MorningEvent[];
  nowMin?: number;
  /** Injected in tests so a clock assertion does not depend on the runner's
   *  hemisphere or the date it runs on. */
  offsetMin?: number;
}) {
```

Set the subtitle to `nothingTimed ? undefined : "all times Sydney"`, and update the three render sites:

```tsx
{aboveLanes.map((m) => (
  <EarningsMark key={m.key} mark={m} lane={m.lane} offsetMin={offsetMin} />
))}
```

```tsx
                  now <Clock minutes={nowMin} offsetMin={offsetMin} />
```

(drop the trailing ` ET`)

```tsx
                      {s.label} · <Clock minutes={s.startMin} offsetMin={offsetMin} />
```

```tsx
{belowLanes.map((m) => (
  <ReleaseMark key={m.key} mark={m} lane={m.lane} offsetMin={offsetMin} />
))}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- components/today/__tests__/TodaysTape.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/today/TodaysTape.tsx dashboard/components/today/__tests__/TodaysTape.test.tsx
git commit -m "Print the tape on the Sydney clock"
```

---

## Task 3: Remove the past-history stepper

**Files:**
- Modify: `dashboard/app/page.tsx`
- Modify: `dashboard/components/today/TodaysTape.tsx` (drop the now-unused `actions` slot)
- Delete: `dashboard/components/today/DateStepper.tsx`
- Delete: `dashboard/components/today/__tests__/DateStepper.test.tsx`
- Test: `dashboard/app/__tests__/page.test.tsx`, `dashboard/components/today/__tests__/TodaysTape.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TodaysTape` takes no props. `Home` takes no `searchParams`.

`DateStepper` has exactly one call site (`app/page.tsx:132`); `reportDates`/`byDate` keep their other consumers (`lib/diff.ts`, `app/api/signals/*`) and stay.

- [ ] **Step 1: Write the failing test**

Replace the `"TodaysTape — panel header"` describe block (`TodaysTape.test.tsx:123-130`) with:

```tsx
describe("TodaysTape — no history", () => {
  it("offers no way to step back to a past date", () => {
    render(<TapeBand events={[event({ time_et: "08:30" })]} nowMin={10 * 60} offsetMin={14 * 60} />);
    expect(screen.queryByRole("button", { name: /yesterday|previous|←/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /yesterday|previous|←/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify the current state**

Run: `cd dashboard && npm run test -- components/today/__tests__/TodaysTape.test.tsx`
Expected: PASS already (the stepper was passed in as `actions`, never rendered by default) — this test is the regression guard, not the driver. The driver is the type error in Step 4.

- [ ] **Step 3: Delete the stepper and its history branch**

```bash
cd /Users/josephstorey/Market_Analyse
git rm dashboard/components/today/DateStepper.tsx dashboard/components/today/__tests__/DateStepper.test.tsx
```

In `dashboard/components/today/TodaysTape.tsx`, replace the default export:

```tsx
export default function TodaysTape() {
  // Same SWR key as the masthead, so the two share one request.
  const { data, error, isLoading } = useMorningReport();
  if (isLoading || error || !data) return null;
  return <TapeBand events={data.today_events ?? []} />;
}
```

Remove `actions` from `TapeBand`'s props and from the `<Panel>` call, and delete the now-unused `ReactNode` import (`import { Fragment } from "react";`).

Rewrite `dashboard/app/page.tsx` lines 5-6, 11, 62-92 and 124-139. The page becomes today-only:

```tsx
import { loadBridgeSignals } from "@/lib/bridge";
import { groupSignals } from "@/lib/groups";
import { diffReports, loadYesterdayRows, type DiffRow } from "@/lib/diff";
import type { BridgeRow, ReportGroup } from "@/types/bridge";
```

(drop the `byDate, reportDates` and `DateStepper` imports)

```tsx
export default async function Home() {
  let rows: BridgeRow[] = [];
  try {
    rows = loadBridgeSignals();
  } catch {
    rows = [];
  }
  const groups = groupSignals(rows);
```

```tsx
  let hasYesterday = false;
  try {
    const yesterday = await loadYesterdayRows();
```

```tsx
  const meta = loadMeta();
  const stale = isStale(meta.generated_at);
  const rotation = loadRotation();

  const sectors = Array.from(
    new Set(rows.map((r) => r.industry).filter((s): s is string => !!s))
  ).sort();

  return (
    <Page width="wide">
      <MorningReport />
      <TodaysTape />
      {(() => {
        const status = statusMessage({
          rows,
          viewingHistory: false,
          stale,
          generatedAt: meta.generated_at,
        });
```

Leave the rest of the render body unchanged.

- [ ] **Step 4: Run the type check and the full suite**

Run: `cd dashboard && npx tsc --noEmit && npm run test:all`
Expected: PASS. If `app/__tests__/page.test.tsx` passes `searchParams` to `Home`, drop that argument there too.

- [ ] **Step 5: Commit**

```bash
git add -A dashboard/app/page.tsx dashboard/components/today
git commit -m "Drop the tape's date stepper — the tape is today"
```

---

## Task 4: Trail-length control on the RRG

**Files:**
- Modify: `dashboard/app/rotation/page.tsx:11, 86-118`
- Modify: `dashboard/components/rotation/RotationView.tsx`
- Modify: `dashboard/lib/storageKeys.ts:25`
- Test: `dashboard/components/rotation/__tests__/RotationView.test.tsx` (create)

**Interfaces:**
- Consumes: `buildTrails(history, industries, weeks)` and `type TrailHistory` from `lib/rotationTrails.ts`.
- Produces: `RotationView` takes `history?: TrailHistory` in place of `trails?: Record<string, TrailPoint[]>`. New storage key `STATIC_KEYS.rotationTrail = "dash:rotation:trail"`.

**Watch out:** `weeklyTrail` slices with `points.slice(-weeks)`. `slice(-0)` is `slice(0)`, which returns the *whole* array — so "Off" must not be expressed as `weeks = 0`. Pass `undefined` for `trails` instead.

- [ ] **Step 1: Write the failing test**

Create `dashboard/components/rotation/__tests__/RotationView.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import RotationView from "@/components/rotation/RotationView";
import type { RotationRow } from "@/components/today/RotationPanel";

const rows: RotationRow[] = [
  { industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
    breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 4 },
  { industry: "Software—Application", quadrant: "lagging", rs_ratio: 97.1, rs_mom: 98.2,
    breadth: 30, n: 40, r1w: -0.4, r1m: -2.1, r3m: -5.0, rank: 2, drank: -3 },
];

const history = {
  Uranium: {
    "2026-06-08": [101.0, 100.2] as [number, number],
    "2026-06-15": [101.6, 100.9] as [number, number],
    "2026-07-13": [102.4, 101.5] as [number, number],
    "2026-07-20": [102.8, 101.9] as [number, number],
    "2026-08-03": [103.2, 102.4] as [number, number],
  },
};

describe("RotationView — trail length", () => {
  it("offers 4w, 8w and Off, defaulting to 8w", () => {
    render(<RotationView rows={rows} history={history} />);
    const control = screen.getByRole("group", { name: /trail/i });
    expect(control).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "8w" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "4w" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Off" })).toBeInTheDocument();
  });

  it("stops announcing tails once they are off", async () => {
    render(<RotationView rows={rows} history={history} />);
    expect(screen.getByText(/week tails/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Off" }));
    expect(screen.queryByText(/week tails/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- components/rotation/__tests__/RotationView.test.tsx`
Expected: FAIL — `RotationView` has no `history` prop and renders no trail control.

- [ ] **Step 3: Implement**

Register the key in `dashboard/lib/storageKeys.ts`, inside `STATIC_KEYS`:

```ts
  macroWindow: "dash:macro:window",
  rotationTrail: "dash:rotation:trail",
```

In `dashboard/app/rotation/page.tsx`, hand the raw history down instead of prebuilt trails — the length is now a client choice:

```tsx
import { type TrailHistory } from "@/lib/rotationTrails";
```

```tsx
export default function RotationPage() {
  const rotation = loadRotation();
  const mtime = loadRotationMtime();
  const namesBySector = loadNamesBySector();
  const history = loadTrailHistory();
```

```tsx
      {rotation ? (
        <RotationView rows={rotation} namesBySector={namesBySector} history={history} />
      ) : (
```

In `dashboard/components/rotation/RotationView.tsx`, replace the prop and add the control:

```tsx
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useLocalStorage } from "@/lib/useLocalStorage";
import { STATIC_KEYS } from "@/lib/storageKeys";
import { buildTrails, type TrailHistory } from "@/lib/rotationTrails";
```

```tsx
/** How far back the tails reach. "Off" is not zero weeks — `weeklyTrail` slices
 *  with `slice(-weeks)`, and `slice(-0)` returns the whole array — so Off passes
 *  no trails at all. */
const TRAIL_OPTIONS = [
  { key: "4", label: "4w" },
  { key: "8", label: "8w" },
  { key: "off", label: "Off" },
];
```

```tsx
export default function RotationView({
  rows,
  namesBySector,
  history,
}: {
  rows: RotationRow[];
  namesBySector?: SectorNames;
  history?: TrailHistory;
}) {
  const sectorParam = useSearchParams()?.get("sector") ?? null;
  const [selected, setSelected] = useState<string | null>(sectorParam);
  const [trailKey, setTrailKey] = useLocalStorage<string>(STATIC_KEYS.rotationTrail, "8");
  const rrgIndex = useMemo(() => rrgIndexByIndustry(rows), [rows]);
  const held = useHeldPositions();

  const trails = useMemo(() => {
    if (trailKey === "off") return undefined;
    return buildTrails(history, rows.map((r) => r.industry), Number(trailKey));
  }, [history, rows, trailKey]);

  return (
    <>
      <SegmentedControl
        label="Trail"
        value={trailKey}
        options={TRAIL_OPTIONS}
        onChange={setTrailKey}
      />
      <RRGChart
        rows={rows}
        namesBySector={namesBySector}
        held={held}
        trails={trails}
        selected={selected}
        onSelect={setSelected}
      />
      <RotationPanel
        rows={rows}
        defaultOpen
        collapsible={false}
        rrgIndex={rrgIndex}
        selected={selected}
        onSelect={setSelected}
      />
    </>
  );
}
```

Drop the now-unused `TrailPoint` import.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- components/rotation && npx tsc --noEmit`
Expected: PASS. If `SegmentedControl` does not render `role="group"` with an accessible name from `label`, adjust the test's query to `screen.getByText("Trail")` and assert against its parent — check `components/ui/SegmentedControl.tsx` before changing the component.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/rotation/page.tsx dashboard/components/rotation dashboard/lib/storageKeys.ts
git commit -m "Let the RRG's tails be shortened or switched off"
```

---

## Task 5: "Moved most" rail card

**Files:**
- Create: `dashboard/components/rotation/MovedMost.tsx`
- Test: `dashboard/components/rotation/__tests__/MovedMost.test.tsx`

**Interfaces:**
- Consumes: `RotationRow` from `@/components/today/RotationPanel`, `QUADRANT_COLOR` from `@/lib/rotation`, `QUADRANT_LABEL` from `@/lib/labels`.
- Produces: `export default function MovedMost({ rows, selected, onSelect }: { rows: RotationRow[]; selected: string | null; onSelect: (industry: string | null) => void })`.

**Feed note:** the mock titles this "Moved most this week" and shows quadrant transitions. `rotation_history.json` has only two dated points (from 2026-08-01), both inside the same ISO week, so no week-over-week transition exists yet. What *is* backed today is `drank` — the change in rank since the last run, already in every `rotation_latest.json` row. The card is built on `drank` and titled for what it shows.

- [ ] **Step 1: Write the failing test**

Create `dashboard/components/rotation/__tests__/MovedMost.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import MovedMost from "@/components/rotation/MovedMost";
import type { RotationRow } from "@/components/today/RotationPanel";

function row(over: Partial<RotationRow>): RotationRow {
  return {
    industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
    breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 1, ...over,
  };
}

describe("MovedMost", () => {
  it("ranks by the size of the rank change, not its sign", () => {
    render(
      <MovedMost
        rows={[
          row({ industry: "Uranium", drank: 2 }),
          row({ industry: "Aerospace & Defense", drank: -7 }),
          row({ industry: "Software—Application", drank: 4 }),
        ]}
        selected={null}
        onSelect={() => {}}
      />
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names[0]).toContain("Aerospace & Defense");
    expect(names[1]).toContain("Software—Application");
  });

  it("signs the move and names the quadrant it landed in", () => {
    render(
      <MovedMost rows={[row({ drank: 4, quadrant: "improving" })]} selected={null} onSelect={() => {}} />
    );
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("Improving")).toBeInTheDocument();
  });

  it("selects a sector when its row is clicked", async () => {
    const onSelect = vi.fn();
    render(<MovedMost rows={[row({ drank: 4 })]} selected={null} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Uranium/ }));
    expect(onSelect).toHaveBeenCalledWith("Uranium");
  });

  it("renders nothing when no row carries a rank change", () => {
    const { container } = render(
      <MovedMost rows={[row({ drank: null })]} selected={null} onSelect={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- components/rotation/__tests__/MovedMost.test.tsx`
Expected: FAIL — cannot resolve `@/components/rotation/MovedMost`.

- [ ] **Step 3: Implement**

Create `dashboard/components/rotation/MovedMost.tsx`:

```tsx
"use client";

import Panel from "@/components/ui/Panel";
import type { RotationRow } from "@/components/today/RotationPanel";
import { QUADRANT_COLOR } from "@/lib/rotation";
import { QUADRANT_LABEL } from "@/lib/labels";

/** How many make the card. Past four it stops being "what moved" and starts
 *  being the table that is already below the chart. */
const TOP_N = 4;

/**
 * The sectors whose rank changed most since the last run. The mock asked for
 * week-over-week quadrant transitions; `rotation_history.json` began on
 * 2026-08-01 and does not yet span two ISO weeks, so this reads the rank change
 * the rotation job already publishes and says so in the subtitle. A row with no
 * `drank` — a sector the previous run did not rank — is not a move and is left
 * out rather than shown as zero.
 */
export default function MovedMost({
  rows,
  selected,
  onSelect,
}: {
  rows: RotationRow[];
  selected: string | null;
  onSelect: (industry: string | null) => void;
}) {
  const moved = rows
    .filter((r) => r.drank !== null && r.drank !== 0)
    .sort((a, b) => Math.abs(b.drank!) - Math.abs(a.drank!))
    .slice(0, TOP_N);

  if (moved.length === 0) return null;

  return (
    <Panel heading="eyebrow" title="Moved most" subtitle="by rank change since the last run">
      <ul className="divide-y divide-line">
        {moved.map((r) => {
          const isSelected = selected === r.industry;
          const label = QUADRANT_LABEL[r.quadrant as keyof typeof QUADRANT_LABEL] ?? r.quadrant;
          return (
            <li key={r.industry}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : r.industry)}
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition-colors ${
                  isSelected ? "bg-accent/5" : "hover:bg-elevated"
                }`}
              >
                <span
                  aria-hidden
                  className="mt-1 block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: QUADRANT_COLOR[r.quadrant] ?? "var(--muted)" }}
                />
                <span className="min-w-0 flex-1 truncate text-body text-foreground">
                  {r.industry}
                </span>
                <span className="shrink-0 text-body text-muted">{label}</span>
                {/* A rank change is model output, not a return — `text-model`,
                    never the P&L palette. */}
                <span className="w-8 shrink-0 text-right text-data text-model">
                  {r.drank! > 0 ? "+" : ""}
                  {r.drank}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- components/rotation/__tests__/MovedMost.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/rotation/MovedMost.tsx dashboard/components/rotation/__tests__/MovedMost.test.tsx
git commit -m "Add the rotation rail's moved-most card"
```

---

## Task 6: Focused-sector rail card

**Files:**
- Create: `dashboard/components/rotation/SectorCard.tsx`
- Modify: `dashboard/components/rotation/RRGChart.tsx:339-369` (drop the foot strip the card replaces)
- Test: `dashboard/components/rotation/__tests__/SectorCard.test.tsx`

**Interfaces:**
- Consumes: `RotationRow`, `SectorNames` (from `RRGChart`), `HeldChips` from `@/lib/positions`, `QUADRANT_COLOR`, `QUADRANT_LABEL`.
- Produces: `export default function SectorCard({ row, names, held }: { row: RotationRow; names: { ticker: string; action_label?: string }[]; held?: Map<string, number> })`.

Per the CUT table, this card carries **no** "Macro tone for this sector" row — macro sector scopes and yfinance industries do not join.

- [ ] **Step 1: Write the failing test**

Create `dashboard/components/rotation/__tests__/SectorCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import SectorCard from "@/components/rotation/SectorCard";
import type { RotationRow } from "@/components/today/RotationPanel";

const row: RotationRow = {
  industry: "Uranium", quadrant: "leading", rs_ratio: 103.2, rs_mom: 102.4,
  breadth: 60, n: 25, r1w: 1.2, r1m: 4.8, r3m: 9.0, rank: 1, drank: 4,
};

describe("SectorCard", () => {
  it("names the sector, its quadrant and its three numbers", () => {
    render(<SectorCard row={row} names={[]} />);
    expect(screen.getByText("Uranium")).toBeInTheDocument();
    expect(screen.getByText("Leading")).toBeInTheDocument();
    expect(screen.getByText("103.2")).toBeInTheDocument();
    expect(screen.getByText("102.4")).toBeInTheDocument();
    expect(screen.getByText("+4.8%")).toBeInTheDocument();
  });

  it("links the names this sector put on today's list", () => {
    render(<SectorCard row={row} names={[{ ticker: "CCJ" }, { ticker: "UEC" }]} />);
    expect(screen.getByRole("link", { name: "CCJ" })).toHaveAttribute("href", "/t/CCJ");
    expect(screen.getByRole("link", { name: "UEC" })).toHaveAttribute("href", "/t/UEC");
  });

  it("says the rotation is there and the setups are not, rather than showing an empty row", () => {
    render(<SectorCard row={row} names={[]} />);
    expect(screen.getByText(/Nothing from this sector made today/)).toBeInTheDocument();
  });

  it("omits the 1M figure entirely when the feed has none", () => {
    render(<SectorCard row={{ ...row, r1m: null }} names={[]} />);
    expect(screen.queryByText("1M")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- components/rotation/__tests__/SectorCard.test.tsx`
Expected: FAIL — cannot resolve `@/components/rotation/SectorCard`.

- [ ] **Step 3: Implement**

Create `dashboard/components/rotation/SectorCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import Panel from "@/components/ui/Panel";
import type { RotationRow } from "@/components/today/RotationPanel";
import { HeldChips } from "@/lib/positions";
import { QUADRANT_COLOR } from "@/lib/rotation";
import { QUADRANT_LABEL } from "@/lib/labels";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="eyebrow">{label}</p>
      <p className="text-data text-foreground">{value}</p>
    </div>
  );
}

/**
 * The sector the chart is currently focused on, in full. This replaces the
 * strip that used to hang off the foot of the RRG panel — same names, same
 * held-position chips, now beside the chart instead of under it.
 *
 * No macro-tone row: the mock has one, but macro scopes are sector_taxonomy
 * families and these rows are yfinance industries, so the join never lands.
 */
export default function SectorCard({
  row,
  names,
  held,
}: {
  row: RotationRow;
  names: { ticker: string; action_label?: string }[];
  held?: Map<string, number>;
}) {
  const label = QUADRANT_LABEL[row.quadrant as keyof typeof QUADRANT_LABEL] ?? row.quadrant;
  return (
    <Panel
      heading="eyebrow"
      title={
        <span className="inline-flex items-baseline gap-2">
          <span
            aria-hidden
            className="block h-2 w-2 shrink-0 self-center rounded-full"
            style={{ background: QUADRANT_COLOR[row.quadrant] ?? "var(--muted)" }}
          />
          {row.industry}
        </span>
      }
      subtitle={label}
    >
      <div className="grid grid-cols-3 gap-2 px-3 py-2">
        <Stat label="RS-Ratio" value={row.rs_ratio.toFixed(1)} />
        <Stat label="RS-Mom" value={row.rs_mom.toFixed(1)} />
        {row.r1m != null && Number.isFinite(row.r1m) && (
          <Stat label="1M" value={`${row.r1m >= 0 ? "+" : ""}${row.r1m.toFixed(1)}%`} />
        )}
      </div>
      <div className="border-t border-line px-3 py-2">
        <p className="eyebrow">Your names in it</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
          {names.length > 0 ? (
            names.map((n) => (
              <Link
                key={n.ticker}
                href={`/t/${n.ticker}`}
                className="rounded border border-line px-1.5 py-px font-mono text-micro text-accent hover:bg-elevated"
              >
                {n.ticker}
              </Link>
            ))
          ) : (
            <span className="text-body text-muted">
              Nothing from this sector made today&rsquo;s list — the rotation is there, the setups
              are not.
            </span>
          )}
          {held && names.length > 0 && (
            <HeldChips
              symbols={names.map((n) => n.ticker)}
              held={held}
              className="border-l border-line pl-2"
            />
          )}
        </div>
      </div>
    </Panel>
  );
}
```

Then delete the superseded foot strip in `dashboard/components/rotation/RRGChart.tsx` — remove the whole `{selectedRow && namesBySector && ( … )}` block (lines 342-369) and the now-unused `selectedRow` / `picked` consts (lines 174-175), the `Link` import (line 15) and the `HeldChips` import (line 20). Keep the `held` prop on `RRGChart`'s signature only if still referenced; if not, remove it from the signature and from `RotationView`'s call.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- components/rotation && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/rotation
git commit -m "Move the focused sector out of the chart's foot and into a card"
```

---

## Task 7: Rotation two-column layout and read-this strip

**Files:**
- Modify: `dashboard/components/rotation/RotationView.tsx`
- Modify: `dashboard/components/rotation/RRGChart.tsx:177-185`
- Test: `dashboard/components/rotation/__tests__/RotationView.test.tsx`

**Interfaces:**
- Consumes: `MovedMost` (Task 5), `SectorCard` (Task 6).
- Produces: no new exports.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/components/rotation/__tests__/RotationView.test.tsx`:

```tsx
describe("RotationView — rail", () => {
  it("focuses the top-ranked sector when nothing is picked", () => {
    render(<RotationView rows={rows} history={history} />);
    expect(screen.getByText("Uranium")).toBeInTheDocument();
    expect(screen.getByText("103.2")).toBeInTheDocument();
  });

  it("follows the pick made in the moved-most card", async () => {
    render(<RotationView rows={rows} history={history} />);
    await userEvent.click(screen.getByRole("button", { name: /Software—Application/ }));
    expect(screen.getByText("97.1")).toBeInTheDocument();
  });

  it("explains the chart at its foot", () => {
    render(<RotationView rows={rows} history={history} />);
    expect(screen.getByText(/the dot is today/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- components/rotation/__tests__/RotationView.test.tsx`
Expected: FAIL — no `103.2` in the document (the rail does not exist).

- [ ] **Step 3: Implement**

In `dashboard/components/rotation/RRGChart.tsx`, add the read-this strip to the `<Panel>` — `Panel` already takes a `readThis` node and renders it as a bottom rule:

```tsx
    <Panel
      title="Relative Rotation Graph"
      subtitle={`RS-Ratio vs RS-Momentum · ${plotted.length} sectors${
        trailWeeks > 1 ? ` · ${trailWeeks}-week tails` : ""
      }${hidden.length > 0 ? ` · ${hidden.length} hidden (no data)` : ""}`}
      readThis={
        <>
          the dot is today and the fading dots behind it are the weeks that led to it, so the{" "}
          <ReadThisTerm>direction of travel matters more than the corner</ReadThisTerm> — a sector
          crossing into Leading from Improving is a different trade from one drifting out of it.
        </>
      }
    >
```

with `import ReadThis, { ReadThisTerm } from "@/components/ui/ReadThis";` — check the module's exports first; if `ReadThisTerm` is a named export only, import just that.

In `dashboard/components/rotation/RotationView.tsx`, wrap the chart and rail:

```tsx
import MovedMost from "@/components/rotation/MovedMost";
import SectorCard from "@/components/rotation/SectorCard";
```

```tsx
  // Nothing picked still has a subject: the top-ranked sector is what the page
  // is about until you say otherwise. An empty rail beside a full chart is a
  // column of furniture.
  const focus = rows.find((r) => r.industry === selected) ?? [...rows].sort((a, b) => a.rank - b.rank)[0] ?? null;

  return (
    <>
      <SegmentedControl
        label="Trail"
        value={trailKey}
        options={TRAIL_OPTIONS}
        onChange={setTrailKey}
      />
      <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
        <RRGChart
          rows={rows}
          namesBySector={namesBySector}
          trails={trails}
          selected={selected}
          onSelect={setSelected}
        />
        <div className="flex flex-col gap-3">
          <MovedMost rows={rows} selected={selected} onSelect={setSelected} />
          {focus && (
            <SectorCard
              row={focus}
              names={namesBySector?.[focus.industry] ?? []}
              held={held}
            />
          )}
        </div>
      </div>
      <RotationPanel
        rows={rows}
        defaultOpen
        collapsible={false}
        rrgIndex={rrgIndex}
        selected={selected}
        onSelect={setSelected}
      />
    </>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- components/rotation && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify against the mock and commit**

Run `cd dashboard && npm run dev`, open `http://localhost:3100/rotation`, and compare against `docs/design/mockups/3b-rotation.html` opened in a browser. Confirm: trail control above the chart, chart left with quadrant labels and a read-this foot, rail right with Moved most over the sector card, table full-width below.

```bash
git add dashboard/components/rotation
git commit -m "Set the RRG beside its rail, and say how to read it"
```

---

## Task 8: Macro methodology — four columns, collapsible

**Files:**
- Modify: `dashboard/app/macro/page.tsx:43-117`
- Test: `dashboard/app/__tests__/macro.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `WINDOW_META`, `NEUTRAL_BAND` from `@/lib/macro`; `Panel`'s `collapsible` / `defaultOpen` / `persistKey` props.
- Produces: no new exports.

The mock's four columns are **Input / Scoring / Weighting / What it isn't**. Our seven `dl` items fold into them: Input = corpus + scopes + `n=`; Scoring = model; Weighting = lookback & decay + 1h/1d change; What it isn't = reading a number. All copy keeps our real values (see Deviations).

- [ ] **Step 1: Write the failing test**

Create `dashboard/app/__tests__/macro.test.tsx` (if it exists, append the describe block):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import MacroPage from "@/app/macro/page";

describe("Macro — methodology", () => {
  it("names exactly the mock's four columns", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    for (const heading of ["Input", "Scoring", "Weighting", "What it isn't"]) {
      expect(await screen.findByText(heading)).toBeInTheDocument();
    }
  });

  it("collapses, and states the real half-life rather than the mock's", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    expect(await screen.findByText(/half-life of 12h/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /How this score is computed/ }));
    expect(screen.queryByText(/half-life of 12h/)).not.toBeInTheDocument();
  });
});
```

Confirm the 1d half-life string in `lib/macro.ts`'s `WINDOW_META` before writing the assertion — the test must match the real value, not `12h` by assumption.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- app/__tests__/macro.test.tsx`
Expected: FAIL — no "Input" heading; the panel does not collapse.

- [ ] **Step 3: Implement**

Replace the `Methodology` function in `dashboard/app/macro/page.tsx` (lines 43-117):

```tsx
function Methodology({ window }: { window: string }) {
  const meta = WINDOW_META[window];
  return (
    // Every number on this page is a model output with a lookback, a decay and
    // a corpus behind it, and a reader who cannot see those cannot tell +0.31
    // from noise. It opens by default for that reason; it collapses because on
    // the fifth visit it is four paragraphs between you and the chart.
    <Panel
      heading="eyebrow"
      title="How this score is computed"
      subtitle="model, sources, decay, and what a number means"
      collapsible
      defaultOpen
      persistKey="macro-methodology"
    >
      <dl className="grid gap-x-6 gap-y-3 px-3 py-2 text-body leading-relaxed sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="eyebrow">Input</dt>
          <dd className="text-2">
            Every item in the news store: the Discord feeds, RSS pulls and whale-flow alerts that
            fill the Chatter &amp; Flow rail, scored once on arrival by the aggregator, which runs
            every 20 minutes — each chart point is one of those runs. Every item lands in{" "}
            <span className="font-mono">GLOBAL</span>; also in <span className="font-mono">US</span>{" "}
            if the headline hits a US-macro keyword (Fed, CPI, payrolls, yields, tariff…) or names a
            tracked ticker, and in <span className="font-mono">sector:X</span> when its ticker
            resolves to a sector family. One item can count in several scopes.{" "}
            <span className="font-mono">n=</span> is the headlines inside the lookback for that
            scope, before decay weighting — a high score on n=3 is three headlines, not a consensus.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Scoring</dt>
          <dd className="text-2">
            FinBERT (ProsusAI/finbert), a sentiment classifier fine-tuned on financial text. Each
            headline scores −1 (bearish) to +1 (bullish) as P(positive) − P(negative). Headline text
            only — bodies are not scored, and no source-reliability multiplier is applied.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Weighting</dt>
          <dd className="text-2">
            The <span className="font-mono">{window}</span> gauge reads the {meta.lookback} only.
            Inside it, weight decays exponentially with age at a half-life of {meta.halfLife}, so a
            headline that old counts half as much as one arriving now. Nothing outside the lookback
            counts at all. The 1h and 1d figures are this scope&rsquo;s move against one hour and one
            day ago; a dash means there is not enough history stored yet to compute it.
          </dd>
        </div>
        <div>
          <dt className="eyebrow">What it isn&rsquo;t</dt>
          <dd className="text-2">
            ±{NEUTRAL_BAND.toFixed(2)} is the neutral band — inside it the tone is treated as no
            signal, so +0.04 is <em>not</em> mild bullishness. Beyond it the score says the weighted
            balance of coverage leans one way; it does not forecast a return, and it is not an input
            to any trade signal.
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- app/__tests__/macro.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/macro/page.tsx dashboard/app/__tests__/macro.test.tsx
git commit -m "Fold the macro methodology into four columns that fold away"
```

---

## Task 9: Macro scope tiles, five up

**Files:**
- Modify: `dashboard/app/macro/page.tsx:217-235`
- Modify: `dashboard/components/macro/ScopeTile.tsx`
- Test: `dashboard/app/__tests__/macro.test.tsx`

**Interfaces:**
- Consumes: `byMovement`, `MacroTile`.
- Produces: no signature change to `ScopeTile`.

- [ ] **Step 1: Write the failing test**

Append to `dashboard/app/__tests__/macro.test.tsx`:

```tsx
describe("Macro — scope tiles", () => {
  it("says how the tiles are ordered and what clicking one does", async () => {
    mockFetchJson({});
    render(<MacroPage />);
    expect(
      await screen.findByText("sorted by 24h change · click any tile for its articles")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- app/__tests__/macro.test.tsx`
Expected: FAIL — that string is not in the document.

- [ ] **Step 3: Implement**

In `dashboard/app/macro/page.tsx`, wrap the tile grid in a labelled section and widen it to five. `byMovement` already supplies the ordering the subtitle claims — do not add a second sort:

```tsx
      <section aria-label="Sentiment scopes" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="eyebrow">Scopes</span>
          <span className="text-body text-muted">
            sorted by 24h change · click any tile for its articles
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((t) => (
            <ScopeTile
              key={t.scope}
              tile={t}
              selected={t.scope === scope}
              onSelect={() => { setResetNotice(null); setScope(t.scope); }}
            />
          ))}
          {rows.length === 0 &&
            gauges.map((g) => (
              <ScopeTile
                key={g.scope}
                tile={{ scope: g.scope, score: g.score, n: g.n, ts: "", delta_1h: null, delta_1d: null, spark: [] }}
                selected={g.scope === scope}
                onSelect={() => setScope(g.scope)}
              />
            ))}
        </div>
      </section>
```

In `dashboard/components/macro/ScopeTile.tsx`, give the score the size the mock does — it is the tile's subject and currently reads the same weight as the deltas beneath it. Change the score span (line 47) to:

```tsx
        <span className={`text-title tabular-nums ${toneClass(tile.score)}`}>
```

Check `app/globals.css` for the available type-scale utilities before using `text-title`; if the scale names differ, use the largest one below the page title and keep `tabular-nums`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test -- app/__tests__/macro.test.tsx components/macro && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/app/macro/page.tsx dashboard/components/macro/ScopeTile.tsx dashboard/app/__tests__/macro.test.tsx
git commit -m "Give the macro scopes a labelled five-up grid"
```

---

## Task 10: Macro two-column layout, with a fuller "what moved it"

**Files:**
- Modify: `dashboard/app/macro/page.tsx:237-269`
- Modify: `dashboard/components/macro/Contributors.tsx`
- Modify: `dashboard/components/macro/ScopeBand.tsx:114-143`
- Test: `dashboard/components/macro/__tests__/Contributors.test.tsx`, `.../ScopeBand.test.tsx`

**Interfaces:**
- Consumes: `MacroContributor {headline, ticker, source, url, ts, score, weight, share}` from `@/lib/macro`.
- Produces: `ScopeBand` renders a stacked `Panel` titled "Where this lands" instead of a horizontal band; same props, same null-when-empty behaviour.

Per the CUT table: **no** "All N articles →" link (there is no articles route), and **no** rotation-quadrant row.

- [ ] **Step 1: Write the failing tests**

Create or append `dashboard/components/macro/__tests__/Contributors.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import Contributors from "@/components/macro/Contributors";

const payload = {
  scope: "global",
  window: "1d",
  n: 412,
  score: 0.31,
  tickers: [],
  items: [
    {
      headline: "Fed holds rates, signals one cut",
      ticker: null,
      source: "Bloomberg",
      url: "https://example.test/a",
      ts: "2026-08-03T09:18:00Z",
      score: 0.82,
      weight: 1.0,
      share: 0.12,
    },
  ],
};

describe("Contributors", () => {
  it("prints each item's weight, clock and source under its headline", async () => {
    mockFetchJson({ "/api/macro/contributors": payload });
    render(<Contributors scope="global" window="1d" />);
    expect(await screen.findByText(/w 1\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Bloomberg/)).toBeInTheDocument();
  });

  it("counts the headlines behind the gauge without pretending they are browsable", async () => {
    mockFetchJson({ "/api/macro/contributors": payload });
    render(<Contributors scope="global" window="1d" />);
    expect(await screen.findByText(/412 scored headlines/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /all 412/i })).not.toBeInTheDocument();
  });
});
```

Check `test/fetchMock.ts`'s `mockFetchJson` key-matching semantics (exact URL vs prefix) and write the key to match; the contributors URL includes a query string.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd dashboard && npm run test -- components/macro/__tests__/Contributors.test.tsx`
Expected: FAIL — no `w 1.00` line.

- [ ] **Step 3: Implement**

In `dashboard/components/macro/Contributors.tsx`, add a clock formatter beside `ageOf`:

```tsx
/** The item's own clock, local — the rail sits beside a chart whose x-axis is
 *  local time, and "3h ago" cannot be lined up against it. */
function clockOf(ts: string): string {
  const at = new Date(ts.endsWith("Z") || ts.includes("+") ? ts : `${ts}Z`);
  if (!Number.isFinite(at.getTime())) return "—";
  return at.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
}
```

Restack each `<li>` so the headline gets the rail's full width, with the provenance on its own line:

```tsx
              <li key={`${c.ts}-${i}`} className="px-3 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className={`w-12 shrink-0 text-data ${toneClass(c.score)}`}>
                    {signed(c.score)}
                  </span>
                  <span className="min-w-0 flex-1 text-body text-foreground">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="hover:text-accent">
                        {c.headline}
                      </a>
                    ) : (
                      c.headline
                    )}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 pl-14 text-data text-muted">
                  <span>w {c.weight.toFixed(2)}</span>
                  <span>·</span>
                  <span>{clockOf(c.ts)}</span>
                  <span>·</span>
                  <span>{c.source}</span>
                  <span>·</span>
                  <span>{(c.share * 100).toFixed(0)}% share</span>
                  {c.ticker && (
                    <Link href={`/t/${c.ticker}`} className="text-accent hover:underline">
                      {c.ticker}
                    </Link>
                  )}
                  <span className="ml-auto">{ageOf(c.ts)}</span>
                </div>
              </li>
```

In `dashboard/components/macro/ScopeBand.tsx`, replace the horizontal band (lines 114-143) with a stacked rail card. `Cell` becomes a row:

```tsx
function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-t border-line px-3 py-2 first:border-t-0">
      <p className="eyebrow">{title}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-1.5">{children}</div>
    </div>
  );
}
```

```tsx
  return (
    <Panel heading="eyebrow" title="Where this lands">
      {driving.length > 0 && (
        <Cell title="names driving this scope">
          {driving.map((t) => (
            <Chip key={t.ticker} ticker={t.ticker} suffix={`×${t.n}`} />
          ))}
        </Cell>
      )}
      {held.length > 0 && (
        <Cell title="your exposure">
          {held.map((p) => (
            <Chip
              key={p.symbol}
              ticker={p.symbol!}
              suffix={`${(p.position ?? 0) > 0 ? "+" : ""}${p.position}`}
            />
          ))}
        </Cell>
      )}
      {catalyst && cal && (
        <Cell title="next catalyst">
          <Link href="/calendar" className="text-body text-foreground hover:text-accent">
            {eventShortName(catalyst.event, catalyst.category, catalyst.ticker)}
          </Link>
          <span className="text-data text-muted">{whenLabel(catalyst.date, cal.today)}</span>
        </Cell>
      )}
      <Cell title="see also">
        <Link href="/rotation" className="text-body text-accent hover:underline">
          Rotation ›
        </Link>
        <Link href="/calendar" className="text-body text-accent hover:underline">
          Calendar ›
        </Link>
      </Cell>
    </Panel>
  );
```

with `import Panel from "@/components/ui/Panel";` added. The `if (driving.length === 0 && held.length === 0 && !catalyst) return null;` guard stays — the "see also" row must not keep an otherwise-empty card alive.

In `dashboard/app/macro/page.tsx`, put the chart and the rail side by side:

```tsx
      {anyData ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
          <Page.Section>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body text-muted">
              {/* legend — unchanged */}
            </div>
            <MacroChart points={series?.points ?? []} spx={hist?.bars ?? []} />
          </Page.Section>
          <div className="flex flex-col gap-3">
            <Contributors scope={scope} window={win} />
            <ScopeBand scope={scope} window={win} />
          </div>
        </div>
      ) : (
        <Empty message="No macro data yet — the aggregator runs every 20 min." />
      )}
```

Keep the legend block exactly as it is — only the wrapper changes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd dashboard && npm run test:all && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify against the mock and commit**

Run `cd dashboard && npm run dev`, open `http://localhost:3100/macro`, and compare against `docs/design/mockups/3c-macro.html`. Confirm: lookback control, collapsible four-column methodology, labelled five-up tiles, chart left with its legend, rail right with "What moved …" over "Where this lands".

```bash
git add dashboard/app/macro dashboard/components/macro
git commit -m "Set the macro chart beside its rail"
```

---

## Task 11: Commit the mocks and close out

**Files:**
- Add: `docs/design/mockups/*.html` (15 files, currently untracked)
- Modify: `docs/SESSION_HANDOFF.md`

The mocks were generated in a prior session's scratchpad under `/private/tmp` and copied into the repo this session. They are the spec these three screens were built against and are the only copy outside a temp directory — commit `5b29b74`'s message records untracked files in this repo vanishing on 2026-07-30.

- [ ] **Step 1: Confirm the mock set is complete**

Run: `ls docs/design/mockups/ | wc -l`
Expected: `15`.

- [ ] **Step 2: Commit the mocks**

```bash
git add docs/design/mockups
git commit -m "Track the 2026-08-02 screen mocks"
```

- [ ] **Step 3: Record what was cut**

Add a short section to `docs/SESSION_HANDOFF.md` under §6 "Smaller open items" listing the seven CUT rows from this plan's Global Constraints, each with its one-line reason, so a later reader does not re-open them as bugs against the mocks.

- [ ] **Step 4: Run the full gate**

Run: `cd dashboard && npm run test:all && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/SESSION_HANDOFF.md
git commit -m "Record what the mock conformance pass deliberately left out"
```

---

## Self-Review

**Spec coverage.** 3b rotation: header ✓ (existing), trail control ✓ T4, verdict paragraph CUT, RRG with in-chart quadrant labels ✓ (existing `QuadrantLabel`), direct point names — deviation recorded, trails ✓ T4, ETF chips CUT, read-this strip ✓ T7, "Moved most" ✓ T5, focused sector card ✓ T6 (macro-tone row CUT), "Ahead of it" CUT, two-column grid ✓ T7. 3c macro: header ✓, lookback ✓ (existing), four-column collapsible methodology ✓ T8, five-up tiles with subtitle ✓ T9, chart legend + neutral band ✓ (existing), read-this strip on the chart panel — **gap**: the mock has one and Task 10 does not add it. Fix: Task 10 Step 3 also passes `readThis` to the chart's `Page.Section`; since `Page.Section` may not accept it, add the sentence as a bordered `<p>` under `MacroChart` matching `ReadThis`'s shape — flagged here for the implementer to resolve against `components/ui/Page.tsx`. "What moved it" ✓ T10, "All N articles" CUT, "Where this lands" ✓ T10. 1a tape: date stepper removed ✓ T3, Sydney times ✓ T1+T2, session bar / now marker / lanes ✓ (already matched), release actuals CUT.

**Placeholder scan.** No TBDs. Three steps direct the implementer to *check* something before writing (`SegmentedControl`'s role in T4 Step 4, the type-scale utility in T9 Step 3, `mockFetchJson`'s key semantics in T10 Step 1) — these are verifications against real files with a stated fallback, not deferred decisions.

**Type consistency.** `fmtClock` (renamed once, in T1) is used under that name in T1 and T2. `fmtLocalClock` returns `{ clock, dayShift }` in T1 and is destructured that way in T2's `Clock`. `RotationView`'s `history?: TrailHistory` prop is introduced in T4 and used in T7's tests. `MovedMost({ rows, selected, onSelect })` and `SectorCard({ row, names, held })` match their T7 call sites. `STATIC_KEYS.rotationTrail` is registered in T4 and read in T4 only.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-03-rotation-macro-tape-mocks.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
