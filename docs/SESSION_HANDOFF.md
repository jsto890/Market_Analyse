# Session Handoff — Phase B-0 data-plane

_Last updated: 2026-06-13 — branch `phase-b0-data-plane`_

---

## 1. Status

Phase B-0 is **complete** on branch `phase-b0-data-plane` (9 tasks, all committed).

---

## 2. Branch commits (since `838edee`)

```
a68c9da feat(scripts): consolidated daily driver — sentiment + account backtest + ingest, heartbeats throughout
4a5f0d4 feat(scripts): job wrapper — env + caffeinate + heartbeats
a514d27 feat(dashboard): pipeline-health panel + canonical ARGUS_DB resolution
4401acf feat(argus): /api/heartbeats endpoint
4f8a124 feat(argus): heartbeat CLI for shell jobs
fc18d83 refactor(argus): all sqlite access via shared helper, ARGUS_DB env
f3bf06f feat(argus): shared sqlite helper — WAL contract, heartbeats table
d6b7cc9 chore: add .env.example — canonical config contract for both runtimes
```

Plus Task 9 (this commit): wake scheduling, ops README, market.db removal, B-0 status updates.

---

## 3. What was built (B-0 scope)

| Task | Deliverable |
|---|---|
| 1 | `.env.example` — canonical config contract for both runtimes |
| 2 | `argus/argus/db.py` — shared SQLite helper (WAL, busy_timeout, heartbeats DDL) |
| 3 | `argus/argus/settings.py` + `argus/argus/alerts/` routed to shared `get_conn()` |
| 4 | `argus/argus/heartbeat.py` — CLI (`python -m argus.heartbeat <job> <status>`) |
| 5 | `argus/argus/api/routes.py` — `GET /api/heartbeats` endpoint |
| 6 | `dashboard/` — PipelineHealth panel + canonical `ARGUS_DB` resolution |
| 7 | `scripts/job_wrapper.sh` — env + caffeinate + heartbeat envelope |
| 8 | `scripts/run_daily.sh` — daily driver (sentiment → backtest → ingest) |
| 9 | `scripts/setup_wakes.sh`, `scripts/README.md`, doc/status updates |

---

## 4. In-flight / next session

**Immediate next step: integration merge.**

Ordered checklist:

1. **Merge both branches** — Phase A (`phase-a-bug-sweep`) and Phase B-0 (`phase-b0-data-plane`) into `main` (or merge B-0 into A then into main, depending on conflict surface).
2. **Live API restart** — `killall -HUP uvicorn` / `launchctl kickstart -k gui/$(id -u)/ai.argus.api` so the new `/api/heartbeats` route is live.
3. **Create `.env` (repo root) and `dashboard/.env.local`** — copy from `.env.example`; set `ARGUS_DB=<absolute-path-to-argus.db>`; add `ARGUS_API_TOKEN` if desired.
4. **Launchd cutover through `job_wrapper.sh`** — update `com.market-review.daily.plist` to invoke `scripts/run_daily.sh` (or wrap the existing call in `job_wrapper.sh`).
5. **Market_Review backtest dry-run** — run `scripts/run_daily.sh --dry-run` (or equivalent) and verify heartbeats appear on the dashboard /sources page.
6. **User runs `./scripts/setup_wakes.sh` with sudo** — one-time pmset pre-wake at 05:45 local. Agent must NOT run this; it requires an interactive terminal and sudo.

---

## 5. Gotchas

- `setup_wakes.sh` needs a **manual sudo run by the user** — it is NOT executed by any agent or launchd job.
- pmset supports **one repeating wake event** — running `setup_wakes.sh` overwrites any existing repeating schedule.
- During AEDT (Oct–Apr) the US close lands ~07:50 local (after the 05:45 wake); EOD jobs self-heal via backfill, and the heartbeat badge on /sources surfaces any missed night.
- `ARGUS_DB` must be set consistently in both `.env` (Python) and `dashboard/.env.local` (Next.js) or they will hit different files.
- Phase A's branch may have conflicting changes to `argus/argus/settings.py` and `argus/argus/alerts/` — resolve carefully; B-0's `get_conn()` routing is the authoritative version.
