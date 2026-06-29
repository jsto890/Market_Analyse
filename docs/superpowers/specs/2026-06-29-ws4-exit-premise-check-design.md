# WS-4 Exit Premise-Check — Design

**Date:** 2026-06-29 · **Status:** rule family + inference hardened via 2-agent review — awaiting user spec review, then plan.
**Follows:** [2026-06-29-ws4-phase3b-findings-and-decision.md](2026-06-29-ws4-phase3b-findings-and-decision.md)

## Goal

A **go/no-go experiment**: does *any* exit overlay beat **hold-to-structural-stop** on the
**joint MAR-AND-expectancy gate, out-of-sample**? This decides whether it is worth building
*any* health/exit signal for the position engine before investing in signal design.

We answer this before redesigning 3a health signals because the project's edge is *selection*
(holding strength-selected names), the Phase-2/3 work found mechanical exits hard to beat, and
the 3b study found the current deterioration signals are anti-predictive. If no realizable exit
beats simply holding, the answer is "don't build it," and that is a cheap, valuable result.

## Background (why this premise check)

- The engine enters strength-selected longs and holds to a structural/trailing stop (baseline).
- 3b showed the 5 health "deterioration" flags are anti-predictive in held longs — they mark
  buyable mean-reverting dips (a selection effect), not failing positions.
- So the open question is not "which signal predicts deterioration" but "is there *any* exit
  edge over hold-to-stop at all?" — a premise check, not a signal hunt.

## Success criterion (pre-registered)

An exit overlay **wins** iff it beats hold-to-structural-stop on **both** MAR and expectancy on
the pooled out-of-sample trades — i.e. its conjunction p-value `max(p_MAR, p_exp)` (one-sided,
paired name-cluster bootstrap) clears **Holm-Bonferroni** across the candidate rules. **Go** iff
≥1 candidate wins; otherwise **no-go**. The `health_exit` control is reported but excluded from
the Holm family. Full recipe in §Inference.

## Architecture

Two stages over the existing 618-name corpus, reusing corpus → replay → metrics → evalstats.
No engine changes: an *exit overlay* only re-prices *where* an existing baseline trade exits.

```
corpus.db --replay--> baseline trades (entry, structural exit, path, r_multiple, mfe_r, mae_r)
   |
   ├── Stage 1 (oracle): best-in-hindsight exit (~mfe_r) -> ceiling MAR/expectancy = prize size
   └── Stage 2 (rule family): each rule re-prices R over POOLED OOS 2021-24 trades ->
         paired name-cluster bootstrap -> (p_mar, p_exp) -> p_rule=max(.) -> Holm over candidate
         rules -> per-rule win/lose (+regime & correlation annotations) -> report -> go/no-go
```

## Components

### Trade-path extraction
Per baseline trade: the held OHLC path `[entry_bar … structural_exit_bar]`, `entry_px`,
`risk r = entry_px − init_stop`, and the existing `r_multiple` / `mfe_r` / `mae_r` /
`holding_bars` (already on the `trades` row from `replay`). The baseline ("hold") realized R is
the trade's `r_multiple`.

### Stage 1 — oracle ceiling
The best realizable exit in hindsight is at the held-window maximum favorable excursion, whose
realized R ≈ the stored `mfe_r`. Aggregating with `mfe_r` as the realized R gives the
**maximum achievable** MAR/expectancy — the size of the exit-timing prize. Hindsight always
beats hold, so this *sizes the opportunity* (informs whether Stage 2 is worth running); it is
not itself the kill switch. Reported as `oracle_uplift = oracle − hold` on MAR and expectancy.

### Stage 2 — pre-registered exit rule family (`exits.py`)
Each rule is a pure function `rule(path, entry_px, r, full_series_indicators) -> exit_offset`
returning the bar offset (≤ baseline structural exit) at which it would close the trade.
**Fixed parameters — no tuning on test data.**

**Design constraint (from the 2-agent review).** The joint MAR-AND-expectancy gate is brutal for
early exits: the naive move (cut winners to reduce drawdown) lifts MAR but *sinks* expectancy, so
only rules that preferentially exit **round-tripping / stalled / giveback** trades while leaving
genuine trend winners to run can clear both legs. The Stage-1 oracle defines the prize as the
realized-R-vs-MFE-R gap — i.e. the edge, if any, is a **giveback** problem. The family is
therefore weighted toward giveback/peak-trail/structure/stall philosophies, and deliberately
*excludes* exit-on-short-term-weakness rules (down-days, fast-MA-cross) that 3b showed exit into
buyable dips in strength-selected names.

**Five candidates (in the Holm family) — five distinct path functionals, no near-duplicates:**

