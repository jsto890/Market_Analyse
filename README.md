# Market Analyse — Sentiment × Technical Long-Candidate Discovery

A local research stack that discovers tickers from curated X accounts, broad cashtag/phrase timeline search, and on-demand cashtag lookup — then validates each candidate through a **70-agent technical ensemble** plus a **5-vote catalyst/fundamental leg**. Output is a daily conviction-ranked shortlist, an Obsidian report, and a live Next.js dashboard.

Runs entirely on your machine. No cloud hosting or auth. Optional integrations: **IBKR** (portfolio + execution), **Anthropic** (written analysis), and a companion **Market Review** repo for X/Twitter sentiment ingestion.

See [`OVERVIEW.md`](OVERVIEW.md) for positioning, funnel numbers, and point-in-time performance evidence.

## Disclaimer

This is an educational / portfolio project and is **not financial advice**.
Nothing here is a recommendation to buy or sell any security or instrument.
Any trading or order-execution functionality is provided for research and
demonstration only; use paper/simulated accounts unless you fully understand
the code and accept all risk. Backtested or past performance is not indicative
of future results. The author accepts no liability for any financial loss.

---

## What it does

| Stage | Module | Role |
|-------|--------|------|
| 1. Sentiment discovery | **Market Review** (separate repo) | Curated X accounts **plus** broad cashtag/phrase timeline search and on-demand `$TICKER` search; extracts cashtags, classifies setup labels (`fresh_watch` → `momentum_confirmed`, etc.) |
| 2. Technical validation | **Argus** (`argus/`) | 70 voting agents across 9 families on 65+ locally computed indicators |
| 3. Fundamental leg | **Catalyst** (`argus/argus/catalyst/`) | 5 votes: event catalyst, earnings proximity, squeeze setup, growth/profitability, analyst upside |
| 4. Blend + report | **`sentiment_bridge.py`** | Weighted 3-leg score, regime gating, sector rotation panel, Markdown + CSV |
| 5. Dashboard | **`dashboard/`** | Interactive view of today's bridge signals |

**Typical daily funnel:** ~480 discovered → ~70 actionable → ~22 technically analysed → ~13 fully aligned longs → ~6 high-conviction.

Scoring weights live in [`config/weights.yaml`](config/weights.yaml) (default **35% sentiment / 45% technical / 20% catalyst**).

---

## What you get automatically

The daily pipeline is driven by **Market Review** (`run_daily.sh`, scheduled via **launchd at 08:00**). You do not need to run anything manually for the morning report.

| When | What lands | Where |
|------|------------|--------|
| **Every morning ~08:00** | Full pipeline: X fetch → signal extract → price fetch → setup labels → broad cashtag discovery → Argus bridge → report copy | See steps below |
| **Same run** | Daily report (Markdown) | `reports/bridge_latest.md` + dated `reports/bridge_YYYYMMDD_HHMM.md` |
| **Same run** | Machine-readable bridge output (50+ columns) | `reports/bridge_latest.csv` + dated copy |
| **Same run** | Obsidian note | `~/Documents/Obsidian Vault/Finance/Market Reports/<DATE> Daily Report.md` |
| **When you open the dashboard** | Today's signals (from latest CSV) | `http://localhost:3000` — not pushed; reads local files |
| **1st of each month** | Setup-label forward-return backtest | `docs/label_efficacy/` via `tools/label_efficacy.py` |

**Not sent automatically:** email, Telegram, or webhook alerts. Those fire only when you explicitly call `POST /api/alert` or the MCP `argus_send_alert` tool (and only if SMTP / Telegram / webhook is configured in `argus/.env`).

**Manual bridge runs** (e.g. `python sentiment_bridge.py` from the shell) skip broad cashtag discovery and produce fewer candidates than the scheduled daily run. Use `--extra-tickers` for parity — see [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md).

---

## Sample daily report

GitHub cannot render a PDF inline in README markdown. Below is a **scrollable preview** (one stitched image of the PDF pages inside a fixed-height box). [Download the full PDF](docs/assets/sample-daily-report.pdf).

