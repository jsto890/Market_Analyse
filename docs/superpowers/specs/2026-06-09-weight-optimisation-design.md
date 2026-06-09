# Weight Optimisation Design
**Date:** 2026-06-09
**Scope:** Top-level bridge weights (sentiment / technical / catalyst) and intra-catalyst sub-agent weights (INTRA_WEIGHTS)

---

## ⚠️ REVISION NOTE (post multi-agent review) — supersedes sections below

A three-agent review (quant, data-science, architecture) found a fatal flaw in
the original method, since corrected. **The implemented approach differs from the
original design below; this note governs. See `docs/weight_optimisation/weight_decision.md`
for the result.**

What changed:
- **Labels were wrong.** The bridge `ret_Nd` columns are *trailing* returns, not
  forward. Fix: `tools/weight_opt/historical_bridge_dataset.py` rebuilds **true
  forward** returns from price history, measured from each report date forward.
- **Horizons.** Only 1d/5d/10d have elapsed forward data (33-day span). 20d is too
  thin (27 rows); 126d/252d are impossible now. Deferred to the 6-week checkpoint.
- **Objective.** Per-day **rank-IC** (not top-10 hit-rate/mean, which are too noisy
  at ~5 effective dates), with top-10 metrics kept as secondary read-outs.
- **Optimiser.** Grid search over the sentiment:technical blend *is* the constrained
  optimiser. Ridge is demoted to a **sign-sanity check only** (normalising
  coefficients to sum to 1 is invalid). A **permutation null** quantifies overfitting.
- **Catalyst weight** cannot be learned (one date of data) — set from literature
  prior, forward-validated at 6 weeks.
- **Infrastructure.** Weights moved to `config/weights.yaml` (validated loader,
  fallback to defaults); per-sub-agent catalyst votes now logged daily.

**Verdict:** hold top-level weights at 35/45/20 — no blend beat the permutation
null (p ≥ 0.069 at every horizon) and the per-horizon optima contradict each other.

---

## Goal

Optimise the scoring weights so that high-ranked tickers are the ones that go on to make large price moves. The system is an **entry signal** — the user wants to be in a stock before a large move happens, not at a fixed exit. Time horizon is flexible (1d–6m); magnitude matters more than timing.

---

## Objective Functions

Two metrics, evaluated per walk-forward fold and averaged:

**Metric A — Hit rate of top-10**
For each bridge date, rank all tickers by synthetic `combined_score`. Take the top 10. A pick is a "hit" if its forward return exceeds +10% (long) or −10% (short). Hit rate = hits / 10, averaged across dates in the fold.

**Metric B — Mean return of top-10**
Same ranking, same top-10. Metric is the mean forward return of those picks.

Both metrics computed at **5 horizons: 1d, 5d, 20d, 126d, 252d**. Results compared across horizons to identify weight combinations that are robust rather than horizon-specific. Baseline reference points: equal weights (33/33/33) and current production weights (35/45/20).

Short-side: for DIVERGING/SHORT rows, a hit is a return below −10%. The regression handles this naturally via signed scores.

**Convergence criterion:** if grid search peak and ridge regression coefficient agree within 5 percentage points on a weight, that weight is confirmed. If they diverge >5pp, the current production value is held until more data accumulates.

---

## Architecture

Two phases. Phase 1 agents run in parallel; Phase 2 is sequential.

### Phase 1 (parallel)

**data-agent → `historical_bridge_dataset.py`**
- Loads all bridge CSVs from `~/Market_Analyse/reports/bridge_2*.csv`
- Deduplicates: one row per (date, ticker) using the last run per calendar date
- Attaches forward returns: `ret_1d`, `ret_5d`, `ret_20d`, `ret_126d`, `ret_252d`
- Normalises returns to decimal fractions (validates units via sanity check on ret_1d distribution)
- Outputs `docs/weight_optimisation/panel.csv`

**quant-agent → `grid_search.py`**
- Sweeps `sentiment` ∈ [0.10, 0.65], `technical` ∈ [0.20, 0.70], `catalyst` = 1 − s − t, at 5% increments
- Recomputes synthetic `combined_score` per row using historical `sentiment_score` and `tech_score`
- Evaluates Metric A and Metric B per weight combo per horizon
- Outputs heatmaps (`grid_search_heatmaps.png`) and `grid_search_results.csv` with best combo per metric/horizon

**research-agent → `literature_catalyst_weights.md`**
Synthesises academic and practitioner evidence for each of the 5 catalyst sub-agents:

