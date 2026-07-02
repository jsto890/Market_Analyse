# WS-5 SP2a — ETF Multi-Underlying Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the `/odte` hub switch its active underlying between SPY, QQQ, IWM, DIA in-process (one symbol at a time), built upstream in `~/OptionsAnalysis` first, then re-vendored into `odte/` with a dashboard selector.

**Architecture:** Upstream backend gains `SWITCHABLE_SYMBOLS`, `POST /control/symbol` (teardown + state reset; the existing ingest loop re-bootstraps the new symbol), and `symbol` in `/health`. `odte/` is then re-vendored from the new upstream hash. The dashboard adds a `/api/odte/symbol` proxy and a segmented 4-button selector on `/odte`; the vendored frontend is symbol-agnostic and needs zero changes.

**Tech Stack:** FastAPI + ib_insync + pytest (upstream); Next.js + SWR + vitest + Playwright smoke script (dashboard); `git archive` + rsync (vendoring).

**Spec:** [../specs/2026-06-30-ws5-sp2a-etf-multi-underlying-design.md](../specs/2026-06-30-ws5-sp2a-etf-multi-underlying-design.md)

## Global Constraints

- Two repos. Tasks 1–3 run in `/Users/josephstorey/OptionsAnalysis` (branch `ws5-sp2a-symbol-switch` off `main`). Tasks 4–8 run in `/Users/josephstorey/Market_Analyse` (branch `ws5-sp2a-etf-multi-underlying` off `main`, which is at `a83eb23`).
- In Market_Analyse, `sentiment_bridge.py` (modified) and `scripts/com.argus.calendar.plist` (untracked) are unrelated WIP. NEVER stage, commit, or revert them. Always `git add` explicit paths — never `git add -A` or `git add .`.
- The Market_Analyse branch `ws4-validation-robust` is a separate in-flight workstream. Do not touch it, rebase it, or base work on it.
- `odte/` is an opaque vendor mirror. It changes ONLY via the Task 4 re-vendor. Never hand-edit files under `odte/`.
- The re-vendor must exclude `CLAUDE.md`, `VENDOR.md`, `frontend/dist`, `frontend/node_modules`, `backend/.venv`, `__pycache__`, `.pytest_cache`. `frontend/dist` is gitignored upstream; SP1's committed dist is retained because SP2a changes no frontend source.
- The symbol allow-list is exactly `["SPY", "QQQ", "IWM", "DIA"]` — verbatim, in this order — in both backend `SWITCHABLE_SYMBOLS` and dashboard `odteSymbols`.
- Boot default stays `QQQ`. No persistence of the selected symbol (service restart returns to QQQ).
- Dashboard tests: vitest, node environment, pure-lib only. NO @testing-library, no component or route tests. The vendored app's tests stay in `odte/` and are not wired into the dashboard suite.
- 0DTE service: `127.0.0.1:8788`, launchd label `com.argus.odte`.
- Commits: concise imperative subject; end the body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- IBKR Gateway is down: the live end-to-end ladder swap is NOT verifiable in this cycle. Acceptance evidence = fake-connector pytest + the Task 4 offline contract smoke (spec caveat).

---

### Task 1: Upstream — `/health` reports the current symbol

**Files:**
- Modify: `/Users/josephstorey/OptionsAnalysis/backend/app/schemas.py` (HealthResponse, line ~186)
- Modify: `/Users/josephstorey/OptionsAnalysis/backend/app/main.py` (health handler, line ~235)
- Test: `/Users/josephstorey/OptionsAnalysis/backend/tests/test_backend_runtime.py`

**Interfaces:**
- Consumes: `MarketDataRuntime.symbol` (exists, defaults `"QQQ"`), `_make_app(tmp_path)` test helper (exists).
- Produces: `HealthResponse.symbol: str` — `/health` JSON gains `"symbol": "<current>"`. Task 2 asserts it after a switch; Task 7's dashboard reads it via the health proxy.

- [ ] **Step 1: Branch + venv setup (one-time)**

```bash
cd /Users/josephstorey/OptionsAnalysis
git checkout -b ws5-sp2a-symbol-switch
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/ -q
```

Expected: all existing tests pass (baseline green). `.venv/` is already gitignored. If the baseline fails, STOP and report — do not proceed on a red baseline.

