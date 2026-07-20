# Dashboard v3 — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase A of the dashboard v3 spec: new context strip, session-aware % change, IBKR 4002 paper relabel, remove Performance/Sources tabs, new Rotation tab.

**Architecture:** Next.js 14 app in `dashboard/` (vitest, better-sqlite3, SWR, Tailwind, Radix Tooltip). Quotes come from Argus FastAPI (`argus/argus/data/rail.py` → `/api/rail/quotes`, proxied by `dashboard/app/api/argus/rail/quotes/route.ts`). A new `/api/status` aggregate feeds a rewritten client-side `ContextStrip`. Session logic builds on existing `lib/market-clock.ts`.

**Tech Stack:** TypeScript/Next 14 App Router, vitest, Python 3.11 (argus venv at `argus/.venv`, pytest run from `argus/`).

## Global Constraints (from spec)
- IBKR port: env `IBKR_PORT`, default **4002** = Gateway **paper**; UI copy must say "paper", never "live", while default port is 4002.
- Strip: 3 clusters max; ONE aggregate health dot (worst-of), per-service detail only in tooltip; four states green/amber/red/**grey (expected-stale: weekend/holiday)**.
- IBKR health = odte `/health` `ibkr_connected` field (`http://127.0.0.1:8788/health`), never a raw socket probe.
- `/api/status`: per-check timeout ~1500 ms, server-side cache 5–10 s.
- % change: session open → current-day (last vs last completed close); overnight/closed → past-day (last close vs prior close) with muted `prev` suffix.
- Dashboard tests: `cd dashboard && npm test` (vitest). Argus tests: `cd argus && .venv/bin/python -m pytest tests/ -q`.
- Commit after every task; messages imperative, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: Session state for futures + change-basis helper

**Files:**
- Modify: `dashboard/lib/market-clock.ts` (append)
- Create: `dashboard/lib/change-basis.ts`
- Test: `dashboard/lib/__tests__/change-basis.test.ts`

**Interfaces:**
- Consumes: `usMarketState(now): "pre"|"regular"|"after"|"closed"` (exists in market-clock.ts).
- Produces:
  - `futuresMarketState(now: Date): "open" | "closed"` — CME equity-index hours: closed Sat all day, Sun before 18:00 ET, Fri after 17:00 ET, and 17:00–18:00 ET maintenance Mon–Thu; open otherwise.
  - `pickChangeBasis(args: {group: "futures"|"indices"|"forex"; now?: Date}): "session" | "prev"` — indices (US equities): `"session"` only when `usMarketState` is `"regular"`; futures: `"session"` when `futuresMarketState` is `"open"`; forex: always `"session"` (unchanged behavior).
  - `computePct(price: number, lastClose: number, prevClose: number, basis: "session"|"prev"): number` — session: `(price/lastClose − 1)*100`; prev: `(lastClose/prevClose − 1)*100`; returns 0 when the divisor is 0/NaN.

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/change-basis.test.ts
import { describe, it, expect } from "vitest";
import { futuresMarketState } from "../market-clock";
import { pickChangeBasis, computePct } from "../change-basis";

// Helper: build a Date at a given ET wall-clock time (July = EDT, UTC-4).
const et = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

describe("futuresMarketState", () => {
  it("open Tuesday mid-session", () => {
    expect(futuresMarketState(et("2026-07-21", "11:00"))).toBe("open");
  });
  it("closed during 17:00-18:00 ET maintenance", () => {
    expect(futuresMarketState(et("2026-07-21", "17:30"))).toBe("closed");
  });
  it("closed Saturday", () => {
    expect(futuresMarketState(et("2026-07-25", "12:00"))).toBe("closed");
  });
  it("closed Sunday before 18:00, open after", () => {
    expect(futuresMarketState(et("2026-07-26", "17:00"))).toBe("closed");
    expect(futuresMarketState(et("2026-07-26", "18:30"))).toBe("open");
  });
  it("closed Friday after 17:00", () => {
    expect(futuresMarketState(et("2026-07-24", "17:30"))).toBe("closed");
  });
  it("open overnight Wednesday 03:00", () => {
    expect(futuresMarketState(et("2026-07-22", "03:00"))).toBe("open");
  });
});

describe("pickChangeBasis", () => {
  it("equities RTH -> session", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-21", "11:00") })).toBe("session");
  });
  it("equities pre-market -> prev (past-day gain/loss)", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-21", "08:00") })).toBe("prev");
  });
  it("equities weekend -> prev", () => {
    expect(pickChangeBasis({ group: "indices", now: et("2026-07-25", "12:00") })).toBe("prev");
  });
  it("futures overnight -> session (their market is open)", () => {
    expect(pickChangeBasis({ group: "futures", now: et("2026-07-22", "03:00") })).toBe("session");
  });
  it("futures weekend -> prev", () => {
    expect(pickChangeBasis({ group: "futures", now: et("2026-07-25", "12:00") })).toBe("prev");
  });
  it("forex always session", () => {
    expect(pickChangeBasis({ group: "forex", now: et("2026-07-25", "12:00") })).toBe("session");
  });
});

describe("computePct", () => {
  it("session basis: price vs lastClose", () => {
    expect(computePct(101, 100, 98, "session")).toBeCloseTo(1.0);
  });
  it("prev basis: lastClose vs prevClose", () => {
    expect(computePct(101, 100, 98, "prev")).toBeCloseTo(2.0408, 3);
  });
  it("zero divisor -> 0", () => {
    expect(computePct(101, 0, 0, "session")).toBe(0);
    expect(computePct(101, 100, 0, "prev")).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `cd ~/Market_Analyse/dashboard && npx vitest run lib/__tests__/change-basis.test.ts`
Expected: FAIL — `futuresMarketState` not exported / module `../change-basis` not found.

- [ ] **Step 3: Implement**

Append to `dashboard/lib/market-clock.ts`:

```ts
export type FuturesMarketState = "open" | "closed";

/** CME equity-index futures session, DST-safe via Intl. Closed: weekend
 * (Fri 17:00 ET -> Sun 18:00 ET) and the 17:00-18:00 ET maintenance break. */
