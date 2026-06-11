# Argus — Sentiment-Driven Long-Candidate Discovery

**One line:** A local engine that monitors a curated set of market commentators, discovers the tickers they're talking about, and validates each one through a 70-agent technical ensemble plus a catalyst/fundamental leg — producing a daily, conviction-ranked shortlist of long candidates.

It is a **discovery and selection** tool. It surfaces and ranks ideas; entry timing, position sizing, and exits are left to the operator.

---

## How it works

A two-stage daily pipeline with a third scoring leg at validation time:

**1. Sentiment discovery (Market Review — separate repo)**
- Monitors **~24 curated X / Twitter accounts**, scored into **4 trust tiers** (core-alpha, swing-watchlist, long-term-research, sentiment-noise) by historical hit rate.
- Extracts every cashtag mentioned and ranks each ticker by mention volume, distinct-account breadth, account trust, clustering/co-mention, and catalyst presence — roughly **~480 tickers surfaced per day**, labelled from `noise` up to `momentum_confirmed`.
- Setup labels: `noise`, `avoid_wait`, `fresh_watch`, `building`, `momentum_confirmed`, `extended`, `late_chase`. Each ticker carries a **`conviction`** field (high/med/low) and the watchlist tracks an **`entry_signal`** on the watch→breakout transition.
- Can also run on-demand cashtag search across the full public timeline for any single name.

**2. Technical validation (Argus)**
- Each qualifying ticker is run through **70 voting agents** across 9 families (prefilter, trend, momentum, volatility, volume, structure, institutional, weekly structure, risk filter), built on **65+ indicators** computed locally from daily market data (yfinance EOD).
- A meta-score weights agent agreement and confidence, applies regime detection and multi-timeframe gating, and emits a **LONG / SHORT / WAIT** verdict with reference entry / stop / target levels.
- Interactive Brokers is used only for the live portfolio overlay and optional order execution.

**3. Catalyst / fundamental leg**
- Five additional votes score event catalysts, earnings proximity, squeeze setup, growth/profitability, and analyst upside from yfinance fundamentals and news.
- Hard gates can **boost**, **derank**, or **veto** the blended score (⚡ / ⚠ / ⛔ in the report).

**4. Blend + group**
- Three legs are blended with weights from `config/weights.yaml` (default **35% sentiment / 45% technical / 20% catalyst**; renormalised when a leg is absent).
- **group1 (Aligned):** technical LONG + catalyst bullish + sentiment ≥ 0.30
- **group2 (Tech + Fund):** technical LONG + catalyst bullish, sentiment below alignment line; 🔸 **near-aligned** when sentiment is in [0.20, 0.30)
- **Pullback bucket:** high social conviction + catalyst, but sentiment weak — dip-buy watchlist
- `extended` / `late_chase` labels are **regime-gated** (included only in risk-on tapes unless overridden)

**Typical daily funnel:** ~480 discovered → ~70 actionable → ~22 technically analysed → ~13 *Aligned* longs → ~6 high-conviction.

**Output:** a dated Markdown report (`reports/bridge_latest.md`, formatted for Obsidian) plus paired CSV, and a live local dashboard at `:3000`. Each ticker shows setup, account trust, Argus verdict, regime, reference levels, catalyst events, and a colour-coded **1D / 1W / 1M / 6M / 1Y return** strip.

**Sector rotation panel:** equal-weight RRG (Relative Rotation Graph) vs SPY for traded industries and custom baskets (e.g. Quantum). Quadrants: Leading / Improving / Weakening / Lagging, with breadth (% above 50-day MA) and Δrank movement.

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

Supporting exhibits: `reports/selection_performance.csv`, `reports/selection_backtest.csv`, `docs/label_efficacy/`.

---

## What it is / isn't

- **Is:** a daily, defensible, point-in-time-validated **discovery + long-selection** engine with transparent reasoning (every agent vote and account is inspectable).
- **Isn't (yet):** a complete trading system. No automated exit, sizing, or portfolio-level risk claim.

## Stack

Runs entirely locally. Python (pandas/numpy, FastAPI), Next.js + TypeScript dashboard, SQLite, daily market data via yfinance, optional Interactive Brokers (portfolio + execution) and Anthropic API (written analysis). No cloud dependency.

| Component | Port / path |
|-----------|-------------|
| Argus REST API | `http://127.0.0.1:8088` |
| Dashboard | `http://localhost:3000` |
| Daily report | `reports/bridge_latest.md` |
| Scoring config | `config/weights.yaml` |

---

*Educational / research project. Not financial advice. Past or backtested performance is not indicative of future results.*
