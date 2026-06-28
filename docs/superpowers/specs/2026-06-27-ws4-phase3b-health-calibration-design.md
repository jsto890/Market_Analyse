# WS-4 Phase 3b · Health-Weight Calibration — Design Spec

**Date:** 2026-06-27
**Status:** design (awaiting user review → implementation plans)
**Follows:** Phase 3a (alert-only health monitor, merged `3577344`). Parent design: `docs/superpowers/specs/2026-06-17-ws4-position-engine-design.md` §7.

## 1. Goal & non-goals

**Goal.** Replace the hand-set health weights `{H1:15,H2:25,H3:25,H4:15,H5:20}` shipped in 3a with weights **derived from data and validated out-of-sample**, so the alert-only composite reflects each signal's demonstrated power to forecast forward deterioration — *and only if the calibrated weights provably beat equal weighting out-of-sample; otherwise we ship equal weights.*

**Non-goals (deferred, by design).**
- Health driving exits — stays **alert-only** in v1. Calibrating the score does not promote it to a decision rule.
- H5 (catalyst/earnings) — still **injected, default off**; it has no event feed yet, so it cannot be calibrated. Its weight stays 0 until a later phase wires the data.
- Cox proportional-hazards modelling and CSCV / deflated-Sharpe overfitting controls — acknowledged as the heavier-rigor upgrade; **out of scope for v1** (the predictive framing below sidesteps the censoring problem they solve).

## 2. Why this design (3-agent review outcome)

The original plan (current-S&P-500 corpus; per-signal censoring-aware paired-Δ in R; `weight ∝ effect-size`; ≥3 disjoint time slices) was pressure-tested by three independent analysts (quant, statistics, literature). They **converged unanimously**: the trade-replay *plumbing* is sound, but the *estimand and the weighting rule* are wrong for an alert-only score. The five corrections below are load-bearing; each maps to a concrete element of the design.

| # | Finding | Design response |
|---|---|---|
| F1 | **Objective mismatch.** Fitting an alert-only score (moves no trade) to a counterfactual exit-Δ in R is incoherent; the P&L "beats baseline" gate is undefined. | **Predictive objective** (§4): health forecasts forward 20-day max adverse excursion; scored by rank-IC / AUC / calibration, never P&L. |
| F2 | **`weight ∝ effect-size` overfits.** At this DoF/effective-sample, weight estimation error dominates the true spread (DeMiguel 1/N; Timmermann combination puzzle; Mgmt Sci 2020). | **Shrink toward 1/N** (§5): ship calibrated weights *only if* they beat equal weighting OOS; else ship 1/N. |
| F3 | **Δ=0 censoring trap.** Treating stop-before-flag as a zero collapses bootstrap variance → false graduations, worse for rarer signals (competing risks). | Predictive framing measures health-vs-forward-outcome over a fixed window, avoiding the counterfactual-exit censoring entirely (§4). |
| F4 | **Survivorship is directional**, attenuating exactly H1/H2/H4 and distorting the *ranking*, not just the level. | **Point-in-time S&P 500** membership + delisting prices (§3); pre-registered min effect-size threshold (§6). |
| F5 | **Inference too loose.** Time-only bootstrap CIs are anti-conservative under cross-sectional correlation; 5 uncorrected tests ⇒ ~19–23% FWER; within-sample "disjoint" slices aren't OOS. | **Cluster bootstrap** + **Holm-Bonferroni** + **time-ordered walk-forward** with a 3-way split + **pre-registration** (§5, §6). |

## 3. Sub-system 3b-1 — Corpus + cached data layer

A reusable offline corpus the evaluator reads repeatedly without re-fetching.

- **Universe = point-in-time S&P 500.** Reconstruct historical membership from the public S&P 500 change list (add/drop events, available since well before our window). Each ticker is included **only for the dates it was actually in the index**. This removes the survivorship bias (F4) that current-membership-only would bake in.
- **Delisting handling.** For tickers that went inactive while in-index, append the last available price history; do not silently drop them — they carry the strongest deterioration outcomes.
- **Data.** Daily OHLCV per name via the existing `get_history`/yfinance path (`period="max"` or a long window), ~2014→present (covers ≥3 distinct regimes incl. the 2022 bear). **Cache format = SQLite** — a single `argus/backtests/_corpus/corpus.db` with a `prices(ticker, date, open, high, low, close, volume)` table, PK `(ticker, date)`, written via the existing `get_conn` idiom (parquet is *not* an option — neither pyarrow nor fastparquet is installed in `argus/.venv`, and the project standardises on SQLite). Re-runs read the cache → offline, repeatable. Names with insufficient history or fetch failures are skipped and logged; the skip list is part of the run artifact.
- **Benchmarks.** SPY + the 11 sector ETFs cached the same way (H4 needs sector RS).

