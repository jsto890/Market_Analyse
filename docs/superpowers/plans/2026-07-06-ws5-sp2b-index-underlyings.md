# WS-5 SP2b — Index Underlyings (SPX/NDX/RUT/DJX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the 0DTE hub's in-process symbol switch (SP2a) to the four cash-settled index underlyings — SPX, NDX, RUT, DJX — so the `/odte` selector offers all eight underlyings, and run the deferred 60-minute live soak.

**Architecture:** Same two-repo flow as SP2a: upstream changes in `~/OptionsAnalysis` first (branch → tests → merge to its `main`), then re-vendor into `Market_Analyse/odte/`, then dashboard extension. The core change is replacing the hardcoded `Stock(symbol, "SMART", "USD")` construction in `IBKRConnector` with a `SYMBOL_META`-driven `build_underlying()` that returns `Index(...)` contracts for index symbols, plus trading-class-aware chain filtering (SPXW/NDXP/RUTW weeklies) and chain-derived strike steps (SPX steps are 5-wide, not 1-wide).

**Tech Stack:** Python 3.13, FastAPI, `ib_insync` (`Stock`, `Index`, `Option` contracts), pytest + Starlette TestClient (real `httpx` installed; harmless deprecation warning — do NOT install `httpx2`, see gotcha below), Next.js dashboard (vitest node-env pure-lib tests only).

## Preconditions (blocking — verify before Task 1)

- **IBKR Gateway/TWS live** with index data subscriptions (OPRA + CBOE index feeds). SP2b's acceptance is live verification; without the Gateway only Tasks 1–4 (fake-connector unit tests) can land, and the branch must NOT merge until Task 8's soak passes. Check: `curl -s http://127.0.0.1:8788/health` shows `"ibkr_connected": true` after backend restart.
- SP2a merged (done — Market_Analyse `6765bc8`, OptionsAnalysis `b448682`).

## Global Constraints

- Symbol allow-list becomes exactly `["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]` — verbatim, in this order — in backend `SWITCHABLE_SYMBOLS` and dashboard `odteSymbols`. ETFs first, indexes second.
- Boot default stays `QQQ`. No persistence of selected symbol.
- `odte/` is an opaque vendor mirror — backend changes ONLY via re-vendor (Task 6). Never hand-edit vendored files.
- Re-vendor excludes: `CLAUDE.md`, `VENDOR.md`, `frontend/dist`, `frontend/node_modules`, `backend/.venv`, `__pycache__`, `.pytest_cache`.
- 0DTE service: `127.0.0.1:8788`, launchd label `com.argus.odte`.
- Backend pytest MUST run from `odte/backend/` or `OptionsAnalysis/backend/` (`cd backend && .venv/bin/python -m pytest tests/ -q`) — running from repo root fails with `ModuleNotFoundError: No module named 'app'`.
- Do NOT add `httpx2` to requirements. Real `httpx` is already installed in both venvs and satisfies Starlette 1.3.1's TestClient fallback.
- Connector stays read-only: `_enforce_read_only()` untouched; no order methods.
- Untouchable WIP in Market_Analyse: `sentiment_bridge.py` (modified) and `scripts/com.argus.calendar.plist` (untracked). Stage files by explicit path only; never `git add -A` / `git add .`.
- Dashboard tests: vitest, node env, pure-lib only — no @testing-library, no component/route tests.
- Commits: concise imperative subject; end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Model Assignments (SDD dispatch)

| Task | Role | Model | Why |
|---|---|---|---|
| 1 | implementer | haiku | complete code in plan — transcription + tests |
| 1 | reviewer | haiku | small mechanical diff |
| 2 | implementer | sonnet | multi-site connector integration, async paths |
| 2 | reviewer | sonnet | subtle chain-filter logic |
| 3 | implementer | sonnet | window-manager math + edge cases |
| 3 | reviewer | sonnet | off-by-one risk in strike stepping |
| 4 | implementer | haiku | allow-list extension, code in plan |
| 4 | reviewer | haiku | small diff |
| 5 | controller | — | git-only gate (merge, NEW_HASH) |
| 6 | controller | — | re-vendor + service restart + smoke |
| 7 | implementer | haiku | dashboard list + grouped selector, code in plan |
| 7 | reviewer | sonnet | UI interaction diff |
| 8 | implementer | sonnet | soak script + live acceptance judgment |
| 9 | final review | opus | whole-branch, cross-repo integration |

