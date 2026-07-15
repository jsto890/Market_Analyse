# WS-5 SP3 — Companion 2×2 WS-1 Grid on /odte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the WS-1 options-intel companions — GEX levels, unusual contracts, P/C ratio, spot context — in a 2×2 grid beneath the vendored ladder on `/odte`, keyed to the active underlying, plus run the 60-minute live soak when the IBKR Gateway is up.

**Architecture:** Dashboard-only feature plus one small argus API addition. The grid reads WS-1 data from the argus FastAPI (`127.0.0.1:8088`) through new Next.js proxy routes (`/api/odte/gex|unusual|pcr`), keyed on the `/odte` page's `activeSymbol`. A companion-symbol mapping (SPX→SPY, NDX→QQQ, RUT→IWM, DJX→DIA) makes the grid forward-compatible with SP2b index underlyings — WS-1 snapshots cover the ETFs only, so index symbols display ETF-proxy data with a "proxy" tag. The vendored `odte/` tree is NOT touched.

**Tech Stack:** Next.js 14 App Router (client components, SWR), vitest node-env pure-lib tests, argus FastAPI + SQLite (`options_snapshots`, `gex_levels`, `unusual_activity` tables), launchd plist hardening.

**Data shapes (verified live 2026-07-06):**
- `GET :8088/api/gex/{sym}` → `{date, symbol, expiry, zero_gamma, call_wall, put_wall, total_gex, profile_json, caveat}` (one row, latest date).
- `GET :8088/api/unusual/{sym}` → `{symbol, as_of, rows: [{contract, side, expiry, strike, score, cross_z, own_z, persistence, vol, oi, last, basis, ...}]}` ordered by score DESC.
- `options_snapshots` columns: `snap_date, kind, symbol, expiry, strike, type("C"|"P"), oi, vol, last, bid, ask, iv, ts`.
- 404 from either endpoint means no snapshot for that symbol — cards must render an empty state, not error.

## Global Constraints

