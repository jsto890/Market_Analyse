#!/usr/bin/env python3
"""Analyze downgrade/removal events from the long section of Argus reports.

Measures whether exiting the long section saved gains or missed gains.
"""
from __future__ import annotations

import glob
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import yfinance as yf

REPO_ROOT = Path(__file__).resolve().parents[2]
REPORTS = REPO_ROOT / "reports"
ALIAS = {"SIVE": "SIVE.ST", "SIVEF": "SIVE.ST"}
TODAY = date(2026, 6, 8)
FWD_DAYS = 20  # trading days forward window


def is_long_section(row) -> bool:
    """Return True if this row is in the long section."""
    verdict_col = "argus_verdict" if "argus_verdict" in row.index else "signa_verdict"
    verdict = str(row.get(verdict_col, "")).upper()
    alignment = str(row.get("alignment", "")).upper()
    return verdict == "LONG" or alignment == "ALIGNED"


def get_fetch(row, ticker: str) -> str:
    if "fetch_symbol" in row.index:
        fs = str(row.get("fetch_symbol", ""))
        if fs and fs.upper() not in ("NAN", "NONE", ""):
            return fs.upper()
    return ALIAS.get(ticker.upper(), ticker.upper())


# ── Load all bridge reports, dedupe to one row per (ticker, date) ─────────────
print("Loading bridge reports...")
all_rows = []
for f in sorted(glob.glob(str(REPORTS / "bridge_*.csv"))):
    if "latest" in f:
        continue
    m = re.search(r"bridge_(\d{8})_(\d{4})\.csv", f)
    if not m:
        continue
    report_date = pd.to_datetime(m.group(1), format="%Y%m%d").date()
    report_time = int(m.group(2))
    try:
        df = pd.read_csv(f)
    except Exception:
        continue
    df["_report_date"] = report_date
    df["_report_time"] = report_time
    df["_file"] = f
    all_rows.append(df)

raw = pd.concat(all_rows, ignore_index=True)
raw["ticker"] = raw["ticker"].astype(str).str.upper()

# Dedupe: keep latest time per (ticker, report_date)
raw_sorted = raw.sort_values(["ticker", "_report_date", "_report_time"])
deduped = raw_sorted.drop_duplicates(subset=["ticker", "_report_date"], keep="last").copy()
deduped["_in_long"] = deduped.apply(is_long_section, axis=1)

print(f"Loaded {len(deduped)} (ticker, date) records across "
      f"{deduped['_report_date'].nunique()} report-days "
      f"({deduped['_report_date'].min()} → {deduped['_report_date'].max()})")

# ── Build per-ticker time sequences ───────────────────────────────────────────
# For each ticker: sorted list of (date, in_long, fetch_symbol)
ticker_seq = defaultdict(list)
for _, row in deduped.sort_values(["ticker", "_report_date"]).iterrows():
    t = row["ticker"]
    fetch = get_fetch(row, t)
    ticker_seq[t].append({
        "date": row["_report_date"],
        "in_long": row["_in_long"],
        "fetch": fetch,
    })

# ── Identify downgrade/removal events ─────────────────────────────────────────
# All report-dates in sorted order (for detecting removal)
all_report_dates = sorted(deduped["_report_date"].unique())

events = []
for ticker, seq in ticker_seq.items():
    dates_in_seq = {s["date"] for s in seq}
    fetch = seq[-1]["fetch"]

    for i, entry in enumerate(seq):
        if not entry["in_long"]:
            continue
        # This date t_last was in long section
        t_last = entry["date"]

        # Find next observation for this ticker
        if i + 1 < len(seq):
            next_obs = seq[i + 1]
            # Check for gap: if there are report dates between t_last and next_obs["date"]
            # that the ticker was absent from, treat those absences as removal start
            gap_dates = [d for d in all_report_dates if t_last < d < next_obs["date"]]

            if not next_obs["in_long"]:
                # Explicit downgrade on next observation
                events.append({
                    "ticker": ticker,
                    "fetch": fetch,
                    "t_last_long": t_last,
                    "t_downgrade": next_obs["date"],
                    "event_type": "downgrade",
                })
            elif gap_dates:
                # Ticker absent for at least one report — partial removal, but re-appeared
                # Not a clean removal event; skip unless next is not long
                pass
        else:
            # Last ever observation — check if it's not the latest report date
            # i.e. was it removed from later reports?
            latest_report_date = all_report_dates[-1]
            if t_last < latest_report_date:
                # Ticker disappeared from reports after t_last
                events.append({
                    "ticker": ticker,
                    "fetch": fetch,
                    "t_last_long": t_last,
                    "t_downgrade": t_last,  # removal — use last long date as exit reference
                    "event_type": "removal",
                })

print(f"\nIdentified {len(events)} downgrade/removal events")

# ── Fetch price data per unique fetch symbol ───────────────────────────────────
unique_fetches = list({e["fetch"] for e in events})
price_cache: dict[str, pd.DataFrame] = {}

# Overall date range
all_t_last = [e["t_last_long"] for e in events]
global_start = min(all_t_last) - timedelta(days=5)
global_end = TODAY + timedelta(days=1)

