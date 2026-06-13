# Phase C / WS-2: UI Shell — Persistent Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. UI tasks get a Playwright check in `dashboard/scripts/smoke.mjs`. Steps use checkbox (`- [ ]`) syntax.
>
> **Binding rules:** master plan §4.1 + §WS-2. Scope boundary: files listed per task. Out-of-scope discoveries reported, never fixed. No `sudo`/`launchctl`; live-API restart is a controller integration step. UI built under the `frontend-design` skill discipline (terminal/Bloomberg-dark aesthetic, the existing token sheet).

**Goal:** A persistent left **quote rail** (futures, US indices, forex with session state) and a right **news-rail shell** wrapping every dashboard page — both individually minimisable, responsive to drawer overlays below 1440px, fed by one batched Argus quote endpoint that updates on a 30–60s poll. Closes the master plan's F-F (UI shell) for the quote side; the news feed itself lands with WS-3.

**Architecture:** A new Argus `/api/rail/quotes` endpoint batch-fetches the whole basket in one `yf.download` (ffill-per-symbol to dodge ragged last rows across asset classes). The dashboard root `layout.tsx` wraps `{children}` in a 3-column grid (LeftRail · content · RightRail); rails are `"use client"` SWR components isolated from page re-renders, each with independent localStorage-persisted collapsed state, collapsing to drawer overlays under 1440px. Session/market-state is pure client-side time math (reusing `lib/market-clock.ts` for US equity; a new `lib/forex-session.ts` for NY/LDN/ASIA). Timezone display is Sydney-primary / ET-secondary everywhere via a new `lib/tz-display.ts`. The right rail ships a designed empty state ("news feed lands with WS-3") — its data wiring is WS-3's job.

**Tech Stack:** Next.js 14 App Router, React 18, SWR, Tailwind (existing token sheet `globals.css`), FastAPI + yfinance, vitest, Playwright (`smoke.mjs`).