- [ ] **Step 2: Write the failing test**

Append to `backend/tests/test_backend_runtime.py`:

```python
def test_health_reports_current_symbol(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["symbol"] == "QQQ"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_backend_runtime.py::test_health_reports_current_symbol -v`
Expected: FAIL with `KeyError: 'symbol'` (the response_model strips fields not in the schema).

- [ ] **Step 4: Implement**

In `backend/app/schemas.py`, change `HealthResponse` to:

```python
class HealthResponse(BaseModel):
    ok: bool
    server_ts_ms: int
    ibkr_connected: bool
    subscriptions: int
    symbol: str = "QQQ"
```

In `backend/app/main.py`, change the `/health` handler body to:

```python
    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(
            ok=True,
            server_ts_ms=now_ms(),
            ibkr_connected=app.state.connector.is_connected() if app.state.connector else False,
            subscriptions=_subscription_count(app),
            symbol=app.state.market_data.symbol,
        )
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_backend_runtime.py -v`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
cd /Users/josephstorey/OptionsAnalysis
git add backend/app/schemas.py backend/app/main.py backend/tests/test_backend_runtime.py
git commit -m "Add current symbol to /health"
```

---

### Task 2: Upstream — symbol switch (`SWITCHABLE_SYMBOLS`, `_switch_symbol`, `POST /control/symbol`)

**Files:**
- Modify: `/Users/josephstorey/OptionsAnalysis/backend/app/main.py`
- Modify: `/Users/josephstorey/OptionsAnalysis/backend/app/schemas.py`
- Test: `/Users/josephstorey/OptionsAnalysis/backend/tests/test_backend_runtime.py`

**Interfaces:**
- Consumes: `_set_active_window(app, target_strikes, reason)` (exists, main.py ~line 625 — calling with `[]` cancels all option subscriptions and rebuilds rows to empty); `RuntimeStore.update_underlying_spot(spot)`; `UnderlyingSpot` (already imported in main.py); `HealthResponse.symbol` from Task 1.
- Produces: module constant `SWITCHABLE_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA"]`; `POST /control/symbol` with body `{"symbol": "SPY"}` → 200 `{"symbol": "SPY"}` (200 no-op on same symbol, 400 on unknown); `MarketDataRuntime.switch_inflight: bool`; `SymbolUpdate` pydantic model. Task 4 smoke-tests this contract over HTTP; Task 6's proxy forwards to it.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_backend_runtime.py`, add to the imports at the top:

```python
from types import SimpleNamespace
```

Change `DummyConnector` to record cancels (add the `cancelled` list and the `cancel_market_data` method; the rest is unchanged):

```python
class DummyConnector:
    def __init__(self, connected: bool = True, subscriptions: int = 0):
        self._connected = connected
        self.ib = DummyIB(subscriptions=subscriptions)
        self.cancelled: list = []

    async def connect(self, paper: bool = True) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    def cancel_market_data(self, contract) -> None:
        self.cancelled.append(contract)
```

Append the seeding helper and three tests:

```python
def _seed_market(app):
    market = app.state.market_data
    call = SimpleNamespace(
        conId=1, symbol="QQQ", lastTradeDateOrContractMonth="20260630", right="C", strike=430.0
    )
    put = SimpleNamespace(
        conId=2, symbol="QQQ", lastTradeDateOrContractMonth="20260630", right="P", strike=430.0
    )
    market.underlying_ticker = SimpleNamespace(contract=SimpleNamespace(conId=3, symbol="QQQ"))
    market.expiry = "20260630"
    market.market_ready = True
    market.option_contracts_by_strike = {430.0: {"C": call, "P": put}}
    market.all_strikes = [430.0]
    market.active_window_strikes = [430.0]


def test_control_symbol_rejects_unknown_symbol(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/control/symbol", json={"symbol": "TSLA"})
        assert response.status_code == 400
        assert app.state.market_data.symbol == "QQQ"
        assert app.state.store.snapshot.underlying.symbol == "QQQ"
        assert app.state.connector.cancelled == []


def test_control_symbol_switch_resets_runtime_and_snapshot(tmp_path):
    app = _make_app(tmp_path, seed_rows=True)
    with TestClient(app) as client:
        _seed_market(app)
        response = client.post("/control/symbol", json={"symbol": "SPY"})
        assert response.status_code == 200
        assert response.json() == {"symbol": "SPY"}

        market = app.state.market_data
        assert market.symbol == "SPY"
        assert market.market_ready is False
        assert market.underlying_ticker is None
        assert market.expiry == ""
        assert market.option_contracts_by_strike == {}
        assert market.all_strikes == []
        assert market.active_window_strikes == []
        assert market.contract_by_id == {}
        assert market.ticker_by_id == {}

        snapshot = app.state.store.snapshot
        assert snapshot.underlying.symbol == "SPY"
        assert snapshot.underlying.expiry == ""
        assert snapshot.rows == []
        assert snapshot.underlying.spot.mid is None

        # call + put option cancels from window teardown, plus the underlying
        assert len(app.state.connector.cancelled) == 3

        assert client.get("/health").json()["symbol"] == "SPY"


def test_control_symbol_same_symbol_is_noop(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        _seed_market(app)
        response = client.post("/control/symbol", json={"symbol": "QQQ"})
        assert response.status_code == 200
        assert response.json() == {"symbol": "QQQ"}
        assert app.state.market_data.market_ready is True
        assert app.state.market_data.underlying_ticker is not None
        assert app.state.connector.cancelled == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_backend_runtime.py -k control_symbol -v`