---

### Task 1: Upstream — `SYMBOL_META` + `build_underlying()`

**Repo:** `/Users/josephstorey/OptionsAnalysis`, branch `ws5-sp2b-index-underlyings` off `main`.

**Files:**
- Create: `backend/app/ibkr/symbols.py`
- Test: `backend/tests/test_symbols.py`

**Interfaces:**
- Produces: `SYMBOL_META: dict[str, dict]`, `build_underlying(symbol: str) -> Contract`, `is_index(symbol: str) -> bool`, `option_trading_class(symbol: str) -> str | None` — consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_symbols.py
from ib_insync.contract import Index, Stock

from app.ibkr.symbols import (
    SYMBOL_META,
    build_underlying,
    is_index,
    option_trading_class,
)


def test_meta_covers_all_eight_symbols_in_order():
    assert list(SYMBOL_META) == [
        "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX",
    ]


def test_build_underlying_stock():
    c = build_underlying("QQQ")
    assert isinstance(c, Stock)
    assert (c.symbol, c.exchange, c.currency) == ("QQQ", "SMART", "USD")


def test_build_underlying_index_exchanges():
    spx = build_underlying("SPX")
    assert isinstance(spx, Index)
    assert (spx.symbol, spx.exchange, spx.currency) == ("SPX", "CBOE", "USD")
    assert build_underlying("NDX").exchange == "NASDAQ"
    assert build_underlying("RUT").exchange == "RUSSELL"
    assert build_underlying("DJX").exchange == "CBOE"


def test_build_underlying_uppercases_and_rejects_unknown():
    assert build_underlying("spx").symbol == "SPX"
    import pytest
    with pytest.raises(KeyError):
        build_underlying("TSLA")


def test_is_index_and_trading_class():
    assert is_index("SPX") and not is_index("SPY")
    assert option_trading_class("SPX") == "SPXW"
    assert option_trading_class("NDX") == "NDXP"
    assert option_trading_class("RUT") == "RUTW"
    assert option_trading_class("DJX") == "DJX"
    assert option_trading_class("QQQ") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_symbols.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.ibkr.symbols'`

- [ ] **Step 3: Write the implementation**

```python
# backend/app/ibkr/symbols.py
"""Underlying-contract metadata for the switchable symbol set.

ETFs are SMART-routed Stock contracts. Indexes are cash-settled Index
contracts on their primary listing exchange; their 0DTE options trade
under weekly trading classes (SPXW/NDXP/RUTW) with PM settlement.
"""
from __future__ import annotations

from ib_insync.contract import Contract, Index, Stock

SYMBOL_META: dict[str, dict] = {
    "SPY": {"kind": "stock", "exchange": "SMART"},
    "QQQ": {"kind": "stock", "exchange": "SMART"},
    "IWM": {"kind": "stock", "exchange": "SMART"},
    "DIA": {"kind": "stock", "exchange": "SMART"},
    "SPX": {"kind": "index", "exchange": "CBOE", "trading_class": "SPXW"},
    "NDX": {"kind": "index", "exchange": "NASDAQ", "trading_class": "NDXP"},
    "RUT": {"kind": "index", "exchange": "RUSSELL", "trading_class": "RUTW"},
    "DJX": {"kind": "index", "exchange": "CBOE", "trading_class": "DJX"},
}


def build_underlying(symbol: str) -> Contract:
    sym = symbol.upper()
    meta = SYMBOL_META[sym]  # KeyError on unknown is intentional
    if meta["kind"] == "index":
        return Index(sym, meta["exchange"], "USD")
    return Stock(sym, meta["exchange"], "USD")


def is_index(symbol: str) -> bool:
    meta = SYMBOL_META.get(symbol.upper())
    return bool(meta and meta["kind"] == "index")


def option_trading_class(symbol: str) -> str | None:
    meta = SYMBOL_META.get(symbol.upper())
    if not meta:
        return None
    return meta.get("trading_class")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/josephstorey/OptionsAnalysis/backend && .venv/bin/python -m pytest tests/test_symbols.py -q`
