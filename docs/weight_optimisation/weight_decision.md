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

---

# Checkpoint result — 2026-08-03

## Verdict

**Hold at 35 / 45 / 20 again. Both legs of the gate failed.** The headline numbers
the run printed — 5d p=0.012, 10d p=0.000 — look like the first pass this analysis
has ever recorded, and they are an artefact of the null being the wrong null.

## Leg (a): the reported p-values are not interpretable

`_permutation_null` (`grid_search.py:87`) shuffles the forward-return column *within
each date*. That is correctly coded — the shuffle is a genuine within-date
permutation and `tech_score` does survive the subsetting — but it makes every day's
IC independent under the null. The real day-ICs are not: consecutive report dates
share almost the whole of a 10d or 20d forward window. Counting non-overlapping
windows instead of dates:

| horizon | date range | trading days | independent windows | p-floor |
|---|---|---|---|---|
| 5d | 2026-05-07..07-26 | 57 | 12 | 0.0002 |
| 10d | 2026-05-07..07-20 | 52 | 6 | 0.0156 |
| 20d | 2026-05-07..06-23 | 33 | **2** | **0.25** |

So the 40 and 34 "days" the run reports at 5d and 10d are 12 and 6 independent
observations. 20d is worse than thin — with 2 blocks, any test respecting the block
structure has a **minimum attainable p of 0.25**, so 20d cannot produce a significant
result on this panel whatever the data say.

Rebuilt with a dependence-preserving null (moving-block sign-flip of the whole alpha
curve, block length = forward horizon, 20,000 draws):

| horizon | published p | overlap-respecting p |
|---|---|---|
| 1d | 0.7725 | 0.734 |
| 5d | **0.0120** | **0.205** |
| 10d | **0.0000** | **0.247** |
| 20d | not run | 0.256 |

A second, structurally different dependence-preserving null (global ticker-identity
permutation, which keeps each ticker's whole return series and its overlap structure
intact and breaks only the score→return link) agrees: 0.317 / 0.273 / 0.097. Holm
across the horizon family leaves min adjusted p = **0.615**.

5d and 10d are genuinely testable (12 and 6 blocks, floors 0.0002 and 0.0156). They
were tested, and they failed at 0.205 and 0.247. 20d is the one that is untestable by
construction — which matters because its +0.220 IC (t=+4.17) is the most impressive
number the run produced and the one most likely to be quoted later.

Note also what the test certifies even when it passes: the *searched maximum*, not
production. Production alpha=0.4375 scores 5d IC +0.058 (t=+1.41), 10d +0.059
(t=+1.29) — it does not clear on its own terms either.

## Leg (b): the optimum is a boundary corner, not a plateau

`ALPHA_GRID` stops at 0.95, which clipped what was actually happening. Extended to 1.00:

| horizon | argmax alpha | IC | t | Spearman(alpha, IC) |
|---|---|---|---|---|
| 1d | 1.000 | +0.003 | +0.07 | +0.768 |
| 5d | 0.675 | +0.079 | +1.99 | +0.815 |
| 10d | **1.000** | +0.130 | +2.46 | +0.996 |
| 20d | **1.000** | +0.220 | +4.17 | **+1.000** |

The 20d curve is perfectly monotone in sentiment share and peaks at alpha = 1.000 —
**technical weight exactly zero**. All 34 leave-one-day-out refits at 10d and 20d
land on 1.000 too. That is a corner solution running off the edge of the search box.

Because both curves are monotone, the "90% bands overlap at 0.80–0.85" observation
carries no information: any two monotone curves must overlap at the right edge. The
overlap locates the grid boundary, not a peak.

Horizon is also confounded with sample window. Each longer horizon ends earlier —
5d runs to 2026-07-26, 10d to 07-20, 20d only to 06-23 — so the apparent
strengthening with horizon (+0.079 → +0.125 → +0.220) is not three confirmations.
The longest, most impressive horizon is the one that sees *only* the May–June
episode and none of July. Day-block bootstrap argmax intervals are 0.30–1.00 (5d), 0.60–1.00
(10d), degenerate at 1.00 (20d) — the union contains production's 0.4375. There is
no defensible alpha to move to.

## The finding that matters more than the weights

**The technical leg has no measurable cross-sectional edge.** Univariate per-day
rank-IC of each leg alone:

| horizon | sentiment | technical |
|---|---|---|
| 1d | +0.003 (t=+0.07) | −0.024 (t=−0.52) |
| 5d | +0.062 (t=+1.36) | +0.025 (t=+0.64) |
| 10d | +0.130 (t=+2.46) | +0.009 (t=+0.19) |
| 20d | +0.220 (t=+4.17) | −0.056 (t=−1.38) |

Technical never reaches |t| = 1.4 at any horizon and is negative at two of four. The
corrected date-fixed-effect ridge agrees (technical ≈ 0 or negative everywhere).