Expected: 3 FAILs — the route does not exist yet, so the POSTs return 404 where 400/200 are asserted.

- [ ] **Step 3: Implement**

In `backend/app/schemas.py`, add after the `ConfigUpdate` class:

```python
class SymbolUpdate(BaseModel):
    symbol: str
```

In `backend/app/main.py`:

1. Change the fastapi import (line 13) to:

```python
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
```

2. Add `SymbolUpdate` to the `app.schemas` import block (alphabetical, after `StrikeRow`).

3. Add the module constant directly under `logger = logging.getLogger(__name__)`:

```python
SWITCHABLE_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA"]
```

4. Add a field to `MarketDataRuntime` (after `bootstrap_inflight`):

```python
    switch_inflight: bool = False
```

5. Add the endpoint inside `create_app`, after the `/config` POST handler and before the `/stream` websocket:

```python
    @app.post("/control/symbol")
    async def control_symbol(update: SymbolUpdate):
        symbol = update.symbol.upper()
        if symbol not in SWITCHABLE_SYMBOLS:
            raise HTTPException(status_code=400, detail=f"symbol must be one of {SWITCHABLE_SYMBOLS}")
        market: MarketDataRuntime = app.state.market_data
        if symbol == market.symbol or market.switch_inflight:
            return {"symbol": market.symbol}
        await _switch_symbol(app, symbol)
        return {"symbol": market.symbol}
```

6. Add the helper at module level, directly after `_bootstrap_market_data`:

```python
async def _switch_symbol(app: FastAPI, symbol: str) -> None:
    market: MarketDataRuntime = app.state.market_data
    market.switch_inflight = True
    try:
        await _set_active_window(app, [], reason="switch")
        if market.underlying_ticker is not None:
            contract = getattr(market.underlying_ticker, "contract", None)
            if contract is not None:
                app.state.connector.cancel_market_data(contract)
            market.underlying_ticker = None

        market.symbol = symbol
        market.expiry = ""
        market.market_ready = False
        market.option_contracts_by_strike = {}
        market.all_strikes = []
        market.active_window_strikes = []
        market.contract_by_id = {}
        market.ticker_by_id = {}
        app.state.residual_history = {}

        snapshot = app.state.store.snapshot
        snapshot.underlying.symbol = symbol
        snapshot.underlying.expiry = ""
        snapshot.rows = []
        app.state.store.update_underlying_spot(UnderlyingSpot())
        market.force_snapshot_broadcast = True
        logger.info("Switched active symbol to %s", symbol)
    finally:
        market.switch_inflight = False
```

No new bootstrap path: `_connect_loop`/`_ingest_market_data` already call `_bootstrap_market_data` whenever connected and `market_ready` is false, and `_bootstrap_market_data` already uses `market.symbol` for both the underlying stream and the option chain.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_backend_runtime.py -v`
Expected: PASS (all tests in the file, including the three new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/OptionsAnalysis
git add backend/app/main.py backend/app/schemas.py backend/tests/test_backend_runtime.py
git commit -m "Add in-process symbol switch across SPY/QQQ/IWM/DIA"
```

