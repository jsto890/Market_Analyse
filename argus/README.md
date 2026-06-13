# Argus

The technical-analysis engine at the core of Market Analyse. A local, single-user multi-agent system for systematic equity research. Everything runs on your machine, optionally talks to your **IBKR** account, and has no auth, hosting, or cloud dependencies.

Used standalone (screener, action cards, portfolio overlay) or as the validation layer inside `sentiment_bridge.py` (with the catalyst/fundamental leg blended on top).

## Disclaimer

This is an educational / portfolio project and is **not financial advice**.
Nothing here is a recommendation to buy or sell any security or instrument.
Any trading or order-execution functionality is provided for research and
demonstration only; use paper/simulated accounts unless you fully understand
the code and accept all risk. Backtested or past performance is not indicative
of future results. The author accepts no liability for any financial loss.

---

## What's in the box

| Module | What it does |
|---|---|
| **Action Card** | Single screen per ticker — LONG / SHORT / WAIT verdict with entry, stop, target, R:R, agreement %, high-conviction flag. |
| **70 voting agents** | 9 families: prefilter, trend, momentum, volatility, volume, structure, institutional, weekly structure, risk filter. Built on 65+ locally computed indicators. |
| **Catalyst leg** | 5 fundamental votes (event catalyst, earnings proximity, squeeze setup, growth/profitability, analyst upside) used by the sentiment bridge — not part of the standalone Action Card. |
| **Screener** | Run the agents over a default ~45-ticker universe (or your own list) in parallel. |
| **Period returns** | Trailing 1D / 1W / 1M / 6M / 1Y price return per ticker, surfaced in the dashboard and reports. |
| **Portfolio + edge** | Connects to IBKR, lists positions, runs each through the Action Card, labels edge as HOLD/ADD, CONSIDER SELLING, or NEUTRAL. |
| **Flow intelligence** | Best-effort options-flow summary from yfinance EOD chains: PCR, IV skew, max-pain, unusual-volume strikes. (Real-time tape and dark-pool prints are stubbed — see Limitations.) |
| **Options intel** | Structured options-intelligence layer: chain snapshotter, relative-unusual scorer, and GEX engine. See [`options_intel` module](#options_intel-module) below. |
| **Alerts** | Email (SMTP), Telegram, and HMAC-signed webhook dispatcher. Every alert is also logged to SQLite. |
| **Chart Chat / Written Analysis** | Grounded in the actual indicator + agent payload. Calls the Anthropic API if `ANTHROPIC_API_KEY` is set; otherwise falls back to a templated narrative. |
| **REST API** | FastAPI app on `127.0.0.1:8088`. Serves JSON routes and a minimal dev UI at `/`. |
| **Bridge endpoint** | `GET /api/bridge` — latest `reports/bridge_latest.csv` as JSON (powers the Next.js dashboard). |
| **MCP server** | FastMCP server over **stdio** exposing **18 `argus_*` tools** for Claude Desktop, Cursor, etc. |

### Agent families (70)

| Family | Count | Examples |
|--------|-------|----------|
| Prefilter | 1 | ADR% filter |
| Trend | 15 | EMA alignment, Supertrend, PSAR, Ichimoku, HMA/KAMA slope, Minervini template, Weinstein stage |
| Momentum | 17 | RSI zones, MACD, Stochastic, WaveTrend, STC, TSI, Elder impulse, RSI divergence |
| Volatility | 8 | TTM Squeeze, Bollinger, Keltner, Donchian, ATR expansion, VCP, NR7 |
| Volume | 6 | OBV, CMF, A/D, VWAP, volume surge, pocket pivot |
| Structure | 12 | Market structure, SMC BOS/order block, Wyckoff, Elliott, gaps, HTF, candle patterns |
| Institutional | 4 | ICS score, RS vs SPY, RS vs sector, VIX regime |
| Weekly structure | 6 | Weekly EMA, RSI, MACD, price structure, OBV, Bollinger |
| Risk filter | 1 | Earnings proximity |

---

## Quickstart

```bash
cd argus
./run.sh setup       # creates .venv, installs deps, copies .env.example → .env
# edit .env (IBKR + optional Anthropic key + optional alerts channels)
./run.sh api         # starts http://127.0.0.1:8088
```

Open `http://127.0.0.1:8088` in a browser for the minimal dev UI.

To run the offline validation (no network, no IBKR — uses synthetic OHLCV):

```bash
./.venv/bin/python tests/offline.py
```

To run the full smoke test (requires internet for yfinance):

```bash
./run.sh test
```

### Running the sentiment bridge (parent repo)

From the repo root, after Market Review has produced `ticker_setups.csv`:

```bash
MARKET_REVIEW_REPORT=~/Market_Review/reports/ticker_setups.csv \
  python sentiment_bridge.py --min-quality 6
```

Bridge scoring weights are read from `../config/weights.yaml` at startup.

---

## IBKR configuration

1. Install **TWS** or **IB Gateway**.
2. In TWS: *Edit → Global Configuration → API → Settings*
   - Enable **ActiveX and Socket Clients**
   - Set **Socket port** to `7497` (paper) or `7496` (live)
   - Add `127.0.0.1` to **Trusted IPs**
3. In `.env`:
   ```
   IBKR_HOST=127.0.0.1
   IBKR_PORT=7497          # 7497 paper, 7496 live
   IBKR_CLIENT_ID=11
   IBKR_LIVE_TRADING=0     # set 1 ONLY when you really want orders to fire
   ```

The `/api/portfolio`, `/api/account`, `/api/fundamentals`, and `/api/execute` endpoints (and the `argus_portfolio`, `argus_account_summary`, `argus_place_*` MCP tools) require an active TWS / Gateway connection.

---

## Environment variables

See [`.env.example`](.env.example). Key settings:

| Variable | Purpose |
|----------|---------|
| `IBKR_*` | Interactive Brokers connection |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | LLM-written analysis (optional) |
| `SMTP_*` / `TELEGRAM_*` / `WEBHOOK_*` | Alert channels (optional) |
| `ARGUS_HOST` / `ARGUS_PORT` | API bind address (default `127.0.0.1:8088`) |
| `ARGUS_API_TOKEN` | When set, required as `X-Argus-Token` header on `/api/execute` and `/api/alert` |

---

## MCP wiring (Claude Desktop / Cursor)

Add this to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "argus": {
      "command": "/absolute/path/to/argus/.venv/bin/python",
      "args": ["-m", "argus.mcp_server"],
      "cwd": "/absolute/path/to/argus"
    }
  }
}
```

Restart Claude Desktop. Available tools:

`argus_get_quote`, `argus_get_history`, `argus_list_indicators`, `argus_get_indicators`, `argus_action_card`, `argus_list_agents`, `argus_screen`, `argus_options_flow`, `argus_options_chain`, `argus_portfolio`, `argus_account_summary`, `argus_place_market_order`, `argus_place_bracket_order`, `argus_chart_chat`, `argus_written_analysis`, `argus_send_alert`, `argus_status`, `argus_dashboard`

Run the MCP server directly: `./run.sh mcp`

---

## Anthropic / written analysis (optional)

Set `ANTHROPIC_API_KEY` in `.env` to get LLM-written trade narratives grounded in the actual indicator + agent payload. Without a key, the system returns a deterministic templated report — every other feature still works.

---

## Alerts (optional)

Three channels, all best-effort:

- **Email** — set `SMTP_HOST/PORT/USER/PASS` and `ALERT_EMAIL_TO`
- **Telegram** — create a bot via `@BotFather`, set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
- **Webhook** — set `WEBHOOK_URL` (and optionally `WEBHOOK_SECRET` for HMAC-SHA256 signature in `X-Argus-Signature`)

Every alert is logged to `alerts_log` in SQLite even if all channels are disabled.

---

## REST API surface

```
GET  /health
GET  /                          minimal dev UI (static HTML)
GET  /api/quote/{symbol}
GET  /api/history/{symbol}?period=2y&interval=1d
GET  /api/indicators/{symbol}
GET  /api/action_card/{symbol}
GET  /api/agents
GET  /api/screener
POST /api/screener           {symbols: [...], min_conviction: 0.0}
GET  /api/flow/{symbol}
GET  /api/options/{symbol}
GET  /api/portfolio
GET  /api/account
GET  /api/fundamentals/{symbol}
POST /api/execute            {symbol, side, qty, order_type, ...}  [requires ARGUS_API_TOKEN if set]
POST /api/chat/{symbol}      {question}
GET  /api/analysis/{symbol}
GET  /api/bridge             latest sentiment×technical bridge CSV as JSON
POST /api/alert              {title, body, payload, channels}     [requires ARGUS_API_TOKEN if set]
GET  /api/heartbeats         scheduled-job freshness
GET  /api/unusual/{symbol}   latest scored unusual-activity rows + as_of snap date
GET  /api/gex/{symbol}       latest gamma levels (zero_gamma, call_wall, put_wall, total_gex, profile_json) + OI-based caveat
```

DB access: `argus.db.get_conn()` only (WAL + busy_timeout enforced).

The Next.js dashboard at `:3000` proxies these routes via `/api/argus/*`.

---

## `options_intel` module

`argus/options_intel/` implements the structured options-intelligence layer (WS-1):

**Snapshotter (`snapshot.py`)** — captures EOD chain data from yfinance for the snapshot universe (indices + watchlist + bridge tickers, capped). Runs pre-close (~15:50 ET) and at close (~16:10 ET) as separate launchd jobs. Contracts are filtered to ±20% moneyness of spot. Each run is idempotent: rows are keyed on `(snap_date, kind, symbol, expiry, strike, type)` so a re-run on the same date is a no-op. The `kind` field distinguishes `preclose` vs `close` snapshots.

**Relative-unusual scorer (`unusual.py`)** — scores each contract in the latest close snapshot against two baselines: (1) *cross-sectional* — robust median/MAD z-score on `log1p(vol)` across all contracts for that symbol/expiry/date (contracts with OI < 50 excluded); (2) *own-baseline* — same z-score against the contract's own prior close-snapshot distribution, requiring ≥ 10 days of history. MAD = 0 triggers a std-dev fallback; if std-dev is also 0 (or history is too thin) the contract is suppressed rather than assigned a spurious infinite score. Contracts that scored unusual on the prior close earn a persistence bonus (+0.5 to the composite). The scorer carries a **beta** tag until a labelled validation week signs off (see `label_sheet.py`).

**GEX engine (`gex.py`)** — computes a Black-Scholes gamma-exposure (GEX) profile by sweeping spot ±15% in 0.25% steps. Derives zero-gamma flip (where net dealer gamma crosses zero), call wall (peak positive GEX strike), and put wall (peak negative GEX strike). **Dealer-sign convention is a documented assumption** — the engine treats net open interest as reflecting a typical market-maker book (short calls, long puts at strikes with put-heavy OI) and documents this limitation explicitly in the API response's `caveat` field. Because GEX is OI-based it reflects the overnight book, not intraday flow; computation uses the next non-zero-DTE expiry only.

---

## Limitations / honest stub list

Some features genuinely require paid market-data subscriptions or proprietary infrastructure:

- **Real-time options tape** — yfinance EOD chains only. Volume / OI update at most once per day.
- **Dark-pool prints** — not available without a paid feed. Unusual-volume detection uses the EOD chain only.
- **SMS / WhatsApp alerts** — only email, Telegram, and webhook are wired.
- **Full ICS / Wyckoff / Elliott** — heuristic agents, not production-grade pattern recognition.
- **Live order chaining beyond bracket orders** — market and bracket via ib_insync. OCA, scaling-out, trailing stops not exposed.
- **News / sentiment ingestion** — lives in the separate Market Review repo, not in Argus itself.

Everything else — the 70-agent ensemble, Action Card, screener, period-return panel, portfolio edge overlay, catalyst leg (via bridge), alerts, FastAPI server, MCP server — runs end-to-end on your machine.

---

## Project layout

```
argus/
├── requirements.txt
├── run.sh
├── .env.example
├── argus/
│   ├── settings.py              # pydantic-settings + .env
│   ├── main.py                  # uvicorn launcher
│   ├── weights_config.py        # loads config/weights.yaml
│   ├── sector_taxonomy.py       # Family → sub-sector resolver
│   ├── data/
│   │   ├── market.py            # yfinance wrapper
│   │   └── ibkr.py              # ib_insync client
│   ├── indicators/
│   │   ├── compute.py           # 65+ indicators in pure pandas/numpy
│   │   ├── smc.py               # Smart-Money Concepts heuristics
│   │   ├── wyckoff.py           # phase classifier
│   │   └── elliott.py           # wave labelling
│   ├── agents/
│   │   ├── base.py              # Verdict / Vote / Agent
│   │   ├── strategies.py        # 70 strategy functions
│   │   └── registry.py          # agent registration
│   ├── catalyst/                # 5-vote fundamental leg (bridge only)
│   │   ├── score.py
│   │   ├── agents.py
│   │   ├── sources.py
│   │   └── classify.py
│   ├── action_card/builder.py
│   ├── screener/screen.py
│   ├── portfolio/tracker.py
│   ├── flow/options_flow.py
│   ├── options_intel/           # WS-1: chain snapshotter, scorer, GEX engine
│   │   ├── schema.py            # DDL + ensure_schema()
│   │   ├── universe.py          # snapshot universe builder
│   │   ├── snapshot.py          # moneyness-banded chain snapshotter
│   │   ├── unusual.py           # relative-unusual scorer (beta)
│   │   ├── gex.py               # BS-gamma spot-sweep profile + levels
│   │   ├── clock.py             # market-session helpers
│   │   └── label_sheet.py       # blind labelling CSV for scorer validation
│   ├── alerts/dispatcher.py     # email / telegram / webhook
│   ├── alerts/log.py            # SQLite alert log
│   ├── chat/chart_chat.py       # Anthropic-grounded analysis
│   ├── api/routes.py            # FastAPI app
│   ├── ui/index.html            # minimal dev UI (superseded by dashboard/)
│   └── mcp_server/server.py     # FastMCP stdio server
└── tests/
    ├── smoke.py                 # full e2e (needs network)
    └── offline.py               # synthetic-OHLCV e2e (no network)
```

---

## License

MIT — see [LICENSE](../LICENSE).
