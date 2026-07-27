#!/usr/bin/env python3
"""Out-of-sample backtest of the Argus labelling stack.

Runs the production scorer (`run_all` -> `_capped_weights` -> `_classify_action`)
over the point-in-time S&P 500 corpus and records, per signal:

  * the label (verdict / action_label / tier / trade_style) and every flag that
    feeds it (regime, combo, n_eff, inflation_gap, agreement, score),
  * the outcome under the engine's regime-dependent ATR stop/target exit,
  * MFE/MAE in ATR units (exit-quality analysis),
  * exit-free forward returns at 5/10/20d (label-discrimination analysis).

The action_label thresholds were fitted on a ~2y window ending 2026-06-08 using
a hand-picked 61-name universe. Everything before 2024-06-08 in this corpus is
therefore a genuine holdout.

Usage:  backtest_labels_oos.py [--names 300] [--step 5] [--workers 6] [--out CSV]
"""
from __future__ import annotations

import argparse
import os
import random
import sqlite3
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "argus"))

from argus.indicators import compute_all
from argus.agents import run_all
from argus.action_card.builder import (
    _capped_weights,
    _classify_action,
    _combo_string,
    _detect_ticker_regime,
    _effective_n,
)
from argus.agents.base import Verdict

CORPUS_DB = Path(
    os.environ.get(
        "ARGUS_CORPUS_DB",
        "/Users/josephstorey/Market_Analyse/argus/backtests/_corpus/corpus.db",
    )
)

MIN_BARS      = 260   # warmup before the first signal
MAX_HOLD_DAYS = 20
MIN_TOTAL_BARS = 1500

# Regime-dependent (stop_mult, target_mult) in ATR — mirrors backtest_agents.py
_REGIME_RR: dict[str, tuple[float, float]] = {
    "trending":              (2.0, 4.0),
    "trending_late":         (2.0, 3.0),
    "ranging":               (1.5, 2.5),
    "gap_down_continuation": (1.5, 2.5),
    "neutral":               (2.0, 3.0),
}

_LONG_LABELS = ("PRIME_LONG", "BREAKOUT_LONG", "STANDARD_LONG")


def _neuter_earnings() -> None:
    """Make the earnings-proximity agent inert for historical replay.

    `strategies._days_to_earnings` measures against datetime.now(), so on a 2015
    bar it reports days-to-the-next-earnings-from-today. Left live it injects
    look-ahead and a network call per ticker. Returning None puts the agent on
    its documented "earnings dates unavailable" path (confidence 0.0), which is
    the honest point-in-time state for this corpus.
    """
    from argus.agents import strategies
    strategies._days_to_earnings = lambda ticker: None


def _load(ticker: str) -> pd.DataFrame:
    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        df = pd.read_sql(
            "SELECT date,open,high,low,close,volume FROM prices "
            "WHERE ticker=? ORDER BY date",
            con, params=(ticker,), parse_dates=["date"],
        ).set_index("date")
    finally:
        con.close()
    return df