print(f"Fetching prices for {len(unique_fetches)} symbols: {unique_fetches}")
for sym in unique_fetches:
    try:
        h = yf.download(sym, start=global_start.isoformat(), end=global_end.isoformat(),
                        progress=False, auto_adjust=True)
        if h.empty:
            print(f"  {sym}: no data")
            continue
        if isinstance(h.columns, pd.MultiIndex):
            h.columns = h.columns.get_level_values(0)
        h.index = pd.to_datetime(h.index)
        price_cache[sym] = h
        print(f"  {sym}: {len(h)} bars ({h.index[0].date()} → {h.index[-1].date()})")
    except Exception as ex:
        print(f"  {sym}: error {ex}")

# ── Analyze each event ─────────────────────────────────────────────────────────
results = []

for ev in events:
    sym = ev["fetch"]
    t_last = ev["t_last_long"]
    t_dg = ev["t_downgrade"]
    event_type = ev["event_type"]

    if sym not in price_cache:
        continue

    h = price_cache[sym]
    h_dates = h.index.normalize()

    # Find exit price: close on the last long date (for removal) or downgrade date (for explicit DG)
    # For downgrade events: reference is close on t_dg (the day they were downgraded)
    # For removal events: reference is close on t_last (last day in long)
    ref_date = t_dg if event_type == "downgrade" else t_last

    ref_mask = h_dates.date == ref_date
    if not ref_mask.any():
        # Try nearby date (weekend/holiday)
        nearby = h[h.index.date <= ref_date]
        if nearby.empty:
            continue
        exit_price = float(nearby["Close"].iloc[-1])
        actual_exit_date = nearby.index[-1].date()
    else:
        exit_price = float(h.loc[ref_mask, "Close"].iloc[0])
        actual_exit_date = ref_date

    # Forward window: 20 trading days after exit
    fwd = h[h.index.date > actual_exit_date]
    fwd_20 = fwd.head(FWD_DAYS)

    MIN_FWD_BARS = 3  # require at least 3 bars to classify
    if len(fwd_20) < MIN_FWD_BARS:
        # Insufficient forward data — skip
        continue
    fwd_max_high = float(fwd_20["High"].max())
    fwd_min_low = float(fwd_20["Low"].min())
    fwd_close = float(fwd_20["Close"].iloc[-1])

    fwd_mfe_up = (fwd_max_high - exit_price) / exit_price * 100  # max % above exit
    fwd_mfe_down = (fwd_min_low - exit_price) / exit_price * 100  # negative = dropped

    # Did price exceed exit price in forward window?
    exceeded_exit = fwd_max_high > exit_price * 1.001  # 0.1% buffer

    # All-time high within full data window (from the start of available data)
    full_high = float(h["High"].max())
    full_high_date = h["High"].idxmax().date()

    # Classify: MISSED if stock ran higher, SAVED if it fell and didn't reclaim
    if exceeded_exit:
        classification = "MISSED"
    else:
        classification = "SAVED"

    # At/after peak?
    before_peak = actual_exit_date < full_high_date

    results.append({
        "ticker": ev["ticker"],
        "fetch": sym,
        "event_type": event_type,
        "exit_date": actual_exit_date,
        "exit_price": round(exit_price, 3),
        "fwd_max_high": round(fwd_max_high, 3),
        "fwd_min_low": round(fwd_min_low, 3),
        "fwd_mfe_up_%": round(fwd_mfe_up, 2),
        "fwd_mdd_%": round(fwd_mfe_down, 2),  # negative = dropped
        "fwd_close": round(fwd_close, 3),
        "exceeded_exit": exceeded_exit,
        "classification": classification,
        "window_peak_price": round(full_high, 3),
        "window_peak_date": full_high_date,
        "exit_before_peak": before_peak,
    })

df_res = pd.DataFrame(results)
print(f"\nAnalyzed {len(df_res)} events with price data")

if df_res.empty:
    print("No results — exiting.")
    import sys; sys.exit(0)

# ── Summary statistics ─────────────────────────────────────────────────────────
n_total = len(df_res)
n_missed = (df_res["classification"] == "MISSED").sum()
n_saved = (df_res["classification"] == "SAVED").sum()
pct_missed = n_missed / n_total * 100
pct_saved = n_saved / n_total * 100

missed_df = df_res[df_res["classification"] == "MISSED"]
saved_df = df_res[df_res["classification"] == "SAVED"]

avg_mfe_up_missed = missed_df["fwd_mfe_up_%"].mean() if not missed_df.empty else 0
avg_mfe_up_saved = saved_df["fwd_mfe_up_%"].mean() if not saved_df.empty else 0
avg_mdd_saved = saved_df["fwd_mdd_%"].mean() if not saved_df.empty else 0
avg_mdd_missed = missed_df["fwd_mdd_%"].mean() if not missed_df.empty else 0

n_before_peak = df_res["exit_before_peak"].sum()
n_at_after_peak = (~df_res["exit_before_peak"]).sum()

print("\n" + "=" * 60)
print("DOWNGRADE / REMOVAL EVENT ANALYSIS")
print("=" * 60)

