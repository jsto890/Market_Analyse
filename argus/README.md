# Argus

A local, single-user multi-agent technical-analysis engine for systematic equity and futures research, inspired by the multi-agent quant-research concept. Everything runs on your machine, talks to your **IBKR** account, and has no auth, hosting, or cloud dependencies.

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
| **52 voting agents** | Trend (EMA/SMA/Supertrend/PSAR/Ichimoku/HMA/KAMA), momentum (RSI/MACD/Stoch/Williams/CCI/ROC/TSI/StochRSI/WaveTrend/STC), volatility (BB/Keltner/Donchian/ATR/TTM Squeeze), volume (OBV/CMF/A-D/MFI/VWAP/volume surge), structure (market structure, SMC BOS / order block, Wyckoff phase, Elliott wave, ICS), context (RS vs SPY, VIX regime, 52-wk position, gap pattern, candle patterns). |
| **Screener** | Run the agents over a default ~45-ticker universe (or your own list) in parallel. |
| **Backtest** | Vectorized walk-forward backtest using the live agent ensemble. Win-rate, profit factor, CAGR, Sharpe, Sortino, max drawdown, equity curve, all trades. |
| **Monte Carlo** | Bootstrap-resampled equity-curve distribution → P5/P50/P95, P(loss), P(ruin), avg max DD. Pre-trade stress estimator from entry/stop/target + assumed win-rate. |
| **Portfolio + edge** | Connects to IBKR, lists positions, runs each through the Action Card, labels edge as HOLD/ADD, CONSIDER SELLING, or NEUTRAL. |
| **Hedge calculator** | Inverse-ETF allocation (SH/SDS/SPXU/PSQ/QID) and a SPY put-spread plan sized to your long book. |
| **Flow intelligence** | Best-effort options-flow summary from yfinance EOD chains: PCR, IV skew, max-pain, unusual-volume strikes. (Real-time tape and dark-pool prints are stubbed — see Limitations.) |
| **Alerts** | Email (SMTP), Telegram, and HMAC-signed webhook dispatcher. Every alert is also logged to SQLite. |
| **Chart Chat / Written Analysis** | Grounded in the actual indicator + agent payload. Calls the Anthropic API if `ANTHROPIC_API_KEY` is set; otherwise falls back to a templated narrative. |
| **Journal** | SQLite-backed trade journal. Open / close trades, get per-trade R:R + PnL, win-rate, expectancy. |
| **REST API** | FastAPI app on `127.0.0.1:8088`. ~28 routes. |
| **Minimal UI** | One static HTML page (no framework, no build) with 9 tabs. Everything calls the REST API. |
| **MCP server** | FastMCP server over **stdio** that exposes ~25 tools (`argus_*`) so Claude Desktop, Cursor, etc. can drive the platform directly. |

---

## Quickstart

```bash
cd argus
./run.sh setup       # creates .venv, installs deps, copies .env.example → .env
# edit .env (IBKR + optional Anthropic key + optional alerts channels)
./run.sh api         # starts http://127.0.0.1:8088
```

Open `http://127.0.0.1:8088` in a browser. Try `?symbol=AAPL` on the Action Card tab.

To run the offline validation (no network, no IBKR — uses synthetic OHLCV):

```bash
./.venv/bin/python tests/offline.py
```

Expected output: 65 indicators, 52 agents, action card built, backtest runs, MC stats, FastAPI app + MCP server build.

To run the full smoke test (requires internet for yfinance):

```bash
./run.sh test
```

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
   IBKR_LIVE_TRADING=false # set true ONLY when you really want orders to fire
   ```

The `/api/portfolio`, `/api/account`, and `/api/execute` endpoints (and the `argus_portfolio`, `argus_account_summary`, `argus_place_*` MCP tools) require an active TWS / Gateway connection.

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

Restart Claude Desktop. You'll see ~25 `argus_*` tools (`argus_action_card`, `argus_screen`, `argus_backtest`, `argus_chart_chat`, `argus_place_bracket_order`, etc.).

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
GET  /api/quote/{symbol}
GET  /api/history/{symbol}?period=2y&interval=1d
GET  /api/indicators/{symbol}
GET  /api/action_card/{symbol}
GET  /api/agents
POST /api/screener           {symbols: [...], min_conviction: 0.0}
GET  /api/flow/{symbol}
GET  /api/options/{symbol}
GET  /api/backtest/{symbol}
POST /api/monte_carlo        {trade_returns: [...]}
POST /api/pre_trade_stress   {entry, stop, target, win_rate}
GET  /api/portfolio
GET  /api/account
POST /api/hedge              {portfolio_value, coverage_pct}
POST /api/execute            {symbol, side, qty, order_type, ...}
POST /api/chat/{symbol}      {question}
GET  /api/analysis/{symbol}
GET  /api/journal
POST /api/journal/open       {symbol, side, qty, entry, stop, target}
POST /api/journal/close      {trade_id, exit_price, notes}
POST /api/alert              {title, body, payload, channels}
```

The minimal HTML UI is mounted at `/` and uses these routes only.

---

## Limitations / honest stub list

Some features genuinely require paid market-data subscriptions or proprietary infrastructure. Here's the honest inventory:

- **Real-time options tape** — we use yfinance's EOD chains. There is no consolidated tape feed here. Volume / OI numbers update at most once per day.
- **Dark-pool prints** — not available without a paid feed (e.g. NYSE TRF or Polygon). The "unusual volume" detector uses the EOD chain only.
- **SMS / WhatsApp alerts** — only email, Telegram, and webhook are wired. Twilio / WhatsApp Business need credentials we'd rather not embed.
- **Full ICS / Wyckoff / Elliott** — implemented as heuristic agents (find_peaks-based wave labelling, structure-of-bars Wyckoff phase, simple BOS / order-block detection). Production-grade pattern recognition is its own product.
- **Live order chaining beyond bracket orders** — supports market and bracket via ib_insync. OCA, scaling-out, trailing stops are not exposed (but ib_insync supports them — you'd extend `argus/data/ibkr.py`).
- **News / sentiment ingestion** — not implemented.

Everything else — the 52-agent ensemble, the Action Card, the screener, the backtest, Monte Carlo, the hedge calculator, the journal, the alerts, the FastAPI server, the MCP server — runs end-to-end on your machine.

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
│   ├── data/
│   │   ├── market.py            # yfinance wrapper
│   │   └── ibkr.py              # ib_insync client
│   ├── indicators/
│   │   ├── compute.py           # 65 indicators in pure pandas/numpy
│   │   ├── smc.py               # Smart-Money Concepts heuristics
│   │   ├── wyckoff.py           # phase classifier
│   │   └── elliott.py           # wave labelling
│   ├── agents/
│   │   ├── base.py              # Verdict / Vote / Agent
│   │   ├── strategies.py        # 52 strategy functions
│   │   └── registry.py          # agent registration
│   ├── action_card/builder.py
│   ├── screener/screen.py
│   ├── backtest/{backtest,monte_carlo}.py
│   ├── portfolio/{tracker,hedge}.py
│   ├── flow/options_flow.py
│   ├── alerts/dispatcher.py     # email / telegram / webhook
│   ├── chat/chart_chat.py       # Anthropic-grounded analysis
│   ├── journal/store.py         # SQLite trade journal
│   ├── api/routes.py            # FastAPI app
│   ├── ui/index.html            # one-page UI
│   └── mcp_server/server.py     # FastMCP stdio server
└── tests/
    ├── smoke.py                 # full e2e (needs network)
    └── offline.py               # synthetic-OHLCV e2e (no network)
```

---

## License

MIT — see [LICENSE](../LICENSE).