| rule | philosophy | definition (fixed params) | expected MAR / expectancy |
|---|---|---|---|
| `giveback_trail` ★ | giveback | track `peakR=max(high−entry)/r`, `closeR=(close−entry)/r`; once `peakR≥1.5`, exit when `closeR ≤ 0.60·peakR` (give back 40% of peak). A=1.5R, g=0.40 | up / up-neutral — best shot at both legs |
| `chandelier_high` ★ | trail | `HH=max(high[entry..t])`; exit on first `close < HH − 3.0·ATR14`. Peak-anchored (vs baseline's close-anchored 2.5·ATR) | up / slightly down |
| `donchian_break` ★ | structure | exit on first `close < min(low[t−20..t−1])` (prior 20-bar low; use available history if <20). N=20 | up / slightly down |
| `no_progress` ★ | time/stall | exit when `t − last_new_high_bar ≥ 8` (8 held bars with no new high). M=8 — progress-aware time stop, replaces a blunt calendar stop | up / neutral-up |
| `profit_target_3R` | target | exit on first `close ≥ entry + 3.0·r`. Set above the system's typical ≥2R target so it trims only the extreme tail | up / down — likely fails expectancy, but cleanly answers "does any fixed cap help?" |

★ = primary candidate.

**`health_exit` (control — REPORTED, NOT in the Holm family):** exit on any 3a health flag. A
negative control expected to *hurt*; it validates the pipeline in realized-R terms. Keeping it
out of Holm avoids spending α/m power on a rule pre-registered to fail (both reviewers).

**Dropped vs the first draft:** `time_stop(20)` (blunt — cuts winners; → `no_progress`),
`ema_cross(20)` (the entry *buys* the 20-EMA pullback → whipsaw; mis-specified), `down_days(3)`
(anti-predictive near-duplicate of the control), `profit_target(2R)` (the entry already targets
≥2R → pre-doomed on expectancy; → 3R), `atr_trail_tight(2.0)` (close-anchored, marginal vs
baseline; → peak-anchored `chandelier_high`).

Overlays exit at or before the baseline structural exit (the baseline is the loosest hold). A rule
that never triggers before the structural exit yields that trade's baseline `r_multiple`.

### Re-pricing
A rule's trigger is evaluated on a completed bar; the exit **fills at the next bar's open**
(T+1), matching the engine's fill convention. Realized R = `(fill_open − entry_px) / r`. A rule
that never triggers before the structural exit yields the baseline `r_multiple` for that trade
(so a rule can only differ from hold by exiting *earlier*). The fill open is taken from the
held price path; no intraday model is added (consistent with the daily baseline). **All rules —
including `profit_target_3R` — use this close-trigger/T+1-open convention uniformly** (this
understates a real limit-order target, so a target pass would be conservative; pre-registered for
consistency, not realism).

**Indicator warmup (implementation gotcha, both reviewers).** ATR(14)/EMA/RSI/Donchian for the
exit rules must be computed on the **full daily series with pre-entry warmup** and read at each
held bar — never recomputed from the truncated held window (biased for the first ~14 bars). The
extraction step passes each trade its slice of the full-series indicators, not just OHLC.

### Inference (`premise.py`) — hardened per the rigor review

Two reviewer **blockers** drive this: (i) MAR is a path-dependent nonlinear statistic
(`(net_R/years)/maxDD_R` on the entry-date-ordered cumulative curve) — it **cannot** be
bootstrapped as a per-trade scalar mean; (ii) the joint gate is a *conjunction*, so each rule
needs one real p-value = `max(p_MAR, p_exp)`. The recipe:

1. **Pooled OOS gate (not per-year).** The rules are parameter-free, so there is no fit; but the
   param *choices* (1.5R, 40%, 8 bars, 20-bar, 3R) are human domain calls, so 2014–2020 is treated
   as in-sample and **2021–2024 is the held-out test**. Pool all 2021–2024 trades (bucketed by
   entry date) into one set; the gate is computed on the pool. (Per-year AND-gating has near-zero
   power — per-year is a non-gating annotation instead, step 8.)
2. **Paired aggregate-level MAR bootstrap.** For each of `n_boot=2000` replicates: **name-cluster
   resample** (resample the unique-name list with replacement, collect all trades for each drawn
   name), **sort by entry date**, call `metrics.aggregate()` on both the rule-exited and
   hold-exited versions of those same trades (paired), record `Δmar = mar_rule − mar_hold`.
   `p_mar = mean(Δmar ≤ 0)`.
3. **Expectancy bootstrap (same resamples).** On the paired per-trade delta `(rule_r − hold_r)`,
   same name-cluster resamples / shared seed, record `Δexp = mean delta`. `p_exp = mean(Δexp ≤ 0)`.
4. **Conjunction p-value:** `p_rule = max(p_mar, p_exp)`.
5. **Min-trade floor:** a rule needs **≥ 30 OOS trades it actually exits earlier than hold**;
   below that → `status: ABSTAIN_LOW_N`, excluded from the Holm family (shrinking `m` helps the
   survivors). Bootstrap replicates with < 10 trades return NaN and are dropped from the quantile.
6. **Multiplicity:** `holm({rule: p_rule for non-abstaining rules}, alpha=0.05)` over the **rules
   only** (not rules×years×metrics). `health_exit` is **not** in this family.
7. **Verdict:** a rule **wins** iff `holm()[rule] is True`. **GO** iff ≥1 rule wins; else
   **NO-GO**.
8. **Regime-robustness annotation (non-gating):** for each winning rule, report year-by-year
   `Δmar`/`Δexp` point estimates; tag `regime_robust: true` iff ≥3/4 years are positive on both.
   Informational only — cannot override the verdict.
9. **Correlation report:** pairwise fraction of trades where two rules exit within ±1 bar; pairs
   >0.7 flagged as near-duplicate hypotheses so a GO from correlated rules isn't over-read.

Do **not** reuse `metrics.beats_baseline` (its 15%-relative-MAR-uplift + trades/year cap is
incompatible with early-exit-only overlays). A more powerful alternative to Holm under the strong
positive rule-correlation here is a **Romano–Wolf step-down max-T** over the same bootstrap
resamples — adopt it only if Holm is borderline; Holm is the pre-registered gate (conservative,
already built).

## File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/exits.py` | **New.** 5 candidate rules + `health_exit` control (pure path functionals) + re-pricing to realized R. |
| `argus/argus/position_engine/premise.py` | **New.** Trade+indicator extraction, oracle ceiling, `bootstrap_mar_delta` (paired name-cluster aggregate-level), conjunction-p + Holm, correlation report, regime annotation, `premise_check_report.json` (with `preregistration_sha`). |
| `argus/tests/test_pe_exits.py`, `test_pe_premise.py` | **New.** One per unit. |
| reuse | `metrics.py` (`aggregate`; **not** `beats_baseline`), `evalstats.py` (`holm`), `corpus.py`, `replay.py`, `backtest.py` (`_price_trades`). |
| throwaway | live runner in gitignored `argus/backtests/` (mirrors `_run_graduation.py`). |

## Pre-registration (lock before the live run)

Both reviewers: the rule params are domain choices made knowing the 3b result, so the family must
be frozen *before* touching OOS data. Commit `exits.py` + `premise.py` (with the §Inference recipe
verbatim in the module docstring) and record that commit's git SHA in
`premise_check_report.json["preregistration_sha"]`. Any rule added after that commit is tagged
`exploratory: true` and excluded from the go/no-go verdict (it can seed a second, separately
pre-registered run).

## Testing

TDD, fully offline (synthetic trades / deterministic paths, no network, throwaway tempfile
conns):
- each of the 5 candidate rules + `health_exit` fires at the correct bar on a hand-built path
  (e.g. `giveback_trail` exits only after `peakR≥1.5` then a 40% give-back; `no_progress` after 8
  bars without a new high; `donchian_break` on the 20-bar-low break);
- indicators are read from the full-series warmup slice, not recomputed on the truncated window;
- re-pricing computes the right realized R at the T+1-open fill; a never-firing rule returns
  baseline R;
- oracle equals the MFE-bar R;
- `bootstrap_mar_delta` recomputes MAR via `aggregate()` on each entry-date-sorted name-cluster
  resample (not a per-trade mean), and is **paired** (rule and hold share the resample);
- the conjunction `p_rule = max(p_mar, p_exp)` + Holm graduates a synthetic clearly-better exit
  and rejects a synthetic no-edge / contrarian exit; `ABSTAIN_LOW_N` triggers below 30 trades.
Then a single live corpus run via the throwaway runner produces the real report.

## Expected outcome (interpretation, pre-registered)

Given the selection edge and the 3b contrarian result, the likely outcome is **no-go** (no rule
beats hold on the joint gate OOS) and `health_exit` should *hurt* — together closing the
"should we build a health/exit signal?" question. A surprise winner is a real lead worth a
follow-up. Either result is decision-useful and ends the open 3a-redesign thread cleanly.

## Caveats

- Conditional on the frozen default-`EngineParams` technicals-only baseline and `sector=None`.
- Survivorship via yfinance (120 delisted names unfetchable) — attenuates, does not flip, the
  comparison.
- Overlays are early-exit only; a "hold longer / looser stop" family is out of scope (the
  baseline already holds to the structural stop, the loosest variant we trust).