- The vendored `odte/` tree is opaque — zero changes in this plan.
- Argus API port `8088`; 0DTE backend port `8788`. Never confuse them.
- Companion mapping is exactly: identity for `SPY/QQQ/IWM/DIA`; `SPX→SPY`, `NDX→QQQ`, `RUT→IWM`, `DJX→DIA`. (Index symbols reach the page only after SP2b; the mapping ships now so SP2b needs no dashboard data changes.)
- Dashboard tests: vitest, node env, pure-lib only — no @testing-library, no component/route tests. All display math lives in `lib/` helpers so it IS unit-testable.
- GEX card MUST display the OI-based caveat (the API's `caveat` field, abbreviated: "OI-based · overnight book") — the master plan explicitly requires distinguishing OI-based daily levels from intraday flow.
- Untouchable WIP: `sentiment_bridge.py` (modified), `scripts/com.argus.calendar.plist` (untracked). Explicit `git add` paths only.
- argus pytest runs from `argus/` dir with its own venv: `cd argus && .venv/bin/python -m pytest tests/ -q`.
- Commits: imperative subject, body ends `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Model Assignments (SDD dispatch)

| Task | Role | Model | Why |
|---|---|---|---|
| 1 | implementer | haiku | plist edit + kickstart, exact XML in plan |
| 2 | implementer | sonnet | new API endpoint, SQL + TDD against temp DB |
| 2 | reviewer | sonnet | SQL correctness |
| 3 | implementer | haiku | pure lib + tests, complete code in plan |
| 3 | reviewer | haiku | mechanical |
| 4 | implementer | haiku | three proxies from a template, code in plan |
| 4 | reviewer | haiku | mechanical |
| 5 | implementer | sonnet | four components, SWR wiring, visual states |
| 5 | reviewer | sonnet | UI/data-state coverage |
| 6 | implementer | sonnet | page layout integration + smoke check |
| 6 | reviewer | sonnet | layout regression risk |
| 7 | controller | — | verification sweep |
| 8 | controller | — | soak (gated on Gateway) |
| 9 | final review | opus | whole-branch |

Branch: `ws5-sp3-companion-grid` off Market_Analyse `main`.

---

### Task 1: Harden argus API launchd plist (FD limit)

**Why (incident 2026-07-06):** the long-running API process leaked ~78 FDs onto yfinance's `tkr-tz.db` cache, hit launchd's default 256-FD soft limit, and every `sqlite3.connect` began failing (`unable to open database file` → 500s on all WS-1 endpoints). Restart cleared it; this task prevents recurrence. The grid depends on these endpoints.

**Files:**
- Modify: `~/Library/LaunchAgents/ai.argus.api.plist` (installed copy)
- Modify: repo copy if one exists (`grep -rl "ai.argus.api" scripts/ argus/` — update both to stay in sync; do NOT touch `scripts/com.argus.calendar.plist`)

- [ ] **Step 1:** Insert into the plist dict (sibling of `ProgramArguments`):

```xml
<key>SoftResourceLimits</key>
<dict>
    <key>NumberOfFiles</key>
    <integer>4096</integer>
</dict>
```

- [ ] **Step 2:** Reload: `launchctl bootout gui/$(id -u)/ai.argus.api && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.argus.api.plist`
- [ ] **Step 3:** Verify: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8088/api/gex/QQQ` → 200, and `launchctl print gui/$(id -u)/ai.argus.api | grep -A3 resource` shows the limit.
- [ ] **Step 4:** Commit repo copy only (if tracked): `chore(api): raise launchd FD limit to 4096 (yfinance cache leak)`

---

### Task 2: argus API — `GET /api/pcr/{symbol}`

**Files:**
- Modify: `argus/argus/api/routes.py` (add after the `gex` route, ~line 226)
- Test: `argus/tests/test_api_pcr.py` (new; follow existing API test pattern — grep `TestClient` under `argus/tests/` and mirror fixture style)

**Interfaces:**
- Produces: `GET /api/pcr/{symbol}` → `{"symbol", "as_of", "kind", "pcr_vol", "pcr_oi", "call_vol", "put_vol", "call_oi", "put_oi"}`; 404 when no snapshots. Ratios are `null` when the denominator is 0.

- [ ] **Step 1: Write the failing tests** — seed a temp DB via `options_intel.schema.ensure_schema` + inserted `options_snapshots` rows (two C rows vol 100/oi 1000, one P row vol 150/oi 800 → `pcr_vol = 0.75`, `pcr_oi = 0.4`— wait: pcr = put/call = 150/200 = 0.75 vol; 800/2000 = 0.4 oi); assert 404 for an unseeded symbol; assert zero-call-volume symbol returns `pcr_vol: null`.

- [ ] **Step 2:** Run from `argus/`: `.venv/bin/python -m pytest tests/test_api_pcr.py -q` — expect FAIL (404 route).

- [ ] **Step 3: Implement** (in `routes.py`, matching neighboring handlers' style — `get_conn()`/`ensure_schema`/`try/finally conn.close()`):

```python
    @app.get("/api/pcr/{symbol}")
    def pcr(symbol: str):
        conn = get_conn()
        ensure_schema(conn)
        try:
            latest = conn.execute(
                "SELECT MAX(snap_date) AS d, MAX(kind) AS k FROM options_snapshots "
                "WHERE symbol=?", (symbol.upper(),)).fetchone()
            if not latest or not latest["d"]:
                raise HTTPException(404, "no snapshots for symbol")
            rows = conn.execute(
                "SELECT type, SUM(vol) AS vol, SUM(oi) AS oi FROM options_snapshots "
                "WHERE symbol=? AND snap_date=? GROUP BY type",
                (symbol.upper(), latest["d"])).fetchall()
            agg = {r["type"]: {"vol": r["vol"] or 0, "oi": r["oi"] or 0} for r in rows}
            call = agg.get("C", {"vol": 0, "oi": 0})
            put = agg.get("P", {"vol": 0, "oi": 0})

            def _ratio(p, c):
                return round(p / c, 3) if c else None

            return {"symbol": symbol.upper(), "as_of": latest["d"], "kind": latest["k"],
                    "pcr_vol": _ratio(put["vol"], call["vol"]),
                    "pcr_oi": _ratio(put["oi"], call["oi"]),
                    "call_vol": call["vol"], "put_vol": put["vol"],
                    "call_oi": call["oi"], "put_oi": put["oi"]}
        finally:
            conn.close()
```

- [ ] **Step 4:** Tests pass; full argus suite green from `argus/`.
- [ ] **Step 5:** Restart API (`launchctl kickstart -k gui/$(id -u)/ai.argus.api`), verify `curl -s :8088/api/pcr/QQQ` returns JSON with plausible ratios.
- [ ] **Step 6:** Commit: `feat(api): put/call ratio endpoint from options snapshots`

---

### Task 3: Dashboard lib — companion types, mapping, formatters

**Files:**
- Create: `dashboard/lib/odteCompanion.ts`
- Test: `dashboard/lib/__tests__/odteCompanion.test.ts`

**Interfaces (produces — Tasks 4/5/6 consume):**

```typescript
// dashboard/lib/odteCompanion.ts
import { odteSymbols, type OdteSymbol } from "@/lib/odte";

export type CompanionEtf = "SPY" | "QQQ" | "IWM" | "DIA";

const indexProxy: Record<string, CompanionEtf> = {
  SPX: "SPY", NDX: "QQQ", RUT: "IWM", DJX: "DIA",
};

/** WS-1 data exists for ETFs only; indexes borrow their ETF proxy. */
export function companionSymbol(symbol: OdteSymbol): CompanionEtf {
  return (indexProxy[symbol] ?? symbol) as CompanionEtf;
}

export function isProxied(symbol: OdteSymbol): boolean {
  return symbol in indexProxy;
}

export interface GexLevels {
  date: string; symbol: string; expiry: string;
  zero_gamma: number | null; call_wall: number | null;
  put_wall: number | null; total_gex: number | null; caveat?: string;
}

export interface UnusualRow {
  contract: string; side: string; expiry: string; strike: number;
  score: number; vol: number | null; oi: number | null; persistence: number;
}
export interface UnusualPayload { symbol: string; as_of: string; rows: UnusualRow[] }

export interface PcrPayload {
  symbol: string; as_of: string;
  pcr_vol: number | null; pcr_oi: number | null;
  call_vol: number; put_vol: number; call_oi: number; put_oi: number;
}

/** Billions/millions compaction for total GEX: 350030658 -> "+0.35B" */
export function fmtGex(value: number | null): string {
  if (value == null) return "—";
  const sign = value >= 0 ? "+" : "−";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Tone for P/C ratio: >=1.2 bearish(down), <=0.7 bullish(live), else neutral(warn). */
export function pcrTone(ratio: number | null): "live" | "warn" | "down" {
  if (ratio == null) return "warn";
  if (ratio >= 1.2) return "down";
  if (ratio <= 0.7) return "live";
  return "warn";
}

/** Signed % distance from spot to a level: spot 100, level 103 -> "+3.0%" */
export function pctFrom(spot: number | null, level: number | null): string {
  if (spot == null || level == null || spot === 0) return "—";
  const pct = ((level - spot) / spot) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
```

- [ ] **Step 1: failing tests** (`odteCompanion.test.ts`): mapping identity for 4 ETFs; SPX→SPY/NDX→QQQ/RUT→IWM/DJX→DIA; `isProxied` true only for the 4 indexes; `fmtGex(350030658) === "+0.35B"`, `fmtGex(-1500000) === "−2M"`... (use exact: `fmtGex(-1500000)` → `"−2M"`? `(1.5e6/1e6).toFixed(0)` = `"2"` — yes `"−2M"`); `fmtGex(null) === "—"`; `pcrTone(1.5) === "down"`, `pcrTone(0.5) === "live"`, `pcrTone(0.9) === "warn"`, `pcrTone(null) === "warn"`; `pctFrom(100, 103) === "+3.0%"`, `pctFrom(100, 96.5) === "-3.5%"`, `pctFrom(null, 5) === "—"`.
- [ ] **Step 2:** verify fail → **Step 3:** implement (code above verbatim) → **Step 4:** `npx vitest run` green.
- [ ] **Step 5:** Commit: `feat(odte): companion symbol mapping + grid formatters`

---

### Task 4: Dashboard — three proxy routes

**Files:**
- Create: `dashboard/app/api/odte/gex/route.ts`, `dashboard/app/api/odte/unusual/route.ts`, `dashboard/app/api/odte/pcr/route.ts`
- Modify: `dashboard/scripts/smoke.mjs` (add `"/api/odte/gex"`, `"/api/odte/unusual"`, `"/api/odte/pcr"` to `ACCEPTABLE_FAIL_PREFIXES` after the existing `"/api/odte/symbol",` line)

**Template (gex shown; unusual/pcr identical with the path swapped):**

```typescript
// dashboard/app/api/odte/gex/route.ts
import { isOdteSymbol } from "@/lib/odte";
import { companionSymbol } from "@/lib/odteCompanion";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "";
  if (!isOdteSymbol(symbol)) {
    return Response.json({ error: "unknown symbol" }, { status: 400 });
  }
  const target = companionSymbol(symbol);
  try {
    const res = await fetch(`http://127.0.0.1:8088/api/gex/${target}`, {
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "argus API offline" }, { status: 503 });
  }
}
```

- [ ] Steps: create the three routes (port **8088**, upstream paths `/api/gex/`, `/api/unusual/`, `/api/pcr/`); add the three smoke prefixes; `npx vitest run` stays green (no new tests — validation logic is Task 3's, already tested); `npm run build` compiles.
- [ ] Live check with argus API up: `curl -s "localhost:3000/api/odte/gex?symbol=QQQ"` → JSON; `?symbol=SPX` → SPY-proxied JSON; `?symbol=FOO` → 400.
- [ ] Commit: `feat(odte): gex/unusual/pcr companion proxies`

---

### Task 5: Dashboard — four grid cards

**Files:**
- Create: `dashboard/components/odte/GexCard.tsx`, `UnusualCard.tsx`, `PcrCard.tsx`, `SpotCard.tsx`, and `CompanionCard.tsx` (shared shell)

**Shared behavior (all cards):** client components; `useSWR` with `refreshInterval: 60_000`, key includes the active symbol (`/api/odte/gex?symbol=${symbol}`); three data states — loading skeleton (`animate-pulse` bars, house pattern), empty/404 ("no snapshot yet" muted text), populated. Card shell: `bg-surface border border-line rounded p-3`, title row `text-[10px] uppercase tracking-[0.08em] text-muted font-mono` (matches rail headers), with `as_of`/`date` right-aligned and a `PROXY` chip (`text-[9px] bg-elevated px-1 rounded`) when `isProxied(symbol)`.

**Per card:**
- `GexCard` — rows: Zero-gamma `zero_gamma` + `pctFrom(spot, zero_gamma)`; Call wall; Put wall; Total GEX via `fmtGex` (green when ≥0, red negative). Footer: `OI-based · overnight book` muted caption (constraint).
- `UnusualCard` — top 5 `rows` in a compact `font-mono text-[11px]` table: `contract · side · score(1dp) · vol/oi`; side C green / P red tint.
- `PcrCard` — big `pcr_vol` figure (2dp, `pcrTone` color), secondary `pcr_oi`, sub-line `puts {put_vol} / calls {call_vol}`.
- `SpotCard` — consumes `spot: number | null` prop (page passes it; source Task 6) + shows active underlying, spot, and distance-to-zero-gamma (needs gex data — accept `zeroGamma: number | null` prop; compute with `pctFrom`). No fetch of its own.

**Props contracts (Task 6 consumes):** each fetching card takes `{ symbol: OdteSymbol }`; `SpotCard` takes `{ symbol: OdteSymbol; spot: number | null; zeroGamma: number | null }`.

- [ ] Implement all five files; no new vitest (presentation only — all math already in Task 3 lib).
- [ ] `npm run build` green.
- [ ] Commit: `feat(odte): companion grid cards (gex/unusual/pcr/spot)`

---

### Task 6: Page integration + smoke

**Files:**
- Modify: `dashboard/app/odte/page.tsx`, `dashboard/scripts/smoke.mjs`

**Layout:** keep header row (badge + selector) unchanged; iframe container becomes `h-[62vh] min-h-[420px]` (was `h-full`); below it: 

```tsx
<section className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-3">
  <GexCard symbol={activeSymbol ?? "QQQ"} />
  <UnusualCard symbol={activeSymbol ?? "QQQ"} />
  <PcrCard symbol={activeSymbol ?? "QQQ"} />
  <SpotCard symbol={activeSymbol ?? "QQQ"} spot={spot} zeroGamma={zeroGamma} />