| Sub-agent | Literature domain |
|---|---|
| `event_catalyst` | Event study literature — M&A, FDA, contract announcements; abnormal return magnitude and speed |
| `earnings_proximity` | Post-earnings announcement drift (PEAD) — one of the most replicated anomalies |
| `squeeze_setup` | Short squeeze mechanics — float-adjusted short interest as return predictor |
| `growth_profitability` | Fama-French quality/profitability factor; revenue growth as leading earnings-surprise indicator |
| `analyst_upside` | Analyst forecast accuracy; consensus upgrades and documented short-term momentum effect |

Produces a ranked importance ordering with citations, translated into a proposed weight vector. Constraints: each sub-agent ≥ 0.05, no single sub-agent > 0.50.

### Phase 2 (sequential, depends on Phase 1)

**quant-agent → `ridge_regression.py`**
- Walk-forward CV: 5 folds across ~33 distinct bridge dates (~6–7 dates per fold). Train on folds 1–N, test on N+1.
- Two regression variants:
  - 2-feature (sentiment + technical) on the full 1,341-row panel
  - 3-feature (sentiment + technical + catalyst) on the 130-row catalyst subset
- Ridge regularisation prevents overfitting on the small dataset
- Normalise coefficients to sum to 1 → optimal weights
- Compare regression result vs grid-search peak; flag divergences >5pp
- Outputs `ridge_regression_results.csv` (coefficients, OOS metric per fold, 95% CI)

**discussion-agent → `weight_decision.md`**
- Reads grid search results, regression results, and literature synthesis
- Reconciles the three evidence sources into final recommended weight values
- Documents reasoning for each weight with explicit uncertainty labels (confirmed / provisional / deferred)
- Flags any weights where evidence is conflicting

**integration → `apply_weights.py`**
- Patches `SENTIMENT_WEIGHT`, `TECHNICAL_WEIGHT`, `CATALYST_WEIGHT` in `sentiment_bridge.py`
- Patches `INTRA_WEIGHTS` dict in `argus/argus/catalyst/score.py`
- Re-runs today's bridge and compares ranking before/after
- Qualitative check: catalyst-strong tickers should move up; terminal-fundamental tickers should move down
- Commits on `weight-optimisation` branch; merges to main only after clean validation

---

## Data Pipeline Detail

**Deduplication:** Multiple bridge CSVs per day exist (re-runs). Use last run per calendar date.

**Return normalisation:** Validate units before fitting. Check ret_1d distribution — values should be in range [−0.5, 0.5] as decimal fractions. If values appear as integers (e.g. 5 meaning 5%), divide by 100. Document the finding in the dataset script.

**Catalyst handling:** Catalyst sub-agent scores are only available for 130 rows (from 2026-06-09 runs). The 2-feature regression uses the full panel; the 3-feature regression uses only rows with catalyst_score present. Results are compared but not merged — the catalyst coefficient from the 3-feature regression is flagged as a prior-informed estimate, not a confirmed empirical result.

**Walk-forward splits:** Sorted by date. 5 folds, approximately 6–7 dates each. No data leakage: each test fold is strictly after its training window.

---

## Intra-Catalyst Forward Validation

At the **6-week checkpoint** (approximately 2026-07-21):
- By then we expect ~40 days of catalyst scores
- Compute Spearman rank-correlation between each sub-agent's individual vote confidence and 5-day forward return
- Sub-agents with near-zero correlation: weight reduced by up to half
- Sub-agents with strong correlation (|r| > 0.15): weight increased proportionally
- Log results to `docs/weight_optimisation/catalyst_weight_history.csv`

---

## Outputs

All saved to `~/Market_Analyse/docs/weight_optimisation/`:

| File | Produced by |
|---|---|
| `panel.csv` | data-agent |
| `grid_search_heatmaps.png` | quant-agent (grid search) |
| `grid_search_results.csv` | quant-agent (grid search) |
| `literature_catalyst_weights.md` | research-agent |
| `ridge_regression_results.csv` | quant-agent (regression) |
| `weight_decision.md` | discussion-agent |
| `forward_validation_schedule.md` | discussion-agent |

Code changes committed to `weight-optimisation` branch; merged to main after validation run.

---

## Current vs Target Weight Ranges

**Top-level (to be determined by optimisation):**
```python
# Current production
SENTIMENT_WEIGHT = 0.35
TECHNICAL_WEIGHT = 0.45
CATALYST_WEIGHT  = 0.20
```

**Intra-catalyst (to be determined by literature + forward validation):**
```python
# Current production
INTRA_WEIGHTS = {
    "event_catalyst":       0.40,
    "squeeze_setup":        0.20,
    "earnings_proximity":   0.15,
    "growth_profitability": 0.15,
    "analyst_upside":       0.10,
}
```

Constraints for optimisation:
- Each top-level weight ≥ 0.10
- Each intra-catalyst weight ≥ 0.05, ≤ 0.50
- All weights in each layer sum to 1.0