---

### Task 3: Upstream gate — full suite, merge to main, record vendor hash

**Files:** none created/modified (git operations only).

**Interfaces:**
- Consumes: Tasks 1–2 commits on `ws5-sp2a-symbol-switch`.
- Produces: `NEW_HASH` — the upstream `main` commit that Task 4 vendors from and writes into `VENDOR.md`.

- [ ] **Step 1: Full suite on the branch**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/ -q`
Expected: all pass, 0 failures. If anything fails, fix before merging.

- [ ] **Step 2: Merge to main and verify**

```bash
cd /Users/josephstorey/OptionsAnalysis
git checkout main
git merge ws5-sp2a-symbol-switch
cd backend && .venv/bin/python -m pytest tests/ -q
cd /Users/josephstorey/OptionsAnalysis
git branch -d ws5-sp2a-symbol-switch
git status --short
git rev-parse HEAD
```

Expected: fast-forward merge; suite green on merged `main`; `git status --short` shows only `?? CLAUDE.md` (untracked, leave it); the final line prints `NEW_HASH` — **record it for Task 4**.

---

### Task 4: Re-vendor `odte/` from NEW_HASH + contract smoke

**Files:**
- Modify (via rsync only): `odte/backend/app/main.py`, `odte/backend/app/schemas.py`, `odte/backend/tests/test_backend_runtime.py`
- Modify: `odte/VENDOR.md`

**Interfaces:**
- Consumes: upstream `main` at `NEW_HASH` (Task 3).
- Produces: vendored backend serving `symbol` in `/health` and `POST /control/symbol` on `127.0.0.1:8788` — the contract Tasks 6–7 build against.

- [ ] **Step 1: Branch in Market_Analyse**

```bash
cd /Users/josephstorey/Market_Analyse
git checkout main
git checkout -b ws5-sp2a-etf-multi-underlying
```

Note: `sentiment_bridge.py` (modified) and `scripts/com.argus.calendar.plist` (untracked) carry across the checkout — leave them exactly as they are. If checkout refuses because of them, STOP and report; do not stash or revert.

- [ ] **Step 2: Re-vendor from the committed upstream tree**

`git archive` stages exactly the tracked tree at `NEW_HASH` (no untracked `CLAUDE.md`, no `dist`, no venvs), then rsync mirrors it into `odte/` while protecting the destination-managed paths:

```bash
STAGE=$(mktemp -d)
cd /Users/josephstorey/OptionsAnalysis && git archive main | tar -x -C "$STAGE"
rsync -a --delete \
  --exclude 'CLAUDE.md' \
  --exclude 'VENDOR.md' \
  --exclude 'frontend/dist' \
  --exclude 'frontend/node_modules' \
  --exclude 'backend/.venv' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  "$STAGE"/ /Users/josephstorey/Market_Analyse/odte/
rm -rf "$STAGE"
```

- [ ] **Step 3: Verify the vendor diff is exactly the SP2a surface**

```bash
cd /Users/josephstorey/Market_Analyse
git status --short odte/
grep -c "SWITCHABLE_SYMBOLS" odte/backend/app/main.py
ls odte/frontend/dist/index.html
```

Expected `git status` output — exactly these three, nothing else:

```
 M odte/backend/app/main.py
 M odte/backend/app/schemas.py
 M odte/backend/tests/test_backend_runtime.py
```

`grep -c` ≥ 2; `index.html` still present (SP1 dist retained). If any other file under `odte/` shows modified/deleted (especially anything under `odte/frontend/`), STOP — upstream drifted beyond SP2a; investigate before committing.

- [ ] **Step 4: Vendored suite green**

Run: `cd /Users/josephstorey/Market_Analyse/odte/backend && .venv/bin/python -m pytest tests/ -q`
Expected: all pass (the vendored `.venv` was provisioned in SP1).

- [ ] **Step 5: Update VENDOR.md**

Replace the full contents of `odte/VENDOR.md` with (substitute the real `NEW_HASH`):

```markdown
# Vendored: OptionsAnalysis

Source: ~/OptionsAnalysis
Commit: NEW_HASH
Vendored: 2026-07-03
Reason: WS-5 SP1 — embed the QQQ 0DTE ladder into the Market_Analyse dashboard.
        WS-5 SP2a — in-process ETF symbol switch (SPY/QQQ/IWM/DIA).

