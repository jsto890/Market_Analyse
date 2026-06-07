#!/usr/bin/env python3
"""
Validate the gap-down continuation regime gate against historical bridge reports.

For each ALIGNED LONG entry across all historical CSVs:
  1. Fetch OHLCV ending on the report date
  2. Run _detect_ticker_regime — would the gate have fired?
  3. Fetch next-day and 5-day forward return
  4. Compare win rates: gate-suppressed vs gate-passed entries

Also shows live state: current tickers from the latest report that have
gap_down_continuation today, plus the score delta from the gate.
"""
from __future__ import annotations

import sys
import re
import glob
import concurrent.futures
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

ARGUS_ROOT = Path(__file__).parent / "argus"
sys.path.insert(0, str(ARGUS_ROOT))

from argus.action_card.builder import (
    _detect_ticker_regime,
    _capped_weights,
    _AGENT_FAMILY,
)
from argus.agents.base import Vote, Verdict
from argus.agents import run_all
from argus.indicators import compute_all

REPORTS_DIR = Path(__file__).parent / "reports"

# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_date(ds: str) -> datetime:
    return datetime.strptime(ds, "%Y%m%d")


def _fetch_ohlcv(ticker: str, end_date: datetime, lookback_days: int = 120) -> pd.DataFrame:
    """Fetch OHLCV ending on end_date (exclusive of the following day)."""
    start = end_date - timedelta(days=lookback_days)
    try:
        raw = yf.download(
            ticker,
            start=start.strftime("%Y-%m-%d"),
            end=(end_date + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if raw.empty:
            return pd.DataFrame()
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in raw.columns]
        return raw.rename(columns={"adj close": "close"})
    except Exception:
        return pd.DataFrame()


def _fetch_forward_return(ticker: str, entry_date: datetime, days: int) -> float | None:
    """Return actual forward return from the close on entry_date to close+days later."""
    try:
        start = entry_date
        end   = entry_date + timedelta(days=days + 5)
        raw   = yf.download(
            ticker,
            start=start.strftime("%Y-%m-%d"),
            end=end.strftime("%Y-%m-%d"),
            interval="1d",
            progress=False,
            auto_adjust=True,
        )
        if raw.empty or len(raw) < 2:
            return None
        raw.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in raw.columns]
        # Find the entry close (first available on or after entry_date)
        entry_close = float(raw["close"].iloc[0])
        # Find the close `days` trading days later
        target_idx = min(days, len(raw) - 1)
        fwd_close   = float(raw["close"].iloc[target_idx])
        return (fwd_close - entry_close) / entry_close
    except Exception:
        return None


def _score_without_gate(votes: list[Vote]) -> float:
    """Score using all votes, no momentum_osc suppression."""
    lw, sw = _capped_weights(votes)
    tw = lw + sw
    return (lw - sw) / tw if tw > 0 else 0.0


def _score_with_gate(votes: list[Vote]) -> float:
    """Score with momentum_osc down-weighted ×0.3 (gate applied)."""
    gated = [
        Vote(v.agent, v.verdict, v.confidence * 0.3, v.note, v.family)
        if _AGENT_FAMILY.get(v.agent) == "momentum_osc"
        else v
        for v in votes
    ]
    lw, sw = _capped_weights(gated)
    tw = lw + sw
    return (lw - sw) / tw if tw > 0 else 0.0


# ── load historical ALIGNED rows ─────────────────────────────────────────────

def load_aligned_rows() -> pd.DataFrame:
    files = sorted(glob.glob(str(REPORTS_DIR / "bridge_*.csv")))
    files = [f for f in files if "latest" not in f]
    dfs = []
    for f in files:
        m = re.search(r"bridge_(\d{8})_", f)
        if not m:
            continue
        df = pd.read_csv(f)
        df["report_date"] = m.group(1)
        verdict_col = "argus_verdict" if "argus_verdict" in df.columns else "signa_verdict"
        df["verdict"] = df[verdict_col]
        dfs.append(df)
    all_df = pd.concat(dfs, ignore_index=True)
    aligned = all_df[
        (all_df["alignment"] == "ALIGNED") & (all_df["verdict"] == "LONG")
    ].copy()
    # deduplicate: keep the first report for each ticker+date pair
    aligned = aligned.drop_duplicates(subset=["ticker", "report_date"])
    return aligned