Expected: 5 passed. Then full suite: `.venv/bin/python -m pytest tests/ -q` — expected 41 passed, 1 skipped (36 prior + 5 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/ibkr/symbols.py backend/tests/test_symbols.py
git commit -m "Add SYMBOL_META and build_underlying for index underlyings"
```

---

### Task 2: Upstream — connector uses `build_underlying` + trading-class chain filter

**Files:**
- Modify: `backend/app/ibkr/connector.py` (three sites: `qualify_underlying` ~line 265, `subscribe_underlying_stream` ~line 292, `get_option_chain` ~line 222)
- Test: `backend/tests/test_connector_contracts.py` (new)

**Interfaces:**
- Consumes: `build_underlying`, `is_index`, `option_trading_class` from Task 1.
- Produces: `get_option_chain(symbol, min_dte, max_dte)` returns only contracts whose `tradingClass` matches `option_trading_class(symbol)` when the symbol is an index (ETF behavior unchanged). `qualify_underlying`/`subscribe_underlying_stream` accept all eight symbols.

**Implementation notes for the implementer (sonnet):**
- Replace `Stock(symbol, "SMART", "USD")` in `qualify_underlying` and `subscribe_underlying_stream` with `build_underlying(symbol)`. Import from `app.ibkr.symbols`.
- In `get_option_chain`: the existing flow calls `reqSecDefOptParams(underlying.symbol, "", underlying.secType, underlying.conId)` after qualifying the underlying — verify it passes `underlying.secType` (will be `"IND"` for indexes) rather than a hardcoded `"STK"`; fix if hardcoded. When building `Option(...)` contracts for an index symbol, set `tradingClass=option_trading_class(symbol)` and filter the secdef chains to the matching `tradingClass` entry (index symbols return multiple chains: monthly SPX + weekly SPXW; we want the weekly class for 0DTE).
- Cash-settled index options use exchange `"SMART"` on the Option contract (unchanged) — the trading class is what disambiguates.
- Write tests against a `FakeIB` stub (follow the existing `DummyConnector` pattern in `tests/test_backend_runtime.py`): stub `reqSecDefOptParamsAsync` returning two chain records (tradingClass `"SPX"` and `"SPXW"`) and assert only `SPXW` strikes survive; assert ETF path is unchanged (single chain, no filter).
- Do NOT touch `_enforce_read_only`, reconnect logic, or pacing code.

- [ ] Step 1: Write failing tests (`test_connector_contracts.py`: `test_qualify_underlying_builds_index_contract`, `test_chain_filters_to_weekly_trading_class_for_index`, `test_chain_unfiltered_for_etf`)
- [ ] Step 2: Run — expect FAIL (connector still builds `Stock` for SPX)
- [ ] Step 3: Implement the three connector sites
- [ ] Step 4: Full suite from `backend/` — expected 44+ passed, 1 skipped
- [ ] Step 5: Commit

```bash
git add backend/app/ibkr/connector.py backend/tests/test_connector_contracts.py
git commit -m "Route index underlyings through Index contracts with weekly-class chain filter"
```

---

### Task 3: Upstream — chain-derived strike step in window manager

**Files:**
- Modify: `backend/app/ibkr/window_manager.py`
- Test: extend `backend/tests/test_window_manager.py` (create if absent)

**Interfaces:**
- Produces: `infer_strike_step(strikes: list[float]) -> float` — median of consecutive differences over the sorted unique strikes; used wherever the window manager currently assumes a fixed 1.0 step when selecting the active strike window around spot.

**Why:** SPX strikes step by 5 (25 far from the money), NDX by 25/100, RUT by 5, DJX by 0.5–1. A hardcoded 1-wide window logic would build an active window of nonexistent strikes and subscribe to nothing.

**Implementation notes (sonnet):**
- `infer_strike_step`: sort unique strikes, take `numpy`-free median of pairwise diffs (plain Python: sorted diffs, middle element). Guard: fewer than 2 strikes → return 1.0.
- Find the window-sizing site in `window_manager.py` (grep for hardcoded `1.0`/`step`/`round`); thread the inferred step through window construction so "N strikes each side of spot" walks actual chain strikes rather than integer offsets. Preserve current behavior for 1.0-step chains exactly (regression tests must stay green).
- Tests: `test_infer_step_spx_five_wide` (strikes `[5900, 5905, 5910, 5915]` → 5.0), `test_infer_step_mixed_far_wings` (mixed 5/25 spacing → 5.0 median), `test_infer_step_degenerate` (`[100.0]` → 1.0), plus a window-construction test asserting the selected window for spot 5907 with 5-wide strikes contains 5905/5910 (not 5907±1).

- [ ] Step 1: failing tests → Step 2: verify fail → Step 3: implement → Step 4: full suite green from `backend/` → Step 5: commit

```bash
git add backend/app/ibkr/window_manager.py backend/tests/test_window_manager.py
git commit -m "Infer strike step from chain instead of assuming 1-wide"
```

---

### Task 4: Upstream — extend `SWITCHABLE_SYMBOLS` to eight

**Files:**
- Modify: `backend/app/main.py` (line ~44 `SWITCHABLE_SYMBOLS`; `_switch_symbol` already generic)
- Test: extend `backend/tests/test_backend_runtime.py`

- [ ] **Step 1: Write the failing test**

```python
def test_switchable_symbols_covers_etfs_then_indexes():
    from app.main import SWITCHABLE_SYMBOLS
    assert SWITCHABLE_SYMBOLS == [
        "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX",
    ]


def test_control_symbol_switches_to_index(tmp_path):
    app = _make_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/control/symbol", json={"symbol": "SPX"})
        assert response.status_code == 200
        assert response.json() == {"symbol": "SPX"}
        assert client.get("/health").json()["symbol"] == "SPX"
```

- [ ] **Step 2: Verify fail** (list mismatch)
- [ ] **Step 3: Implement** — one line:

```python
SWITCHABLE_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]
```

Also verify `_switch_symbol`'s teardown cancels via the generic contract objects (it does — it iterates state, not symbol names); no other change expected.

- [ ] **Step 4: Full suite green from `backend/`**
- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/tests/test_backend_runtime.py
git commit -m "Extend switchable symbols to SPX/NDX/RUT/DJX"
```

