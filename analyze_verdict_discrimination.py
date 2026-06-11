#!/usr/bin/env python3
"""
Verdict discrimination analysis: do LONG calls precede bigger up-moves than WAIT/SHORT?

For every (ticker, date, verdict) row across all bridge reports (deduped to latest
file per ticker-date), measure forward returns at +5/+10/+20 trading days,
peak MFE and max drawdown over 20 trading days. Group by verdict.
"""
from __future__ import annotations

import glob
import re
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from scipy import stats

REPORTS = Path("/Users/josephstorey/Market_Analyse/reports")
ALIAS = {"SIVE": "SIVE.ST", "SIVEF": "SIVE.ST"}
TODAY = date(2026, 6, 8)

# ── 1. Load all bridge files, dedupe to latest file per (ticker, date) ──────────

def load_all_rows() -> pd.DataFrame:
    rows = []
    files = sorted(glob.glob(str(REPORTS / "bridge_*.csv")))
    files = [f for f in files if "latest" not in f]

    for f in files:
        m = re.search(r"bridge_(\d{8})_(\d{4})\.csv", f)
        if not m:
            continue
        report_date = pd.to_datetime(m.group(1), format="%Y%m%d").date()
        file_time = int(m.group(2))  # HHMM as int for comparison
        try:
            df = pd.read_csv(f)
        except Exception:
            continue

        # resolve verdict column
        if "argus_verdict" in df.columns:
            df["verdict"] = df["argus_verdict"]
        elif "signa_verdict" in df.columns:
            df["verdict"] = df["signa_verdict"]
        else:
            continue

        # resolve fetch symbol
        if "fetch_symbol" in df.columns:
            df["_fetch"] = df["fetch_symbol"].where(
                df["fetch_symbol"].notna() & (df["fetch_symbol"] != "nan"), other=None
            )
        else:
            df["_fetch"] = None

        df["_fetch"] = df.apply(
            lambda r: (str(r["_fetch"]).upper() if r["_fetch"] else None)
                      or ALIAS.get(str(r["ticker"]).upper(), str(r["ticker"]).upper()),
            axis=1,
        )

        df["_date"] = report_date
        df["_file_time"] = file_time
        df["_ticker_upper"] = df["ticker"].str.upper()

        rows.append(df[["_ticker_upper", "_fetch", "_date", "_file_time", "verdict"]].copy())

    all_rows = pd.concat(rows, ignore_index=True)
    all_rows.rename(columns={"_ticker_upper": "ticker", "_fetch": "fetch",
                              "_date": "date", "_file_time": "file_time"}, inplace=True)

    # dedupe: keep latest file_time per (ticker, date)
    all_rows = (
        all_rows.sort_values("file_time")
        .groupby(["ticker", "date"], as_index=False)
        .last()
    )

    # keep only valid verdicts
    all_rows = all_rows[all_rows["verdict"].isin(["LONG", "SHORT", "WAIT"])].copy()
    print(f"Total (ticker, date) rows after dedup: {len(all_rows)}")
    print(f"Verdict distribution:\n{all_rows['verdict'].value_counts()}\n")
    return all_rows


# ── 2. Download price history per fetch symbol ───────────────────────────────────

def download_histories(symbols: list[str]) -> dict[str, pd.DataFrame]:
    histories = {}
    end_str = (TODAY + timedelta(days=1)).isoformat()
    # find earliest date we need
    start_str = "2026-05-01"  # all reports start ~2026-05-07

    print(f"Downloading {len(symbols)} symbols …")
    for sym in symbols:
        try:
            h = yf.download(
                sym, start=start_str, end=end_str,
                progress=False, auto_adjust=False
            )
            if h.empty:
                histories[sym] = None
                continue
            if isinstance(h.columns, pd.MultiIndex):
                h.columns = h.columns.get_level_values(0)
            h.index = pd.to_datetime(h.index).normalize()
            histories[sym] = h[["Close", "High", "Low"]].copy()
        except Exception as e:
            print(f"  ERROR {sym}: {e}")
            histories[sym] = None

    ok = sum(1 for v in histories.values() if v is not None)
    print(f"  Downloaded OK: {ok}/{len(symbols)}\n")
    return histories


# ── 3. Compute forward metrics for one row ───────────────────────────────────────

