# Labelling backtest — findings and decision (2026-07-27)

**Verdict: the action_label ladder does not rank forward returns. It ranks trailing
returns. The labels describe where a name *is*, not where it is *going*.**

Out of sample the designed ladder inverts exactly:

| designed | PRIME_LONG | > | STANDARD_LONG | > | WATCH | > | WAIT | > | AVOID |
|---|---|---|---|---|---|---|---|---|---|
| **realised (OOS)** | **AVOID** | > | **WATCH** | > | **WAIT** | > | **STANDARD_LONG** | > | **PRIME_LONG** |

This is not a bug in the ensemble. The ensemble is a *state classifier* and it
works as one. The error is in reading its output as a forward-looking conviction
ranking.

---

## Method

| | |
|---|---|
| Corpus | `argus/backtests/_corpus/corpus.db` — point-in-time S&P 500, survivorship-free |
| Universe | 300 names sampled (seed 17) from the 581 with ≥1500 bars |
| Period | 2015-01-14 … 2026-05-27, weekly signals |
| Signals | 167,499 |
| Holdout | `_classify_action` thresholds were fitted on ~2y ending 2026-06-08, so **2015-01 … 2024-06 is a genuine holdout** (138,293 signals). IS = 29,206. |
| Market removed | every forward return is measured against the mean of all names scored **that same date** (cross-sectional demeaning), so what remains is selection, not beta |
| CIs | cluster bootstrap by ticker (weekly signals with 20d holds overlap heavily) |

Scorer fidelity was verified **bit-exact** against `build_action_card` — verdict,
`action_label` and `score` all match on 80/80 sampled points.

Tools: `tools/backtest/backtest_labels_oos.py`, `tools/analysis/analyze_label_oos.py`,
`tools/analysis/analyze_label_timing.py`.

---

## 1. The core finding: the score measures the past

| correlation (OOS) | Spearman |
|---|---|
| `score` vs **trailing** 20d excess return | **+0.666** |
| `score` vs **trailing** 60d excess return | +0.593 |
| `score` vs **forward** 20d excess return | **−0.015** |

A 0.67 correlation with the past and 0.00 with the future. Event-time cumulative
excess return, anchored at the signal (OOS, %):

| label | t−60 | t−20 | t−5 | **t=0** | t+5 | t+20 | t+60 |
|---|---|---|---|---|---|---|---|
| PRIME_LONG | −8.91 | −5.53 | −2.60 | **0** | +0.02 | −0.22 | −0.19 |
| STANDARD_LONG | −8.98 | −6.36 | −1.58 | **0** | −0.06 | −0.16 | −0.07 |
| WATCH | −3.52 | −2.02 | −0.58 | **0** | +0.01 | +0.04 | −0.11 |
| WAIT | +1.44 | +1.03 | +0.24 | **0** | −0.03 | +0.02 | −0.23 |
| AVOID | +8.95 | +5.82 | +1.65 | **0** | +0.03 | +0.08 | +0.25 |

PRIME_LONG names have already outrun their peers by **~8.9%** by the time they are
labelled, then go sideways-to-down. AVOID is the mirror image: down ~8.9% into the
label, then recovers. The label is a near-perfect readout of trailing relative
strength.

**No short-horizon escape hatch.** The long book is negative at every horizon from
2d out — there is no window where momentum persists before reversion:

| horizon | 1d | 2d | 3d | 5d | 10d | 20d | 40d | 60d |
|---|---|---|---|---|---|---|---|---|
| excess % | −0.005 | −0.037 | −0.052 | −0.073 | −0.133 | **−0.278** | −0.357 | −0.344 |
| t-stat | −0.4 | −2.1 | −2.3 | −3.0 | −3.0 | **−3.3** | −2.2 | −1.6 |

**Not the transition either.** Entering on the label change rather than the label
level does not rescue it: onset fwd −0.376% vs continuation −0.151%.

## 2. Label discrimination (OOS, 20d excess)

| label | n | excess | 95% CI | p |
|---|---|---|---|---|
| PRIME_LONG | 5,054 | **−0.254%** | [−0.507, −0.007] | **0.045** |
| STANDARD_LONG | 27,771 | −0.168% | [−0.335, +0.002] | 0.055 |
| WATCH | 42,433 | +0.056% | [−0.064, +0.182] | 0.370 |
| WAIT | 15,976 | +0.015% | [−0.161, +0.205] | 0.895 |
| AVOID | 47,059 | +0.071% | [−0.053, +0.199] | 0.299 |

PRIME_LONG — the highest-conviction label — is the only one **significantly
different from zero, and it is negative**.

In-sample (2024-06 … 2026-05) the ladder looks fine (STANDARD +0.356%, PRIME
+0.149%). The year-by-year long-book excess shows the overfit signature plainly:
negative in 2016, 2018, 2019, 2021, 2022, 2023; positive only in 2024 (+0.217%),
2025 (+0.386%), 2026 (+0.667%) — i.e. only inside the calibration era.

## 3. Win rate and expectancy (OOS, engine ATR exits)

| label | n resolved | win rate | expectancy |
|---|---|---|---|
| PRIME_LONG | 3,816 | 41.3% | +0.03R |
| STANDARD_LONG | 19,429 | 33.4% | −0.06R |
| **WATCH** (untradeable by design) | 36,274 | **40.8%** | **+0.09R** |
| AVOID | 37,489 | 28.8% | −0.22R |

The tradeable long book wins 34.7% against a **36.3% breakeven** at its 1.76 R:R —
a −1.6pp margin, **−0.04R per unit risked, gross of costs**. `WATCH`, the bucket the
system tells you not to trade, outperforms the bucket it tells you to trade.

