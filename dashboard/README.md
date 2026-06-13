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

## Chart design

The ticker chart (`components/CandleChart.tsx`) fetches **2Y of daily bars once** on page load.
Period pills (3M / 6M / 1Y / 2Y) switch the visible range client-side — `lib/chart-range.ts`
exports `visibleRangeFor()` returning a `{from, to}` range that `CandleChart.tsx` passes to
`timeScale().setVisibleRange()` — no refetch, no failure on pill click.
EMA-200 is computed over the full 2Y series and renders correctly on all periods, including
short views where only 64–126 bars are visible (previously it required ≥200 bars in view).

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `ARGUS_DB` | Absolute path to the shared SQLite database | `../argus.db` |
| `BRIDGE_DIR` | Directory containing `bridge_latest.csv` | `../reports` |
| `ACCOUNTS_CSV` | Absolute path to the account-backtest CSV for Sources | none (shows designed empty state) |

## Helper modules (lib/)

| Module | Purpose |
|---|---|
| `lib/chart-range.ts` | Client-side chart period switching — exports `visibleRangeFor()` that maps pill labels to `{from, to}` ranges; `CandleChart.tsx` passes the result to `timeScale().setVisibleRange()` |
| `lib/market-clock.ts` | DST-safe US session state (PRE / REGULAR / AFTER / CLOSED) — pure time math, no data dependency |
| `lib/bar-stats.ts` | Volume ratio, 52-week position, and price range stats for the chart info strip |
| `lib/called-since.ts` | "Called DATE @ $PRICE → now $PRICE (+X%, N days)" — coherent since-called line for ticker headers |

## Regression scripts

```bash
# Check for sliver rows in the Today table (exits 1 if any row height ≤ 10px)
SMOKE_URL=http://localhost:3100 node scripts/row-heights.mjs

# Full smoke test — visits all routes, clicks chart pills, screenshots each page
SMOKE_URL=http://localhost:3100 node scripts/smoke.mjs
```

`scripts/row-heights.mjs` uses Playwright to measure every `tbody tr` height; exits 1 on zero-height
("sliver") rows.  This guards against the B3 regression: the DataTable phantom collapsed-row bug
that collapsed rows to a 1px clickable sliver. The bug was identified by height, not text content
(the text filter missed it because the collapsed row preserved its DOM text).

`scripts/smoke.mjs` visits every route in the ROUTES list, captures console/page errors and failed
requests (IBKR-dependent and argus API failures are in the acceptable-fails list), and runs
`checkChartPills` on ticker routes — clicks each of 3M / 1Y / 2Y / 6M and checks for a
"failed to load" error after each click.

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