export function futuresMarketState(now: Date = new Date()): FuturesMarketState {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = get("weekday");
  const mins = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
  if (wd === "Sat") return "closed";
  if (wd === "Sun") return mins >= 18 * 60 ? "open" : "closed";
  if (wd === "Fri" && mins >= 17 * 60) return "closed";
  if (mins >= 17 * 60 && mins < 18 * 60) return "closed"; // maintenance
  return "open";
}
```

Create `dashboard/lib/change-basis.ts`:

```ts
import { usMarketState, futuresMarketState } from "./market-clock";

export type QuoteGroup = "futures" | "indices" | "forex";
export type ChangeBasis = "session" | "prev";

/** Spec §3: session open -> current-day change; overnight/closed -> past-day change. */
export function pickChangeBasis({ group, now = new Date() }: { group: QuoteGroup; now?: Date }): ChangeBasis {
  if (group === "forex") return "session";
  if (group === "futures") return futuresMarketState(now) === "open" ? "session" : "prev";
  return usMarketState(now) === "regular" ? "session" : "prev";
}

export function computePct(price: number, lastClose: number, prevClose: number, basis: ChangeBasis): number {
  const num = basis === "session" ? price : lastClose;
  const den = basis === "session" ? lastClose : prevClose;
  if (!den || !Number.isFinite(den) || !Number.isFinite(num)) return 0;
  return (num / den - 1) * 100;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd ~/Market_Analyse/dashboard && npx vitest run lib/__tests__/change-basis.test.ts` → PASS.
Also run the whole suite: `npm test` → no regressions (market-clock tests still green).

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/market-clock.ts dashboard/lib/change-basis.ts dashboard/lib/__tests__/change-basis.test.ts
git commit -m "Add futures session state and session-aware change basis"
```

---

### Task 2: Argus rail quotes return three closes

**Files:**
- Modify: `argus/argus/data/rail.py`
- Test: `argus/tests/test_rail.py` (exists? if absent, create; check `ls argus/tests | grep rail` first and extend if present)

**Interfaces:**
- Produces: each quote dict gains `"last_close"` and `"prev_close"` (floats, rounded 4dp): `{"symbol", "price", "change_pct", "last_close", "prev_close", "group"}`. `change_pct` stays as today (backward compatible for morning report consumer `argus/argus/report/morning.py:115`).
- Rule: with N daily rows after ffill — `price = iloc[-1]`, `last_close = iloc[-2]` (fallback `price` if N<2), `prev_close = iloc[-3]` (fallback `last_close` if N<3).

- [ ] **Step 1: Write the failing test** (extend existing rail test file if one exists; same fixture style)

```python
# argus/tests/test_rail.py (append or create)
import pandas as pd
from argus.data.rail import rail_quotes, RAIL_BASKET


def _fake_fetch_three_rows(symbols, **kwargs):
    idx = pd.to_datetime(["2026-07-16", "2026-07-17", "2026-07-20"])
    data = {sym: [98.0, 100.0, 101.0] for sym in RAIL_BASKET}
    return pd.DataFrame(data, index=idx)


def test_rail_quotes_include_three_closes():
    out = rail_quotes(fetch=_fake_fetch_three_rows)
    q = out["quotes"][0]
    assert q["price"] == 101.0
    assert q["last_close"] == 100.0
    assert q["prev_close"] == 98.0
    assert q["change_pct"] == 1.0  # unchanged legacy field


def test_rail_quotes_two_rows_fallback():
    def fetch_two(symbols, **kwargs):
        idx = pd.to_datetime(["2026-07-17", "2026-07-20"])
        return pd.DataFrame({sym: [100.0, 101.0] for sym in RAIL_BASKET}, index=idx)
    q = rail_quotes(fetch=fetch_two)["quotes"][0]
    assert q["last_close"] == 100.0
    assert q["prev_close"] == 100.0  # falls back to last_close
```

- [ ] **Step 2: Run, verify failure**

Run: `cd ~/Market_Analyse/argus && .venv/bin/python -m pytest tests/test_rail.py -q`
Expected: FAIL — KeyError `last_close`.

- [ ] **Step 3: Implement in `rail.py`**

In `rail_quotes`, after `prev = close.iloc[-2] if len(close) > 1 else last` add:

```python
    prev2 = close.iloc[-3] if len(close) > 2 else prev
```

and extend the per-symbol dict:

```python
        pr2 = prev2.get(sym)
        q = {"symbol": sym, "price": round(float(p), 4),
             "change_pct": round(chg_pct, 2),
             "last_close": round(float(pr), 4) if pr is not None and not pd.isna(pr) else round(float(p), 4),
             "prev_close": round(float(pr2), 4) if pr2 is not None and not pd.isna(pr2) else round(float(pr), 4),
             "group": _GROUP[sym]}
```

- [ ] **Step 4: Run pytest** — target file PASS, then full `pytest tests/ -q` no regressions.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/data/rail.py argus/tests/test_rail.py
git commit -m "Rail quotes expose last_close and prev_close for session-aware change"
```

---

### Task 3: QuoteRow renders session-aware change with `prev` marker

**Files:**
- Modify: `dashboard/lib/rail-quotes.ts` (RailQuote interface + any mapping)
- Modify: `dashboard/components/rails/QuoteRow.tsx`
- Test: `dashboard/lib/__tests__/change-basis.test.ts` already covers logic; this task is wiring (visual check).

**Interfaces:**
- Consumes: `pickChangeBasis`, `computePct` (Task 1); `last_close`/`prev_close` (Task 2).
- Produces: `RailQuote` gains `last_close: number; prev_close: number`. QuoteRow shows `computePct(...)` for the picked basis; when basis is `"prev"` a muted `prev` suffix (`<span className="text-muted text-[10px] ml-1">prev</span>`) follows the pct.

- [ ] **Step 1:** Extend `RailQuote` interface in `lib/rail-quotes.ts`:

```ts
export interface RailQuote {
  symbol: string;
  price: number;
  change_pct: number;
  last_close: number;
  prev_close: number;
  group: "futures" | "indices" | "forex";
}
```

- [ ] **Step 2:** In `QuoteRow.tsx` (client component), replace direct use of `change_pct` with:

```ts
import { pickChangeBasis, computePct } from "@/lib/change-basis";
// inside render, per quote q:
const basis = pickChangeBasis({ group: q.group });
const pct = computePct(q.price, q.last_close ?? q.price, q.prev_close ?? q.last_close ?? q.price, basis);
```

Render `formatPct(pct)` (existing formatter) plus the `prev` suffix when `basis === "prev"`. Keep bar animation logic untouched — only the number and suffix change.

- [ ] **Step 3:** `npm test` green; then visual check: `npm run dev`, load `/`, confirm rails show non-zero % on a closed session (compare a couple of symbols against Yahoo Finance by hand).

- [ ] **Step 4: Commit** — `git commit -m "Quote rails pick change basis by session with prev marker"`.

---

### Task 4: `/api/status` aggregate route

**Files:**
- Create: `dashboard/lib/status.ts` (pure logic) and `dashboard/app/api/status/route.ts` (thin handler)
- Test: `dashboard/lib/__tests__/status.test.ts`

**Interfaces:**
- Produces `StatusPayload`:

```ts
export type DotState = "ok" | "warn" | "down" | "idle"; // idle = grey expected-stale
export interface ServiceStatus { name: "argus" | "ibkr" | "ingest"; state: DotState; detail: string; }
export interface StatusPayload {
  regime: string | null;            // from bridge_meta.json
  chase: boolean | null;
  bridgeTime: string | null;        // ISO
  sentiment: { source: string; ageHours: number } | null;  // sentiment_meta.json
  services: ServiceStatus[];
  aggregate: DotState;              // worst-of services (down > warn > idle > ok)
  counts: { aligned: number; pullback: number; tech_fund: number; earningsToday: number };
}
```

- Pure functions in `lib/status.ts`:
  - `worstOf(states: DotState[]): DotState` — severity order down > warn > idle > ok.
  - `classifyAge(ageHours: number, opts: {warnAfter: number; downAfter: number; marketClosedNow: boolean}): DotState` — over `downAfter` → `"down"` unless `marketClosedNow` → `"idle"`; over `warnAfter` → `"warn"` (or `"idle"` if closed); else `"ok"`.
  - `buildStatus(inputs)` assembles the payload from already-fetched raw pieces (no I/O — testable).
- Route handler: fetches with `AbortSignal.timeout(1500)` — Argus `http://127.0.0.1:8088/health`; odte `http://127.0.0.1:8788/health` (read `ibkr_connected: boolean`); reads `bridge_meta.json` (existing `resolveMetaPath` logic — lift it out of ContextStrip into `lib/status.ts`), `sentiment_meta.json` at `path.join(process.env.MARKET_REVIEW_DIR ?? path.join(process.cwd(), "..", "..", "Market_Review"), "data/state/sentiment_meta.json")`, ingest age from sqlite meta (reuse `lib/db.ts` accessor; if no meta table, use bridge CSV mtime). Failed/timed-out fetch → that service `"down"` with detail, never a thrown 500. Module-level cache: `let cache: {at: number; payload: StatusPayload}` returned when `Date.now() - at < 7000`.
- Earnings-today count: reuse `lib/calendar.ts` if it exposes earnings for a date; if it does not, return 0 and leave a `detail` note — Phase B0 owns real earnings data (checked: don't build new data sources in this task).

- [ ] **Step 1: Failing tests** for the pure parts:

```ts
// dashboard/lib/__tests__/status.test.ts
import { describe, it, expect } from "vitest";
import { worstOf, classifyAge } from "../status";

describe("worstOf", () => {
  it("down beats everything", () => expect(worstOf(["ok", "down", "idle"])).toBe("down"));
  it("warn beats idle and ok", () => expect(worstOf(["idle", "warn", "ok"])).toBe("warn"));
  it("all ok", () => expect(worstOf(["ok", "ok"])).toBe("ok"));
  it("idle beats ok (visible but muted)", () => expect(worstOf(["ok", "idle"])).toBe("idle"));
});

describe("classifyAge", () => {
  const opts = { warnAfter: 24, downAfter: 48, marketClosedNow: false };
  it("fresh -> ok", () => expect(classifyAge(2, opts)).toBe("ok"));
  it("stale -> warn", () => expect(classifyAge(30, opts)).toBe("warn"));
  it("dead -> down", () => expect(classifyAge(50, opts)).toBe("down"));
  it("weekend staleness -> idle not red", () =>
    expect(classifyAge(50, { ...opts, marketClosedNow: true })).toBe("idle"));
});
```

- [ ] **Step 2:** Run → FAIL (module missing). **Step 3:** implement `lib/status.ts` pure functions + `buildStatus`, then the route handler as described (route is I/O glue only — no logic worth unit-testing beyond the pure parts). **Step 4:** vitest green; `curl -s localhost:3000/api/status | python3 -m json.tool` shows a sane payload with argus ok (it's running) — verify IBKR reports through odte health, and repeat curl twice <7 s apart to confirm the cached response (identical timestamps). **Step 5: Commit** `"Add /api/status aggregate with per-check timeouts and cache"`.

---

### Task 5: ContextStrip rewrite (client, 3 clusters)

**Files:**
- Rewrite: `dashboard/components/ContextStrip.tsx` (server → client component)
- Modify: `dashboard/components/Nav.tsx` only if props change (check usage: `rtk proxy grep -n ContextStrip dashboard/components/Nav.tsx`)
- Test: logic already covered (Task 4 pure fns + market-clock tests); strip itself is presentational.

**Interfaces:**
- Consumes: `useSWR("/api/status")` polling 60 s; `usMarketState` for the session chip; `useLocalStorage` (exists, `lib/useLocalStorage.ts`) for changed-since markers.

Layout (single line, 13px, existing tokens):
1. **Regime+session**: existing pill styling; text `{regime} · chase {ON|OFF}`; adjacent chip `PRE|RTH|AH|OVN` (`STATE_LABEL` mapping — add `OVN` alias for `closed` when `futuresMarketState()==="open"`, plain `CLOSED` otherwise).
2. **Freshness + one health dot**: `sentiment: {source} {ageHours}h · bridge {HH:mm}` + single dot colored by `aggregate` (`ok` teal / `warn` amber / `down` red / `idle` gray). Whole cluster wrapped in the existing Tooltip.Root pattern; tooltip lists the three `services` rows `name — state — detail`.
3. **Counts**: `ALIGNED {n} · watch {n} · earnings {n}` — each a `<Link>` with `hover:text-white cursor-pointer` (real affordance): ALIGNED → `/#signals`, watch → `/watchlist`, earnings → `/#day-ahead` (anchor exists Phase B; harmless until then). Changed-since: `useLocalStorage("strip-snapshot")` stores `{regime, aggregate, aligned}`; on mount compare and render a 4px dot beside any changed item, then update the snapshot.

- [ ] **Step 1:** Rewrite component per layout above (`"use client"`, SWR fetcher matching `lib/rail-quotes.ts` style). Delete the server-side fs/meta code (moved to `lib/status.ts` in Task 4 — import nothing from fs here).
- [ ] **Step 2:** `npm test` green (no strip unit tests, but build must pass: `npx next build` compiles).
- [ ] **Step 3:** Visual check all states: normal load; stop argus (`launchctl kickstart` NOT needed — just verify current live state renders ok); simulate degraded by temporarily pointing `MARKET_REVIEW_DIR` at a bogus path in `.env.local` → sentiment shows down/detail in tooltip; restore.
- [ ] **Step 4: Commit** `"Rewrite context strip: session chip, freshness, aggregate health, linked counts"`.

---

### Task 6: Remove Performance and Sources tabs

**Files:**
- Delete: `dashboard/app/performance/` (page.tsx, HistoryBrowser.tsx, MfeHistogram.tsx), `dashboard/app/sources/page.tsx`, `dashboard/components/sources/`
- Modify: `dashboard/components/NavLinks.tsx` (drop both LINKS entries)
- Check-before-delete: `lib/performance.ts`, `lib/perf-constants.ts` and `lib/__tests__/performance.test.ts` stay **only if** consumed elsewhere.

- [ ] **Step 1:** `rtk proxy grep -rn "lib/performance\|perf-constants\|components/sources" dashboard/app dashboard/components --include="*.tsx" --include="*.ts"` — list consumers. Delete `lib/performance.ts` + its test too if the performance page was the only consumer; keep `perf-constants` if watchlist/screener import it.
- [ ] **Step 2:** Delete files, update `LINKS` in NavLinks.tsx to `Today / Watchlist / 0DTE / Rotation / Screener` (Rotation lands next task — add the entry now pointing at `/rotation`; a 404 for one commit is fine since Task 7 follows immediately, or reorder: do Task 7 first if preferred — executor's choice, note it in the commit).
- [ ] **Step 3:** `npm test` green; `npx next build` passes (catches dangling imports).
- [ ] **Step 4: Commit** `"Remove Performance and Sources tabs"`.

---

### Task 7: Rotation tab

**Files:**
- Create: `dashboard/app/rotation/page.tsx`
- Modify: `dashboard/components/today/RotationPanel.tsx` (move out of Today page), `dashboard/app/page.tsx` (replace panel with one-line summary link)

**Interfaces:**
- Consumes: existing `RotationPanel` component and whatever data loader it already uses (keep its data path identical — this is a move, not a rebuild; RRG/trail expansion is NOT in scope, spec cut trail history).
- Produces: `/rotation` route rendering RotationPanel full-width; Today gets `<Link href="/rotation">` one-liner: current leading/lagging sector from the same data call RotationPanel already makes (extract its summary line if trivially available, else static "Sector rotation →" link — do not build new data plumbing).

- [ ] **Step 1:** Create `app/rotation/page.tsx` rendering `<RotationPanel />` with the same page shell as other tabs (copy the wrapper pattern from `app/screener/page.tsx`).
- [ ] **Step 2:** In `app/page.tsx`, remove the inline `<RotationPanel />` and add the summary link line where it sat.
- [ ] **Step 3:** `npm test` + `npx next build` green; visual check `/rotation` renders and Today shows the link.
- [ ] **Step 4: Commit** `"Move sector rotation to its own tab"`.

---

### Task 8: IBKR 4002 paper relabel + sweep

**Files:**
- Modify: `dashboard/app/portfolio/page.tsx` (~lines 64–100)
- Verify-only: `argus/argus/settings.py:19` (already 4002 default), odte `backend/app/ibkr/config.py` (already env-driven 4002)

**Interfaces:** none new.

- [ ] **Step 1:** In `portfolio/page.tsx`: rename `liveOffline` → `ibkrOffline`; change copy at line ~79 to `Connect IBKR Gateway on port 4002 (paper) to see positions.`; any other "live" copy tied to IBKR positions becomes "paper". Grep the file: `rtk proxy grep -n "live" dashboard/app/portfolio/page.tsx` and fix each hit that refers to the IBKR connection (leave unrelated uses).
- [ ] **Step 2:** Full-repo sweep confirming zero remaining `7496` outside odte's legacy-migration constants: `rtk proxy grep -rn "7496" dashboard argus/argus sentiment_bridge.py` → expect only comments/none.
- [ ] **Step 3:** `npm test` green; `npx next build` passes.
- [ ] **Step 4: Commit** `"Relabel IBKR portfolio connection as Gateway 4002 paper"`.

---

## Phase A acceptance
- `npm test` and argus `pytest tests/ -q` fully green.
- `npx next build` clean.
- Live checks: strip shows regime/session/freshness/dot/counts; rails show sensible non-zero % while US market closed (with `prev` marker); `/performance` and `/sources` 404; `/rotation` renders; portfolio says paper/4002.