**Output:** a `corpus_manifest.json` (tickers, in-index date ranges, bars available, skips) + the parquet cache.

## 4. Sub-system 3b-2 — Predictive evaluator

Measures each signal's power to forecast forward deterioration of an open long, on the corpus.

- **Trades.** Run the fixed technicals-only Phase-2 backtest (the validated baseline engine, default `EngineParams`) across the corpus to produce LONG trade-days (each bar a position is open). The engine and its constants are frozen — calibration touches only health weights.
- **Label (pre-registered).** For each in-position trade-day *t*, the **forward 20-day max adverse excursion (MAE)**: the largest drawdown from the close at *t* over the next `min(20, bars_to_actual_exit)` bars, expressed in **ATR(14) units** at *t*. A binary companion label `adverse = MAE ≥ k·ATR` (k pre-registered, e.g. 1.5) supports AUC/Brier scoring. The window is capped at the real exit so we never score beyond the held position.
- **Per-signal skill.** For each signal Hᵢ (computed point-in-time at *t* from 3a's `health.py`), estimate its association with the forward label: Spearman rank-IC of the flag/score against MAE, and AUC against the binary label. A signal **graduates** iff its skill is positive with a confidence interval excluding zero **after Holm-Bonferroni** across the (≤5) signals.
- **Cluster bootstrap (F5).** CIs come from resampling **whole trading-day cross-sections** (all names active on a sampled date move together) using **stationary blocks of ~20–40 trading days**, with a **by-name cluster** resample as a robustness check. This preserves the dominant contemporaneous + serial correlation, unlike a time-only or per-observation bootstrap.

**Output:** `graduation_report.json` — per-signal rank-IC/AUC, bootstrap CI, Holm-adjusted verdict, firing base rates.

## 5. Sub-system 3b-3 — Calibrator + walk-forward OOS gate

Turns graduated-signal skill into weights, shrinks them toward equal, and only ships them if they win out-of-sample.

- **Weights from a shrunk multivariate fit.** Fit a **ridge-regularized (L2) model** of the binary adverse label on the (graduated) signal indicators; the shrunk coefficients de-correlate the overlapping price signals (H1/H2/H4) and give marginal — not double-counted — contributions. ⚠️ **Caveat carried from the prior `tools/weight_opt` study (`docs/weight_optimisation/weight_decision.md`): raw ridge coefficients are NOT weights — they carry feature scale and can go negative.** Because the inputs here are 0/1 signal indicators (common scale) and only *graduated* (positive-skill) signals enter, this is muted, but the calibrator must standardise inputs, clip at 0, and renormalise — never ship a raw coefficient. Non-graduating signals are fixed at weight 0. Interpolate the resulting weight vector toward equal weights by a shrinkage factor λ tuned **inside the training fold only**. Renormalise the live signals' weights to a fixed composite scale.
- **The decisive gate (F2).** The calibrated weights ship **only if they beat equal weighting (1/N among graduated signals) on the walk-forward OOS windows**, judged by the §4 predictive metrics (rank-IC / AUC / Brier vs a constant-health null). **If they do not beat 1/N on every OOS window, we ship equal weights.** Shipping 1/N is a legitimate, expected, provable outcome — not a failure.
- **Walk-forward, time-ordered, 3-way split (F5).** Expanding windows, fit always strictly before test in calendar time, e.g.: train 2014–2020 → test 2021; +2021 → test 2022; +2022 → test 2023; +2023 → test 2024. Within each training window a 3-way separation: **select** graduates (Holm) on one block, **fit** weights+λ on a second, leaving the test window untouched for **validate**. Trades straddling a boundary belong to the window in which they opened.
- **Write-back.** The single change to the live engine is the `WEIGHTS` dict (and, if equal-weight wins, an explicit equal-weight vector) in `argus/argus/position_engine/health.py`, plus a `calibration_report.json` capturing the decision, the OOS metrics, and the pre-registration hash.

## 6. Pre-registration protocol (frozen before any OOS look)

To make F1–F5 binding rather than aspirational, the following are committed to a checked-in `calibration_preregistration.json` **before** the evaluator reads any OOS window: the forward-outcome window (20 trading days) and ATR threshold k; the bootstrap design (block length range, cluster unit, resample count); the graduation rule (positive predictive skill, Holm-adjusted CI excludes 0); the weight formula (ridge + shrink-to-1/N, λ tuned in-fold); the walk-forward split boundaries; and the ship gate (calibrated must beat 1/N on every OOS window). Deviations after the fact invalidate the run.

## 7. Architecture & file structure

New, under `argus/argus/position_engine/`, each a focused unit with data injected (testable offline):

| File | Responsibility | Sub-system |
|---|---|---|
| `corpus.py` | Point-in-time S&P 500 membership reconstruction + cached daily parquet layer + manifest. | 3b-1 |
| `labels.py` | Forward-MAE label (continuous + binary) from an OHLC frame, capped at exit. Pure. | 3b-2 |
| `evaluator.py` | Per-signal rank-IC/AUC vs label across the corpus; cluster bootstrap CIs; Holm graduation. | 3b-2 |
| `calibrate.py` | Ridge fit + shrink-to-1/N; walk-forward 3-way split; OOS beats-1/N gate; write-back + report. | 3b-3 |
| `health.py` | **Modify (write-back only):** the calibrated (or equal) `WEIGHTS`. No structural change to 3a. | 3b-3 |

Bootstrap/stat helpers reuse `metrics.block_bootstrap_ci` where possible (extended for the cluster/stationary variants). Outputs land in a gitignored run dir alongside the Phase-2 backtest artifacts.

**Reusable prior art:** the June-9 discovery-weight study under `tools/weight_opt/` (`grid_search.py`, `historical_bridge_dataset.py`) already implements per-day rank-IC, a 2000-shuffle permutation null, ridge sign-sanity, and panel construction — the **same methodology** the 3-agent review converged on. 3b-2/3b-3 should lift these patterns (rank-IC + permutation null + the "beats null AND sits on a stable plateau" discipline) rather than reinvent them; that study's conclusion (hold weights when nothing beats noise) is the template for our ship-1/N-by-default gate.

## 8. Success criteria

1. The corpus builds offline from cache and reconstructs point-in-time membership (verified against a handful of known add/drop dates).
2. The evaluator produces per-signal predictive skill with cluster-bootstrap CIs and a Holm-adjusted graduation verdict; ≥3 signals graduate (a composite with <3 non-zero weights is not a meaningful multi-signal score — if fewer graduate, that is a reportable finding, and we ship equal weights over the graduates).
3. The calibrator runs the time-ordered walk-forward and emits a clear ship decision: calibrated weights **iff** they beat 1/N on every OOS window, else equal weights — with the OOS metrics shown.
4. The only live-engine change is `health.py`'s weights; 3a's signals, the engine, and the existing 172-test suite are untouched and green.
5. Every choice in §6 is pre-registered before the OOS look; the report records the pre-registration.

## 9. Risks & limitations

- **Residual survivorship** even with point-in-time membership (corporate actions, ticker changes) — documented, and the predictive label is on *forward* outcomes of held names, which limits its impact.
- **yfinance reliability at ~500 names** — mitigated by fetch-once caching, skip-and-log, and a small retry; a partial corpus is acceptable if the manifest records coverage.
- **Few/no signals graduate** — an expected and acceptable outcome; we ship equal weights and report it. The system must not manufacture weight spread that the data doesn't support.
- **λ / threshold sensitivity** — all tuned strictly in-fold; the OOS gate is the backstop against in-sample optimism.

## 10. Implementation decomposition

Three implementation plans, built in order (each ships a tested, self-contained unit):
1. **3b-1** — `corpus.py` (membership + cached data + manifest). Prerequisite.
2. **3b-2** — `labels.py` + `evaluator.py` (predictive skill + cluster bootstrap + Holm graduation).
3. **3b-3** — `calibrate.py` (ridge + shrink-to-1/N + walk-forward gate + write-back).

The first implementation plan covers **3b-1**.