---

### Task 5: Upstream gate — merge to OptionsAnalysis `main` (controller, no subagent)

- [ ] Full suite from `backend/`: expected all green.
- [ ] `git checkout main && git merge ws5-sp2b-index-underlyings` (fast-forward expected), re-run suite on merged main, `git branch -d ws5-sp2b-index-underlyings`.
- [ ] Record `NEW_HASH=$(git rev-parse HEAD)` in the SDD ledger — vendor source for Task 6.

---

### Task 6: Re-vendor `odte/` + service restart + offline smoke (controller)

**Repo:** `/Users/josephstorey/Market_Analyse`, branch `ws5-sp2b-index-underlyings` off `main`.

- [ ] Re-vendor exactly as SP2a Task 4:

```bash
STAGE=$(mktemp -d)
cd /Users/josephstorey/OptionsAnalysis && git archive main | tar -x -C "$STAGE"
rsync -a --delete \
  --exclude 'CLAUDE.md' --exclude 'VENDOR.md' \
  --exclude 'frontend/dist' --exclude 'frontend/node_modules' \
  --exclude 'backend/.venv' --exclude '__pycache__' --exclude '.pytest_cache' \
  "$STAGE"/ /Users/josephstorey/Market_Analyse/odte/
rm -rf "$STAGE"
```

