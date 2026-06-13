# Argus Dashboard

A local Next.js dashboard that surfaces the daily **sentiment × technical × catalyst** bridge output and provides interactive drill-down into individual tickers, account trust tiers, screening, options flow, and IBKR portfolio overlay.

Runs at **`http://localhost:3000`**. Requires the Argus REST API at **`http://127.0.0.1:8088`** for live data (quotes, history, screener, portfolio, chat).

This is the primary UI. The minimal HTML page bundled with Argus (`argus/argus/ui/index.html`) is a dev console only.

---

## Quick start

```bash
# Terminal 1 — Argus API
cd ../argus
./run.sh api

# Terminal 2 — Dashboard
cd dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The Signals page reads from `reports/bridge_latest.csv` in the parent repo. Run `sentiment_bridge.py` (or the Market Review daily pipeline) first to populate it.

---

## Pages

| Route | Purpose |
|-------|---------|
| `/` **Signals** | Today's bridge candidates — high-conviction first, filterable by alignment/verdict. Alignment compass modal (press `g` for spotlight search). |
| `/action/[ticker]` **Action Card** | Per-ticker verdict, vote matrix, family rings, entry/stop/target, agent notes. |
| `/accounts` **Accounts** | Curated X account trust tiers + local watchlist pins. |
| `/screener` **Screener** | Batch-run the Argus agent stack over a ticker list (proxied to `/api/argus/screener`). |
| `/options/[ticker]` **Options** | Options flow summary and chain for a ticker. |
| `/portfolio` **Portfolio** | IBKR positions with Argus edge overlay (requires TWS/Gateway). |
| `/agents` **Agents** | Static list of all 70 voting agents by family. |

Nav shows a live **API status** indicator (green when Argus is reachable).

---

## Data sources

| Data | Source | Notes |
|------|--------|-------|
| Daily signals | `../reports/bridge_latest.csv` | Parsed server-side by `lib/bridge.ts` |
| Live quotes, history, screener | Argus API via `/api/argus/*` proxy | Proxies to `http://127.0.0.1:8088/api/` |
| Account trust tiers | `/api/accounts` | Reads from local config |
| Watchlist pins | SQLite (`../argus.db`) | `better-sqlite3` in `lib/db.ts` |
| Bridge JSON (alternative) | Argus `GET /api/bridge` | Available when CSV exists; dashboard currently reads CSV directly |

### Database schema notes

`heartbeats` table (job, last_run_ts, status, detail): written by scheduled jobs via `argus.heartbeat`; rendered on /sources. DB path = `ARGUS_DB` (dashboard/.env.local), default `<repo>/argus.db`.

### Configuring the bridge CSV path

`lib/bridge.ts` currently hardcodes the absolute path to `reports/bridge_latest.csv`. For a different machine or checkout, update `CSV_PATH` in that file (or set it relative to the repo root).

---

## Bridge CSV columns (key fields)

The bridge CSV carries 50+ columns. Fields the dashboard uses today:

- **Identity:** `ticker`, `setup_label`, `quality_score`
- **Sentiment:** `sentiment_score`, `mentions`, `accounts`, `catalysts`, `top_accounts`, `conviction`
- **Technical:** `argus_verdict`, `argus_score`, `high_conviction`, `agreement_pct`, `long_votes`, `short_votes`, `wait_votes`
- **Levels:** `entry`, `stop`, `target`, `risk_reward`, `entry_quality`, `stop_anchor`, `is_extended`
- **Blend:** `tech_score`, `combined_score`, `alignment` (legacy 2-leg label)
- **Returns:** `ret_1d`, `ret_5d`, `ret_20d`, `ret_126d`, `ret_252d`

Newer report fields (`catalyst_score`, `group1`, `group2`, `near_aligned`, `ticker_regime`, fundamental vote columns) are present in the CSV but not yet fully surfaced in the UI. See `docs/superpowers/specs/2026-06-11-dashboard-overhaul-design.md` for the planned parity work.

---

## API proxy

`app/api/argus/[...path]/route.ts` forwards GET/POST requests to the Argus API:

```
GET  /api/argus/action_card/AAPL   →  http://127.0.0.1:8088/api/action_card/AAPL
POST /api/argus/screener           →  http://127.0.0.1:8088/api/screener
```

Health check: `GET /api/argus/health`

---

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **Recharts** for charts
- **SWR** for client-side data fetching
- **papaparse** for CSV parsing
- **better-sqlite3** for local watchlist/signal persistence

---

## Scripts

```bash
npm run dev      # development server (:3000)
npm run build    # production build
npm run start    # production server
npm run lint     # ESLint
```

---

## Relationship to the daily report

The Obsidian report (`reports/bridge_latest.md`) and this dashboard share the same underlying bridge run. The report uses the full 3-leg grouping model (Aligned / HC pulling back / Tech+Fund / detail blocks + RRG sector rotation). The dashboard is the interactive counterpart — same candidates, with live drill-down — and is being brought to full parity with the report's information model.

For pipeline details see the root [`README.md`](../README.md) and [`OVERVIEW.md`](../OVERVIEW.md).

---

## License

MIT — see [LICENSE](../LICENSE).