That is why every grid curve marches to alpha = 1.000: the optimiser is not
discovering that sentiment deserves 85% of the blend, it is discovering it has
nothing to trade off against. **Fitting a blend weight between a weak signal and a
dead one is the wrong exercise.** The 0.45 technical allocation is the thing that
needs investigating, and no weight search on this panel can answer it.

## Erratum to the 2026-06-09 decision

That decision cited the ridge's "sentiment is positive at every horizon" (+4.49 /
+15.03 / +2.61) as corroboration. **That corroboration was never valid.**
`ridge_sanity.py:35` drops the `date` column, so the pooled fit is dominated by a
between-date market-timing channel rather than the per-day cross-sectional effect
the production blend actually operates on. The target is raw integer ranks with
sd 394–511, so the alarming-looking −36.936 in the 2026-08-03 run is −0.072 sd —
noise, not a red flag. Date-cluster bootstrap gives P(sentiment coef > 0) =
0.18 / 0.35 / 0.98: the sign is a coin flip at 1d and 5d. Given a date fixed effect,
every sign agrees with the rank-IC.

So the June "sign flip" scare and the August "sign inversion" scare are the same
non-finding. **`ridge_sanity.csv` must not be cited as veto or corroboration** until
it ranks the target within date, standardises it, and reports a date-cluster CI.

## Catalyst intra-weights: no refit

The pre-registered trigger ("replace the literature prior where the data disagrees")
is **not met**, and the binding reason is sample structure. Every 20d-evaluable vote
row comes from 12 report dates inside a 13-calendar-day span (2026-06-10..06-23), and
every one of those dates has a negative mean 20d return (mean ≈ −0.12). All three
"significant" results — squeeze_setup +0.349, growth_profitability −0.195,
analyst_upside +0.190 — are one cross-section of a single ~12% drawdown. That is a
beta/dispersion reading, not a catalyst signal. Under ticker-clustered inference
nothing among the 12 evaluable tests survives Holm (best adjusted p = 0.102).

`growth_profitability` is **not** inverted despite being reliably negative: its sign
is measured entirely inside that drawdown, inversion was never pre-registered, and
WS-4 3b already set the precedent that anti-predictive signals go dormant rather than
get flipped.

## Why this checkpoint cannot simply be re-run later

The sentiment feed's cross-sectional dispersion collapsed after 2026-07-21, coinciding
with the X-API-402 → Stocktwits fallback going live. Distinct sentiment values per
day: 2026-07-24 gives **4 across 33 names**, 2026-08-01 gives **7 across 35**, versus
25–28 on comparable June days; mean distinct fell 31.2 → 21.4. The effect is
intermittent (07-26 was fine at 56/85), but on the bad days a leg carrying 0.35 of the
live score cannot rank a cross-section at all.

So "wait for July's 10d/20d returns and re-run" is worthless as designed — it would
test a different instrument. Re-open the weight question only on an out-of-block
episode measured with a **stable** feed, clearing a dependence-aware null, and showing
an **interior** argmax.

## Actions taken

- Top-level weights: **unchanged** (35/45/20) — gate failed on both legs.
- Catalyst intra-weights: **unchanged** — pre-registered trigger not met.
- `grid_search.py`: null and reporting defects fixed (see below); re-run required
  before its output is quoted again.
- `ridge_sanity.csv`: struck from the decision until the estimator is corrected.

## Open, not actioned here

1. **The technical leg.** 0.45 of the score with no measurable cross-sectional edge
   at any horizon. This is the real question and it is not a weights question.
2. **The sentiment fallback.** Stocktwits days produce 4–7 distinct values across
   ~33 names. Live defect, affects 0.35 of the score today.
3. **`earnings_proximity` fires 0 times in 927 logged rows.** It reads
   `pool.metrics["days_to_earnings"]` (`catalyst/agents.py:37`), whose only writer is
   behind `if ibkr is not None` (`catalyst/sources.py:171`), and the live pipeline
   injects a shim returning `{}` (`sentiment_bridge.py:249`). `agents/strategies.py:17`
   already computes that value from yfinance — this is wiring, not missing data. The
   `earnings≤14d` display flag (`catalyst/score.py:50`) is dead from the same field.
   Harmless today only because `meta_score` renormalises over non-abstaining votes.
4. **`weights_config.py` cannot express a retired agent.** The fixed-five-key
   validator reverts the *entire* catalyst block to in-code defaults if a key is
   dropped, and those defaults differ from the YAML (earnings 0.15 vs 0.25). Combined
   with the [0.05, 0.50] floor, retirement is inexpressible.
5. **A 26-day hole in the panel, 2026-06-23 → 2026-07-19**, with no other gap above
   4 days. Unexplained, and it cost this analysis its only clean out-of-block window.
