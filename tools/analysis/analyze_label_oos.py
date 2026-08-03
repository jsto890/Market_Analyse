#!/usr/bin/env python3
"""Deep analysis of the Argus labelling stack: labels, entries, exits, flags.

Reads the per-signal CSV from `backtest_labels_oos.py` and answers:

  1. Does the label ladder (PRIME > STANDARD > WATCH > WAIT > AVOID) actually
     rank forward returns -- and does the ranking survive out of sample?
  2. Win rate / expectancy under the engine's ATR exits, by label.
  3. Entry quality: onset vs continuation, score monotonicity, immediate heat.
  4. Exit quality: MFE capture, giveback, hold-to-horizon counterfactual.
  5. Flag-by-flag marginal discrimination, incl. the fitted `_classify_action`
     constants (score>=0.40, 2.0<=n_eff<=3.0, wk=L, STRONG_COMBO, gap<0.15).

Market beta is removed by cross-sectional demeaning: every signal's forward
return is measured against the mean forward return of all names scored on the
same date. That isolates *selection* skill from "the market went up".

CIs are cluster bootstrap by ticker (weekly signals with 20d holds overlap, so
observations are autocorrelated within a name).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# The action_label thresholds were fitted on ~2y ending 2026-06-08.
CALIB_START = pd.Timestamp("2024-06-08")

LABEL_ORDER = ["PRIME_LONG", "STANDARD_LONG", "WATCH", "WAIT", "AVOID"]

# ATR stop multiplier per regime — mirrors _REGIME_RR in the runner.
_STOP_M = {"trending": 2.0, "trending_late": 2.0, "ranging": 1.5,
           "gap_down_continuation": 1.5, "neutral": 2.0}
N_BOOT = 2000
SEED = 7


# ── helpers ───────────────────────────────────────────────────────────────────

def cluster_boot_ci(df: pd.DataFrame, col: str, *, n_boot=N_BOOT, seed=SEED):
    """Mean + 95% CI, resampling whole tickers (clusters)."""
    sub = df[["ticker", col]].dropna()
    if sub.empty:
        return np.nan, np.nan, np.nan
    groups = [g[col].values for _, g in sub.groupby("ticker", sort=False)]
    if len(groups) < 2:
        return float(sub[col].mean()), np.nan, np.nan
    rng = np.random.default_rng(seed)
    k = len(groups)
    means = np.empty(n_boot)
    for b in range(n_boot):
        pick = rng.integers(0, k, k)
        means[b] = np.concatenate([groups[i] for i in pick]).mean()
    return float(sub[col].mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def boot_p_two_sided(df: pd.DataFrame, col: str, *, n_boot=N_BOOT, seed=SEED) -> float:
    """Cluster-bootstrap p-value for mean == 0."""
    sub = df[["ticker", col]].dropna()
    if sub.empty or sub["ticker"].nunique() < 2:
        return np.nan
    groups = [g[col].values for _, g in sub.groupby("ticker", sort=False)]
    rng = np.random.default_rng(seed)
    k = len(groups)
    means = np.empty(n_boot)
    for b in range(n_boot):
        pick = rng.integers(0, k, k)
        means[b] = np.concatenate([groups[i] for i in pick]).mean()
    obs = sub[col].mean()
    # fraction of bootstrap mass on the other side of zero, doubled
    frac = (means <= 0).mean() if obs > 0 else (means >= 0).mean()
    return float(min(1.0, 2 * frac))


def wr_exp(sub: pd.DataFrame) -> tuple[float | None, float | None, int]:
    """Win rate + expectancy (R) under the engine ATR exit, resolved trades only."""
    act = sub[sub["verdict"].isin(["LONG", "SHORT"]) & sub["outcome"].isin(["WIN", "LOSS"])]
    if act.empty:
        return None, None, 0
    wr = (act["outcome"] == "WIN").mean()
    rr = act["actual_rr"].mean()
    return float(wr), float(wr * rr - (1 - wr)), len(act)


def fmt_pct(v, d=1):
    return "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v*100:.{d}f}%"


def fmt_r(v):
    return "—" if v is None or (isinstance(v, float) and np.isnan(v)) else f"{v:+.2f}R"


def fmt_f(v, d=2, sign=True):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return "—"
    return f"{v:+.{d}f}" if sign else f"{v:.{d}f}"


def hr(title, ch="═", w=104):
    print(f"\n{ch*w}\n{title}\n{ch*w}")


def table(rows, headers):
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) if rows else len(str(h))
              for i, h in enumerate(headers)]
    print("  " + "  ".join(str(h).ljust(widths[i]) for i, h in enumerate(headers)))
    print("  " + "  ".join("-" * widths[i] for i in range(len(headers))))
    for r in rows:
        print("  " + "  ".join(str(c).ljust(widths[i]) for i, c in enumerate(r)))


# ── sections ──────────────────────────────────────────────────────────────────

def section_cohort(df, is_df, oos_df):
    hr("1 · COHORT")
    print(f"  signals            {len(df):,}")
    print(f"  names              {df.ticker.nunique()}")
    print(f"  dates              {df.date.min().date()} .. {df.date.max().date()}")
    print(f"  OOS (holdout)      {oos_df.date.min().date()} .. {oos_df.date.max().date()}   "
          f"{len(oos_df):,} signals  ({oos_df.ticker.nunique()} names)")
    print(f"  IS  (calibration)  {is_df.date.min().date()} .. {is_df.date.max().date()}   "
          f"{len(is_df):,} signals")
    print(f"\n  mean names scored per date: {df.groupby('date').size().mean():.0f}")
    print(f"  universe mean fwd_20d: {df.fwd_20d.mean():+.2f}%  "
          f"(OOS {oos_df.fwd_20d.mean():+.2f}%, IS {is_df.fwd_20d.mean():+.2f}%)")

    rows = []
    for lbl in LABEL_ORDER:
        n_all = (df.action_label == lbl).sum()
        n_oos = (oos_df.action_label == lbl).sum()
        n_is = (is_df.action_label == lbl).sum()
        rows.append([lbl, f"{n_all:,}", f"{n_all/len(df)*100:.1f}%",
                     f"{n_oos:,}", f"{n_oos/max(len(oos_df),1)*100:.1f}%",
                     f"{n_is:,}", f"{n_is/max(len(is_df),1)*100:.1f}%"])
    print()
    table(rows, ["label", "n", "share", "n OOS", "share", "n IS", "share"])


def section_discrimination(df, is_df, oos_df):
    hr("2 · LABEL DISCRIMINATION — exit-free 20d forward return, market-neutralised")
    print("  `excess` = signal fwd_20d minus mean fwd_20d of all names scored that same date.")
    print("  A label with selection skill has excess > 0 with a CI clear of zero, OOS.\n")

    for name, d in (("OUT-OF-SAMPLE  2014-01 .. 2024-06", oos_df),
                    ("IN-SAMPLE      2024-06 .. 2026-06", is_df)):
        rows = []
        for lbl in LABEL_ORDER:
            sub = d[d.action_label == lbl]
            if sub.empty:
                continue
            m, lo, hi = cluster_boot_ci(sub, "excess_20d")
            p = boot_p_two_sided(sub, "excess_20d")
            raw = sub.fwd_20d.mean()
            hit = (sub.excess_20d > 0).mean()
            rows.append([lbl, f"{len(sub):,}", f"{raw:+.2f}%", f"{m:+.3f}%",
                         f"[{lo:+.3f}, {hi:+.3f}]", f"{p:.3f}", f"{hit*100:.1f}%"])
        print(f"  {name}")
        table(rows, ["label", "n", "raw 20d", "excess", "95% CI (cluster)", "p", "beat-peers"])
        print()

    # monotonicity of the ladder
    hr("2b · LADDER MONOTONICITY (OOS)", ch="─")
    ranks = []
    for lbl in LABEL_ORDER:
        sub = oos_df[oos_df.action_label == lbl]
        if len(sub) > 50:
            ranks.append((lbl, sub.excess_20d.mean()))
    ordered = [l for l, _ in sorted(ranks, key=lambda x: -x[1])]
    print(f"  designed ladder : {' > '.join([l for l,_ in ranks])}")
    print(f"  realised (OOS)  : {' > '.join(ordered)}")
    print(f"  ladder holds    : {'YES' if ordered == [l for l,_ in ranks] else 'NO'}")

    # spread test: PRIME vs the rest of the long book
    prime = oos_df[oos_df.action_label == "PRIME_LONG"]
    std = oos_df[oos_df.action_label == "STANDARD_LONG"]
    if len(prime) > 30 and len(std) > 30:
        pm, plo, phi = cluster_boot_ci(prime, "excess_20d")
        sm, slo, shi = cluster_boot_ci(std, "excess_20d")
        print(f"\n  PRIME_LONG    excess {pm:+.3f}%  CI [{plo:+.3f}, {phi:+.3f}]  n={len(prime):,}")
        print(f"  STANDARD_LONG excess {sm:+.3f}%  CI [{slo:+.3f}, {shi:+.3f}]  n={len(std):,}")
        print(f"  PRIME premium over STANDARD: {pm-sm:+.3f}pp  "
              f"({'supports' if pm > sm else 'CONTRADICTS'} the extra PRIME gating)")


def section_winrate(df, is_df, oos_df):
    hr("3 · WIN RATE & EXPECTANCY under the engine ATR stop/target")
    print("  Engine exit: regime-dependent ATR stop/target, 20d max hold, same-bar tie = LOSS.\n")
    for name, d in (("OUT-OF-SAMPLE", oos_df), ("IN-SAMPLE", is_df)):
        rows = []
        for lbl in LABEL_ORDER:
            sub = d[d.action_label == lbl]
            wr, ex, n = wr_exp(sub)
            if n == 0:
                continue
            openp = (sub.outcome == "OPEN").mean()
            pos20 = (sub.fwd_20d > 0).mean()
            rows.append([lbl, f"{n:,}", fmt_pct(wr), fmt_r(ex),
                         f"{sub.actual_rr.mean():.2f}", fmt_pct(openp), fmt_pct(pos20)])
        print(f"  {name}")
        table(rows, ["label", "n resolved", "win rate", "expectancy", "avg R:R", "unresolved", "P(20d>0)"])
        print()

    hr("3b · BREAKEVEN CHECK (OOS long book)", ch="─")
    longs = oos_df[oos_df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]
    wr, ex, n = wr_exp(longs)
    if n:
        rr = longs[longs.outcome.isin(["WIN", "LOSS"])].actual_rr.mean()
        be = 1 / (1 + rr)
        print(f"  long book: WR {fmt_pct(wr)} on n={n:,}, avg R:R {rr:.2f} "
              f"→ breakeven WR {be*100:.1f}%")
        print(f"  margin: {(wr-be)*100:+.1f}pp  →  expectancy {fmt_r(ex)} per unit risked")
        print("  NOTE: gross of costs. Prior work found ~3x cost multiples erase sub-0.2R edges.")


def section_entries(df, is_df, oos_df):
    hr("4 · ENTRIES")
    longs_o = oos_df[oos_df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]

    print("  4a · onset (first bar of a new signal) vs continuation — OOS long book")
    rows = []
    for flag, nm in ((True, "onset"), (False, "continuation")):
        sub = longs_o[longs_o.onset == flag]
        wr, ex, n = wr_exp(sub)
        m, lo, hi = cluster_boot_ci(sub, "excess_20d")
        rows.append([nm, f"{len(sub):,}", fmt_pct(wr), fmt_r(ex), f"{m:+.3f}%",
                     f"[{lo:+.3f}, {hi:+.3f}]"])
    table(rows, ["entry type", "n", "win rate", "expectancy", "excess 20d", "95% CI"])

    print("\n  4b · score decile → forward excess (OOS, all long-verdict signals)")
    lo_ = oos_df[oos_df.verdict == "LONG"].copy()
    if len(lo_) > 100:
        lo_["bucket"] = pd.qcut(lo_.score, 5, duplicates="drop")
        rows = []
        for b, g in lo_.groupby("bucket", observed=True):
            wr, ex, n = wr_exp(g)
            rows.append([str(b), f"{len(g):,}", fmt_pct(wr), fmt_r(ex),
                         f"{g.excess_20d.mean():+.3f}%"])
        table(rows, ["score quintile", "n", "win rate", "expectancy", "excess 20d"])
        c = lo_[["score", "excess_20d"]].dropna()
        print(f"  Spearman(score, excess_20d) = {c.score.corr(c.excess_20d, method='spearman'):+.4f}"
              "   (a working score should be clearly positive)")

    print("\n  4c · immediate heat — how much drawdown does the entry take before it works?")
    rows = []
    for lbl in ["PRIME_LONG", "STANDARD_LONG", "WATCH"]:
        sub = oos_df[oos_df.action_label == lbl]
        if sub.empty:
            continue
        rows.append([lbl, f"{len(sub):,}", f"{sub.mae_atr.median():.2f}",
                     f"{sub.mfe_atr.median():.2f}",
                     f"{(sub.mae_atr > 1.0).mean()*100:.1f}%",
                     f"{(sub.mae_atr > 2.0).mean()*100:.1f}%"])
    table(rows, ["label", "n", "med MAE(ATR)", "med MFE(ATR)", "MAE>1ATR", "MAE>2ATR"])


def section_exits(df, is_df, oos_df):
    hr("5 · EXITS")
    longs_o = oos_df[oos_df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])].copy()

    print("  5a · outcome mix and hold time by regime (OOS long book)")
    rows = []
    for reg, g in longs_o.groupby("regime"):
        wr, ex, n = wr_exp(g)
        if n < 30:
            continue
        w = g[g.outcome == "WIN"]
        l = g[g.outcome == "LOSS"]
        rows.append([reg, f"{len(g):,}", f"{g.actual_rr.mean():.2f}", fmt_pct(wr), fmt_r(ex),
                     f"{w.days_held.median():.0f}", f"{l.days_held.median():.0f}",
                     fmt_pct((g.outcome == 'OPEN').mean())])
    table(rows, ["regime", "n", "R:R", "win rate", "expectancy", "win days", "loss days", "unresolved"])

    print("\n  5b · MFE capture — does the ATR target sit where the move actually goes?")
    rows = []
    for reg, g in longs_o.groupby("regime"):
        if len(g) < 30:
            continue
        tgt = g.actual_rr.mean() * _STOP_M.get(reg, 2.0)  # target in ATR = rr * stop_mult
        rows.append([reg, f"{len(g):,}", f"{g.mfe_atr.median():.2f}",
                     f"{g.mfe_atr.quantile(0.75):.2f}", f"{g.mfe_atr.quantile(0.9):.2f}",
                     f"{(g.mfe_atr >= tgt).mean()*100:.1f}%"])
    table(rows, ["regime", "n", "med MFE", "p75 MFE", "p90 MFE", "MFE≥target"])

    print("\n  5c · exit-rule counterfactual (OOS long book, R units, gross)")
    stop_m = longs_o.regime.map(_STOP_M).fillna(2.0)
    longs_o["r_hold20"] = (longs_o.fwd_20d / 100 * longs_o.close) / (stop_m * longs_o.atr)
    cf = []
    for nm, col in (("engine ATR stop/target", "r_raw"), ("hold to 20d (same stop unit)", "r_hold20")):
        m, lo, hi = cluster_boot_ci(longs_o, col)
        cf.append([nm, f"{len(longs_o.dropna(subset=[col])):,}", fmt_r(m),
                   f"[{lo:+.2f}, {hi:+.2f}]"])
    table(cf, ["exit rule", "n", "mean R", "95% CI"])
    print("  (Prior premise-check found no early-exit overlay beat hold-to-stop; this re-tests it.)")

    print("\n  5d · giveback — of signals that reached +1 ATR, how many still resolved LOSS?")
    reached = longs_o[longs_o.mfe_atr >= 1.0]
    if len(reached):
        print(f"  reached +1 ATR: {len(reached):,} ({len(reached)/len(longs_o)*100:.1f}% of book); "
              f"of those {(reached.outcome=='LOSS').mean()*100:.1f}% still stopped out")
    reached2 = longs_o[longs_o.mfe_atr >= 2.0]
    if len(reached2):
        print(f"  reached +2 ATR: {len(reached2):,} ({len(reached2)/len(longs_o)*100:.1f}% of book); "
              f"of those {(reached2.outcome=='LOSS').mean()*100:.1f}% still stopped out")


def section_flags(df, is_df, oos_df):
    hr("6 · FLAGS — marginal discrimination, and do the fitted constants hold OOS?")

    _WEAK = {"LNNL", "LLNL", "LLLL"}
    _STRONG = {"LSNS", "LNLL", "LSNL", "LLNS", "LLLS"}

    def flag_row(sub_true, sub_false, name):
        mt, lot, hit_ = cluster_boot_ci(sub_true, "excess_20d")
        mf, _, _ = cluster_boot_ci(sub_false, "excess_20d")
        wrt, ext, nt = wr_exp(sub_true)
        return [name, f"{len(sub_true):,}", f"{mt:+.3f}%", f"[{lot:+.3f}, {hit_:+.3f}]",
                f"{mf:+.3f}%", f"{mt-mf:+.3f}pp", fmt_pct(wrt), fmt_r(ext)]

    print("  6a · the five PRIME_LONG gates, tested one at a time on the OOS long-verdict pool")
    pool = oos_df[oos_df.verdict == "LONG"].copy()
    pool["combo4"] = pool.combo.str[:4]
    gates = [
        ("score >= 0.40",        pool.score >= 0.40),
        ("n_eff in [2.0, 3.0]",  (pool.n_eff >= 2.0) & (pool.n_eff <= 3.0)),
        ("weekly = LONG",        pool.fam_week == "L"),
        ("combo in STRONG",      pool.combo4.isin(_STRONG)),
        ("combo in WEAK (veto)", pool.combo4.isin(_WEAK)),
        ("inflation_gap < 0.15", pool.inflation_gap < 0.15),
        ("regime neutral/late",  pool.regime.isin(["neutral", "trending_late"])),
    ]
    rows = [flag_row(pool[m], pool[~m], nm) for nm, m in gates]
    table(rows, ["gate", "n pass", "excess (pass)", "95% CI", "excess (fail)", "lift",
                 "WR pass", "exp pass"])
    print("  A gate earns its place only if `lift` > 0 with a CI clear of zero.")
    print("  `combo in WEAK` is a veto — it earns its place if lift is NEGATIVE.")

    print("\n  6b · regime flag (OOS, all signals)")
    rows = []
    for reg, g in oos_df.groupby("regime"):
        if len(g) < 100:
            continue
        m, lo, hi = cluster_boot_ci(g, "excess_20d")
        wr, ex, n = wr_exp(g)
        rows.append([reg, f"{len(g):,}", f"{m:+.3f}%", f"[{lo:+.3f}, {hi:+.3f}]",
                     fmt_pct(wr), fmt_r(ex)])
    table(rows, ["regime", "n", "excess 20d", "95% CI", "win rate", "expectancy"])

    print("\n  6c · weekly-alignment flag inside the long book (OOS) — the wk=L PRIME gate")
    lb = oos_df[oos_df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]
    rows = []
    for wk, g in lb.groupby("fam_week"):
        if len(g) < 50:
            continue
        m, lo, hi = cluster_boot_ci(g, "excess_20d")
        wr, ex, n = wr_exp(g)
        rows.append([f"weekly={wk}", f"{len(g):,}", f"{m:+.3f}%", f"[{lo:+.3f}, {hi:+.3f}]",
                     fmt_pct(wr), fmt_r(ex)])
    table(rows, ["flag", "n", "excess 20d", "95% CI", "win rate", "expectancy"])

    print("\n  6d · n_eff and inflation_gap as continuous predictors (OOS long pool)")
    for col in ("n_eff", "inflation_gap", "agreement_pct", "atr_pct"):
        c = pool[[col, "excess_20d"]].dropna()
        if len(c) > 100:
            print(f"    Spearman({col:<14}, excess_20d) = "
                  f"{c[col].corr(c.excess_20d, method='spearman'):+.4f}   n={len(c):,}")

    print("\n  6e · the extension veto (ma=L & mosc=L & regime=trending → forced WATCH)")
    ext = oos_df[(oos_df.fam_ma == "L") & (oos_df.fam_mosc == "L") & (oos_df.regime == "trending")]
    oth = oos_df[oos_df.verdict == "LONG"].drop(ext.index, errors="ignore")
    if len(ext) > 50:
        me, loe, hie = cluster_boot_ci(ext, "excess_20d")
        mo, _, _ = cluster_boot_ci(oth, "excess_20d")
        print(f"    vetoed  n={len(ext):,}  excess {me:+.3f}%  CI [{loe:+.3f}, {hie:+.3f}]")
        print(f"    rest    n={len(oth):,}  excess {mo:+.3f}%")
        print(f"    veto lift {me-mo:+.3f}pp  → veto is "
              f"{'JUSTIFIED (vetoed names underperform)' if me < mo else 'HARMFUL (it vetoes winners)'}")


def section_robustness(df, oos_df):
    hr("7 · ROBUSTNESS")
    print("  7a · non-overlapping subsample (every 4th weekly signal ≈ monthly, no window overlap)")
    nonov = oos_df.sort_values(["ticker", "date"]).groupby("ticker").apply(
        lambda g: g.iloc[::4], include_groups=False).reset_index(level=0)
    rows = []
    for lbl in LABEL_ORDER:
        sub = nonov[nonov.action_label == lbl]
        if len(sub) < 40:
            continue
        m, lo, hi = cluster_boot_ci(sub, "excess_20d")
        rows.append([lbl, f"{len(sub):,}", f"{m:+.3f}%", f"[{lo:+.3f}, {hi:+.3f}]"])
    table(rows, ["label", "n", "excess 20d", "95% CI"])

    print("\n  7b · stability by year (long book excess, OOS+IS)")
    d = df[df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])].copy()
    d["year"] = d.date.dt.year
    rows = []
    for y, g in d.groupby("year"):
        if len(g) < 50:
            continue
        wr, ex, n = wr_exp(g)
        rows.append([str(y), f"{len(g):,}", f"{g.excess_20d.mean():+.3f}%", fmt_pct(wr), fmt_r(ex)])
    table(rows, ["year", "n", "excess 20d", "win rate", "expectancy"])

    print("\n  7c · horizon sensitivity (OOS long book excess)")
    lb = oos_df[oos_df.action_label.isin(["PRIME_LONG", "STANDARD_LONG"])]
    rows = []
    for h in (5, 10, 20):
        m, lo, hi = cluster_boot_ci(lb, f"excess_{h}d")
        p = boot_p_two_sided(lb, f"excess_{h}d")
        rows.append([f"{h}d", f"{m:+.3f}%", f"[{lo:+.3f}, {hi:+.3f}]", f"{p:.3f}"])
    table(rows, ["horizon", "excess", "95% CI", "p"])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    args = ap.parse_args()

    df = pd.read_csv(args.csv, parse_dates=["date"])
    # cross-sectional demeaning: strip the market from every forward return
    for h in (5, 10, 20):
        df[f"excess_{h}d"] = df[f"fwd_{h}d"] - df.groupby("date")[f"fwd_{h}d"].transform("mean")

    is_df = df[df.date >= CALIB_START]
    oos_df = df[df.date < CALIB_START]

    section_cohort(df, is_df, oos_df)
    section_discrimination(df, is_df, oos_df)
    section_winrate(df, is_df, oos_df)
    section_entries(df, is_df, oos_df)
    section_exits(df, is_df, oos_df)
    section_flags(df, is_df, oos_df)
    section_robustness(df, oos_df)
    print()


if __name__ == "__main__":
    main()
