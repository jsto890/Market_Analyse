# WS-5 Index 0DTE Hub · Sub-project 2a — ETF Multi-Underlying — Design

**Date:** 2026-06-30 · **Status:** design approved, awaiting plan.
**Part of:** [2026-06-12-platform-v2-master-plan.md](../plans/2026-06-12-platform-v2-master-plan.md) (WS-5)
**Follows:** [2026-06-30-ws5-odte-vendor-embed-design.md](2026-06-30-ws5-odte-vendor-embed-design.md) (SP1)

## Goal

Let the `/odte` hub switch its active underlying between **SPY, QQQ, IWM, DIA** without
restarting the service, streaming **one symbol at a time** (the IBKR market-data line budget makes
concurrent ladders impossible — see below). This builds directly on SP1's vendored embed: same
service, same iframe, plus an in-process symbol switch and a dashboard selector. The four **index**
underlyings (SPX/NDX/RUT/DJX) are deferred to **SP2b** because they need genuinely different
`Index()`-contract work that can only be validated against a live IBKR Gateway.

## Background / decisions

- **Scope = ETFs only, decomposed from SP2** (user-chosen): SPY/QQQ/IWM/DIA are all
  `Stock(symbol, "SMART", "USD")` — mechanically identical to the existing QQQ path, and
  smoke-testable offline. SPX/NDX/RUT/DJX need `Index()` contracts, cash-settled chains on specific
  exchanges (CBOE etc.), the SPXW weekly root for 0DTE, $100 multipliers, and AM/PM settlement
  handling — real work, un-verifiable while the Gateway is down. They become SP2b.
- **One symbol at a time** (forced by the line budget, not a preference): the ladder subscribes to a
  window of `window_strikes_each_side: 20` → ~40 strikes × 2 rights ≈ 80 option lines + the
  underlying per symbol, against the app's own `max_subscriptions_soft_limit: 95` and IBKR's
  ~100-line cap. Four warm ladders is physically impossible. The design is therefore "one active
  symbol, switchable," not "N concurrent."
- **Switch model = in-process** (user-chosen): a `/control/symbol` endpoint tears down the current
  symbol's subscriptions, resets runtime + snapshot state, and lets the **existing** ingest loop
  re-bootstrap. Smooth (~seconds), one service, one port. Rejected: env-pin + launchd restart
  (slower, needs the dashboard to trigger a privileged `launchctl` restart).
