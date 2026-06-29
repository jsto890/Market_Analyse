# WS-4 Exit Premise-Check — Design

**Date:** 2026-06-29 · **Status:** design approved, awaiting plan.
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

An exit overlay **wins** iff it beats hold-to-structural-stop on **both** MAR and expectancy,
out-of-sample, with each delta's cluster-bootstrap CI excluding zero, **after Holm-Bonferroni**
across the rule family. **Go** iff ≥1 rule wins in the held-out years; otherwise **no-go**.

## Architecture

Two stages over the existing 618-name corpus, reusing corpus → replay → metrics → evalstats.
No engine changes: an *exit overlay* only re-prices *where* an existing baseline trade exits.

```
corpus.db --replay--> baseline trades (entry, structural exit, path, r_multiple, mfe_r, mae_r)
   |
   ├── Stage 1 (oracle): best-in-hindsight exit (~mfe_r) -> ceiling MAR/expectancy = prize size
   └── Stage 2 (rule family): each pre-registered exit rule, walk-forward by entry year ->
         re-price R -> aggregate MAR+expectancy -> delta vs hold -> cluster-bootstrap CI ->
         Holm across rules -> per-rule win/lose -> premise_check_report.json -> go/no-go
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
Each rule is a pure function `rule(path, entry_px, r, init_stop) -> exit_offset` returning the
bar offset (≤ baseline structural exit) at which it would close the trade; re-pricing then
computes realized R at that bar's close. **Fixed parameters — no tuning on test data.**

| rule | definition (fixed params) |
|---|---|
| `time_stop` | exit after 20 held bars if not already stopped |
| `ema_cross` | exit on first close below the 20-EMA (faster than the 50-EMA structural) |
| `down_days` | exit after 3 consecutive lower closes |
| `atr_trail_tight` | tighter chandelier trail at 2.0·ATR (vs the baseline trail) |
| `profit_target` | exit at +2.0R (fixed R target) |
| `health_exit` | exit on any 3a health flag firing — the contrarian CONTROL (expected to hurt; validates 3b in realized-R terms) |

Overlays exit at or before the baseline structural exit (the baseline is the loosest hold).

### Re-pricing
A rule's trigger is evaluated on a completed bar; the exit **fills at the next bar's open**
(T+1), matching the engine's fill convention. Realized R = `(fill_open − entry_px) / r`. A rule
that never triggers before the structural exit yields the baseline `r_multiple` for that trade
(so a rule can only differ from hold by exiting *earlier*). The fill open is taken from the
held price path; no intraday model is added (consistent with the daily baseline).

### Inference (`premise.py`)
- **Walk-forward by entry date:** trades bucketed into held-out years 2021, 2022, 2023, 2024
  (entry-date assignment; train years precede each, but rules are parameter-free so there is no
  fit — the split enforces *regime robustness*, since the buyable-dip effect was regime-fragile).
- Per rule per year: `aggregate` MAR and expectancy for the rule and for hold on the same
  trades; compute the `(rule − hold)` deltas.
- **Cluster bootstrap** (reuse `evalstats.cluster_bootstrap_ci` / `metrics.block_bootstrap_ci`):
  resample trades in blocks by name (or entry-day) to get each delta's CI; require **both**
  MAR-delta and expectancy-delta CIs to exclude 0.
- **Holm-Bonferroni** across the 6 rules (`evalstats.holm`) on a one-sided bootstrap p-value of
  the joint gate.
- **Verdict:** a rule wins iff it clears the joint gate after Holm in the held-out years; **go**
  iff ≥1 rule wins, else **no-go**.

## File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/exits.py` | **New.** Exit rule family (pure) + re-pricing. |
| `argus/argus/position_engine/premise.py` | **New.** Trade extraction, oracle, walk-forward, inference, `premise_check_report.json`. |
| `argus/tests/test_pe_exits.py`, `test_pe_premise.py` | **New.** One per unit. |
| reuse | `metrics.py` (aggregate, beats_baseline, block_bootstrap_ci), `evalstats.py` (cluster bootstrap, holm), `corpus.py`, `replay.py`, `backtest.py` (`_price_trades`). |
| throwaway | live runner in gitignored `argus/backtests/` (mirrors `_run_graduation.py`). |

## Testing

TDD, fully offline (synthetic trades / deterministic paths, no network, throwaway tempfile
conns):
- each exit rule fires at the correct bar on a hand-built path;
- re-pricing computes the right realized R;
- oracle equals the MFE-bar R;
- walk-forward buckets trades by entry year correctly;
- the joint-gate + cluster-bootstrap + Holm logic graduates a synthetic clearly-better exit and
  rejects a synthetic no-edge / contrarian exit;
- a rule that never fires returns baseline R.
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
