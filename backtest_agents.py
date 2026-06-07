#!/usr/bin/env python3
"""
Argus technical agent backtest v3.

Improvements over v2:
  - Regime-conditional confidence scaling (generalised from binary GDC gate)
  - Per-family dominant vote direction tracked for combination analysis
  - Dynamic R:R per regime: trend gets wider target (trend can run)
  - Dynamic position sizing per tier + Kelly fraction
  - Combination analysis: which family alignments predict better outcomes?
  - Equity curve comparison: fixed vs dynamic sizing

61 tickers, weekly signals, 2 years, ATR-based stop/target exits.
"""
from __future__ import annotations

import sys
import time
import concurrent.futures
from datetime import datetime, timedelta
from itertools import product
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ARGUS_ROOT = Path(__file__).parent / "argus"
sys.path.insert(0, str(ARGUS_ROOT))

from argus.indicators import compute_all
from argus.agents import run_all
from argus.action_card.builder import (
    _capped_weights,
    _detect_ticker_regime,
    _effective_n,
    _combo_string,
    _classify_action,
    _WEAK_COMBOS,
    _STRONG_COMBOS,
    _REGIME_FAMILY_MULT,
    _AGENT_FAMILY,
    _FAMILIES,
)
from argus.agents.base import Vote, Verdict

OUT_CSV = Path(__file__).parent / "backtest_results.csv"

# ── universe ──────────────────────────────────────────────────────────────────
UNIVERSE: list[dict] = [
    {"ticker": "SPY",   "cap": "index",  "sector": "Broad Market"},
    {"ticker": "QQQ",   "cap": "index",  "sector": "Technology"},
    {"ticker": "IWM",   "cap": "index",  "sector": "Small Cap"},
    {"ticker": "DIA",   "cap": "index",  "sector": "Broad Market"},
    {"ticker": "MDY",   "cap": "index",  "sector": "Mid Cap"},
    {"ticker": "XLK",   "cap": "etf",   "sector": "Technology"},
    {"ticker": "XLF",   "cap": "etf",   "sector": "Financials"},
    {"ticker": "XLV",   "cap": "etf",   "sector": "Healthcare"},
    {"ticker": "XLE",   "cap": "etf",   "sector": "Energy"},
    {"ticker": "XLI",   "cap": "etf",   "sector": "Industrials"},
    {"ticker": "XLY",   "cap": "etf",   "sector": "Consumer Cyclical"},
    {"ticker": "XLP",   "cap": "etf",   "sector": "Consumer Defensive"},
    {"ticker": "XLB",   "cap": "etf",   "sector": "Materials"},
    {"ticker": "XLRE",  "cap": "etf",   "sector": "Real Estate"},
    {"ticker": "XLU",   "cap": "etf",   "sector": "Utilities"},
    {"ticker": "XLC",   "cap": "etf",   "sector": "Comm Services"},
    {"ticker": "AAPL",  "cap": "large", "sector": "Technology"},
    {"ticker": "MSFT",  "cap": "large", "sector": "Technology"},
    {"ticker": "NVDA",  "cap": "large", "sector": "Technology"},
    {"ticker": "AVGO",  "cap": "large", "sector": "Technology"},
    {"ticker": "META",  "cap": "large", "sector": "Comm Services"},
    {"ticker": "GOOGL", "cap": "large", "sector": "Comm Services"},
    {"ticker": "AMZN",  "cap": "large", "sector": "Consumer Cyclical"},
    {"ticker": "TSLA",  "cap": "large", "sector": "Consumer Cyclical"},
    {"ticker": "JPM",   "cap": "large", "sector": "Financials"},
    {"ticker": "BAC",   "cap": "large", "sector": "Financials"},
    {"ticker": "GS",    "cap": "large", "sector": "Financials"},
    {"ticker": "MA",    "cap": "large", "sector": "Financials"},
    {"ticker": "JNJ",   "cap": "large", "sector": "Healthcare"},
    {"ticker": "UNH",   "cap": "large", "sector": "Healthcare"},
    {"ticker": "LLY",   "cap": "large", "sector": "Healthcare"},
    {"ticker": "XOM",   "cap": "large", "sector": "Energy"},
    {"ticker": "COP",   "cap": "large", "sector": "Energy"},
    {"ticker": "CAT",   "cap": "large", "sector": "Industrials"},
    {"ticker": "HON",   "cap": "large", "sector": "Industrials"},
    {"ticker": "COST",  "cap": "large", "sector": "Consumer Defensive"},
    {"ticker": "WMT",   "cap": "large", "sector": "Consumer Defensive"},
    {"ticker": "INTC",  "cap": "large", "sector": "Technology"},
    {"ticker": "NKE",   "cap": "large", "sector": "Consumer Cyclical"},
    {"ticker": "CHRD",  "cap": "mid",   "sector": "Energy"},
    {"ticker": "FIVE",  "cap": "mid",   "sector": "Consumer Cyclical"},
    {"ticker": "WCC",   "cap": "mid",   "sector": "Industrials"},
    {"ticker": "PLNT",  "cap": "mid",   "sector": "Consumer Cyclical"},
    {"ticker": "NTNX",  "cap": "mid",   "sector": "Technology"},
    {"ticker": "CRVL",  "cap": "mid",   "sector": "Healthcare"},
    {"ticker": "SITM",  "cap": "mid",   "sector": "Technology"},
    {"ticker": "TMDX",  "cap": "mid",   "sector": "Healthcare"},
    {"ticker": "WING",  "cap": "mid",   "sector": "Consumer Cyclical"},
    {"ticker": "NVST",  "cap": "mid",   "sector": "Healthcare"},
    {"ticker": "IREN",  "cap": "small", "sector": "Technology"},
    {"ticker": "RIOT",  "cap": "small", "sector": "Technology"},
    {"ticker": "LUNR",  "cap": "small", "sector": "Industrials"},
    {"ticker": "NNE",   "cap": "small", "sector": "Industrials"},
    {"ticker": "ACHR",  "cap": "small", "sector": "Industrials"},
    {"ticker": "DNN",   "cap": "small", "sector": "Energy"},
    {"ticker": "QUBT",  "cap": "small", "sector": "Technology"},
    {"ticker": "AVXL",  "cap": "small", "sector": "Healthcare"},
    {"ticker": "GROY",  "cap": "small", "sector": "Materials"},
    {"ticker": "BKSY",  "cap": "small", "sector": "Technology"},
    {"ticker": "SOFI",  "cap": "small", "sector": "Financials"},
    {"ticker": "UPST",  "cap": "small", "sector": "Financials"},
]

