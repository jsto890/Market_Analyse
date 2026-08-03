#!/usr/bin/env python3
"""Is the Argus label a description of the present or a forecast of the future?

Hypothesis under test: the action_label reports where a name *is* (trend intact,
breakout done, momentum aligned) rather than where it is *going*. If true then

  * label strength correlates with TRAILING return, strongly and positively;
  * in event time the strong labels sit at the END of a run-up -- excess return
    accumulates before t=0 and goes flat or negative after;
  * the tradeable information is in the TRANSITION into a label, not its level.

Everything is measured in cross-sectionally demeaned returns (each day, every
name's return minus the equal-weight mean of all names scored that day), so the
market is removed and what is left is selection.
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd

CORPUS_DB = "/Users/josephstorey/Market_Analyse/argus/backtests/_corpus/corpus.db"
CALIB_START = pd.Timestamp("2024-06-08")
LABEL_ORDER = ["PRIME_LONG", "STANDARD_LONG", "WATCH", "WAIT", "AVOID"]
OFFSETS = [-60, -40, -20, -10, -5, -1, 0, 1, 5, 10, 20, 40, 60]


def build_xret(tickers) -> pd.DataFrame:
    """date x ticker matrix of cross-sectionally demeaned daily returns."""
    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        q = "SELECT ticker,date,close FROM prices WHERE ticker IN (%s)" % ",".join("?" * len(tickers))
        px = pd.read_sql(q, con, params=list(tickers), parse_dates=["date"])
    finally:
        con.close()
    wide = px.pivot(index="date", columns="ticker", values="close").sort_index()
    ret = wide.pct_change()
    return ret.sub(ret.mean(axis=1), axis=0)   # demean each date


def event_curve(sig: pd.DataFrame, xret: pd.DataFrame) -> pd.DataFrame:
    """Mean cumulative excess return in event time, per action_label."""
    dates = xret.index
    date_pos = {d: i for i, d in enumerate(dates)}
    col_pos = {c: i for i, c in enumerate(xret.columns)}
    X = xret.values

    lo, hi = min(OFFSETS), max(OFFSETS)
    rows = {}
    for lbl, g in sig.groupby("action_label"):
        # gather valid (row, col) anchors
        r = np.array([date_pos.get(d, -1) for d in g.date])
        c = np.array([col_pos.get(t, -1) for t in g.ticker])
        ok = (r >= -lo) & (r < len(dates) - hi) & (c >= 0)
        r, c = r[ok], c[ok]
        if len(r) == 0:
            continue
        # cumulative excess from t=lo..hi, anchored so t=0 is 0
        cur = np.zeros(len(r))
        curve = {}
        for off in range(lo, hi + 1):
            cur = cur + np.nan_to_num(X[r + off, c])
            if off in OFFSETS:
                curve[off] = cur.copy()
        base = curve[0]
        rows[lbl] = {off: float(np.nanmean(v - base) * 100) for off, v in curve.items()}
        rows[lbl]["n"] = len(r)
    return pd.DataFrame(rows).T


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    args = ap.parse_args()

    sig = pd.read_csv(args.csv, parse_dates=["date"])
    tickers = sorted(sig.ticker.unique())
    xret = build_xret(tickers)

    oos = sig[sig.date < CALIB_START]

    print("=" * 104)
    print("A · TRAILING vs FORWARD — what does the score actually describe?  (OOS)")
    print("=" * 104)
    # trailing excess returns, from the same demeaned matrix
    dates = xret.index; date_pos = {d: i for i, d in enumerate(dates)}
    col_pos = {c: i for i, c in enumerate(xret.columns)}
    X = np.nan_to_num(xret.values)
    r = np.array([date_pos.get(d, -1) for d in oos.date])
    c = np.array([col_pos.get(t, -1) for t in oos.ticker])
    ok = (r >= 60) & (r < len(dates) - 60) & (c >= 0)
    sub = oos[ok].copy(); r, c = r[ok], c[ok]

    def cum(a, b):   # cumulative demeaned return over [t+a, t+b]
        tot = np.zeros(len(r))
        for off in range(a, b + 1):
            tot += X[r + off, c]
        return tot * 100

    sub["trail_20d"] = cum(-19, 0)
    sub["trail_60d"] = cum(-59, 0)
    sub["fwd_20d_x"] = cum(1, 20)

    for col in ("trail_60d", "trail_20d", "fwd_20d_x"):
        rho = sub[["score", col]].dropna().corr(method="spearman").iloc[0, 1]
        print(f"  Spearman(score, {col:<10}) = {rho:+.4f}")
    print("\n  A state-descriptor scores high AFTER a move (trailing >> 0) and carries")
    print("  no forward information (fwd ~ 0 or negative). A forecaster is the reverse.")

    print("\n  mean excess return by label, trailing vs forward (OOS, %):")
    tbl = sub.groupby("action_label")[["trail_60d", "trail_20d", "fwd_20d_x"]].mean()
    tbl["n"] = sub.groupby("action_label").size()
    print(tbl.reindex([l for l in LABEL_ORDER if l in tbl.index]).round(3).to_string())

    print("\n" + "=" * 104)
    print("B · EVENT-TIME CURVE — cumulative excess return around the signal (OOS, %)")
    print("=" * 104)
    cur = event_curve(oos, xret)
    cur = cur.reindex([l for l in LABEL_ORDER if l in cur.index])
    disp = cur[["n"] + OFFSETS].copy()
    disp["n"] = disp["n"].astype(int)
    print(disp.round(3).to_string())
    print("\n  Read left-to-right: run-up into t=0 then flat/down after = the label is")
    print("  marking a move that has ALREADY happened.")

    print("\n" + "=" * 104)
    print("C · LEVEL vs TRANSITION — is the edge in entering the label, not being in it?")
    print("=" * 104)
    lb = sub[sub.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]
    rows = []
    for flag, nm in ((True, "onset (transition in)"), (False, "continuation (in state)")):
        g = lb[lb.onset == flag]
        if len(g) < 50:
            continue
        rows.append((nm, len(g), g.trail_20d.mean(), g.fwd_20d_x.mean(),
                     (g.outcome == "WIN").mean() * 100))
    print(f"  {'group':<26} {'n':>7} {'trail 20d':>10} {'fwd 20d':>9} {'WR%':>7}")
    for nm, n, tr, fw, wr in rows:
        print(f"  {nm:<26} {n:>7,} {tr:>+10.3f} {fw:>+9.3f} {wr:>7.1f}")

    print("\n" + "=" * 104)
    print("D · INVERSION CHECK — does fading the strongest labels actually pay? (OOS)")
    print("=" * 104)
    q = sub[sub.verdict == "LONG"].copy()
    if len(q) > 1000:
        q["decile"] = pd.qcut(q.score, 10, labels=False, duplicates="drop")
        d = q.groupby("decile").agg(n=("score", "size"), trail=("trail_20d", "mean"),
                                    fwd=("fwd_20d_x", "mean"))
        print(d.round(3).to_string())
        top, bot = d.fwd.iloc[-1], d.fwd.iloc[0]
        print(f"\n  bottom-decile fwd {bot:+.3f}%  vs  top-decile fwd {top:+.3f}%   "
              f"spread {bot - top:+.3f}pp in favour of the WEAKEST-looking names")

    print("\n" + "=" * 104)
    print("E · HORIZON SCAN — does the label carry forward information before")
    print("    mean reversion takes over?  (OOS long book, cumulative excess %)")
    print("=" * 104)
    lb2 = sub[sub.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]
    r2 = np.array([date_pos.get(d, -1) for d in lb2.date])
    c2 = np.array([col_pos.get(t, -1) for t in lb2.ticker])
    print(f"  {'horizon':>8} {'excess %':>10} {'t-stat (by ticker)':>20}")
    tot = np.zeros(len(r2))
    for h in range(1, 61):
        tot = tot + X[r2 + h, c2]
        if h in (1, 2, 3, 5, 10, 20, 40, 60):
            vals = pd.Series(tot * 100).groupby(lb2.ticker.values).mean()
            t = vals.mean() / (vals.std(ddof=1) / np.sqrt(len(vals))) if len(vals) > 2 else np.nan
            print(f"  {h:>8}d {vals.mean():>+10.3f} {t:>20.2f}")
    print("\n  Positive at short h then decaying = momentum that is real but brief.")
    print("  Negative throughout = the label marks exhaustion, not continuation.")
    print()


if __name__ == "__main__":
    main()
