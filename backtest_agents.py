#!/usr/bin/env python3
"""
Argus technical agent backtest v2 — quality-tier framework.

Improvements over v1:
  - ATR-based stop/target exits (2×ATR stop, 3×ATR target, 1.5:1 R:R)
  - Quality tier: BULLISH_SETUP / WATCH / AVOID based on regime + N_eff + inflation_gap
  - Signal onset detection: first LONG after non-LONG (fresh vs stale)
  - Per-signal N_eff and inflation_gap computed in fast path

Universe: 81 tickers across indexes, large/mid/small cap, all 11 GICS sectors.
Method: compute indicators once per ticker, walk forward weekly, ATR-gated exits.
Output: backtest_results.csv + printed summary tables
"""
from __future__ import annotations

import sys
import time
import concurrent.futures
from datetime import datetime, timedelta
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
    _AGENT_FAMILY,
    _FAMILIES,
)
from argus.agents.base import Vote, Verdict

OUT_CSV = Path(__file__).parent / "backtest_results.csv"

# ── universe ──────────────────────────────────────────────────────────────────
UNIVERSE: list[dict] = [
    # Indexes / broad ETFs
    {"ticker": "SPY",   "cap": "index",  "sector": "Broad Market"},
    {"ticker": "QQQ",   "cap": "index",  "sector": "Technology"},
    {"ticker": "IWM",   "cap": "index",  "sector": "Small Cap"},
    {"ticker": "DIA",   "cap": "index",  "sector": "Broad Market"},
    {"ticker": "MDY",   "cap": "index",  "sector": "Mid Cap"},
    # Sector ETFs
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
    # Large cap — diversified sectors
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
    # Mid cap — diversified
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
    # Small cap — diversified
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

BACKTEST_YEARS = 2
SIGNAL_STEP    = 5      # signal every 5 trading days (weekly)
MIN_BARS       = 260    # indicator warm-up
FETCH_YEARS    = BACKTEST_YEARS + 0.5
ATR_STOP_MULT  = 2.0    # stop = entry ± ATR_STOP_MULT × ATR14
ATR_TARGET_MULT = 3.0   # target = entry ± ATR_TARGET_MULT × ATR14 → 1.5:1 R:R
MAX_HOLD_DAYS  = 20     # max bars before treating exit as OPEN


# ── fast scoring (no bootstrap CI, no RS-vs-Sector) ──────────────────────────

def _fast_score(df_slice: pd.DataFrame) -> dict:
    """Return verdict, score, regime, n_eff, inflation_gap, agreement_pct."""
    regime = _detect_ticker_regime(df_slice)
    votes = [v for v in run_all(df_slice) if v.agent != "RS vs Sector"]

    if regime == "gap_down_continuation":
        votes = [
            Vote(v.agent, v.verdict, v.confidence * 0.3, v.note, v.family)
            if _AGENT_FAMILY.get(v.agent) == "momentum_osc"
            else v
            for v in votes
        ]

    lw, sw = _capped_weights(votes)
    tw = lw + sw
    score = (lw - sw) / tw if tw > 0 else 0.0

    if score > 0.15:
        verdict = "LONG"
    elif score < -0.15:
        verdict = "SHORT"
    else:
        verdict = "WAIT"

    # Agreement (vote-count, not weight-based)
    n_long  = sum(1 for v in votes if v.verdict == Verdict.LONG)
    n_short = sum(1 for v in votes if v.verdict == Verdict.SHORT)
    n_total = len(votes)
    agreement = max(n_long, n_short) / n_total if n_total > 0 else 0.5
    inflation_gap = round(agreement - (1.0 + abs(score)) / 2.0, 4)

    n_eff = _effective_n(votes)

    return {
        "verdict": verdict,
        "score": round(score, 4),
        "regime": regime,
        "n_eff": n_eff,
        "inflation_gap": inflation_gap,
        "agreement_pct": round(agreement * 100, 1),
    }


def _quality_tier(verdict: str, regime: str, score: float,
                  n_eff: float, inflation_gap: float) -> str:
    """
    Three-tier entry classification:
      BULLISH_SETUP: strong case to enter LONG
      WATCH:         LONG signal but one or more quality conditions weak
      AVOID:         SHORT verdict OR gap_down_continuation
      WAIT:          neutral verdict
    """
    if verdict == "WAIT":
        return "WAIT"
    if verdict == "SHORT" or regime == "gap_down_continuation":
        return "AVOID"
    # verdict == LONG beyond here
    strong_regime  = regime in ("trending", "neutral")
    high_score     = abs(score) > 0.3
    good_n_eff     = n_eff > 1.8
    low_inflation  = inflation_gap < 0.15
    if strong_regime and high_score and good_n_eff and low_inflation:
        return "BULLISH_SETUP"
    return "WATCH"


def _atr_exit(highs: np.ndarray, lows: np.ndarray, idx: int,
              c0: float, atr: float, verdict: str) -> tuple[str, int]:
    """
    Scan forward MAX_HOLD_DAYS bars. For LONG:
      stop   = c0 - ATR_STOP_MULT * atr
      target = c0 + ATR_TARGET_MULT * atr
    Returns (outcome, days_to_exit) where outcome ∈ WIN / LOSS / OPEN.
    First bar that breaches either level wins. If same bar, loss wins (conservative).
    """
    if atr <= 0 or verdict == "WAIT":
        return "OPEN", MAX_HOLD_DAYS

    if verdict == "LONG":
        stop   = c0 - ATR_STOP_MULT   * atr
        target = c0 + ATR_TARGET_MULT * atr
        for d in range(1, MAX_HOLD_DAYS + 1):
            i = idx + d
            if i >= len(highs):
                return "OPEN", d
            hit_stop   = lows[i]  <= stop
            hit_target = highs[i] >= target
            if hit_stop and hit_target:
                return "LOSS", d   # same bar, conservative
            if hit_target:
                return "WIN", d
            if hit_stop:
                return "LOSS", d
        return "OPEN", MAX_HOLD_DAYS

    else:  # SHORT
        stop   = c0 + ATR_STOP_MULT   * atr
        target = c0 - ATR_TARGET_MULT * atr
        for d in range(1, MAX_HOLD_DAYS + 1):
            i = idx + d
            if i >= len(lows):
                return "OPEN", d
            hit_stop   = highs[i] >= stop
            hit_target = lows[i]  <= target
            if hit_stop and hit_target:
                return "LOSS", d
            if hit_target:
                return "WIN", d
            if hit_stop:
                return "LOSS", d
        return "OPEN", MAX_HOLD_DAYS


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

        # ATR column (compute_all provides atr_14)
        atrs = (df_full["atr_14"].values
                if "atr_14" in df_full.columns
                else np.zeros(len(df_full)))

        records = []
        prev_verdict = "WAIT"

        for idx in range(MIN_BARS, len(df_full) - MAX_HOLD_DAYS - 1, SIGNAL_STEP):
            sl = df_full.iloc[: idx + 1]
            sig = _fast_score(sl)

            verdict       = sig["verdict"]
            score         = sig["score"]
            regime        = sig["regime"]
            n_eff         = sig["n_eff"]
            inflation_gap = sig["inflation_gap"]
            agreement_pct = sig["agreement_pct"]

            tier   = _quality_tier(verdict, regime, score, n_eff, inflation_gap)
            onset  = (prev_verdict != verdict and verdict in ("LONG", "SHORT"))
            c0     = closes[idx]
            atr    = float(atrs[idx]) if not np.isnan(atrs[idx]) else 0.0

            # ATR-based stop/target exit
            outcome, days_held = _atr_exit(highs, lows, idx, c0, atr, verdict)

            # Fixed-period returns for comparison
            fwd_5d  = (closes[min(idx + 5,  len(closes)-1)] - c0) / c0 if c0 > 0 else None
            fwd_20d = (closes[min(idx + 20, len(closes)-1)] - c0) / c0 if c0 > 0 else None

            # Directional correctness at fixed periods
            def dir_win(fwd):
                if fwd is None or verdict == "WAIT":
                    return None
                return 1 if ((fwd > 0) if verdict == "LONG" else (fwd < 0)) else 0

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
                "agreement_pct":  agreement_pct,
                "tier":           tier,
                "onset":          onset,
                "atr":            round(atr, 4),
                # ATR-exit outcome
                "outcome":        outcome,      # WIN / LOSS / OPEN
                "days_held":      days_held,
                # Fixed-period comparison
                "fwd_5d":         round(fwd_5d * 100, 4) if fwd_5d is not None else None,
                "fwd_20d":        round(fwd_20d * 100, 4) if fwd_20d is not None else None,
                "dir_win_5d":     dir_win(fwd_5d),
                "dir_win_20d":    dir_win(fwd_20d),
            })
            prev_verdict = verdict

        return records
    except Exception as e:
        print(f"  [{ticker}] ERROR: {e}")
        return []


