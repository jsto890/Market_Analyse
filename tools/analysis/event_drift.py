#!/usr/bin/env python3
"""Does conditioning on an EVENT create forward signal where the panel had none?

`scan_forward_features.py` found no cross-sectional forward information in daily
price/volume on this corpus: every lead-candidate feature came back at |t| < 2.
That tests the panel *unconditionally*. The robust documented anomalies are mostly
event-conditioned -- post-earnings-announcement drift being the canonical one --
so the open question is whether restricting attention to the days after a large
surprise produces the drift the unconditional scan could not find.

No earnings-date feed is needed. Earnings show up in the panel as an outsized
return against the name's own recent volatility, on heavy volume, roughly
quarterly. That proxy is imperfect -- it also catches guidance, M&A rumour and
sector shocks -- but it is survivorship-free, needs no new data source, and the
cadence check below shows whether it is behaving like an earnings calendar.

Returns are cross-sectionally demeaned, so drift is measured against the peer
group and not against the market. t-stats cluster by ticker, since one name
contributes many overlapping events.
"""
from __future__ import annotations

import argparse
import sqlite3

import numpy as np
import pandas as pd

CORPUS_DB = "/Users/josephstorey/Market_Analyse/argus/backtests/_corpus/corpus.db"
CALIB_START = pd.Timestamp("2024-06-08")
HORIZONS = (1, 2, 3, 5, 10, 20, 40, 60)


def cluster_t(vals: np.ndarray, tick: np.ndarray) -> float:
    """t-stat of the mean, clustering by ticker."""
    s = pd.Series(vals).groupby(tick).mean()
    s = s.dropna()
    if len(s) < 3:
        return np.nan
    return float(s.mean() / (s.std(ddof=1) / np.sqrt(len(s))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ret-sigma", type=float, default=3.0,
                    help="event if |return| exceeds this many trailing sigmas")
    ap.add_argument("--vol-mult", type=float, default=2.0,
                    help="event also requires volume above this x its 60d mean")
    args = ap.parse_args()

    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        px = pd.read_sql("SELECT ticker,date,close,volume FROM prices",
                         con, parse_dates=["date"])
    finally:
        con.close()

    close = px.pivot(index="date", columns="ticker", values="close").sort_index()
    vol = px.pivot(index="date", columns="ticker", values="volume").sort_index()

    ret = close.pct_change()
    xret = ret.sub(ret.mean(axis=1), axis=0)          # peer-demeaned

    sigma = ret.rolling(60).std().shift(1)
    avgv = vol.rolling(60).mean().shift(1)
    big = (ret.abs() > args.ret_sigma * sigma) & (vol > args.vol_mult * avgv)

    # drop events within 20 sessions of a previous one, so a multi-day reaction
    # counts once rather than as three correlated observations
    isolated = big & ~(big.rolling(20, min_periods=1).sum().shift(1).fillna(0) > 0)

    R, X, E = ret.to_numpy(), np.nan_to_num(xret.to_numpy()), isolated.to_numpy()
    rows, cols = np.where(E)
    lo, hi = 60, max(HORIZONS)
    ok = (rows >= lo) & (rows < len(close.index) - hi - 1)
    rows, cols = rows[ok], cols[ok]

    tick = close.columns.to_numpy()[cols]
    dt = close.index.to_numpy()[rows]
    day_ret = R[rows, cols]
    up = day_ret > 0

    years = (close.index[-1] - close.index[0]).days / 365.25
    print(f"events: {len(rows):,} over {years:.1f}y across {close.shape[1]} names "
          f"= {len(rows)/close.shape[1]/years:.2f} per name per year")
    print("  (a genuine earnings proxy should land near 4; far above means the "
          "filter is catching non-earnings shocks)")
    print(f"  up-moves {up.mean()*100:.1f}%  |  threshold {args.ret_sigma}sigma "
          f"& {args.vol_mult}x volume\n")

    oos = dt < CALIB_START.to_datetime64()

    def drift(mask, label):
        r, c, t = rows[mask], cols[mask], tick[mask]
        cum = np.zeros(len(r))
        out = []
        for h in range(1, hi + 1):
            cum = cum + X[r + h, c]
            if h in HORIZONS:
                out.append((h, cum.mean() * 100, cluster_t(cum * 100, t)))
        print(f"  {label} (n={len(r):,})")
        print("    " + "".join(f"{f'{h}d':>10}" for h, _, _ in out))
        print("    " + "".join(f"{v:>+10.3f}" for _, v, _ in out))
        print("    " + "".join(f"{f'({t:+.1f})':>10}" for _, _, t in out))

    print("=" * 92)
    print("POST-EVENT DRIFT — cumulative peer-excess return %, (t clustered by ticker)")
    print("=" * 92)
    print("\nOOS (pre 2024-06):")
    drift(oos & up, "positive surprise")
    drift(oos & ~up, "negative surprise")

    print("\n  spread (positive minus negative), OOS:")
    for h in HORIZONS:
        cu = np.zeros(len(rows))
        for k in range(1, h + 1):
            cu = cu + X[rows + k, cols]
        a, b = cu[oos & up], cu[oos & ~up]
        print(f"    {h:>3}d  {(a.mean()-b.mean())*100:>+8.3f}pp")

    print("\nCalibration era (2024-06 onward):")
    drift(~oos & up, "positive surprise")
    drift(~oos & ~up, "negative surprise")

    print("\n" + "=" * 92)
    print("DOES IT SURVIVE CONTROLLING FOR THE TRAILING STATE?")
    print("=" * 92)
    print("If drift is just the reversal/momentum already measured, it should vanish")
    print("once events are split by prior 20d peer-excess return.\n")
    # window must END the day BEFORE the event: including the event day would sort
    # nearly every positive surprise into the "strong" bucket by construction
    trail = np.zeros(len(rows))
    for k in range(1, 21):
        trail = trail + X[rows - k, cols]
    cum20 = np.zeros(len(rows))
    for k in range(1, 21):
        cum20 = cum20 + X[rows + k, cols]

    med = np.median(trail[oos])
    for tname, tmask in (("prior 20d WEAK ", trail <= med), ("prior 20d STRONG", trail > med)):
        for dname, dmask in (("pos", up), ("neg", ~up)):
            m = oos & tmask & dmask
            print(f"  {tname} / {dname} surprise  n={m.sum():>6,}  "
                  f"fwd20d {cum20[m].mean()*100:>+7.3f}%  "
                  f"(t {cluster_t(cum20[m]*100, tick[m]):>+5.1f})")
    print()


if __name__ == "__main__":
    main()
