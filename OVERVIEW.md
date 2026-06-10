# Argus — Sentiment-Driven Long-Candidate Discovery

**One line:** A local engine that monitors a curated set of market commentators, discovers the tickers they're talking about, and validates each one through a 70-agent technical ensemble — producing a daily, conviction-ranked shortlist of long candidates.

It is a **discovery and selection** tool. It surfaces and ranks ideas; entry timing, position sizing, and exits are left to the operator.

---

## How it works

A two-stage daily pipeline:

**1. Sentiment discovery (Market Review)**
- Monitors **~24 curated X / Twitter accounts**, scored into **4 trust tiers** (core-alpha, swing-watchlist, long-term-research, sentiment-noise) by their historical hit rate.
- Extracts every cashtag mentioned and ranks each ticker by mention volume, distinct-account breadth, account trust, clustering/co-mention, and catalyst presence — roughly **~480 tickers surfaced per day**, labelled from `noise` up to `momentum_confirmed`.
- Can also run on-demand cashtag search across the **full public timeline** for any single name (beyond the monitored list).

**2. Technical validation (Argus)**
- Each qualifying ticker is run through **70 voting agents** across 9 families (trend, momentum, volatility, volume, market structure, weekly structure, institutional/SMC, plus pre-filter and risk gates), built on **67 indicators** computed locally from daily market data (yfinance EOD; Interactive Brokers is used only for the live portfolio overlay and optional order execution).
- A meta-score weights agent agreement and confidence, applies regime detection and multi-timeframe gating, and emits a **LONG / SHORT / WAIT** verdict with reference entry / stop / target levels.
- The two reads are blended (40% sentiment / 60% technical) and each ticker is labelled by **alignment** — *Aligned* (both bullish), *Diverging*, *Contrarian*, *Tech-Wait*, *Neutral*.

**Typical daily funnel:** ~480 discovered → ~70 actionable → ~22 technically analysed → ~13 *Aligned* longs → ~6 high-conviction.

**Output:** a dated Markdown report (formatted for an Obsidian vault) plus paired CSV, and a live local dashboard. Each ticker shows setup, account trust, Argus verdict, regime, reference levels, and a colour-coded **1D / 1W / 1M / 6M / 1Y return** strip.

---

## Evidence (point-in-time)

Every *Aligned* selection from **2026-05-07 → 06-08 (65 names)** was re-tested by truncating each ticker's price history to its first-flagged date, re-running the current engine, and measuring what happened next:

- **Average peak gain: +23.3%** to the high (max favourable excursion from the flag date) in a **median ~7 trading days**
- **60% of names reached +10%**, 30% reached +25%, 13% reached +50%
- Best: SIVE +153%, ARM +101%, MRVL +91%, OUST +82%, AAOI +57%

**Read these as peak, not realized.** The figures above are how far each name *ran*, not what an exit rule would have captured — under mechanical stop/target exits the same selections realise only ~break-even. The edge is in **discovery and direction**, not exit geometry, which is deliberately left to the operator.

**Two caveats stated up front:**
- The window (May–Jun 2026) was a strong tech bull run and a single regime — this is encouraging evidence, **not** a validated backtest. Multi-regime data is needed.
- Acting on the engine's *downgrades* hurt: across 39 exit events, 87% were followed by further gains (avg +22.6% left behind). Selections are best **held**, with exits managed by the operator — not by a verdict flip.

Supporting exhibits: `reports/selection_performance.csv`, `reports/selection_backtest.csv`.

---

## What it is / isn't

- **Is:** a daily, defensible, point-in-time-validated **discovery + long-selection** engine with transparent reasoning (every agent vote and account is inspectable).
- **Isn't (yet):** a complete trading system. No automated exit, sizing, or portfolio-level risk claim.

## Stack
Runs entirely locally. Python (pandas/numpy, FastAPI), Next.js + TypeScript dashboard, SQLite, daily market data via yfinance, optional Interactive Brokers (portfolio + execution) and Anthropic API (written analysis). No cloud dependency.

---

*Educational / research project. Not financial advice. Past or backtested performance is not indicative of future results.*
