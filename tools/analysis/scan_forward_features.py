#!/usr/bin/env python3
"""Does ANY cheaply-computable feature carry forward information on this corpus?

The labelling backtest showed `action_label` ranks trailing return (+0.67) and not
forward return (-0.015). Two questions follow, and this script answers both before
any redesign work is committed to:

  1. CONTROL -- is the inversion specific to Argus, or would any trailing-strength
     ranking invert here? If a naive 20d-momentum decile inverts identically then
     Argus is not uniquely broken, it is merely measuring the reversal leg.

  2. FEASIBILITY -- scanning a panel of lead-candidate features (long-horizon
     momentum with a skip month, volatility compression, volume dry-up, base
     structure, accumulation), does anything predict forward 20d cross-sectional
     return? If nothing does, no relabelling of this feature space can work and the
     forward expectation has to come from outside price/volume.

Everything is cross-sectional: each date, every feature is ranked across the names
alive that date and the forward return is demeaned by the same cross-section, so
the market is removed and what is measured is selection.

Metrics are the per-date Spearman IC (the standard cross-sectional yardstick) and
the top-minus-bottom decile spread. The IC series is autocorrelated at 20d holds
sampled every 5d, so its t-stat is reported with a Newey-West correction.
"""
from __future__ import annotations

import argparse
import sqlite3

import numpy as np
import pandas as pd
from scipy import stats

CORPUS_DB = "/Users/josephstorey/Market_Analyse/argus/backtests/_corpus/corpus.db"
CALIB_START = pd.Timestamp("2024-06-08")
FWD = 20
STEP = 5
MIN_NAMES = 40


def load_panel() -> dict[str, pd.DataFrame]:
    con = sqlite3.connect(f"file:{CORPUS_DB}?mode=ro", uri=True)
    try:
        px = pd.read_sql(
            "SELECT ticker,date,high,low,close,volume FROM prices",
            con, parse_dates=["date"],
        )
    finally:
        con.close()
    return {
        f: px.pivot(index="date", columns="ticker", values=f).sort_index()
        for f in ("high", "low", "close", "volume")
    }


