# Argus — Local Multi-Agent Technical Analysis Engine

A local, single-user multi-agent technical-analysis engine for systematic equity and futures research. Runs entirely on your machine, integrates with IBKR, and has no cloud or auth dependencies.

## Disclaimer

This is an educational / portfolio project and is **not financial advice**.
Nothing here is a recommendation to buy or sell any security or instrument.
Any trading or order-execution functionality is provided for research and
demonstration only; use paper/simulated accounts unless you fully understand
the code and accept all risk. Backtested or past performance is not indicative
of future results. The author accepts no liability for any financial loss.

---

## What it does

52 voting agents across six families produce a per-ticker **LONG / SHORT / WAIT** verdict with entry price, stop, target, and R:R ratio. A meta-score weights agent agreement and confidence into a single actionable signal.

| Family | Agents |
|--------|--------|
| Trend | EMA/SMA cross, Supertrend, PSAR, Ichimoku, HMA, KAMA |
| Momentum | RSI, MACD, Stochastic, Williams %R, CCI, ROC, TSI, StochRSI, WaveTrend, STC |
| Volatility | Bollinger Bands, Keltner Channel, Donchian, ATR, TTM Squeeze |
| Volume | OBV, CMF, Accumulation/Distribution, MFI, VWAP, volume surge |
| Structure | Market structure, SMC BOS/order blocks, Wyckoff phase, Elliott wave, ICT concepts |
| Context | RS vs SPY, VIX regime, 52-week position, gap pattern, candle patterns |

## Capabilities

- **Action Card** — single-screen per-ticker verdict with entry, stop, target, R:R, agreement %, and high-conviction flag
- **Screener** — run the full ensemble over a configurable ticker universe in parallel
- **Backtest** — vectorised walk-forward backtest using the live agent ensemble; win rate, profit factor, CAGR, Sharpe, Sortino, max drawdown, equity curve
- **Monte Carlo** — bootstrap-resampled equity-curve distribution → P5/P50/P95, P(loss), P(ruin), pre-trade stress estimator
- **Portfolio analysis** — connects to IBKR, labels each position HOLD/ADD, CONSIDER SELLING, or NEUTRAL
- **Options flow** — PCR, IV skew, max-pain, unusual-volume strikes from EOD chains
- **Alerts** — email (SMTP), Telegram, HMAC-signed webhook; all logged to SQLite
- **MCP server** — exposes `argus_action_card`, `argus_screen`, `argus_portfolio`, `argus_dashboard` tools for Claude Desktop integration

## Quick start

```bash
cd argus
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # fill in ANTHROPIC_API_KEY and IBKR settings
uvicorn argus.main:app --reload --port 8088
```

See [`argus/README.md`](argus/README.md) for full setup, environment variables, and API reference.

## Note on git history

This repository was developed privately and published as a clean snapshot. The single initial commit reflects a curated public release rather than the full development timeline.

## License

MIT — see [LICENSE](LICENSE)