def forward_metrics(history: pd.DataFrame, signal_date: date) -> dict | None:
    if history is None:
        return None

    sd = pd.Timestamp(signal_date)
    idx = history.index

    # find position of signal date (or next available trading day)
    positions = idx[idx >= sd]
    if positions.empty:
        return None
    t0_ts = positions[0]
    t0_pos = idx.get_loc(t0_ts)

    base_close = float(history.loc[t0_ts, "Close"])
    if base_close == 0 or np.isnan(base_close):
        return None

    def close_at(n_days: int) -> float | None:
        pos = t0_pos + n_days
        if pos >= len(idx):
            return None
        return float(history["Close"].iloc[pos])

    c5  = close_at(5)
    c10 = close_at(10)
    c20 = close_at(20)

    # 20-day window for MFE/drawdown
    end_pos = min(t0_pos + 20, len(idx))
    window_high = history["High"].iloc[t0_pos + 1: end_pos + 1]
    window_low  = history["Low"].iloc[t0_pos + 1: end_pos + 1]

    mfe = float((window_high.max() - base_close) / base_close * 100) if not window_high.empty else None
    mdd = float((window_low.min() - base_close) / base_close * 100) if not window_low.empty else None

    return {
        "ret5":  (c5  - base_close) / base_close * 100 if c5  is not None else None,
        "ret10": (c10 - base_close) / base_close * 100 if c10 is not None else None,
        "ret20": (c20 - base_close) / base_close * 100 if c20 is not None else None,
        "mfe20": mfe,
        "mdd20": mdd,
    }


# ── 4. Main ──────────────────────────────────────────────────────────────────────