BACKTEST_YEARS  = 2
SIGNAL_STEP     = 5       # weekly
MIN_BARS        = 260
FETCH_YEARS     = BACKTEST_YEARS + 0.5
MAX_HOLD_DAYS   = 20

# Dynamic R:R multipliers per regime: (stop_mult, target_mult)
# Trending → wider target (trend can run); ranging → tighter (range-bound)
_REGIME_RR: dict[str, tuple[float, float]] = {
    "trending":              (2.0, 4.0),   # 2:1 R:R — let winners run
    "ranging":               (1.5, 2.5),   # 1.67:1 — range won't run far
    "gap_down_continuation": (1.5, 2.5),   # defensive — don't trust signal
    "neutral":               (2.0, 3.0),   # 1.5:1 default
}

# Tier position-size weights (as fraction of full size)
_TIER_SIZE: dict[str, float] = {
    "BULLISH_SETUP": 1.0,
    "WATCH":         0.5,
    "AVOID":         0.0,
    "WAIT":          0.0,
}

FAMILY_KEYS = ["ma_trend", "breakout", "squeeze", "momentum_osc"]


# ── fast scoring with regime scaling ─────────────────────────────────────────

def _fast_score(df_slice: pd.DataFrame) -> dict:
    """Score with post-cap regime scaling. Votes kept raw; regime applied in _capped_weights."""
    regime = _detect_ticker_regime(df_slice)
    votes  = [v for v in run_all(df_slice) if v.agent != "RS vs Sector"]

    lw, sw = _capped_weights(votes, regime)   # post-cap scaling applied here
    tw = lw + sw
    score = (lw - sw) / tw if tw > 0 else 0.0

    verdict = "LONG" if score > 0.15 else ("SHORT" if score < -0.15 else "WAIT")

    n_long  = sum(1 for v in votes if v.verdict == Verdict.LONG)
    n_short = sum(1 for v in votes if v.verdict == Verdict.SHORT)
    n_total = len(votes)
    agreement     = max(n_long, n_short) / n_total if n_total > 0 else 0.5
    inflation_gap = round(agreement - (1.0 + abs(score)) / 2.0, 4)
    n_eff         = _effective_n(votes)
    combo         = _combo_string(votes)

    return {
        "verdict":       verdict,
        "score":         round(score, 4),
        "regime":        regime,
        "n_eff":         n_eff,
        "inflation_gap": inflation_gap,
        "agreement_pct": round(agreement * 100, 1),
        "combo":         combo,
        "fam_ma":        combo[0] if len(combo) >= 4 else "N",
        "fam_break":     combo[1] if len(combo) >= 4 else "N",
        "fam_squeeze":   combo[2] if len(combo) >= 4 else "N",
        "fam_mosc":      combo[3] if len(combo) >= 4 else "N",
        "fam_week":      combo[4] if len(combo) >= 5 else "N",
    }


