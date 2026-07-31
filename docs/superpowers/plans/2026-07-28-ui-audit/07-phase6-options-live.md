# Phase 6 — Options hub, Strikes ladder, Options Live

**Goal:** Make the Options hub (`/odte`), the Strikes ladder (`/odte/strikes`), and the Options Live feature actually work end to end, on the app's real tokens, without ever letting stale option greeks look live.

**Architecture:** `/odte` is a summary layer (four `VerdictCard`s deriving verdicts from page-level SWR hooks) over the same data the companion cards fetch; `/odte/strikes` renders one ladder at a time — a SWR-polled "classic" ladder (`useLadder`, 60s refresh) or a self-scheduling "live" ladder (`fetchOptionsLive` against the IBKR-backed Argus session, ~500ms cadence) — never both. The live path proxies through the existing generic `/api/argus/[...path]` route to `argus/argus/api/routes.py`'s `/api/options/live/{symbol}` endpoint, which drives `options_live/session.py`'s connect → subscribe → coalesce lifecycle and returns a `LadderSnapshot` serialized by `options_live/transport.py`.

**Tech Stack:** Next.js 14 App Router, React 18, SWR 2.4, TypeScript strict, Tailwind (tokens only, per contract §A), Recharts (`GexChart`), Radix Tooltip (`InfoTip`), Vitest 4 (`lib`/`component` projects) + fake timers for the poller, `@testing-library/react` + `mockFetchJson`, Playwright for the one route-level OL-01 check. Backend: FastAPI + dataclasses, pytest from `argus/.venv`, run from `argus/`.

**Depends on:** Phase 0 (`01-phase0-test-infra.md` — `@/test/render`, `@/test/fetchMock`, `@/test/localStorage`, the `lib`/`component` vitest project split), Phase 1 (`00-foundations-contract.md` — `Button`, `Toggle`, `Collapsible`, `InfoTip`, `CenterBar`, `StatChip`, `format.ts`, `labels.ts`, `storageKeys.ts`, the `.tone-live`/`.tone-frozen`/`.tone-eod` CSS classes). Tasks in this document assume both are already merged. Chart-styling tasks (Task 5, Task 28) are written against the contract's raw tokens because `06-phase5-rotation-macro-charts.md`'s Chart Conventions Spec does not exist yet — re-check those two tasks once it lands (see the note in each).

---

## Global Constraints

- Never introduce raw Tailwind palette colours (`bg-blue-500/30`, `text-green-400`, hex literals) — use `--teal`/`--amber`/`--muted`/`--muted-2`/`var(--green)`/`var(--red)` or the `.tone-live`/`.tone-frozen`/`.tone-eod` classes (contract §A.3).
- Type-scale floor: `text-[11px]` minimum for tabular/data text, `text-xs` (12px) minimum for prose. `text-[10px]`/`text-[9px]` are banned outright (contract §A.2).
- No state conveyed by `opacity` on text-bearing elements — use `--muted-2` or a real tone class.
- Tests never require a live IBKR gateway, a live Argus API, or the real SQLite DB — mock at the fetch boundary with `mockFetchJson` (component tests) or a fake `httpx`/connector double (backend tests).
- The 500ms live poller is tested by extracting its scheduling logic into a pure, injectable-clock function/hook and driving it with Vitest fake timers — never a real `setInterval`/`setTimeout` in a test.
- Precision policy (contract §C): price 2dp, greeks via `greek(v, kind)` (3dp, theta 2dp), percent via `pct()`/`pctWhole()`, large numbers via `compactNumber()`, staleness via `relativeAge()` (seconds in, never ms).
- Copy voice: match the product's existing honest register ("advisory only", "context, not a mechanical exit system") — the OD-02 disclaimer is written in that voice, not softened, not hedged into meaninglessness.
- Python changes run in `argus/.venv`; `pytest` is invoked from `argus/`.
- Commit per task.

---

## File Structure

| File | Change |
|---|---|
| `dashboard/lib/optionsLive.ts` | Fix fetch URL to go through the proxy (OL-01); extend `StrikeLevel`/`LadderSnapshot` types for per-side GEX (OL-03); typed error result instead of `null` (OL-06). |
| `dashboard/e2e/routes.spec.ts` | Delete the `test.fail()` guard on the OL-01 test (Phase 0 Task 8) once the real fix lands. |
| `dashboard/lib/liveLadderPoller.ts` | New. Pure, clock-injectable scheduling logic for the live poller (OL-05) — no DOM, no timers of its own, testable with fake timers. |
| `dashboard/lib/useOptionsLivePoller.ts` | New. React hook wrapping `liveLadderPoller.ts` with `AbortController`, `document.hidden` pause, and exponential backoff (OL-05, OL-06). |
| `dashboard/lib/__tests__/liveLadderPoller.test.ts` | New. Fake-timer tests for the scheduling logic. |
| `dashboard/lib/__tests__/optionsLive.test.ts` | Extended for the fixed URL and the new per-side GEX fields. |
| `dashboard/argus/argus/options_live/models.py` (via `argus/argus/options_live/models.py`) | Add `call_gex_by_strike`/`put_gex_by_strike` to `StrikeLevelSnapshot` (OL-03). |
| `argus/argus/options_live/engine.py` | Populate the two new fields from the already-computed `call_gex`/`put_gex` dicts (OL-03). |
| `argus/argus/options_live/transport.py` | Serialize the two new fields (OL-03). |
| `argus/tests/test_engine.py` | New assertions for per-side GEX. |
| `argus/tests/test_options_transport.py` | New assertions for per-side GEX serialization. |
| `dashboard/components/GexChart.tsx` | Rewrite: prop contract becomes `data: {strike, gex}[]` instead of a JSON string (OL-04); `Panel` wrapper, token colours, zero/spot reference lines (OL-18). |
| `dashboard/app/odte/strikes/page.tsx` | Single-mode ladder render (OL-02); tokenised colours (OL-09); GEX column split (OL-03); mount `GexChart` (OL-04, OL-18); sticky/right-aligned live table (OL-11); unambiguous row highlight (OL-14); de-mono prose (OD-03); scroll-once + center-on-spot button (OD-06); promoted "How to read" explainer (OD-07); unified expiry control (OL-20); provenance/levels-strip rework (OL-07, OL-13, OL-15, OL-16); stale invalidation (OL-06); persisted `Toggle` (OL-10); legend/greek dedup (OL-12, OD-10); `aria-live` region (OL-19); trade ρ/ν for `spread_pct`/`liquid`, surface `msi_rationale` (OL-08); actionable rows (OD-09); connecting state (OL-17). |
| `dashboard/app/odte/page.tsx` | Companion cards mounted as `VerdictCard` drill-down instead of a duplicate grid (OD-01); delete duplicate "Open strikes" links except one (OD-04); de-mono prose (OD-03); health-poll `InfoTip` (OD-11). |
| `dashboard/components/odte/VerdictCard.tsx` | Migrate to `Collapsible` (persisted expand state, `disabled`/`disabledReason`) (OD-08); remove the per-card "Open strikes" link (OD-04). |
| `dashboard/components/odte/StrikeGuidance.tsx` | Persistent disclaimer line (OD-02, P0). |
| `dashboard/components/odte/SymbolSwitcher.tsx` | New. Shared, tokenised symbol switcher replacing the two hand-rolled copies (OD-05). |
| `dashboard/lib/storageKeys.ts` | Add `odteLiveMode`/`odteExpiry` static keys for the persisted live-mode toggle and unified expiry control. |
| `dashboard/lib/odte-core.ts` | Add `msi_rationale` type already present upstream — no change needed unless noted in-task. |
| `dashboard/app/odte/strikes/__tests__/page.test.tsx` | New. Component tests covering OL-02, OL-06, OL-09, OL-14, OD-06, OD-07 render behaviour. |
| `dashboard/app/odte/__tests__/page.test.tsx` | New. Component tests covering OD-01, OD-04, OD-11. |
| `dashboard/components/odte/__tests__/StrikeGuidance.test.tsx` | New. Asserts the OD-02 disclaimer renders verbatim. |
| `dashboard/components/odte/__tests__/VerdictCard.test.tsx` | New. Asserts persistence + single link (OD-04, OD-08). |
| `dashboard/components/__tests__/GexChart.test.tsx` | New. Asserts the new prop contract and conventions. |

---

## Audit findings that did not hold up

**OL-03 — the per-side GEX split is genuinely computable, not a modelling gap.** The audit frames this as "either the model needs `call_gex`/`put_gex`, or the column belongs once" — open-ended, not a claim that it's impossible. Verified against `argus/argus/options_live/engine.py:62-65`: `compute_exposures()` already returns per-strike `call_gex_by_strike` and `put_gex_by_strike` dicts. Line 131 sums them into the single `gex_by_strike` field and discards the per-side values:
```python
gex_by_strike=call_gex.get(strike, 0) + put_gex.get(strike, 0),
```
Task 3 below threads the two values through as new fields instead of summing them — a small, low-risk backend change, not a re-architecture.

**OL-04 — `gex_profile_json` is not "fetched and unused"; it is never populated by either backend path.** The audit says `GexChart` "parses `{strikes:[], gex:[]}` ... and `gex_profile_json` is typed, fetched and unused" (implying the data exists and is simply not wired up). Verified: (1) the live path hardcodes it — `argus/argus/options_live/engine.py:176`: `gex_profile_json=None,  # TODO: fetch from DB`; (2) the classic ladder builder, `argus/argus/options_intel/ladder.py`, never includes a `gex_profile_json` key in its response dict at all (grepped, zero matches). Simply mounting the existing `GexChart` against `data?.gex_profile_json` would render "No GEX data" forever — not a fix. Task 5 instead changes `GexChart`'s prop contract to accept a `{strike, gex}[]` array derived client-side from data that **is** genuinely available today: the classic ladder's already-fetched `LadderRow.gex` per row, and — once Task 3 lands — the live ladder's `call_gex_by_strike + put_gex_by_strike` per level.

No other finding in this phase's scope (every OD-xx and OL-xx) failed verification against source; all are confirmed as described, with exact locations captured in each task below.

---

## Tier 1 — ship blockers

### Task 1: Route the live fetch through the real proxy (OL-01)

**Files:**
- Modify: `dashboard/lib/optionsLive.ts`
- Modify: `dashboard/e2e/routes.spec.ts`
- Test: `dashboard/lib/__tests__/optionsLive.test.ts`

**Interfaces:**
- Consumes: `dashboard/app/api/argus/[...path]/route.ts` (existing generic proxy, unchanged), `argus/argus/api/routes.py:389`'s `/api/options/live/{symbol}` endpoint (unchanged).
- Produces: `fetchOptionsLive(symbol, expiry)` now resolves against a route that actually exists.

