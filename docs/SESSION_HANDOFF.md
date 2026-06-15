# Session Handoff — 2026-06-16 (Phase C / WS-2 complete, branch ws2-ui-shell)

> Written from the WS-2 branch perspective. **Integration pending** — the branch has not yet been merged to main. A fresh session can resume from this file alone.

## 1. Current state

- **Phase C / WS-2 (UI shell): DONE on branch `ws2-ui-shell`** — 8 tasks complete, ready for controller integration.
- `main` is at the Phase B merge state (WS-1 options intel + WS-6 catalysts merged, live API serving both).
- **This branch has NOT been merged to main.** The controller must merge + restart the Argus API at integration (see §3).

## 2. What landed (WS-2 — all 8 tasks)

### Argus — new endpoint

- `argus/argus/data/rail.py` — `rail_quotes()`: batched `yf.download` for the full basket (ES NQ YM RTY VIX CL BTC SPY QQQ IWM DIA EURUSD USDJPY GBPUSD AUDUSD), ffill per-symbol to handle ragged last rows across asset classes, grouped output (`futures` / `indices` / `forex`).
- `argus/argus/api/routes.py` — `GET /api/rail/quotes` registered in `build_app()`.
- `argus/tests/test_rail.py` — 2 tests: `test_rail_quotes_per_symbol_last_valid` (ffill + change_pct), `test_rail_quotes_survives_empty` (empty DataFrame → `error: "no data"`).

### Dashboard — new helpers (`lib/`)

- `lib/forex-session.ts` — `forexSessions(now?)`: Asia 00–09 UTC / LDN 07–16 / NY 12–21, weekend-aware; returns `{active, overlap, closed}`.
- `lib/tz-display.ts` — `dualClock(now?)`: Sydney-primary / ET-secondary clock strings.
- `lib/rail-quotes.ts` — `useRailQuotes()` SWR hook polling `/api/argus/rail/quotes` every 45s; `RAIL_LABEL` display map; `RailQuote` / `RailData` types.

### Dashboard — rail components (`components/rails/`)

- `components/rails/QuoteRow.tsx` — single ticker line (label, price, signed % colored pos/neg).
- `components/rails/LeftRail.tsx` — quote rail: Futures + US Equity (with `usMarketState` session badge) + Forex (with `forexSessions` chip, teal for overlap). Skeleton rows while loading; amber offline banner ("QUOTE FEED OFFLINE") on error — never blank. Minimised 36px strip shows SPY/QQQ/VIX deltas. localStorage-persisted collapse.
- `components/rails/RightRail.tsx` — news rail shell: designed dormant state ("live news + macro sentiment land with WS-3"). Minimised strip shows vertical NEWS label. localStorage-persisted collapse.
- `components/rails/RailShell.tsx` — `"use client"` wrapper; 3-column flex row (LeftRail · content · RightRail). Wraps `{children}` in `app/layout.tsx`.

### Dashboard — layout integration

- `app/layout.tsx` — `{children}` replaced with `<RailShell>{children}</RailShell>`; rails appear on every page.

### Regression guard

- `dashboard/scripts/smoke.mjs` — `checkRails()` helper added; called on home route after page load; asserts left rail `aside` renders (via "Futures", "QUOTE FEED OFFLINE", or "ES" text) and right rail `aside` renders (via "NEWS" text); `/api/argus/rail/quotes` added to `ACCEPTABLE_FAIL_PREFIXES` (404 until API restarts post-integration).

## 3. Branch commits (a1b9169..HEAD)

```
7ecc6f4 feat(dashboard): wrap every page in the 3-column rail shell (left quote rail + right news shell)
ca467dd feat(dashboard): RightRail news shell per design spec — designed dormant state, static bars, minimised NEWS strip
c22f7ed feat(dashboard): LeftRail quote rail per design spec — blocks, session badges, teal overlap, skeleton/offline/minimised
e893df2 feat(dashboard): rail-quotes SWR hook + ticker label map
1811da8 feat(dashboard): dual-clock tz-display helper (Sydney primary, ET secondary)
bbdc391 feat(dashboard): forex-session helper — Asia/London/NY windows + overlap
591cd98 feat(rail): batched /api/rail/quotes basket — futures, indices, forex (ffill per-symbol)
```

(Plus Task-8 commit: `chore(rails): smoke rail check, docs + status board for WS-2`)

## 4. Regression sweep (branch, pre-integration)

```
dashboard vitest:   49/49 passed
dashboard tsc:      clean (no errors)
smoke (port 3100):  8/8 routes passed
                    rail check PASS — left rail renders QUOTE FEED OFFLINE aside (API 404, expected pre-integration)
                    right rail renders NEWS aside
                    /api/argus/rail/quotes → acceptable 404 (old API, pre-restart)
argus pytest:       48/49 passed
                    KNOWN PRE-EXISTING FAIL: test_cat_endpoint.py::test_catalysts_endpoint_shape
                    (test monkeypatches analyst data but the 90-day recency filter drops it;
                    present at branch start, not introduced by WS-2; fix is a follow-up for main)
```

## 5. Integration steps (controller)

1. **Merge** `ws2-ui-shell` → `main` (resolve any conflicts in `layout.tsx`, `routes.py`).
2. **Restart live Argus API**: `launchctl kickstart -k gui/$(id -u)/ai.argus.api` (no sudo). After restart, `curl http://127.0.0.1:8088/api/rail/quotes` should return ~15 quotes grouped futures/indices/forex.
3. **Verify live rail**: open dashboard at `:3000` — left rail should show live prices in all three blocks with session badges. If the endpoint is still 404, the Argus process didn't pick up the new route (check `ai.argus.api` is running the worktree's code — it must point to the merged main, not the old source path).
4. **Remove worktree**: `git worktree remove .worktrees/ws2` once merge is confirmed.

## 6. WS-3 blockers (next workstream)

WS-3 (Discord ingest + FinBERT news/macro) is the next workstream. It wires the right rail and adds macro-sentiment gauges to the left rail. Blockers:

- **Discord credentials**: private-group channel IDs (whale-watch, Market Report channels) + bot token. The ingest plan assumes a read-only bot.
- **FinBERT model**: `ProsusAI/finbert` or equivalent; needs ~500MB disk and the `transformers` package in the argus venv. Confirm GPU/CPU inference budget on the Mac.
- **`econ_calendar` table**: the "Today" econ-events block (left rail block 6) needs this populated; WS-3 owns the ingester.

## 7. Architecture pointers

- Master plan: `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` (§4.1 guardrails, §9 board, §WS-2).
- WS-2 plan: `docs/superpowers/plans/2026-06-13-phase-c-ws2-ui-shell.md` (8 tasks, acceptance criteria).
- Design spec: `docs/design/ws2-rail-spec.md` (visual authority — tokens, states, §8 Tailwind recipes).
- Service: `ai.argus.api` is a USER LaunchAgent — `launchctl kickstart -k gui/$(id -u)/ai.argus.api` (no sudo).