- **Edits land upstream then re-vendor** (user-chosen): the switch capability is added to
  `~/OptionsAnalysis` first (with its own pytest coverage) and committed, then `odte/` is re-vendored
  from the new hash. Keeps `odte/` a faithful mirror (preserving SP1's provenance model) and lands
  the capability in the standalone app too — aligned with the "first-class apps" end-state. Rejected:
  patching the vendor copy in place (diverges `odte/` from upstream).
- **The vendored frontend is already symbol-agnostic**: it renders `state.symbol` straight from the
  websocket snapshot. The ladder UI needs zero changes; the selector is dashboard chrome only. The
  standalone app gets the backend capability but no selector of its own in SP2a.

## Architecture

Work spans two repos.

```
~/OptionsAnalysis (upstream)                         Market_Analyse
  add SWITCHABLE_SYMBOLS + POST /control/symbol         re-vendor odte/ from new hash (bump VENDOR.md)
  + _switch_symbol(app, symbol) helper       --vendor-->  app/odte/page.tsx: + segmented selector
  + /health gains "symbol"                                app/api/odte/symbol/route.ts (new proxy)
  + pytest (fake connector)                              app/api/odte/health/route.ts: surface symbol
  frontend untouched (symbol-agnostic)                   lib/odte.ts: + odteSymbols + symbol typing
```

- **Backend switch** (`app/main.py`, upstream): a `SWITCHABLE_SYMBOLS = ["SPY","QQQ","IWM","DIA"]`
  module constant; `POST /control/symbol {symbol}` validates against it (400 otherwise), no-ops on
  same symbol, otherwise calls `_switch_symbol`. `/health` payload gains the current `symbol`.
- **`_switch_symbol(app, symbol)`** (upstream): guarded by a `switch_inflight` flag; tears down the
  current window via the existing `_set_active_window(app, [], reason="switch")` and cancels the
  underlying ticker; resets `MarketDataRuntime` (`symbol`, `market_ready=False`,
  `underlying_ticker=None`, clears `option_contracts_by_strike`/`all_strikes`/`active_window_strikes`/
  `contract_by_id`/`ticker_by_id`/`expiry`); resets the snapshot (`underlying.symbol`, clears
  rows/spot/expiry, sets `force_snapshot_broadcast=True`). No new bootstrap path — the ingest loop
  already re-bootstraps whenever `market_ready` is false.
- **Re-vendor** (`odte/`): rsync upstream@`<newhash>` → `odte/`, rebuild `frontend/dist`, bump
  `VENDOR.md` Commit/Vendored.
- **Dashboard selector** (`app/odte/page.tsx`): a segmented 4-button control beside the health badge;
  click → `POST /api/odte/symbol` (new Next proxy) → backend `/control/symbol`. No iframe reload —
  the vendored frontend re-renders on the next websocket snapshot, so the ladder swaps itself. The
  existing 5s health SWR poll picks up the new `symbol` and highlights the active button.
- **Health proxy** (`app/api/odte/health/route.ts`): passes through the new `symbol` field unchanged
  (it already forwards the backend payload).
- **Pure helpers** (`lib/odte.ts`): `odteSymbols` constant (mirrors the backend allow-list — four
  strings, no premature abstraction) + `OdteHealth.symbol?: string`.

## Data flow & switch sequence

```
selector click
  -> POST /api/odte/symbol {symbol}
  -> Next proxy server-fetches backend POST /control/symbol {symbol}
  -> validate against SWITCHABLE_SYMBOLS
  -> _switch_symbol: teardown current window + cancel underlying + reset runtime/snapshot
  -> ingest loop next tick: market_ready false -> _bootstrap_market_data for the new symbol
  -> ws /stream pushes fresh snapshot -> ladder re-renders state.symbol
  -> /api/odte/health (SWR 5s) reports new symbol -> active button highlighted
```

## Error handling / persistence

- **Gateway disconnected:** the switch still records the desired symbol and resets state; bootstrap
  completes once connected. Badge shows "IBKR disconnected" (SP1 behaviour, unchanged).
- **Invalid / unknown symbol:** backend returns 400; the proxy surfaces it; the selector keeps showing
  the current (health-reported) symbol.
- **Concurrent switch:** `switch_inflight` guards re-entrancy; a switch request arriving mid-switch is
  a no-op/ignored until the current one settles.
- **Persistence:** none — the service boots to the default **QQQ** on (re)start, matching SP1's
  no-persistence stance. Re-selection is cheap and the overnight ladder is offline anyway. YAGNI.

## Testing

- **OptionsAnalysis (pytest, offline, fake connector — existing style):**
  - `POST /control/symbol` with a symbol outside the allow-list → 400, no state change.
  - a valid switch resets `MarketDataRuntime` (symbol set, `market_ready` false, caches cleared) and
    the snapshot (`underlying.symbol` updated, rows/spot cleared), and cancels the prior
    subscriptions (the fake connector records cancels).
  - same-symbol request → no-op 200, no teardown.
  - `/health` includes the current `symbol`.
- **Dashboard (vitest, node-env, pure-lib only — existing patterns, NO @testing-library):**
  - `odteSymbols` is exactly `["SPY","QQQ","IWM","DIA"]`.
  - a symbol-validation helper accepts allow-list members and rejects others.
  - `OdteHealth` typing carries `symbol`; `odteBadge` unaffected.
- **Smoke (`dashboard/scripts/smoke.mjs`):** `/odte` still 200; the selector renders. `/api/odte/symbol`
  added to the acceptable-fail prefixes (offline path), mirroring `/api/odte/health`.
- **Isolation:** the vendored app's own test suite stays in `odte/` and is not wired into the
  dashboard suite (SP1 rule).

## Out of scope (later sub-projects / YAGNI)

Index underlyings SPX/NDX/RUT/DJX and all `Index()`-contract work (SP2b); WS-1 companion 2×2 grid
(SP3); concurrent multi-symbol streaming (blocked by the IBKR line cap); selection persistence across
restarts; a symbol selector in the standalone OptionsAnalysis frontend; any change to the ladder's
own rendering.

## Future direction (non-binding — informs, does not expand scope)

SP2b extends `SWITCHABLE_SYMBOLS` and the connector with `Index()` construction and cash-settled
chain qualification for SPX/NDX/RUT/DJX, reusing the exact switch + selector plumbing built here. The
selector's button set and the backend allow-list are the two seams SP2b grows; everything else
transfers unchanged.

## Caveat

The live switch requires IBKR Gateway. With it down (overnight from Sydney), a switch records the
desired symbol but the ladder stays in its offline state until the Gateway reconnects. The switch
*logic* is fully verifiable offline (fake connector + dashboard pure-lib tests); the end-to-end live
swap is verifiable only against a connected Gateway.