def build_features(p: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    close, high, low, vol = p["close"], p["high"], p["low"], p["volume"]
    ret = close.pct_change()

    # trailing strength at several horizons -- the reversal/momentum family
    mom_12_1 = close.shift(21) / close.shift(252) - 1.0   # skip-month momentum
    mom_6_1 = close.shift(21) / close.shift(126) - 1.0
    mom_3_1 = close.shift(21) / close.shift(84) - 1.0
    rev_20 = close / close.shift(20) - 1.0                # what Argus effectively measures
    rev_5 = close / close.shift(5) - 1.0

    # volatility compression -- recent range tight relative to its own history
    vol20, vol100 = ret.rolling(20).std(), ret.rolling(100).std()
    compress = vol20 / vol100
    rng = (high - low) / close
    range_contract = rng.rolling(20).mean() / rng.rolling(100).mean()

    # volume dry-up, then the sign of recent participation
    vol_dry = vol.rolling(20).mean() / vol.rolling(100).mean()
    signed = vol * np.sign(ret)
    accum = signed.rolling(20).sum() / vol.rolling(20).sum()

    # structure -- where price sits in its own longer-run range
    hi252 = close.rolling(252).max()
    lo252 = close.rolling(252).min()
    dist_52w_high = close / hi252 - 1.0
    range_pos = (close - lo252) / (hi252 - lo252)
    base_depth = (close.rolling(126).max() / close.rolling(126).min()) - 1.0

    return {
        "mom_12_1": mom_12_1,
        "mom_6_1": mom_6_1,
        "mom_3_1": mom_3_1,
        "rev_20": rev_20,
        "rev_5": rev_5,
        "compress": compress,
        "range_contract": range_contract,
        "vol_dry": vol_dry,
        "accum": accum,
        "dist_52w_high": dist_52w_high,
        "range_pos": range_pos,
        "base_depth": base_depth,
    }


def forward_excess(close: pd.DataFrame, h: int = FWD) -> pd.DataFrame:
    fwd = close.shift(-h) / close - 1.0
    return fwd.sub(fwd.mean(axis=1), axis=0)


def nw_tstat(x: np.ndarray, lags: int) -> float:
    """t-stat of the mean of an autocorrelated series (Newey-West)."""
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 10:
        return np.nan
    d = x - x.mean()
    g0 = (d @ d) / n
    var = g0
    for L in range(1, min(lags, n - 1) + 1):
        g = (d[L:] @ d[:-L]) / n
        var += 2.0 * (1.0 - L / (lags + 1.0)) * g
    return float(x.mean() / np.sqrt(max(var, 1e-18) / n))


def ic_series(feat: pd.DataFrame, fx: pd.DataFrame, dates) -> tuple[np.ndarray, np.ndarray]:
    """Per-date Spearman IC and top-minus-bottom decile spread (%)."""
    ics, spreads = [], []
    for d in dates:
        f = feat.loc[d]
        y = fx.loc[d]
        ok = f.notna() & y.notna()
        if ok.sum() < MIN_NAMES:
            ics.append(np.nan)
            spreads.append(np.nan)
            continue
        f, y = f[ok], y[ok]
        ics.append(stats.spearmanr(f, y).statistic)
        q = pd.qcut(f.rank(method="first"), 10, labels=False)
        spreads.append((y[q == 9].mean() - y[q == 0].mean()) * 100)
    return np.array(ics, float), np.array(spreads, float)


def report(name: str, ics: np.ndarray, spreads: np.ndarray) -> dict:
    lags = FWD // STEP
    return {
        "feature": name,
        "n_dates": int(np.isfinite(ics).sum()),
        "IC": np.nanmean(ics),
        "t(NW)": nw_tstat(ics, lags),
        "hit%": np.nanmean(ics > 0) * 100,
        "D10-D1 %": np.nanmean(spreads),
        "t_sprd": nw_tstat(spreads, lags),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--full", action="store_true", help="also report the calibration era")
    args = ap.parse_args()

    p = load_panel()
    close = p["close"]
    feats = build_features(p)
    fx = forward_excess(close)

    dates = close.index[252::STEP]
    dates = dates[dates < close.index[-FWD - 1]]
    oos = dates[dates < CALIB_START]
    print(f"corpus {close.shape[1]} tickers, {close.index[0].date()}..{close.index[-1].date()}")
    print(f"rebalance every {STEP}d, forward horizon {FWD}d, "
          f"{len(oos)} OOS dates (pre {CALIB_START.date()}), {len(dates)} total\n")

    print("=" * 92)
    print("1 · CONTROL — does a naive trailing-strength ranking invert on its own? (OOS)")
    print("=" * 92)
    rows = []
    for nm in ("rev_5", "rev_20", "mom_3_1", "mom_6_1", "mom_12_1"):
        rows.append(report(nm, *ic_series(feats[nm], fx, oos)))
    ctl = pd.DataFrame(rows).set_index("feature")
    print(ctl.round(4).to_string())
    print("\n  rev_20 is the closest naive analogue of what the Argus score measures.")
    print("  If it is negative and significant, the label inversion is the generic")
    print("  1-month reversal in large caps, not an Argus-specific defect.")

    print("\n" + "=" * 92)
    print("2 · FEASIBILITY — do lead-candidate features carry forward information? (OOS)")
    print("=" * 92)
    rows = []
    for nm in ("compress", "range_contract", "vol_dry", "accum",
               "dist_52w_high", "range_pos", "base_depth"):
        rows.append(report(nm, *ic_series(feats[nm], fx, oos)))
    lead = pd.DataFrame(rows).set_index("feature")
    print(lead.round(4).to_string())

    print("\n" + "=" * 92)
    print("3 · THE COMBINATION THE BRIEF ASKS FOR — long-term strong AND recently quiet")
    print("=" * 92)
    # cross-sectional ranks, so the composite is scale-free
    def xrank(df):
        return df.rank(axis=1, pct=True)

    r_mom = xrank(feats["mom_12_1"])
    r_rev = xrank(feats["rev_20"])
    r_cmp = xrank(feats["compress"])

    combos = {
        "mom_12_1 - rev_20": r_mom - r_rev,
        "mom_12_1 - compress": r_mom - r_cmp,
        "mom_12_1 - rev_20 - compress": r_mom - r_rev - r_cmp,
    }
    rows = [report(nm, *ic_series(f, fx, oos)) for nm, f in combos.items()]
    print(pd.DataFrame(rows).set_index("feature").round(4).to_string())

    print("\n  2x2 on OOS dates: long-horizon momentum vs recent 20d move")
    cells = {k: [] for k in ("strong/quiet", "strong/hot", "weak/quiet", "weak/hot")}
    for d in oos:
        m, r, y = feats["mom_12_1"].loc[d], feats["rev_20"].loc[d], fx.loc[d]
        ok = m.notna() & r.notna() & y.notna()
        if ok.sum() < MIN_NAMES:
            continue
        m, r, y = m[ok], r[ok], y[ok]
        hm, hr = m > m.median(), r > r.median()
        cells["strong/quiet"].append(y[hm & ~hr].mean() * 100)
        cells["strong/hot"].append(y[hm & hr].mean() * 100)
        cells["weak/quiet"].append(y[~hm & ~hr].mean() * 100)
        cells["weak/hot"].append(y[~hm & hr].mean() * 100)
    print(f"  {'cell':<16} {'fwd 20d excess %':>18} {'t(NW)':>8}")
    for k, v in cells.items():
        a = np.array(v, float)
        print(f"  {k:<16} {np.nanmean(a):>+18.3f} {nw_tstat(a, FWD // STEP):>8.2f}")

    print("\n" + "=" * 92)
    print("4 · LIQUIDITY SPLIT — is there more signal in the smaller/thinner names? (OOS)")
    print("=" * 92)
    dv = (close * p["volume"]).rolling(60).mean()
    tested = {"mom_12_1": feats["mom_12_1"], "rev_20": feats["rev_20"],
              "compress": feats["compress"], "mom_12_1 - rev_20": r_mom - r_rev}
    print(f"  {'feature':<20} {'thin tercile IC':>16} {'t':>7}   {'thick tercile IC':>17} {'t':>7}")
    for nm, f in tested.items():
        out = {}
        for tag, lo, hi in (("thin", 0.0, 1 / 3), ("thick", 2 / 3, 1.0)):
            ics = []
            for d in oos:
                q = dv.loc[d].rank(pct=True)
                mask = (q > lo) & (q <= hi)
                x, y = f.loc[d][mask], fx.loc[d][mask]
                ok = x.notna() & y.notna()
                ics.append(stats.spearmanr(x[ok], y[ok]).statistic
                           if ok.sum() >= MIN_NAMES else np.nan)
            a = np.array(ics, float)
            out[tag] = (np.nanmean(a), nw_tstat(a, FWD // STEP))
        print(f"  {nm:<20} {out['thin'][0]:>+16.4f} {out['thin'][1]:>7.2f}   "
              f"{out['thick'][0]:>+17.4f} {out['thick'][1]:>7.2f}")

    print("\n" + "=" * 92)
    print("5 · HORIZON — does forward information appear further out? (OOS)")
    print("=" * 92)
    print(f"  {'feature':<20} " + "".join(f"{f'IC {h}d':>12}" for h in (5, 20, 60, 120)))
    for nm, f in (("mom_12_1", feats["mom_12_1"]), ("rev_20", feats["rev_20"]),
                  ("mom_12_1 - rev_20", r_mom - r_rev)):
        cells = []
        for h in (5, 20, 60, 120):
            fxh = forward_excess(close, h)
            dh = oos[oos < close.index[-h - 1]]
            ics, _ = ic_series(f, fxh, dh)
            cells.append(f"{np.nanmean(ics):>+8.4f}/{nw_tstat(ics, max(h // STEP, 1)):>+.1f}")
        print(f"  {nm:<20} " + "".join(f"{c:>12}" for c in cells))
    print("  (cell = mean IC / Newey-West t)")

    if args.full:
        print("\n" + "=" * 92)
        print("6 · CALIBRATION ERA (2024-06 onward) — stability check")
        print("=" * 92)
        ins = dates[dates >= CALIB_START]
        rows = []
        for nm in ("rev_20", "mom_12_1", "compress", "vol_dry", "accum", "dist_52w_high"):
            rows.append(report(nm, *ic_series(feats[nm], fx, ins)))
        print(pd.DataFrame(rows).set_index("feature").round(4).to_string())
    print()


if __name__ == "__main__":
    main()