<div align="center">

<div style="width: 100%; max-width: 720px; height: 480px; overflow-y: auto; overflow-x: hidden; border: 1px solid #30363d; border-radius: 8px; padding: 4px; background: #0d1117;">
  <img src="docs/assets/report-preview/scroll-preview.png" alt="Sample daily report preview" width="100%" />
</div>

<p><a href="docs/assets/sample-daily-report.pdf"><strong>Download sample report (PDF)</strong></a></p>

</div>

To refresh the preview after replacing the PDF: `./scripts/render_report_preview.sh` (requires `poppler` + `imagemagick` — see [`docs/assets/README.md`](docs/assets/README.md)).

---

## Repository layout

```
Market_Analyse/
├── sentiment_bridge.py      # daily report generator (Market Review → Argus → report)
├── sector_rotation.py       # RRG sector-rotation panel for the report
├── config/
│   ├── weights.yaml           # bridge + catalyst_intra scoring weights (committed)
│   └── sector_taxonomy.yaml   # family → sub-sector taxonomy (committed)
│   # sector_*.json caches are local-only (gitignored; regenerated by bridge)
├── scripts/
│   └── render_report_preview.sh  # README PDF → scroll PNG
├── reports/                   # gitignored — bridge_*.md/csv, backtest outputs
├── argus/                     # technical engine + REST API + MCP (see argus/README.md)
├── dashboard/                 # Next.js UI (see dashboard/README.md)
├── tools/
│   ├── label_efficacy.py      # monthly forward-return backtest by setup label
│   ├── analysis/              # selection / verdict research scripts
│   ├── backtest/              # agent + selection backtests
│   ├── validation/            # regime-gate validation
│   └── weight_opt/            # weight optimisation experiments
└── docs/                      # design specs, session handoffs, label efficacy, README assets
```

---

## Quick start

### 1. Argus API (technical engine)

```bash
cd argus
./run.sh setup
# edit .env — IBKR, optional Anthropic key, optional alerts
./run.sh api          # http://127.0.0.1:8088
```

### 2. Daily bridge report

Requires Market Review's `ticker_setups.csv` (set `MARKET_REVIEW_REPORT` if not at the default path):

```bash
cd Market_Analyse
MARKET_REVIEW_REPORT=~/Market_Review/reports/ticker_setups.csv \
  python sentiment_bridge.py --min-quality 6
```

Outputs `reports/bridge_latest.md` and `reports/bridge_latest.csv`.

### 3. Dashboard

```bash
cd dashboard
npm install
npm run dev           # http://localhost:3000
```

Start the Argus API on `:8088` for live quotes, screener, and portfolio pages.

---

## Daily report structure

1. **Market regime** — SPY+QQQ risk-on/off; chase labels (`extended` / `late_chase`) gated by regime
2. **Sector rotation** — equal-weight RRG panel vs SPY (Leading / Improving / Weakening / Lagging)
3. **Aligned** — sentiment + technical + fundamental all bullish (group1)
4. **High conviction, pulling back** — strong social quality + catalyst, weak sentiment (dip watchlist)
5. **Technical + Fundamental bullish** — group2; 🔸 = near-aligned (sentiment just below threshold)
6. **Long Candidate Detail** — per-ticker evidence blocks with returns strip, agent votes, catalysts

---

## Further reading

| Doc | Contents |
|-----|----------|
| [`OVERVIEW.md`](OVERVIEW.md) | Product positioning, funnel, performance stats, stack |
| [`argus/README.md`](argus/README.md) | Agent families, REST API, MCP, IBKR, alerts, limitations |
| [`dashboard/README.md`](dashboard/README.md) | Dashboard pages, data sources, dev setup |
| [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) | Latest pipeline changes and open follow-ups |

---

## Note on git history

This repository was developed privately and published as a clean snapshot. The single initial commit reflects a curated public release rather than the full development timeline.

## License

MIT — see [LICENSE](LICENSE)