def _score(sl: pd.DataFrame) -> dict:
    """Production scoring path, verbatim in ordering to the live action card."""
    regime = _detect_ticker_regime(sl)
    # Keep every vote, incl. "RS vs Sector". backtest_agents.py drops it; that is
    # a mistake — with no sector data the agent returns WAIT/0.2, exactly as it
    # does in production here, and dropping it systematically inflates |score|
    # (pushing borderline names over the 0.15 verdict and 0.30/0.40 tier gates).
    votes = run_all(sl)

    lw, sw = _capped_weights(votes, regime)
    tw = lw + sw
    score = (lw - sw) / tw if tw > 0 else 0.0
    verdict = "LONG" if score > 0.15 else ("SHORT" if score < -0.15 else "WAIT")

    n_long  = sum(1 for v in votes if v.verdict == Verdict.LONG)
    n_short = sum(1 for v in votes if v.verdict == Verdict.SHORT)
    n_total = len(votes)
    # Agreement is over ACTIONABLE votes only (WAIT excluded) — matches
    # build_action_card. tools/backtest/backtest_agents.py divides by all votes
    # instead, which deflates inflation_gap and mislabels STANDARD_LONG.
    actionable = n_long + n_short
    agreement = max(n_long, n_short) / actionable if actionable else 0.0
    inflation_gap = round(agreement - (1.0 + abs(score)) / 2.0, 4)
    n_eff = _effective_n(votes)
    combo = _combo_string(votes)

    v_enum = (Verdict.LONG if verdict == "LONG"
              else Verdict.SHORT if verdict == "SHORT" else Verdict.WAIT)
    trade_style, action_label = _classify_action(
        v_enum, score, regime, combo, n_eff, inflation_gap, None,
    )
    # NOTE: build_action_card also applies a risk-filter override (a
    # high-confidence WAIT from the earnings agent forces WAIT). It is NOT
    # replicated here: `_days_to_earnings` resolves against datetime.now(), so
    # historically it would stamp *today's* earnings calendar onto every past
    # bar — a per-ticker constant and pure look-ahead. See `_neuter_earnings`.
    # This backtest therefore measures the technical labelling stack only.
    tier = ("BULLISH_SETUP" if action_label in _LONG_LABELS else
            "AVOID" if action_label == "AVOID" else
            "WAIT"  if action_label == "WAIT"  else "WATCH")

    return {
        "verdict": verdict, "score": round(score, 4), "regime": regime,
        "n_eff": round(n_eff, 4), "inflation_gap": inflation_gap,
        "agreement_pct": round(agreement * 100, 1), "combo": combo,
        "n_long": n_long, "n_short": n_short, "n_votes": n_total,
        "trade_style": trade_style, "action_label": action_label, "tier": tier,
    }


def _atr_exit(highs, lows, idx, c0, atr, verdict, regime):
    """First-touch stop/target walk. Same-bar stop+target resolves to LOSS."""
    stop_m, tgt_m = _REGIME_RR.get(regime, (2.0, 3.0))
    if atr <= 0 or verdict == "WAIT":
        return "OPEN", MAX_HOLD_DAYS, 0.0
    rr = tgt_m / stop_m
    long_side = verdict == "LONG"
    stop   = c0 - stop_m * atr if long_side else c0 + stop_m * atr
    target = c0 + tgt_m  * atr if long_side else c0 - tgt_m  * atr
    for d in range(1, MAX_HOLD_DAYS + 1):
        i = idx + d
        if i >= len(highs):
            return "OPEN", d, rr
        hit_s = lows[i] <= stop if long_side else highs[i] >= stop
        hit_t = highs[i] >= target if long_side else lows[i] <= target
        if hit_s and hit_t:
            return "LOSS", d, rr
        if hit_t:
            return "WIN", d, rr
        if hit_s:
            return "LOSS", d, rr
    return "OPEN", MAX_HOLD_DAYS, rr


