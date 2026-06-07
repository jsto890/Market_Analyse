#!/usr/bin/env python3
"""
Argus technical agent backtest — broad universe, 2 years.

Universe: ~90 tickers across indexes, large/mid/small cap, all 11 GICS sectors.
Method:
  - Fetch 2.5 years of daily OHLCV per ticker (extra lookback for indicator warm-up)
  - Compute indicators once per ticker on full history
  - Walk forward weekly (every 5 trading days), slice at each date
  - Score via _capped_weights (regime gate included); skip RS-vs-Sector and bootstrap CI
  - Record verdict, score, regime, and forward 1d / 5d / 20d returns
  - Segment analysis: direction accuracy, by cap tier, by sector, score buckets,
    regime gate impact, and family attribution across wins/losses

Output: backtest_results.csv + printed summary
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
    _AGENT_FAMILY,
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
    {"ticker": "XLK",   "cap": "etf",    "sector": "Technology"},
    {"ticker": "XLF",   "cap": "etf",    "sector": "Financials"},
    {"ticker": "XLV",   "cap": "etf",    "sector": "Healthcare"},
    {"ticker": "XLY",   "cap": "etf",    "sector": "Consumer Cyclical"},
    {"ticker": "XLP",   "cap": "etf",    "sector": "Consumer Defensive"},
    {"ticker": "XLE",   "cap": "etf",    "sector": "Energy"},
    {"ticker": "XLI",   "cap": "etf",    "sector": "Industrials"},
    {"ticker": "XLC",   "cap": "etf",    "sector": "Comm Services"},
    {"ticker": "XLRE",  "cap": "etf",    "sector": "Real Estate"},
    {"ticker": "XLU",   "cap": "etf",    "sector": "Utilities"},
    {"ticker": "XLB",   "cap": "etf",    "sector": "Materials"},
    # Large cap — Technology
    {"ticker": "AAPL",  "cap": "large",  "sector": "Technology"},
    {"ticker": "MSFT",  "cap": "large",  "sector": "Technology"},
    {"ticker": "NVDA",  "cap": "large",  "sector": "Technology"},
    {"ticker": "AMD",   "cap": "large",  "sector": "Technology"},
    {"ticker": "AVGO",  "cap": "large",  "sector": "Technology"},
    {"ticker": "INTC",  "cap": "large",  "sector": "Technology"},
    {"ticker": "QCOM",  "cap": "large",  "sector": "Technology"},
    {"ticker": "AMAT",  "cap": "large",  "sector": "Technology"},
    # Large cap — Financials
    {"ticker": "JPM",   "cap": "large",  "sector": "Financials"},
    {"ticker": "GS",    "cap": "large",  "sector": "Financials"},
    {"ticker": "BAC",   "cap": "large",  "sector": "Financials"},
    {"ticker": "V",     "cap": "large",  "sector": "Financials"},
    {"ticker": "MA",    "cap": "large",  "sector": "Financials"},
    # Large cap — Healthcare
    {"ticker": "JNJ",   "cap": "large",  "sector": "Healthcare"},
    {"ticker": "LLY",   "cap": "large",  "sector": "Healthcare"},
    {"ticker": "ABBV",  "cap": "large",  "sector": "Healthcare"},
    {"ticker": "MRK",   "cap": "large",  "sector": "Healthcare"},
    {"ticker": "UNH",   "cap": "large",  "sector": "Healthcare"},
    # Large cap — Consumer / Industrials / Energy / Comm
    {"ticker": "AMZN",  "cap": "large",  "sector": "Consumer Cyclical"},
    {"ticker": "TSLA",  "cap": "large",  "sector": "Consumer Cyclical"},
    {"ticker": "NKE",   "cap": "large",  "sector": "Consumer Cyclical"},
    {"ticker": "COST",  "cap": "large",  "sector": "Consumer Defensive"},
    {"ticker": "PG",    "cap": "large",  "sector": "Consumer Defensive"},
    {"ticker": "XOM",   "cap": "large",  "sector": "Energy"},
    {"ticker": "CVX",   "cap": "large",  "sector": "Energy"},
    {"ticker": "COP",   "cap": "large",  "sector": "Energy"},
    {"ticker": "CAT",   "cap": "large",  "sector": "Industrials"},
    {"ticker": "GE",    "cap": "large",  "sector": "Industrials"},
    {"ticker": "GOOGL", "cap": "large",  "sector": "Comm Services"},
    {"ticker": "META",  "cap": "large",  "sector": "Comm Services"},
    {"ticker": "NFLX",  "cap": "large",  "sector": "Comm Services"},
    # Mid cap — diversified
    {"ticker": "SMCI",  "cap": "mid",    "sector": "Technology"},
    {"ticker": "FSLR",  "cap": "mid",    "sector": "Energy"},
    {"ticker": "CELH",  "cap": "mid",    "sector": "Consumer Defensive"},
    {"ticker": "FIVE",  "cap": "mid",    "sector": "Consumer Cyclical"},
    {"ticker": "EXAS",  "cap": "mid",    "sector": "Healthcare"},
    {"ticker": "ENPH",  "cap": "mid",    "sector": "Energy"},
    {"ticker": "RCM",   "cap": "mid",    "sector": "Healthcare"},
    {"ticker": "DKNG",  "cap": "mid",    "sector": "Consumer Cyclical"},
    {"ticker": "CHRD",  "cap": "mid",    "sector": "Energy"},
    {"ticker": "CRVL",  "cap": "mid",    "sector": "Technology"},
    {"ticker": "LNTH",  "cap": "mid",    "sector": "Healthcare"},
    {"ticker": "WCC",   "cap": "mid",    "sector": "Industrials"},
    {"ticker": "MATX",  "cap": "mid",    "sector": "Industrials"},
    {"ticker": "FCX",   "cap": "mid",    "sector": "Materials"},
    {"ticker": "CF",    "cap": "mid",    "sector": "Materials"},
    {"ticker": "AMT",   "cap": "mid",    "sector": "Real Estate"},
    # Small cap — diversified
    {"ticker": "MARA",  "cap": "small",  "sector": "Technology"},
    {"ticker": "RIOT",  "cap": "small",  "sector": "Technology"},
    {"ticker": "QUBT",  "cap": "small",  "sector": "Technology"},
    {"ticker": "IREN",  "cap": "small",  "sector": "Technology"},
    {"ticker": "NNE",   "cap": "small",  "sector": "Industrials"},
    {"ticker": "LUNR",  "cap": "small",  "sector": "Industrials"},
    {"ticker": "DNN",   "cap": "small",  "sector": "Energy"},
    {"ticker": "UEC",   "cap": "small",  "sector": "Energy"},
    {"ticker": "LEU",   "cap": "small",  "sector": "Energy"},
    {"ticker": "RXRX",  "cap": "small",  "sector": "Healthcare"},
    {"ticker": "ACHR",  "cap": "small",  "sector": "Industrials"},
    {"ticker": "JOBY",  "cap": "small",  "sector": "Industrials"},
    {"ticker": "AVXL",  "cap": "small",  "sector": "Healthcare"},
    {"ticker": "TMDX",  "cap": "small",  "sector": "Healthcare"},
    {"ticker": "GROY",  "cap": "small",  "sector": "Materials"},
    {"ticker": "BKSY",  "cap": "small",  "sector": "Technology"},
    {"ticker": "SOFI",  "cap": "small",  "sector": "Financials"},
    {"ticker": "UPST",  "cap": "small",  "sector": "Financials"},
]

BACKTEST_YEARS = 2
SIGNAL_STEP    = 5    # signal every 5 trading days (weekly)
MIN_BARS       = 260  # minimum bars for indicator warm-up (EMA200 needs 200+)
FETCH_YEARS    = BACKTEST_YEARS + 0.5  # extra buffer for warm-up

# ── scoring (fast path — no bootstrap CI, no RS-vs-Sector, no LOO) ────────────

def _fast_score(df_slice: pd.DataFrame) -> tuple[str, float, str]:
    """Score a slice. Returns (verdict, score, regime)."""
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
    return verdict, score, regime


def _fast_score_unfiltered(df_slice: pd.DataFrame) -> tuple[str, float]:
    """Score without regime gate — for gate-impact comparison."""
    votes = [v for v in run_all(df_slice) if v.agent != "RS vs Sector"]
    lw, sw = _capped_weights(votes)
    tw = lw + sw
    score = (lw - sw) / tw if tw > 0 else 0.0
    verdict = "LONG" if score > 0.15 else ("SHORT" if score < -0.15 else "WAIT")
    return verdict, score


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
        if raw.empty or len(raw) < MIN_BARS + 25:
            return []
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in raw.columns]
        raw = raw.rename(columns={"adj close": "close"})

        # Compute indicators once on full history
        df_full = compute_all(raw)
        df_full.attrs["symbol"] = ticker

        closes = df_full["close"].values
        dates  = df_full.index

        records = []
        # Walk forward: signal at each step, measure forward returns
        backtest_start_idx = MIN_BARS
        signal_indices = range(backtest_start_idx, len(df_full) - 21, SIGNAL_STEP)

        for idx in signal_indices:
            sl = df_full.iloc[: idx + 1]
            verdict, score, regime = _fast_score(sl)
            verdict_raw, score_raw = _fast_score_unfiltered(sl)

            # Forward returns from close at signal date
            c0 = closes[idx]
            fwd_1d  = (closes[min(idx + 1,  len(closes)-1)] - c0) / c0 if c0 > 0 else None
            fwd_5d  = (closes[min(idx + 5,  len(closes)-1)] - c0) / c0 if c0 > 0 else None
            fwd_20d = (closes[min(idx + 20, len(closes)-1)] - c0) / c0 if c0 > 0 else None

            # Directional correctness (LONG → positive return = win)
            def win(fwd, v):
                if fwd is None or v == "WAIT":
                    return None
                return (fwd > 0) if v == "LONG" else (fwd < 0)

            records.append({
                "ticker":       ticker,
                "cap":          meta["cap"],
                "sector":       meta["sector"],
                "date":         dates[idx].strftime("%Y-%m-%d"),
                "verdict":      verdict,
                "score":        round(score, 4),
                "verdict_raw":  verdict_raw,
                "score_raw":    round(score_raw, 4),
                "regime":       regime,
                "gate_changed": verdict != verdict_raw,
                "fwd_1d":       round(fwd_1d * 100, 4) if fwd_1d is not None else None,
                "fwd_5d":       round(fwd_5d * 100, 4) if fwd_5d is not None else None,
                "fwd_20d":      round(fwd_20d * 100, 4) if fwd_20d is not None else None,
                "win_1d":       win(fwd_1d, verdict),
                "win_5d":       win(fwd_5d, verdict),
                "win_20d":      win(fwd_20d, verdict),
            })
        return records
    except Exception as e:
        print(f"  [{ticker}] ERROR: {e}")
        return []


# ── analysis helpers ──────────────────────────────────────────────────────────

def _wr(df: pd.DataFrame, win_col: str) -> tuple[float | None, int]:
    v = pd.to_numeric(df[win_col], errors="coerce").dropna()
    return (v.mean(), len(v)) if len(v) else (None, 0)


def _avg(df: pd.DataFrame, ret_col: str) -> tuple[float | None, int]:
    v = df[ret_col].dropna()
    return (v.mean(), len(v)) if len(v) else (None, 0)


def print_table(title: str, rows: list[tuple]) -> None:
    print(f"\n{'═'*64}")
    print(title)
    print('═'*64)
    hdr = f"  {'Group':<28} {'1d WR':>7} {'1d avg':>8} {'5d WR':>7} {'5d avg':>8} {'20d WR':>7}  {'n':>5}"
    print(hdr)
    print("  " + "─" * 61)
    for label, subset in rows:
        actionable = subset[subset["verdict"].isin(["LONG", "SHORT"])]
        wr1, n1  = _wr(actionable, "win_1d")
        wr5, _   = _wr(actionable, "win_5d")
        wr20, _  = _wr(actionable, "win_20d")
        a1, _    = _avg(actionable, "fwd_1d")
        a5, _    = _avg(actionable, "fwd_5d")
        def pct(v): return f"{v*100:.1f}%" if v is not None else "  —"
        def ret(v): return f"{v:+.2f}%" if v is not None else "    —"
        print(f"  {label:<28} {pct(wr1):>7} {ret(a1):>8} {pct(wr5):>7} {ret(a5):>8} {pct(wr20):>7}  {n1:>5}")


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print(f"Argus Agent Backtest — {len(UNIVERSE)} tickers, {BACKTEST_YEARS}y, weekly signals")
    print(f"Indicator warm-up: {MIN_BARS} bars | Signal step: {SIGNAL_STEP} days")
    print(f"Fetching data + scoring (parallel)…\n")

    t0 = time.time()
    all_records: list[dict] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(backtest_ticker, m): m["ticker"] for m in UNIVERSE}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            ticker = futures[fut]
            recs = fut.result()
            all_records.extend(recs)
            if done % 10 == 0 or done == len(UNIVERSE):
                print(f"  {done}/{len(UNIVERSE)} tickers done  ({len(all_records):,} signal rows so far)")

    elapsed = time.time() - t0
    print(f"\nCompleted in {elapsed:.0f}s — {len(all_records):,} total signal rows")

    if not all_records:
        print("No data returned — check network / yfinance.")
        return

    df = pd.DataFrame(all_records)
    df.to_csv(OUT_CSV, index=False)
    print(f"Saved → {OUT_CSV}")

    # ── summary ─────────────────────────────────────────────────────────────

    total       = len(df)
    actionable  = df[df["verdict"].isin(["LONG", "SHORT"])]
    longs       = df[df["verdict"] == "LONG"]
    shorts      = df[df["verdict"] == "SHORT"]
    waits       = df[df["verdict"] == "WAIT"]

    print(f"\n{'═'*64}")
    print("SIGNAL DISTRIBUTION")
    print('═'*64)
    print(f"  Total signal rows   : {total:,}")
    print(f"  LONG                : {len(longs):,}  ({len(longs)/total*100:.1f}%)")
    print(f"  SHORT               : {len(shorts):,}  ({len(shorts)/total*100:.1f}%)")
    print(f"  WAIT                : {len(waits):,}  ({len(waits)/total*100:.1f}%)")
    print(f"  Date range          : {df['date'].min()} → {df['date'].max()}")
    print(f"  Regime GDC events   : {(df['regime']=='gap_down_continuation').sum():,}  ({(df['regime']=='gap_down_continuation').mean()*100:.1f}%)")
    print(f"  Gate changed verdict: {df['gate_changed'].sum():,}  ({df['gate_changed'].mean()*100:.1f}%)")

    # ── direction accuracy ───────────────────────────────────────────────────
    print_table("DIRECTION ACCURACY — LONG vs SHORT", [
        ("ALL actionable",         actionable),
        ("  LONG signals",         longs),
        ("  SHORT signals",        shorts),
    ])

    # ── score bucket accuracy ────────────────────────────────────────────────
    def score_bucket(s):
        a = abs(s)
        if a >= 0.6: return "strong (|score|≥0.6)"
        if a >= 0.4: return "medium (0.4–0.6)"
        if a >= 0.2: return "weak   (0.2–0.4)"
        return "borderline (0.15–0.2)"

    df["score_bucket"] = df["score"].apply(score_bucket)
    bucket_rows = [(b, df[df["score_bucket"]==b]) for b in [
        "strong (|score|≥0.6)", "medium (0.4–0.6)", "weak   (0.2–0.4)", "borderline (0.15–0.2)"
    ]]
    print_table("ACCURACY BY CONVICTION SCORE", bucket_rows)

    # ── by cap tier ──────────────────────────────────────────────────────────
    cap_rows = [(c, df[df["cap"]==c]) for c in ["index", "etf", "large", "mid", "small"]]
    print_table("ACCURACY BY CAP TIER", cap_rows)

    # ── by sector ───────────────────────────────────────────────────────────
    sectors = sorted(df["sector"].unique())
    sector_rows = [(s[:28], df[df["sector"]==s]) for s in sectors]
    print_table("ACCURACY BY SECTOR", sector_rows)

    # ── regime breakdown ─────────────────────────────────────────────────────
    regime_rows = [(r[:28], df[df["regime"]==r]) for r in df["regime"].value_counts().index[:5]]
    print_table("ACCURACY BY REGIME", regime_rows)

    # ── gate impact ──────────────────────────────────────────────────────────
    gdc = df[df["regime"] == "gap_down_continuation"]
    if len(gdc) > 0:
        gdc_changed = gdc[gdc["gate_changed"]]
        print(f"\n{'═'*64}")
        print("REGIME GATE IMPACT (gap_down_continuation only)")
        print('═'*64)
        print(f"  GDC signal rows          : {len(gdc):,}")
        print(f"  Gate changed verdict     : {len(gdc_changed):,}  ({len(gdc_changed)/len(gdc)*100:.1f}%)")
        if len(gdc) >= 3:
            wr_gdc, n = _wr(gdc[gdc["verdict"].isin(["LONG","SHORT"])], "win_5d")
            wr_nongdc, _ = _wr(df[df["regime"]!="gap_down_continuation"][df["verdict"].isin(["LONG","SHORT"])], "win_5d")
            if wr_gdc is not None:
                print(f"  5d WR in GDC             : {wr_gdc*100:.1f}%  (n={n})")
            if wr_nongdc is not None:
                print(f"  5d WR non-GDC            : {wr_nongdc*100:.1f}%")

    # ── score–return correlation ─────────────────────────────────────────────
    print(f"\n{'═'*64}")
    print("SCORE–RETURN CORRELATION (actionable signals)")
    print('═'*64)
    for col, label in [("fwd_1d", "1d return"), ("fwd_5d", "5d return"), ("fwd_20d", "20d return")]:
        valid = actionable[["score", col]].dropna()
        if len(valid) > 10:
            corr = valid["score"].corr(valid[col])
            print(f"  score vs {label:<12}: r = {corr:+.4f}  (n={len(valid):,})")

    # ── per-ticker summary (top/bottom performers) ───────────────────────────
    print(f"\n{'═'*64}")
    print("PER-TICKER 5d WIN RATE (actionable, ≥10 signals)")
    print('═'*64)
    ticker_stats = []
    for t in df["ticker"].unique():
        sub = df[(df["ticker"]==t) & df["verdict"].isin(["LONG","SHORT"])]
        wr5, n = _wr(sub, "win_5d")
        a5, _  = _avg(sub, "fwd_5d")
        if n >= 10 and wr5 is not None:
            ticker_stats.append({"ticker": t, "wr5": wr5, "avg5": a5, "n": n,
                                  "cap": df[df["ticker"]==t]["cap"].iloc[0],
                                  "sector": df[df["ticker"]==t]["sector"].iloc[0]})
    stats_df = pd.DataFrame(ticker_stats).sort_values("wr5", ascending=False)
    print(f"\n  Top 15:")
    print(f"  {'Ticker':<8} {'Cap':<7} {'Sector':<22} {'5d WR':>7} {'5d avg':>8} {'n':>5}")
    print("  " + "─" * 57)
    for _, r in stats_df.head(15).iterrows():
        print(f"  {r['ticker']:<8} {r['cap']:<7} {r['sector'][:22]:<22} "
              f"{r['wr5']*100:>6.1f}% {r['avg5']:>+7.2f}%  {r['n']:>4}")
    print(f"\n  Bottom 15:")
    print(f"  {'Ticker':<8} {'Cap':<7} {'Sector':<22} {'5d WR':>7} {'5d avg':>8} {'n':>5}")
    print("  " + "─" * 57)
    for _, r in stats_df.tail(15).iterrows():
        print(f"  {r['ticker']:<8} {r['cap']:<7} {r['sector'][:22]:<22} "
              f"{r['wr5']*100:>6.1f}% {r['avg5']:>+7.2f}%  {r['n']:>4}")

    # ── LONG vs SHORT asymmetry ───────────────────────────────────────────────
    print(f"\n{'═'*64}")
    print("LONG vs SHORT SIGNAL ASYMMETRY BY CAP TIER")
    print('═'*64)
    print(f"  {'Tier':<8} {'LONG WR(5d)':>12} {'SHORT WR(5d)':>13} {'LONG n':>8} {'SHORT n':>8}")
    print("  " + "─" * 52)
    for cap in ["index", "etf", "large", "mid", "small"]:
        sub = df[df["cap"] == cap]
        lwr, ln = _wr(sub[sub["verdict"]=="LONG"], "win_5d")
        swr, sn = _wr(sub[sub["verdict"]=="SHORT"], "win_5d")
        def p(v): return f"{v*100:.1f}%" if v is not None else "—"
        print(f"  {cap:<8} {p(lwr):>12} {p(swr):>13} {ln:>8} {sn:>8}")

    print(f"\n{'═'*64}")
    print(f"Results saved to: {OUT_CSV}")
    print('═'*64)


if __name__ == "__main__":
    main()
