# scripts/

Operational entry points for Market_Analyse. All scheduled jobs run through
`job_wrapper.sh` (sources repo `.env`, holds a `caffeinate -i` assertion, writes
start/ok/error heartbeats to the `heartbeats` table — visible on the dashboard
Sources page and at `GET /api/heartbeats`).

| Script | Purpose | Scheduled by |
|---|---|---|
| `job_wrapper.sh <job> <cmd…>` | env + caffeinate + heartbeat envelope | (wrapper) |
| `run_daily.sh` | sentiment pipeline (Market_Review) → account backtest → dashboard ingest | `com.market-review.daily` 20:30 local |
| `setup_wakes.sh` | one-time pmset pre-wake at 05:45 local (sudo, run manually) | — |
| `render_report_preview.sh` | (pre-existing) report preview | manual |
| `options_close_job.sh` | close chain: snapshot → unusual scorer → GEX | `com.argus.options-snapshot-close` 06:10 local Tue–Sat |
| (module) `argus.options_intel.snapshot --kind preclose` | pre-close chain snapshot | `com.argus.options-snapshot-preclose` 05:50 local Tue–Sat |

Config contract: repo-root `.env` (see `.env.example`). `ARGUS_DB` is the single
SQLite file both runtimes use; Python access only via `argus.db.get_conn()`.
Secrets never go in plists or the repo.
