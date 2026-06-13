# Session Handoff — 2026-06-13

> Rewritten at integration (§4.1). Both Phase A and Phase B-0 are **merged to main**; live verification ran at integration. A fresh session can resume from this file alone.

## 1. Current state

- **Phase A (WS-0 bug sweep, B1–B8): DONE** — branch `phase-a-bug-sweep` (10 commits) merged to main.
- **Phase B-0 (data-plane foundation): DONE** — branch `phase-b0-data-plane` (9 commits) merged to main.
- Execution model: subagent-driven development in two parallel git worktrees (`.worktrees/phase-a`, `.worktrees/phase-b0`), implementer → spec review → quality review per task, PM audit at the phase boundary, machine-global steps done once at integration on main.
- **Next step:** start Phase B (WS-1 options intel + WS-6 catalysts) — write its implementation plan per the master plan §5. The 20-trading-day baseline clock for relative-unusual starts when the snapshotter lands.

## 2. What landed (by phase)

### Phase A — every visible bug from the 2026-06-12 feedback session

| Bug | Fix | Key files |
|---|---|---|
| B1/B1b/B2 | Chart fetches 2Y once; range pills switch client-side; EMA-200 on all periods; persisted period applies to pill + window | `dashboard/lib/chart-range.ts`, `components/charts/CandleChart.tsx`, `app/t/[ticker]/page.tsx` |
| B3 | Phantom collapsed expansion rows (42 × 1px) — expansion `<tr>` now gated on `everExpandedKeys` | `components/ui/DataTable.tsx`, regression check `dashboard/scripts/row-heights.mjs` |
| B4 | Sources reads `ACCOUNTS_CSV` env; `meta {path, exists}` on payload; designed empty states (file-missing vs file-empty) | `app/api/accounts/route.ts`, `app/sources/page.tsx`, `types/accounts.ts` |
| B5 | Header: `called 7 May @ 421.39 → 488.45 (+15.9%, 36d) · median pick peaks…` | `lib/called-since.ts`, `components/ticker/Header.tsx` |
| B6/B7 | Options panel: Strike·Last·Bid×Ask·Δ%·Vol·OI·Type columns; "Argus API offline" vs "no options chain (source: yfinance)"; market-state subtitle; closed+empty explanation line | `components/ticker/OptionsPanel.tsx`, `lib/market-clock.ts` |
| B8 | Chart info strip: session badge, close/range, vol× avg, 52w position, pre/after extended price | `lib/bar-stats.ts`, `components/ticker/ChartInfoStrip.tsx`, argus `/api/extended/{symbol}` |

Plan correction (documented, evidence-backed): the B3 repro script uses a height-only sliver filter — the plan's `text.length > 0` filter provably missed the empty-text phantom rows.

### Phase B-0 — data-plane foundation (gates all ingest workstreams)

- Root `.env` is the config contract (`.env.example` committed): `ARGUS_DB`, `BRIDGE_DIR`, `ACCOUNTS_CSV`.
- `argus/argus/db.py` is the ONLY Python SQLite access point (WAL persisted, busy_timeout=5000, synchronous=NORMAL, row_factory=Row, auto-creates `heartbeats`). `settings.py` resolves `db_path` lazily via `resolve_db_path()`; `alerts/log.py` fully routed.
- Heartbeats: `python -m argus.heartbeat <job> <status> [detail]` CLI → `heartbeats` table (job PK, upsert) → `GET /api/heartbeats` → Pipeline-health panel on `/sources` (stale >26h amber, errors red).
- `scripts/job_wrapper.sh <job> <cmd…>`: sources `.env`, `caffeinate -i`, start/ok/error heartbeats. Every launchd job runs through it.
- `scripts/run_daily.sh`: Market_Review sentiment pipeline → account backtest → dashboard ingest, each step heartbeated independently (`daily-sentiment`, `daily-account-backtest`, `daily-ingest`).
- `scripts/setup_wakes.sh`: one-time pmset pre-wake 05:45 local — **REQUIRES USER SUDO, not yet run**.
- `dashboard/lib/db.ts` resolves `ARGUS_DB` (logs `[db] sqlite: <path>` once); `dashboard/.env.local` carries it for Next.

## 3. Integration actions performed (2026-06-13)

- Merged `phase-b0-data-plane` then `phase-a-bug-sweep`; conflicts resolved in `argus/argus/api/routes.py` (both new routes kept), master plan §9 (both rows Done), this file (reconciled), `dashboard/app/sources/page.tsx` verified composed (PipelineHealth panel renders above the B4 empty states).
- Created machine-local `.env` (from `.env.example`) and `dashboard/.env.local` (`ARGUS_DB=…`).
- Restarted `ai.argus.api` (`launchctl kickstart -k gui/$(id -u)/ai.argus.api`); verified `GET /api/heartbeats` (wrapper-test rows) and `GET /api/extended/AAPL`.
- Ran the Market_Review account backtest once (`account_backtest.csv` generated) and `npm run ingest`.
- Repointed `~/Library/LaunchAgents/com.market-review.daily.plist` through `job_wrapper.sh daily → scripts/run_daily.sh` (20:30 schedule kept); bootout/bootstrap done.
- Full sweep on merged main: argus pytest, dashboard vitest, tsc, row-heights.mjs, smoke.mjs — see §4.

## 4. Regression baseline (merged main)

```
argus:     .venv/bin/python -m pytest tests/   → 22 passed
dashboard: npx vitest run                       → 45 passed
           npx tsc --noEmit                     → clean
           SMOKE_URL=… node scripts/row-heights.mjs → rows>0, slivers=0, exit 0
           SMOKE_URL=… node scripts/smoke.mjs       → all routes PASS (chart-pill check included)
```

Dev-server env when running checks locally: `ARGUS_DB=<repo>/argus.db BRIDGE_DIR=<repo>/reports` (Today table reads `BRIDGE_DIR` CSVs, NOT the DB).

## 5. Open items / follow-ups

1. **USER ACTION (blocking nightly wake):** run `./scripts/setup_wakes.sh` once — needs sudo; agents must never run it.
2. yfinance options-flow rows carry no `type` field → the options panel Type column renders "—" (pre-existing). Candidate fix: derive from `contractSymbol` (…C/P########) or `inTheMoney`; or drop the column. Data-layer follow-up.
3. PipelineHealth renders any non-2xx from the proxy as "Argus API offline" (e.g. a future 500). Accepted interim copy; revisit if it misleads.
4. `bridge_meta.json` staleness banner appears when the daily pipeline hasn't run — self-heals with the nightly schedule.
5. Dev-only React StrictMode persist/hydrate race on the chart period (pre-existing; production build unaffected).

## 6. Architecture pointers

- Master plan: `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` (§4.1 guardrails, §9 board).
- Phase plans: `2026-06-12-phase-a-bug-sweep.md`, `2026-06-12-phase-b0-data-plane.md` (same dir).
- Ops: `scripts/README.md`. Service: `ai.argus.api` is a USER LaunchAgent — restart with `launchctl kickstart -k gui/$(id -u)/ai.argus.api` (no sudo). Daily job: `com.market-review.daily` at 20:30 local through the wrapper.
- Worktrees `.worktrees/phase-a` and `.worktrees/phase-b0` can be removed once branches are confirmed merged (`git worktree remove …`).
