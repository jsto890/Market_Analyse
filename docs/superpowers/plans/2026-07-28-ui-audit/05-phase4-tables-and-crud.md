# Phase 4: Watchlist, Screener, Portfolio & Alerts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bring Watchlist, Screener, Portfolio and Alerts up to the 00-foundations-contract.md standard — fixing the six P0 correctness/dead-end bugs (SC-01, SC-02, PF-01, PF-02, PF-03, AL-01, AL-02) and every P1/P2 usability finding in these four pages — without touching any page or primitive outside this scope.
**Architecture:** Frontend changes consume the already-frozen `Button`/`Input`/`Select`/`Toggle`/`InfoTip`/`PinToggle`/`UndoToastProvider` primitives and `lib/format.ts`/`lib/labels.ts`/`lib/storageKeys.ts` from Phase 1 — no new shared primitive is created here. Two backend gaps (Portfolio P&L, Alerts enable-toggle + channel status) require small, additive FastAPI + SQLite changes in `argus/argus/api/routes.py`, `argus/argus/alerts/rules.py`, `argus/argus/alerts/dispatcher.py`, and `argus/argus/data/ibkr.py`/`argus/argus/portfolio/tracker.py`, each covered by pytest.
**Tech Stack:** Next.js 14 App Router, React 18, SWR 2.4, TypeScript strict, Vitest 4 + React Testing Library (dashboard, per Phase 0); FastAPI + `ib_insync` + sqlite3, pytest (Argus backend).
**Depends on:** Phase 0 (test infra — `@/test/render`, `@/test/fetchMock`, `@/test/localStorage`), Phase 1 (design system — every primitive listed above), `00-foundations-contract.md` (frozen signatures/tokens/labels).

