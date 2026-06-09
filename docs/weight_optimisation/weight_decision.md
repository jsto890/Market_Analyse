# Weight Decision — 2026-06-09

## Verdict

**Hold the top-level weights at the current 35% sentiment / 45% technical / 20% catalyst.**
The data cannot distinguish any other blend from the current one with statistical
confidence. Set the catalyst intra-weights from the literature prior (already applied).
Re-run this analysis at the 6-week checkpoint (~2026-07-21) when realised forward
returns and more dates exist.

## Why — the evidence

### Data available (after the review fixed the labels)
The original plan would have optimised against the bridge CSV `ret_Nd` columns,
which are **trailing** returns (the move that already happened before the pick).
We rebuilt **true forward** returns from price history, measured from each report
date forward. Result:

| Horizon | Rows with real forward return | Usable? |
|---|---|---|
| 1d | 786 (19 dates) | yes |
| 5d | 593 (15 dates) | yes |
| 10d | 379 (10 dates) | marginal |
| 20d | 27 | no — excluded |
| 126d / 252d | 0 | impossible (data spans 33 days) |

### Objective
Per-day **rank-IC** (Spearman of blended score vs forward return, averaged over
days) — uses all ~42 names/day, is scale-free, and directly measures "does a
higher score rank the bigger movers higher". Top-10 hit-rate and top-10 mean
return are reported as secondary read-outs (the metrics originally requested),
but rank-IC drives the read because top-10 over ~5 effective dates is too noisy.

### Grid-search result (sentiment share of the 2-leg blend)

| Horizon | Best blend | Best IC (t) | Production 0.437 IC | Permutation-null p95 | p-value |
|---|---|---|---|---|---|
| 1d  | 0.10 sent / 0.90 tech | +0.094 (t=1.36) | +0.049 | +0.102 | **0.069** |
| 5d  | 0.65 sent / 0.35 tech | +0.100 (t=1.51) | +0.076 | +0.114 | **0.095** |
| 10d | 0.35 sent / 0.65 tech | +0.024 (t=0.30) | +0.016 | +0.121 | **0.536** |

Two independent reasons the "best" weights are not trustworthy:

1. **None beats chance.** Under 2000 within-day label shuffles, the best IC at
   every horizon falls *below* the null's 95th percentile (p ≥ 0.069). With ~5
   independent forward windows there simply isn't enough signal to reject "the
   optimiser found the best of noise".
2. **The optima are mutually contradictory.** The best blend is 90% technical at
   1d, 65% sentiment at 5d, 65% technical at 10d. A real structural weight would
   be stable across horizons; this scatter is the fingerprint of overfitting.

The current production blend (≈0.437 sentiment share) sits comfortably inside the
noise band at every horizon — there is no evidenced reason to move it.

### Ridge sign-sanity (direction check only — NOT weights)
Standardised-feature ridge on a rank-transformed target:

| Horizon | sentiment coef | technical coef |
|---|---|---|
| 1d | +4.49 | +7.86 |
| 5d | +15.03 | **−11.55** |
| 10d | +2.61 | +4.98 |

Sentiment is positive at every horizon. The technical leg flips negative at 5d
(one-week mean-reversion in this momentum-heavy universe) and positive at 1d/10d.
This sign instability corroborates the permutation null: the thin data does not
yet support a confident weight, and the technical leg's short-horizon behaviour
is regime-dependent. Coefficients are **not** converted to weights (invalid —
they carry feature scale and can be negative).

## Catalyst intra-weights

Cannot be empirically estimated: catalyst scores exist for a single date
(2026-06-09) whose forward return has barely elapsed. Set from the literature
synthesis (`literature_catalyst_weights.md`), renormalised to sum 1.0:

```
event_catalyst 0.34 · earnings_proximity 0.25 · squeeze_setup 0.19 · growth_profitability 0.14 · analyst_upside 0.08
```

These are a **prior**, not a fitted result, and are flagged for forward validation.

## Actions taken
- Top-level weights: **unchanged** (35/45/20) — held, evidenced.
- Catalyst intra-weights: updated to the literature prior in `config/weights.yaml`.
- Per-sub-agent catalyst votes now logged daily → enables the 6-week validation.

## 6-week checkpoint (~2026-07-21)
By then ~40 dates and realised 20d (partial 126d) returns will exist. Re-run:
1. `historical_bridge_dataset.py` → fresh panel with 20d forward returns.
2. `grid_search.py` → rank-IC + permutation null on the larger sample.
3. Spearman of each logged `vote_*` confidence vs forward return → set catalyst
   intra-weights empirically, replacing the literature prior where the data
   disagrees. Log to `catalyst_weight_history.csv`.

Only change production weights if the optimum (a) beats the permutation null at
p<0.05 and (b) sits on a broad, horizon-stable plateau.