def main():
    rows = load_all_rows()

    symbols = sorted(rows["fetch"].unique())
    histories = download_histories(symbols)

    results = []
    for _, r in rows.iterrows():
        h = histories.get(r["fetch"])
        m = forward_metrics(h, r["date"])
        if m is None:
            continue
        results.append({"verdict": r["verdict"], **m})

    df = pd.DataFrame(results)
    print(f"Rows with computable metrics: {len(df)}\n")

    # NOTE: Dataset spans only ~21 trading days (2026-05-07 to 2026-06-08).
    # +20td forward returns require 20 future bars — only rows from 2026-05-07
    # have full +20td data (12 LONG, 0 WAIT, 0 SHORT). Treat +20td as unreliable.
    # Reliable horizons: +5td (n: LONG=417, SHORT=118, WAIT=58),
    #                    +10td (n: LONG=261, SHORT=79, WAIT=42).
    # MFE/MDD are computed over whatever bars ARE available (1-20 td), so n varies.

    # ── Summary table ────────────────────────────────────────────────────────────
    metrics_display = [
        ("ret5",  "+5td",  "ret5_mean",  "ret5_median"),
        ("ret10", "+10td", "ret10_mean", "ret10_median"),
        ("mfe20", "MFE(avail)", "mfe20_mean", None),
        ("mdd20", "MDD(avail)", "mdd20_mean", None),
    ]
    order = ["LONG", "WAIT", "SHORT"]

    summary_rows = []
    for v in order:
        sub = df[df["verdict"] == v]
        n_total = len(sub)
        row = {"verdict": v, "n_total": n_total}
        for col_key in ["ret5", "ret10", "ret20", "mfe20", "mdd20"]:
            col_data = sub[col_key].dropna()
            row[f"{col_key}_n"]      = len(col_data)
            row[f"{col_key}_mean"]   = round(col_data.mean(), 2)   if len(col_data) else np.nan
            row[f"{col_key}_median"] = round(col_data.median(), 2) if len(col_data) else np.nan
        summary_rows.append(row)

    summary = pd.DataFrame(summary_rows)

    print("=" * 100)
    print("VERDICT DISCRIMINATION TABLE  (forward returns from signal-day close)")
    print("Dataset: 2026-05-07 → 2026-06-08  (~21 trading days total)")
    print("=" * 100)
    header = (
        f"{'Verdict':<7} {'N(all)':>7} | "
        f"{'n(+5td)':>8} {'mean+5':>7} {'med+5':>7} | "
        f"{'n(+10td)':>9} {'mean+10':>8} {'med+10':>8} | "
        f"{'n(MFE)':>7} {'MFEmean':>8} | {'n(MDD)':>7} {'MDDmean':>8}"
    )
    print(header)
    print("-" * 100)
    for _, r in summary.iterrows():
        def fmt(val, suffix="%"):
            return f"{val:+.2f}{suffix}" if not (isinstance(val, float) and np.isnan(val)) else "  n/a "
        print(
            f"{r['verdict']:<7} {int(r['n_total']):>7} | "
            f"{int(r['ret5_n']):>8} {fmt(r['ret5_mean']):>7} {fmt(r['ret5_median']):>7} | "
            f"{int(r['ret10_n']):>9} {fmt(r['ret10_mean']):>8} {fmt(r['ret10_median']):>8} | "
            f"{int(r['mfe20_n']):>7} {fmt(r['mfe20_mean']):>8} | {int(r['mdd20_n']):>7} {fmt(r['mdd20_mean']):>8}"
        )
    print("=" * 100)
    print("Note: MFE/MDD measured over available bars up to 20td (varies by signal date).")
    print("      +20td returns excluded: only 12 LONG rows have 20 full forward bars.")

    # ── Statistical test: LONG vs WAIT ───────────────────────────────────────────
    print("\nSTATISTICAL TESTS — Welch t-test (LONG vs WAIT)")
    print("-" * 65)
    for m in ["ret5", "ret10"]:
        long_vals = df[df["verdict"] == "LONG"][m].dropna().values
        wait_vals = df[df["verdict"] == "WAIT"][m].dropna().values
        if len(long_vals) < 2 or len(wait_vals) < 2:
            print(f"  {m}: insufficient data"); continue
        t_stat, p_val = stats.ttest_ind(long_vals, wait_vals, equal_var=False)
        delta = long_vals.mean() - wait_vals.mean()
        sig = "**" if p_val < 0.05 else ("*" if p_val < 0.10 else "ns")
        print(
            f"  {m:6s}: LONG={long_vals.mean():+.2f}%  WAIT={wait_vals.mean():+.2f}%  "
            f"delta={delta:+.2f}pp  t={t_stat:.2f}  p={p_val:.4f}  {sig}"
        )

    # ── Statistical test: LONG vs SHORT ──────────────────────────────────────────
    print("\nSTATISTICAL TESTS — Welch t-test (LONG vs SHORT)")
    print("-" * 65)
    for m in ["ret5", "ret10"]:
        long_vals = df[df["verdict"] == "LONG"][m].dropna().values
        short_vals = df[df["verdict"] == "SHORT"][m].dropna().values
        if len(long_vals) < 2 or len(short_vals) < 2:
            print(f"  {m}: insufficient data"); continue
        t_stat, p_val = stats.ttest_ind(long_vals, short_vals, equal_var=False)
        delta = long_vals.mean() - short_vals.mean()
        sig = "**" if p_val < 0.05 else ("*" if p_val < 0.10 else "ns")
        print(
            f"  {m:6s}: LONG={long_vals.mean():+.2f}%  SHORT={short_vals.mean():+.2f}%  "
            f"delta={delta:+.2f}pp  t={t_stat:.2f}  p={p_val:.4f}  {sig}"
        )

    # ── Monotonicity check ───────────────────────────────────────────────────────
    print("\nMONOTONICITY CHECK (mean returns: LONG > WAIT > SHORT?)")
    print("-" * 65)
    for m in ["ret5", "ret10"]:
        vals = {}
        for v in order:
            sub = df[df["verdict"] == v][m].dropna()
            vals[v] = sub.mean() if len(sub) else np.nan
        l, w, s = vals["LONG"], vals["WAIT"], vals["SHORT"]
        if any(np.isnan(x) for x in [l, w, s]):
            mono = "NO (missing data)"
        else:
            mono = "YES" if l > w > s else "NO"
        print(f"  {m:6s}: LONG={l:+.2f}%  WAIT={w:+.2f}%  SHORT={s:+.2f}%  → {mono}")

    # ── Distribution percentiles ─────────────────────────────────────────────────
    print("\nDISTRIBUTION PERCENTILES — ret5 (p10/p25/p50/p75/p90)")
    print("-" * 65)
    for v in ["LONG", "WAIT", "SHORT"]:
        col = df[df["verdict"] == v]["ret5"].dropna()
        if col.empty: continue
        pcts = np.percentile(col, [10, 25, 50, 75, 90])
        print(
            f"  {v:5s} (n={len(col):3d})  "
            f"p10={pcts[0]:+.1f}%  p25={pcts[1]:+.1f}%  "
            f"p50={pcts[2]:+.1f}%  p75={pcts[3]:+.1f}%  p90={pcts[4]:+.1f}%"
        )

    print("\nDISTRIBUTION PERCENTILES — ret10 (p10/p25/p50/p75/p90)")
    print("-" * 65)
    for v in ["LONG", "WAIT", "SHORT"]:
        col = df[df["verdict"] == v]["ret10"].dropna()
        if col.empty: continue
        pcts = np.percentile(col, [10, 25, 50, 75, 90])
        print(
            f"  {v:5s} (n={len(col):3d})  "
            f"p10={pcts[0]:+.1f}%  p25={pcts[1]:+.1f}%  "
            f"p50={pcts[2]:+.1f}%  p75={pcts[3]:+.1f}%  p90={pcts[4]:+.1f}%"
        )


if __name__ == "__main__":
    main()