def _quality_tier(verdict: str, score: float, regime: str, combo: str,
                  n_eff: float, inflation_gap: float, adx=None) -> str:
    """Map to backtest tier using the same logic as _classify_action."""
    v_enum = Verdict.LONG if verdict == "LONG" else (
             Verdict.SHORT if verdict == "SHORT" else Verdict.WAIT)
    _, label = _classify_action(v_enum, score, regime, combo, n_eff, inflation_gap, adx)
    if label in ("PRIME_LONG", "BREAKOUT_LONG", "STANDARD_LONG"):
        return "BULLISH_SETUP"
    if label == "AVOID":
        return "AVOID"
    if label == "WATCH":
        return "WATCH"
    return "WAIT"


def _atr_exit(highs: np.ndarray, lows: np.ndarray, idx: int,
              c0: float, atr: float, verdict: str, regime: str) -> tuple[str, int, float]:
    """
    ATR-based stop/target exit with dynamic R:R per regime.
    Returns (outcome, days_held, actual_rr).
    """
    stop_m, tgt_m = _REGIME_RR.get(regime, (2.0, 3.0))

    if atr <= 0 or verdict == "WAIT":
        return "OPEN", MAX_HOLD_DAYS, 0.0

    actual_rr = tgt_m / stop_m

    if verdict == "LONG":
        stop   = c0 - stop_m * atr
        target = c0 + tgt_m  * atr
        for d in range(1, MAX_HOLD_DAYS + 1):
            i = idx + d
            if i >= len(highs):
                return "OPEN", d, actual_rr
            hit_s = lows[i]  <= stop
            hit_t = highs[i] >= target
            if hit_s and hit_t:
                return "LOSS", d, actual_rr   # conservative: same bar → loss
            if hit_t:
                return "WIN",  d, actual_rr
            if hit_s:
                return "LOSS", d, actual_rr
        return "OPEN", MAX_HOLD_DAYS, actual_rr

    else:  # SHORT
        stop   = c0 + stop_m * atr
        target = c0 - tgt_m  * atr
        for d in range(1, MAX_HOLD_DAYS + 1):
            i = idx + d
            if i >= len(lows):
                return "OPEN", d, actual_rr
            hit_s = highs[i] >= stop
            hit_t = lows[i]  <= target
            if hit_s and hit_t:
                return "LOSS", d, actual_rr
            if hit_t:
                return "WIN",  d, actual_rr
            if hit_s:
                return "LOSS", d, actual_rr
        return "OPEN", MAX_HOLD_DAYS, actual_rr


# ── per-ticker backtest ───────────────────────────────────────────────────────