</section>
```

`spot`: derive in the page from a `useSWR<GexLevels>("/api/odte/gex?symbol=…")` call shared with GexCard? No — keep cards self-contained; the page adds ONE extra SWR for gex (SWR dedupes identical keys automatically, so no double fetch) and passes `spot`/`zeroGamma` to SpotCard. `spot` comes from the 0DTE backend health? It doesn't carry spot — use the gex profile's nearest data or `null`; if the rail quotes API (`/api/rail/quotes`) exposes the ETF spot (verify shape at implementation time), prefer it via its existing hook. Whichever source, SpotCard renders "—" for null — acceptance does not require live spot when markets are closed.

**Smoke:** add `checkOdteGrid` to `smoke.mjs` after `checkOdteSelector`, same pattern: on `/odte`, assert the four card titles render (`GEX LEVELS`, `UNUSUAL`, `PUT/CALL`, `SPOT`); wire into the route loop for `/odte` only; push failures into the existing error array.

- [ ] Implement; grid renders under the iframe with the selector still functional (manual: switch symbol → cards refetch (SWR key change)).
- [ ] `npm run build` + `npx vitest run` + smoke 9/9 (fresh `.next`: `rm -rf .next` first if a production build ran — stale-cache gotcha).
- [ ] Commit: `feat(odte): 2x2 companion grid on /odte`

---

### Task 7: Verification sweep (controller)

- [ ] `cd argus && .venv/bin/python -m pytest tests/ -q` green (Task 2).
- [ ] `cd dashboard && npx vitest run` green; `npm run build` green; smoke 9/9 including `checkOdteGrid`.
- [ ] Live: all three proxies return 200 for `?symbol=QQQ`; 400 for garbage; PROXY path (`?symbol=SPX` → SPY data) correct — SP2b not merged yet, so SPX comes only via curl, not the UI; that's expected.
- [ ] Hygiene: WIP pair untouched; only intended files on branch.

### Task 8: 60-minute live soak (controller — GATED on IBKR Gateway)

- [ ] Check `curl -s :8788/health | jq .ibkr_connected`. **If `false`: record BLOCKED in the ledger and report to the user — the soak needs the Gateway; do not fake it.**
- [ ] If `true`: create `scripts/odte_soak.py` exactly as specified in the SP2b plan (Task 8 there — same file; landing it here pre-completes that task) but run with `--symbols SPY,QQQ,IWM,DIA` (pre-SP2b set). PASS criteria 1–4 from the SP2b plan apply; criterion 5 (ladder populated) checked manually.
- [ ] Attach `reports/odte_soak_*.json` verdict to the ledger; commit the script.

### Task 9: Final whole-branch review (opus) + merge

- [ ] `scripts/review-package $(git merge-base main HEAD) HEAD`; reviewer attention: port discipline (8088 vs 8788), companion mapping verbatim, caveat rendering requirement, no `odte/` changes, SWR key correctness on symbol switch, smoke coverage.
- [ ] superpowers:finishing-a-development-branch → merge `--no-ff`, status-board row update in same commit.
