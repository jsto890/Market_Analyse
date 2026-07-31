# WS-7 Gate 1 — Gap-Continuation Entry, Pre-Registered

**Date:** 2026-07-16 · **Status:** PRE-REGISTERED — locked before any run. One shot; no parameter search.
**Follows:** [ws4-p2-validation-verdict] (pullback-to-EMA baseline FAILED Gate 1: MAR 0.13 vs SPY 8.57,
winsorized expectancy +0.06R dying at 3× costs) · master plan line 390 (next lever).

## Goal

Test whether swapping the entry archetype — gap-continuation instead of pullback-to-EMA — clears
the Gate-1 bar, through the *same* harness with everything else frozen: same bias/overlay gating,
same `compute_levels` stops/targets, same fills/costs, same corpus/window, same robust stats.
This is a one-shot confirmatory test, not exploration. Every constant below is final.

## 1. Frozen entry definition — `gap_continuation_trigger`

Fires on completed daily bar T (mirrors `entry_trigger`'s "signal on completed bar" convention;
fill happens T+1 open per the harness). All four conditions must hold:

1. **Gap magnitude:** `bar.open - prev.high >= GAP_K * atr14` — today's open clears yesterday's
   high by at least `GAP_K = 0.5` ATR. 0.5×ATR is the standard "meaningful gap" threshold in the
   gap-trading literature (distinguishes a real breakaway/continuation gap from daily open noise,
   which is typically well under 0.3×ATR for liquid large/mid-caps).
2. **Close-strength confirm:** `(bar.close - bar.low) / (bar.high - bar.low) >= CLOSE_STRENGTH`
   with `CLOSE_STRENGTH = 0.65` — the bar must close in the top third of its range, i.e. the gap
   held and buyers pressed through the session rather than fading it (classic "gap and go" filter,
   avoids gap-and-crap reversals).
3. **Volume confirm:** `bar.volume >= VOL_MULT * v.iloc[-21:-1].mean()` with `VOL_MULT = 1.5` —
   institutional participation behind the move. Set above the existing pullback trigger's
   `RESUME_VOL = 1.2` because a gap needs *more* confirming volume than a routine pullback
   resumption to distinguish real continuation from a thin, gap-fade-prone print.
4. **Trend qualifier:** `bar.close > ema50` (reuses the module's existing `_ema` helper, `EMA50`)
   — only take gap-continuation longs already above the intermediate trend, consistent with the
   engine's `bias == "LONG"` gate upstream (belt-and-suspenders against counter-trend gaps that
   happen to pass 1–3 in a downtrend rip).

No ATR-of-gap ceiling, no minimum price, no sector/liquidity filter beyond what `validate_corpus`
already applies (≥60 bars) — adding more knobs here is exactly the parameter search this
pre-registration forbids. `GAP_K`, `CLOSE_STRENGTH`, `VOL_MULT` are each a single literature-
standard value picked once, not swept.

```python
GAP_K = 0.5
CLOSE_STRENGTH = 0.65
VOL_MULT = 1.5

def gap_continuation_trigger(daily: pd.DataFrame, params: EngineParams = DEFAULT) -> bool:
    """Gap up >= GAP_K*ATR over prior high, strong close, volume confirm, above EMA50."""
```

Signature-compatible with `entry_trigger(daily, params) -> bool` (same two args, same guard:
`len(daily) < 60` -> `False`), so it drops into `entry_fn` with no other change.

## 2. `gap_skip` veto — DISABLED for this archetype

`gap_skip(entry_signal_close, next_open, atr)` vetoes a fill if `next_open > signal_close +
0.75*atr` — i.e. it exists to protect the *pullback* archetype from chasing an unexpected gap
into the entry. For gap-continuation, the entry signal is *itself* a gap; requiring the T+1 open
not to gap further would systematically veto the strongest, most confirmed instances of the exact
pattern being tested and bias the surviving sample toward weak gaps that partially closed
overnight — the opposite of what "gap continuation" means. Frozen: `gap_skip` is bypassed
(short-circuited to always `False`) when `entry_fn is gap_continuation_trigger`; unchanged for the
default pullback path.

## 3. Interface (frozen signatures, zero behavior change for existing callers)

```python
# levels.py
def gap_continuation_trigger(daily: pd.DataFrame, params: EngineParams = DEFAULT) -> bool: ...

# replay.py
def replay(conn, *, ticker, daily, spy, sector, model_ver, run_kind="live", mode="paper",
           params: EngineParams = DEFAULT,
           entry_fn=entry_trigger,        # NEW, defaults to existing pullback trigger
           skip_gap_check: bool = False,  # NEW, defaults to current behavior (gap_skip active)
           ) -> int: ...
```