def backtest_ticker(meta: dict) -> list[dict]:
    ticker = meta["ticker"]
    try:
        end   = datetime.today()
        start = end - timedelta(days=int(FETCH_YEARS * 365))
        raw = yf.download(
            ticker,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if raw.empty or len(raw) < MIN_BARS + MAX_HOLD_DAYS + 5:
            return []
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower()
                       for c in raw.columns]
        raw = raw.rename(columns={"adj close": "close"})

        df_full = compute_all(raw)
        df_full.attrs["symbol"] = ticker

        closes = df_full["close"].values
        highs  = df_full["high"].values
        lows   = df_full["low"].values
        dates  = df_full.index
        atrs   = (df_full["atr_14"].values if "atr_14" in df_full.columns
                  else np.zeros(len(df_full)))

        records     = []
        prev_verdict = "WAIT"

        for idx in range(MIN_BARS, len(df_full) - MAX_HOLD_DAYS - 1, SIGNAL_STEP):
            sl  = df_full.iloc[: idx + 1]
            sig = _fast_score(sl)

            verdict       = sig["verdict"]
            score         = sig["score"]
            regime        = sig["regime"]
            n_eff         = sig["n_eff"]
            inflation_gap = sig["inflation_gap"]
            combo         = sig["combo"]

            tier  = _quality_tier(verdict, score, regime, combo, n_eff, inflation_gap)
            onset = prev_verdict != verdict and verdict in ("LONG", "SHORT")
            c0    = closes[idx]
            atr   = float(atrs[idx]) if not np.isnan(atrs[idx]) else 0.0

            outcome, days_held, actual_rr = _atr_exit(
                highs, lows, idx, c0, atr, verdict, regime
            )

            # R earned this trade under dynamic sizing
            size = _TIER_SIZE.get(tier, 0.0)
            if outcome == "WIN":
                r_earned = actual_rr * size
            elif outcome == "LOSS":
                r_earned = -1.0 * size
            else:
                r_earned = 0.0

            fwd_5d = (closes[min(idx + 5,  len(closes)-1)] - c0) / c0 if c0 > 0 else None

            records.append({
                "ticker":         ticker,
                "cap":            meta["cap"],
                "sector":         meta["sector"],
                "date":           dates[idx].strftime("%Y-%m-%d"),
                "verdict":        verdict,
                "score":          score,
                "regime":         regime,
                "n_eff":          n_eff,
                "inflation_gap":  inflation_gap,
                "agreement_pct":  sig["agreement_pct"],
                "tier":           tier,
                "onset":          onset,
                "actual_rr":      actual_rr,
                "size":           size,
                "atr":            round(atr, 4),
                "outcome":        outcome,
                "days_held":      days_held,
                "r_earned":       round(r_earned, 4),
                # Family combination
                "fam_ma":         sig["fam_ma"],
                "fam_break":      sig["fam_break"],
                "fam_squeeze":    sig["fam_squeeze"],
                "fam_mosc":       sig["fam_mosc"],
                "fam_week":       sig["fam_week"],
                "combo":          sig["combo"],
                # Fixed-period for reference
                "fwd_5d":         round(fwd_5d * 100, 4) if fwd_5d is not None else None,
            })
            prev_verdict = verdict

        return records
    except Exception as e:
        print(f"  [{ticker}] ERROR: {e}")
        return []


# ── analysis helpers ──────────────────────────────────────────────────────────

def _outcome_stats(sub: pd.DataFrame) -> tuple[float | None, float | None, int]:
    """ATR-exit win rate, expectancy, n resolved."""
    act = sub[sub["verdict"].isin(["LONG", "SHORT"]) & sub["outcome"].isin(["WIN", "LOSS"])]
    if len(act) == 0:
        return None, None, 0
    wins = act[act["outcome"] == "WIN"]
    wr   = len(wins) / len(act)
    rr   = act["actual_rr"].mean()
    exp  = wr * rr - (1 - wr) * 1.0
    return round(wr, 4), round(exp, 3), len(act)


def _pct(v) -> str:
    return f"{v*100:.1f}%" if v is not None else "    —"


def _exp(v) -> str:
    return f"{v:+.2f}R" if v is not None else "    —"