> **DESIGN AUTHORITY:** `docs/design/ws2-rail-spec.md` (the WS-2 design pass) is **authoritative for ALL visual, styling, density, and state decisions** — exact tokens, type scale, the §8 copy-paste Tailwind class recipes, session-badge/overlap colors (teal for FX overlap, amber-never-red for offline), skeleton/stale/offline states, minimised strips, VIX-as-level. Where the inline component code in Tasks 5–7 below differs from the spec, **the spec wins** — treat the inline code as structural scaffold (data flow, hooks, props) and restyle per the spec recipes. Two corrections the spec makes to this plan: (a) **collapse state is URL search params `?ql=0&qr=0`** (not localStorage — survives navigation, no hydration flash); (b) **rails are `sticky top-[var(--nav-h)]`**, not plain flex children. First task for the rail-component implementers: verify the Tailwind aliases the spec uses are registered in `tailwind.config.ts` (`text-pos/neg/muted/warn/accent`, `border-line`, `bg-surface/elevated` are used by existing components so exist; **confirm `text-teal`, `bg-bg`, and opacity variants like `bg-accent/25`, `bg-teal/15`, `bg-warn/10`, `border-warn/30` resolve** — if `text-teal`/`bg-bg` aren't registered, add them to the config from the `--teal`/`--bg` vars as a first step, or use an arbitrary value `text-[var(--teal)]`).

**Verified starting facts (2026-06-13):**
- `dashboard/app/layout.tsx` wraps pages with `<Nav …/>` + `{children}` inside `<TooltipProvider>`; no rails exist (`dashboard/components/rails/` absent).
- `argus/argus/api/routes.py` registers routes in `build_app()`; `get_quote` (`argus/argus/data/market.py:103`) returns `{symbol, price, change, change_pct, volume, ts}` for ONE symbol via `get_history(period="5d")`.
- **Ragged-last-row gotcha (verified):** a single `yf.download('ES=F ^VIX EURUSD=X BTC-USD SPY', period='5d')` gives a daily frame whose shared last row is mostly NaN (mixed asset-class bar alignment). Fix: `['Close'].ffill()` then per-symbol `.iloc[-1]` (current) and `.iloc[-2]` (prior) — verified to yield all symbols a value.
- `lib/market-clock.ts` exports `usMarketState(now?) → "pre"|"regular"|"after"|"closed"` and `STATE_LABEL` (Phase A). `lib/called-since.ts` uses `en-AU` `timeZone:"UTC"` date formatting — the house style.
- argus pytest baseline: 47. dashboard vitest baseline: 45.
- **DEFERRED to WS-3 (documented, not built here):** left-rail macro-sentiment gauges (block 5), the one-line market blurb (block 2), the "Today" econ-events block (block 6 — needs `econ_calendar`), and the right-rail news *feed* (the shell empty-state ships here).

**Rail basket (the endpoint's universe):**
- Futures/vol/commodity/crypto: `ES=F NQ=F YM=F RTY=F ^VIX CL=F BTC-USD`
- US indices (ETF proxies): `SPY QQQ IWM DIA`
- Forex: `EURUSD=X USDJPY=X GBPUSD=X AUDUSD=X`

---

### Task 1: `/api/rail/quotes` endpoint (batched basket)

**Files:**
- Create: `argus/argus/data/rail.py`
- Modify: `argus/argus/api/routes.py` (one route)
- Test: `argus/tests/test_rail.py`

- [ ] **Step 1: Write the failing tests** (injected fetcher — no network)

```python
# argus/tests/test_rail.py
import pandas as pd

from argus.data.rail import rail_quotes, RAIL_BASKET


def fake_download(symbols, **kwargs):
    # mimic yf.download(...)["Close"] AFTER selection: a DataFrame of Close cols,
    # ragged last row (BTC has a later bar than ES) to exercise ffill.
    idx = pd.to_datetime(["2026-06-11", "2026-06-12"])
    data = {s: [100.0, 110.0] for s in symbols}
    data["ES=F"] = [100.0, float("nan")]  # ragged: no Friday print
    return pd.DataFrame(data, index=idx)


def test_rail_quotes_per_symbol_last_valid(monkeypatch):
    out = rail_quotes(fetch=fake_download)
    by = {q["symbol"]: q for q in out["quotes"]}
    # ES=F ffills 100->100 (NaN filled), change 0; others 100->110 = +10%
    assert by["ES=F"]["price"] == 100.0
    assert by["BTC-USD"]["price"] == 110.0
    assert round(by["BTC-USD"]["change_pct"], 1) == 10.0
    # every basket symbol present, grouped
    assert set(by) == set(RAIL_BASKET)
    assert out["groups"]["futures"] and out["groups"]["indices"] and out["groups"]["forex"]


def test_rail_quotes_survives_empty(monkeypatch):
    out = rail_quotes(fetch=lambda symbols, **k: pd.DataFrame())
    assert out["quotes"] == [] and out["error"] == "no data"
```

- [ ] **Step 2: Run to verify failure** — `cd argus && .venv/bin/python -m pytest tests/test_rail.py -v` → `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/data/rail.py
"""Batched basket quotes for the dashboard left rail (master plan §2.3, WS-2).

One yf.download for the whole basket; per-symbol last-valid close (ffill) to
dodge the ragged-last-row problem across futures/forex/crypto/index daily bars.
"""
from __future__ import annotations

from typing import Callable

import pandas as pd
import yfinance as yf

FUTURES = ["ES=F", "NQ=F", "YM=F", "RTY=F", "^VIX", "CL=F", "BTC-USD"]
INDICES = ["SPY", "QQQ", "IWM", "DIA"]
FOREX = ["EURUSD=X", "USDJPY=X", "GBPUSD=X", "AUDUSD=X"]
RAIL_BASKET = FUTURES + INDICES + FOREX
_GROUP = {**{s: "futures" for s in FUTURES},
          **{s: "indices" for s in INDICES},
          **{s: "forex" for s in FOREX}}


def _default_fetch(symbols, **kwargs) -> pd.DataFrame:
    df = yf.download(" ".join(symbols), period="5d", progress=False, **kwargs)
    if df is None or df.empty:
        return pd.DataFrame()
    close = df["Close"] if "Close" in df.columns.get_level_values(0) else df
    return close


def rail_quotes(fetch: Callable = _default_fetch) -> dict:
    close = fetch(RAIL_BASKET)
    if close is None or close.empty or len(close) < 1:
        return {"quotes": [], "groups": {"futures": [], "indices": [], "forex": []},
                "error": "no data"}
    close = close.ffill()
    last = close.iloc[-1]
    prev = close.iloc[-2] if len(close) > 1 else last
    quotes, groups = [], {"futures": [], "indices": [], "forex": []}
    for sym in RAIL_BASKET:
        if sym not in close.columns:
            continue
        p, pr = last.get(sym), prev.get(sym)
        if p is None or pd.isna(p):
            continue
        chg_pct = float((p / pr - 1) * 100) if pr and not pd.isna(pr) and pr != 0 else 0.0
        q = {"symbol": sym, "price": round(float(p), 4),
             "change_pct": round(chg_pct, 2), "group": _GROUP[sym]}
        quotes.append(q)
        groups[_GROUP[sym]].append(sym)
    return {"quotes": quotes, "groups": groups, "error": None}
```

- [ ] **Step 4: Run to verify pass** → 2 passed; full suite 49 passed.

- [ ] **Step 5: Add the route** in `argus/argus/api/routes.py` next to `/api/quote`, import `from ..data.rail import rail_quotes` with the `..data` imports:

```python
    @app.get("/api/rail/quotes")
    def rail():
        return rail_quotes()
```

- [ ] **Step 6: Real-network smoke** (scratch, no DB):

```bash
cd argus && .venv/bin/python -c "
from argus.data.rail import rail_quotes
import json; r = rail_quotes(); print(len(r['quotes']), 'quotes'); print(json.dumps(r['quotes'][:3], indent=2))"
```
Expected: ~15 quotes, each `{symbol, price, change_pct, group}`. Paste output.

- [ ] **Step 7: Commit**

```bash
git add argus/argus/data/rail.py argus/argus/api/routes.py argus/tests/test_rail.py
git commit -m "feat(rail): batched /api/rail/quotes basket — futures, indices, forex (ffill per-symbol)"
```

---

### Task 2: `forex-session` helper (NY/LDN/ASIA + overlap)

**Files:**
- Create: `dashboard/lib/forex-session.ts`
- Test: `dashboard/lib/__tests__/forex-session.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/forex-session.test.ts
import { describe, expect, it } from "vitest";
import { forexSessions } from "../forex-session";

// Sessions in UTC (standard FX convention): Asia ~00–09, London ~07–16, NY ~12–21.
describe("forexSessions", () => {
  it("London+NY overlap early afternoon UTC", () => {
    const s = forexSessions(new Date("2026-06-12T14:00:00Z")); // Fri
    expect(s.active).toContain("LDN");
    expect(s.active).toContain("NY");
    expect(s.overlap).toBe(true);
  });
  it("Asia only, early UTC", () => {
    const s = forexSessions(new Date("2026-06-12T02:00:00Z"));
    expect(s.active).toEqual(["ASIA"]);
    expect(s.overlap).toBe(false);
  });
  it("weekend closed", () => {
    const s = forexSessions(new Date("2026-06-13T14:00:00Z")); // Sat
    expect(s.active).toEqual([]);
    expect(s.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```ts
// dashboard/lib/forex-session.ts
export type FxSession = "ASIA" | "LDN" | "NY";

/** Active FX sessions by UTC hour (no holidays). FX trades Sun 21:00 → Fri 21:00 UTC. */
export function forexSessions(now: Date = new Date()): {
  active: FxSession[];
  overlap: boolean;
  closed: boolean;
} {
  const day = now.getUTCDay(); // 0 Sun … 6 Sat
  const h = now.getUTCHours();
  // Weekend window: Sat all day, Sun before 21:00, Fri after 21:00.
  const closed =
    day === 6 || (day === 0 && h < 21) || (day === 5 && h >= 21);
  if (closed) return { active: [], overlap: false, closed: true };
  const active: FxSession[] = [];
  if (h >= 0 && h < 9) active.push("ASIA");
  if (h >= 7 && h < 16) active.push("LDN");
  if (h >= 12 && h < 21) active.push("NY");
  return { active, overlap: active.length > 1, closed: false };
}
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 48 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/forex-session.ts dashboard/lib/__tests__/forex-session.test.ts
git commit -m "feat(dashboard): forex-session helper — Asia/London/NY windows + overlap"
```

---

### Task 3: `tz-display` helper (Sydney primary / ET secondary)

**Files:**
- Create: `dashboard/lib/tz-display.ts`
- Test: `dashboard/lib/__tests__/tz-display.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// dashboard/lib/__tests__/tz-display.test.ts
import { describe, expect, it } from "vitest";
import { dualClock } from "../tz-display";

describe("dualClock", () => {
  it("renders Sydney primary, ET secondary", () => {
    // 2026-06-12T18:30Z = 04:30 Sydney (AEST, next day) / 14:30 ET (EDT)
    const d = dualClock(new Date("2026-06-12T18:30:00Z"));
    expect(d.primary).toMatch(/\d{1,2}:\d{2}/);      // Sydney HH:MM
    expect(d.secondary).toMatch(/\d{1,2}:\d{2} ET/); // "... ET"
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```ts
// dashboard/lib/tz-display.ts
/** Sydney-primary, ET-secondary clock string (master plan §2.3 / §WS-2 hierarchy). */
export function dualClock(now: Date = new Date()): { primary: string; secondary: string } {
  const syd = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).format(now);
  return { primary: syd, secondary: `${et} ET` };
}
```

- [ ] **Step 4: Run to verify pass** → 1 passed; full suite 49 passed.

- [ ] **Step 5: Commit**

```bash
git add dashboard/lib/tz-display.ts dashboard/lib/__tests__/tz-display.test.ts
git commit -m "feat(dashboard): dual-clock tz-display helper (Sydney primary, ET secondary)"
```

---

### Task 4: Rail data hook + proxy + types

**Files:**
- Create: `dashboard/lib/rail-quotes.ts` (SWR hook + types + display labels)
- Verify: the `/api/argus/*` proxy already routes to Argus (check `dashboard/app/api/argus/[...path]/route.ts` exists — it serves OptionsPanel/GexCard today; reuse it).

- [ ] **Step 1: Implement the hook + label map**

```ts
// dashboard/lib/rail-quotes.ts
"use client";

import useSWR from "swr";

export interface RailQuote {
  symbol: string;
  price: number;
  change_pct: number;
  group: "futures" | "indices" | "forex";
}
export interface RailData {
  quotes: RailQuote[];
  groups: { futures: string[]; indices: string[]; forex: string[] };
  error: string | null;
}

// Display labels — terminal-style short tickers.
export const RAIL_LABEL: Record<string, string> = {
  "ES=F": "ES", "NQ=F": "NQ", "YM=F": "YM", "RTY=F": "RTY", "^VIX": "VIX",
  "CL=F": "CRUDE", "BTC-USD": "BTC", "SPY": "SPY", "QQQ": "QQQ", "IWM": "IWM",
  "DIA": "DIA", "EURUSD=X": "EUR/USD", "USDJPY=X": "USD/JPY",
  "GBPUSD=X": "GBP/USD", "AUDUSD=X": "AUD/USD",
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export function useRailQuotes() {
  return useSWR<RailData>("/api/argus/rail/quotes", fetcher, {
    refreshInterval: 45_000,
    shouldRetryOnError: false,
  });
}
```

- [ ] **Step 2: Confirm the proxy** — `ls dashboard/app/api/argus/` (expect a catch-all `[...path]` route). If it doesn't exist, STOP and report BLOCKED (the OptionsPanel/GexCard already reach `/api/argus/*`, so it must). `npx tsc --noEmit` clean.

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/rail-quotes.ts
git commit -m "feat(dashboard): rail-quotes SWR hook + ticker label map"
```

---

### Task 5: LeftRail component (quote rail)

**Files:**
- Create: `dashboard/components/rails/LeftRail.tsx`
- Create: `dashboard/components/rails/QuoteRow.tsx`

- [ ] **Step 1: QuoteRow** (one ticker line: label, price, signed % colored)

```tsx
// dashboard/components/rails/QuoteRow.tsx
"use client";

import type { RailQuote } from "@/lib/rail-quotes";
import { RAIL_LABEL } from "@/lib/rail-quotes";

export default function QuoteRow({ q }: { q: RailQuote }) {
  const up = q.change_pct >= 0;
  const price = q.price >= 1000 ? q.price.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : q.price.toFixed(q.group === "forex" ? 4 : 2);
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 font-mono text-[12px] tabular-nums">
      <span className="text-muted">{RAIL_LABEL[q.symbol] ?? q.symbol}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-foreground">{price}</span>
        <span className={up ? "text-pos" : "text-neg"}>
          {up ? "+" : ""}{q.change_pct.toFixed(2)}%
        </span>
      </span>
    </div>
  );
}
```

- [ ] **Step 2: LeftRail** (futures / US equity / forex blocks; US-equity session badge via `usMarketState`; forex session chip via `forexSessions`; collapsible whole-rail; minimised 36px strip with SPY/QQQ/VIX). Uses the rail hook; never an empty box (error → designed offline state).

```tsx
// dashboard/components/rails/LeftRail.tsx
"use client";

import { useEffect, useState } from "react";
import { useRailQuotes, type RailQuote } from "@/lib/rail-quotes";
import { usMarketState, STATE_LABEL } from "@/lib/market-clock";
import { forexSessions } from "@/lib/forex-session";
import QuoteRow from "./QuoteRow";

const PERSIST = "rail-left-collapsed";

function Block({ title, badge, quotes }: { title: string; badge?: string; quotes: RailQuote[] }) {
  if (quotes.length === 0) return null;
  return (
    <div className="border-t border-line pt-1.5 mt-1.5 first:border-0 first:mt-0 first:pt-0">
      <div className="flex items-center justify-between px-0.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">{title}</span>
        {badge && <span className="font-mono text-[10px] text-muted">{badge}</span>}
      </div>
      {quotes.map((q) => <QuoteRow key={q.symbol} q={q} />)}
    </div>
  );
}

export default function LeftRail() {
  const { data, error } = useRailQuotes();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(localStorage.getItem(PERSIST) === "1"); }, []);
  const toggle = () => setCollapsed((c) => { localStorage.setItem(PERSIST, c ? "0" : "1"); return !c; });

  const by = (g: string) => (data?.quotes ?? []).filter((q) => q.group === g);
  const us = usMarketState();
  const fx = forexSessions();

  if (collapsed) {
    const strip = (data?.quotes ?? []).filter((q) => ["SPY", "QQQ", "^VIX"].includes(q.symbol));
    return (
      <aside className="w-9 shrink-0 border-r border-line py-2 flex flex-col items-center gap-2">
        <button onClick={toggle} className="text-muted hover:text-foreground" aria-label="expand rail">⟩</button>
        {strip.map((q) => (
          <span key={q.symbol} className={`font-mono text-[9px] ${q.change_pct >= 0 ? "text-pos" : "text-neg"}`}>
            {q.change_pct >= 0 ? "+" : ""}{q.change_pct.toFixed(1)}
          </span>
        ))}
      </aside>
    );
  }
  return (
    <aside className="w-[200px] shrink-0 border-r border-line px-2 py-2 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[11px] text-foreground">Markets</span>
        <button onClick={toggle} className="text-muted hover:text-foreground text-[12px]" aria-label="collapse rail">⟨</button>
      </div>
      {error ? (
        <p className="font-mono text-[11px] text-muted">rail offline — Argus API unreachable</p>
      ) : (
        <>
          <Block title="Futures" quotes={by("futures")} />
          <Block title="US Equity" badge={STATE_LABEL[us]} quotes={by("indices")} />
          <Block title="Forex" badge={fx.closed ? "CLOSED" : fx.active.join("·")} quotes={by("forex")} />
          <p className="font-mono text-[9px] text-muted mt-2 pt-1.5 border-t border-line">
            macro gauges · market blurb · today's events — land with WS-3
          </p>
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: tsc** clean. **Step 4: Commit**

```bash
git add dashboard/components/rails/LeftRail.tsx dashboard/components/rails/QuoteRow.tsx
git commit -m "feat(dashboard): LeftRail quote rail — futures/US-equity/forex blocks, session badges, minimisable"
```

---

### Task 6: RightRail shell (news placeholder)

**Files:**
- Create: `dashboard/components/rails/RightRail.tsx`

- [ ] **Step 1: Implement** — designed empty state awaiting WS-3; collapsible + persisted; minimised strip shows a "news" affordance. NEVER a blank box.

```tsx
// dashboard/components/rails/RightRail.tsx
"use client";

import { useEffect, useState } from "react";

const PERSIST = "rail-right-collapsed";

export default function RightRail() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setCollapsed(localStorage.getItem(PERSIST) === "1"); }, []);
  const toggle = () => setCollapsed((c) => { localStorage.setItem(PERSIST, c ? "0" : "1"); return !c; });

  if (collapsed) {
    return (
      <aside className="w-9 shrink-0 border-l border-line py-2 flex flex-col items-center">
        <button onClick={toggle} className="text-muted hover:text-foreground" aria-label="expand news rail">⟨</button>
        <span className="font-mono text-[9px] text-muted mt-2 [writing-mode:vertical-rl]">NEWS</span>
      </aside>
    );
  }
  return (
    <aside className="w-[260px] shrink-0 border-l border-line px-2 py-2 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-[11px] text-foreground">News</span>
        <button onClick={toggle} className="text-muted hover:text-foreground text-[12px]" aria-label="collapse news rail">⟩</button>
      </div>
      <p className="font-mono text-[11px] text-muted mt-2">
        live news + macro sentiment land with WS-3 (Discord ingest + FinBERT). The rail
        shell, scrollback and breaking-news treatment ship when the feed is wired.
      </p>
    </aside>
  );
}
```

- [ ] **Step 2: tsc** clean. **Step 3: Commit**

```bash
git add dashboard/components/rails/RightRail.tsx
git commit -m "feat(dashboard): RightRail shell — designed news placeholder awaiting WS-3"
```

---

### Task 7: Layout integration (wrap every page, responsive)

**Files:**
- Modify: `dashboard/app/layout.tsx`
- Create: `dashboard/components/rails/RailShell.tsx` (client wrapper handling the responsive grid)

- [ ] **Step 1: RailShell** — a `"use client"` wrapper placing LeftRail · content · RightRail in a flex row; below 1440px the rails become off-canvas (default collapsed on narrow first visit). Keep it simple: the rails self-manage collapse; RailShell just lays them out and constrains content width.

```tsx
// dashboard/components/rails/RailShell.tsx
"use client";

import LeftRail from "./LeftRail";
import RightRail from "./RightRail";

export default function RailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-var(--nav-h,48px))] w-full">
      <LeftRail />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
      <RightRail />
    </div>
  );
}
```

- [ ] **Step 2: Wire into `layout.tsx`** — wrap `{children}` with `<RailShell>`:

```tsx
import RailShell from "@/components/rails/RailShell";
// …
          <Nav contextStrip={<ContextStrip />} statusDot={<StatusDot />} />
          <CommandK />
          <HelpOverlay />
          <RailShell>{children}</RailShell>
```

(READ the current `layout.tsx` first; place `<RailShell>` exactly where `{children}` was, preserving Nav/CommandK/HelpOverlay above it.)

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx vitest run` (49 expected = 45 + forex-session 3 + tz-display 1). Dev server (port 3100, `ARGUS_DB=… BRIDGE_DIR=…`): open `/` — left rail shows Markets with futures/US-equity/forex blocks (live data from the restarted API at integration; on the worktree the rail may show "rail offline" if `/api/rail/quotes` isn't served yet by the OLD launchd API — that's the correct designed state, verify it's not a blank box); right rail shows the WS-3 placeholder; both collapse/expand and persist across reload. Content (Today table) sits between them, not clipped. Paste a Playwright text check of the three rail block titles + the collapse-persist behavior.

- [ ] **Step 4: Commit**

```bash
git add dashboard/app/layout.tsx dashboard/components/rails/RailShell.tsx
git commit -m "feat(dashboard): wrap every page in the rail shell (left quote rail + right news shell)"
```

---

### Task 8: Smoke check, docs, board, sweep

**Files:**
- Modify: `dashboard/scripts/smoke.mjs` (rail presence check), `dashboard/README.md`, `argus/README.md`, `docs/SESSION_HANDOFF.md`, master plan §9 (Phase C / WS-2 row)

- [ ] **Step 1: Add a rail check to `smoke.mjs`** near the other helpers; call it once after the home route loads:

```js
async function checkRails(page, label) {
  const left = await page.locator('aside:has-text("Markets"), aside:has-text("NEWS")').count();
  if (left === 0) return `${label}: rails not rendered`;
  return null;
}
```

(Follow the file's existing failure-collection pattern; treat non-null as a failure entry. The rail shows "Markets" expanded or the minimised strip — the selector tolerates both via the NEWS vertical label / Markets header.)

- [ ] **Step 2: Full sweep**

```bash
cd dashboard && npx vitest run && node scripts/smoke.mjs   # (dev server up on its usual port)
cd ../argus && .venv/bin/python -m pytest tests/ -v
```
Expected: vitest 49; argus pytest 49 (47 + rail 2); smoke green (rail check passes; `/api/argus/rail/quotes` may 404 against the un-restarted API — the rail's offline state still renders, so the presence check passes).

- [ ] **Step 3: Docs**
  - `argus/README.md`: endpoint row `GET /api/rail/quotes` — batched basket (futures/indices/forex) for the left rail.
  - `dashboard/README.md`: note the persistent rail shell (LeftRail quote rail + RightRail news shell), the new helpers (`forex-session`, `tz-display`, `rail-quotes`), and that macro gauges / market blurb / news feed land with WS-3.
  - `docs/SESSION_HANDOFF.md`: WS-2 done on branch; integration pending (API restart so `/api/rail/quotes` serves); WS-3 dependencies (Discord creds + FinBERT) called out as the next workstream's blockers.
  - Master plan §9: Phase C / WS-2 row → `Done (quote rail; news rail shell awaiting WS-3)`, link this plan, date.

- [ ] **Step 4: Commit**

```bash
git add dashboard/scripts/smoke.mjs dashboard/README.md argus/README.md docs/SESSION_HANDOFF.md docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md
git commit -m "chore(rails): smoke rail check, docs + status board for WS-2"
```

---

## Acceptance (whole phase)

1. vitest green (49); argus pytest green (49); tsc clean; smoke rail check passes.
2. After integration (API restart): `curl :8088/api/rail/quotes` returns ~15 quotes grouped futures/indices/forex; the left rail renders all three blocks with live prices + signed % + session badges (US-equity `usMarketState`, forex `forexSessions`).
3. Both rails minimise/expand independently and persist across reload; minimised left strip shows SPY/QQQ/VIX deltas; minimised right shows the NEWS affordance.
4. Page content sits between the rails on every route, not clipped; the dead side-margins the user flagged are now the rails.
5. Timezone display is Sydney-primary / ET-secondary where the rails show times.
6. Designed states everywhere: rail-offline (API down) and the WS-3 news placeholder — never a blank box.
7. Deferred + documented: macro-sentiment gauges, the one-line market blurb, the "Today" econ-events block, and the right-rail news *feed* all land with WS-3 (needs Discord ingest + FinBERT); responsive drawer-overlay polish below 1440px is a follow-up if the simple flex layout proves cramped on the laptop.