print(f"\n1. Events analyzed: {n_total} "
      f"({df_res[df_res['event_type']=='downgrade']['ticker'].nunique()} downgrade, "
      f"{df_res[df_res['event_type']=='removal']['ticker'].nunique()} removal)")

print(f"\n2. MISSED vs SAVED (over {FWD_DAYS} fwd trading days):")
print(f"   SAVED  (price fell / didn't exceed exit): {n_saved}/{n_total} = {pct_saved:.0f}%")
print(f"   MISSED (price ran higher after exit)    : {n_missed}/{n_total} = {pct_missed:.0f}%")
print(f"\n   Avg forward MFE-up  (MISSED events): +{avg_mfe_up_missed:.1f}%")
print(f"   Avg forward MFE-up  (SAVED events) : +{avg_mfe_up_saved:.1f}%  (but price reverted/held)")
print(f"   Avg forward drawdown (SAVED events) :  {avg_mdd_saved:.1f}%")
print(f"   Avg forward drawdown (MISSED events):  {avg_mdd_missed:.1f}%")

print(f"\n3. Timing relative to window peak:")
print(f"   Exit BEFORE peak  (likely missed):  {n_before_peak}/{n_total} = {n_before_peak/n_total*100:.0f}%")
print(f"   Exit AT/AFTER peak (good timing) :  {n_at_after_peak}/{n_total} = {n_at_after_peak/n_total*100:.0f}%")

print(f"\n4. Magnitude:")
print(f"   MISSED: avg max run after exit = +{avg_mfe_up_missed:.1f}%  "
      f"(median {missed_df['fwd_mfe_up_%'].median():.1f}% | max {missed_df['fwd_mfe_up_%'].max():.1f}%)")
if not saved_df.empty:
    print(f"   SAVED:  avg max drop after exit = {avg_mdd_saved:.1f}%  "
          f"(median {saved_df['fwd_mdd_%'].median():.1f}% | worst {saved_df['fwd_mdd_%'].min():.1f}%)")

# ── Top examples ──────────────────────────────────────────────────────────────
print("\n5. Example events (5-8 most illustrative):")
# Sort: show worst misses and best saves
df_sorted = df_res.sort_values("fwd_mfe_up_%", ascending=False)
examples_shown = 0
shown_tickers = set()

# Show top misses
print("\n   --- MISSED (exited too early) ---")
for _, row in df_sorted.head(20).iterrows():
    if row["classification"] != "MISSED":
        continue
    if row["ticker"] in shown_tickers:
        continue
    shown_tickers.add(row["ticker"])
    print(f"   {row['ticker']:8s} downgraded {row['exit_date']} @ ${row['exit_price']:.2f}  "
          f"→ ran to ${row['fwd_max_high']:.2f} (+{row['fwd_mfe_up_%']:.1f}%)  "
          f"[window peak ${row['window_peak_price']:.2f} on {row['window_peak_date']}]  "
          f"before_peak={row['exit_before_peak']}")
    examples_shown += 1
    if examples_shown >= 4:
        break

# Show best saves (biggest drops after exit)
print("\n   --- SAVED (exit timed well) ---")
saved_sorted = saved_df.sort_values("fwd_mdd_%")
for _, row in saved_sorted.head(10).iterrows():
    if row["ticker"] in shown_tickers:
        continue
    shown_tickers.add(row["ticker"])
    print(f"   {row['ticker']:8s} downgraded {row['exit_date']} @ ${row['exit_price']:.2f}  "
          f"→ dropped to ${row['fwd_min_low']:.2f} ({row['fwd_mdd_%']:.1f}%)  "
          f"[window peak ${row['window_peak_price']:.2f} on {row['window_peak_date']}]  "
          f"before_peak={row['exit_before_peak']}")
    examples_shown += 1
    if examples_shown >= 8:
        break

# Show full table
print("\n   Full event table:")
pd.set_option("display.max_rows", None, "display.width", 200)
cols = ["ticker", "event_type", "exit_date", "exit_price",
        "fwd_mfe_up_%", "fwd_mdd_%", "classification", "exit_before_peak",
        "window_peak_date", "window_peak_price"]
print(df_res[cols].sort_values("exit_date").to_string(index=False))

# ── Verdict ────────────────────────────────────────────────────────────────────
print("\n6. Overall verdict:")
net_signal = "ADDING VALUE (timely exits)" if pct_saved >= 50 else "DESTROYING VALUE (premature exits)"
print(f"   Net assessment: {net_signal}")
print(f"   {pct_saved:.0f}% of exits were followed by price declines (saved), "
      f"{pct_missed:.0f}% preceded further gains (missed).")
if pct_saved >= 50:
    print(f"   Exits are broadly protective — when Argus removes a ticker from the long section, "
          f"the stock typically weakens in the following {FWD_DAYS} trading days "
          f"(avg drawdown {avg_mdd_saved:.1f}% on saved events).")
else:
    print(f"   Exits are broadly premature — when Argus removes a ticker from the long section, "
          f"the stock typically continues higher in the following {FWD_DAYS} trading days "
          f"(avg gain left on the table: {avg_mfe_up_missed:.1f}%).")