- [ ] Verify `git status --short odte/` shows exactly: `M odte/backend/app/main.py`, `M odte/backend/tests/test_backend_runtime.py`, new `odte/backend/app/ibkr/symbols.py`, `M odte/backend/app/ibkr/connector.py`, `M odte/backend/app/ibkr/window_manager.py`, new tests. Anything else = re-vendor leak; stop and diagnose.
- [ ] Vendored suite green from `odte/backend/`.
- [ ] Bump `odte/VENDOR.md` Commit/Vendored lines to `NEW_HASH` / today.
- [ ] `launchctl kickstart -k gui/$(id -u)/com.argus.odte`; smoke: health→QQQ, `POST /control/symbol {"symbol":"SPX"}`→200 `{"symbol":"SPX"}`, `{"symbol":"FOO"}`→400, back to QQQ.
- [ ] Commit (explicit paths: the changed vendored files + `odte/VENDOR.md`): `chore(odte): re-vendor with SP2b index underlyings (upstream <NEW_HASH:7>)`

---

### Task 7: Dashboard — eight-symbol grouped selector

**Files:**
- Modify: `dashboard/lib/odte.ts`, `dashboard/lib/__tests__/odte.test.ts`, `dashboard/app/odte/page.tsx`

**Interfaces:**
- Produces: `odteSymbols` (8, ordered), `odteEtfSymbols`/`odteIndexSymbols` derived slices; page renders two button groups labeled `ETF` and `INDEX` separated by a thin divider (`<span className="w-px h-4 bg-line mx-1" />`), same `switchSymbol` handler.

- [ ] **Step 1: failing vitest** — extend `lib/__tests__/odte.test.ts`:

```typescript
it("covers all eight symbols in order", () => {
  expect([...odteSymbols]).toEqual([
    "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX",
  ]);
});

it("splits ETF and index groups", () => {
  expect([...odteEtfSymbols]).toEqual(["SPY", "QQQ", "IWM", "DIA"]);
  expect([...odteIndexSymbols]).toEqual(["SPX", "NDX", "RUT", "DJX"]);
});

it("accepts index symbols in the guard", () => {
  expect(isOdteSymbol("SPX")).toBe(true);
  expect(isOdteSymbol("VIX")).toBe(false);
});
```

- [ ] **Step 2: verify fail** (`cd dashboard && npx vitest run lib/__tests__/odte.test.ts`)
- [ ] **Step 3: implement `lib/odte.ts`:**

```typescript
export const odteSymbols = [
  "SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX",
] as const;
export const odteEtfSymbols = odteSymbols.slice(0, 4);
export const odteIndexSymbols = odteSymbols.slice(4);
```

(`OdteSymbol` and `isOdteSymbol` need no change — derived from `odteSymbols`.)

- [ ] **Step 4:** page.tsx — replace the single `odteSymbols.map` block with two mapped groups + divider; identical button styling/handlers. `npm run build` + full vitest green.
- [ ] **Step 5: Commit** — `feat(odte): eight-underlying grouped selector`

---

### Task 8: 60-minute live soak (GATED on IBKR Gateway; sonnet implementer + controller judgment)

**Files:**
- Create: `scripts/odte_soak.py` (Market_Analyse repo root `scripts/` — NOT under `odte/`)
- Create (output, gitignored is fine): `reports/odte_soak_<date>.json`

**The soak script** polls `http://127.0.0.1:8788/health` every 15 s for 60 min and records: `ok`, `ibkr_connected`, `subscriptions`, `symbol`, timestamp. Every 10 min it rotates the active symbol through all eight via `POST /control/symbol` (dwell ≥ 5 min for SPX/NDX to observe subscription refill). PASS criteria (all required):
1. zero polls with `ok: false`;
2. `ibkr_connected` true on ≥ 99% of polls (one reconnect blip tolerated);
3. after each switch, `subscriptions > 0` within 120 s (chain re-bootstrap works for index classes);
4. no backend process restart (launchd PID stable — capture `launchctl print gui/$(id -u)/com.argus.odte | grep pid` at start/end);
5. ladder visibly populated for SPX and NDX (manual check at `http://127.0.0.1:8788/app` — record screenshot paths in the report notes).

