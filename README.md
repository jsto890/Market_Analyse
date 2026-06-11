# Market Analyse — Sentiment × Technical Long-Candidate Discovery

A local research stack that monitors curated market commentators, discovers tickers they're talking about, and validates each candidate through a **70-agent technical ensemble** plus a **5-vote catalyst/fundamental leg**. Output is a daily conviction-ranked shortlist, an Obsidian report, and a live Next.js dashboard.

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
| 1. Sentiment discovery | **Market Review** (separate repo) | Scrapes ~24 curated X accounts, extracts cashtags, classifies setup labels (`fresh_watch` → `momentum_confirmed`, etc.) |
| 2. Technical validation | **Argus** (`argus/`) | 70 voting agents across 9 families on 65+ locally computed indicators |
| 3. Fundamental leg | **Catalyst** (`argus/argus/catalyst/`) | 5 votes: event catalyst, earnings proximity, squeeze setup, growth/profitability, analyst upside |
| 4. Blend + report | **`sentiment_bridge.py`** | Weighted 3-leg score, regime gating, sector rotation panel, Markdown + CSV |
| 5. Dashboard | **`dashboard/`** | Interactive view of today's bridge signals |

**Typical daily funnel:** ~480 discovered → ~70 actionable → ~22 technically analysed → ~13 fully aligned longs → ~6 high-conviction.

Scoring weights live in [`config/weights.yaml`](config/weights.yaml) (default **35% sentiment / 45% technical / 20% catalyst**).

---

## Repository layout

```
Market_Analyse/
├── sentiment_bridge.py      # daily report generator (Market Review → Argus → report)
├── sector_rotation.py       # RRG sector-rotation panel for the report
├── config/
│   ├── weights.yaml         # bridge + catalyst_intra scoring weights
│   ├── sector_taxonomy.yaml   # Family → sub-sector taxonomy
│   ├── sector_cache.json      # ticker → yfinance sector cache
│   └── rotation_ranks.json    # dated RRG rank snapshots (Δrank)
├── reports/
│   ├── bridge_latest.md       # latest daily report
│   ├── bridge_latest.csv      # machine-readable bridge output
│   └── selection_*.csv        # point-in-time selection backtests
├── argus/                   # technical engine + REST API + MCP (see argus/README.md)
├── dashboard/               # Next.js UI (see dashboard/README.md)
├── tools/
│   ├── label_efficacy.py    # monthly forward-return backtest by setup label
│   └── weight_opt/          # weight optimisation experiments
└── docs/                    # design specs, session handoffs, label efficacy
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
