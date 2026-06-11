#!/usr/bin/env python3
"""Historical selection performance from the bridge reports.

For every ticker first flagged ALIGNED, measure peak gain (max favorable
excursion on daily highs) from the first-flagged date through today.
"""
from __future__ import annotations

import glob
import re
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORTS = REPO_ROOT / "reports"
ALIAS = {"SIVE": "SIVE.ST", "SIVEF": "SIVE.ST"}

# ── collect first-ALIGNED date per ticker ──────────────────────────────────────
rows = []
for f in sorted(glob.glob(str(REPORTS / "bridge_*.csv"))):
    if "latest" in f:
        continue
    m = re.search(r"bridge_(\d{8})_\d{4}\.csv", f)
    if not m:
        continue
    date = datetime.strptime(m.group(1), "%Y%m%d").date()
    df = pd.read_csv(f)
    if "alignment" not in df.columns:
        continue
    aligned = df[df["alignment"] == "ALIGNED"]
    for _, r in aligned.iterrows():
        t = str(r["ticker"]).upper()
        fetch = str(r["fetch_symbol"]).upper() if "fetch_symbol" in df.columns and pd.notna(r.get("fetch_symbol")) else None
        if not fetch or fetch == "NAN":
            fetch = ALIAS.get(t, t)
        rows.append({"ticker": t, "fetch": fetch, "date": date})

picks = pd.DataFrame(rows)
first = picks.sort_values("date").groupby("ticker", as_index=False).first()
print(f"{len(first)} unique tickers first flagged ALIGNED across "
      f"{picks['date'].nunique()} report-days "
      f"({picks['date'].min()} → {picks['date'].max()})\n")

# ── price history + peak gain ──────────────────────────────────────────────────
today = datetime.now().date()
out = []
for _, r in first.iterrows():
    t, fetch, d0 = r["ticker"], r["fetch"], r["date"]
    try:
        h = yf.download(fetch, start=d0.isoformat(), end=(today + timedelta(days=1)).isoformat(),
                        progress=False, auto_adjust=False)
        if h.empty:
            out.append({"ticker": t, "note": "no data"}); continue
        if isinstance(h.columns, pd.MultiIndex):
            h.columns = h.columns.get_level_values(0)
        entry = float(h["Close"].iloc[0])
        peak_idx = h["High"].idxmax()
        peak = float(h["High"].max())
        peak_date = peak_idx.date()
        days_held = (h.index <= peak_idx).sum() - 1   # trading days to peak
        pct = (peak - entry) / entry * 100.0
        out.append({
            "ticker": t,
            "obsidian": f"{d0} Sentiment + Technicals",
            "first_said": d0,
            "entry": round(entry, 2),
            "peak_date": peak_date,
            "peak": round(peak, 2),
            "peak_gain_%": round(pct, 1),
            "days_to_peak": int(days_held),
        })
    except Exception as e:
        out.append({"ticker": t, "note": f"error: {e}"})

res = pd.DataFrame([o for o in out if "peak_gain_%" in o]).sort_values("peak_gain_%", ascending=False)
errs = [o for o in out if "peak_gain_%" not in o]

pd.set_option("display.max_rows", None, "display.width", 200)
print(res[["ticker", "first_said", "entry", "peak_date", "peak",
           "peak_gain_%", "days_to_peak"]].to_string(index=False))

mature = res[res["days_to_peak"] >= 1]   # exclude same-day picks with no time elapsed
print("\n── peak gain = highest daily HIGH since first flagged (max favorable excursion) ──")
print(f"tickers measured : {len(res)}  (of which {len(mature)} had >=1 trading day to develop)")
print(f"avg peak gain    : {res['peak_gain_%'].mean():.1f}%   (mature only: {mature['peak_gain_%'].mean():.1f}%)")
print(f"median peak gain : {res['peak_gain_%'].median():.1f}%")
print(f"avg days to peak : {res['days_to_peak'].mean():.1f}   median: {res['days_to_peak'].median():.0f}")
print(f"reached +10%     : {(res['peak_gain_%'] >= 10).sum()}/{len(res)} "
      f"({(res['peak_gain_%'] >= 10).mean()*100:.0f}%)")
print(f"reached +25%     : {(res['peak_gain_%'] >= 25).sum()}/{len(res)} "
      f"({(res['peak_gain_%'] >= 25).mean()*100:.0f}%)")
print(f"reached +50%     : {(res['peak_gain_%'] >= 50).sum()}/{len(res)} "
      f"({(res['peak_gain_%'] >= 50).mean()*100:.0f}%)")
print(f"best             : {res.iloc[0]['ticker']} +{res.iloc[0]['peak_gain_%']:.1f}% "
      f"in {res.iloc[0]['days_to_peak']}d")
if errs:
    print(f"\nskipped: {', '.join(e['ticker'] + ' (' + e['note'] + ')' for e in errs)}")

res.to_csv(REPORTS / "selection_performance.csv", index=False)
print(f"\nsaved → {REPORTS / 'selection_performance.csv'}")