```python
# scripts/odte_soak.py  (complete file for the implementer)
"""60-minute soak for the 0DTE hub. Run only with IBKR Gateway live.

Usage: python3 scripts/odte_soak.py [--minutes 60] [--out reports/]
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "http://127.0.0.1:8788"
SYMBOLS = ["SPY", "QQQ", "IWM", "DIA", "SPX", "NDX", "RUT", "DJX"]


def _get(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=5) as r:
        return json.load(r)


def _post_symbol(symbol: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/control/symbol",
        data=json.dumps({"symbol": symbol}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.load(r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--minutes", type=int, default=60)
    ap.add_argument("--out", default="reports")
    args = ap.parse_args()

    polls: list[dict] = []
    switches: list[dict] = []
    t_end = time.time() + args.minutes * 60
    rotation = [s for s in SYMBOLS for _ in (0,)]  # one pass, ~7.5 min dwell at 60 min
    next_switch = time.time()
    sym_iter = iter(rotation)

    while time.time() < t_end:
        now = datetime.now(timezone.utc).isoformat()
        try:
            h = _get("/health")
            polls.append({"ts": now, **h})
        except Exception as exc:  # noqa: BLE001 — soak must record, not die
            polls.append({"ts": now, "ok": False, "error": str(exc)})
        if time.time() >= next_switch:
            try:
                sym = next(sym_iter)
                resp = _post_symbol(sym)
                switches.append({"ts": now, "requested": sym, "resp": resp})
                next_switch = time.time() + (args.minutes * 60) / len(rotation)
            except StopIteration:
                next_switch = t_end + 1
            except Exception as exc:  # noqa: BLE001
                switches.append({"ts": now, "requested": sym, "error": str(exc)})
        time.sleep(15)

    ok_polls = [p for p in polls if p.get("ok")]
    connected = [p for p in polls if p.get("ibkr_connected")]
    verdict = {
        "polls": len(polls),
        "ok_rate": len(ok_polls) / max(len(polls), 1),
        "connected_rate": len(connected) / max(len(polls), 1),
        "switches": switches,
        "pass": len(ok_polls) == len(polls)
        and len(connected) / max(len(polls), 1) >= 0.99
        and all("error" not in s for s in switches),
    }
    out = Path(args.out) / f"odte_soak_{datetime.now():%Y%m%d_%H%M}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"verdict": verdict, "polls": polls}, indent=1))
    print(json.dumps(verdict["pass"] and "SOAK PASS" or "SOAK FAIL"))
    print(f"report: {out}")
    return 0 if verdict["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] Run during US market hours (23:30–06:00 AEST) with Gateway up. Criteria 3–5 are judged by the controller from the report + manual ladder check; script covers 1–2 and switch errors.
- [ ] Commit script only: `git add scripts/odte_soak.py && git commit -m "feat(odte): 60-min soak acceptance script"`
- [ ] **If soak FAILS:** file the failure mode in the SDD ledger, do NOT merge; likely suspects are index chain qualification (Task 2) and strike windows (Task 3).

---

### Task 9: Verification sweep + final whole-branch review (controller + opus)

- [ ] Suites: OptionsAnalysis backend, vendored `odte/backend`, dashboard vitest, `npm run build`, smoke 9/9 (fresh `.next` — delete `.next` before `npm run dev` after any production build; stale-cache gotcha from SP2a).
- [ ] Soak report shows PASS (Task 8).
- [ ] Repo hygiene: WIP pair untouched; branch touches only intended files.
- [ ] Final review (opus) via `scripts/review-package $(git merge-base main HEAD) HEAD`: attention on SYMBOL_META↔odteSymbols verbatim/order match, trading-class filter correctness, strike-step regression safety for ETFs, re-vendor surface.
- [ ] Merge via superpowers:finishing-a-development-branch (`--no-ff`, house convention), update master-plan status board row in the same commit.
