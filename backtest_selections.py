#!/usr/bin/env python3
"""Realized-return backtest of the historical ALIGNED selections.

Two views, both entering at the signal-day close and exiting when daily
high/low first touches target (win) or stop (loss); if neither by the last
available bar, mark-to-market (OPEN). Same-bar stop+target = stop (conservative).

  A) as-recorded  — stop/target taken from the historical bridge report.
  B) new-argus    — point-in-time re-run of the CURRENT build_action_card on
                    data truncated to the signal date; uses its verdict + levels.
                    Only names the updated engine flags LONG are traded.
"""
from __future__ import annotations

import glob
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent / "argus"))
from argus.data.market import get_history
from argus.action_card.builder import build_action_card
from argus.agents.base import Verdict

REPORTS = Path("reports")
ALIAS = {"SIVE": "SIVE.ST", "SIVEF": "SIVE.ST"}
MIN_PIT_BARS = 250   # need ~1y of history before the signal for a stable card

# ── first-ALIGNED date + recorded levels per ticker ─────────────────────────────
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
    for _, r in df[df["alignment"] == "ALIGNED"].iterrows():
        t = str(r["ticker"]).upper()
        fetch = str(r["fetch_symbol"]).upper() if "fetch_symbol" in df.columns and pd.notna(r.get("fetch_symbol")) else None
        if not fetch or fetch == "NAN":
            fetch = ALIAS.get(t, t)
        rows.append({"ticker": t, "fetch": fetch, "date": date,
                     "rec_entry": r.get("entry"), "rec_stop": r.get("stop"), "rec_target": r.get("target")})

picks = pd.DataFrame(rows)
first = picks.sort_values("date").groupby("ticker", as_index=False).first()
print(f"{len(first)} unique ALIGNED names  ({picks['date'].min()} → {picks['date'].max()})\n")


def simulate(fwd: pd.DataFrame, entry: float, stop: float, target: float):
    """Walk forward; first touch of stop/target wins. Returns (outcome, exit, date, days)."""
    if entry <= 0 or stop <= 0 or target <= 0 or stop >= entry or target <= entry:
        return "BAD_LEVELS", None, None, None
    for i, (ts, row) in enumerate(fwd.iterrows(), start=1):
        hi, lo = float(row["high"]), float(row["low"])
        if lo <= stop:                       # stop-first on same-bar conflict
            return "STOP", stop, ts.date(), i
        if hi >= target:
            return "TARGET", target, ts.date(), i
    if len(fwd) == 0:
        return "NO_FWD", None, None, None
    return "OPEN", float(fwd["close"].iloc[-1]), fwd.index[-1].date(), len(fwd)


def realized(entry, exit_px):
    return None if exit_px is None else round((exit_px - entry) / entry * 100, 1)


def r_multiple(entry, stop, exit_px):
    risk = entry - stop
    return None if (exit_px is None or risk <= 0) else round((exit_px - entry) / risk, 2)


out = []
for _, r in first.iterrows():
    t, fetch, d0 = r["ticker"], r["fetch"], r["date"]
    try:
        h = get_history(fetch, period="5y", interval="1d")
        if h is None or h.empty:
            out.append({"ticker": t, "note": "no data"}); continue
        pit = h[h.index.date <= d0]
        fwd = h[h.index.date > d0]
        if len(pit) < MIN_PIT_BARS:
            out.append({"ticker": t, "note": f"only {len(pit)} bars pre-signal"}); continue
        entry = float(pit["close"].iloc[-1])

        # ── A: as-recorded levels ──
        a_out, a_exit, a_date, a_days = simulate(fwd, entry, float(r["rec_stop"]), float(r["rec_target"]))

        # ── B: new-argus point-in-time re-run ──
        card = build_action_card(fetch, pit)
        b_verdict = card.verdict.value
        if card.verdict == Verdict.LONG:
            b_out, b_exit, b_date, b_days = simulate(fwd, entry, float(card.stop), float(card.target))
            b_rec = {
                "B_stop": round(card.stop, 2), "B_target": round(card.target, 2),
                "B_outcome": b_out, "B_real_%": realized(entry, b_exit),
                "B_R": r_multiple(entry, card.stop, b_exit), "B_days": b_days,
            }
        else:
            b_rec = {"B_stop": None, "B_target": None, "B_outcome": "NO_TRADE",
                     "B_real_%": None, "B_R": None, "B_days": None}

        out.append({
            "ticker": t, "first_said": d0, "entry": round(entry, 2),
            "A_outcome": a_out, "A_real_%": realized(entry, a_exit),
            "A_R": r_multiple(entry, float(r["rec_stop"]), a_exit), "A_days": a_days,
            "B_verdict": b_verdict, **b_rec,
        })
    except Exception as e:
        out.append({"ticker": t, "note": f"error: {type(e).__name__}: {e}"})

res = pd.DataFrame([o for o in out if "A_outcome" in o])
errs = [o for o in out if "A_outcome" not in o]
pd.set_option("display.max_rows", None, "display.width", 240)


def summarize(df, prefix, label):
    traded = df[df[f"{prefix}_real_%"].notna()].copy()
    wins = (traded[f"{prefix}_outcome"] == "TARGET").sum()
    losses = (traded[f"{prefix}_outcome"] == "STOP").sum()
    opens = (traded[f"{prefix}_outcome"] == "OPEN").sum()
    closed = wins + losses
    print(f"\n── {label} ──")
    print(f"trades            : {len(traded)}  (target {wins} / stop {losses} / open {opens})")
    if closed:
        print(f"win rate (closed) : {wins}/{closed} = {wins/closed*100:.0f}%")
    print(f"avg realized      : {traded[f'{prefix}_real_%'].mean():.1f}%   median {traded[f'{prefix}_real_%'].median():.1f}%")
    if traded[f"{prefix}_R"].notna().any():
        print(f"avg R multiple    : {traded[f'{prefix}_R'].mean():.2f}R   (expectancy per trade)")
    if traded[f"{prefix}_days"].notna().any():
        print(f"avg days in trade : {traded[f'{prefix}_days'].mean():.1f}")


# A table
acols = ["ticker", "first_said", "entry", "A_outcome", "A_real_%", "A_R", "A_days"]
print("ALL SELECTIONS — A) as-recorded realized (sorted by realized %)")
print(res.sort_values("A_real_%", ascending=False)[acols].to_string(index=False))
summarize(res, "A", "A) AS-RECORDED LEVELS")

# B verdict distribution + table
print("\n\nB) NEW-ARGUS point-in-time verdict on the old names:")
print(res["B_verdict"].value_counts().to_string())
bcols = ["ticker", "first_said", "entry", "B_verdict", "B_stop", "B_target", "B_outcome", "B_real_%", "B_R", "B_days"]
btraded = res[res["B_outcome"] != "NO_TRADE"]
print("\nNew-Argus LONG trades (sorted by realized %)")
print(btraded.sort_values("B_real_%", ascending=False)[bcols].to_string(index=False))
summarize(res, "B", "B) NEW-ARGUS RE-RUN (LONG-flagged only)")

if errs:
    print("\nskipped:", "; ".join(f"{e['ticker']} ({e['note']})" for e in errs))

res.to_csv(REPORTS / "selection_backtest.csv", index=False)
print(f"\nsaved → {REPORTS / 'selection_backtest.csv'}")