# ── per-row analysis ─────────────────────────────────────────────────────────

def analyse_row(row: dict) -> dict | None:
    ticker = row["ticker"]
    report_date = _parse_date(row["report_date"])

    ohlcv = _fetch_ohlcv(ticker, report_date, lookback_days=120)
    if ohlcv is None or len(ohlcv) < 30:
        return None

    df_ind = compute_all(ohlcv)
    df_ind.attrs["symbol"] = ticker

    regime = _detect_ticker_regime(df_ind)

    # Forward returns
    fwd_1d = _fetch_forward_return(ticker, report_date, days=1)
    fwd_5d = _fetch_forward_return(ticker, report_date, days=5)

    # Score delta from gate
    votes = run_all(df_ind)
    score_raw  = _score_without_gate(votes)
    score_gate = _score_with_gate(votes) if regime == "gap_down_continuation" else score_raw

    # Would gate have changed the verdict?
    def to_verdict(s):
        if s > 0.15:  return "LONG"
        if s < -0.15: return "SHORT"
        return "WAIT"

    verdict_raw  = to_verdict(score_raw)
    verdict_gate = to_verdict(score_gate)
    gate_flipped = regime == "gap_down_continuation" and verdict_gate != verdict_raw

    return {
        "ticker":        ticker,
        "report_date":   row["report_date"],
        "regime":        regime,
        "score_raw":     round(score_raw, 4),
        "score_gate":    round(score_gate, 4),
        "verdict_raw":   verdict_raw,
        "verdict_gate":  verdict_gate,
        "gate_flipped":  gate_flipped,
        "fwd_1d":        fwd_1d,
        "fwd_5d":        fwd_5d,
        "win_1d":        (fwd_1d > 0) if fwd_1d is not None else None,
        "win_5d":        (fwd_5d > 0) if fwd_5d is not None else None,
    }


# ── live validation ───────────────────────────────────────────────────────────