`replay` calls `sig = entry_fn(win, params) if (bstate.bias == "LONG" and armed_prev) else False`
(was `entry_trigger(win, params)`), and the fill-side `if cur_levels and gap_skip(...)` becomes
`if not skip_gap_check and cur_levels and gap_skip(...)`. No other line changes.

```python
# validation.py
def validate_corpus(prices, spy, *, model_ver="bt", cost_mults=COST_MULTS, years=None,
                    n_boot=500, seed=1, r_clip=R_CLIP, per_trade_out=None, on_progress=None,
                    entry_fn=entry_trigger,        # NEW, threaded straight to replay()
                    skip_gap_check: bool = False,  # NEW, threaded straight to replay()
                    ) -> dict: ...
```

`validate_corpus` passes `entry_fn=entry_fn, skip_gap_check=skip_gap_check` into its `replay(...)`
call; nothing else in the corpus/cost/aggregate pipeline changes. A new throwaway runner
`backtests/_run_gap_continuation_validation.py`, structurally identical to
`_run_p2_validation.py` (same `START/END = "2014-01-01"/"2024-12-31"`, same corpus load), calls
`validate_corpus(prices, spy, ..., entry_fn=gap_continuation_trigger, skip_gap_check=True)`.

## 4. Success bar (verbatim from Gate 1 / P2, not weakened)

All four must hold for a PASS:

**(a) Cost-robust expectancy.** Block-bootstrap winsorized-expectancy CI (`block_bootstrap_ci`,
`R_CLIP=25`, `block_len=20`, `n_boot=2000`) excludes zero at 1× costs, **and** the CI still
excludes zero at 3× costs (the P2 baseline died between 1× and 3×; surviving 3× is the bar).

**(b) MAR vs SPY.** Strategy `mar` (R-space, `net_R/years / max_dd_R`) at 1× costs `>=` `spy_mar`
over the identical window (`mar_vs_spy >= 0`, per `metrics.aggregate`'s existing field — no new
metric).

**(c) Down-regime expectancy.** Winsorized expectancy (1× costs) remains positive on the trade
subset whose `exit_ts` falls in a **frozen down-regime window list**, defined precisely as:
calendar years within [2014, 2024] where SPY's calendar-year total return (close-to-close,
Dec-31-to-Dec-31, using the corpus SPY series) is negative. Computed once, ahead of the run, and
hardcoded into the runner — not derived post-hoc from whichever years happen to look bad. (If the
2014–2024 SPY series yields zero negative calendar years, the down-regime subset is instead SPY
max-drawdown episodes >= 10% peak-to-trough, defined by the same `_bh`/drawdown series already
computed in `validate_corpus`, and this fallback is stated in the run's report — but the primary
definition is calendar-year total return, decided now, not chosen after seeing which gives a
nicer answer.)

**(d) Minimum sample.** >= 300 closed trades pooled at 1× costs (`cost_sensitivity["1.0x"].n_trades
>= 300`). Below 300, the run is UNDERPOWERED regardless of (a)-(c).

## 5. Pre-committed interpretation

- **PASS** (a+b+c+d all hold): proceed to Gate-1 sign-off discussion for WS-7 automation.
- **FAIL** (300+ trades, but any of a/b/c fails): gap-continuation archetype is **closed**. No
  post-hoc re-tuning of `GAP_K`/`CLOSE_STRENGTH`/`VOL_MULT`/EMA qualifier — that would be exactly
  the parameter search this pre-registration forbids. A different archetype, or abandoning
  mechanical entries in favor of the SELECTION-only conclusion already reached in P2, is the next
  decision, made in a fresh document.
- **UNDERPOWERED** (< 300 trades): archetype closed as impractical (too rare to trade at scale
  over an 11-year, 600+-name corpus) — not re-run with a loosened trigger.

No branch of this decision tree permits re-running with adjusted constants and calling it the
same experiment.

## 6. Test plan

Unit tests for `gap_continuation_trigger` (synthetic OHLCV frames, >=60 bars of quiet warmup then
the test bar):

1. Clean gap-continuation (gap >= 0.5 ATR, close in top third, volume >= 1.5x avg, close > EMA50)
   -> `True`.
2. No gap (`open <= prev.high`) -> `False`.
3. Gapped but weak close (gap ok, volume ok, but closes in bottom half of range) -> `False`.
4. Gapped and strong close but volume < 1.5x 20d avg -> `False`.
5. Gapped, strong close, volume ok, but `close < ema50` (counter-trend) -> `False`.
6. `len(daily) < 60` -> `False` (short-history guard, mirrors `entry_trigger`).

Plus one regression test: `replay(...)` called with no `entry_fn`/`skip_gap_check` args (defaults)
on an existing fixture produces byte-identical `trades`/`position_signals` rows to the current
(pre-change) `replay` output — proves the injection is additive, not a behavior change to the
baseline path.