## Rules
- Treat this tree as OPAQUE. Do not edit internals.
- To update: re-run the rsync copy from the source repo and bump Commit/Vendored above.
- Build artifacts: `frontend/dist` is committed; `frontend/node_modules` and `backend/.venv` are gitignored and provisioned on the box.
```

- [ ] **Step 6: Restart the service and smoke the HTTP contract**

```bash
launchctl kickstart -k gui/$(id -u)/com.argus.odte
sleep 3
curl -s http://127.0.0.1:8788/health
curl -s -X POST http://127.0.0.1:8788/control/symbol -H 'Content-Type: application/json' -d '{"symbol":"SPY"}'
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:8788/control/symbol -H 'Content-Type: application/json' -d '{"symbol":"TSLA"}'
curl -s -X POST http://127.0.0.1:8788/control/symbol -H 'Content-Type: application/json' -d '{"symbol":"QQQ"}'
curl -s http://127.0.0.1:8788/health
```

Expected, in order: health JSON containing `"symbol":"QQQ"` (and `"ibkr_connected":false` — Gateway is down, that's fine); `{"symbol":"SPY"}`; `400`; `{"symbol":"QQQ"}` (switched back so the service is left on its boot default); final health JSON containing `"symbol":"QQQ"`. If `kickstart` errors because the service isn't loaded, load it first: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.odte.plist`, then retry.

- [ ] **Step 7: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add odte/backend/app/main.py odte/backend/app/schemas.py odte/backend/tests/test_backend_runtime.py odte/VENDOR.md
git commit -m "chore(odte): re-vendor with SP2a symbol switch (upstream NEW_HASH_SHORT)"
```

(Use the first 7 chars of `NEW_HASH` for `NEW_HASH_SHORT`.)

---

### Task 5: Dashboard — symbol allow-list helpers in `lib/odte.ts`

**Files:**
- Modify: `/Users/josephstorey/Market_Analyse/dashboard/lib/odte.ts`
- Test: `/Users/josephstorey/Market_Analyse/dashboard/lib/__tests__/odte.test.ts`

**Interfaces:**
- Consumes: existing `OdteHealth` / `odteBadge` (unchanged behaviour).
- Produces: `odteSymbols: readonly ["SPY", "QQQ", "IWM", "DIA"]`; `type OdteSymbol = "SPY" | "QQQ" | "IWM" | "DIA"`; `isOdteSymbol(value: string): value is OdteSymbol`; `OdteHealth.symbol?: string`. Task 6's route uses `isOdteSymbol`; Task 7's page uses `odteSymbols`, `OdteSymbol`, and `health.symbol`.

- [ ] **Step 1: Write the failing tests**

Append to `dashboard/lib/__tests__/odte.test.ts` and extend the import line:

```ts
import { odteBadge, odteSymbols, isOdteSymbol } from "@/lib/odte";
```

```ts
describe("odteSymbols", () => {
  it("is exactly the four switchable ETFs", () => {
    expect(odteSymbols).toEqual(["SPY", "QQQ", "IWM", "DIA"]);
  });
});

describe("isOdteSymbol", () => {
  it("accepts every allow-list member", () => {
    for (const s of odteSymbols) expect(isOdteSymbol(s)).toBe(true);
  });
  it("rejects unknown, empty, and lowercase symbols", () => {
    expect(isOdteSymbol("TSLA")).toBe(false);
    expect(isOdteSymbol("")).toBe(false);
    expect(isOdteSymbol("spy")).toBe(false);
  });
});