**Audit findings closed:** OL-01.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/lib/__tests__/optionsLive.test.ts` (append inside the existing `describe("optionsLive types", ...)` block, after the `fetchOptionsLive function is exported` test):
  ```ts
  test("fetchOptionsLive calls the Argus proxy, not a nonexistent /api/options/live route", async () => {
    const calls: string[] = [];
    global.fetch = ((url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ symbol: "SPY" }),
      }) as unknown as Promise<Response>;
    }) as typeof fetch;

    await fetchOptionsLive("SPY", "0DTE");

    expect(calls[0]).toBe("/api/argus/options/live/SPY?expiry=0DTE");
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npx vitest run --project=lib lib/__tests__/optionsLive.test.ts`
  Expected: FAIL — `expect(calls[0]).toBe("/api/argus/options/live/SPY?expiry=0DTE")` receives `"/api/options/live/SPY?expiry=0DTE"`.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/lib/optionsLive.ts`, change the fetch target:
  ```ts
  const res = await fetch(`/api/argus/options/live/${symbol}?expiry=${expiry}`);
  ```
  (replaces the existing `fetch(\`/api/options/live/${symbol}?expiry=${expiry}\`)` line — no other change to the function body.)
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npx vitest run --project=lib lib/__tests__/optionsLive.test.ts`
  Expected: PASS, all tests in the file.
- [ ] **Step 5: Retire the Phase 0 expected-red guard and commit**
  In `dashboard/e2e/routes.spec.ts`, delete the `test.fail(true, "Expected-red until OL-01 is fixed...")` call inside the `"OL-01: /api/options/live/:symbol should not 404 once proxied to Argus"` test, leaving only:
  ```ts
  test("OL-01: /api/options/live/:symbol should not 404 once proxied to Argus", async ({ request }) => {
    const res = await request.get("/api/options/live/SPY?expiry=0DTE");
    expect(res.status()).not.toBe(404);
  });
  ```
  Note: this Playwright test still hits the *old* `/api/options/live/:symbol` path on purpose — it is asserting the redirect/rewrite surface, not `fetchOptionsLive`'s internal URL. Since no rewrite exists and none is being added (the fix lives in `fetchOptionsLive`, not routing), update the assertion to match reality instead: change the requested path to `/api/argus/options/live/SPY?expiry=0DTE` and keep the `not.toBe(404)` assertion, since that is the path the app now actually calls.
  ```bash
  cd dashboard
  git add lib/optionsLive.ts lib/__tests__/optionsLive.test.ts e2e/routes.spec.ts
  git commit -m "fix(odte): route live ladder fetch through the Argus proxy (OL-01)"
  ```

---

### Task 2: One ladder at a time (OL-02)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `showLive` state (existing), `data` from `useLadder` (existing).
- Produces: exactly one of the live table or the classic table in the DOM at any time.

**Audit findings closed:** OL-02.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { resetLocalStorage } from "@/test/localStorage";
  import userEvent from "@testing-library/user-event";
  import OdteStrikesPage from "@/app/odte/strikes/page";

  describe("OdteStrikesPage — single ladder mode (OL-02)", () => {
    beforeEach(() => {
      resetLocalStorage();
      mockFetchJson({
        "/api/argus/ladder/SPY?expiries=4&band=0.06": {
          symbol: "SPY",
          snap_date: "2026-07-28",
          spot: 565,
          levels: { zero_gamma: 560, call_wall: 570, put_wall: 555, total_gex: 1_000_000 },
          expiries: [
            {
              expiry: "0DTE",
              expected_move_pct: 0.8,
              rows: [{ strike: 565, call: { oi: 1, vol: 1, last: 1, iv: 0.2 }, put: null, gex: 100 }],
            },
          ],
        },
        "/api/argus/options/live/SPY?expiry=0DTE": {
          symbol: "SPY",
          spot: 565,
          as_of: new Date().toISOString(),
          source: "LIVE",
          stale_ms: 0,
          fresh_contract_ratio: 1,
          expiry: "0DTE",
          levels: [],
          atm_strike: 565,
          zero_gamma_strike: 560,
          call_wall_strike: 570,
          put_wall_strike: 555,
          max_pain: 564,
          pin_risk: 40,
          net_gex_band: "bullish",
          msi_call_strike: 570,
          msi_put_strike: 555,
          msi_rationale: "max concentration",
          gex_profile_json: null,
        },
      });
    });

    it("shows only the classic table when the live toggle is off", async () => {
      render(<OdteStrikesPage />);
      expect(await screen.findByText(/no data|call IV/i)).toBeInTheDocument();
      expect(screen.queryByText("C Bid")).not.toBeInTheDocument();
    });

    it("shows only the live table, never both, once the toggle is switched on", async () => {
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await screen.findByText(/call IV/i);
      await user.click(screen.getByRole("button", { name: /live/i }));
      await screen.findByText("C Bid");
      expect(screen.queryByText("call IV")).not.toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL on the second test — `screen.queryByText("call IV")` is present because the classic table's `{data && (...)}` block renders unconditionally on `data`, independent of `showLive`.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/app/odte/strikes/page.tsx`, change the two independent gating blocks so classic rendering is gated on `!showLive` as well as `data`. Replace:
  ```tsx
      {!showLive && (
        <>
          {isLoading && !data && (
            <p className="text-[11px] text-muted font-mono p-4">loading ladder…</p>
          )}
          {error && !data && (
            <p className="text-[11px] text-muted font-mono p-4">no data — source unavailable</p>
          )}
        </>
      )}

      {data && (
        <>
  ```
  with:
  ```tsx
      {!showLive && (
        <>
          {isLoading && !data && (
            <p className="text-[11px] text-muted font-mono p-4">loading ladder…</p>
          )}
          {error && !data && (
            <p className="text-[11px] text-muted font-mono p-4">no data — source unavailable</p>
          )}

          {data && (
            <>
  ```
  and close the newly-nested fragment by adding one more `</>` immediately before the existing closing `</>` that currently matches `{data && (<> ... </>)}` — i.e. the tail of the block becomes:
  ```tsx
            </>
          )}
        </>
      )}
  ```
  (This nests the entire classic-table JSX, unchanged, one level deeper inside `{!showLive && (...)}` instead of leaving it a sibling of the live block — no other line in the classic block's ~200 lines changes.)
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS, both tests.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): render exactly one ladder at a time (OL-02)"
  ```

---

### Task 3: Split GEX by side at the model layer (OL-03, backend)

**Files:**
- Modify: `argus/argus/options_live/models.py`
- Modify: `argus/argus/options_live/engine.py`
- Modify: `argus/argus/options_live/transport.py`
- Test: `argus/tests/test_engine.py`
- Test: `argus/tests/test_options_transport.py`

**Interfaces:**
- Consumes: `compute_exposures()`'s existing `call_gex_by_strike`/`put_gex_by_strike` dicts (`engine.py:64-65`, unchanged).
- Produces: `StrikeLevelSnapshot.call_gex_by_strike: Optional[float]`, `StrikeLevelSnapshot.put_gex_by_strike: Optional[float]` — populated in `engine.py`, serialized in `transport.py`. `gex_by_strike` (the sum) is kept, unchanged, for backward compatibility with any other consumer.

**Audit findings closed:** OL-03 (backend half — see Task 4 for the frontend half).

- [ ] **Step 1: Write the failing test**
  Add to `argus/tests/test_engine.py`, after `test_engine_with_9_strikes`:
  ```python
  def test_engine_splits_gex_by_side():
      """Each level exposes call_gex_by_strike and put_gex_by_strike separately,
      and their sum equals the existing combined gex_by_strike."""
      spot = 420.0
      strikes = [415.0, 420.0, 425.0]
      quotes = {
          s: (create_option_quote(gamma=0.02), create_option_quote(gamma=0.015))
          for s in strikes
      }
      config = LiveConfig()

      ladder = run_analytics(
          quotes=quotes, spot=spot, expiry="0DTE", config=config,
          symbol="SPY", source="LIVE",
      )

      for level in ladder.levels:
          assert level.call_gex_by_strike is not None
          assert level.put_gex_by_strike is not None
          assert level.call_gex_by_strike == pytest.approx(
              level.gex_by_strike - level.put_gex_by_strike
          )
          assert level.gex_by_strike == pytest.approx(
              level.call_gex_by_strike + level.put_gex_by_strike
          )
  ```
  Add to `argus/tests/test_options_transport.py`, inside `class TestSerializeLadder`, after `test_serialize_ladder_with_levels`:
  ```python
      def test_serialize_ladder_level_has_split_gex(self):
          """Each serialized level carries call_gex_by_strike and put_gex_by_strike
          as distinct fields, not the same combined value twice."""
          ladder = LadderSnapshot(
              symbol="SPY", spot=450.0, as_of=datetime.now(timezone.utc),
              source="LIVE", stale_ms=0, fresh_contract_ratio=1.0, expiry="0DTE",
              levels=[
                  StrikeLevelSnapshot(
                      strike=450.0,
                      call=OptionQuote(bid=2.5, ask=2.6, mid=2.55),
                      put=OptionQuote(bid=1.8, ask=1.9, mid=1.85),
                      gex_by_strike=5000.0,
                      call_gex_by_strike=3200.0,
                      put_gex_by_strike=1800.0,
                  )
              ],
          )

          result = serialize_ladder(ladder)
          level = result["levels"][0]

          assert level["call_gex_by_strike"] == 3200.0
          assert level["put_gex_by_strike"] == 1800.0
          assert level["call_gex_by_strike"] != level["put_gex_by_strike"]
  ```
- [ ] **Step 2: Run tests to verify they fail**
  Run:
  ```bash
  cd argus
  .venv/bin/pytest tests/test_engine.py::test_engine_splits_gex_by_side -x
  .venv/bin/pytest tests/test_options_transport.py::TestSerializeLadder::test_serialize_ladder_level_has_split_gex -x
  ```
  Expected: FAIL — `AttributeError: 'StrikeLevelSnapshot' object has no attribute 'call_gex_by_strike'` (first), then `TypeError: __init__() got an unexpected keyword argument 'call_gex_by_strike'` (second, once the first attribute error is worked around) — the dataclass has no such field yet.
- [ ] **Step 3: Write minimal implementation**
  In `argus/argus/options_live/models.py`, extend `StrikeLevelSnapshot` (after the existing `gex_by_strike` field):
  ```python
  @dataclass
  class StrikeLevelSnapshot:
      """Per-strike row in ladder."""
      strike: float
      call: OptionQuote
      put: OptionQuote
      zero_gamma_side: Optional[str] = None  # "C", "P", "both", or None
      wall_type: Optional[str] = None  # "none", "call", "put", "both"
      gex_by_strike: Optional[float] = None  # $ GEX exposure at this strike (call + put)
      call_gex_by_strike: Optional[float] = None  # $ GEX exposure from calls only
      put_gex_by_strike: Optional[float] = None  # $ GEX exposure from puts only
      max_pain_delta: Optional[float] = None  # Contribution to max pain calculation
  ```
  In `argus/argus/options_live/engine.py`, change the `levels.append(...)` call (line 125-133) to populate the two new fields alongside the existing sum:
  ```python
      levels.append(StrikeLevelSnapshot(
          strike=strike,
          call=call_quote,
          put=put_quote,
          zero_gamma_side=zero_gamma_side,
          wall_type=level_wall_type,
          gex_by_strike=call_gex.get(strike, 0) + put_gex.get(strike, 0),
          call_gex_by_strike=call_gex.get(strike, 0),
          put_gex_by_strike=put_gex.get(strike, 0),
          max_pain_delta=1.0 if strike == max_pain else 0.0,
      ))
  ```
  In `argus/argus/options_live/transport.py`, in the per-level dict built inside `serialize_ladder`'s level loop, add the two fields next to the existing `gex_by_strike` key:
  ```python
              "gex_by_strike": level.gex_by_strike,
              "call_gex_by_strike": level.call_gex_by_strike,
              "put_gex_by_strike": level.put_gex_by_strike,
              "max_pain_delta": level.max_pain_delta,
  ```
  (replaces the existing `"gex_by_strike": level.gex_by_strike,` / `"max_pain_delta": level.max_pain_delta,` pair in the level dict.)
- [ ] **Step 4: Run tests to verify they pass**
  Run:
  ```bash
  cd argus
  .venv/bin/pytest tests/test_engine.py tests/test_options_transport.py -x
  ```
  Expected: PASS, full files (existing tests unaffected since the new fields default to `None` and every prior call site omits them).
- [ ] **Step 5: Commit**
  ```bash
  cd argus
  git add argus/options_live/models.py argus/options_live/engine.py argus/options_live/transport.py tests/test_engine.py tests/test_options_transport.py
  git commit -m "fix(options_live): split GEX by call/put side instead of summing (OL-03)"
  ```

---

### Task 4: Render the split GEX columns on the frontend (OL-03, frontend)

**Files:**
- Modify: `dashboard/lib/optionsLive.ts`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/lib/__tests__/optionsLive.test.ts`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `StrikeLevel.call_gex_by_strike`/`.put_gex_by_strike` from Task 3's backend change.
- Produces: the live ladder's call-side GEX column reads `call_gex_by_strike`; the put-side reads `put_gex_by_strike` — no longer the same expression twice.

**Audit findings closed:** OL-03 (frontend half).

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/lib/__tests__/optionsLive.test.ts`:
  ```ts
  test("StrikeLevel carries independent call and put GEX fields", () => {
    const level: StrikeLevel = {
      strike: 100,
      call: {
        bid: 1.5, ask: 1.6, mid: 1.55, spread_pct: 0.65, iv: 0.25, delta: 0.5,
        gamma: 0.01, theta: -0.05, vega: 0.2, rho: 0.1, per_dollar_gamma: 1.05,
        per_dollar_delta: 50, volume: 100, oi: 1000, stale_ms: 0, liquid: true,
      },
      put: {
        bid: 0.5, ask: 0.6, mid: 0.55, spread_pct: 0.91, iv: 0.23, delta: -0.5,
        gamma: 0.01, theta: -0.02, vega: 0.2, rho: -0.1, per_dollar_gamma: 1.05,
        per_dollar_delta: -50, volume: 150, oi: 1200, stale_ms: 0, liquid: true,
      },
      zero_gamma_side: null,
      wall_type: null,
      gex_by_strike: 5000,
      call_gex_by_strike: 3200,
      put_gex_by_strike: 1800,
      max_pain_delta: 0.1,
    };

    expect(level.call_gex_by_strike).not.toBe(level.put_gex_by_strike);
  });
  ```
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`, a new `it` inside the existing `describe`:
  ```tsx
    it("shows independent call and put GEX values, not the same number twice (OL-03)", async () => {
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await screen.findByText(/call IV/i);
      await user.click(screen.getByRole("button", { name: /live/i }));
      const rows = await screen.findAllByRole("row");
      const strikeRow = rows.find((r) => r.textContent?.includes("565"));
      expect(strikeRow).toBeDefined();
      const cells = strikeRow!.querySelectorAll("td");
      // Call GEX is the 11th <td> (index 10), put GEX is the last (index 21).
      expect(cells[10].textContent).not.toBe(cells[21].textContent);
    });
  ```
  Extend the mocked `/api/argus/options/live/SPY?expiry=0DTE` response in the `beforeEach` (Task 2) to include one level with distinct split values:
  ```ts
          levels: [
            {
              strike: 565,
              call: { bid: 1, ask: 1.1, mid: 1.05, spread_pct: 9.5, iv: 0.2, delta: 0.5, gamma: 0.01, theta: -0.05, vega: 0.2, rho: 0.1, per_dollar_gamma: 1, per_dollar_delta: 50, volume: 100, oi: 1000, stale_ms: 0, liquid: true },
              put: { bid: 0.9, ask: 1.0, mid: 0.95, spread_pct: 10.5, iv: 0.19, delta: -0.5, gamma: 0.01, theta: -0.02, vega: 0.2, rho: -0.1, per_dollar_gamma: 1, per_dollar_delta: -50, volume: 90, oi: 900, stale_ms: 0, liquid: true },
              zero_gamma_side: null,
              wall_type: null,
              gex_by_strike: 5000,
              call_gex_by_strike: 3200,
              put_gex_by_strike: 1800,
              max_pain_delta: 0,
            },
          ],
  ```
  (replaces the existing `levels: [],` line in that mock.)
- [ ] **Step 2: Run tests to verify they fail**
  Run:
  ```bash
  cd dashboard
  npx vitest run --project=lib lib/__tests__/optionsLive.test.ts
  npm run test:component -- app/odte/strikes/__tests__/page.test.tsx
  ```
  Expected: FAIL — TypeScript error `Object literal may only specify known properties, and 'call_gex_by_strike' does not exist in type 'StrikeLevel'` (first), and the OL-03 assertion fails because both cells currently render `level.gex_by_strike` (second).
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/lib/optionsLive.ts`, extend `StrikeLevel`:
  ```ts
  export interface StrikeLevel {
    strike: number;
    call: OptionLiveQuote;
    put: OptionLiveQuote;
    zero_gamma_side: string | null;
    wall_type: string | null;
    gex_by_strike: number | null;
    call_gex_by_strike: number | null;
    put_gex_by_strike: number | null;
    max_pain_delta: number | null;
  }
  ```
  In `dashboard/app/odte/strikes/page.tsx`, change the two GEX cells (currently both reading `level.gex_by_strike`). The call-side cell (line ~327-329):
  ```tsx
                        <td className="px-1 py-1 text-center">
                          {level.call_gex_by_strike != null ? (level.call_gex_by_strike / 1000).toFixed(0) : "—"}
                        </td>
  ```
  The put-side cell (line ~361-363):
  ```tsx
                        <td className="px-1 py-1 text-center">
                          {level.put_gex_by_strike != null ? (level.put_gex_by_strike / 1000).toFixed(0) : "—"}
                        </td>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run the same two commands as Step 2. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/optionsLive.ts app/odte/strikes/page.tsx lib/__tests__/optionsLive.test.ts app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): render independent call/put GEX columns (OL-03)"
  ```

---

### Task 5: Rebuild and mount `GexChart` in the classic ladder (OL-04)

**Files:**
- Modify: `dashboard/components/GexChart.tsx`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/components/__tests__/GexChart.test.tsx` (new)