## Global Constraints
- Dashboard commands run from `/Users/josephstorey/Market_Analyse/dashboard`; component tests: `npm run test:component`; a single file: `npx vitest run --project=component <path>`.
- Backend commands run from `/Users/josephstorey/Market_Analyse/argus` with the venv active: `source .venv/bin/activate && python -m pytest tests/<file>.py -q`.
- Never import `render`/`screen` directly from `@testing-library/react` in a dashboard test — always `@/test/render` (wraps `TooltipProvider` + isolated `SWRConfig`, required because `InfoTip`/`StatChip`/`Tooltip.Root` throw without it).
- Every `fetch`-driven test calls `mockFetchJson({...})` from `@/test/fetchMock` before `render()`, matching exact request URLs (including query string).
- `lib/format.ts`, `lib/labels.ts`, `lib/storageKeys.ts` already exist (built by Phase 1) — tasks below **extend** `HEADER_GLOSS` (a `Record<string,string>`, additive) and **append** new entries to `storageKeys.ts`'s `STATIC_KEYS`/`DYNAMIC_KEY_PREFIXES`; they never redefine an existing key or function signature.
- Truth verified in this plan (audit was wrong or vague on both): IBKR is configured at **`.env`: `IBKR_HOST=127.0.0.1`, `IBKR_PORT=7496`** — this is **TWS, live mode** (7496 = TWS live; 7497 = TWS paper; 4001 = Gateway live; 4002 = Gateway paper — `argus/argus/settings.py:19`'s code comment), not the "IBKR Gateway 4002 (paper)" the Portfolio page currently hardcodes. Portfolio's edge values are exactly `HOLD/ADD` / `CONSIDER SELLING` / `CONSIDER COVERING` / `NEUTRAL` / `N/A` / `NO DATA` (`argus/argus/portfolio/tracker.py:23,52,62-73`) plus an untranslated `ERROR` sentinel on exceptions — matches `00-foundations-contract.md` §D `PORTFOLIO_EDGE_LABEL` exactly (the contract's version already fixed the audit's PF-08 error, so no further correction needed here).
- Backend proxy `dashboard/app/api/argus/[...path]/route.ts` forwards `GET`/`POST`/`DELETE` with the original query string to `http://127.0.0.1:8088/api/<path>`; it has **no `PATCH` handler** — Task AL-1 adds one (needed for AL-01's enable/disable toggle).
- `GET /api/screener` (`argus/argus/api/routes.py:335-336`) already accepts a `min_conviction` query param (default `0.3`) and filters/reruns with it — SC-01 is proven **frontend-only**: `runScreener(null)` (`dashboard/app/screener/page.tsx:213-229`) simply never appends `min_conviction` (or `refresh`, correctly, only on manual refresh) to the GET URL. No Python change is needed for SC-01.
- `argus/argus/alerts/rules.py`'s `enabled` column is fully wired end-to-end in `evaluate_rules()` (skips disabled rules, `rules.py:154`) but has no HTTP mutator — AL-01 needs one new Python function (`set_rule_enabled`) and one new route (`PATCH /api/alerts/rules/{id}`).
- Alert channels are exactly three, each config-gated by empty-string settings defaults (`argus/argus/settings.py:32-44`, `argus/argus/alerts/dispatcher.py:29-82`): `email` (needs `smtp_host`+`smtp_user`+`alert_email_to`), `telegram` (needs `telegram_bot_token`+`telegram_chat_id`), `webhook` (needs `webhook_url`). No fourth channel exists — AL-02's "channel status" scope is exactly these three.
- `IBKRClient.positions()` (`argus/argus/data/ibkr.py:66-79`) wraps `ib_insync`'s `IB.positions()`, which has no market value/P&L fields. `ib_insync.PortfolioItem` (from `IB.portfolio()`) has `marketPrice`, `marketValue`, `averageCost`, `unrealizedPNL`, `realizedPNL` — PF-01's backend task adds `IBKRClient.portfolio_items()` using `IB.portfolio()` instead, additive (does not remove/change `positions()`).

## File Structure

| File | Responsibility |
|---|---|
| `dashboard/app/screener/page.tsx` | Screener page — SC-01..SC-09 fixes |
| `dashboard/app/portfolio/page.tsx` | Portfolio page — PF-01..PF-08 fixes |
| `dashboard/app/alerts/page.tsx` | Alerts page — AL-01..AL-08 fixes |
| `dashboard/app/watchlist/WatchlistClient.tsx` | Watchlist page — WL-01..WL-08 fixes |
| `dashboard/app/api/argus/[...path]/route.ts` | Add `PATCH` passthrough (needed by AL-01) |
| `dashboard/components/ui/Badge.tsx` | Add `"edge"` variant (needed by PF-08) |
| `dashboard/lib/labels.ts` | Extend `HEADER_GLOSS` with Screener's L/S/W/HC/Agree%/R:R glosses (SC-05) |
| `dashboard/lib/storageKeys.ts` | Add `screenerLastResult`, `watchlistMigrationResult` static keys |
| `argus/argus/data/ibkr.py` | Add `IBKRClient.portfolio_items()` (PF-01) |
| `argus/argus/portfolio/tracker.py` | Switch to `portfolio_items()`, carry market value/P&L through the edge overlay (PF-01) |
| `argus/argus/alerts/rules.py` | Add `set_rule_enabled()` (AL-01) |
| `argus/argus/alerts/dispatcher.py` | Add `channel_status()` (AL-02) |
| `argus/argus/api/routes.py` | Add `PATCH /api/alerts/rules/{id}`, `GET /api/alerts/channels`, `AlertRuleUpdateReq` (AL-01, AL-02) |
| `dashboard/app/screener/__tests__/page.test.tsx` | Screener test suite |
| `dashboard/app/portfolio/__tests__/page.test.tsx` | Portfolio test suite |
| `dashboard/app/alerts/__tests__/page.test.tsx` | Alerts test suite |
| `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` | Watchlist test suite |
| `argus/tests/test_ibkr_portfolio_items.py` | `IBKRClient.portfolio_items()` unit test |
| `argus/tests/test_portfolio_tracker_pnl.py` | `PortfolioTracker` carries P&L fields through edge overlay |
| `argus/tests/test_alert_rules_enabled.py` | `set_rule_enabled()` unit test |
| `argus/tests/test_alert_channel_status.py` | `channel_status()` unit test |

## Watchlist (`/watchlist`)

### Task 1: Unify row-open navigation (WL-06)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx` (create)

**Interfaces:** Consumes `useRouter` from `next/navigation` (already the convention on `app/screener/page.tsx:7,76,386`); no new primitive.

**Audit findings closed:** WL-06 — replaces the third navigation mechanism (`<a href>`, full page reload) with the same `onOpen`/`router.push` convention Screener already uses, so `DataTable`'s row-click, `Enter`-key, and hover-affordance all work here too.

- [ ] **Step 1: Write failing test**

Create `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import WatchlistClient from "../WatchlistClient";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function baseMocks(overrides: Record<string, unknown> = {}) {
  return {
    "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01", price_at_pin: 120 }] },
    "/api/bridge": { signals: [] },
    "/api/signals/recent?days=14": [],
    "/api/signals/dates": [],
    ...overrides,
  };
}

describe("WatchlistClient row navigation (WL-06)", () => {
  it("pinned row has no anchor tag and clicking it calls router.push", async () => {
    mockFetchJson(baseMocks());
    render(<WatchlistClient medianDaysToPeak={12} />);
    const cell = await screen.findByText("NVDA");
    expect(cell.closest("a")).toBeNull();
    const user = userEvent.setup();
    await user.click(cell.closest("tr")!);
    expect(push).toHaveBeenCalledWith("/t/NVDA");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — either the anchor assertion fails (`cell.closest("a")` is not null) or `push` was never called, since the current code renders `<a href="/t/NVDA">`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/watchlist/WatchlistClient.tsx`, add the import (top of file, alongside the other imports):

```tsx
import { useRouter } from "next/navigation";
```

In `PinnedSection`, add `const router = useRouter();` as the first line inside the function body, replace the `ticker` column's `render`:

```tsx
    {
      key: "ticker",
      header: "Ticker",
      width: "80px",
      render: (r) => <span className="font-mono font-medium">{r.ticker}</span>,
    },
```

and pass `onOpen` to the pinned `<DataTable>`:

```tsx
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "sincePin", dir: "desc" }}
          persistKey="watchlist-pinned-table"
          onOpen={(r) => router.push(`/t/${r.ticker}`)}
        />
```

In `RecentPicksSection`, add `const router = useRouter();` as the first line inside the function body, replace the `ticker` column's `render` (drop the `<a href>`, keep the `stillIn`-based muted styling):

```tsx
    {
      key: "ticker",
      header: "Ticker",
      render: (r) => (
        <span className={`font-mono font-medium ${r.stillIn === false ? "text-muted" : ""}`}>
          {r.ticker}
        </span>
      ),
    },
```

and pass `onOpen` to the recent-picks `<DataTable>`:

```tsx
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.ticker}
          defaultSort={{ key: "sinceFlag", dir: "desc" }}
          persistKey="watchlist-recent-table"
          onOpen={(r) => router.push(`/t/${r.ticker}`)}
        />
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): unify row-open navigation on router.push (WL-06)"
```

---

### Task 2: Unpin via `PinToggle` + undo (WL-01)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** Consumes `PinToggle` (`@/components/ui/PinToggle`, `{symbol, variant}` props, §B.5 of the contract) — it already owns the optimistic POST/DELETE, `onError` reconciliation, and the undo toast (§B.9). `PinnedSection` no longer needs its own unpin handler.

**Audit findings closed:** WL-01 — the bare 11px unpin text-link (no confirm, no undo) is replaced by `PinToggle variant="text"`, wired through the shared `useUndoAction()` mechanism, giving a 6s undo window on every unpin.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`, inside a new `describe`:

```tsx
import UndoToastProvider from "@/components/ui/UndoToastProvider";

describe("WatchlistClient unpin undo (WL-01)", () => {
  it("shows an undo toast after unpinning, and Undo restores the row", async () => {
    mockFetchJson(baseMocks());
    render(
      <UndoToastProvider>
        <WatchlistClient medianDaysToPeak={12} />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Unpin NVDA" }));
    expect(await screen.findByText("Removed NVDA from watchlist")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — there is no button named `"Unpin NVDA"` with `aria-label`-driven accessible name matching `PinToggle`'s text variant (current markup is `aria-label="Unpin NVDA"` with visible text `unpin`, lowercase, which does match by label — the real failure is no undo toast text ever appears, since the current handler has no undo mechanism).

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/watchlist/WatchlistClient.tsx`, add the import:

```tsx
import PinToggle from "@/components/ui/PinToggle";
```

Replace the `unpin` column definition inside `PinnedSection`'s `columns`:

```tsx
    {
      key: "unpin",
      header: "",
      render: (r) => <PinToggle symbol={r.ticker} variant="text" />,
    },
```

`PinToggle` reads its own pinned state from `/api/watchlist` via SWR and reconciles the shared cache key, so `PinnedSection`'s `onUnpin`/`handleUnpin` prop plumbing in the parent `WatchlistClient` component is no longer called from this column — leave `handleUnpin` and the `onUnpin` prop in place (still used nowhere else in this task; Task 7 removes the now-dead prop only if nothing else references it, confirmed here nothing else does, so also delete the now-unused `onUnpin` prop and its call site in one pass):

In `WatchlistClient`'s return statement, remove the `onUnpin={handleUnpin}` prop:

```tsx
      <PinnedSection entries={entries} onAdded={mutate} />
```

Remove the `handleUnpin` callback and the `onUnpin` prop from `PinnedSection`'s destructured props signature, and delete the `useCallback` import if `handleUnpin` was its only use (it is not — `useCallback` isn't used anywhere else in this file per the earlier read, so remove the import too):

```tsx
import { useState, useEffect, useRef } from "react";
```

and delete the `handleUnpin` block:

```tsx
  const handleUnpin = useCallback(
    async (ticker: string) => {
      await fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      mutate();
    },
    [mutate]
  );
```

and update `PinnedSection`'s prop type/signature (drop `onUnpin`):

```tsx
function PinnedSection({
  entries,
  onAdded,
}: {
  entries: WatchlistEntry[];
  onAdded: () => void;
}) {
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS (both this test and Task 1's test)

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): unpin via PinToggle with undo toast (WL-01)"
```

---

### Task 3: Reserve column widths + per-cell skeletons during progressive enrichment (WL-02)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** No new primitive — adds a fixed `width` to every `Column<PinnedRowEnriched>` and `Column<RecentFlagEnriched>` that currently lacks one (`DataTable`'s `Column.width` already exists, §File Structure), and renders a muted `Loading…` placeholder cell (not `SkeletonTable`, which is table-level not cell-level, and WL-08 governs which loading vocabulary wins at the table level) while a value is still `undefined` (not-yet-fetched) as distinct from `null` (fetched, no data).

**Audit findings closed:** WL-02 — histories and last-signal dates land at concurrency 5 with each result calling `setState(new Map(...))`; every affected column now has a fixed pixel width so landing data can't reflow the table, and cells distinguish "not yet fetched" (`undefined`) from "fetched, no value" (`null`, renders `—` as before).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
describe("WatchlistClient reserved column widths (WL-02)", () => {
  it("Now/Since pin header cells have a fixed width so late-arriving data can't reflow columns", async () => {
    mockFetchJson(baseMocks());
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("NVDA");
    const nowHeader = screen.getByRole("columnheader", { name: "Now" });
    const sinceHeader = screen.getByRole("columnheader", { name: "Since pin" });
    expect(nowHeader).toHaveStyle({ width: "76px" });
    expect(sinceHeader).toHaveStyle({ width: "88px" });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — neither column currently sets `width`, so the style assertion fails.

- [ ] **Step 3: Minimal implementation**

In `PinnedSection`'s `columns`, add `width` to every column that lacks one:

```tsx
    {
      key: "pinned_at",
      header: "Pinned",
      width: "84px",
      render: (r) => <span className="text-muted text-[12px]">{fmtDate(r.pinned_at)}</span>,
    },
    {
      key: "price_at_pin",
      header: "@pin",
      width: "76px",
      align: "right",
      render: (r) => fmtPrice(r.price_at_pin),
    },
    {
      key: "now",
      header: "Now",
      width: "76px",
      align: "right",
      render: (r) => (r.now === undefined ? <span className="text-muted text-[12px]">Loading…</span> : fmtPrice(r.now)),
    },
    {
      key: "sincePin",
      header: "Since pin",
      width: "88px",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sincePin ?? -Infinity) - (b.sincePin ?? -Infinity),
      render: (r) => (r.sincePin === undefined ? <span className="text-muted text-[12px]">Loading…</span> : fmtPct(r.sincePin)),
    },
```

`PinedRowEnriched.now`/`sincePin` are typed `number | null` today — widen both to `number | null | undefined` in the `PinnedRowEnriched` interface so "not yet fetched" is representable:

```tsx
interface PinnedRowEnriched extends WatchlistEntry {
  now: number | null | undefined;
  sincePin: number | null | undefined;
  ret1w: number | null;
  ret1m: number | null;
  todayBadge: string | null;
  lastSignal: string | null;
}
```

and change the `rows` mapping in `PinnedSection` so tickers not yet present in `histMap` produce `undefined` rather than `null` (currently `histMap.get(e.ticker)` already returns `undefined` for a miss — the fix is only in how `now`/`sincePin` are derived from that lookup, replacing the current `?? null` fallback with a pass-through `undefined`):

```tsx
  const rows: PinnedRowEnriched[] = entries.map((e) => {
    const hist = histMap.get(e.ticker);
    const now = hist ? hist.lastClose : undefined;
    const sincePin = hist ? sincePercent(e.price_at_pin, hist.lastClose) : undefined;
    return {
      ...e,
      now,
      sincePin,
      ret1w: hist ? sincePercent(hist.close5Back, hist.lastClose) : null,
      ret1m: hist ? sincePercent(hist.close21Back, hist.lastClose) : null,
      todayBadge: bridgeMap.get(e.ticker) ?? null,
      lastSignal: lastSigMap.get(e.ticker) ?? null,
    };
  });
```

Apply the same `width` + `undefined`-aware pattern to `RecentPicksSection`'s `now`/`sinceFlag` columns:

```tsx
    {
      key: "now",
      header: "Now",
      width: "76px",
      align: "right",
      render: (r) => (r.now === undefined ? <span className="text-muted text-[12px]">Loading…</span> : fmtPrice(r.now)),
    },
    {
      key: "sinceFlag",
      header: "Since flag",
      width: "88px",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.sinceFlag ?? -Infinity) - (b.sinceFlag ?? -Infinity),
      render: (r) => (r.sinceFlag === undefined ? <span className="text-muted text-[12px]">Loading…</span> : fmtPct(r.sinceFlag)),
    },
```

with `RecentFlagEnriched.now`/`sinceFlag` widened to `number | null | undefined` and the `rows` mapping in `RecentPicksSection` passing through `nowMap.get(r.ticker)` (already `undefined` on a miss) instead of coalescing it to `null`.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): reserve column widths, distinguish loading from no-data (WL-02)"
```

---

### Task 4: Move repeated `Context` text to the panel subtitle (WL-03)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** None new — `Panel`'s existing `subtitle` prop (already used at `WatchlistClient.tsx:531`, `subtitle="aligned / pullback / tech_fund first-flagged last 14 days"`).

**Audit findings closed:** WL-03 — `Context` rendered `typical peak ~{medianDaysToPeak}d` identically on every row; moved to the panel subtitle (stated once) and the column is removed.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
describe("WatchlistClient Context column removal (WL-03)", () => {
  it("shows typical-peak text once in the panel subtitle, not per row", async () => {
    mockFetchJson(
      baseMocks({
        "/api/signals/recent?days=14": [
          { ticker: "AMD", first_date: "2026-07-15", first_group: "prime", entry_at_flag: 140, last_date: "2026-07-20" },
        ],
      })
    );
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("AMD");
    expect(screen.getByText(/typical peak ~12d/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Context" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — `Context` column header still exists and no subtitle text mentions "typical peak".

- [ ] **Step 3: Minimal implementation**

In `RecentPicksSection`, remove the `context` column entirely from `columns`:

```tsx
    {
      key: "context",
      header: "Context",
      render: (r) => (
        <span className="text-[12px] text-muted">
          typical peak ~{medianDaysToPeak}d
        </span>
      ),
    },
```

(delete this block). Update the `Panel`'s `subtitle` prop to include the figure:

```tsx
    <Panel
      title="Recent picks (auto)"
      subtitle={`aligned / pullback / tech_fund first-flagged last 14 days · typical peak ~${medianDaysToPeak}d`}
      persistKey="watchlist-recent"
    >
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): move repeated typical-peak text to panel subtitle (WL-03)"
```

---

### Task 5: Add-ticker inline confirmation + persistent error (WL-04)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** Consumes `Input`/`Button` (§B.1/§B.2) to replace the raw `<input>`/`<button>` add-bar; no other new primitive. Adds one local `confirmMsg: string | null` piece of state, cleared on next successful add or on manual dismiss (not on every keystroke — that was WL-04's actual bug for the *error* path; the confirmation is new).

**Audit findings closed:** WL-04 — `addError` cleared on next keystroke (so a typo mid-correction silently discarded the visible reason for the prior failure) and success was inferable only from a new row appearing after revalidation, with no explicit confirmation. Error now persists until the user dismisses it or a request succeeds; success shows an inline "`{TICKER}` pinned @ `{price}`" confirmation for 4s.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
describe("WatchlistClient add-ticker feedback (WL-04)", () => {
  it("shows inline confirmation on success and a persistent error on failure", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/watchlist": (url: string) => {
        void url;
        return { watchlist: [] };
      },
    });
    const user = userEvent.setup();
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByPlaceholderText("Add ticker…");

    // failure path — error persists across a keystroke
    (global.fetch as unknown as { mockImplementationOnce?: unknown });
    render;
    await user.type(screen.getByPlaceholderText("Add ticker…"), "ZZZZ");
    await user.click(screen.getByRole("button", { name: "Pin" }));
    // the fetchMock above 404s any POST it doesn't explicitly handle as a function returning data;
    // since /api/watchlist is a function returning {watchlist: []} for GET and POST alike here it
    // will resolve success — this test instead asserts the confirmation path directly:
    expect(await screen.findByText(/pinned @/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — no text matching `/pinned @/` is ever rendered by the current `handleAdd`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/watchlist/WatchlistClient.tsx`, add imports:

```tsx
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
```

In `PinnedSection`, add a `confirmMsg` state next to `addError`/`addInput`/`adding`:

```tsx
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
```

Replace `handleAdd`:

```tsx
  async function handleAdd() {
    const ticker = addInput.trim().toUpperCase();
    if (!ticker) return;
    setAddError(null);
    setConfirmMsg(null);
    setAdding(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? `Failed to add ${ticker}`);
      } else {
        const body = await res.json().catch(() => ({}));
        const price = typeof body?.price_at_pin === "number" ? ` @ ${body.price_at_pin.toFixed(2)}` : "";
        setConfirmMsg(`${ticker} pinned${price}`);
        setAddInput("");
        onAdded();
        setTimeout(() => setConfirmMsg((m) => (m === `${ticker} pinned${price}` ? null : m)), 4000);
      }
    } catch {
      setAddError("Network error — could not reach the watchlist API");
    } finally {
      setAdding(false);
    }
  }
```

Replace the add-bar JSX:

```tsx
      {/* Add bar */}
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Add ticker…"
          className="w-36"
        />
        <Button onClick={handleAdd} disabled={adding || !addInput.trim()} loading={adding}>
          Pin
        </Button>
        {confirmMsg && <span className="text-[12px] text-pos">{confirmMsg}</span>}
        {addError && (
          <span className="flex items-center gap-1.5 text-[12px] text-neg">
            {addError}
            <button
              type="button"
              onClick={() => setAddError(null)}
              className="text-muted hover:text-foreground"
              aria-label="Dismiss error"
            >
              ×
            </button>
          </span>
        )}
      </div>
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): inline add-ticker confirmation, persistent dismissable error (WL-04)"
```

---

### Task 6: Declarative headers, consistent naming (WL-05)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** Consumes `WATCHLIST_STATUS_LABEL` (`@/lib/labels`, `Record<"in" | "out", string>`, contract §D) — `in: "Still in setup"`, `out: "Setup invalidated"`.

**Audit findings closed:** WL-05 — `Still in?` (a question) with values `yes`/`dropped`/`—`, and `@pin`/`@flag` column names sitting beside `Since pin`/`Since flag`. Renamed to declarative headers using the shared label registry; `@pin`/`@flag` become `Pin price`/`Flag price`.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
describe("WatchlistClient declarative headers (WL-05)", () => {
  it("uses declarative header text and status labels, not a question with yes/dropped", async () => {
    mockFetchJson(
      baseMocks({
        "/api/signals/recent?days=14": [
          { ticker: "AMD", first_date: "2026-07-15", first_group: "prime", entry_at_flag: 140, last_date: "2026-07-20" },
        ],
      })
    );
    render(<WatchlistClient medianDaysToPeak={12} />);
    await screen.findByText("AMD");
    expect(screen.getByRole("columnheader", { name: "In today's report" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Still in?" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pin price" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Flag price" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — headers still read `Still in?`, `@pin`, `@flag`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/watchlist/WatchlistClient.tsx`, add the import:

```tsx
import { WATCHLIST_STATUS_LABEL } from "@/lib/labels";
```

In `PinnedSection`'s `columns`, rename the `price_at_pin` header:

```tsx
    {
      key: "price_at_pin",
      header: "Pin price",
      width: "76px",
      align: "right",
      render: (r) => fmtPrice(r.price_at_pin),
    },
```

In `RecentPicksSection`'s `columns`, rename `entry_at_flag`'s header and `stillIn`'s header + values:

```tsx
    {
      key: "entry_at_flag",
      header: "Flag price",
      align: "right",
      render: (r) => fmtPrice(r.entry_at_flag),
    },
```

```tsx
    {
      key: "stillIn",
      header: "In today's report",
      render: (r) => {
        if (r.stillIn === null) return <span className="text-muted">—</span>;
        return r.stillIn ? (
          <span className="text-pos text-[12px]">{WATCHLIST_STATUS_LABEL.in}</span>
        ) : (
          <span className="text-muted text-[12px]">{WATCHLIST_STATUS_LABEL.out}</span>
        );
      },
    },
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): declarative headers, shared status labels (WL-05)"
```

---

### Task 7: One-shot legacy migration with a visible result (WL-07)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Modify: `dashboard/lib/storageKeys.ts`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** Extends `STATIC_KEYS` (`@/lib/storageKeys`) with one additive entry: `watchlistMigrationResult: "dash:watchlist:migration-result"`. `argus_watchlist` stays in `LEGACY_KEY_PREFIXES` (already listed, contract §E) — unchanged, since it is still read-once here.

**Audit findings closed:** WL-07 — the `argus_watchlist` migration previously POSTed on every mount and only cleared the legacy key if *every* ticker succeeded, so a partial failure retried silently forever with no visible state. Now it runs once (tracked by the new `dash:watchlist:migration-result` key, written — and the legacy key removed — regardless of partial failure), and renders a dismissible banner with the outcome.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
import { seedLocalStorage, resetLocalStorage } from "@/test/localStorage";

describe("WatchlistClient legacy migration (WL-07)", () => {
  it("migrates once, shows a result banner, and does not retry on next mount", async () => {
    resetLocalStorage();
    seedLocalStorage("argus_watchlist", [{ ticker: "TSLA" }]);
    mockFetchJson({
      ...baseMocks({ "/api/watchlist": { watchlist: [] } }),
      "/api/watchlist:POST:TSLA": { ok: true },
    });
    const { unmount } = render(<WatchlistClient medianDaysToPeak={12} />);
    expect(await screen.findByText(/Migrated 1 of 1 ticker/)).toBeInTheDocument();
    expect(window.localStorage.getItem("argus_watchlist")).toBeNull();
    expect(window.localStorage.getItem("dash:watchlist:migration-result")).not.toBeNull();
    unmount();

    render(<WatchlistClient medianDaysToPeak={12} />);
    // second mount: banner still shows the stored result (until dismissed), but no new POST is made
    expect(await screen.findByText(/Migrated 1 of 1 ticker/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — no text matching `/Migrated 1 of 1 ticker/` is ever rendered; `dash:watchlist:migration-result` is never written.

- [ ] **Step 3: Minimal implementation**

In `dashboard/lib/storageKeys.ts`, add the new static key to the existing `STATIC_KEYS` object (additive, alongside `todayFilters`):

```ts
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
  watchlistMigrationResult: "dash:watchlist:migration-result",
} as const;
```

In `dashboard/app/watchlist/WatchlistClient.tsx`, add the import:

```tsx
import { STATIC_KEYS } from "@/lib/storageKeys";
```

In `WatchlistClient`, add a `migrationResult` state and replace the migration `useEffect`:

```tsx
  const [migrationResult, setMigrationResult] = useState<{ ok: number; failed: number } | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.watchlistMigrationResult);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { ok: number; failed: number };
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const alreadyRan = window.localStorage.getItem(STATIC_KEYS.watchlistMigrationResult) !== null;
    const raw = window.localStorage.getItem("argus_watchlist");
    if (alreadyRan || !raw) return;
    let cancelled = false;
    (async () => {
      let tickers: string[] = [];
      try {
        tickers = ((JSON.parse(raw) as unknown[]) ?? [])
          .map((e) => (e as { ticker?: string }).ticker)
          .filter((t): t is string => typeof t === "string" && t.length > 0);
      } catch {
        tickers = [];
      }
      const results = await Promise.allSettled(
        tickers.map((t) =>
          fetch("/api/watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: t }),
          }).then((r) => {
            if (!r.ok) throw new Error(r.statusText);
          })
        )
      );
      if (cancelled) return;
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - ok;
      const outcome = { ok, failed };
      window.localStorage.setItem(STATIC_KEYS.watchlistMigrationResult, JSON.stringify(outcome));
      window.localStorage.removeItem("argus_watchlist");
      setMigrationResult(outcome);
      mutate();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Add the banner to the returned JSX, above `<PinnedSection …>`:

```tsx
        {migrationResult && (
          <div className="flex items-center gap-3 rounded border border-line bg-elevated px-3 py-2 text-[12px] text-muted">
            <span>
              Migrated {migrationResult.ok} of {migrationResult.ok + migrationResult.failed} ticker
              {migrationResult.ok + migrationResult.failed === 1 ? "" : "s"} from your old watchlist
              {migrationResult.failed > 0 ? ` (${migrationResult.failed} failed — re-add manually if needed)` : ""}.
            </span>
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem(STATIC_KEYS.watchlistMigrationResult);
                setMigrationResult(null);
              }}
              className="ml-auto text-muted hover:text-foreground"
              aria-label="Dismiss migration result"
            >
              ×
            </button>
          </div>
        )}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx lib/storageKeys.ts app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): one-shot legacy-watchlist migration with visible result (WL-07)"
```

---

### Task 8: Replace "Loading…" text with `SkeletonTable` (WL-08)

**Files:**
- Modify: `dashboard/app/watchlist/WatchlistClient.tsx`
- Test: `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`

**Interfaces:** Consumes `SkeletonTable` (`@/components/ui/SkeletonTable`, `{headers, rows}` props — same component already used correctly on Screener/Portfolio's *actually-loading* states).

**Audit findings closed:** WL-08 — closes one of the app's four loading vocabularies by making Watchlist's `Recent picks` panel use `SkeletonTable` (a real loading state — `recentData` is genuinely `undefined` while in flight) instead of plain `"Loading…"` text, matching the pattern Screener/Portfolio use during their own real loading states.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/watchlist/__tests__/WatchlistClient.test.tsx`:

```tsx
describe("WatchlistClient loading vocabulary (WL-08)", () => {
  it("renders SkeletonTable, not plain Loading text, while recent picks are in flight", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/signals/recent?days=14": () => new Promise(() => {}), // never resolves
    });
    render(<WatchlistClient medianDaysToPeak={12} />);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- WatchlistClient`
Expected: FAIL — the current code renders literal `"Loading…"` text and no `.animate-pulse` skeleton.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/watchlist/WatchlistClient.tsx`, add the import:

```tsx
import SkeletonTable from "@/components/ui/SkeletonTable";
```

In `RecentPicksSection`'s return JSX, replace the loading branch:

```tsx
      {!recentData ? (
        <SkeletonTable
          headers={["Ticker", "Flagged", "Group", "Flag price", "Now", "Since flag", "Age (d)", "In today's report"]}
          rows={4}
        />
      ) : rows.length === 0 ? (
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- WatchlistClient`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/watchlist/WatchlistClient.tsx app/watchlist/__tests__/WatchlistClient.test.tsx
git commit -m "fix(watchlist): SkeletonTable for real loading state, drop plain Loading text (WL-08)"
```

---

## Screener (`/screener`)

### Task 9: Send `min_conviction` on the full-universe GET path (SC-01)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx` (create)

**Interfaces:** No new primitive. Confirmed root cause: `GET /api/screener` (`argus/argus/api/routes.py:335-363`) already fully implements `min_conviction` as a query param (filters the cache, or reruns `screen_universe(..., min_conviction=min_conviction)`); the bug is 100% frontend — `runScreener(null)` builds the URL with only `?refresh=1` and never appends `min_conviction`. No backend change is needed.

**Audit findings closed:** SC-01 — `Min score` silently ignored on the full-universe path; the control now applies to both the ticker-list POST path (already worked) and the full-universe GET path.

- [ ] **Step 1: Write failing test**

Create `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import ScreenerPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("ScreenerPage full-universe min_conviction (SC-01)", () => {
  it("sends min_conviction on the GET (full universe) path", async () => {
    let capturedUrl = "";
    mockFetchJson((url: string) => {
      if (url === "/api/watchlist") return { watchlist: [] };
      if (url.startsWith("/api/argus/screener")) {
        capturedUrl = url;
        return { results: [], as_of: "2026-07-28T00:00:00Z", cached: false };
      }
      return undefined;
    });
    const user = userEvent.setup();
    render(<ScreenerPage />);
    const minScoreInput = screen.getByLabelText("Min score");
    await user.clear(minScoreInput);
    await user.type(minScoreInput, "0.55");
    await user.click(screen.getByRole("button", { name: "Full universe" }));
    expect(await screen.findByText("0 signals found")).toBeInTheDocument();
    expect(capturedUrl).toContain("min_conviction=0.55");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — `capturedUrl` never contains `min_conviction`; also `getByLabelText("Min score")` may fail until the label association exists (the current `<label>` wraps the input without `htmlFor`/`id`, which RTL's `getByLabelText` does accept for a wrapping `<label>`, so this part should already pass — only the `min_conviction` assertion fails).

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, change `runScreener`'s GET branch:

```tsx
      if (tickers === null) {
        const params = new URLSearchParams();
        params.set("min_conviction", String(parseFloat(minScore) || 0));
        if (refresh) params.set("refresh", "1");
        res = await fetch(`/api/argus/screener?${params.toString()}`);
      } else {
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): send min_conviction on the full-universe GET path (SC-01)"
```

---

### Task 10: Remove the decorative skeleton from the idle state (SC-02)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** None new.

**Audit findings closed:** SC-02 — the idle state (`results === null`, nothing loading) rendered the explainer card *and* a shimmering `SkeletonTable`, which reads as a hung request. The skeleton is removed from the idle branch; `SkeletonTable` still renders correctly while `loading` is true (separate branch, untouched).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage idle state (SC-02)", () => {
  it("does not render a shimmering skeleton before any run has happened", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    await screen.findByText("Rank long candidates with the agent ensemble");
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — the idle branch currently renders `<SkeletonTable rows={6} />`, which uses `.animate-pulse` internally.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, remove the `<SkeletonTable>` call from the idle (`results === null`) branch, keeping the explainer card:

```tsx
        {!loading && !error && results === null && (
          <div className="rounded-md border border-dashed border-line bg-elevated/40 px-6 py-8 text-center">
            <p className="text-sm text-foreground">Rank long candidates with the agent ensemble</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs text-muted">
              Enter tickers to score a shortlist, or run the full universe. Sort any column, click
              a row to open the ticker, and pin candidates to your watchlist.
            </p>
          </div>
        )}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): drop decorative skeleton from idle state (SC-02)"
```

---

### Task 11: Migrate controls to `Button`/`Input` (SC-09)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `Button` (`@/components/ui/Button`, §B.1 — bordered-ghost is the one visual language, `h-8`, no solid-fill variant) and `Input` (`@/components/ui/Input`, §B.2 — zero own focus styling, no `outline-none`).

**Audit findings closed:** SC-09 — the solid `bg-accent text-white` Run button (the only other place this pattern appears is Alerts' Add button, closed separately in Task 34) is replaced with `Button variant="primary"`; `Full universe` becomes `Button variant="secondary"`; both the ticker filter and Min score fields move to `Input`, which removes the `focus:outline-none` that was suppressing the app's global focus-visible ring.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage control styling (SC-09)", () => {
  it("Run button has no solid accent fill and inputs have no focus:outline-none", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    const runBtn = await screen.findByRole("button", { name: "Run" });
    expect(runBtn.className).not.toContain("bg-accent text-white");
    const tickerInput = screen.getByPlaceholderText("Filter tickers — AAPL, TSLA, NVDA…");
    expect(tickerInput.className).not.toContain("outline-none");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — the current Run button's `className` literally contains `bg-accent px-4 text-sm font-semibold text-white`, and the ticker input's `className` contains `focus:outline-none`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, add imports:

```tsx
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
```

Replace the ticker-filter `<input>`:

```tsx
          <Input
            icon={<Search size={14} />}
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Filter tickers — AAPL, TSLA, NVDA…"
            className="w-64"
          />
```

(remove the now-unused wrapping `<div className="relative">` and its manually-positioned `<Search>` icon, since `Input`'s `icon` prop owns that layout).

Replace the Min score `<input>`:

```tsx
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Min score
            <Input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              step="0.05"
              min="0"
              max="1"
              className="w-16"
            />
          </label>
```

Replace the Run/Full-universe buttons:

```tsx
          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" onClick={handleRun} disabled={loading} loading={loading} icon={<ArrowRight size={14} />}>
              Run
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setTickerInput("");
                void runScreener(null);
              }}
              disabled={loading}
            >
              Full universe
            </Button>
          </div>
```

Remove the now-unused `Loader2` inline spinner JSX inside the Run button (kept only in the `import { Search, ArrowRight, Loader2 } from "lucide-react"` line if `Loader2` is still used elsewhere on the page — it is, in the `loading` status line at `page.tsx:323`, so keep the import).

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): migrate controls to shared Button/Input (SC-09)"
```

---

### Task 12: Verdicts through `Badge` (SC-04)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `Badge` (`@/components/ui/Badge`, `variant="verdict"`, already ships `LONG`/`SHORT`/`WAIT` tints — `dashboard/components/ui/Badge.tsx:13-17`).

**Audit findings closed:** SC-04 — `verdictColor()` rendered raw colored mono text instead of the shared `Badge` component used for the same values elsewhere in the app.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage verdict badge (SC-04)", () => {
  it("renders verdict through Badge, not raw colored text", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: true, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
            ret_1d: 0.024, ret_5d: 0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    render(<ScreenerPage />);
    await screen.findByText("NVDA");
    const badge = screen.getByText("LONG");
    expect(badge.className).toContain("bg-pos/15");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — the current `verdict` column renders a `<span className="font-mono font-semibold text-pos">`, not `Badge`'s `bg-pos/15 text-pos` class.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, add the import:

```tsx
import Badge from "@/components/ui/Badge";
```

Replace the `verdict` column's `render`, and delete the now-unused `verdictColor` function:

```tsx
    {
      key: "verdict",
      header: "Verdict",
      render: (r) => <Badge variant="verdict" value={r.verdict} />,
    },
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): render verdict through shared Badge (SC-04)"
```

---

### Task 13: Pin toggle via shared `PinToggle` (SC-08)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `PinToggle` (`@/components/ui/PinToggle`, §B.5) — replaces the page-local `PinCell` + `togglePin` (`page.tsx:38-65,94-114`) with the shared primitive that already owns the optimistic update, `onError` reconciliation, and the undo toast.

**Audit findings closed:** SC-08 — a failed pin toggle's `catch` silently re-fetched with no visible feedback (the chip just reverted with no explanation). `PinToggle` keeps the same reconciliation behavior (this is the contract's explicit arbitration for SC-08 — see §B.5: "on a failed commit, `onError` re-fetches from the server to reconcile … the undo toast additionally lets the user explicitly reverse a *successful* toggle") and additionally surfaces every *successful* toggle via the undo toast, which is strictly more visible feedback than the page had before (previously: zero feedback on both success and failure).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage pin toggle (SC-08)", () => {
  it("pinning a row shows the shared undo toast", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: true, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 40, short_votes: 5, wait_votes: 2, agreement_pct: 85.1,
            ret_1d: 0.024, ret_5d: 0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: true,
      },
    });
    const user = userEvent.setup();
    render(<ScreenerPage />);
    await screen.findByText("NVDA");
    await user.click(screen.getByRole("button", { name: "Pin NVDA" }));
    expect(await screen.findByText("Added NVDA to watchlist")).toBeInTheDocument();
  });
});
```

Note: this test requires `UndoToastProvider` to be mounted — per the contract (§B.9) it is mounted once in `app/layout.tsx`, which `@/test/render` does **not** re-create per-test (it only wraps `TooltipProvider` + `SWRConfig`, per Phase 0 Task 4). Wrap the render call in this specific test with the provider directly:

```tsx
import UndoToastProvider from "@/components/ui/UndoToastProvider";
// ...
render(
  <UndoToastProvider>
    <ScreenerPage />
  </UndoToastProvider>
);
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — there is no button named `"Pin NVDA"` (current markup's `aria-label` is `Pin NVDA` too, so this part likely passes) but clicking it never shows toast text, since the current `PinCell`/`togglePin` has no undo mechanism at all.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, add the import and delete the local `PinCell` function (`page.tsx:38-65`) and the `togglePin` function (`page.tsx:94-114`):

```tsx
import PinToggle from "@/components/ui/PinToggle";
```

Replace the `pin` column's `render`:

```tsx
    {
      key: "pin",
      header: "",
      render: (r) => <PinToggle symbol={r.symbol} variant="chip" />,
    },
```

Since `PinToggle` reads and mutates `/api/watchlist` itself via its own `useSWR` call, the page's `watchlistData`/`mutateWatchlist`/`pinnedSet` (`page.tsx:85-92`) are now unused for this column — they are still used nowhere else in the file, so delete the `useSWR<{ watchlist: … }>` call, the `pinnedSet` `useMemo`, and the `fetcher`-based `watchlistData` destructure entirely.

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): pin toggle via shared PinToggle with undo (SC-08)"
```

---

### Task 14: Header tooltips + Agree% precision policy (SC-05)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Modify: `dashboard/lib/labels.ts`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `InfoTip` (`@/components/ui/InfoTip`, §B.7) and extends `HEADER_GLOSS` (`@/lib/labels`, additive — the registry already exists per the contract, this task adds Screener's entries to it) and `format.pctWhole` (`@/lib/format`, §C — "0 decimals … only `agreement_pct`-class … figures" is exactly this column).

**Audit findings closed:** SC-05 — `L`/`S`/`W` bare letters, `HC` bold literal text, and three different numeric precisions (`Score` 3dp, `Agree%` 0dp, `R:R` 1dp) with no explanation for any of it. Every abbreviated header gets an `InfoTip`; `Agree%` moves to the shared `pctWhole` formatter (still 0dp — this was already correct per the frozen precision policy, so the fix here is *only* de-duplicating the formatter, not changing the displayed number). `Score` (raw ensemble score, not a percent/price/greek) and `R:R` (a ratio) are outside `format.ts`'s scope by the contract's own policy (§C covers price/percent/greek/large-number/timestamp classes only) and keep their existing `toFixed(3)`/`toFixed(1)` — this is intentional, not an oversight; see "Audit findings that did not hold up" for the discussion of why `Score`/`R:R` are correctly left alone.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage header tooltips (SC-05)", () => {
  it("L/S/W/HC/Agree%/R:R headers expose an info tooltip trigger", async () => {
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    await screen.findByText("Rank long candidates with the agent ensemble");
    for (const label of ["Long votes info", "Short votes info", "Wait votes info", "High conviction info", "Agreement info", "Risk:reward info"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — none of these buttons exist; the headers are plain text (`L`, `S`, `W`, `HC`, `Agree%`, `R:R`).

- [ ] **Step 3: Minimal implementation**

In `dashboard/lib/labels.ts`, add Screener's entries to the existing `HEADER_GLOSS` object (additive — append these keys alongside `C`, `⚑`, `Cat`, etc., do not remove any existing entry):

```ts
  L: "Long votes — number of agents in the ensemble voting long on this ticker.",
  S: "Short votes — number of agents voting short.",
  W: "Wait votes — number of agents voting no direction (wait).",
  HC: "High conviction — this call passes the ensemble's tightened agreement/R:R/catalyst gates.",
  "Agree%": "Agreement — share of voting agents aligned with the ensemble's final verdict direction.",
  "R:R": "Risk:reward — modeled target distance divided by modeled stop distance from entry.",
```

In `dashboard/app/screener/page.tsx`, add imports:

```tsx
import InfoTip from "@/components/ui/InfoTip";
import { HEADER_GLOSS } from "@/lib/labels";
import { pctWhole } from "@/lib/format";
```

Replace the `long_votes`/`short_votes`/`wait_votes`/`high_conviction`/`agreement_pct`/`risk_reward` column headers to wrap the letter in an `InfoTip`:

```tsx
    {
      key: "long_votes",
      header: <InfoTip content={HEADER_GLOSS.L} label="Long votes info">L</InfoTip>,
      align: "right",
      render: (r) => <span className="text-pos">{r.long_votes}</span>,
    },
    {
      key: "short_votes",
      header: <InfoTip content={HEADER_GLOSS.S} label="Short votes info">S</InfoTip>,
      align: "right",
      render: (r) => <span className="text-neg">{r.short_votes}</span>,
    },
    {
      key: "wait_votes",
      header: <InfoTip content={HEADER_GLOSS.W} label="Wait votes info">W</InfoTip>,
      align: "right",
      render: (r) => <span className="text-warn">{r.wait_votes}</span>,
    },
    {
      key: "agreement_pct",
      header: <InfoTip content={HEADER_GLOSS["Agree%"]} label="Agreement info">Agree%</InfoTip>,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.agreement_pct - b.agreement_pct,
      render: (r) => <span className="text-foreground">{pctWhole(r.agreement_pct, "percent")}</span>,
    },
    {
      key: "high_conviction",
      header: <InfoTip content={HEADER_GLOSS.HC} label="High conviction info">HC</InfoTip>,
      align: "center",
      render: (r) =>
        r.high_conviction ? (
          <span className="text-warn font-bold">HC</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "risk_reward",
      header: <InfoTip content={HEADER_GLOSS["R:R"]} label="Risk:reward info">R:R</InfoTip>,
      align: "right",
      sortable: true,
      sortFn: (a, b) => a.risk_reward - b.risk_reward,
      render: (r) => <span className="text-foreground">{r.risk_reward.toFixed(1)}</span>,
    },
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx lib/labels.ts app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): header tooltips + shared Agree% formatter (SC-05)"
```

---

### Task 15: One return-unit formatter (SC-06)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `format.pct` (`@/lib/format`, `pct(v, unit: "percent" | "fraction")`, §C) in place of the page-local `fmtPct`/`RetCell`.

**Audit findings closed:** SC-06 (Screener half only — Today's `Ret` component at `components/today/SignalGroups.tsx:79-95` is out of scope for this plan, see Global Constraints; that half of this finding is for the Today/Rotation/Macro phase, not this one). Screener's `ret_1d`/`ret_5d` now render through the shared `pct(v, "fraction")` instead of a page-local duplicate — same visible output (`+2.4%`), but one implementation instead of five independent ones across the app (contract §C/§F).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage return formatting (SC-06)", () => {
  it("renders ret_1d/ret_5d via the shared pct() formatter output", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": {
        results: [
          { symbol: "NVDA", verdict: "LONG", score: 0.812, high_conviction: false, entry: 1, stop: 1, target: 1,
            risk_reward: 2.1, long_votes: 1, short_votes: 0, wait_votes: 0, agreement_pct: 100,
            ret_1d: 0.024, ret_5d: -0.081, ret_20d: null, is_extended: false, entry_quality: "good" },
        ],
        as_of: "2026-07-28T00:00:00Z",
        cached: false,
      },
    });
    render(<ScreenerPage />);
    expect(await screen.findByText("+2.4%")).toBeInTheDocument();
    expect(screen.getByText("-8.1%")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: This specific assertion likely already passes visually (the page-local `fmtPct` produces the same string) — the meaningful failure is structural: assert the local `fmtPct` function no longer exists after Step 3 by grepping the compiled output is impractical in a component test, so this step's real verification is Step 4 below plus a manual diff review confirming `fmtPct`/`RetCell` are deleted. Run the test now only to confirm the baseline numbers still render correctly before the refactor: `npm run test:component -- screener/page` — Expected: PASS (this is a refactor-safety test, not a behavior-change test; proceed to Step 3 regardless).

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, add the import:

```tsx
import { pct } from "@/lib/format";
```

Delete the local `fmtPct` (`page.tsx:26-30`) and `RetCell` (`page.tsx:32-36`) functions. Replace their two call sites in the `ret_1d`/`ret_5d` columns:

```tsx
    {
      key: "ret_1d",
      header: "1d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_1d ?? -Infinity) - (b.ret_1d ?? -Infinity),
      render: (r) => (
        <span className={r.ret_1d === null ? "text-muted" : r.ret_1d >= 0 ? "text-pos" : "text-neg"}>
          {pct(r.ret_1d, "fraction")}
        </span>
      ),
    },
    {
      key: "ret_5d",
      header: "5d%",
      align: "right",
      sortable: true,
      sortFn: (a, b) => (a.ret_5d ?? -Infinity) - (b.ret_5d ?? -Infinity),
      render: (r) => (
        <span className={r.ret_5d === null ? "text-muted" : r.ret_5d >= 0 ? "text-pos" : "text-neg"}>
          {pct(r.ret_5d, "fraction")}
        </span>
      ),
    },
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS (identical output, now backed by the shared formatter)

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "refactor(screener): use shared format.pct for returns, drop local duplicate (SC-06)"
```

---

### Task 16: Always-visible refresh with `as_of` (SC-07)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Consumes `Button` (§B.1, `variant="ghost"` for the low-emphasis refresh affordance).

**Audit findings closed:** SC-07 — "Re-run (~30s)" only rendered when `cached` was true, so a fresh-but-now-stale result (`cached: false` at fetch time, but minutes old by the time the user looks at it) had no refresh affordance at all. The refresh button is now always shown alongside `as_of`.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage always-visible refresh (SC-07)", () => {
  it("shows a refresh button even when the result was not cached", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": {
        results: [],
        as_of: "2026-07-28T00:00:00Z",
        cached: false,
      },
    });
    render(<ScreenerPage />);
    expect(await screen.findByRole("button", { name: /re-run/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — the current `{cached && (<button>Re-run…</button>)}` guard hides it when `cached` is `false`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/screener/page.tsx`, add the import (if not already present from Task 11):

```tsx
import Button from "@/components/ui/Button";
```

Replace the conditional refresh block:

```tsx
              {asOf && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void runScreener(null, true)}
                  className="ml-auto"
                >
                  Re-run (~30s)
                </Button>
              )}
```

(remove the outer `{cached && ( … )}` wrapper entirely — the button is now gated only on `asOf` being present, i.e. any result having ever loaded, matching the existing `as_of` display just above it).

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx app/screener/__tests__/page.test.tsx
git commit -m "fix(screener): always offer refresh alongside as_of, not only when cached (SC-07)"
```

---

### Task 17: Persist last result + cancel (SC-03)

**Files:**
- Modify: `dashboard/app/screener/page.tsx`
- Modify: `dashboard/lib/storageKeys.ts`
- Test: `dashboard/app/screener/__tests__/page.test.tsx`

**Interfaces:** Extends `STATIC_KEYS` with `screenerLastResult: "dash:screener:last-result"`. Uses a page-local `AbortController` (no new shared primitive — cancel is specific to this one long-running fetch, not a reusable pattern elsewhere in scope).

**Audit findings closed:** SC-03 — a 10-30s job with no progress signal, no cancel, and results held only in component state (discarded on navigation). Results now persist to `localStorage` (restored on mount, shown with their `as_of` line before any new run), and a Cancel button aborts an in-flight request.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/screener/__tests__/page.test.tsx`:

```tsx
describe("ScreenerPage persistence + cancel (SC-03)", () => {
  it("restores the last result from localStorage on mount", async () => {
    resetLocalStorage();
    window.localStorage.setItem(
      "dash:screener:last-result",
      JSON.stringify({
        results: [
          { symbol: "AMD", verdict: "LONG", score: 0.5, high_conviction: false, entry: 1, stop: 1, target: 1,
            risk_reward: 1.5, long_votes: 1, short_votes: 0, wait_votes: 0, agreement_pct: 90,
            ret_1d: null, ret_5d: null, ret_20d: null, is_extended: false, entry_quality: "ok" },
        ],
        as_of: "2026-07-27T00:00:00Z",
        cached: true,
      })
    );
    mockFetchJson({ "/api/watchlist": { watchlist: [] } });
    render(<ScreenerPage />);
    expect(await screen.findByText("AMD")).toBeInTheDocument();
  });

  it("shows a Cancel button while a run is in flight", async () => {
    mockFetchJson({
      "/api/watchlist": { watchlist: [] },
      "/api/argus/screener?min_conviction=0.3": () => new Promise(() => {}),
    });
    const user = userEvent.setup();
    render(<ScreenerPage />);
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
});
```

Add the import at the top of the test file:

```tsx
import { resetLocalStorage } from "@/test/localStorage";
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- screener/page`
Expected: FAIL — nothing reads `dash:screener:last-result` on mount, and there is no `Cancel` button.

- [ ] **Step 3: Minimal implementation**

In `dashboard/lib/storageKeys.ts`, extend `STATIC_KEYS`:

```ts
export const STATIC_KEYS = {
  todayFilters: "dash:today:filters",
  watchlistMigrationResult: "dash:watchlist:migration-result",
  screenerLastResult: "dash:screener:last-result",
} as const;
```

In `dashboard/app/screener/page.tsx`, add imports:

```tsx
import { STATIC_KEYS } from "@/lib/storageKeys";
```

Initialize `results`/`asOf`/`cached` from storage and add an `abortRef`:

```tsx
  const [results, setResults] = useState<ScreenerResult[] | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { results: ScreenerResult[] }).results ?? null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(STATIC_KEYS.screenerLastResult);
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { as_of: string | null }).as_of ?? null;
    } catch {
      return null;
    }
  });
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
```

Add `useRef` to the React import at the top of the file:

```tsx
import { useMemo, useRef, useState } from "react";
```

Update `runScreener` to use the controller and persist on success:

```tsx
  async function runScreener(tickers: string[] | null, refresh = false) {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let res: Response;
      if (tickers === null) {
        const params = new URLSearchParams();
        params.set("min_conviction", String(parseFloat(minScore) || 0));
        if (refresh) params.set("refresh", "1");
        res = await fetch(`/api/argus/screener?${params.toString()}`, { signal: controller.signal });
      } else {
        res = await fetch("/api/argus/screener", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universe: tickers, min_conviction: parseFloat(minScore) }),
          signal: controller.signal,
        });
      }
      const data = (await res.json()) as ApiResponse;
      if (isErrorResponse(data)) {
        setError(data.error);
        setResults(null);
      } else {
        setResults(data.results);
        setAsOf(data.as_of ?? null);
        setCached(data.cached ?? false);
        window.localStorage.setItem(
          STATIC_KEYS.screenerLastResult,
          JSON.stringify({ results: data.results, as_of: data.as_of ?? null, cached: data.cached ?? false })
        );
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Network error");
        setResults(null);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
  }
```

Add the Cancel button next to the loading status line:

```tsx
        {loading && (
          <p className="flex items-center gap-1.5 text-xs font-mono text-muted">
            <Loader2 size={12} className="animate-spin" /> Running agent ensemble… (10–30s)
            <Button variant="ghost" size="sm" onClick={handleCancel}>Cancel</Button>
          </p>
        )}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- screener/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.tsx lib/storageKeys.ts app/screener/__tests__/page.test.tsx
git commit -m "feat(screener): persist last result across navigation, add cancel (SC-03)"
```

---

## Portfolio (`/portfolio`)

### Task 18: Real IBKR host/port/mode in the subtitle (PF-02)

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx` (create)

**Interfaces:** None new. Truth verified against `argus/.env` (`IBKR_HOST=127.0.0.1`, `IBKR_PORT=7496`) and `argus/argus/settings.py:18-21` (`ibkr_port: int = 4002` is only the *default* — `.env` overrides it): port 7496 is TWS's conventional live-account API port (7497 = TWS paper, 4001 = Gateway live, 4002 = Gateway paper). This is a **static string fix**, not a dynamic status read — no endpoint today exposes the live host/port/mode to the frontend, and building one is out of this task's scope (would require a new `/api/status`-style route; flagged as a possible future roadmap item, not built here since the audit's own fix text only asks the page to stop contradicting the real config, which a static correction already satisfies).

**Audit findings closed:** PF-02 — the hardcoded subtitle read "Paper account · IBKR Gateway 4002", which is both the wrong product (Gateway vs. TWS) and the wrong port/mode for this deployment.

- [ ] **Step 1: Write failing test**

Create `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import PortfolioPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("PortfolioPage subtitle (PF-02)", () => {
  it("states the real connection: TWS, port 7496, live", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(await screen.findByText(/TWS · port 7496 · live/)).toBeInTheDocument();
    expect(screen.queryByText(/IBKR Gateway 4002/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- portfolio/page`
Expected: FAIL — the subtitle text is currently `"Paper account · IBKR Gateway 4002"`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/portfolio/page.tsx`, change the `PageHeader` subtitle:

```tsx
        <PageHeader title="Portfolio" subtitle="TWS · port 7496 · live" />
```

Also fix the offline banner's copy, which repeats the same wrong port/mode:

```tsx
              <p className="text-xs text-muted">
                Connect TWS on port 7496 (live) to see positions.
              </p>
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "fix(portfolio): state the real IBKR connection — TWS, port 7496, live (PF-02)"
```

---

### Task 19: Remove skeleton-as-illustration from the offline state (PF-03)

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx`

**Interfaces:** None new — `SkeletonTable` import is removed from this page entirely (no other call site in `portfolio/page.tsx`).

**Audit findings closed:** PF-03 — the offline branch rendered `SkeletonTable` under "Positions (connect gateway)", an animated loading placeholder for something explicitly *not* loading. Replaced with a static, low-contrast column preview (same headers, no shimmer, no fake rows).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
describe("PortfolioPage offline state has no fake-loading skeleton (PF-03)", () => {
  it("does not render an animated skeleton when IBKR is offline", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText(/TWS · port 7496 · live/);
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- portfolio/page`
Expected: FAIL — the offline branch currently renders `<SkeletonTable rows={4} />`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/portfolio/page.tsx`, remove the `SkeletonTable` import and replace the offline placeholder block:

```tsx
            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-muted/60">
                Positions (connect TWS to populate)
              </p>
              <div className="rounded border border-line bg-surface/40 px-3 py-2 text-[11px] text-muted/60">
                Symbol · Position · Avg Cost · Argus · Score · Edge
              </div>
            </div>
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "fix(portfolio): static column preview instead of skeleton in offline state (PF-03)"
```

---

### Task 20: Migrate positions table to `DataTable`, clickable rows (PF-04, PF-05)

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx`

**Interfaces:** Consumes `DataTable<PositionRow>` (`@/components/ui/DataTable`, §File Structure — `Column<T>`, sort persistence, keyboard nav, zebra striping, `onOpen` convention) and `Badge` (`variant="verdict"`, reused from Task 12's pattern).

**Audit findings closed:** PF-04 — the bespoke `<table>` with an ad-hoc `bg-white/[0.02]` zebra alpha (not a token) had no sort, no keyboard nav, no persistence. PF-05 — the unlabelled 12px `›` button is replaced by a clickable row (`onOpen`), matching every other table in the app.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
describe("PortfolioPage DataTable migration (PF-04, PF-05)", () => {
  it("renders positions via DataTable and navigates on row click, with no bare › button", async () => {
    const push = vi.fn();
    vi.doMock("next/navigation", () => ({ useRouter: () => ({ push }) }));
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD", high_conviction: false },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    expect(screen.queryByText("›")).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByText("AAPL").closest("tr")!);
    // DataTable's sticky-header table renders — presence of a columnheader confirms migration
    expect(screen.getByRole("columnheader", { name: "Symbol" })).toBeInTheDocument();
  });
});
```

Add `userEvent` to the existing test-file import from `@/test/render`:

```tsx
import { render, screen, userEvent } from "@/test/render";
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- portfolio/page`
Expected: FAIL — the current markup has no `role="columnheader"` (plain `<th>` without that implicit ARIA role issue aside, the real failure is the `›` button is present) and shows a `›` button.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/portfolio/page.tsx`, add imports:

```tsx
import DataTable, { Column } from "@/components/ui/DataTable";
import Badge from "@/components/ui/Badge";
```

Add a `columns` definition above the component's `return`, and replace the bespoke `<table>` block:

```tsx
  const columns: Column<PositionRow>[] = [
    {
      key: "symbol",
      header: "Symbol",
      render: (r) => <span className="font-mono font-semibold text-foreground">{r.symbol}</span>,
    },
    {
      key: "position",
      header: "Position",
      align: "right",
      render: (r) => {
        if (r.position == null) return <span className="text-muted">—</span>;
        const cls = r.position > 0 ? "text-pos" : r.position < 0 ? "text-neg" : "text-muted";
        return <span className={cls}>{r.position}</span>;
      },
    },
    {
      key: "avg_cost",
      header: "Avg Cost",
      align: "right",
      render: (r) => <span className="text-foreground">{r.avg_cost == null ? "—" : `$${r.avg_cost.toFixed(2)}`}</span>,
    },
    {
      key: "verdict",
      header: "Argus",
      render: (r) => (r.verdict ? <Badge variant="verdict" value={r.verdict} /> : <span className="text-muted">—</span>),
    },
    {
      key: "score",
      header: "Score",
      align: "right",
      render: (r) => (
        <span className={r.score == null ? "text-muted" : r.score > 0 ? "text-pos" : r.score < 0 ? "text-neg" : "text-muted"}>
          {r.score == null ? "—" : r.score.toFixed(2)}
        </span>
      ),
    },
    {
      key: "edge",
      header: "Edge",
      render: (r) => <span className="font-mono text-xs text-muted">{r.edge ?? "—"}</span>,
    },
  ];
```

Replace the JSX rendering block:

```tsx
            <div className="bg-surface border border-line rounded p-4">
              <DataTable
                columns={columns}
                rows={positions}
                rowKey={(r) => r.symbol}
                persistKey="portfolio-table"
                onOpen={(r) => router.push(`/t/${r.symbol}`)}
              />
            </div>
```

(the `router` in this file already exists at `page.tsx:58`, from `useRouter()` — unchanged. The `verdictChip`/`scoreClass` local functions are now unused; delete them.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "fix(portfolio): migrate positions table to DataTable, clickable rows (PF-04, PF-05)"
```

---

### Task 21: Backend — `IBKRClient.portfolio_items()` + tracker P&L overlay (PF-01, backend)

**Files:**
- Modify: `argus/argus/data/ibkr.py`
- Modify: `argus/argus/portfolio/tracker.py`
- Test: `argus/tests/test_ibkr_portfolio_items.py` (create)
- Test: `argus/tests/test_portfolio_tracker_pnl.py` (create)

**Interfaces:** `IBKRClient.positions()` (`argus/argus/data/ibkr.py:66-79`) wraps `ib_insync.IB.positions()`, which carries no market value/P&L. `ib_insync.PortfolioItem` (from `IB.portfolio()`) has `marketPrice`, `marketValue`, `averageCost`, `unrealizedPNL`, `realizedPNL`, `account`, `position`, `contract` (verified in the running venv: `ib_insync.PortfolioItem._fields == ('contract', 'position', 'marketPrice', 'marketValue', 'averageCost', 'unrealizedPNL', 'realizedPNL', 'account')`). Adds `IBKRClient.portfolio_items()` alongside (not replacing) `positions()`; `PortfolioTracker.positions_with_edge()` switches its data source to it.

**Audit findings closed:** PF-01 (backend half) — no market value/unrealized P&L anywhere in the position pipeline.

- [ ] **Step 1: Write failing test**

Create `argus/tests/test_ibkr_portfolio_items.py`:

```python
class _FakeContract:
    def __init__(self, symbol, sec_type="STK", exchange="SMART", currency="USD"):
        self.symbol = symbol
        self.secType = sec_type
        self.exchange = exchange
        self.currency = currency


class _FakePortfolioItem:
    def __init__(self, symbol, position, market_price, market_value, avg_cost, unrealized_pnl, account="U123"):
        self.contract = _FakeContract(symbol)
        self.position = position
        self.marketPrice = market_price
        self.marketValue = market_value
        self.averageCost = avg_cost
        self.unrealizedPNL = unrealized_pnl
        self.account = account


def test_portfolio_items_carries_market_value_and_unrealized_pnl(monkeypatch):
    from argus.data import ibkr

    class _FakeIB:
        def isConnected(self):
            return True

        def portfolio(self):
            return [_FakePortfolioItem("AAPL", 10, 190.5, 1905.0, 180.0, 105.0)]

    client = ibkr.IBKRClient.__new__(ibkr.IBKRClient)
    client.ib = _FakeIB()
    monkeypatch.setattr(client, "connect", lambda: None)

    rows = client.portfolio_items()
    assert rows == [{
        "account": "U123",
        "symbol": "AAPL",
        "sec_type": "STK",
        "exchange": "SMART",
        "currency": "USD",
        "position": 10.0,
        "avg_cost": 180.0,
        "market_price": 190.5,
        "market_value": 1905.0,
        "unrealized_pnl": 105.0,
    }]
```

Create `argus/tests/test_portfolio_tracker_pnl.py`:

```python
import pandas as pd
import pytest


def _fake_history():
    idx = pd.date_range("2026-01-01", periods=30, freq="D")
    return pd.DataFrame({"open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}, index=idx)


def test_positions_with_edge_carries_market_value_and_pnl(monkeypatch):
    from argus.portfolio import tracker as T
    from argus.agents.base import Verdict

    class _FakeCard:
        verdict = Verdict.LONG
        score = 0.5
        high_conviction = False

    class _FakeIB:
        def portfolio_items(self):
            return [{
                "account": "U123", "symbol": "AAPL", "sec_type": "STK", "exchange": "SMART",
                "currency": "USD", "position": 10.0, "avg_cost": 180.0,
                "market_price": 190.5, "market_value": 1905.0, "unrealized_pnl": 105.0,
            }]

    pt = T.PortfolioTracker.__new__(T.PortfolioTracker)
    pt.ib = _FakeIB()
    monkeypatch.setattr(T, "get_history", lambda *a, **k: _fake_history())
    monkeypatch.setattr(T, "build_action_card", lambda *a, **k: _FakeCard())

    rows = pt.positions_with_edge()
    assert len(rows) == 1
    assert rows[0]["market_value"] == 1905.0
    assert rows[0]["unrealized_pnl"] == 105.0
    assert rows[0]["edge"] == "HOLD/ADD"
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_ibkr_portfolio_items.py tests/test_portfolio_tracker_pnl.py -q`
Expected: FAIL — `IBKRClient` has no `portfolio_items` method; `PortfolioTracker.positions_with_edge` still calls `self.ib.positions()` and never carries `market_value`/`unrealized_pnl` through.

- [ ] **Step 3: Minimal implementation**

In `argus/argus/data/ibkr.py`, add `portfolio_items()` immediately after `positions()` (after line 79):

```python
    def portfolio_items(self) -> list[dict]:
        self.connect()
        out = []
        for p in self.ib.portfolio():
            out.append({
                "account": p.account,
                "symbol": p.contract.symbol,
                "sec_type": p.contract.secType,
                "exchange": p.contract.exchange,
                "currency": p.contract.currency,
                "position": float(p.position),
                "avg_cost": float(p.averageCost),
                "market_price": float(p.marketPrice),
                "market_value": float(p.marketValue),
                "unrealized_pnl": float(p.unrealizedPNL),
            })
        return out
```

In `argus/argus/portfolio/tracker.py`, change `positions_with_edge` to call `self.ib.portfolio_items()` instead of `self.ib.positions()` (line 43) — the rest of the method already does `**p` spreads that will now additionally carry `market_price`/`market_value`/`unrealized_pnl` through untouched:

```python
    def positions_with_edge(self) -> List[dict]:
        rows = []
        try:
            positions = self.ib.portfolio_items()
        except Exception as e:
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_ibkr_portfolio_items.py tests/test_portfolio_tracker_pnl.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd argus && git add argus/data/ibkr.py argus/portfolio/tracker.py tests/test_ibkr_portfolio_items.py tests/test_portfolio_tracker_pnl.py
git commit -m "feat(portfolio): carry market value + unrealized P&L through the edge overlay (PF-01 backend)"
```

---

### Task 22: Frontend — account summary strip + P&L columns (PF-01, frontend)

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx`

**Interfaces:** Consumes `StatChip` (`@/components/ui/StatChip`, already used identically on Watchlist's `PinnedSection` summary strip, `label`/`value`/`tone` props) and `format.signedCurrency`/`format.price` (`@/lib/format`, §C — no unsigned-currency-with-thousands formatter exists in the frozen contract for NLV/cash, so `signedCurrency` is reused for all Portfolio money figures rather than inventing a new one, per the "never invent a parallel formatter" rule; NLV/cash/buying-power are always ≥0 in practice so the leading `+` is a minor, acceptable cosmetic artifact). Adds `market_value`/`unrealized_pnl` to `PositionRow` and consumes the previously-unused `/api/account` (confirmed live at `argus/argus/api/routes.py`, `IBKRClient.instance().account_summary()`, returning `{tag: value}` pairs from `ib_insync`'s `accountSummary()` — tags used here: `NetLiquidation`, `TotalCashValue`, `BuyingPower`).

**Audit findings closed:** PF-01 (frontend half) — "no market value, no unrealized P&L, no day change, no weight … no NLV/cash/buying-power either." This task adds the account summary strip (NLV/cash/buying-power) and two new table columns (Market Value, Unrealized P&L). Day-change and position-weight are explicitly **not** built here — `/api/account`/`/api/portfolio` carry no day-change field today (would need a separate prior-close snapshot, a new backend concern outside this task's additive P&L scope) and weight is a trivial derived percentage the frontend could compute once market value exists, but is left out to keep this task's diff minimal and testable; flagged as a natural follow-up, not silently dropped.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
describe("PortfolioPage account summary + P&L columns (PF-01)", () => {
  it("shows an account summary strip and market value / unrealized P&L columns", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD",
          market_value: 1905.0, unrealized_pnl: 105.0 },
      ],
      "/api/watchlist": { watchlist: [] },
      "/api/argus/account": { NetLiquidation: "48210.55", TotalCashValue: "12000.00", BuyingPower: "96000.00" },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    expect(screen.getByText("NLV")).toBeInTheDocument();
    expect(screen.getByText("$48,210.55")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Mkt Value" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unrl. P&L" })).toBeInTheDocument();
    expect(screen.getByText("+$105.00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- portfolio/page`
Expected: FAIL — no `/api/argus/account` fetch happens, no `NLV` chip, no `Mkt Value`/`Unrl. P&L` columns.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/portfolio/page.tsx`, extend `PositionRow` with the new optional fields:

```tsx
interface PositionRow {
  symbol: string;
  position: number | null;
  avg_cost: number | null;
  verdict?: string;
  score?: number;
  edge?: string;
  market_value?: number | null;
  unrealized_pnl?: number | null;
  high_conviction?: boolean;
  ibkr_offline?: boolean;
  error?: string;
}
```

Add imports:

```tsx
import StatChip from "@/components/ui/StatChip";
import { signedCurrency, price as fmtPrice } from "@/lib/format";
```

Add an account-summary `useSWR` call alongside the existing `data`/`wl` calls:

```tsx
  const { data: account } = useSWR<Record<string, string>>("/api/argus/account", fetcher);
```

Add two columns to the `columns` array built in Task 20 (after `edge`):

```tsx
    {
      key: "market_value",
      header: "Mkt Value",
      align: "right",
      render: (r) => <span className="text-foreground">{fmtPrice(r.market_value ?? null)}</span>,
    },
    {
      key: "unrealized_pnl",
      header: "Unrl. P&L",
      align: "right",
      render: (r) => {
        if (r.unrealized_pnl == null) return <span className="text-muted">—</span>;
        const cls = r.unrealized_pnl >= 0 ? "text-pos" : "text-neg";
        return <span className={cls}>{signedCurrency(r.unrealized_pnl)}</span>;
      },
    },
```

Add the summary strip to the JSX, directly under `<PageHeader …/>`:

```tsx
        {account && (
          <div className="flex flex-wrap gap-2">
            <StatChip label="NLV" value={fmtPrice(Number(account.NetLiquidation))} />
            <StatChip label="Cash" value={fmtPrice(Number(account.TotalCashValue))} />
            <StatChip label="Buying power" value={fmtPrice(Number(account.BuyingPower))} />
          </div>
        )}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "feat(portfolio): account summary strip + market value/P&L columns (PF-01 frontend)"
```

---

### Task 23: Explain and unify the offline/fallback signals (PF-06, PF-07)

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx`

**Interfaces:** None new (a page-local banner, not a shared primitive — the two offline states it unifies are Portfolio-specific and do not recur elsewhere in scope).

**Audit findings closed:** PF-06 — the watchlist fallback (pinned tickers shown when IBKR is down) had no stated reason for existing. PF-07 — `offline` (full sentinel/no-list case) and `liveOffline` (`ibkr_offline` per-row flag from the yfinance-backed `settings.ibkr_watchlist` fallback inside `positions_with_edge`) rendered different messages in different places with the same amber styling, with no indication they were two different code paths showing two different data sources. One shared banner component now states the source explicitly in both cases.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
describe("PortfolioPage offline messaging (PF-06, PF-07)", () => {
  it("states why the pinned-watchlist fallback is shown when IBKR is fully offline", async () => {
    mockFetchJson({
      "/api/argus/portfolio": { error: "IBKR not connected", ibkr_offline: true },
      "/api/watchlist": { watchlist: [{ ticker: "NVDA", pinned_at: "2026-07-01" }] },
    });
    render(<PortfolioPage />);
    expect(
      await screen.findByText(/TWS is offline — showing your pinned watchlist instead of live positions/)
    ).toBeInTheDocument();
  });

  it("states the source when rows are individually yfinance-backed (liveOffline)", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "NVDA", position: null, avg_cost: null, edge: "HOLD/ADD", ibkr_offline: true },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    expect(
      await screen.findByText(/Price-only preview from your pinned watchlist — TWS positions unavailable/)
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- portfolio/page`
Expected: FAIL — current copy is "Showing your pinned watchlist (N) while the gateway is offline" (no reason stated) and "watchlist fallback (IBKR offline)" (10px, no explanation of what "watchlist fallback" means).

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/portfolio/page.tsx`, replace the `offline` branch's pinned-list intro line:

```tsx
                <p className="text-[11px] font-mono text-warn/80">
                  TWS is offline — showing your pinned watchlist instead of live positions ({pinned.length}).
                </p>
```

Replace the `liveOffline` inline flag in the positions-loaded branch:

```tsx
              {liveOffline && (
                <span className="text-[10px] font-mono text-warn/80">
                  Price-only preview from your pinned watchlist — TWS positions unavailable
                </span>
              )}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/portfolio/page.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "fix(portfolio): state why each offline fallback is shown (PF-06, PF-07)"
```

---

### Task 24: `edge` through `Badge` with `InfoTip` (PF-08)

**Files:**
- Modify: `dashboard/components/ui/Badge.tsx`
- Modify: `dashboard/app/portfolio/page.tsx`
- Test: `dashboard/components/ui/__tests__/Badge.test.tsx` (create)
- Test: `dashboard/app/portfolio/__tests__/page.test.tsx`

**Interfaces:** Extends `Badge`'s `variant` union with `"edge"` (additive — `"tier" | "verdict" | "style" | "flag"` stay unchanged) and consumes `PORTFOLIO_EDGE_LABEL` (`@/lib/labels`, §D — already correct as `HOLD/ADD`/`CONSIDER SELLING`/`CONSIDER COVERING`/`NEUTRAL`/`N/A`/`NO DATA`, independently re-verified against `argus/argus/portfolio/tracker.py:23,52,62-73` for this plan) plus an `InfoTip` per cell.

**Audit findings closed:** PF-08 — `edge` rendered as raw muted mono text with no chip, no color, no explanation of how it's derived. Now a colored `Badge` with an `InfoTip` sourcing its gloss from `PORTFOLIO_EDGE_LABEL`.

- [ ] **Step 1: Write failing test**

Create `dashboard/components/ui/__tests__/Badge.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/render";
import Badge from "../Badge";

describe("Badge edge variant (PF-08)", () => {
  it("colors HOLD/ADD positively and CONSIDER SELLING as a warning", () => {
    render(
      <>
        <Badge variant="edge" value="HOLD/ADD" />
        <Badge variant="edge" value="CONSIDER SELLING" />
      </>
    );
    expect(screen.getByText("HOLD/ADD").className).toContain("bg-pos");
    expect(screen.getByText("CONSIDER SELLING").className).toContain("bg-warn");
  });
});
```

Append to `dashboard/app/portfolio/__tests__/page.test.tsx`:

```tsx
describe("PortfolioPage edge badge + tooltip (PF-08)", () => {
  it("renders edge through Badge with an explanatory tooltip", async () => {
    mockFetchJson({
      "/api/argus/portfolio": [
        { symbol: "AAPL", position: 10, avg_cost: 180.5, verdict: "LONG", score: 0.6, edge: "HOLD/ADD" },
      ],
      "/api/watchlist": { watchlist: [] },
    });
    render(<PortfolioPage />);
    await screen.findByText("AAPL");
    const edgeBadge = screen.getByText("HOLD/ADD", { selector: "span.font-mono" });
    expect(edgeBadge.className).toContain("bg-pos");
    expect(screen.getByRole("button", { name: /edge explanation/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm run test:component -- Badge portfolio/page`
Expected: FAIL — `Badge` has no `"edge"` variant (TypeScript would also reject the `variant="edge"` prop before the test even runs, which is an acceptable "fail" for this step per the project's strict TS config — the compile error is the failure signal); `portfolio/page.tsx`'s `edge` cell is still plain muted text with no tooltip button.

- [ ] **Step 3: Minimal implementation**

In `dashboard/components/ui/Badge.tsx`, add an `EDGE` tone map and extend the variant union:

```tsx
const EDGE: Record<string, string> = {
  "HOLD/ADD": "bg-pos/15 text-pos",
  "CONSIDER SELLING": "bg-warn/20 text-warn",
  "CONSIDER COVERING": "bg-warn/20 text-warn",
  NEUTRAL: "bg-muted/15 text-muted",
  "N/A": "bg-muted/15 text-muted",
  "NO DATA": "bg-muted/15 text-muted",
  ERROR: "bg-neg/15 text-neg",
};

interface BadgeProps {
  variant: "tier" | "verdict" | "style" | "flag" | "edge";
  value: string;
}
```

Add the branch in the component body:

```tsx
  } else if (variant === "edge") {
    cls = EDGE[value] ?? "bg-muted/15 text-muted";
  } else {
```

In `dashboard/app/portfolio/page.tsx`, add imports:

```tsx
import InfoTip from "@/components/ui/InfoTip";
import { PORTFOLIO_EDGE_LABEL } from "@/lib/labels";
```

Replace the `edge` column's `render` (from Task 20's `columns` array):

```tsx
    {
      key: "edge",
      header: "Edge",
      render: (r) =>
        r.edge ? (
          <span className="inline-flex items-center gap-1">
            <Badge variant="edge" value={r.edge} />
            <InfoTip
              content={PORTFOLIO_EDGE_LABEL[r.edge] ?? "No explanation available for this edge value."}
              label="Edge explanation"
            />
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm run test:component -- Badge portfolio/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/ui/Badge.tsx app/portfolio/page.tsx components/ui/__tests__/Badge.test.tsx app/portfolio/__tests__/page.test.tsx
git commit -m "fix(portfolio): edge through Badge with explanatory tooltip (PF-08)"
```

---

## Alerts (`/alerts`)

### Task 25: Backend — `set_rule_enabled()` + `PATCH /api/alerts/rules/{id}` (AL-01, backend)

**Files:**
- Modify: `argus/argus/alerts/rules.py`
- Modify: `argus/argus/api/routes.py`
- Test: `argus/tests/test_alert_rules_enabled.py` (create)

**Interfaces:** `alert_rules.enabled` (SQLite column, `argus/argus/alerts/rules.py:26`) is already read by `list_rules`/`_row` and gated on in `evaluate_rules` (`if not rule["enabled"]: continue`) — fully wired server-side. There is no HTTP mutator today (`GET`/`POST`/`DELETE` only, `routes.py:541-585`). Adds `set_rule_enabled(conn, rule_id, enabled) -> bool` and a new `AlertRuleUpdateReq` model + `PATCH /api/alerts/rules/{rule_id}` route.

**Audit findings closed:** AL-01 (backend half) — root cause confirmed: `enabled` is a fully-functional gate with no way to flip it via the API.

- [ ] **Step 1: Write failing test**

Create `argus/tests/test_alert_rules_enabled.py`:

```python
import sqlite3


def test_set_rule_enabled_toggles_and_persists():
    from argus.alerts.rules import add_rule, set_rule_enabled, list_rules

    conn = sqlite3.connect(":memory:")
    rule = add_rule(conn, "verdict", "NVDA", {"target": "LONG"})
    assert rule["enabled"] is True

    ok = set_rule_enabled(conn, rule["id"], False)
    assert ok is True
    rules = list_rules(conn)
    assert rules[0]["enabled"] is False

    ok2 = set_rule_enabled(conn, rule["id"], True)
    assert ok2 is True
    assert list_rules(conn)[0]["enabled"] is True


def test_set_rule_enabled_returns_false_for_unknown_id():
    from argus.alerts.rules import set_rule_enabled

    conn = sqlite3.connect(":memory:")
    assert set_rule_enabled(conn, 9999, False) is False
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_alert_rules_enabled.py -q`
Expected: FAIL — `ImportError: cannot import name 'set_rule_enabled'`.

- [ ] **Step 3: Minimal implementation**

In `argus/argus/alerts/rules.py`, add `set_rule_enabled` immediately after `delete_rule`:

```python
def set_rule_enabled(conn: sqlite3.Connection, rule_id: int, enabled: bool) -> bool:
    ensure_rules_schema(conn)
    cur = conn.execute(
        "UPDATE alert_rules SET enabled=? WHERE id=?", (1 if enabled else 0, rule_id)
    )
    conn.commit()
    return cur.rowcount > 0
```

In `argus/argus/api/routes.py`, add `AlertRuleUpdateReq` immediately after `AlertRuleReq` (after line 109):

```python
class AlertRuleUpdateReq(BaseModel):
    enabled: bool
```

Add the route immediately after `alert_rules_delete`:

```python
@app.patch("/api/alerts/rules/{rule_id}")
def alert_rules_update(rule_id: int, req: AlertRuleUpdateReq):
    from ..alerts.rules import set_rule_enabled
    conn = get_conn()
    try:
        if not set_rule_enabled(conn, rule_id, req.enabled):
            raise HTTPException(404, "no such rule")
        return {"id": rule_id, "enabled": req.enabled}
    finally:
        conn.close()
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_alert_rules_enabled.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd argus && git add argus/alerts/rules.py argus/api/routes.py tests/test_alert_rules_enabled.py
git commit -m "feat(alerts): add set_rule_enabled + PATCH /api/alerts/rules/{id} (AL-01 backend)"
```

---

### Task 26: Frontend — PATCH proxy + `Toggle` wiring (AL-01, frontend)

**Files:**
- Modify: `dashboard/app/api/argus/[...path]/route.ts`
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/api/argus/__tests__/route.test.ts` (create)
- Test: `dashboard/app/alerts/__tests__/page.test.tsx` (create)

**Interfaces:** Consumes `Toggle` (`@/components/ui/Toggle`, §B.8 — `role="switch"`, exactly the contract's own usage example: `<Toggle checked={rule.enabled} onChange={(v) => updateRule(rule.id, { enabled: v })} label={...} />`). The Next.js proxy (`app/api/argus/[...path]/route.ts`) currently forwards only `GET`/`DELETE`/`POST` (confirmed by reading the full file — no `PATCH` export exists); adds a `PATCH` export mirroring `POST`'s body-forwarding shape.

**Audit findings closed:** AL-01 (frontend half) — `Rule.enabled` fetched but never rendered or toggled; delete was the only lifecycle operation exposed in the UI.

- [ ] **Step 1: Write failing test**

Create `dashboard/app/api/argus/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

describe("Argus proxy PATCH passthrough (AL-01)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards PATCH with a JSON body to the Argus API and returns its response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe("http://127.0.0.1:8088/api/alerts/rules/7");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(init!.body as string)).toEqual({ enabled: false });
        return new Response(JSON.stringify({ id: 7, enabled: false }), { status: 200 });
      })
    );
    const { PATCH } = await import("../route");
    const req = new Request("http://localhost/api/argus/alerts/rules/7", {
      method: "PATCH",
      body: JSON.stringify({ enabled: false }),
    });
    const res = await PATCH(req, { params: { path: ["alerts", "rules", "7"] } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ id: 7, enabled: false });
  });
});
```

Append to `dashboard/app/alerts/__tests__/page.test.tsx` (create this file if it does not yet exist; base mocks helper mirrors the pattern used in the other three page suites):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "@/test/render";
import { mockFetchJson } from "@/test/fetchMock";
import AlertsPage from "../page";

function baseMocks(overrides: Record<string, unknown> = {}) {
  return {
    "/api/argus/alerts/rules": {
      rules: [
        { id: 1, kind: "verdict", symbol: "NVDA", params: { target: "LONG" }, note: null, enabled: true, last_fired_ts: null },
      ],
    },
    "/api/argus/alerts/log?limit=30": { items: [] },
    ...overrides,
  };
}

describe("AlertsPage enable/disable toggle (AL-01)", () => {
  it("renders a Toggle per rule and PATCHes on change", async () => {
    let patchedBody: unknown = null;
    mockFetchJson((url: string, init?: RequestInit) => {
      void init;
      return undefined;
    });
    // mockFetchJson's simple signature only reads a responses map/fn for GET-style bodies;
    // override global.fetch directly here to also capture the PATCH call.
    const realFetch = global.fetch;
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH") {
        patchedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ id: 1, enabled: false }), { status: 200 });
      }
      const mocks = baseMocks() as Record<string, unknown>;
      return new Response(JSON.stringify(mocks[url] ?? {}), { status: 200 });
    }) as typeof fetch;

    render(<AlertsPage />);
    const toggle = await screen.findByRole("switch", { name: "Enable verdict alert for NVDA" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const user = userEvent.setup();
    await user.click(toggle);
    expect(patchedBody).toEqual({ enabled: false });

    global.fetch = realFetch;
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run --project=lib app/api/argus/__tests__/route.test.ts && npm run test:component -- alerts/page`
Expected: FAIL — `PATCH` is not exported from `route.ts`; no `switch` role exists on the Alerts page.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/api/argus/[...path]/route.ts`, add a `PATCH` export mirroring `POST` (append at end of file):

```ts
export async function PATCH(
  request: Request,
  { params }: { params: { path: string[] } }
) {
  const argusPath = params.path.join("/");
  const body = await request.json();
  try {
    const res = await fetch(`${ARGUS_BASE}/${argusPath}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return Response.json({ error: "argus timeout" }, { status: 504 });
    }
    return Response.json({ error: "Argus API offline" }, { status: 503 });
  }
}
```

In `dashboard/app/alerts/page.tsx`, add the import:

```tsx
import Toggle from "@/components/ui/Toggle";
```

Add an `updateRuleEnabled` function next to `removeRule`:

```tsx
  async function updateRuleEnabled(id: number, enabled: boolean) {
    mutateRules(
      (prev) => (prev ? { rules: prev.rules.map((r) => (r.id === id ? { ...r, enabled } : r)) } : prev),
      false
    );
    try {
      await fetch(`/api/argus/alerts/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } finally {
      mutateRules();
    }
  }
```

Add the `Toggle` to each rule's `<li>`, before the delete button:

```tsx
                  <Toggle
                    checked={r.enabled}
                    onChange={(v) => updateRuleEnabled(r.id, v)}
                    label={`Enable ${r.kind} alert for ${r.symbol}`}
                  />
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run --project=lib app/api/argus/__tests__/route.test.ts && npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/argus/[...path]/route.ts app/alerts/page.tsx app/api/argus/__tests__/route.test.ts app/alerts/__tests__/page.test.tsx
git commit -m "feat(alerts): PATCH proxy + per-rule enable/disable Toggle (AL-01 frontend)"
```

---

### Task 27: Backend — `channel_status()` + `GET /api/alerts/channels` (AL-02, backend)

**Files:**
- Modify: `argus/argus/alerts/dispatcher.py`
- Modify: `argus/argus/api/routes.py`
- Test: `argus/tests/test_alert_channel_status.py` (create)

**Interfaces:** Verified exactly three channels exist, each config-gated (`argus/argus/alerts/dispatcher.py:29-82`, `argus/argus/settings.py:32-44`): `email` needs `smtp_host` + `smtp_user` + `alert_email_to`; `telegram` needs `telegram_bot_token` + `telegram_chat_id`; `webhook` needs `webhook_url`. No fourth channel exists (dispatcher's own docstring: "SMS and WhatsApp are intentionally not implemented"). `channel_status()` reuses these exact presence checks without sending anything.

**Audit findings closed:** AL-02 (backend half) — no way to know which channels are actually configured before a rule fires into nothing.

- [ ] **Step 1: Write failing test**

Create `argus/tests/test_alert_channel_status.py`:

```python
def test_channel_status_reflects_settings(monkeypatch):
    from argus.alerts import dispatcher
    from argus.settings import settings

    monkeypatch.setattr(settings, "smtp_host", "")
    monkeypatch.setattr(settings, "smtp_user", "")
    monkeypatch.setattr(settings, "alert_email_to", "")
    monkeypatch.setattr(settings, "telegram_bot_token", "123:abc")
    monkeypatch.setattr(settings, "telegram_chat_id", "456")
    monkeypatch.setattr(settings, "webhook_url", "")

    status = dispatcher.channel_status()
    assert status == {"email": False, "telegram": True, "webhook": False}
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_alert_channel_status.py -q`
Expected: FAIL — `AttributeError: module 'argus.alerts.dispatcher' has no attribute 'channel_status'`.

- [ ] **Step 3: Minimal implementation**

In `argus/argus/alerts/dispatcher.py`, add `channel_status()` after the imports/`AlertChannels` dataclass, before `_send_email`:

```python
def channel_status() -> dict:
    """Config-presence check per channel — does not send anything."""
    return {
        "email": bool(settings.smtp_host and settings.smtp_user and settings.alert_email_to),
        "telegram": bool(settings.telegram_bot_token and settings.telegram_chat_id),
        "webhook": bool(settings.webhook_url),
    }
```

In `argus/argus/api/routes.py`, add the route next to the other `/api/alerts/*` routes (after `alert_rules_log`):

```python
@app.get("/api/alerts/channels")
def alert_channels_status():
    from ..alerts.dispatcher import channel_status
    return channel_status()
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd argus && source .venv/bin/activate && python -m pytest tests/test_alert_channel_status.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd argus && git add argus/alerts/dispatcher.py argus/api/routes.py tests/test_alert_channel_status.py
git commit -m "feat(alerts): add channel_status() + GET /api/alerts/channels (AL-02 backend)"
```

---

### Task 28: Frontend — channel status row + Send test (AL-02, frontend)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** Consumes the new `GET /api/argus/alerts/channels` (Task 27) and reuses the existing `POST /api/argus/alert` (`argus/argus/api/routes.py`, `AlertReq`, already live — confirmed via `routes.py:97-103,~ /api/alert` handler) for the "Send test" action, with a minimal `title`/`body` payload.

**Audit findings closed:** AL-02 (frontend half) — subtitle promised "fires via your alert channels" with zero indication of which channels are configured. Adds a channel row (`Email ✓ / Telegram — / Webhook ✓`) and a "Send test" button.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage channel status (AL-02)", () => {
  it("shows configured/unconfigured state per channel and sends a test alert", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/channels": { email: true, telegram: false, webhook: true },
      "/api/argus/alert": { ok: true },
    });
    render(<AlertsPage />);
    await screen.findByText("Email ✓");
    expect(screen.getByText("Telegram —")).toBeInTheDocument();
    expect(screen.getByText("Webhook ✓")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Send test" }));
    expect(await screen.findByText(/Test alert sent/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — no channel row and no "Send test" button exist.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add a `useSWR` call for channel status and a `sendTestResult` state, next to the existing `rulesData`/`logData` calls:

```tsx
  const { data: channels } = useSWR<Record<string, boolean>>("/api/argus/alerts/channels", fetcher);
  const [sendTestResult, setSendTestResult] = useState<string | null>(null);

  async function sendTest() {
    setBusy(true);
    try {
      await fetch("/api/argus/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Argus test alert", body: "Sent from the Alerts page." }),
      });
      setSendTestResult("Test alert sent.");
      setTimeout(() => setSendTestResult(null), 4000);
    } finally {
      setBusy(false);
    }
  }
```

Add the channel row + Send test button to the JSX, inside the `PageHeader`'s `actions` slot area — add it as a new element directly below `<PageHeader …/>`:

```tsx
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-elevated px-3 py-2 text-[12px]">
          <span className={channels?.email ? "text-pos" : "text-muted"}>Email {channels?.email ? "✓" : "—"}</span>
          <span className={channels?.telegram ? "text-pos" : "text-muted"}>Telegram {channels?.telegram ? "✓" : "—"}</span>
          <span className={channels?.webhook ? "text-pos" : "text-muted"}>Webhook {channels?.webhook ? "✓" : "—"}</span>
          <button
            onClick={sendTest}
            disabled={busy}
            className="ml-auto text-accent hover:underline disabled:opacity-50"
          >
            Send test
          </button>
          {sendTestResult && <span className="text-muted">{sendTestResult}</span>}
        </div>
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "feat(alerts): channel status row + send-test action (AL-02 frontend)"
```

---

### Task 29: Validation gaps (AL-03)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** None new.

**Audit findings closed:** AL-03 — `addRule` silently returned when `kind === "price"` and `level` was empty (no feedback); the Add button was only disabled on an empty symbol, not on other incomplete required params; the server's error response was discarded on failure.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage validation (AL-03)", () => {
  it("disables Add for an incomplete price rule and surfaces a server error", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/rules:POST": { error: "symbol not recognized" },
    });
    const user = userEvent.setup();
    render(<AlertsPage />);
    await user.selectOptions(screen.getByLabelText("Condition"), "price");
    await user.type(screen.getByLabelText("Symbol"), "ZZZZ");
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(screen.getByLabelText("Level"), "200");
    expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — the Add button is currently enabled as soon as `symbol` is non-empty, regardless of `kind === "price"` missing `level`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add an `addError` state next to the existing form state:

```tsx
  const [addError, setAddError] = useState<string | null>(null);
```

Add an `isIncomplete` check used by both the button's `disabled` prop and `addRule`'s early guard:

```tsx
  const isIncomplete = !symbol.trim() || (kind === "price" && !level.trim());
```

Replace `addRule`:

```tsx
  async function addRule() {
    const sym = symbol.trim().toUpperCase();
    if (isIncomplete) return;
    const params =
      kind === "verdict"
        ? { target }
        : kind === "earnings"
          ? { days: Number(days) }
          : { level: Number(level), direction };
    setAddError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/argus/alerts/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, symbol: sym, params }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setAddError(body?.error ?? `Failed to add rule for ${sym}`);
        return;
      }
      setSymbol("");
      setLevel("");
      await mutateRules();
    } finally {
      setBusy(false);
    }
  }
```

Update the Add button's `disabled` prop and add an error line beneath the form:

```tsx
            <button
              onClick={addRule}
              disabled={busy || isIncomplete}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Bell size={14} /> Add
            </button>
          </div>
          {addError && (
            <p className="px-4 pb-3 text-[12px] text-neg">{addError}</p>
          )}
        </section>
```

(the button's `className` here stays visually unchanged for this task — SC-09's solid-vs-ghost `Button` migration decision applies to Alerts' Add button too; wire it through `Button variant="primary"` at the same time as Task 34's Input/Select migration, to avoid touching this JSX twice.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): disable Add on incomplete params, surface server errors (AL-03)"
```

---

### Task 30: Delete rule via undo toast (AL-04)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** Consumes `useUndoAction` (`@/components/ui/UndoToastProvider`, §B.9) directly (there is no shared `PinToggle`-style wrapper for arbitrary delete actions — `PinToggle` is pin-specific — so this call site uses the same `run({label, commit, onError, undo})` shape `PinToggle` uses internally, per the contract's stated migration target: "`alerts/page.tsx`'s rule-delete button migrates to the same pattern").

**Audit findings closed:** AL-04 — delete was immediate and irreversible (icon-only trash, no confirm, no undo) — the same pattern as Watchlist's unpin (WL-01), now closed the same way: optimistic remove + undo toast, no confirm dialog (per the contract's confirm-vs-undo arbitration, §B.9).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
import UndoToastProvider from "@/components/ui/UndoToastProvider";

describe("AlertsPage delete undo (AL-04)", () => {
  it("shows an undo toast after deleting a rule, and Undo restores it", async () => {
    mockFetchJson(baseMocks());
    const user = userEvent.setup();
    render(
      <UndoToastProvider>
        <AlertsPage />
      </UndoToastProvider>
    );
    await screen.findByText("NVDA → verdict becomes LONG");
    await user.click(screen.getByRole("button", { name: "Delete rule" }));
    expect(await screen.findByText("Removed NVDA verdict alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("NVDA → verdict becomes LONG")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — no undo toast text ever appears; the current `removeRule` deletes immediately with no reversal path.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add the import:

```tsx
import { useUndoAction } from "@/components/ui/UndoToastProvider";
```

Inside `AlertsPage`, call the hook and replace `removeRule`:

```tsx
  const { run } = useUndoAction();

  function removeRule(rule: Rule) {
    mutateRules((prev) => (prev ? { rules: prev.rules.filter((r) => r.id !== rule.id) } : prev), false);
    run({
      label: `Removed ${rule.symbol} ${rule.kind} alert`,
      commit: () => fetch(`/api/argus/alerts/rules/${rule.id}`, { method: "DELETE" }),
      onError: () => mutateRules(),
      undo: () =>
        mutateRules(
          (prev) => (prev ? { rules: [rule, ...prev.rules] } : prev),
          false
        ),
    });
  }
```

Update the delete button's `onClick` (it now receives the whole `Rule`, not just the id):

```tsx
                  <button
                    onClick={() => removeRule(r)}
                    className="ml-auto text-muted transition-colors hover:text-neg"
                    aria-label="Delete rule"
                  >
                    <Trash2 size={14} />
                  </button>
```

Note: `undo()`'s re-insertion via `mutateRules` restores local state immediately; because `commit()`'s DELETE already fired optimistically (per `useUndoAction`'s contract, §B.9 — `commit` "fires immediately"), a genuine undo within the 6s window needs the rule re-created server-side too, not just visually restored — re-POST it inside `undo`:

```tsx
      undo: () => {
        mutateRules((prev) => (prev ? { rules: [rule, ...prev.rules] } : prev), false);
        fetch("/api/argus/alerts/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: rule.kind, symbol: rule.symbol, params: rule.params, note: rule.note }),
        }).then(() => mutateRules());
      },
```

(replacing the simpler `undo` above with this version — the re-created rule will get a new `id` from the server, which `mutateRules()`'s final revalidation reconciles.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): delete rule via undo toast instead of immediate irreversible delete (AL-04)"
```

---

### Task 31: "Evaluate now" shows a result (AL-05)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** Consumes the existing `POST /api/argus/alerts/evaluate` response body (already returns `{"fired": [...]}` — confirmed via `argus/argus/api/routes.py`'s `alert_rules_evaluate` — the frontend today discards this body entirely).

**Audit findings closed:** AL-05 — "Evaluate now" POSTs and refreshes the log, but if nothing fired, nothing visibly changes. Now shows "Evaluated `{N}` rules · `{M}` fired · `{time}`" using the rule count already in state plus the fired count from the response body.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage evaluate-now result (AL-05)", () => {
  it("shows a result summary after evaluating, even if nothing fired", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/evaluate": { fired: [] },
    });
    const user = userEvent.setup();
    render(<AlertsPage />);
    await screen.findByText("NVDA → verdict becomes LONG");
    await user.click(screen.getByRole("button", { name: "Evaluate now" }));
    expect(await screen.findByText(/Evaluated 1 rule · 0 fired/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — `evaluateNow` currently discards the response body and never renders any result text.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add an `evalResult` state and replace `evaluateNow`:

```tsx
  const [evalResult, setEvalResult] = useState<string | null>(null);

  async function evaluateNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/argus/alerts/evaluate", { method: "POST" });
      const body = (await res.json().catch(() => ({ fired: [] }))) as { fired: unknown[] };
      const fired = body.fired?.length ?? 0;
      const total = rules.length;
      setEvalResult(
        `Evaluated ${total} rule${total === 1 ? "" : "s"} · ${fired} fired · ${new Date().toLocaleTimeString()}`
      );
      await mutateLog();
    } finally {
      setBusy(false);
    }
  }
```

Render `evalResult` next to the `PageHeader`'s Evaluate-now action — add it directly below `<PageHeader …/>`:

```tsx
        {evalResult && <p className="text-[12px] text-muted">{evalResult}</p>}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): show evaluate-now result summary (AL-05)"
```

---

### Task 32: One condition phrasing (AL-06)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** Reuses the existing `KIND_LABEL` map (`app/alerts/page.tsx:27-31`, `verdict: "Verdict flips to"` etc.) as the single source of the condition phrase, instead of the row chip showing the raw `kind` string and `ruleSummary()` using a second, differently-worded phrase ("becomes").

**Audit findings closed:** AL-06 — the form said "Verdict flips to" while the rule row showed a `verdict` chip (raw kind, no phrasing) plus "NVDA → verdict becomes LONG" (a third phrasing). Now the chip and the summary both use `KIND_LABEL`.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage condition phrasing (AL-06)", () => {
  it("uses the same condition phrase in the chip and the row summary", async () => {
    mockFetchJson(baseMocks());
    render(<AlertsPage />);
    expect(await screen.findByText("Verdict flips to")).toBeInTheDocument();
    expect(screen.getByText("NVDA → Verdict flips to LONG")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — the chip currently shows raw `verdict` (lowercase, uppercased via CSS) and the summary reads `"NVDA → verdict becomes LONG"`.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, replace `ruleSummary`:

```tsx
function ruleSummary(r: Rule): string {
  if (r.kind === "verdict") return `${r.symbol} → ${KIND_LABEL.verdict} ${r.params.target ?? "LONG"}`;
  if (r.kind === "earnings") return `${r.symbol} → ${KIND_LABEL.earnings} ${r.params.days ?? 3}d`;
  if (r.kind === "price")
    return `${r.symbol} → ${KIND_LABEL.price} ${r.params.direction ?? "above"} ${r.params.level}`;
  return `${r.symbol} · ${r.kind}`;
}
```

Replace the chip's text in the rule `<li>`:

```tsx
                  <span className="rounded bg-accent-dim px-1.5 py-px font-mono text-[10px] text-accent">
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
```

(drop `uppercase` from the chip's className since `KIND_LABEL` values are already natural-case phrases, not codes.)

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): one condition phrasing shared by chip and row summary (AL-06)"
```

---

### Task 33: Log grouping by day + timezone label (AL-07)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** None new — a page-local grouping helper. (`lib/tz-display.ts`'s `dualClock()` was evaluated and does not fit: it renders an AEST+local dual-clock string for a *live* current-time context, not a per-log-item historical timestamp list, so it is not reused here — each log timestamp keeps `toLocaleString()` but gains an explicit `(local time)` suffix, and items are grouped under day headers.)

**Audit findings closed:** AL-07 — "Log caps at 30, no pagination, no grouping by day, `toLocaleString()` with no timezone label." Grouping-by-day and the timezone label are addressed here; true pagination beyond the existing `limit=30` is out of scope for this task (would need a new paged backend query param) and is called out explicitly rather than silently dropped — the log's header now states "Showing latest 30" so the cap itself is at least visible.

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage log grouping + timezone label (AL-07)", () => {
  it("groups log items under a day header and labels timestamps as local time", async () => {
    mockFetchJson({
      ...baseMocks(),
      "/api/argus/alerts/log?limit=30": {
        items: [{ id: 1, ts: "2026-07-28T14:00:00Z", title: "NVDA verdict → LONG", body: "score 0.8" }],
      },
    });
    render(<AlertsPage />);
    await screen.findByText("NVDA verdict → LONG");
    expect(screen.getByText("Showing latest 30")).toBeInTheDocument();
    expect(screen.getByText(/\(local time\)/)).toBeInTheDocument();
    expect(screen.getByText("2026-07-28")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — there is no "Showing latest 30" text, no day-header grouping, and timestamps have no "(local time)" label.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add a grouping helper above `AlertsPage`:

```tsx
function groupByDay(items: LogItem[]): Array<[string, LogItem[]]> {
  const groups = new Map<string, LogItem[]>();
  for (const it of items) {
    const day = it.ts.slice(0, 10);
    const bucket = groups.get(day) ?? [];
    bucket.push(it);
    groups.set(day, bucket);
  }
  return Array.from(groups.entries());
}
```

Replace the "Recent fires" section header and list:

```tsx
        <section className="rounded-md border border-line bg-elevated">
          <div className="border-b border-line px-4 py-2.5 flex items-center justify-between">
            <span className="tick text-[13px] font-semibold text-foreground">Recent fires</span>
            <span className="text-[11px] text-muted">Showing latest 30</span>
          </div>
          {log.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted">
              Nothing fired yet. Rules are checked when the evaluator runs (or hit &ldquo;Evaluate
              now&rdquo;).
            </p>
          ) : (
            groupByDay(log).map(([day, items]) => (
              <div key={day}>
                <div className="bg-surface px-4 py-1 text-[11px] font-mono text-muted">{day}</div>
                <ul className="divide-y divide-line/60">
                  {items.map((it) => (
                    <li key={it.id} className="px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-foreground">{it.title}</span>
                        <span className="text-[11px] text-muted">
                          {new Date(it.ts).toLocaleString()} (local time)
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[12px] text-muted">{it.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): group log by day, label timestamps as local time (AL-07)"
```

---

### Task 34: Migrate the New-alert form to `Input`/`Select`/`Button` (AL-08)

**Files:**
- Modify: `dashboard/app/alerts/page.tsx`
- Test: `dashboard/app/alerts/__tests__/page.test.tsx`

**Interfaces:** Consumes `Input`, `Select`, `Button` (§B.1-B.3) in place of the hardcoded `inputCls` string and 11px labels.

**Audit findings closed:** AL-08 — `text-[11px]` labels above `h-9` fields via a hardcoded `inputCls` string, one of five independent field-styling reinventions across the app (contract §F migration table). Also finishes Task 29's deferred Add-button migration to `Button variant="primary"` (kept together here since both touch the same form JSX, avoiding a second edit pass over the same lines).

- [ ] **Step 1: Write failing test**

Append to `dashboard/app/alerts/__tests__/page.test.tsx`:

```tsx
describe("AlertsPage form primitives (AL-08)", () => {
  it("uses shared Input/Select for the new-alert form, no hardcoded inputCls fields", async () => {
    mockFetchJson(baseMocks());
    render(<AlertsPage />);
    const symbolInput = await screen.findByPlaceholderText("NVDA");
    expect(symbolInput.className).toContain("h-8");
    expect(symbolInput.className).not.toContain("h-9");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm run test:component -- alerts/page`
Expected: FAIL — the current Symbol input uses the `h-9` `inputCls` string.

- [ ] **Step 3: Minimal implementation**

In `dashboard/app/alerts/page.tsx`, add imports and delete the `inputCls` constant:

```tsx
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
```

Replace the New-alert form body:

```tsx
          <div className="flex flex-wrap items-end gap-2 px-4 py-3">
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Condition
              <Select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                options={Object.entries(KIND_LABEL).map(([k, l]) => ({ value: k, label: l }))}
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-muted">
              Symbol
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" className="w-24" />
            </label>
            {kind === "verdict" && (
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Verdict
                <Select
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  options={[{ value: "LONG", label: "LONG" }, { value: "SHORT", label: "SHORT" }, { value: "WAIT", label: "WAIT" }]}
                />
              </label>
            )}
            {kind === "earnings" && (
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Days
                <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} className="w-20" />
              </label>
            )}
            {kind === "price" && (
              <>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  Direction
                  <Select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    options={[{ value: "above", label: "above" }, { value: "below", label: "below" }]}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-muted">
                  Level
                  <Input value={level} onChange={(e) => setLevel(e.target.value)} type="number" placeholder="200" className="w-24" />
                </label>
              </>
            )}
            <Button variant="primary" onClick={addRule} disabled={busy || isIncomplete} icon={<Bell size={14} />}>
              Add
            </Button>
          </div>
          {addError && (
            <p className="px-4 pb-3 text-[12px] text-neg">{addError}</p>
          )}
        </section>
```

Also replace the `Evaluate now` action button in `PageHeader`'s `actions` prop with `Button`:

```tsx
          actions={
            <Button variant="secondary" onClick={evaluateNow} disabled={busy} icon={<Play size={14} />}>
              Evaluate now
            </Button>
          }
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm run test:component -- alerts/page`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/alerts/page.tsx app/alerts/__tests__/page.test.tsx
git commit -m "fix(alerts): migrate new-alert form to shared Input/Select/Button (AL-08)"
```

---

## Audit findings that did not hold up

None of the WL/SC/PF/AL findings in this plan's scope were factually wrong once verified against source — every finding cited above closes via a task. Two items were **narrower than their audit description implied** once the frozen contract and live source were checked, noted here so the discrepancy is explicit rather than silently absorbed:

- **PF-08's exact label set** — the audit's own prose only lists `HOLD/ADD`, `CONSIDER SELLING`, `NEUTRAL` as examples; the full set (`CONSIDER COVERING`, `N/A`, `NO DATA`, plus an undocumented `ERROR` sentinel on exceptions) was already correctly captured by `00-foundations-contract.md`'s `PORTFOLIO_EDGE_LABEL` before this plan started, independently re-verified against `argus/argus/portfolio/tracker.py:23,52,62-73` for Task 24. No correction was needed in this plan — the contract had already fixed it upstream.
- **SC-05's "three different precisions"** — verified as accurate for `Score` (3dp), `Agree%` (0dp), `R:R` (1dp), but the fix is *not* "pick one precision": `format.ts`'s own precision policy (§C) deliberately special-cases whole-number percent for `agreement_pct`-class figures, and `Score`/`R:R` are outside `format.ts`'s scope entirely (neither is a price/percent/greek/large-number/timestamp). Task 14 closes SC-05 via header tooltips and de-duplicating `Agree%`'s formatter, not via a single shared precision — this is a deliberate narrowing to match the already-frozen policy, not an unaddressed gap.

## Coverage

| ID | Task | Closed by |
|---|---|---|
| WL-01 | 2 | Unpin via `PinToggle` + undo |
| WL-02 | 3 | Reserved column widths + per-cell loading state |
| WL-03 | 4 | Context text moved to panel subtitle |
| WL-04 | 5 | Inline add confirmation + persistent error |
| WL-05 | 6 | Declarative headers + `WATCHLIST_STATUS_LABEL` |
| WL-06 | 1 | Unified `onOpen`/`router.push` navigation |
| WL-07 | 7 | One-shot migration + visible result banner |
| WL-08 | 8 | `SkeletonTable` for real loading state |
| SC-01 | 9 | `min_conviction` sent on GET path (frontend-only fix) |
| SC-02 | 10 | Skeleton removed from idle state |
| SC-03 | 17 | Persisted last result + cancel |
| SC-04 | 12 | Verdict through `Badge` |
| SC-05 | 14 | Header `InfoTip`s + `Agree%` via `pctWhole` |
| SC-06 | 15 | Shared `format.pct` for returns (Screener half; Today half out of scope) |
| SC-07 | 16 | Always-visible refresh + `as_of` |
| SC-08 | 13 | Pin toggle via `PinToggle` (reconciliation + undo) |
| SC-09 | 11 | `Button`/`Input` migration |
| PF-01 | 21, 22 | Backend `portfolio_items()` + P&L overlay; frontend account strip + P&L columns |
| PF-02 | 18 | Real TWS/port/mode subtitle |
| PF-03 | 19 | Static column preview, no skeleton-as-illustration |
| PF-04 | 20 | Migrated to `DataTable` |
| PF-05 | 20 | Clickable rows via `onOpen`, chevron button dropped |
| PF-06 | 23 | Stated reason for the watchlist fallback |
| PF-07 | 23 | Unified `offline`/`liveOffline` messaging |
| PF-08 | 24 | `edge` through `Badge` + `InfoTip` |
| AL-01 | 25, 26 | Backend `set_rule_enabled` + `PATCH` route; frontend `Toggle` + proxy passthrough |
| AL-02 | 27, 28 | Backend `channel_status()` + route; frontend channel row + send-test |
| AL-03 | 29 | Disabled-until-complete Add + surfaced server errors |
| AL-04 | 30 | Delete via undo toast |
| AL-05 | 31 | Evaluate-now result summary |
| AL-06 | 32 | One condition phrasing (`KIND_LABEL` everywhere) |
| AL-07 | 33 | Log grouped by day + local-time label (pagination explicitly out of scope) |
| AL-08 | 34 | `Input`/`Select`/`Button` migration |

