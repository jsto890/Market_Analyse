# Argus — Local Multi-Agent Technical Analysis Engine

A local, single-user multi-agent technical-analysis engine for systematic equity and futures research. Runs entirely on your machine, integrates with IBKR, and has no cloud dependencies.

## Disclaimer

This is an educational / portfolio project and is **not financial advice**.
Nothing here is a recommendation to buy or sell any security or instrument.
Any trading or order-execution functionality is provided for research and
demonstration only; use paper/simulated accounts unless you fully understand
the code and accept all risk. Backtested or past performance is not indicative
of future results. The author accepts no liability for any financial loss.

---

52 voting agents (trend, momentum, volatility, volume, structure, context) produce a per-ticker LONG / SHORT / WAIT verdict with entry, stop, target, and R:R. Screener, backtest, Monte Carlo, portfolio analysis, and options flow are all included.

See [`argus/README.md`](argus/README.md) for full documentation, setup, and API reference.

## License

MIT — see [LICENSE](LICENSE)