describe("odteBadge with symbol field", () => {
  it("is unaffected by symbol in the health payload", () => {
    expect(odteBadge({ ok: true, ibkr_connected: true, symbol: "SPY" })).toEqual({
      label: "Live",
      tone: "live",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run lib/__tests__/odte.test.ts`
Expected: FAIL — `odteSymbols` / `isOdteSymbol` are not exported.

- [ ] **Step 3: Implement**

Replace the full contents of `dashboard/lib/odte.ts` with:

```ts
export const odteSymbols = ["SPY", "QQQ", "IWM", "DIA"] as const;
export type OdteSymbol = (typeof odteSymbols)[number];

export function isOdteSymbol(value: string): value is OdteSymbol {
  return (odteSymbols as readonly string[]).includes(value);
}

export interface OdteHealth {
  ok: boolean;
  ibkr_connected: boolean;
  subscriptions?: number;
  server_ts_ms?: number;
  symbol?: string;
}

export type OdteTone = "live" | "warn" | "down";

export interface OdteBadge {
  label: string;
  tone: OdteTone;
}

export function odteBadge(health: OdteHealth | null | undefined): OdteBadge {
  if (!health || !health.ok) return { label: "Service down", tone: "down" };
  if (!health.ibkr_connected) return { label: "IBKR disconnected", tone: "warn" };
  return { label: "Live", tone: "live" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run`
Expected: PASS — whole suite, including the 5 pre-existing odteBadge tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add dashboard/lib/odte.ts dashboard/lib/__tests__/odte.test.ts
git commit -m "feat(odte): symbol allow-list helpers in lib/odte"
```

---

### Task 6: Dashboard — `POST /api/odte/symbol` proxy + smoke allow-list

**Files:**
- Create: `/Users/josephstorey/Market_Analyse/dashboard/app/api/odte/symbol/route.ts`
- Modify: `/Users/josephstorey/Market_Analyse/dashboard/scripts/smoke.mjs` (ACCEPTABLE_FAIL_PREFIXES)

**Interfaces:**
- Consumes: `isOdteSymbol` (Task 5); backend `POST /control/symbol` contract (Tasks 2/4).
- Produces: `POST /api/odte/symbol` `{symbol}` → forwards backend status/JSON; 400 on invalid body; 503 `{error}` when the service is offline. Task 7's page posts to it.

- [ ] **Step 1: Create the route**

`dashboard/app/api/odte/symbol/route.ts` (mirrors the health proxy's server-side fetch pattern):

```ts
import { isOdteSymbol } from "@/lib/odte";

export async function POST(req: Request) {
  let symbol: unknown;
  try {
    ({ symbol } = await req.json());
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof symbol !== "string" || !isOdteSymbol(symbol)) {
    return Response.json({ error: "symbol must be one of SPY, QQQ, IWM, DIA" }, { status: 400 });
  }
  try {
    const res = await fetch("http://127.0.0.1:8788/control/symbol", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
      next: { revalidate: 0 },
    });
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: "0DTE service offline" }, { status: 503 });
  }
}
```

- [ ] **Step 2: Add the offline-acceptable prefix to the smoke script**

In `dashboard/scripts/smoke.mjs`, in `ACCEPTABLE_FAIL_PREFIXES`, add one line after `"/api/odte/health",`:

```js
  "/api/odte/symbol",
```

- [ ] **Step 3: Verify no regressions**

Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run`
Expected: PASS. (No route tests — pure-lib rule. The route's validation logic is `isOdteSymbol`, already tested in Task 5; the wire contract was smoke-tested against the live backend in Task 4 and is exercised end-to-end by Task 7's smoke run.)

- [ ] **Step 4: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add dashboard/app/api/odte/symbol/route.ts dashboard/scripts/smoke.mjs
git commit -m "feat(odte): symbol switch proxy route"
```

---

### Task 7: Dashboard — symbol selector on `/odte` + smoke check

**Files:**
- Modify: `/Users/josephstorey/Market_Analyse/dashboard/app/odte/page.tsx`
- Modify: `/Users/josephstorey/Market_Analyse/dashboard/scripts/smoke.mjs` (selector render check)

**Interfaces:**
- Consumes: `odteSymbols`, `OdteSymbol`, `OdteHealth.symbol` (Task 5); `POST /api/odte/symbol` (Task 6); existing `/api/odte/health` SWR poll (surfaces `symbol` — the health proxy forwards the backend payload verbatim, so it needs no changes).
- Produces: the user-facing selector. No iframe reload on switch — the vendored ladder re-renders from its own websocket snapshot.

- [ ] **Step 1: Implement the selector**

Replace the full contents of `dashboard/app/odte/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import useSWR from "swr";
import { odteBadge, odteSymbols, type OdteHealth, type OdteSymbol } from "@/lib/odte";

const ODTE_APP_URL = "http://127.0.0.1:8788/app";
const fetcher = (u: string) => fetch(u, { cache: "no-store" }).then((r) => r.json());
const toneClass: Record<string, string> = {
  live: "bg-green-500/20 text-green-400",
  warn: "bg-yellow-500/20 text-yellow-400",
  down: "bg-red-500/20 text-red-400",
};

export default function OdtePage() {
  const { data, error, mutate } = useSWR<OdteHealth>("/api/odte/health", fetcher, {
    refreshInterval: 5000,
    shouldRetryOnError: false,
  });
  const [pending, setPending] = useState<OdteSymbol | null>(null);
  const health = error ? null : data;
  const badge = odteBadge(health);
  const down = badge.tone === "down";
  const activeSymbol = health?.symbol;

  async function switchSymbol(symbol: OdteSymbol) {
    if (symbol === activeSymbol || pending !== null) return;
    setPending(symbol);
    try {
      await fetch("/api/odte/symbol", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      await mutate();
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="flex flex-col font-mono h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-line">
        <h1 className="text-sm font-semibold">Index 0DTE{activeSymbol ? ` · ${activeSymbol}` : ""}</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded border border-line overflow-hidden">
            {odteSymbols.map((symbol) => (
              <button
                key={symbol}
                onClick={() => switchSymbol(symbol)}
                disabled={down}
                className={`px-2 py-0.5 text-xs ${
                  symbol === activeSymbol
                    ? "bg-green-500/20 text-green-400"
                    : symbol === pending
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "text-muted"
                }`}
              >
                {symbol}
              </button>
            ))}
          </div>
          <span className={`px-2 py-0.5 text-xs rounded ${toneClass[badge.tone]}`}>{badge.label}</span>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {down ? (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            Ladder offline — 0DTE service not reachable.
          </div>
        ) : (
          <iframe src={ODTE_APP_URL} title="0DTE ladder" className="w-full h-full border-0" />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add the selector render check to the smoke script**

In `dashboard/scripts/smoke.mjs`, add this function after `checkRails`:

```js
async function checkOdteSelector(page, label) {
  for (const sym of ["SPY", "QQQ", "IWM", "DIA"]) {
    if ((await page.locator(`button:text-is("${sym}")`).count()) === 0) {
      return `${label}: symbol button ${sym} missing`;
    }
  }
  return null;
}
```

And wire it in the route loop, after the home-route rails check:

```js
    // For odte route: check the symbol selector rendered
    if (route.path === "/odte" && !navError) {
      const selErr = await checkOdteSelector(page, route.label);
      if (selErr) chartPillErrors.push(selErr);
    }
```

- [ ] **Step 3: Run the dashboard suite**

Run: `cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run`
Expected: PASS (regression only — no component tests per the pure-lib rule).

- [ ] **Step 4: Run the smoke script**

Run: `cd /Users/josephstorey/Market_Analyse/dashboard && node scripts/smoke.mjs`
Expected: `9/9 routes passed`, including `/odte` with the selector check. `/api/odte/symbol` failures (if the service is down) are in the acceptable list from Task 6.

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add dashboard/app/odte/page.tsx dashboard/scripts/smoke.mjs
git commit -m "feat(odte): ETF symbol selector on /odte"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only — final gate before finishing the branch).

- [ ] **Step 1: All suites, both repos**

```bash
cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/ -q
cd /Users/josephstorey/Market_Analyse/odte/backend && .venv/bin/python -m pytest tests/ -q
cd /Users/josephstorey/Market_Analyse/dashboard && npx vitest run
cd /Users/josephstorey/Market_Analyse/dashboard && node scripts/smoke.mjs
```

Expected: all green; smoke `9/9 routes passed`.

- [ ] **Step 2: Live contract spot-check**

```bash
curl -s http://127.0.0.1:8788/health
```

Expected: `"ok":true`, `"symbol":"QQQ"` (boot default; Gateway still disconnected is fine).

- [ ] **Step 3: Repo hygiene**

```bash
git -C /Users/josephstorey/OptionsAnalysis status --short
git -C /Users/josephstorey/Market_Analyse status --short
```

Expected: upstream shows only `?? CLAUDE.md`; Market_Analyse shows only ` M sentiment_bridge.py` and `?? scripts/com.argus.calendar.plist` (the untouchable WIP pair). Anything else means a task leaked changes — resolve before finishing the branch.