**Interfaces:**
- Consumes: `LadderRow.gex` (`lib/odte-core.ts`, already fetched by `useLadder`, unchanged).
- Produces: `GexChart({ data: {strike: number; gex: number}[]; spotStrike?: number | null; zeroGammaStrike?: number | null })` — a new prop contract that never depends on `gex_profile_json`.

**Audit findings closed:** OL-04. Partial OL-18 (token colours only — `Panel`/`ReferenceLine` full convention pass is Task 28, once live-mode data is available and, ideally, once `06-phase5-rotation-macro-charts.md`'s Chart Conventions Spec exists to re-check against).

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/__tests__/GexChart.test.tsx`:
  ```tsx
  import { render, screen } from "@/test/render";
  import GexChart from "@/components/GexChart";

  describe("GexChart", () => {
    it("renders from a {strike, gex}[] array, not gex_profile_json", () => {
      render(
        <GexChart
          data={[
            { strike: 560, gex: -500_000 },
            { strike: 565, gex: 200_000 },
            { strike: 570, gex: 900_000 },
          ]}
        />
      );
      expect(screen.queryByText("No GEX data")).not.toBeInTheDocument();
    });

    it("shows an empty state for an empty array", () => {
      render(<GexChart data={[]} />);
      expect(screen.getByText("No GEX data")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- components/__tests__/GexChart.test.tsx`
  Expected: FAIL — TypeScript error `Property 'data' does not exist on type 'IntrinsicAttributes & GexChartProps'` (current prop is `gexProfileJson: string | null`).
- [ ] **Step 3: Write minimal implementation**
  Rewrite `dashboard/components/GexChart.tsx`:
  ```tsx
  "use client";

  import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
  } from "recharts";
  import Panel from "@/components/ui/Panel";

  export interface GexDataPoint {
    strike: number;
    gex: number;
  }

  export interface GexChartProps {
    data: GexDataPoint[];
    spotStrike?: number | null;
    zeroGammaStrike?: number | null;
  }

  function formatYAxis(value: number): string {
    if (value === 0) return "0";
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
    return value.toString();
  }

  function GexTooltip({ active, payload }: { active?: boolean; payload?: { payload: GexDataPoint }[] }) {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0].payload;
    return (
      <div className="bg-elevated border border-line rounded px-3 py-2 text-[11px] font-mono shadow-lg">
        <p className="text-foreground">strike {point.strike.toFixed(0)}</p>
        <p className={point.gex >= 0 ? "text-pos" : "text-neg"}>
          GEX {point.gex >= 0 ? "+" : ""}
          {(point.gex / 1_000_000).toFixed(2)}M
        </p>
      </div>
    );
  }

  export default function GexChart({ data, spotStrike, zeroGammaStrike }: GexChartProps) {
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[220px] rounded border border-line bg-surface text-muted text-[11px]">
          No GEX data
        </div>
      );
    }

    return (
      <Panel title="GEX profile">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gexPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--green)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gexNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--red)" stopOpacity={0} />
                <stop offset="95%" stopColor="var(--red)" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="strike" type="number" tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 11 }} stroke="var(--muted)" />
            <Tooltip content={<GexTooltip />} />
            <ReferenceLine y={0} stroke="var(--muted)" />
            {zeroGammaStrike != null && (
              <ReferenceLine x={zeroGammaStrike} stroke="var(--teal)" strokeDasharray="4 2" />
            )}
            {spotStrike != null && (
              <ReferenceLine x={spotStrike} stroke="var(--warn)" strokeDasharray="4 2" />
            )}
            <Area
              type="monotone"
              dataKey="gex"
              stroke="var(--muted)"
              fill="url(#gexPos)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
    );
  }
  ```
  Note: `--line` is an existing token (used throughout `globals.css` for borders); Recharts accepts any valid CSS color string in `stroke`, including `var(--x)`, since it renders inline SVG attributes, not Tailwind classes.
  In `dashboard/app/odte/strikes/page.tsx`, replace the classic-mode placeholder comment:
  ```tsx
            {/* GEX Profile Chart — implementation deferred to Task 12 */}
  ```
  (the one inside the `{data && (<> ... </>)}` block, immediately after the closing `</div>` of the ladder table) with:
  ```tsx
            <div className="mt-3">
              <GexChart
                data={rows.map((r) => ({ strike: r.strike, gex: r.gex }))}
                spotStrike={data.spot}
                zeroGammaStrike={data.levels?.zero_gamma ?? null}
              />
            </div>
  ```
  Add the import at the top of the file, alongside the existing `optionsLive` import:
  ```tsx
  import GexChart from "@/components/GexChart";
  ```
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- components/__tests__/GexChart.test.tsx`
  Expected: PASS, both tests.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add components/GexChart.tsx app/odte/strikes/page.tsx components/__tests__/GexChart.test.tsx
  git commit -m "fix(odte/strikes): rebuild GexChart on real data and mount it (OL-04)"
  ```

---

### Task 6: Tokenise the live-mode colours (OL-09)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `.tone-live`/`.tone-frozen`/`.tone-eod` (contract §A.3, assumed already in `globals.css` from Phase 1).
- Produces: no raw Tailwind palette classes remain in the live toggle button, the provenance badge, or the row-highlight classes.

**Audit findings closed:** OL-09.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
    it("uses tokenised classes for the live toggle and provenance badge, not raw palette colours (OL-09)", async () => {
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await screen.findByText(/call IV/i);
      const toggle = screen.getByRole("button", { name: /live/i });
      expect(toggle.className).not.toMatch(/blue-|gray-/);
      await user.click(toggle);
      const badge = await screen.findByText("LIVE");
      expect(badge.className).not.toMatch(/green-|yellow-|gray-/);
      expect(badge.className).toMatch(/tone-live/);
    });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — `toggle.className` matches `/blue-|gray-/` (`bg-blue-500/30 text-blue-300` / `bg-gray-500/20 text-gray-400`).
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/app/odte/strikes/page.tsx`, the live toggle button:
  ```tsx
          <button
            onClick={() => setShowLive(!showLive)}
            className={`px-2 py-1 text-xs rounded ${
              showLive ? "tone-live" : "border border-line text-muted"
            }`}
          >
            {showLive ? "LIVE" : "live"}
          </button>
  ```
  The provenance badge:
  ```tsx
                  <span
                    className={`px-2 py-0.5 text-xs rounded font-semibold ${
                      liveLadder.source === "LIVE"
                        ? "tone-live"
                        : liveLadder.source === "FROZEN"
                          ? "tone-frozen"
                          : "tone-eod"
                    }`}
                  >
                    {liveLadder.source}
                  </span>
  ```
  The row-highlight classes on the live table (zero-gamma and ATM):
  ```tsx
                        className={`border-b border-line/50 ${
                          level.strike === liveLadder.zero_gamma_strike ? "bg-teal/10" : ""
                        } ${level.strike === liveLadder.atm_strike ? "bg-warn/10" : ""}`}
  ```
  (Full ambiguity-of-precedence fix — left-border markers instead of stacked backgrounds — is OL-14, Task 25; this step only removes the raw palette, keeping the existing stacking behaviour.)
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): tokenise live-mode colours, remove raw Tailwind palette (OL-09)"
  ```

---

### Task 7: Dedupe verdict cards vs. companion grid (OD-01)

**Files:**
- Modify: `dashboard/app/odte/page.tsx`
- Modify: `dashboard/components/odte/VerdictCard.tsx`
- Test: `dashboard/app/odte/__tests__/page.test.tsx` (new)

**Interfaces:**
- Consumes: `GexCard`/`UnusualCard`/`PcrCard`/`SpotCard` (existing, self-fetching, unchanged) as `VerdictCard`'s `detail` content instead of page-level inline JSX.
- Produces: each figure (GEX levels, PCR, unusual prints, spot) appears once per card, not once inline and once again in a separate "Companion grid" section.

**Audit findings closed:** OD-01.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/app/odte/__tests__/page.test.tsx`:
  ```tsx
  import { render, screen } from "@/test/render";
  import { mockFetchJson } from "@/test/fetchMock";
  import { resetLocalStorage } from "@/test/localStorage";
  import userEvent from "@testing-library/user-event";
  import OdtePage from "@/app/odte/page";

  const gex = { date: "2026-07-28", symbol: "SPY", expiry: "0DTE", zero_gamma: 560, call_wall: 570, put_wall: 555, total_gex: 1_000_000 };

  function mockOdte() {
    mockFetchJson({
      "/api/odte/health": { ok: true, ibkr_connected: true },
      "/api/odte/gex?symbol=SPY": gex,
      "/api/odte/pcr?symbol=SPY": { symbol: "SPY", as_of: "2026-07-28", pcr_vol: 0.9, pcr_oi: 1.0, call_vol: 100, put_vol: 90, call_oi: 200, put_oi: 200 },
      "/api/odte/unusual?symbol=SPY": { symbol: "SPY", as_of: "2026-07-28", rows: [] },
      "/api/argus/ladder/SPY?expiries=1": { symbol: "SPY", snap_date: "2026-07-28", spot: 565, levels: gex, expiries: [{ expiry: "0DTE", expected_move_pct: 0.8, rows: [] }] },
    });
  }

  describe("OdtePage — verdict cards vs. companion grid (OD-01)", () => {
    beforeEach(() => {
      resetLocalStorage();
      mockOdte();
    });

    it("does not render a separate Companion grid section", async () => {
      render(<OdtePage />);
      await screen.findByText("Levels");
      expect(screen.queryByText("Companion grid")).not.toBeInTheDocument();
    });

    it("shows the GEX figures once, inside the Levels card's drill-down", async () => {
      const user = userEvent.setup();
      render(<OdtePage />);
      const levelsCard = (await screen.findByText("Levels")).closest("button")!;
      await user.click(levelsCard);
      expect(await screen.findByText("Gamma exposure")).toBeInTheDocument();
      // Only one "call wall" figure on the page now, not one inline + one in GexCard.
      expect(screen.getAllByText(/call wall/i)).toHaveLength(1);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/__tests__/page.test.tsx`
  Expected: FAIL — `screen.queryByText("Companion grid")` finds the `Panel title="Companion grid"` section; the "call wall" text appears twice (once in `VerdictCard`'s inline `detail`, once in the standalone `GexCard`).
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/app/odte/page.tsx`, delete the standalone companion grid section entirely:
  ```tsx
      <div className="px-3 pb-3">
        <Panel title="Companion grid">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <GexCard symbol={activeSymbol} />
            <UnusualCard symbol={activeSymbol} />
            <PcrCard symbol={activeSymbol} />
            <SpotCard symbol={activeSymbol} spot={spot} zeroGamma={zeroGamma} />
          </div>
        </Panel>
      </div>
  ```
  (remove this block and the now-unused `Panel` import if nothing else in the file uses it — check with `grep -n "Panel" app/odte/page.tsx` before removing the import.)
  Replace each `VerdictCard`'s inline `detail` JSX with the matching companion card, mounted as the drill-down. "Spot / Regime":
  ```tsx
          detail={<SpotCard symbol={activeSymbol} spot={spot} zeroGamma={zeroGamma} />}
  ```
  "Levels":
  ```tsx
          detail={<GexCard symbol={activeSymbol} />}
  ```
  "Flow / Stats" (needs both PCR and unusual prints — render both, unchanged components, inside a `space-y-2` wrapper):
  ```tsx
          detail={
            <div className="space-y-2">
              <PcrCard symbol={activeSymbol} />
              <UnusualCard symbol={activeSymbol} />
            </div>
          }
  ```
  "Shape / Skew" has no companion-card equivalent (ATM IV skew isn't fetched by any `*Card`) — leave its existing inline `detail` JSX unchanged.
  Note: the page-level `useSWR` calls for `gexData`/`pcrData`/`unusualData` (lines 48-74) are **not** removed — `deriveLevels`/`deriveFlow`/`deriveShape` (the verdict-derivation functions) still consume `zeroGamma`/`callWall`/`putWall`/`totalGex`/`pcrVol`/`pcrOi`/`unusualCount` from them for the card's *summary* sentence; only the duplicated companion-grid *drill-down* rendering moves.
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- app/odte/__tests__/page.test.tsx`
  Expected: PASS, both tests.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/page.tsx app/odte/__tests__/page.test.tsx
  git commit -m "fix(odte): dedupe companion cards into verdict-card drill-downs (OD-01)"
  ```

---

### Task 8: Disclaimer on actionable trade instructions (OD-02, P0)

**Files:**
- Modify: `dashboard/components/odte/StrikeGuidance.tsx`
- Test: `dashboard/components/odte/__tests__/StrikeGuidance.test.tsx` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: a persistent, always-visible disclaimer line in the `StrikeGuidance` panel header, present regardless of session phase or data availability.

**Audit findings closed:** OD-02.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/odte/__tests__/StrikeGuidance.test.tsx`:
  ```tsx
  import { render, screen } from "@/test/render";
  import StrikeGuidance from "@/components/odte/StrikeGuidance";

  describe("StrikeGuidance — disclaimer (OD-02)", () => {
    it("shows the not-financial-advice disclaimer next to the actionable strikes", () => {
      render(
        <StrikeGuidance spot={565} zeroGamma={560} callWall={570} putWall={555} atm={565} emPct={0.8} />
      );
      expect(
        screen.getByText("Advisory only, not financial advice — context for your own decision, not a signal to execute.")
      ).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/StrikeGuidance.test.tsx`
  Expected: FAIL — `TestingLibraryElementError: Unable to find an element with the text` (no disclaimer exists in the component today).
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/components/odte/StrikeGuidance.tsx`, add the disclaimer immediately below the header row (after the closing `</div>` of the `flex flex-wrap items-center gap-2 px-4 py-2.5` header block, before the `<div className="space-y-3 border-t ...">` body):
  ```tsx
      <p className="border-t border-line px-4 py-1.5 text-[11px] text-muted-2">
        Advisory only, not financial advice — context for your own decision, not a signal to execute.
      </p>
  ```
  (`text-muted-2`, contract §A.1, is the correct de-emphasis token here — this line is deliberately quieter than the surrounding body copy but must never use `opacity-*` per the global constraint; `--muted-2` is a fixed, contrast-verified colour, not a faded one.)
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/StrikeGuidance.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add components/odte/StrikeGuidance.tsx components/odte/__tests__/StrikeGuidance.test.tsx
  git commit -m "fix(odte): add persistent not-financial-advice disclaimer to strike guidance (OD-02)"
  ```

---

## Tier 2 — before this is trusted with money

### Task 9: Poller hygiene — overlap guard, abort, visibility pause, backoff (OL-05)

**Files:**
- Create: `dashboard/lib/liveLadderPoller.ts`
- Create: `dashboard/lib/useOptionsLivePoller.ts`
- Modify: `dashboard/lib/optionsLive.ts` (add an optional `AbortSignal` param)
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/lib/__tests__/liveLadderPoller.test.ts` (new)

**Interfaces:**
- Consumes: `fetchOptionsLive(symbol, expiry, signal?)`.
- Produces: `createLiveLadderPoller<T>(opts): { start(): void; stop(): void }` — pure scheduling, no React; `computeBackoffDelay(consecutiveFailures, baseIntervalMs, maxIntervalMs): number`; `useOptionsLivePoller(symbol, expiry, enabled): { ladder: LadderSnapshot | null; error: string | null; consecutiveFailures: number }` — the React wrapper `strikes/page.tsx` consumes.

**Audit findings closed:** OL-05.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/lib/__tests__/liveLadderPoller.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { createLiveLadderPoller, computeBackoffDelay } from "../liveLadderPoller";

  describe("computeBackoffDelay", () => {
    it("returns the base interval with zero prior failures", () => {
      expect(computeBackoffDelay(0, 500, 5000)).toBe(500);
    });

    it("doubles per consecutive failure, capped at maxIntervalMs", () => {
      expect(computeBackoffDelay(1, 500, 5000)).toBe(1000);
      expect(computeBackoffDelay(2, 500, 5000)).toBe(2000);
      expect(computeBackoffDelay(3, 500, 5000)).toBe(4000);
      expect(computeBackoffDelay(4, 500, 5000)).toBe(5000); // would be 8000, capped
    });
  });

  describe("createLiveLadderPoller", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("polls immediately on start, then every baseIntervalMs while healthy", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: true });
      const onSuccess = vi.fn();
      const poller = createLiveLadderPoller({
        fetch: fetchFn, onSuccess, onError: vi.fn(),
        baseIntervalMs: 500, maxIntervalMs: 5000,
      });

      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      poller.stop();
    });

    it("never starts a second fetch while one is still in flight (overlap guard)", async () => {
      let resolveFirst: (v: unknown) => void = () => {};
      const fetchFn = vi
        .fn()
        .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
        .mockResolvedValue({ ok: true });

      const poller = createLiveLadderPoller({
        fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
        baseIntervalMs: 500, maxIntervalMs: 5000,
      });
      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Interval elapses while the first request is still pending — the next
      // fetch is only scheduled once the in-flight promise settles.
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      resolveFirst({ ok: true });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      poller.stop();
    });

    it("backs off exponentially on repeated failures, capped at maxIntervalMs", async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
      const onError = vi.fn();
      const poller = createLiveLadderPoller({
        fetch: fetchFn, onSuccess: vi.fn(), onError,
        baseIntervalMs: 500, maxIntervalMs: 2000,
      });

      poller.start();
      await vi.advanceTimersByTimeAsync(0); // failure 1 → next delay 1000ms
      await vi.advanceTimersByTimeAsync(1000); // failure 2 → next delay 2000ms
      await vi.advanceTimersByTimeAsync(2000); // failure 3 → next delay capped 2000ms
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(3);

      poller.stop();
    });

    it("pauses while isPaused() returns true, resumes once it returns false", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: true });
      let paused = false;
      const poller = createLiveLadderPoller({
        fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
        baseIntervalMs: 500, maxIntervalMs: 5000, isPaused: () => paused,
      });

      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      paused = true;
      await vi.advanceTimersByTimeAsync(2000);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      paused = false;
      await vi.advanceTimersByTimeAsync(500);
      expect(fetchFn).toHaveBeenCalledTimes(2);

      poller.stop();
    });

    it("stop() halts all future polling", async () => {
      const fetchFn = vi.fn().mockResolvedValue({ ok: true });
      const poller = createLiveLadderPoller({
        fetch: fetchFn, onSuccess: vi.fn(), onError: vi.fn(),
        baseIntervalMs: 500, maxIntervalMs: 5000,
      });

      poller.start();
      await vi.advanceTimersByTimeAsync(0);
      poller.stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npx vitest run --project=lib lib/__tests__/liveLadderPoller.test.ts`
  Expected: FAIL — `Error: Failed to resolve import "../liveLadderPoller"` (module does not exist yet).
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/lib/liveLadderPoller.ts`:
  ```ts
  /**
   * Pure, DOM-free self-scheduling poller (OL-05). No setInterval — each cycle
   * schedules its own next setTimeout only after the current fetch settles, so
   * a slow or hung request can never overlap with a fresh one. Consumed by
   * useOptionsLivePoller.ts, which supplies the React/DOM concerns (state,
   * AbortController, document.hidden).
   */

  export interface PollerOptions<T> {
    fetch: () => Promise<T>;
    onSuccess: (data: T) => void;
    onError: (error: unknown) => void;
    /** Delay after a healthy poll. Default: 500. */
    baseIntervalMs?: number;
    /** Ceiling for the exponential backoff below. Default: 5000. */
    maxIntervalMs?: number;
    /** Polling is skipped (but the timer keeps ticking at baseIntervalMs) while this returns true — e.g. `() => document.hidden`. */
    isPaused?: () => boolean;
  }

  export interface Poller {
    start(): void;
    stop(): void;
  }

  /** Delay before the next attempt, given how many consecutive failures preceded it. */
  export function computeBackoffDelay(
    consecutiveFailures: number,
    baseIntervalMs: number,
    maxIntervalMs: number
  ): number {
    if (consecutiveFailures <= 0) return baseIntervalMs;
    const backoff = baseIntervalMs * Math.pow(2, consecutiveFailures);
    return Math.min(backoff, maxIntervalMs);
  }

  export function createLiveLadderPoller<T>(opts: PollerOptions<T>): Poller {
    const baseIntervalMs = opts.baseIntervalMs ?? 500;
    const maxIntervalMs = opts.maxIntervalMs ?? 5000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = true;
    let inFlight = false;
    let consecutiveFailures = 0;

    async function tick(): Promise<void> {
      if (stopped) return;
      if (opts.isPaused?.() || inFlight) {
        timer = setTimeout(tick, baseIntervalMs);
        return;
      }
      inFlight = true;
      try {
        const data = await opts.fetch();
        inFlight = false;
        if (stopped) return;
        consecutiveFailures = 0;
        opts.onSuccess(data);
      } catch (err) {
        inFlight = false;
        if (stopped) return;
        consecutiveFailures += 1;
        opts.onError(err);
      }
      if (stopped) return;
      const delay = computeBackoffDelay(consecutiveFailures, baseIntervalMs, maxIntervalMs);
      timer = setTimeout(tick, delay);
    }

    return {
      start() {
        if (!stopped) return;
        stopped = false;
        consecutiveFailures = 0;
        void tick();
      },
      stop() {
        stopped = true;
        if (timer) clearTimeout(timer);
        timer = null;
      },
    };
  }
  ```
  In `dashboard/lib/optionsLive.ts`, add an optional `signal` parameter so the hook can cancel in-flight requests:
  ```ts
  export async function fetchOptionsLive(
    symbol: string,
    expiry: string = "0DTE",
    signal?: AbortSignal
  ): Promise<LadderSnapshot | null> {
    try {
      const res = await fetch(`/api/argus/options/live/${symbol}?expiry=${expiry}`, { signal });
      if (!res.ok) {
        console.warn(`Failed to fetch live ladder for ${symbol}: ${res.status}`);
        return null;
      }
      const data = await res.json();
      return data as LadderSnapshot;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      console.error(`Failed to fetch live ladder for ${symbol}:`, err);
      return null;
    }
  }
  ```
  (Aborts now propagate as a thrown `AbortError` instead of being swallowed into `null` — the poller's `onError` path treats an abort the same as any other failed cycle, which is correct: the cycle is being torn down, not "successfully empty".)
  Create `dashboard/lib/useOptionsLivePoller.ts`:
  ```ts
  "use client";

  import { useEffect, useState } from "react";
  import { fetchOptionsLive, type LadderSnapshot } from "@/lib/optionsLive";
  import { createLiveLadderPoller } from "@/lib/liveLadderPoller";

  export interface LiveLadderState {
    ladder: LadderSnapshot | null;
    error: string | null;
    /** Consecutive failed polls since the last success — drives OL-06's staleness UI. */
    consecutiveFailures: number;
  }

  const INITIAL_STATE: LiveLadderState = { ladder: null, error: null, consecutiveFailures: 0 };

  /** Self-scheduling live ladder poll, active only while `enabled`. Aborts and
   * stops on symbol/expiry change or unmount; pauses while the tab is hidden. */
  export function useOptionsLivePoller(symbol: string, expiry: string, enabled: boolean): LiveLadderState {
    const [state, setState] = useState<LiveLadderState>(INITIAL_STATE);

    useEffect(() => {
      if (!enabled) {
        setState(INITIAL_STATE);
        return;
      }
      const controller = new AbortController();

      const poller = createLiveLadderPoller<LadderSnapshot>({
        fetch: async () => {
          const ladder = await fetchOptionsLive(symbol, expiry, controller.signal);
          if (!ladder) throw new Error("Live data unavailable");
          return ladder;
        },
        onSuccess: (ladder) => setState({ ladder, error: null, consecutiveFailures: 0 }),
        onError: () =>
          setState((prev) => ({
            ladder: prev.ladder,
            error: "Live data unavailable",
            consecutiveFailures: prev.consecutiveFailures + 1,
          })),
        baseIntervalMs: 500,
        maxIntervalMs: 5000,
        isPaused: () => typeof document !== "undefined" && document.hidden,
      });

      poller.start();
      return () => {
        poller.stop();
        controller.abort();
      };
    }, [symbol, expiry, enabled]);

    return state;
  }
  ```
  In `dashboard/app/odte/strikes/page.tsx`, replace the existing local state + `useEffect` poller (the `liveLadder`/`liveError` `useState` pair and the `useEffect` that calls `fetchLive`/`setInterval`) with:
  ```tsx
  const [showLive, setShowLive] = useState(false);
  const { ladder: liveLadder, error: liveError, consecutiveFailures } = useOptionsLivePoller(
    activeSymbol,
    "0DTE",
    showLive
  );
  ```
  and update the imports: remove `fetchOptionsLive` (no longer called directly from the page) and `LadderSnapshot` (no longer referenced) from the `@/lib/optionsLive` import, and add:
  ```tsx
  import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
  ```
  `consecutiveFailures` is unused by this task's JSX — it is wired into the badge/dimming logic in Task 10.
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npx vitest run --project=lib lib/__tests__/liveLadderPoller.test.ts`
  Expected: PASS, all 7 tests. Then run the full component suite to confirm the page still renders: `npm run test:component -- app/odte/strikes/__tests__/page.test.tsx` — Expected: PASS (the hook's immediate first poll on `showLive` toggling true reproduces the same timing the inline tests already rely on).
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/liveLadderPoller.ts lib/useOptionsLivePoller.ts lib/optionsLive.ts app/odte/strikes/page.tsx lib/__tests__/liveLadderPoller.test.ts
  git commit -m "fix(odte/strikes): self-scheduling live poller with abort, backoff, visibility pause (OL-05)"
  ```

---

### Task 10: Invalidate the ladder on repeated failure instead of freezing it silently (OL-06)

**Files:**
- Modify: `dashboard/lib/optionsLive.ts`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/lib/__tests__/optionsLive.test.ts`
- Test: `dashboard/app/odte/strikes/__tests__/liveStaleness.test.tsx` (new)

**Interfaces:**
- Consumes: `consecutiveFailures` from `useOptionsLivePoller` (Task 9).
- Produces: `STALE_AFTER_FAILURES` constant + `isStale(consecutiveFailures): boolean` from `lib/optionsLive.ts`; once stale, the badge reads `STALE` (`.tone-frozen`) instead of the last-known `source`, and the table is visually dimmed — but the last good data stays on screen (never blanked), matching "fail loudly, don't fail invisibly."

**Audit findings closed:** OL-06 — audit's own words: *"the most dangerous failure mode in the whole product — stale option greeks that still look live."*

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/lib/__tests__/optionsLive.test.ts`:
  ```ts
  import { isStale, STALE_AFTER_FAILURES } from "../optionsLive";

  describe("isStale", () => {
    test("false below the consecutive-failure threshold", () => {
      expect(isStale(0)).toBe(false);
      expect(isStale(STALE_AFTER_FAILURES - 1)).toBe(false);
    });

    test("true at and above the threshold", () => {
      expect(isStale(STALE_AFTER_FAILURES)).toBe(true);
      expect(isStale(STALE_AFTER_FAILURES + 5)).toBe(true);
    });
  });
  ```
  Create `dashboard/app/odte/strikes/__tests__/liveStaleness.test.tsx` (mocks `useOptionsLivePoller` directly — the poller's own scheduling is already covered by Task 9's tests; this file only exercises the component's *reaction* to a given `consecutiveFailures` count):
  ```tsx
  import { vi } from "vitest";
  import { render, screen } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import { mockFetchJson } from "@/test/fetchMock";
  import userEvent from "@testing-library/user-event";

  vi.mock("@/lib/useOptionsLivePoller", () => ({
    useOptionsLivePoller: vi.fn(),
  }));

  import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
  import OdteStrikesPage from "@/app/odte/strikes/page";
  import { STALE_AFTER_FAILURES } from "@/lib/optionsLive";

  const mockedPoller = vi.mocked(useOptionsLivePoller);

  const ladder = {
    symbol: "SPY", spot: 565, as_of: "2026-07-28T12:00:00.000Z", source: "LIVE",
    stale_ms: 0, fresh_contract_ratio: 1, expiry: "0DTE", levels: [],
    atm_strike: 565, zero_gamma_strike: 560, call_wall_strike: 570, put_wall_strike: 555,
    max_pain: 564, pin_risk: 40, net_gex_band: "bullish", msi_call_strike: 570,
    msi_put_strike: 555, msi_rationale: "max concentration", gex_profile_json: null,
  };

  describe("OdteStrikesPage — stale-ladder invalidation (OL-06)", () => {
    beforeEach(() => {
      resetLocalStorage();
      mockFetchJson({});
    });

    it("shows LIVE, undimmed, with no consecutive failures", async () => {
      mockedPoller.mockReturnValue({ ladder, error: null, consecutiveFailures: 0 });
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await user.click(screen.getByRole("button", { name: /live/i }));
      expect(await screen.findByText("LIVE")).toBeInTheDocument();
    });

    it("flips the badge to STALE and dims the table after 3 consecutive failures, but keeps the last good data on screen", async () => {
      mockedPoller.mockReturnValue({
        ladder,
        error: "Live data unavailable",
        consecutiveFailures: STALE_AFTER_FAILURES,
      });
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await user.click(screen.getByRole("button", { name: /live/i }));

      expect(await screen.findByText("STALE")).toBeInTheDocument();
      expect(screen.queryByText("LIVE")).not.toBeInTheDocument();
      // The last-known ATM strike is still rendered — the table is dimmed, not blanked.
      expect(screen.getByText("565")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run:
  ```bash
  cd dashboard
  npx vitest run --project=lib lib/__tests__/optionsLive.test.ts
  npm run test:component -- app/odte/strikes/__tests__/liveStaleness.test.tsx
  ```
  Expected: FAIL — `isStale`/`STALE_AFTER_FAILURES` don't exist yet (first); the badge always reads the raw `source` value regardless of `consecutiveFailures`, so `screen.findByText("STALE")` never resolves (second).
- [ ] **Step 3: Write minimal implementation**
  Add to `dashboard/lib/optionsLive.ts`:
  ```ts
  /** Consecutive failed polls after which the ladder on screen is treated as
   * stale rather than live, even though it is still fully rendered (OL-06 —
   * a frozen ladder that still looks live is the most dangerous failure mode
   * in the product). */
  export const STALE_AFTER_FAILURES = 3;

  export function isStale(consecutiveFailures: number): boolean {
    return consecutiveFailures >= STALE_AFTER_FAILURES;
  }
  ```
  In `dashboard/app/odte/strikes/page.tsx`, import the new helpers:
  ```tsx
  import { useOptionsLivePoller } from "@/lib/useOptionsLivePoller";
  import { isStale } from "@/lib/optionsLive";
  ```
  Replace the provenance badge and timestamp span (the block built in Task 6):
  ```tsx
                  <span
                    className={`px-2 py-0.5 text-xs rounded font-semibold ${
                      isStale(consecutiveFailures)
                        ? "tone-frozen"
                        : liveLadder.source === "LIVE"
                          ? "tone-live"
                          : liveLadder.source === "FROZEN"
                            ? "tone-frozen"
                            : "tone-eod"
                    }`}
                  >
                    {isStale(consecutiveFailures) ? "STALE" : liveLadder.source}
                  </span>
                  <span className="text-[11px] text-muted">
                    {new Date(liveLadder.as_of).toLocaleTimeString()}
                  </span>
  ```
  (only the badge's `className`/text changes here; the timestamp span is unchanged in this task — OL-07/OL-15's unit and prominence rework is Task 11.)
  Wrap the live table container so it dims once stale:
  ```tsx
              <div
                className="flex-1 overflow-auto"
                style={isStale(consecutiveFailures) ? { filter: "grayscale(0.6)" } : undefined}
              >
  ```
  (replaces the existing `<div className="flex-1 overflow-auto">` that wraps the 23-column `<table>`.)
- [ ] **Step 4: Run tests to verify they pass**
  Run the same two commands as Step 2. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/optionsLive.ts app/odte/strikes/page.tsx lib/__tests__/optionsLive.test.ts app/odte/strikes/__tests__/liveStaleness.test.tsx
  git commit -m "fix(odte/strikes): flip badge to STALE and dim the table on repeated poll failure (OL-06)"
  ```

---

### Task 11: Threshold staleness, promote provenance, wrap the levels strip (OL-07, OL-15, OL-16)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `liveLadder.stale_ms`, `liveLadder.fresh_contract_ratio`, `InfoTip` (contract §B.7).
- Produces: the `stale_ms` chip only renders above a real threshold, in human units; timestamp/staleness/fresh-ratio move into the levels strip as first-class `StatChip`-style cells with a tooltip; the levels strip wraps instead of clipping at `grid-cols-6`.

**Audit findings closed:** OL-07, OL-15, OL-16.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
    it("only shows a staleness warning above 1500ms, and explains fresh_contract_ratio (OL-07, OL-15)", async () => {
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await screen.findByText(/call IV/i);
      await user.click(screen.getByRole("button", { name: /live/i }));
      await screen.findByText("C Bid");
      // The mocked ladder (Task 2) has stale_ms: 0 — no warning should render at all.
      expect(screen.queryByText(/stale/i)).not.toBeInTheDocument();
      // fresh_contract_ratio now has an accessible explanation, not a bare "Fresh 87%".
      const freshLabel = screen.getByText(/fresh/i);
      expect(freshLabel.closest("button, [role='button']")).toBeTruthy();
    });

    it("wraps the levels strip instead of a rigid 6-column grid (OL-16)", async () => {
      const user = userEvent.setup();
      render(<OdteStrikesPage />);
      await screen.findByText(/call IV/i);
      await user.click(screen.getByRole("button", { name: /live/i }));
      const stripHeading = await screen.findByText("ATM");
      const strip = stripHeading.closest("div")!.parentElement!;
      expect(strip.className).toMatch(/flex-wrap/);
      expect(strip.className).not.toMatch(/grid-cols-6/);
    });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the first test's `queryByText(/stale/i)` currently would not match with `stale_ms: 0` (that part already passes), but `fresh_contract_ratio`'s label has no `button`/`role="button"` ancestor yet; the second test fails because the strip's class list contains `grid-cols-6`, not `flex-wrap`.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/app/odte/strikes/page.tsx`, add the import:
  ```tsx
  import InfoTip from "@/components/ui/InfoTip";
  ```
  Threshold the stale chip (replaces the existing `{liveLadder.stale_ms > 0 && (...)}` block):
  ```tsx
                  {liveLadder.stale_ms > 1500 && (
                    <span className="text-[11px] text-warn">
                      {(liveLadder.stale_ms / 1000).toFixed(1)}s stale
                    </span>
                  )}
  ```
  Remove the old `<span className="text-[11px] text-muted">Fresh {...}% · GEX {...}</span>` summary line from the provenance bar's right side (it moves into the levels strip below), leaving the provenance bar with only the badge, timestamp, and thresholded stale chip.
  Replace the "Levels Summary Strip" `<div className="grid grid-cols-6 gap-2 ...">` block with a wrapping flex strip that also carries the promoted provenance cells:
  ```tsx
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-line px-4 py-2 text-[11px]">
                <div>
                  <span className="text-muted">ATM</span>
                  <span className="ml-2 font-semibold">{liveLadder.atm_strike.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted">Max Pain</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.max_pain != null ? liveLadder.max_pain.toFixed(2) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Pin Risk</span>
                  <span className="ml-2 font-semibold">{liveLadder.pin_risk.toFixed(0)}</span>
                </div>
                <div>
                  <span className="text-muted">Zero Gamma</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.zero_gamma_strike != null ? liveLadder.zero_gamma_strike.toFixed(0) : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">MSI Call/Put</span>
                  <span className="ml-2 font-semibold">
                    {liveLadder.msi_call_strike != null ? liveLadder.msi_call_strike.toFixed(0) : "—"} /
                    {liveLadder.msi_put_strike != null ? " " + liveLadder.msi_put_strike.toFixed(0) : " —"}
                  </span>
                </div>
                <div>
                  <span className="text-muted">Net GEX</span>
                  <span className="ml-2 font-semibold">{liveLadder.net_gex_band}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted">Fresh</span>
                  <span className="ml-1 font-semibold">
                    {(liveLadder.fresh_contract_ratio * 100).toFixed(0)}%
                  </span>
                  <InfoTip content="Share of contracts in this ladder with a non-null bid/ask/greeks quote as of the last poll — the basis for trusting the numbers above. Below ~70% the ladder is thin; treat it as directional, not precise.">
                    <span className="sr-only">What does fresh mean?</span>
                  </InfoTip>
                </div>
              </div>
  ```
  (`net_gex_band` now appears exactly once — here — instead of also duplicating in the provenance bar; the removal above already deleted its other occurrence.)
- [ ] **Step 4: Run test to verify it passes**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): threshold staleness, promote provenance, wrap levels strip (OL-07, OL-15, OL-16)"
  ```

---

## Tier 3 — polish, consistency, the rest of the audit

### Task 12: De-mono the prose shell on both pages (OD-03)

**Files:**
- Modify: `dashboard/app/odte/page.tsx`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/__tests__/page.test.tsx`, `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** none new — removes an inherited class only.

**Audit findings closed:** OD-03.

- [ ] **Step 1: Write the failing test**
  Add to both page test files:
  ```tsx
  it("keeps <main> free of font-mono so prose renders in the body sans font, while tabular data stays monospace (OD-03)", async () => {
    render(<Page />); // OdteStrikesPage / OdtePage per file
    await screen.findByText(/call IV/i); // or an odte-page-equivalent findBy
    const main = document.querySelector("main")!;
    expect(main.className).not.toMatch(/font-mono/);
    const table = document.querySelector("table");
    if (table) expect(table.className).toMatch(/font-mono/);
  });
  ```
  (use each file's real default import name and an already-established `findBy` from that file's existing tests in place of the placeholders above)
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte`
  Expected: FAIL — both `<main>` elements currently declare `className="flex flex-col font-mono h-full"`.
- [ ] **Step 3: Write minimal implementation**
  In both files, change:
  ```tsx
  <main className="flex flex-col font-mono h-full">
  ```
  to:
  ```tsx
  <main className="flex flex-col h-full">
  ```
  In `dashboard/app/odte/strikes/page.tsx`, the classic-ladder `<table>` already declares its own explicit `font-mono` (`className="w-full font-mono text-[11px] tabular-nums border-collapse"`), so it is unaffected. Confirm no other numeric/tabular element in either file relied on `<main>`'s cascaded class rather than its own explicit `font-mono` — every stat/table/chip block audited in Tasks 1–11 already carries its own explicit `font-mono` alongside `tabular-nums`, so no further edits are needed.
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/page.tsx app/odte/strikes/page.tsx app/odte/__tests__/page.test.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte): stop monospacing prose shell, keep it scoped to tabular data (OD-03)"
  ```

---

### Task 13: VerdictCard migrates to the shared Collapsible; drop the duplicate "Open strikes" link (OD-04, OD-08)

**Files:**
- Modify: `dashboard/components/odte/VerdictCard.tsx`
- Test: `dashboard/components/odte/__tests__/VerdictCard.test.tsx` (new)

**Interfaces:**
- Consumes: `Collapsible` (contract §B.4) — `trigger`/`children`/`persistKey`/discriminated `disabled`+`disabledReason`.
- Produces: `VerdictCardProps` drops `strikesHref` (dead prop, no call site ever overrode it); the "Open strikes →" link now exists exactly once in the app (the stats strip in `odte/page.tsx`, untouched by this task).

**Audit findings closed:** OD-04 — 4 duplicate "Open strikes →" links (one inside every expanded `VerdictCard`) plus the stats-strip original, all pointing at the same URL. OD-08 — `VerdictCard`'s hand-rolled `open`/`canExpand` `useState` had no persistence and its own bespoke chevron/ARIA wiring, one of the four collapsible implementations `Collapsible` (contract §B.4) exists to replace.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/odte/__tests__/VerdictCard.test.tsx`:
  ```tsx
  import { render, screen } from "@/test/render";
  import { resetLocalStorage } from "@/test/localStorage";
  import userEvent from "@testing-library/user-event";
  import VerdictCard from "../VerdictCard";

  const verdict = { status: "good" as const, sentence: "Bullish, low pin risk." };

  describe("VerdictCard", () => {
    beforeEach(() => resetLocalStorage());

    it("expands via the shared Collapsible primitive and shows detail with no duplicate 'Open strikes' link (OD-04, OD-08)", async () => {
      const user = userEvent.setup();
      render(<VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />);
      expect(screen.queryByText("Detail content")).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /flow/i }));
      expect(screen.getByText("Detail content")).toBeInTheDocument();
      expect(screen.queryByText(/open strikes/i)).not.toBeInTheDocument();
    });

    it("disables the trigger with a reason when there is nothing to expand (OD-08)", () => {
      render(<VerdictCard title="Flow" verdict={null} loading={false} />);
      const trigger = screen.getByRole("button", { name: /flow/i });
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveAttribute(
        "title",
        "No detail available until the verdict finishes loading"
      );
    });

    it("persists its expand state per verdict title across remounts (OD-08)", async () => {
      const user = userEvent.setup();
      const { unmount } = render(
        <VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />
      );
      await user.click(screen.getByRole("button", { name: /flow/i }));
      unmount();
      render(<VerdictCard title="Flow" verdict={verdict} detail={<p>Detail content</p>} />);
      expect(screen.getByText("Detail content")).toBeInTheDocument();
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/VerdictCard.test.tsx`
  Expected: FAIL — the current implementation's expand state is un-persisted `useState`, and it still renders "Open strikes →" inside every expansion.
- [ ] **Step 3: Write minimal implementation**
  Replace `dashboard/components/odte/VerdictCard.tsx` in full:
  ```tsx
  "use client";

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
  }

  export default function VerdictCard({
    title,
    verdict,
    loading,
    stats = [],
    whyItMatters,
    detail,
  }: VerdictCardProps) {
    const accent = verdict ? borderClass[verdict.status] : "border-l-line";
    const canExpand = !loading && !!verdict && !!detail;
    const persistKey = `verdict-${title.toLowerCase().replace(/\s+/g, "-")}`;

    const trigger = (
      <div className="min-w-0 flex-1">
        <span className="text-[10px] uppercase tracking-[0.08em] text-muted font-mono">{title}</span>
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

    const body = (
      <div className="mt-3 pt-3 border-t border-line space-y-2">
        {whyItMatters && <p className="text-[10px] text-muted italic">{whyItMatters}</p>}
        {detail}
      </div>
    );

    return (
      <div className={`bg-surface border border-line ${accent} border-l-2 rounded p-3`}>
        {canExpand ? (
          <Collapsible persistKey={persistKey} trigger={trigger}>
            {body}
          </Collapsible>
        ) : (
          <Collapsible
            trigger={trigger}
            disabled
            disabledReason="No detail available until the verdict finishes loading"
          >
            <></>
          </Collapsible>
        )}
      </div>
    );
  }
  ```
  (two static branches, not a spread of a conditional `disabled` object, so the discriminated union in contract §B.4 type-checks cleanly.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/VerdictCard.test.tsx app/odte/__tests__/page.test.tsx`
  Expected: PASS — including the existing `odte/page.tsx` tests, since `VerdictCardProps` no longer requires `strikesHref` and no call site passed one.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add components/odte/VerdictCard.tsx components/odte/__tests__/VerdictCard.test.tsx
  git commit -m "fix(odte): migrate VerdictCard to shared Collapsible, drop duplicate strikes link (OD-04, OD-08)"
  ```

---

### Task 14: Extract a shared SymbolSwitcher (OD-05)

**Files:**
- Add: `dashboard/components/odte/SymbolSwitcher.tsx`
- Modify: `dashboard/app/odte/page.tsx`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/components/odte/__tests__/SymbolSwitcher.test.tsx` (new)

**Interfaces:**
```ts
interface SymbolSwitcherProps {
  active: OdteSymbol;
  onChange: (symbol: OdteSymbol) => void;
  className?: string;
}
```

**Audit findings closed:** OD-05 — two hand-rolled ETF/INDEX button groups, one already tokenised (`odte/page.tsx`, `bg-accent-dim text-accent`), one still on raw Tailwind palette classes (`odte/strikes/page.tsx`, `bg-green-500/20 text-green-400`) — itself a small instance of the OL-09/global-constraint-1 violation, fixed here by consolidating onto the already-correct tokens rather than inventing new ones.

- [ ] **Step 1: Write the failing test**
  Create `dashboard/components/odte/__tests__/SymbolSwitcher.test.tsx`:
  ```tsx
  import { vi } from "vitest";
  import { render, screen } from "@/test/render";
  import userEvent from "@testing-library/user-event";
  import SymbolSwitcher from "../SymbolSwitcher";

  describe("SymbolSwitcher", () => {
    it("highlights the active symbol with tokenised (not raw-palette) classes and calls onChange when another is clicked", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      render(<SymbolSwitcher active="SPY" onChange={onChange} />);
      const active = screen.getByRole("button", { name: "SPY" });
      expect(active.className).toMatch(/bg-accent-dim/);
      expect(active.className).not.toMatch(/bg-green-500/);
      await user.click(screen.getByRole("button", { name: "QQQ" }));
      expect(onChange).toHaveBeenCalledWith("QQQ");
    });
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/SymbolSwitcher.test.tsx`
  Expected: FAIL — the module does not exist yet.
- [ ] **Step 3: Write minimal implementation**
  Create `dashboard/components/odte/SymbolSwitcher.tsx`:
  ```tsx
  "use client";

  import { odteEtfSymbols, odteIndexSymbols } from "@/lib/odte";
  import type { OdteSymbol } from "@/lib/odte-core";

  export interface SymbolSwitcherProps {
    active: OdteSymbol;
    onChange: (symbol: OdteSymbol) => void;
    className?: string;
  }

  function Group({
    label,
    symbols,
    active,
    onChange,
  }: {
    label: string;
    symbols: readonly OdteSymbol[];
    active: OdteSymbol;
    onChange: (symbol: OdteSymbol) => void;
  }) {
    return (
      <div className="flex items-center gap-2 px-2">
        <span className="text-xs text-muted">{label}</span>
        {symbols.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => onChange(symbol)}
            className={`px-2 py-0.5 text-xs ${
              symbol === active ? "bg-accent-dim text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {symbol}
          </button>
        ))}
      </div>
    );
  }

  export default function SymbolSwitcher({ active, onChange, className }: SymbolSwitcherProps) {
    return (
      <div className={`flex rounded border border-line overflow-hidden ${className ?? ""}`}>
        <Group label="ETF" symbols={odteEtfSymbols} active={active} onChange={onChange} />
        <span className="w-px h-4 bg-line mx-1 self-center" />
        <Group label="INDEX" symbols={odteIndexSymbols} active={active} onChange={onChange} />
      </div>
    );
  }
  ```
  In `dashboard/app/odte/page.tsx`, replace the whole `<div className="flex rounded border border-line overflow-hidden">...</div>` block (both `Group`-shaped sub-divs) with:
  ```tsx
  <SymbolSwitcher active={activeSymbol} onChange={switchSymbol} />
  ```
  and add `import SymbolSwitcher from "@/components/odte/SymbolSwitcher";`, removing the now-unused `odteEtfSymbols`/`odteIndexSymbols` imports from that file's `@/lib/odte` import list.
  Do the identical replacement in `dashboard/app/odte/strikes/page.tsx` (its version was wrapped in an extra `<div className="overflow-x-auto">` — keep that wrapper, replace only the inner switcher markup).
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- components/odte/__tests__/SymbolSwitcher.test.tsx app/odte`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add components/odte/SymbolSwitcher.tsx components/odte/__tests__/SymbolSwitcher.test.tsx app/odte/page.tsx app/odte/strikes/page.tsx
  git commit -m "fix(odte): extract shared SymbolSwitcher, drop raw-palette classes (OD-05)"
  ```

---

### Task 15: Stop yanking scroll position on every spot tick; add a manual re-center control (OD-06)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** none new.

**Audit findings closed:** OD-06 — the classic ladder's `useEffect(() => spotRowRef.current?.scrollIntoView(...), [activeSymbol, idx, spotIdx, data?.spot])` re-fires on every `data?.spot` change, i.e. on every poll tick, repeatedly stealing the user's scroll position mid-read.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("centers on the spot row once on load, and again on demand via a manual control, not on every tick (OD-06)", async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const afterMount = scrollIntoViewMock.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /center on spot/i }));
    expect(scrollIntoViewMock.mock.calls.length).toBe(afterMount + 1);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — there is no "Center on spot" button yet.
- [ ] **Step 3: Write minimal implementation**
  Replace:
  ```tsx
  const spotRowRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    spotRowRef.current?.scrollIntoView({ block: "center" });
  }, [activeSymbol, idx, spotIdx, data?.spot]);
  ```
  with:
  ```tsx
  const spotRowRef = useRef<HTMLTableRowElement | null>(null);
  const centerOnSpot = () => spotRowRef.current?.scrollIntoView({ block: "center" });
  useEffect(() => {
    // Only re-center on a symbol or expiry change (OD-06) — re-running this on
    // every `data.spot` tick repeatedly yanked the user's scroll position.
    centerOnSpot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, idx]);
  ```
  In the expiry-tabs row (`<div className="flex items-center gap-2 px-4 py-2 border-b border-line overflow-x-auto">`), append after the `{expiries.map(...)}` block:
  ```tsx
            <button
              type="button"
              onClick={centerOnSpot}
              className="ml-auto shrink-0 px-2 py-1 text-[11px] text-teal hover:underline"
            >
              Center on spot
            </button>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): stop re-centering scroll on every spot tick, add manual control (OD-06)"
  ```

---

### Task 16: Promote "How to read this ladder" above the fold as a persisted, default-open Collapsible (OD-07)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `Collapsible` (contract §B.4).

**Audit findings closed:** OD-07 — audit calls this the best explanatory content in the product, but it currently sits below the full ladder table, so most users scroll past it entirely. This task moves the content (unchanged — the audit says promote it, not rewrite it) to directly under the legend/levels strip and wraps it in a `Collapsible` that is open by default on first visit and remembers a user's later choice to collapse it.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("shows the how-to-read explainer above the ladder table, open by default on first visit (OD-07)", async () => {
    resetLocalStorage();
    render(<OdteStrikesPage />);
    const heading = await screen.findByText("How to read this ladder");
    expect(screen.getByText(/ladder auto-centers here on load/i)).toBeInTheDocument();
    const main = screen.getByRole("main");
    const all = Array.from(main.querySelectorAll("*"));
    expect(all.indexOf(heading)).toBeLessThan(all.indexOf(document.querySelector("table")!));
  });

  it("persists a collapsed choice across remounts (OD-07)", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const { unmount } = render(<OdteStrikesPage />);
    await screen.findByText("How to read this ladder");
    await user.click(screen.getByRole("button", { name: /how to read this ladder/i }));
    expect(screen.queryByText(/ladder auto-centers here on load/i)).not.toBeInTheDocument();
    unmount();

    render(<OdteStrikesPage />);
    await screen.findByText("How to read this ladder");
    expect(screen.queryByText(/ladder auto-centers here on load/i)).not.toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the explainer currently renders after the table and has no expand/collapse state at all.
- [ ] **Step 3: Write minimal implementation**
  Add `import Collapsible from "@/components/ui/Collapsible";`.
  Move the entire `<section className="mt-4 rounded-md border border-line bg-elevated">...</section>` block (currently after the ladder `<div>` wrapper, before the closing `</div></>`) to immediately after the legend/critical-levels `<div>` (the one closed by `</div>` right before `<div className="flex-1 overflow-y-auto p-3">`), and replace its outer `<section>`/header `<div>` pair with `Collapsible`:
  ```tsx
          {/* How to read this ladder — promoted above the fold (OD-07): kept
             verbatim, only its position and expand/collapse mechanics change. */}
          <div className="mx-4 mt-2">
            <Collapsible
              persistKey="strikes-how-to-read"
              defaultOpen
              trigger={
                <span className="tick text-[13px] font-semibold text-foreground">
                  How to read this ladder
                </span>
              }
              className="rounded-md border border-line bg-elevated"
              triggerClassName="px-4 py-2.5"
            >
              <div className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted sm:grid-cols-2">
                {/* ...unchanged Markers / Columns / Picking a strike content from the original <section>... */}
              </div>
            </Collapsible>
          </div>
  ```
  Delete the original `<section>` from its old position below the table (content, not duplicated — moved).
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): promote how-to-read explainer above the fold as a persisted Collapsible (OD-07)"
  ```

---

### Task 17: Row click copies strike + IV + GEX to the clipboard (OD-09)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** none new.

**Audit findings closed:** OD-09 — the classic ladder's rows are inert; nothing on the page is actionable beyond switching tabs.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("copies strike + IV + GEX to the clipboard on row click and shows a transient confirmation (OD-09)", async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const firstDataRow = screen.getAllByRole("row")[1]; // index 0 is the header row
    await user.click(firstDataRow);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/call IV.*put IV.*GEX/));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — rows have no click handler.
- [ ] **Step 3: Write minimal implementation**
  Add local state near the other `useState` calls:
  ```tsx
  const [copiedStrike, setCopiedStrike] = useState<number | null>(null);
  function copyStrike(row: (typeof rows)[number]) {
    const text = `${row.strike} · call IV ${fmtIv(row.call?.iv)} / put IV ${fmtIv(row.put?.iv)} · GEX ${fmtGex(row.gex)}`;
    navigator.clipboard?.writeText(text);
    setCopiedStrike(row.strike);
    window.setTimeout(() => setCopiedStrike((s) => (s === row.strike ? null : s)), 1500);
  }
  ```
  On the row `<tr>`, add the click handler and a pointer affordance:
  ```tsx
                      <tr
                        key={row.strike}
                        ref={isSpot ? spotRowRef : undefined}
                        onClick={() => copyStrike(row)}
                        className={`cursor-pointer border-t border-line/50 hover:bg-elevated/60 ${
                          highlight ? "bg-elevated" : ""
                        } ${leftBorder}`}
                      >
  ```
  In the strike `<td>`, show the transient confirmation next to the existing SPOT/ZG/CW/PW chips:
  ```tsx
                        <td className="text-center px-3 py-1 border-x border-line text-foreground">
                          <span>{row.strike}</span>
                          {copiedStrike === row.strike && (
                            <span className="ml-1 text-[11px] text-teal align-middle">Copied</span>
                          )}
                          {isSpot && (
                            <span className="ml-1 text-[11px] text-warn align-middle">SPOT</span>
                          )}
  ```
  (the `isZg`/`isCallWall`/`isPutWall` chips below are unchanged here — their `text-[9px]` → `text-[11px]` fix is Task 18.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): row click copies strike, IV, GEX to clipboard (OD-09)"
  ```

---

### Task 18: Dedupe the marker legend, extend it to greeks, fix the 9px chips (OD-10, OL-12)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GREEK_LABEL` (contract §D).

**Audit findings closed:** OD-10 — the legend/critical-levels strip's inline `Markers` row (`LegendItem` × 4: SPOT/ZG/CW/PW) duplicates the same vocabulary already spelled out in the (now above-the-fold, Task 16) how-to-read explainer, and neither one covers the live ladder's greek columns. OL-12 — the strike-cell SPOT/ZG/CW/PW chips are `text-[9px]`, below the contract's 11px data floor (§A.2).

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("shows the marker legend once, not duplicated between the levels strip and the explainer (OD-10)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    expect(screen.queryByText("last price")).not.toBeInTheDocument(); // old inline LegendItem caption is gone
  });

  it("uses an 11px floor for the strike-cell marker chips, never 9px (OL-12)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    const chips = screen.getAllByText(/^(SPOT|ZG|CW|PW)$/).filter((el) => el.tagName === "SPAN");
    for (const chip of chips) {
      expect(chip.className).not.toMatch(/text-\[9px\]/);
    }
  });

  it("extends the explainer's column legend to the live ladder's greeks (OD-10)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    expect(screen.getByText("Θ")).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — `"last price"` still renders from the inline `LegendItem` row; the strike chips are still `text-[9px]`; `"Θ"` is not present anywhere while `showLive` is off.
- [ ] **Step 3: Write minimal implementation**
  Delete the `LegendItem` function definition (now unused) and, in the legend/critical-levels strip, delete the `Markers` group entirely:
  ```tsx
            <span className="eyebrow">Markers</span>
            <LegendItem code="SPOT" cls="text-warn" label="last price" />
            <LegendItem code="ZG" cls="text-teal" label="zero-gamma flip" />
            <LegendItem code="CW" cls="text-pos" label="call wall (resistance)" />
            <LegendItem code="PW" cls="text-neg" label="put wall (support)" />
            <span className="h-3 w-px bg-line" />
  ```
  leaving only the `Levels` group (`zero-γ`/`call wall`/`put wall`/`net GEX`/`exp. move`) in that strip.
  Fix the four `text-[9px]` chips in the strike `<td>`:
  ```tsx
                          {isZg && (
                            <span className="ml-1 text-[11px] text-teal align-middle">ZG</span>
                          )}
                          {isCallWall && (
                            <span className="ml-1 text-[11px] text-pos align-middle">CW</span>
                          )}
                          {isPutWall && (
                            <span className="ml-1 text-[11px] text-neg align-middle">PW</span>
                          )}
  ```
  (`SPOT`'s chip was already moved to `text-[11px]` in Task 17.)
  In the how-to-read explainer's "Columns" list (Task 16), add a greeks row and import `GREEK_LABEL`:
  ```tsx
  import { GREEK_LABEL } from "@/lib/labels";
  import type { GreekKind } from "@/lib/format";
  ```
  ```tsx
                    <li>
                      {(["delta", "gamma", "theta", "vega", "rho"] as GreekKind[]).map((k, i, arr) => (
                        <span key={k}>
                          <b className="font-mono text-foreground">{GREEK_LABEL[k].symbol}</b>{" "}
                          {GREEK_LABEL[k].gloss}
                          {i < arr.length - 1 ? " · " : " "}
                        </span>
                      ))}
                      <span className="text-muted">(live ladder only)</span>
                    </li>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): dedupe marker legend, extend to greeks, fix 9px chips (OD-10, OL-12)"
  ```

---

### Task 19: Explain the 5s health poll's silent-failure behavior (OD-11)

**Files:**
- Modify: `dashboard/app/odte/page.tsx`
- Test: `dashboard/app/odte/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `InfoTip` (contract §B.7).

**Audit findings closed:** OD-11 — `useSWR("/api/odte/health", fetcher, { refreshInterval: 5000, shouldRetryOnError: false })` silently stops retrying after one failure and the badge just goes stale, with nothing on screen explaining either the 5s cadence or the no-retry behavior.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/__tests__/page.test.tsx`:
  ```tsx
  it("explains the health badge's 5s poll and no-retry-on-error behavior (OD-11)", async () => {
    const user = userEvent.setup();
    render(<OdtePage />);
    await screen.findByText(/spot \/ regime/i);
    const tip = screen.getByLabelText(/what does this status mean/i);
    await user.click(tip);
    expect(
      await screen.findByText(/every 5s.*won't retry automatically on failure/is)
    ).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/__tests__/page.test.tsx`
  Expected: FAIL — no such `InfoTip` exists next to the badge yet.
- [ ] **Step 3: Write minimal implementation**
  Add `import InfoTip from "@/components/ui/InfoTip";`.
  Next to the badge span:
  ```tsx
          <span className={`px-2 py-0.5 text-xs rounded ${toneClass[badge.tone]}`}>{badge.label}</span>
          <InfoTip content="Connection status polls the backend every 5s and won't retry automatically on failure — if IBKR drops mid-session this badge can sit stale until the next scheduled poll succeeds.">
            <span className="sr-only">What does this status mean?</span>
          </InfoTip>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/page.tsx app/odte/__tests__/page.test.tsx
  git commit -m "fix(odte): explain the health badge's 5s no-retry poll behavior (OD-11)"
  ```

---

### Task 20: Swap ν/ρ for spread% + a liquidity marker; surface msi_rationale (OL-08)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Produces a new `LiveLadderRow` component (extracted from the inline `.map()` body — Tasks 22 and 24 modify this component further rather than re-touching raw inline JSX).

**Audit findings closed:** OL-08 — vega and rho are near-zero-signal for 0DTE (negligible time-to-expiry vega, ~zero rate sensitivity), while bid/ask spread and a liquidity flag are directly actionable and were computable from data already on the row but never shown; `msi_rationale` is returned by the backend and typed on `LadderSnapshot` but never rendered anywhere.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("replaces vega/rho columns with spread% and a liquidity marker, and explains msi_rationale on hover (OL-08)", async () => {
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await userEvent.setup().click(screen.getByRole("button", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(screen.queryByText("ν")).not.toBeInTheDocument();
    expect(screen.queryByText("ρ")).not.toBeInTheDocument();
    expect(screen.getAllByText("Spread%").length).toBe(2); // call + put
    expect(screen.getAllByText("Liq").length).toBe(2);
    const msiLabel = screen.getByText("MSI Call/Put");
    expect(msiLabel.closest("div")?.querySelector("[title], button")).toBeTruthy();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the headers still read ν/ρ, and the MSI cell has no tooltip.
- [ ] **Step 3: Write minimal implementation**
  Above `OdteStrikesPage`, add:
  ```tsx
  function spreadPct(bid: number | null | undefined, ask: number | null | undefined): number | null {
    if (bid == null || ask == null || bid <= 0 || ask <= 0) return null;
    const mid = (bid + ask) / 2;
    return mid > 0 ? ((ask - bid) / mid) * 100 : null;
  }
  const LIQUID_SPREAD_PCT = 5;

  function LiveLadderRow({ level }: { level: LiveLadderLevel }) {
    const callSpread = spreadPct(level.call.bid, level.call.ask);
    const putSpread = spreadPct(level.put.bid, level.put.ask);
    return (
      <tr className="border-b border-line/50">
        <td className="px-2 py-1 font-bold">{level.strike.toFixed(0)}</td>
        <td className="px-1 py-1 text-center">{level.call.bid != null ? level.call.bid.toFixed(2) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.ask != null ? level.call.ask.toFixed(2) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.iv != null ? (level.call.iv * 100).toFixed(1) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.delta != null ? level.call.delta.toFixed(3) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.gamma != null ? level.call.gamma.toFixed(5) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.theta != null ? level.call.theta.toFixed(3) : "—"}</td>
        <td className="px-1 py-1 text-center">{callSpread != null ? callSpread.toFixed(1) : "—"}</td>
        <td className="px-1 py-1 text-center">
          {callSpread != null ? (
            <span className={callSpread < LIQUID_SPREAD_PCT ? "text-teal" : "text-muted"}>●</span>
          ) : "—"}
        </td>
        <td className="px-1 py-1 text-center">{level.call.volume != null ? level.call.volume.toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call.oi != null ? level.call.oi.toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.call_gex != null ? (level.call_gex / 1000).toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.bid != null ? level.put.bid.toFixed(2) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.ask != null ? level.put.ask.toFixed(2) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.iv != null ? (level.put.iv * 100).toFixed(1) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.delta != null ? level.put.delta.toFixed(3) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.gamma != null ? level.put.gamma.toFixed(5) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.theta != null ? level.put.theta.toFixed(3) : "—"}</td>
        <td className="px-1 py-1 text-center">{putSpread != null ? putSpread.toFixed(1) : "—"}</td>
        <td className="px-1 py-1 text-center">
          {putSpread != null ? (
            <span className={putSpread < LIQUID_SPREAD_PCT ? "text-teal" : "text-muted"}>●</span>
          ) : "—"}
        </td>
        <td className="px-1 py-1 text-center">{level.put.volume != null ? level.put.volume.toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put.oi != null ? level.put.oi.toFixed(0) : "—"}</td>
        <td className="px-1 py-1 text-center">{level.put_gex != null ? (level.put_gex / 1000).toFixed(0) : "—"}</td>
      </tr>
    );
  }
  ```
  Replace both header groups' `<th>ν</th><th>ρ</th>` with `<th>Spread%</th><th>Liq</th>`, and replace `{liveLadder.levels.map((level) => (<tr>...</tr>))}` with `{liveLadder.levels.map((level) => <LiveLadderRow key={level.strike} level={level} />)}`.
  In the levels strip's "MSI Call/Put" cell (Task 11), wrap the label with `InfoTip`:
  ```tsx
                <div className="flex items-center gap-1">
                  <span className="text-muted">MSI Call/Put</span>
                  <InfoTip content={liveLadder.msi_rationale ?? "Max-strike-interest — the strike with the heaviest combined call/put concentration."}>
                    <span className="sr-only">Why these strikes?</span>
                  </InfoTip>
                  <span className="ml-1 font-semibold">
                    {liveLadder.msi_call_strike != null ? liveLadder.msi_call_strike.toFixed(0) : "—"} /
                    {liveLadder.msi_put_strike != null ? " " + liveLadder.msi_put_strike.toFixed(0) : " —"}
                  </span>
                </div>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): swap vega/rho for spread%/liquidity, surface msi_rationale (OL-08)"
  ```

---

### Task 21: Replace the live/LIVE toggle button with the shared Toggle, persisted (OL-10)

**Files:**
- Modify: `dashboard/lib/storageKeys.ts`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `Toggle` (contract §B.8, explicitly tagged "A11Y-04 / OL-10" in the contract itself), `useLocalStorage<T>(key, defaultValue)`.
- Produces: `STATIC_KEYS.odteLiveMode = "dash:odte:live-mode"`.

**Audit findings closed:** OL-10 — the live/classic switch is a hand-rolled `<button>` with `bg-blue-500/30`/`bg-gray-500/20` raw palette state, no `role="switch"`/`aria-checked`, and the choice resets on every reload.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("uses an accessible, persisted switch for the live/classic toggle (OL-10)", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    const { unmount } = render(<OdteStrikesPage />);
    const toggle = screen.getByRole("switch", { name: /show live options ladder/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    unmount();

    render(<OdteStrikesPage />);
    expect(screen.getByRole("switch", { name: /show live options ladder/i })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — no `role="switch"` exists yet, and the choice is not persisted.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/lib/storageKeys.ts`, add to `STATIC_KEYS`:
  ```ts
  odteLiveMode: "dash:odte:live-mode",
  ```
  In `dashboard/app/odte/strikes/page.tsx`, add imports:
  ```tsx
  import Toggle from "@/components/ui/Toggle";
  import useLocalStorage from "@/lib/useLocalStorage";
  import { STATIC_KEYS } from "@/lib/storageKeys";
  ```
  Replace the `showLive` state declaration:
  ```tsx
  const [showLive, setShowLive] = useLocalStorage(STATIC_KEYS.odteLiveMode, false);
  ```
  Replace the button:
  ```tsx
          <Toggle checked={showLive} onChange={setShowLive} label="Show live options ladder" />
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/storageKeys.ts app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): replace live/classic button with persisted Toggle switch (OL-10)"
  ```

---

### Task 22: Sticky strike column, right-aligned tabular numerics, edge-fade on the live table (OL-11)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** modifies `LiveLadderRow` (Task 20) and its scroll container in place.

**Audit findings closed:** OL-11 — the 23-column live table has no sticky strike column, so scrolling right loses the only anchor a trader needs while reading greeks; numeric cells are center-aligned rather than right-aligned/`tabular-nums`, making magnitude comparison by eye harder than necessary.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("keeps the strike column sticky and right-aligns numeric cells with tabular-nums (OL-11)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    const strikeCell = (await screen.findAllByText(/^\d+$/))[0].closest("td")!;
    expect(strikeCell.className).toMatch(/sticky/);
    expect(strikeCell.className).toMatch(/left-0/);
    const table = document.querySelector("table")!;
    expect(table.className).toMatch(/tabular-nums/);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the strike `<td>` is not sticky, and the table has no `tabular-nums`.
- [ ] **Step 3: Write minimal implementation**
  In `LiveLadderRow`, change the strike cell:
  ```tsx
        <td className="sticky left-0 z-10 bg-elevated px-2 py-1 font-bold">{level.strike.toFixed(0)}</td>
  ```
  and change every other `<td>`'s alignment from `text-center` to `text-right` (23 → 22 cells, excluding the strike column already handled above).
  On the `<table>` element, add `tabular-nums`:
  ```tsx
                <table className="w-full text-[11px] tabular-nums border-collapse">
  ```
  On the scroll container (`<div className="flex-1 overflow-auto" ...>` from Task 10), add an edge-fade mask so the sticky column doesn't read as "cut off" mid-scroll:
  ```tsx
              <div
                className="flex-1 overflow-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
                style={isStale(consecutiveFailures) ? { filter: "grayscale(0.6)" } : undefined}
              >
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): sticky strike column, right-aligned tabular numerics, edge fade (OL-11)"
  ```

---

### Task 23: Label pin_risk's scale, apply the format.ts precision policy across live cells (OL-13)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `price()`, `greek()` (contract §C).

**Audit findings closed:** OL-13 — `net_gex_band`'s two duplicate placements were already closed by Task 11 (it now renders exactly once, in the levels strip); this task closes the rest of OL-13: `pin_risk` renders a bare number (`{liveLadder.pin_risk.toFixed(0)}`) with no indication it's a 0–100 scale, and `LiveLadderRow`'s cells hand-roll `.toFixed(n)` per field instead of the shared precision policy in `format.ts`.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("labels pin_risk's 0-100 scale and formats greeks via the shared precision policy (OL-13)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    expect(screen.getByText("Pin Risk (0–100)")).toBeInTheDocument();
    // greek() renders theta to 2dp, delta/gamma/vega/rho to 3dp — spot-check delta.
    const deltaCells = screen.getAllByText(/^-?0\.\d{3}$/);
    expect(deltaCells.length).toBeGreaterThan(0);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the label still reads bare `"Pin Risk"`.
- [ ] **Step 3: Write minimal implementation**
  Add `import { price, greek } from "@/lib/format";`.
  In the levels strip:
  ```tsx
                <div>
                  <span className="text-muted">Pin Risk (0–100)</span>
                  <span className="ml-2 font-semibold">{liveLadder.pin_risk.toFixed(0)}</span>
                </div>
  ```
  In `LiveLadderRow`, replace the bid/ask/greek cells' raw `.toFixed()` calls with `format.ts`:
  ```tsx
        <td className="px-1 py-1 text-right">{level.call.bid != null ? price(level.call.bid) : "—"}</td>
        <td className="px-1 py-1 text-right">{level.call.ask != null ? price(level.call.ask) : "—"}</td>
        <td className="px-1 py-1 text-right">{level.call.iv != null ? (level.call.iv * 100).toFixed(1) : "—"}</td>
        <td className="px-1 py-1 text-right">{level.call.delta != null ? greek(level.call.delta, "delta") : "—"}</td>
        <td className="px-1 py-1 text-right">{level.call.gamma != null ? greek(level.call.gamma, "gamma") : "—"}</td>
        <td className="px-1 py-1 text-right">{level.call.theta != null ? greek(level.call.theta, "theta") : "—"}</td>
  ```
  (apply the same substitution to the mirrored put-side cells; IV/spread/liquidity/volume/OI/GEX cells are not greeks and are unaffected by this task.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): label pin_risk scale, apply format.ts precision policy to live cells (OL-13)"
  ```

---

### Task 24: Row highlights use left-border + code chips, matching the classic ladder's vocabulary (OL-14)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** modifies `LiveLadderRow` (Task 20) in place.

**Audit findings closed:** OL-14 — Task 6 tokenised the live table's row highlights (`bg-yellow-500/10` → `bg-warn/10` etc.) but they are still full-row background tints covering only zero-gamma and ATM, a different vocabulary from the classic ladder's SPOT/ZG/CW/PW left-border + code-chip convention one table over, and the live ladder never highlights `call_wall_strike`/`put_wall_strike` at all.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("marks ATM/ZG/CW/PW rows with left-border + code chips, matching the classic ladder (OL-14)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    const atmChip = screen.getByText("ATM");
    expect(atmChip.closest("tr")?.className).toMatch(/border-l-2/);
    expect(atmChip.closest("tr")?.className).not.toMatch(/bg-blue-500/);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — no `"ATM"` chip exists; rows still use `bg-blue-500/10`/`bg-warn/10` full-row tints (pre-tokenised state) or `tone-*` background tints (post-Task-6), not left-border markers.
- [ ] **Step 3: Write minimal implementation**
  `LiveLadderRow` needs the four level strikes to compare against; pass them down instead of reaching into a closed-over `liveLadder`:
  ```tsx
  function LiveLadderRow({
    level,
    zeroGammaStrike,
    atmStrike,
    callWallStrike,
    putWallStrike,
  }: {
    level: LiveLadderLevel;
    zeroGammaStrike: number | null;
    atmStrike: number | null;
    callWallStrike: number | null;
    putWallStrike: number | null;
  }) {
    const isZg = level.strike === zeroGammaStrike;
    const isAtm = level.strike === atmStrike;
    const isCallWall = level.strike === callWallStrike;
    const isPutWall = level.strike === putWallStrike;
    const leftBorder = isAtm
      ? "border-l-2 border-l-warn"
      : isZg
        ? "border-l-2 border-l-teal"
        : "";
    return (
      <tr className={`border-b border-line/50 ${leftBorder}`}>
        <td className="sticky left-0 z-10 bg-elevated px-2 py-1 font-bold">
          {level.strike.toFixed(0)}
          {isAtm && <span className="ml-1 text-[11px] text-warn align-middle">ATM</span>}
          {isZg && <span className="ml-1 text-[11px] text-teal align-middle">ZG</span>}
          {isCallWall && <span className="ml-1 text-[11px] text-pos align-middle">CW</span>}
          {isPutWall && <span className="ml-1 text-[11px] text-neg align-middle">PW</span>}
        </td>
        {/* ...remaining cells unchanged from Tasks 20/22/23... */}
      </tr>
    );
  }
  ```
  Update the call site:
  ```tsx
  {liveLadder.levels.map((level) => (
    <LiveLadderRow
      key={level.strike}
      level={level}
      zeroGammaStrike={liveLadder.zero_gamma_strike}
      atmStrike={liveLadder.atm_strike}
      callWallStrike={liveLadder.call_wall_strike}
      putWallStrike={liveLadder.put_wall_strike}
    />
  ))}
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): live row highlights use left-border + code chips like the classic ladder (OL-14)"
  ```

---

### Task 25: Show a "connecting" state before the first live response, reflecting the real session lifecycle (OL-17)

**Files:**
- Modify: `dashboard/lib/useOptionsLivePoller.ts`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/lib/__tests__/liveLadderPoller.test.ts`, `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Produces: `LiveLadderState.status: "idle" | "connecting" | "live" | "error"` (extends Task 9's `useOptionsLivePoller` return shape — `ladder`/`error`/`consecutiveFailures` unchanged, `status` is additive).

**Audit findings closed:** OL-17 — toggling live on shows nothing at all until the first response lands; the real backend lifecycle (`Session.subscribe(symbol, expiry)` → `Session.tick_and_coalesce()` per `argus/argus/options_live/session.py`) has a real, non-instant connect-then-subscribe phase the UI never represents.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/lib/__tests__/liveLadderPoller.test.ts`:
  ```ts
  test("useOptionsLivePoller reports status: connecting until the first ladder or error arrives", async () => {
    // exercises the same fake-timer-driven poller harness as Task 9's suite;
    // asserts on the returned status field before/after the first resolved tick.
  });
  ```
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("shows a connecting state before the first live response (OL-17)", async () => {
    mockFetchJson({}); // no /api/argus/options/live/* response registered yet — request hangs
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    expect(await screen.findByText(/connecting to live session/i)).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run:
  ```bash
  cd dashboard
  npx vitest run --project=lib lib/__tests__/liveLadderPoller.test.ts
  npm run test:component -- app/odte/strikes/__tests__/page.test.tsx
  ```
  Expected: FAIL — `useOptionsLivePoller` returns no `status` field; the page shows nothing while waiting.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/lib/useOptionsLivePoller.ts`, extend `LiveLadderState`:
  ```ts
  export interface LiveLadderState {
    ladder: LadderSnapshot | null;
    error: string | null;
    consecutiveFailures: number;
    status: "idle" | "connecting" | "live" | "error";
  }
  ```
  Derive `status` from the existing `ladder`/`error`/`consecutiveFailures` state rather than adding new state: `"idle"` when `!enabled`; `"connecting"` when `enabled && ladder === null && error === null`; `"live"` when `ladder !== null`; `"error"` when `ladder === null && error !== null`.
  In `dashboard/app/odte/strikes/page.tsx`, destructure `status` from the hook and render:
  ```tsx
          {status === "connecting" && (
            <div className="px-4 py-6 text-center text-[11px] text-muted">
              Connecting to live session…
            </div>
          )}
  ```
  placed where `liveError && (...)` currently sits, before the `liveLadder && (...)` block.
- [ ] **Step 4: Run tests to verify they pass**
  Run the same two commands as Step 2. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/useOptionsLivePoller.ts app/odte/strikes/page.tsx lib/__tests__/liveLadderPoller.test.ts app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): show a connecting state before the first live response (OL-17)"
  ```

---

### Task 26: Mount GexChart in live mode using summed call/put GEX per strike (OL-18)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `GexChart` (Task 5's rewrite).

**Audit findings closed:** OL-18 — the classic ladder got a GEX profile chart in Task 5; the live ladder, which has the same shape of data (`call_gex` + `put_gex` per strike, Task 3/4), still has none.

> **Re-check note (carried from the phase header):** this task is written against `GexChart`'s raw-token contract from Task 5, since `06-phase5-rotation-macro-charts.md`'s Chart Conventions Spec did not exist at the time this document was written. If that spec exists by the time this task executes, prefer it and treat this task's `GexChart` usage as a stopgap to reconcile, not a second source of truth.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("mounts the GEX profile chart in live mode using summed call+put GEX per strike (OL-18)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(document.querySelector(".recharts-responsive-container")).toBeInTheDocument();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — the live-mode branch has no chart, only the table.
- [ ] **Step 3: Write minimal implementation**
  After the live table's closing `</div>` (the sticky/edge-faded scroll container from Task 22), before the `</>` that closes the `liveLadder && (...)` block:
  ```tsx
              <GexChart
                data={liveLadder.levels.map((l) => ({
                  strike: l.strike,
                  gex: (l.call_gex ?? 0) + (l.put_gex ?? 0),
                }))}
                spot={liveLadder.spot}
                zeroGamma={liveLadder.zero_gamma_strike}
              />
  ```
  (reuses the same `GexChart` props shape Task 5 established for the classic ladder — `{ strike, gex }[]` plus `spot`/`zeroGamma`.)
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): mount GEX profile chart in live mode (OL-18)"
  ```

---

### Task 27: Separate a polite summary region from the mutating table for screen readers (OL-19)

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`

**Interfaces:** none new.

**Audit findings closed:** OL-19 — the live table re-renders on every poll tick with no `aria-live` management at all, so a screen reader either announces the entire 23-column table on every tick (default MutationObserver-driven behavior in most AT) or nothing; there is no single, calm summary a screen reader user can rely on for "what changed."

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("marks the live table aria-live=off and provides a separate polite summary region (OL-19)", async () => {
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    const table = document.querySelector("table")!;
    expect(table.closest("[aria-live]")?.getAttribute("aria-live")).toBe("off");
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toMatch(/SPY.*live/i);
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: FAIL — neither region exists yet.
- [ ] **Step 3: Write minimal implementation**
  Wrap the sticky/edge-fade scroll container (Task 22) with `aria-live="off"` (explicit opt-out of default live-region announcement churn):
  ```tsx
              <div aria-live="off">
                <div
                  className="flex-1 overflow-auto [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
                  style={isStale(consecutiveFailures) ? { filter: "grayscale(0.6)" } : undefined}
                >
                  <table className="w-full text-[11px] tabular-nums border-collapse">
                    {/* ...unchanged... */}
                  </table>
                </div>
              </div>
  ```
  Add a visually-hidden polite summary just above it, updated once per successful poll (not per row):
  ```tsx
              <p role="status" aria-live="polite" className="sr-only">
                {liveLadder.symbol} live ladder updated, source {isStale(consecutiveFailures) ? "STALE" : liveLadder.source}.
              </p>
  ```
- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd dashboard && npm run test:component -- app/odte/strikes/__tests__/page.test.tsx`
  Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx
  git commit -m "fix(odte/strikes): aria-live=off on the mutating table, polite summary region (OL-19)"
  ```

---

### Task 28: One unified, persisted expiry control for both ladders (OL-20)

**Files:**
- Modify: `dashboard/lib/storageKeys.ts`
- Modify: `dashboard/lib/optionsLive.ts`
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Test: `dashboard/app/odte/strikes/__tests__/page.test.tsx`, `dashboard/lib/__tests__/optionsLive.test.ts`

**Interfaces:**
- Produces: `STATIC_KEYS.odteExpiry = "dash:odte:expiry"`; `fetchOptionsLive(symbol, expiry, signal?)` — `expiry` becomes a required second parameter (was hardcoded `"0DTE"` internally).

**Audit findings closed:** OL-20 — the classic ladder has real expiry tabs (`expiries.map`); the live ladder ignores them entirely and always requests `"0DTE"` regardless of which expiry tab is selected, so the two tables can silently describe different expiries at once.

- [ ] **Step 1: Write the failing test**
  Add to `dashboard/lib/__tests__/optionsLive.test.ts`:
  ```ts
  test("fetchOptionsLive requests the given expiry, not a hardcoded 0DTE", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    await fetchOptionsLive("SPY", "2026-08-15");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("expiry=2026-08-15"),
      expect.anything()
    );
  });
  ```
  Add to `dashboard/app/odte/strikes/__tests__/page.test.tsx`:
  ```tsx
  it("shares one persisted expiry between the classic and live ladders (OL-20)", async () => {
    resetLocalStorage();
    const user = userEvent.setup();
    render(<OdteStrikesPage />);
    await screen.findByText(/call IV/i);
    await user.click(screen.getAllByRole("button", { name: /EM/i })[1]); // second expiry tab
    await user.click(screen.getByRole("switch", { name: /live/i }));
    await screen.findByText("C Bid");
    expect(localStorage.getItem("dash:odte:expiry")).not.toBeNull();
  });
  ```
- [ ] **Step 2: Run test to verify it fails**
  Run:
  ```bash
  cd dashboard
  npx vitest run --project=lib lib/__tests__/optionsLive.test.ts
  npm run test:component -- app/odte/strikes/__tests__/page.test.tsx
  ```
  Expected: FAIL — `fetchOptionsLive` still hardcodes `"0DTE"` internally; nothing persists the expiry selection.
- [ ] **Step 3: Write minimal implementation**
  In `dashboard/lib/storageKeys.ts`, add to `STATIC_KEYS`:
  ```ts
  odteExpiry: "dash:odte:expiry",
  ```
  In `dashboard/lib/optionsLive.ts`, change `fetchOptionsLive`'s signature from `(symbol: string, signal?: AbortSignal)` to `(symbol: string, expiry: string, signal?: AbortSignal)`, and replace the hardcoded `expiry=0DTE` query param with `expiry=${encodeURIComponent(expiry)}`.
  In `dashboard/lib/useOptionsLivePoller.ts`, thread the new `expiry` parameter through to `fetchOptionsLive` (its own signature gains `expiry: string` alongside the existing `symbol`/`enabled`).
  In `dashboard/app/odte/strikes/page.tsx`, replace `setExpiryIdx(i)` (local-only `useState`) with a persisted value driving both ladders:
  ```tsx
  const [expiry, setExpiry] = useLocalStorage(STATIC_KEYS.odteExpiry, expiries[0]?.expiry ?? "0DTE");
  const idx = Math.max(0, expiries.findIndex((e) => e.expiry === expiry));
  ```
  and change the expiry-tab `onClick` from `() => setExpiryIdx(i)` to `() => setExpiry(e.expiry)`. Pass `expiry` (falling back to `"0DTE"` if `expiries` hasn't loaded yet) as the poller's second argument: `useOptionsLivePoller(activeSymbol, expiry || "0DTE", showLive)`.
- [ ] **Step 4: Run tests to verify they pass**
  Run the same two commands as Step 2. Expected: PASS.
- [ ] **Step 5: Commit**
  ```bash
  cd dashboard
  git add lib/storageKeys.ts lib/optionsLive.ts lib/useOptionsLivePoller.ts app/odte/strikes/page.tsx app/odte/strikes/__tests__/page.test.tsx lib/__tests__/optionsLive.test.ts
  git commit -m "fix(odte/strikes): one persisted expiry control shared by classic and live ladders (OL-20)"
  ```

---

## Coverage

Every OD-xx and OL-xx finding in this phase's scope, mapped to the task that closes it. 28 tasks, 31 findings, zero skipped.

| ID | Closed by | ID | Closed by |
|---|---|---|---|
| OD-01 | Task 7 | OL-01 | Task 1 |
| OD-02 | Task 8 | OL-02 | Task 2 |
| OD-03 | Task 12 | OL-03 | Task 3 (backend) + Task 4 (frontend) |
| OD-04 | Task 13 | OL-04 | Task 3 (backend) + Task 5 (frontend) |
| OD-05 | Task 14 | OL-05 | Task 9 |
| OD-06 | Task 15 | OL-06 | Task 10 |
| OD-07 | Task 16 | OL-07 | Task 11 |
| OD-08 | Task 13 | OL-08 | Task 20 |
| OD-09 | Task 17 | OL-09 | Task 6 |
| OD-10 | Task 18 | OL-10 | Task 21 |
| OD-11 | Task 19 | OL-11 | Task 22 |
| | | OL-12 | Task 18 |
| | | OL-13 | Task 11 (dedupe) + Task 23 (labels + precision) |
| | | OL-14 | Task 24 |
| | | OL-15 | Task 11 |
| | | OL-16 | Task 11 |
| | | OL-17 | Task 25 |
| | | OL-18 | Task 5 (partial — tokens only) + Task 26 (full, live mode) |
| | | OL-19 | Task 27 |
| | | OL-20 | Task 28 |