# ── analysis helpers ──────────────────────────────────────────────────────────

def _wr(df: pd.DataFrame, col: str):
    v = pd.to_numeric(df[col], errors="coerce").dropna()
    return (v.mean(), len(v)) if len(v) else (None, 0)


def _outcome_stats(sub: pd.DataFrame) -> tuple[float | None, float | None, float | None, int]:
    """ATR-exit win rate, avg days won, avg days lost, n (actionable only)."""
    act = sub[sub["verdict"].isin(["LONG", "SHORT"]) & sub["outcome"].isin(["WIN", "LOSS"])]
    if len(act) == 0:
        return None, None, None, 0
    wins   = act[act["outcome"] == "WIN"]
    losses = act[act["outcome"] == "LOSS"]
    wr = len(wins) / len(act)
    avg_d_win  = wins["days_held"].mean()  if len(wins)   else None
    avg_d_loss = losses["days_held"].mean() if len(losses) else None
    return round(wr, 4), avg_d_win, avg_d_loss, len(act)


def _expectancy(wr: float | None) -> str:
    """Expected R per trade given 1.5:1 R:R and win rate wr."""
    if wr is None:
        return "  —"
    # Win +1.5R, Lose −1R
    e = wr * 1.5 - (1 - wr) * 1.0
    return f"{e:+.2f}R"