def backtest_ticker(args: tuple[str, int]) -> list[dict]:
    ticker, step = args
    try:
        _neuter_earnings()   # per worker process
        raw = _load(ticker)
        if len(raw) < MIN_BARS + MAX_HOLD_DAYS + 5:
            return []
        full = compute_all(raw)
        full.attrs["symbol"] = ticker

        closes = full["close"].values
        highs  = full["high"].values
        lows   = full["low"].values
        dates  = full.index
        atrs   = (full["atr_14"].values if "atr_14" in full.columns
                  else np.zeros(len(full)))

        out: list[dict] = []
        prev_verdict = "WAIT"
        for idx in range(MIN_BARS, len(full) - MAX_HOLD_DAYS - 1, step):
            sl  = full.iloc[: idx + 1]
            sig = _score(sl)

            c0  = float(closes[idx])
            atr = float(atrs[idx]) if not np.isnan(atrs[idx]) else 0.0
            onset = prev_verdict != sig["verdict"] and sig["verdict"] in ("LONG", "SHORT")

            outcome, days_held, rr = _atr_exit(
                highs, lows, idx, c0, atr, sig["verdict"], sig["regime"]
            )
            r_raw = rr if outcome == "WIN" else (-1.0 if outcome == "LOSS" else 0.0)

            # Excursions over the full 20d window, in ATR units (exit-rule free)
            win_hi = highs[idx + 1: idx + 1 + MAX_HOLD_DAYS]
            win_lo = lows[idx + 1: idx + 1 + MAX_HOLD_DAYS]
            if len(win_hi) and atr > 0:
                mfe_atr = (win_hi.max() - c0) / atr
                mae_atr = (c0 - win_lo.min()) / atr
            else:
                mfe_atr = mae_atr = np.nan

            fwd = {}
            for h in (5, 10, 20):
                j = idx + h
                fwd[f"fwd_{h}d"] = (
                    round((float(closes[j]) - c0) / c0 * 100, 4)
                    if j < len(closes) and c0 > 0 else np.nan
                )

            out.append({
                "ticker": ticker,
                "date": dates[idx].strftime("%Y-%m-%d"),
                **sig,
                "fam_ma":      sig["combo"][0] if len(sig["combo"]) >= 4 else "N",
                "fam_break":   sig["combo"][1] if len(sig["combo"]) >= 4 else "N",
                "fam_squeeze": sig["combo"][2] if len(sig["combo"]) >= 4 else "N",
                "fam_mosc":    sig["combo"][3] if len(sig["combo"]) >= 4 else "N",
                "fam_week":    sig["combo"][4] if len(sig["combo"]) >= 5 else "N",
                "onset": onset,
                "close": round(c0, 4),
                "atr": round(atr, 4),
                "atr_pct": round(atr / c0 * 100, 4) if c0 > 0 else np.nan,
                "outcome": outcome,
                "days_held": days_held,
                "actual_rr": rr,
                "r_raw": round(r_raw, 4),
                "mfe_atr": round(float(mfe_atr), 4) if mfe_atr == mfe_atr else np.nan,
                "mae_atr": round(float(mae_atr), 4) if mae_atr == mae_atr else np.nan,
                **fwd,
            })
            prev_verdict = sig["verdict"]
        return out
    except Exception as exc:  # noqa: BLE001 - one bad name must not kill the run
        print(f"  [{ticker}] ERROR {type(exc).__name__}: {exc}", flush=True)
        return []


def pick_universe(n: int, seed: int) -> list[str]:
    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "SELECT ticker FROM prices GROUP BY ticker HAVING COUNT(*)>=? ORDER BY ticker",
            (MIN_TOTAL_BARS,),
        ).fetchall()
    finally:
        con.close()
    names = [r[0] for r in rows if r[0] != "SPY"]
    if n >= len(names):
        return names
    return sorted(random.Random(seed).sample(names, n))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", type=int, default=300)
    ap.add_argument("--step", type=int, default=5)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--seed", type=int, default=17)
    ap.add_argument("--out", default=str(REPO_ROOT / "reports" / "label_oos_signals.csv"))
    args = ap.parse_args()

    universe = pick_universe(args.names, args.seed)
    print(f"universe: {len(universe)} names, step={args.step}d, workers={args.workers}")

    t0 = time.time()
    rows: list[dict] = []
    done = 0
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(backtest_ticker, (t, args.step)): t for t in universe}
        for fut in as_completed(futs):
            rows.extend(fut.result())
            done += 1
            if done % 20 == 0 or done == len(universe):
                el = time.time() - t0
                print(f"  {done}/{len(universe)} names  {len(rows):,} signals  "
                      f"{el/60:.1f}m elapsed  eta {el/done*(len(universe)-done)/60:.1f}m",
                      flush=True)

    df = pd.DataFrame(rows).sort_values(["date", "ticker"])
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"\nwrote {len(df):,} signals -> {out}")
    print(f"dates {df['date'].min()} .. {df['date'].max()}  in {(time.time()-t0)/60:.1f}m")


if __name__ == "__main__":
    main()