def live_validation(tickers: list[str]) -> None:
    print("\n══════════════════════════════════════════")
    print("LIVE STATE — regime gate today")
    print("══════════════════════════════════════════")

    def check_live(ticker):
        try:
            ohlcv = _fetch_ohlcv(ticker, datetime.today(), lookback_days=120)
            if ohlcv is None or len(ohlcv) < 30:
                return None
            df_ind = compute_all(ohlcv)
            df_ind.attrs["symbol"] = ticker
            regime    = _detect_ticker_regime(df_ind)
            votes     = run_all(df_ind)
            score_raw  = _score_without_gate(votes)
            score_gate = _score_with_gate(votes) if regime == "gap_down_continuation" else score_raw

            # Get gap and ema50 for transparency
            gap = float(ohlcv["open"].iloc[-1] / ohlcv["close"].iloc[-2] - 1) if len(ohlcv) > 1 else 0.0
            ema50 = float(df_ind["ema_50"].iloc[-1]) if "ema_50" in df_ind.columns else None
            last  = float(ohlcv["close"].iloc[-1])

            return {
                "ticker": ticker,
                "regime": regime,
                "gap_pct": round(gap * 100, 2),
                "price": round(last, 2),
                "ema50": round(ema50, 2) if ema50 else None,
                "score_raw": round(score_raw, 4),
                "score_gate": round(score_gate, 4),
                "delta": round(score_gate - score_raw, 4),
            }
        except Exception as e:
            return {"ticker": ticker, "regime": "error", "error": str(e)}

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(check_live, t): t for t in tickers}
        for fut in concurrent.futures.as_completed(futures):
            r = fut.result()
            if r:
                results.append(r)

    results.sort(key=lambda r: r.get("gap_pct", 0))

    flagged  = [r for r in results if r.get("regime") == "gap_down_continuation"]
    trending = [r for r in results if r.get("regime") == "trending"]
    ranging  = [r for r in results if r.get("regime") == "ranging"]
    neutral  = [r for r in results if r.get("regime") == "neutral"]

    print(f"\nCurrent regime breakdown across {len(results)} tickers:")
    print(f"  gap_down_continuation : {len(flagged)}")
    print(f"  trending              : {len(trending)}")
    print(f"  ranging               : {len(ranging)}")
    print(f"  neutral               : {len(neutral)}")

    if flagged:
        print("\n⚠  Gate ACTIVE — momentum_osc suppressed for:")
        hdr = f"  {'Ticker':<8} {'Gap%':>6}  {'Price':>8}  {'EMA50':>8}  {'Score':>7}  {'Gated':>7}  {'Delta':>7}"
        print(hdr)
        print("  " + "─" * 62)
        for r in flagged:
            delta_str = f"{r['delta']:+.4f}" if r.get("delta") is not None else "—"
            print(f"  {r['ticker']:<8} {r['gap_pct']:>+6.2f}%  {r['price']:>8.2f}  "
                  f"{r.get('ema50','—') or '—':>8}  {r['score_raw']:>+7.4f}  "
                  f"{r['score_gate']:>+7.4f}  {delta_str:>7}")
    else:
        print("\n  No tickers in gap_down_continuation today.")


