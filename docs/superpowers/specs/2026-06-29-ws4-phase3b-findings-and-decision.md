# WS-4 Phase 3b — Health-Calibration Findings & Decision

**Date:** 2026-06-29 · **Status:** CLOSED — ship 1/N (no calibration), health stays a dormant heuristic.
**Design:** [2026-06-27-ws4-phase3b-health-calibration-design.md](2026-06-27-ws4-phase3b-health-calibration-design.md)

## TL;DR

The 3a health monitor's five "deterioration" signals (H1 momentum rollover, H2 trend break,
H3 distribution, H4 RS decay, H5 catalyst) **do not predict forward deterioration of a held
long — they are mildly ANTI-predictive.** They fire on buyable, mean-reverting dips inside
strength-selected positions. **No signal graduates; 3b-3 calibration is moot; we ship the
equal/heuristic weights unchanged and surface health nowhere.**

## What was built (3b-1 / 3b-2), all on `main`

- **3b-1 corpus** — point-in-time S&P 500 membership (752 names incl. 249 in-window
  departures) + SQLite price cache. Live build: **618 names fetched, 120 skipped** (yfinance
  cannot serve delisted departed tickers → residual survivorship that *attenuates* H1/H2/H4).
- **3b-2 evaluator** — forward-MAE label, per-day rank-IC / AUC, **cluster bootstrap** CI,
  **within-day permutation null + Holm** graduation. A 2-agent audit fixed three blockers
  (binary-proxy Holm → real permutation p; zero-width-CI auto-graduation → abstain guard;
  series-end label → see "label" below).
- **Engine prerequisite fix** — `compute_levels` pinned the profit target to the breakout
  high → rr≈0 → RR-floor vetoed ~every entry (1 trade / 9 names / 6 yr). Fixed to
  `max(entry+2R, forward overhead resistance)`; real-data smoke went **1 → 93 trades**,
  **+0.12 R/trade**, payoff 1.54. This unblocked the corpus.

## Methodology corrections forced by the data

1. **Label = FIXED forward 20-day window, not capped at exit.** The exit-cap reintroduced
   F3 time-to-exit **censoring**: deterioration flags fire late in a hold (H2 ~11 bars to
   exit vs ~21 for non-firing bars) → short capped window → mechanically small MAE → spurious
   negative IC (capping inflated H2's −IC ~6×). For an alert-only, P&L-decoupled score the
   coherent estimand is the stock's forward downside over a fixed horizon. (`build_panel`
   default `cap_at_exit=False`.)

## Results

**Graduation, 145-name representative sample, 56,050 LONG-bars, corrected label:**

| signal | fire | rank-IC vs fwd-MAE | perm-p | cluster-CI | AUC | graduates |
|---|---|---|---|---|---|---|
| H1 momentum | 8.6% | −0.003 | 0.71 | [−.031,+.024] | 0.498 | no |
| H2 trend break | 2.5% | −0.011 | 0.90 | [−.041,+.026] | 0.498 | no |
| H3 distribution | 0.3% | −0.049 | 0.997 | [−.092,+.013] | 0.500 | no |
| H4 RS decay | 3.9% | +0.025 | 0.001 | **[−.008,+.059]** | 0.503 | artifact only |
| composite | — | −0.007 | — | [−.037,+.023] | — | — |

H4 is significant only by the permutation test (56k rows make microscopic effects
"significant"); its effect is negligible (AUC 0.503) and its **cluster-bootstrap CI includes
zero** — it does not robustly clear the day-clustered null.

**Investigation, 32,523 LONG-bars / 78 names (`panel_invest.csv`):** the flags are
**contrarian**. Flagged ("unhealthy") bars vs perfect-health bars:

| | forward MAE (ATR) | forward 20d return |
|---|---|---|
| flagged (12.8%) | **2.33** | **+1.51%** |
| perfect health (87.2%) | 2.58 | +0.61% |

`spearman(health, fwd_MAE)=+0.036`, `spearman(health, fwd_return)=−0.032` — higher health
robustly predicts *worse* forward outcomes. Every flag, both measures, every sample size.

**Buyable-dip lead, tested and rejected as a signal:** the +0.9%/20d edge has perm-p 0.0005
but **cluster-CI [−0.009, +0.055] (includes 0)** and is **regime-dependent** — positive in
trending years (2017/2020/2021/2024), negative in 2015/2022/2023 (choppy/bear). It is a
bull-market "dips bounce" effect, not durable, regime-robust alpha.

## Why (mechanism)

A **selection effect.** The engine holds *strength-selected* names, so within those positions
a short-term momentum-rollover / trend-break / distribution signal marks a transient dip that
resumes upward, not a failing position. This coheres with the project's prior finding that
*selection beats mechanical exits* — a deterioration-based monitor fights that edge.

## Decision

1. **Ship 1/N — no calibration.** The pre-registered "calibrated must beat 1/N OOS" gate
   fails by construction (can't weight anti-signals into a predictor). `health.py WEIGHTS`
   stay frozen. **3b-3 is not built (moot).**
2. **Health stays dormant.** It is written to `position_signals` but surfaced nowhere and
   drives no trade. A marker in `health.py` warns against surfacing it as "deterioration".
3. **3b machinery is retained** (`labels/evalstats/panelbuild/evaluator`, corpus) — reusable
   to evaluate any *redesigned* signals.

## Recommended follow-up (3a redesign — separate effort)

Design signals that capture **genuine trend-death** rather than mean-reverting dips, e.g.
failed-bounce / lower-low confirmation, longer-horizon rollover, or breadth/RS breakdown that
*persists*. Re-run the 3b-2 graduation (now corrected and validated) on the redesigns; ship
only what beats the permutation **and** cluster-bootstrap null. The contrarian result itself
(strong-name dips bounce in trending regimes) is a property of the selection edge, not a
standalone tradeable signal.

## Caveats

- **Survivorship via yfinance:** 120 delisted departed names unfetchable → the corpus
  understates H1/H2/H4 deterioration somewhat. A delisting-inclusive data source would tighten
  the null but is very unlikely to flip an anti-predictive sign this consistent.
- **Single frozen baseline:** results are conditional on the default-`EngineParams`
  technicals-only engine and `sector=None` (SPY-only RS for H4).