## 4. Flags — every PRIME gate fails or inverts OOS

Each gate tested one at a time on the OOS long-verdict pool. A gate earns its place
only if `lift` > 0 with a CI clear of zero.

| gate | n pass | lift | verdict |
|---|---|---|---|
| `score >= 0.40` | 58,096 | **−0.166pp** | inverted |
| `weekly == LONG` | 69,437 | **−0.118pp** | inverted |
| `combo in _STRONG_COMBOS` | 23,758 | **−0.096pp** | inverted |
| `combo in _WEAK_COMBOS` (a **veto**) | 12,045 | **+0.301pp**, CI [+0.017, +0.411] | **backwards — vetoes outperformers** |
| `n_eff in [2.0, 3.0]` | 63,367 | +0.087pp, CI spans 0 | no effect |
| `inflation_gap < 0.15` | 75,356 | — | **dead: rejects 29 of 75,385** |
| `regime in (neutral, trending_late)` | 23,816 | +0.011pp | no effect |

Specifically, the `wk_dir == "L"` gate is justified in-code by *"PRIME_LONG backtest
wk=L→55.3% WR vs wk=S→35.7% WR"*. OOS, inside the long book, `weekly=L` scores
**−0.176% excess, CI [−0.345, −0.019]** — significantly negative.

`n_eff`, `inflation_gap` and `agreement_pct` have Spearman correlations with forward
excess of +0.005, +0.010 and −0.002 respectively — no predictive content at all.

**What does survive:** the extension veto (vetoed names underperform, −0.116pp — the
one gate pointing the right way), and `AVOID` as a genuine *negative* signal
(28.8% WR, −0.22R on the short side).

## 5. Exits — one real, separable calibration error

`trending` regime uses a 2.0/4.0 ATR stop/target. Median MFE in that regime is
**2.17 ATR** against a **4.0 ATR** target; only 20.9% of trades ever touch it. Result:
25.4% WR, **−0.24R** — by far the worst regime. The target is placed roughly twice as
far as price actually travels.

Giveback is also material: 76.7% of the long book reaches +1 ATR and 32.8% of those
still stop out; 54.0% reach +2 ATR and 21.0% of those still stop out.

Exit-rule counterfactual: engine ATR exits −0.04R vs hold-to-20d −0.07R. Consistent
with the earlier premise-check — **no exit overlay rescues a book with no entry edge.**

## 6. Bugs found in the existing harness

These would have corrupted any re-run of `tools/backtest/backtest_agents.py`:

1. **Look-ahead in the earnings agent.** `strategies._days_to_earnings` (`strategies.py:17`)
   resolves against `datetime.now()`. In historical replay it stamps *today's* earnings
   calendar onto every past bar — a per-ticker constant that would force ~5% of tickers
   to `WAIT` across their entire history. Correct live, silently wrong in backtest.
   Any harness calling `run_all` inherits this unless it neuters the agent.
2. **Wrong agreement denominator.** `backtest_agents.py` divides by *all* votes;
   production divides by *actionable* votes (`long+short`). This pushed `inflation_gap`
   to [−0.61, −0.20], making the `< 0.15` gate vacuous.
3. **`RS vs Sector` dropped.** Excluding it systematically inflates `|score|`, pushing
   borderline names over the 0.15 verdict and 0.30/0.40 tier gates. Production returns
   `WAIT/0.2` for it when sector data is absent — so it should simply be kept.
4. **`BREAKOUT_LONG` is unreachable.** `_classify_action` can only return PRIME_LONG,
   STANDARD_LONG, WATCH, AVOID, WAIT. The tier mapping tests for a label that never occurs.

## 7. Scope and caveats

- **Universe mismatch is the main threat to external validity.** This corpus is S&P 500
  large caps, where 20d mean reversion is strong. The live system screens
  sentiment-discovered small/mid caps, where momentum persists longer. The *timing
  diagnosis* (label describes the present) is structural and transfers; **the sign of
  the forward edge may not.** Confirming that needs a small/mid-cap point-in-time corpus.
- The earnings risk-filter override is excluded (see bug 1), so these results measure
  the **technical labelling stack only**.
- Effect sizes are small in absolute terms (~0.2–0.3pp over 20d). The finding is that
  the ladder is inverted and the gates are non-predictive — not that fading them is a
  tradeable strategy. The inversion spread (weakest vs strongest decile, +0.220pp) would
  not survive costs.

## 8. Decision

1. **Stop treating `action_label` as forward conviction.** Relabel it in the UI and
   report for what it measures: current technical state / trailing relative strength.
   `PRIME_LONG` should not read as "best expected return".
2. **Do not ship the label ladder as an entry ranker**, and keep automation gated —
   consistent with the WS-4 P2 and WS-7 verdicts.
3. **Retire the gates that are inverted or dead** rather than re-tuning them on the same
   window that produced them: the `_WEAK_COMBOS` veto (backwards), `wk_dir == "L"`,
   `inflation_gap < 0.15` (dead). Re-tuning on 2024-26 is what produced this result.
4. **Fix the `trending` R:R** (2.0/4.0 → target nearer the ~2.2 ATR median MFE). This is
   independent of the labelling problem and is a real, separable improvement.
5. **Fix the four harness bugs** in §6 before any future backtest is believed.
6. **Open question for the forward leg:** if the technical ensemble carries ~0 forward
   information, the forward expectation has to come from elsewhere — the catalyst /
   sentiment leg. Worth testing whether sentiment adds forward signal *conditional on*
   technical state, which is the combination the stack was originally premised on.