# ── main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("Loading historical ALIGNED LONG entries…")
    aligned = load_aligned_rows()
    print(f"  {len(aligned)} unique ticker+date entries across "
          f"{aligned['report_date'].nunique()} report dates")
    print(f"  Tickers: {aligned['ticker'].nunique()} unique\n")

    print("Fetching OHLCV + forward returns (parallel, ~3-4 min)…")
    rows = aligned.to_dict("records")

    results = []
    failed  = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(analyse_row, r): r for r in rows}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            res = fut.result()
            if res:
                results.append(res)
            else:
                failed += 1
            if done % 25 == 0:
                print(f"  {done}/{len(rows)} …")

    print(f"  Done — {len(results)} analysed, {failed} skipped (insufficient data)\n")

    df = pd.DataFrame(results)

    # ── regime distribution ───────────────────────────────────────────────────
    print("══════════════════════════════════════════")
    print("HISTORICAL REGIME DISTRIBUTION")
    print("══════════════════════════════════════════")
    regime_counts = df["regime"].value_counts()
    for regime, cnt in regime_counts.items():
        pct = cnt / len(df) * 100
        print(f"  {regime:<28} {cnt:>4} ({pct:.1f}%)")

    # ── gate impact ───────────────────────────────────────────────────────────
    gdc_df     = df[df["regime"] == "gap_down_continuation"]
    no_gdc_df  = df[df["regime"] != "gap_down_continuation"]
    flipped_df = df[df["gate_flipped"] == True]

    print(f"\n  gap_down_continuation entries   : {len(gdc_df)}")
    print(f"  Gate would have flipped verdict : {len(flipped_df)}")
    if len(gdc_df) > 0:
        print(f"  Flip rate within GDC entries    : {len(flipped_df)/len(gdc_df)*100:.1f}%")

    # ── win rate comparison ───────────────────────────────────────────────────
    print("\n══════════════════════════════════════════")
    print("WIN RATE: gated vs not-gated  (LONG verdicts)")
    print("══════════════════════════════════════════")

    def wr(subset, col):
        valid = subset[subset[col].notna()]
        if len(valid) == 0:
            return None, 0
        return valid[col].mean(), len(valid)

    wr_all_1d, n_all_1d = wr(df, "win_1d")
    wr_gdc_1d, n_gdc_1d = wr(gdc_df, "win_1d")
    wr_ok_1d,  n_ok_1d  = wr(no_gdc_df, "win_1d")

    wr_all_5d, n_all_5d = wr(df, "win_5d")
    wr_gdc_5d, n_gdc_5d = wr(gdc_df, "win_5d")
    wr_ok_5d,  n_ok_5d  = wr(no_gdc_df, "win_5d")

    def pct(v): return f"{v*100:.1f}%" if v is not None else "—"

    print(f"\n  {'Group':<32} {'1d WR':>8}  {'n':>5}    {'5d WR':>8}  {'n':>5}")
    print("  " + "─" * 60)
    print(f"  {'All ALIGNED LONG':<32} {pct(wr_all_1d):>8}  {n_all_1d:>5}    {pct(wr_all_5d):>8}  {n_all_5d:>5}")
    print(f"  {'Regime OK (no gate)':<32} {pct(wr_ok_1d):>8}  {n_ok_1d:>5}    {pct(wr_ok_5d):>8}  {n_ok_5d:>5}")
    print(f"  {'gap_down_continuation (gated)':<32} {pct(wr_gdc_1d):>8}  {n_gdc_1d:>5}    {pct(wr_gdc_5d):>8}  {n_gdc_5d:>5}")

    if wr_gdc_1d is not None and wr_ok_1d is not None:
        delta_1d = (wr_ok_1d - wr_gdc_1d) * 100
        delta_5d = (wr_ok_5d - wr_gdc_5d) * 100 if wr_ok_5d and wr_gdc_5d else None
        print(f"\n  Win-rate lift from suppressing GDC : {delta_1d:+.1f}pp (1d)  "
              f"{delta_5d:+.1f}pp (5d)" if delta_5d is not None else
              f"\n  Win-rate lift from suppressing GDC : {delta_1d:+.1f}pp (1d)")

    # ── avg return comparison ─────────────────────────────────────────────────
    print("\n══════════════════════════════════════════")
    print("AVERAGE FORWARD RETURN")
    print("══════════════════════════════════════════")
    for label, subset in [("All", df), ("Regime OK", no_gdc_df), ("GDC (gated)", gdc_df)]:
        v1 = subset["fwd_1d"].dropna()
        v5 = subset["fwd_5d"].dropna()
        print(f"  {label:<16}  1d avg {v1.mean()*100:+.2f}%  5d avg {v5.mean()*100:+.2f}%  (n={len(v1)})")

    # ── score delta when gate fires ───────────────────────────────────────────
    if len(gdc_df) > 0:
        deltas = gdc_df["score_gate"] - gdc_df["score_raw"]
        print(f"\n  Score delta when gate fires: "
              f"mean {deltas.mean():+.4f}, median {deltas.median():+.4f}, "
              f"max {deltas.max():+.4f}")

    # ── worst false signals (GDC + large loss) ────────────────────────────────
    if len(gdc_df) > 0:
        bad = gdc_df[gdc_df["fwd_5d"].notna()].nsmallest(5, "fwd_5d")
        if not bad.empty:
            print("\n  Worst losses in GDC entries (5d):")
            for _, r in bad.iterrows():
                print(f"    {r['ticker']:<8} {r['report_date']}  fwd_5d {r['fwd_5d']*100:+.1f}%  "
                      f"score_raw {r['score_raw']:+.4f} → gated {r['score_gate']:+.4f}")

    # ── live check ───────────────────────────────────────────────────────────
    latest_csv = REPORTS_DIR / "bridge_latest.csv"
    if latest_csv.exists():
        latest_df   = pd.read_csv(latest_csv)
        live_tickers = latest_df["ticker"].dropna().unique().tolist()[:40]
        live_validation(live_tickers)
    else:
        print("\nNo bridge_latest.csv found — skipping live check.")


if __name__ == "__main__":
    main()