def print_table(title: str, rows: list[tuple], min_n: int = 10) -> None:
    print(f"\n{'═'*70}")
    print(title)
    print('═'*70)
    hdr = f"  {'Group':<30} {'ATR WR':>7} {'Expect':>8} {'n':>5}"
    print(hdr)
    print("  " + "─" * 52)
    for label, subset in rows:
        wr, exp, n = _outcome_stats(subset)
        if n < min_n:
            continue
        print(f"  {label:<30} {_pct(wr):>7} {_exp(exp):>8} {n:>5}")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Argus Backtest v3 — {len(UNIVERSE)} tickers, {BACKTEST_YEARS}y, "
          f"regime-conditional scaling + dynamic R:R + family combos")
    print(f"Fetching + scoring (12 threads)…\n")

    t0 = time.time()
    all_records: list[dict] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(backtest_ticker, m): m["ticker"] for m in UNIVERSE}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            recs = fut.result()
            all_records.extend(recs)
            if done % 10 == 0 or done == len(UNIVERSE):
                print(f"  {done}/{len(UNIVERSE)} tickers  ({len(all_records):,} signals)")

    elapsed = time.time() - t0
    print(f"\nDone in {elapsed:.0f}s — {len(all_records):,} signal rows")

    if not all_records:
        print("No data returned.")
        return

    df = pd.DataFrame(all_records)
    df.to_csv(OUT_CSV, index=False)
    print(f"Saved → {OUT_CSV}\n")

    total      = len(df)
    actionable = df[df["verdict"].isin(["LONG", "SHORT"])]
    longs      = df[df["verdict"] == "LONG"]

    # ── distribution ─────────────────────────────────────────────────────────
    print(f"{'═'*70}")
    print("SIGNAL DISTRIBUTION")
    print(f"{'═'*70}")
    print(f"  Total rows  : {total:,}   Date range: {df['date'].min()} → {df['date'].max()}")
    for tier in ["BULLISH_SETUP", "WATCH", "AVOID", "WAIT"]:
        n = (df["tier"] == tier).sum()
        print(f"  {tier:<15}: {n:,}  ({n/total*100:.1f}%)")
    resolved = actionable[actionable["outcome"].isin(["WIN","LOSS"])]
    wr_all   = (resolved["outcome"] == "WIN").mean() if len(resolved) else 0
    print(f"\n  Resolved exits : {len(resolved):,}  ({len(resolved)/len(actionable)*100:.0f}% of actionable)")
    print(f"  Overall ATR WR : {wr_all*100:.1f}%  (breakeven @ 40% for 1.5:1 R:R)")

    # ── CORE: quality tier ───────────────────────────────────────────────────
    print_table("CORE: ACCURACY BY QUALITY TIER", [
        ("BULLISH_SETUP",           df[df["tier"] == "BULLISH_SETUP"]),
        ("  BS onset (fresh)",      df[(df["tier"]=="BULLISH_SETUP") & df["onset"]]),
        ("  BS cont (stale)",       df[(df["tier"]=="BULLISH_SETUP") & ~df["onset"]]),
        ("WATCH",                   df[df["tier"] == "WATCH"]),
        ("  WATCH onset",           df[(df["tier"]=="WATCH") & df["onset"]]),
        ("AVOID (SHORT+GDC)",       df[df["tier"] == "AVOID"]),
    ])

    # ── regime breakdown ──────────────────────────────────────────────────────
    print_table("LONG SIGNALS: ACCURACY BY REGIME", [
        (r[:30], longs[longs["regime"] == r])
        for r in ["trending", "ranging", "neutral", "gap_down_continuation"]
    ])

    # ── regime × score threshold ──────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("LONG SIGNALS: REGIME × SCORE THRESHOLD")
    print(f"{'═'*70}")
    print(f"  {'Regime':<22} {'score>0.3':>10} {'score>0.5':>10} {'score>0.7':>10}")
    print("  " + "─" * 58)
    for r in ["trending", "ranging", "neutral"]:
        sub = longs[longs["regime"] == r]
        row = f"  {r:<22}"
        for thresh in [0.3, 0.5, 0.7]:
            s = sub[sub["score"] >= thresh]
            wr, exp, n = _outcome_stats(s)
            row += f"  {_pct(wr):>5}/{n:<4}"
        print(row)

    # ── family combination analysis ──────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("FAMILY COMBINATION ANALYSIS (LONG signals, n≥15)")
    print(f"Legend: L=LONG dominant  S=SHORT dominant  N=neutral/mixed")
    print(f"Order:  [ma_trend][breakout][squeeze][momentum_osc]")
    print(f"{'═'*70}")
    print(f"  {'Combo':<10} {'ATR WR':>7} {'Expect':>8} {'n':>5}   Interpretation")
    print("  " + "─" * 66)

    # Show all combos with n >= 15, sorted by expectancy
    combo_rows = []
    for combo in longs["combo"].unique():
        sub = longs[longs["combo"] == combo]
        wr, exp, n = _outcome_stats(sub)
        if n >= 15 and wr is not None:
            combo_rows.append((combo, wr, exp, n))
    combo_rows.sort(key=lambda x: x[2], reverse=True)  # sort by expectancy

    def interp_combo(c: str) -> str:
        ma, br, sq, mo = c[0], c[1], c[2], c[3]
        parts = []
        if ma == "L" and br == "L":
            parts.append("trend+breakout aligned")
        elif ma == "L" and br == "N":
            parts.append("trend only (no breakout)")
        elif ma == "L" and br == "S":
            parts.append("trend vs breakout conflict")
        if sq == "L":
            parts.append("squeeze confirming")
        if mo == "L":
            parts.append("oscillators confirming")
        elif mo == "S":
            parts.append("oscillators diverging")
        return "; ".join(parts) if parts else "mixed"

    for combo, wr, exp, n in combo_rows:
        interp = interp_combo(combo)
        print(f"  {combo:<10} {_pct(wr):>7} {_exp(exp):>8} {n:>5}   {interp}")

    # ── pairwise family synergy ──────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("PAIRWISE FAMILY SYNERGY: both L vs one L (LONG signals, n≥20)")
    print(f"{'═'*70}")
    fam_cols = ["fam_ma", "fam_break", "fam_squeeze", "fam_mosc"]
    fam_labels = ["ma_trend", "breakout", "squeeze", "mosc"]
    for i in range(len(fam_cols)):
        for j in range(i + 1, len(fam_cols)):
            ci, cj = fam_cols[i], fam_cols[j]
            both_l = longs[(longs[ci]=="L") & (longs[cj]=="L")]
            only_i = longs[(longs[ci]=="L") & (longs[cj]!="L")]
            only_j = longs[(longs[ci]!="L") & (longs[cj]=="L")]
            wr_b, exp_b, nb = _outcome_stats(both_l)
            wr_i, exp_i, ni = _outcome_stats(only_i)
            wr_j, exp_j, nj = _outcome_stats(only_j)
            if nb >= 20:
                print(f"  {fam_labels[i]}+{fam_labels[j]}: BOTH={_pct(wr_b)}/{exp_b:+.2f}R (n={nb})  "
                      f"only_{fam_labels[i]}={_pct(wr_i)}/{exp_i:+.2f}R (n={ni})  "
                      f"only_{fam_labels[j]}={_pct(wr_j)}/{exp_j:+.2f}R (n={nj})")

    # ── how many families aligned ─────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("LONG SIGNALS: # FAMILIES ALIGNED (all 4 cols = 'L')")
    print(f"{'═'*70}")
    longs = longs.copy()
    longs["n_fam_long"] = (
        (longs["fam_ma"]    == "L").astype(int) +
        (longs["fam_break"] == "L").astype(int) +
        (longs["fam_squeeze"]== "L").astype(int) +
        (longs["fam_mosc"]  == "L").astype(int)
    )
    print_table("", [
        (f"{n} families aligned", longs[longs["n_fam_long"] == n])
        for n in range(5)
    ], min_n=10)

    # ── dynamic sizing equity curve ──────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("EQUITY SIMULATION (resolved exits only)")
    print(f"{'═'*70}")

    # Fixed: every actionable signal, size=1
    fixed = resolved.copy()
    fixed["r_fixed"] = fixed.apply(
        lambda row: (row["actual_rr"] if row["outcome"] == "WIN" else -1.0), axis=1
    )
    # Dynamic: use tier size weights
    fixed["r_dynamic"] = fixed["r_earned"]  # pre-computed with tier sizing

    total_fixed   = fixed["r_fixed"].sum()
    total_dynamic = fixed["r_dynamic"].sum()
    n_bs = (fixed["tier"] == "BULLISH_SETUP").sum()
    n_watch = (fixed["tier"] == "WATCH").sum()

    print(f"  Fixed (all signals, size=1):    {total_fixed:+.1f}R over {len(fixed)} trades")
    print(f"  Dynamic (BS=1.0×, WATCH=0.5×):  {total_dynamic:+.1f}R over {len(fixed)} trades")
    print(f"    BULLISH_SETUP trades: {n_bs}")
    print(f"    WATCH trades:         {n_watch}")

    # Annualise: ~260 signals/yr across full universe but we care per-ticker
    n_tickers = len(df["ticker"].unique())
    trades_per_ticker_yr = len(fixed) / n_tickers / BACKTEST_YEARS
    r_per_ticker_yr_fixed   = total_fixed   / n_tickers / BACKTEST_YEARS
    r_per_ticker_yr_dynamic = total_dynamic / n_tickers / BACKTEST_YEARS
    print(f"\n  Per ticker per year (avg):")
    print(f"    ~{trades_per_ticker_yr:.0f} resolved trades/yr")
    print(f"    Fixed sizing:   {r_per_ticker_yr_fixed:+.1f}R/yr")
    print(f"    Dynamic sizing: {r_per_ticker_yr_dynamic:+.1f}R/yr")

    # ── dynamic score threshold: BULLISH only ────────────────────────────────
    print(f"\n{'═'*70}")
    print("BULLISH_SETUP: SCORE THRESHOLD SWEEP (ATR WR, n≥20)")
    print(f"{'═'*70}")
    bs = df[df["tier"] == "BULLISH_SETUP"]
    print(f"  {'Score threshold':>18} {'ATR WR':>8} {'Expect':>8} {'n':>6}")
    print("  " + "─" * 44)
    for thresh in [0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60]:
        sub = bs[bs["score"] >= thresh]
        wr, exp, n = _outcome_stats(sub)
        if n >= 20:
            print(f"  {thresh:>18.2f} {_pct(wr):>8} {_exp(exp):>8} {n:>6}")

    # ── per-ticker summary ───────────────────────────────────────────────────
    print(f"\n{'═'*70}")
    print("PER-TICKER ATR WIN RATE (n≥10 resolved)")
    print(f"{'═'*70}")
    rows = []
    for t in df["ticker"].unique():
        sub = df[df["ticker"] == t]
        wr, exp, n = _outcome_stats(sub)
        if n >= 10 and wr is not None:
            bs_pct = (sub["tier"] == "BULLISH_SETUP").mean()
            rows.append({"t": t, "wr": wr, "exp": exp, "n": n,
                         "cap": sub["cap"].iloc[0],
                         "sector": sub["sector"].iloc[0],
                         "bs_pct": bs_pct})
    tdf = pd.DataFrame(rows).sort_values("exp", ascending=False)

    for section, srows in [("Top 15", tdf.head(15)), ("Bottom 15", tdf.tail(15))]:
        print(f"\n  {section}:")
        print(f"  {'Ticker':<7} {'Cap':<7} {'Sector':<20} {'ATR WR':>7} {'Expect':>8} {'%BS':>5} {'n':>4}")
        print("  " + "─" * 60)
        for _, r in srows.iterrows():
            print(f"  {r['t']:<7} {r['cap']:<7} {r['sector'][:20]:<20} "
                  f"{r['wr']*100:>6.1f}% {r['exp']:>+7.2f}R {r['bs_pct']*100:>4.0f}% {r['n']:>4}")

    print(f"\n{'═'*70}")
    print(f"Results saved → {OUT_CSV}")
    print(f"{'═'*70}")


if __name__ == "__main__":
    main()
