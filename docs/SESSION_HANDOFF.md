# Session Handoff — 2026-06-13 (Phase B integrated)

> Reconciled at integration from the WS-1 and WS-6 branch handoffs (§4.1). Both workstreams are **merged to main**; live verification ran at integration. A fresh session can resume from this file alone.

## 1. Current state

- **Phase B / WS-1 (options intel): DONE** — branch `ws1-options-intel` (10 tasks) merged to main. Scorer carries a **beta** tag until a calendar-gated validation week (§5).
- **Phase B / WS-6 (catalysts): DONE** — branch `ws6-catalysts` (5 tasks + 1 tz-hardening fix) merged to main.
- Earlier phases (A bug-sweep, B-0 data-plane) already on main; the daily launchd job runs through `job_wrapper.sh`; the 05:45 weekday pmset pre-wake is active.
- **Next step:** Phase C (WS-2 UI shell + WS-3 news/macro) per the master plan §5, or let WS-1 accumulate snapshot sessions toward the validation week.

## 2. What landed (Phase B)

### WS-1 — options intelligence (`argus/argus/options_intel/`)
- `schema.py` — `options_snapshots`, `unusual_activity`, `gex_levels` (idempotent `ensure_schema`).
- `universe.py` — snapshot universe: index underlyings + watchlist + bridge tickers, capped, never-fatal on missing inputs.
- `snapshot.py` — chain snapshotter (±20% moneyness band, idempotent per `(snap_date,kind,symbol,expiry,strike,type)`, NaN-safe, heartbeated). Live smoke: 947 rows for SPY.
- `unusual.py` — robust relative-unusual scorer: median/MAD z on `log1p(vol)`; **MAD=0 → sample std-dev fallback → suppress (None)** (quant-adjudicated, master plan §WS-1.2); own-baseline ≥10 non-zero days; OI≥50 eligibility; persistence bonus; top-15/side. **Beta tag** until validation.
- `gex.py` — GEX engine: BS-gamma spot-sweep (61 pts, ±15%, gamma re-evaluated per spot), zero-gamma flip, call/put walls; dealer-sign is a **documented assumption**; OI-based so next non-0DTE expiry only.
- `clock.py` — `us_market_open()` (ET session check, no holidays).
- `label_sheet.py` — blind validation CSV (top-N scored + N random unscored, shuffled, no score columns).
- API: `GET /api/unusual/{symbol}` (scored rows + `as_of`), `GET /api/gex/{symbol}` (levels + OI-based caveat); `flow_summary` serves the latest scored close snapshot overnight with `unusual_as_of` (closes B6 for good — never an empty overnight table).
- Dashboard: OptionsPanel σ-score column (only when scores present) + as-of beta banner; `GexCard` on SPY/QQQ/IWM/DIA.
- Jobs: `scripts/options_close_job.sh` (snapshot→score→gex chain); `scripts/com.argus.options-snapshot-{preclose,close}.plist` (05:50/06:10 local Tue–Sat via `job_wrapper.sh`).

### WS-6 — catalysts everywhere (`argus/argus/catalysts/`)
- `reaction.py` — earnings price-reaction % from history.
- `provider.py` — any-ticker `build_catalysts`: yfinance `calendar` (next earnings) + `upgrades_downgrades` (analyst, 90d/cap-3) + `earnings_dates` (past surprise, lxml-optional → `degraded` field); tz-safe date comparisons.
- API: `GET /api/catalysts/{symbol}` (any ticker, not just bridge names).
- Dashboard: header `CatalystStrip` (next/last earnings + analyst action) on every ticker page.
- Today-table catalyst chips (`CatalystCount`) confirmed already shipped in a prior phase (WS-6 item 1).

## 3. Integration actions performed (2026-06-13)

- Merged `ws1-options-intel` then `ws6-catalysts`; conflicts resolved: `argus/argus/api/routes.py` (all of `/api/unusual`, `/api/gex`, `/api/catalysts`, plus prior `/api/extended`, `/api/heartbeats` kept), `dashboard/app/t/[ticker]/page.tsx` (CatalystStrip + GexCard + existing cards composed), this file (reconciled), master plan §9 (both WS-1 + WS-6 rows Done) and §WS-1.2 (MAD=0 amendment applied), both READMEs (kept both sides).
- Installed + bootstrapped the two options plists into `~/Library/LaunchAgents` (gui domain, no sudo).
- Restarted `ai.argus.api`; verified `/api/unusual/SPY`, `/api/gex/SPY`, `/api/catalysts/AAPL`.
- Seeded the DB with a first `scripts/options_close_job.sh` run (snapshots + scores + gex + heartbeats).
- Full sweep on merged main (see §4).

## 4. Regression baseline (merged main)

```
argus:     .venv/bin/python -m pytest tests/   → <count> passed   (WS-1 + WS-6 tests + prior baseline)
dashboard: npx vitest run                       → 45 passed
           npx tsc --noEmit                     → clean
```

## 5. Calendar-gated acceptance — WS-1 scorer beta tag

Median/MAD z-scores are meaningful only after a sufficient own-baseline window. Lift the beta tag only after:
1. Accumulate **≥5 close-snapshot sessions** (plists run Tue–Sat 06:10 local).
2. Export the blind sheet: `cd argus && .venv/bin/python -m argus.options_intel.label_sheet /tmp/unusual_validation.csv`
3. User labels each contract unusual y/n **blind**; compare against the scorer's verdicts (hit rate vs cross_z/own_z).
4. Remove the beta tag (OptionsPanel as-of banner copy) only after the user signs off the labelled week.

## 6. Open items / follow-ups

1. **Optional:** `argus/.venv/bin/pip install lxml` unlocks past-earnings surprise + reaction % in `/api/catalysts` / the CatalystStrip (degrades gracefully without it via the `degraded` field).
2. Options-flow `type` column always renders "—" — yfinance carries no `type` field on chain rows (pre-existing, both live and scored paths). Derive from `contractSymbol`/`inTheMoney` or drop the column — data-layer follow-up.
3. WS-1.4 **day-review post-close summary** (P/C vol vs 20d, IV change, biggest OI moves) was scoped OUT of this plan — it needs day-over-day snapshot deltas (same calendar gate) and is a follow-up panel.
4. WS-6 item 4 (index econ-calendar catalyst chips) deferred to WS-3 (needs the `econ_calendar` table).
5. Cosmetic: 2 unused imports in `gex.py`; the beta-banner double top-border; `GexCard` `shouldRetryOnError:false` also drops transient 500s. Non-blocking.
6. AEDT timing drift: 05:50/06:10 local lands ~2h before the US close during AEDT (Oct–Apr); heartbeat badges surface it (master plan §2.4). The snapshotter is idempotent, so a seasonal clock-check wrapper can be added later.

## 7. Architecture pointers

- Master plan: `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` (§4.1 guardrails, §9 board, §WS-1.2 scorer design).
- Phase B plans: `2026-06-13-phase-b-ws1-options-intel.md`, `2026-06-13-phase-b-ws6-catalysts.md`.
- Service: `ai.argus.api` is a USER LaunchAgent — `launchctl kickstart -k gui/$(id -u)/ai.argus.api` (no sudo). Options jobs: `com.argus.options-snapshot-{preclose,close}` Tue–Sat through `job_wrapper.sh`.
- Worktrees `.worktrees/ws1` and `.worktrees/ws6` can be removed once merges are confirmed (`git worktree remove …`).