def print_outcome_table(title: str, rows: list[tuple]) -> None:
    print(f"\n{'═'*72}")
    print(title)
    print('═'*72)
    hdr = (f"  {'Group':<26} {'ATR WR':>7} {'Expect':>8} "
           f"{'Avg WIN d':>9} {'Avg LOS d':>9} {'DirWR5d':>8} {'n':>5}")
    print(hdr)
    print("  " + "─" * 69)
    for label, subset in rows:
        wr, wd, ld, n = _outcome_stats(subset)
        dwr5, _ = _wr(subset[subset["verdict"].isin(["LONG","SHORT"])], "dir_win_5d")
        def pct(v): return f"{v*100:.1f}%" if v is not None else "  —"
        def days(v): return f"{v:.1f}d" if v is not None else "  —"
        print(f"  {label:<26} {pct(wr):>7} {_expectancy(wr):>8} "
              f"{days(wd):>9} {days(ld):>9} {pct(dwr5):>8} {n:>5}")


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Argus Backtest v2 — {len(UNIVERSE)} tickers, {BACKTEST_YEARS}y, "
          f"ATR exits ({ATR_STOP_MULT}×stop / {ATR_TARGET_MULT}×target), weekly signals")
    print(f"Fetching data + scoring (parallel)…\n")

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
    print(f"Saved → {OUT_CSV}")

    total      = len(df)
    actionable = df[df["verdict"].isin(["LONG", "SHORT"])]
    longs      = df[df["verdict"] == "LONG"]
    shorts     = df[df["verdict"] == "SHORT"]

    # ── distribution ─────────────────────────────────────────────────────────
    print(f"\n{'═'*72}")
    print("SIGNAL DISTRIBUTION")
    print('═'*72)
    print(f"  Total rows  : {total:,}")
    print(f"  LONG        : {len(longs):,}  ({len(longs)/total*100:.1f}%)")
    print(f"  SHORT       : {len(shorts):,}  ({len(shorts)/total*100:.1f}%)")
    print(f"  WAIT        : {total - len(longs) - len(shorts):,}")
    print(f"  Date range  : {df['date'].min()} → {df['date'].max()}")

    for tier in ["BULLISH_SETUP", "WATCH", "AVOID", "WAIT"]:
        n = (df["tier"] == tier).sum()
        print(f"  {tier:<15}: {n:,}  ({n/total*100:.1f}%)")

    onset_n = df["onset"].sum()
    print(f"  Onset signals: {onset_n:,}  ({onset_n/total*100:.1f}%)")

    # ── ATR exit summary ─────────────────────────────────────────────────────
    print(f"\n{'═'*72}")
    print("ATR EXIT BREAKDOWN (actionable signals with resolved exits)")
    print('═'*72)
    resolved = actionable[actionable["outcome"].isin(["WIN", "LOSS"])]
    open_n   = actionable[actionable["outcome"] == "OPEN"]
    print(f"  Resolved exits : {len(resolved):,} "
          f"({len(resolved)/len(actionable)*100:.1f}% of actionable)")
    print(f"  OPEN (no exit) : {len(open_n):,}")
    print(f"  WIN            : {(resolved['outcome']=='WIN').sum():,} "
          f"({(resolved['outcome']=='WIN').mean()*100:.1f}%)")
    print(f"  LOSS           : {(resolved['outcome']=='LOSS').sum():,} "
          f"({(resolved['outcome']=='LOSS').mean()*100:.1f}%)")
    avg_win_d  = resolved[resolved["outcome"]=="WIN"]["days_held"].mean()
    avg_loss_d = resolved[resolved["outcome"]=="LOSS"]["days_held"].mean()
    print(f"  Avg days to WIN  : {avg_win_d:.1f}")
    print(f"  Avg days to LOSS : {avg_loss_d:.1f}")

    # ── CORE TABLE: quality tier ──────────────────────────────────────────────
    print_outcome_table("CORE: ACCURACY BY QUALITY TIER", [
        ("BULLISH_SETUP",            df[df["tier"] == "BULLISH_SETUP"]),
        ("  BULLISH onset (fresh)",  df[(df["tier"]=="BULLISH_SETUP") & df["onset"]]),
        ("  BULLISH cont. (stale)",  df[(df["tier"]=="BULLISH_SETUP") & ~df["onset"]]),
        ("WATCH",                    df[df["tier"] == "WATCH"]),
        ("  WATCH onset (fresh)",    df[(df["tier"]=="WATCH") & df["onset"]]),
        ("AVOID (SHORT + GDC)",      df[df["tier"] == "AVOID"]),
    ])

    # ── regime ───────────────────────────────────────────────────────────────
    print_outcome_table("ACCURACY BY REGIME (LONG signals only)", [
        (r[:26], longs[longs["regime"] == r])
        for r in df["regime"].value_counts().index[:5]
    ])

    # ── N_eff buckets ─────────────────────────────────────────────────────────
    df["neff_bucket"] = pd.cut(
        df["n_eff"], bins=[0, 1.5, 2.5, 10],
        labels=["low <1.5 (echo)", "mid 1.5-2.5", "high >2.5 (diverse)"]
    )
    print_outcome_table("ACCURACY BY N_EFF SOURCE DIVERSITY (actionable)", [
        (str(b)[:26], df[df["neff_bucket"] == b])
        for b in ["low <1.5 (echo)", "mid 1.5-2.5", "high >2.5 (diverse)"]
    ])

    # ── inflation gap ─────────────────────────────────────────────────────────
    df["igap_bucket"] = pd.cut(
        df["inflation_gap"], bins=[-1, 0.05, 0.15, 2],
        labels=["low <0.05 (clean)", "mid 0.05-0.15", "high >0.15 (inflated)"]
    )
    print_outcome_table("ACCURACY BY INFLATION GAP (actionable)", [
        (str(b)[:26], df[df["igap_bucket"] == b])
        for b in ["low <0.05 (clean)", "mid 0.05-0.15", "high >0.15 (inflated)"]
    ])

    # ── score magnitude ───────────────────────────────────────────────────────
    df["score_bucket"] = pd.cut(
        df["score"].abs(), bins=[0, 0.2, 0.4, 0.6, 2],
        labels=["0.15-0.2 borderline", "0.2-0.4 weak", "0.4-0.6 medium", ">0.6 strong"]
    )
    print_outcome_table("ACCURACY BY SCORE MAGNITUDE", [
        (str(b)[:26], df[df["score_bucket"] == b])
        for b in ["0.15-0.2 borderline", "0.2-0.4 weak", "0.4-0.6 medium", ">0.6 strong"]
    ])

    # ── cap tier ─────────────────────────────────────────────────────────────
    print_outcome_table("ACCURACY BY CAP TIER", [
        (c, df[df["cap"] == c]) for c in ["index", "etf", "large", "mid", "small"]
    ])

    # ── sector (LONG only) ───────────────────────────────────────────────────
    sectors = sorted(longs["sector"].unique())
    print_outcome_table("ACCURACY BY SECTOR (LONG signals only)", [
        (s[:26], longs[longs["sector"] == s]) for s in sectors
    ])

    # ── BULLISH_SETUP: what factors explain better outcomes? ─────────────────
    bs = df[df["tier"] == "BULLISH_SETUP"]
    if len(bs) > 20:
        print(f"\n{'═'*72}")
        print("BULLISH_SETUP DEEP DIVE")
        print('═'*72)
        wr_all, _, _, n_all = _outcome_stats(bs)
        print(f"  Overall ATR WR     : {wr_all*100:.1f}%  n={n_all}  {_expectancy(wr_all)}")

        # Onset within BULLISH_SETUP
        bs_onset = bs[bs["onset"]]
        bs_cont  = bs[~bs["onset"]]
        wr_on, _, _, n_on   = _outcome_stats(bs_onset)
        wr_co, _, _, n_co   = _outcome_stats(bs_cont)
        print(f"  Onset (fresh entry): {wr_on*100:.1f}%  n={n_on}  {_expectancy(wr_on)}" if wr_on else "  Onset: —")
        print(f"  Continuation       : {wr_co*100:.1f}%  n={n_co}  {_expectancy(wr_co)}" if wr_co else "  Cont: —")

        # Regime within BULLISH_SETUP
        for r in ["trending", "neutral", "ranging"]:
            sub = bs[bs["regime"] == r]
            wr_r, _, _, n_r = _outcome_stats(sub)
            if wr_r is not None:
                print(f"  regime={r:<10}: {wr_r*100:.1f}%  n={n_r}  {_expectancy(wr_r)}")

    # ── per-ticker (top/bottom by ATR WR) ────────────────────────────────────
    print(f"\n{'═'*72}")
    print("PER-TICKER ATR WIN RATE (actionable, ≥10 resolved)")
    print('═'*72)
    ticker_rows = []
    for t in df["ticker"].unique():
        sub = df[df["ticker"] == t]
        wr, _, _, n = _outcome_stats(sub)
        dwr5, _ = _wr(sub[sub["verdict"].isin(["LONG","SHORT"])], "dir_win_5d")
        if n >= 10 and wr is not None:
            ticker_rows.append({
                "ticker": t, "wr": wr, "dwr5": dwr5, "n": n,
                "cap": sub["cap"].iloc[0], "sector": sub["sector"].iloc[0],
                "tier_bs": (sub["tier"]=="BULLISH_SETUP").mean(),
            })
    tdf = pd.DataFrame(ticker_rows).sort_values("wr", ascending=False)

    for section, rows in [("Top 15", tdf.head(15)), ("Bottom 15", tdf.tail(15))]:
        print(f"\n  {section}:")
        print(f"  {'Ticker':<7} {'Cap':<7} {'Sector':<20} "
              f"{'ATR WR':>7} {'DirWR5':>7} {'%BS':>6} {'n':>4}")
        print("  " + "─" * 60)
        for _, r in rows.iterrows():
            print(f"  {r['ticker']:<7} {r['cap']:<7} {r['sector'][:20]:<20} "
                  f"{r['wr']*100:>6.1f}% {(r['dwr5'] or 0)*100:>6.1f}% "
                  f"{r['tier_bs']*100:>5.0f}%  {r['n']:>4}")

    # ── score-return correlation (fixed-period, for comparison) ──────────────
    print(f"\n{'═'*72}")
    print("SCORE–RETURN CORRELATION (reference — fixed-period returns)")
    print('═'*72)
    for col, label in [("fwd_5d", "5d"), ("fwd_20d", "20d")]:
        valid = actionable[["score", col]].dropna()
        if len(valid) > 10:
            corr = valid["score"].corr(pd.to_numeric(valid[col], errors="coerce"))
            print(f"  score vs {label} return : r = {corr:+.4f}  (n={len(valid):,})")

    print(f"\n{'═'*72}")
    print(f"Results saved → {OUT_CSV}")
    print('═'*72)


if __name__ == "__main__":
    main()
