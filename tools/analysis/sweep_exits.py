#!/usr/bin/env python3
"""Where should the target sit? First-touch sweep over (stop, R:R) on real paths.

The labelling backtest recorded MFE/MAE per trade, but those are censored by the
exit rule that produced them, so they cannot answer "what if the target were
nearer". This re-walks the actual forward path for every signal straight from the
corpus -- no agent re-run needed, the signals CSV already carries entry, ATR and
regime -- and resolves each trade by FIRST touch under a grid of stop and R:R
multiples.

Ties within a bar resolve to the stop, which is the conservative reading: with
only daily OHLC there is no way to know which extreme came first.

Expectancy is in R (risk units), so it is comparable across stop widths; a wider
stop buys a higher win rate at the cost of a bigger loss per loser, and R nets
that out. Costs are applied as a flat per-trade drag in R, since a fixed cash
cost is a larger fraction of a tighter stop.
"""
from __future__ import annotations

import argparse
import sqlite3

import numpy as np
import pandas as pd

CORPUS_DB = "/Users/josephstorey/Market_Analyse/argus/backtests/_corpus/corpus.db"
CALIB_START = pd.Timestamp("2024-06-08")
HOLD = 20
STOPS = (1.0, 1.5, 2.0, 2.5, 3.0)
RRS = (0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0)


def build_paths(sig: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(n, HOLD) forward high/low matrices plus the close at the hold horizon."""
    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        px = pd.read_sql("SELECT ticker,date,high,low,close FROM prices",
                         con, parse_dates=["date"])
    finally:
        con.close()

    hi = px.pivot(index="date", columns="ticker", values="high").sort_index()
    lo = px.pivot(index="date", columns="ticker", values="low").sort_index()
    cl = px.pivot(index="date", columns="ticker", values="close").sort_index()

    dpos = {d: i for i, d in enumerate(hi.index)}
    cpos = {c: i for i, c in enumerate(hi.columns)}
    r = sig.date.map(dpos)
    c = sig.ticker.map(cpos)
    keep = r.notna() & c.notna() & (r < len(hi.index) - HOLD - 1)

    sig_ok = sig[keep].reset_index(drop=True)
    r = r[keep].to_numpy().astype(int)
    c = c[keep].to_numpy().astype(int)

    H, L, C = hi.to_numpy(), lo.to_numpy(), cl.to_numpy()
    offs = np.arange(1, HOLD + 1)
    highs = H[r[:, None] + offs, c[:, None]]
    lows = L[r[:, None] + offs, c[:, None]]
    exitc = C[r + HOLD, c]
    return highs, lows, exitc, sig_ok


def resolve(highs, lows, exitc, entry, atr, stop_m, rr) -> np.ndarray:
    """R-multiple per trade under first touch."""
    risk = stop_m * atr
    stop = entry - risk
    tgt = entry + rr * risk

    hit_s = lows <= stop[:, None]
    hit_t = highs >= tgt[:, None]
    big = HOLD + 10
    day_s = np.where(hit_s.any(1), hit_s.argmax(1), big)
    day_t = np.where(hit_t.any(1), hit_t.argmax(1), big)

    out = (exitc - entry) / risk                  # timeout: mark to market
    out = np.where(day_t < day_s, rr, out)        # target first
    out = np.where(day_s <= day_t, -1.0, out)     # stop first, ties to the stop
    out = np.where((day_s == big) & (day_t == big), (exitc - entry) / risk, out)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--cost", type=float, default=0.0,
                    help="per-trade drag in R (try 0.05)")
    args = ap.parse_args()

    sig = pd.read_csv(args.csv, parse_dates=["date"])
    sig = sig[(sig.date < CALIB_START) & (sig.verdict == "LONG")
              & sig.atr.notna() & (sig.atr > 0)].reset_index(drop=True)

    highs, lows, exitc, sig = build_paths(sig)
    entry = sig.close.to_numpy(float)
    atr = sig.atr.to_numpy(float)
    print(f"OOS long signals on real paths: {len(sig):,}  "
          f"({sig.date.min().date()} .. {sig.date.max().date()})")
    print(f"per-trade cost drag: {args.cost:.2f}R\n")

    print("=" * 88)
    print("Expectancy in R by (stop ATR x R:R multiple) — first touch, 20d cap")
    print("=" * 88)
    print(f"  {'stop':>5} " + "".join(f"{f'RR {rr}':>10}" for rr in RRS))
    best = None
    grid = {}
    for s in STOPS:
        cells = []
        for rr in RRS:
            R = resolve(highs, lows, exitc, entry, atr, s, rr) - args.cost
            m = R.mean()
            grid[(s, rr)] = R
            cells.append(f"{m:>+10.3f}")
            if best is None or m > best[0]:
                best = (m, s, rr)
        print(f"  {s:>5.1f} " + "".join(cells))
    print(f"\n  best: stop {best[1]} ATR, R:R {best[2]}  ->  {best[0]:+.3f}R")
    print(f"  production today: stop 2.0 ATR, R:R 2.0  ->  {grid[(2.0, 2.0)].mean():+.3f}R")

    print("\n" + "=" * 88)
    print("Win rate at the same cells (%)")
    print("=" * 88)
    print(f"  {'stop':>5} " + "".join(f"{f'RR {rr}':>10}" for rr in RRS))
    for s in STOPS:
        cells = [f"{(grid[(s, rr)] > 0).mean() * 100:>10.1f}" for rr in RRS]
        print(f"  {s:>5.1f} " + "".join(cells))

    print("\n" + "=" * 88)
    print("Best R:R per regime at the production 2.0 ATR stop")
    print("=" * 88)
    print(f"  {'regime':<24} {'n':>7} " + "".join(f"{f'RR {rr}':>9}" for rr in RRS))
    for rg, g in sig.groupby("regime"):
        idx = g.index.to_numpy()
        cells = [f"{grid[(2.0, rr)][idx].mean():>+9.3f}" for rr in RRS]
        print(f"  {rg:<24} {len(g):>7,} " + "".join(cells))

    print("\n  A row that peaks at low R:R means the target is placed further than")
    print("  price actually travels in that regime.")

    print("\n" + "=" * 88)
    print("Should the target scale with conviction? Best R:R by score quintile")
    print("=" * 88)
    print("  Production used rr_mult = 2.0 + min(|score|,1.0), i.e. a wider target for")
    print("  higher conviction. That is only justified if the optimum R:R actually RISES")
    print("  with score. Rows are at the production 2.0 ATR stop.\n")
    qs = pd.qcut(sig.score, 5, labels=["q1 low", "q2", "q3", "q4", "q5 high"])
    print(f"  {'quintile':<10} {'n':>7} " + "".join(f"{f'RR {rr}':>9}" for rr in RRS)
          + f"{'argmax':>9}")
    for q, g in sig.groupby(qs, observed=True):
        idx = g.index.to_numpy()
        means = [grid[(2.0, rr)][idx].mean() for rr in RRS]
        cells = "".join(f"{m:>+9.3f}" for m in means)
        print(f"  {str(q):<10} {len(g):>7,} {cells}{RRS[int(np.argmax(means))]:>9}")
    print("\n  A flat argmax column means conviction-scaled targets are unjustified:")
    print("  the best target distance is the same regardless of score.")
    print()


if __name__ == "__main__":
    main()
