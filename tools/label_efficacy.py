"""
label_efficacy.py — monthly label-efficacy backtest.

Measures forward returns from each setup's FIRST label date (from Market_Review's
watchlist_memory.csv) to answer two recurring questions:
  1. Are exclusion labels (avoid_wait/noise/extended/late_chase) blocking winners
     that kept running?
  2. Are actionable labels (fresh_watch/building/momentum_confirmed) stalling?

Also breaks down avoid_wait into winners vs losers (the trend-context split) and
checks fresh_watch volume confirmation, so the thresholds baked into setups.py
(rel_volume≥1.2, r20≥15%) can be re-tuned as more regimes accumulate.

Writes a dated markdown report to docs/label_efficacy/. Run monthly (the daily
pipeline invokes it on the 1st — see run_daily.sh).

Usage:
    python tools/label_efficacy.py [--memory PATH] [--out-dir DIR]
"""
from __future__ import annotations

import argparse
import os
import warnings
from datetime import datetime
from pathlib import Path

warnings.filterwarnings("ignore")
import pandas as pd  # noqa: E402

_ALIAS = {"SIVE": "SIVE.ST", "SIVEF": "SIVE.ST", "BTC": "BTC-USD", "ETH": "ETH-USD", "SOL": "SOL-USD"}
_LABEL_ORDER = ["fresh_watch", "building", "momentum_confirmed",
                "extended", "late_chase", "avoid_wait", "noise"]
_WINDOWS = [("f5", 5), ("f10", 10), ("f20", 20)]


def _download_closes(tickers: list[str]) -> dict[str, pd.Series]:
    import yfinance as yf
    out: dict[str, pd.Series] = {}
    for i in range(0, len(tickers), 150):
        chunk = tickers[i:i + 150]
        try:
            data = yf.download(chunk, period="6mo", interval="1d",
                               auto_adjust=True, progress=False, threads=True)
        except Exception:
            continue
        if data is None or data.empty:
            continue
        c = data["Close"] if "Close" in data.columns.get_level_values(0) else data
        if isinstance(c, pd.Series):
            c = c.to_frame(chunk[0])
        for col in c.columns:
            out[col] = c[col].dropna()
    return out


def _forward(close: pd.Series, seen: pd.Timestamp) -> dict | None:
    s = close.dropna()
    if s.empty:
        return None
    pos = s.index.searchsorted(pd.Timestamp(seen.tz_convert(None).date()))
    if pos >= len(s) or pos < 1:
        return None
    entry = s.iloc[pos]
    if entry <= 0:
        return None
    out: dict = {}
    for label, n in _WINDOWS:
        out[label] = (s.iloc[pos + n] / entry - 1) * 100 if pos + n < len(s) else None
    after = s.iloc[pos:]
    out["peak"] = (after.max() / entry - 1) * 100
    out["now"] = (s.iloc[-1] / entry - 1) * 100
    out["r20_at"] = (entry / s.iloc[pos - 20] - 1) * 100 if pos >= 20 else None
    hi20 = s.iloc[max(0, pos - 20):pos + 1].max()
    out["dist_high_at"] = (entry / hi20 - 1) * 100 if hi20 else None
    return out


def run(memory_path: Path) -> pd.DataFrame:
    mem = pd.read_csv(memory_path)
    mem["first_seen_at"] = pd.to_datetime(mem["first_seen_at"], errors="coerce", utc=True)
    mem = mem.dropna(subset=["first_seen_at"])
    mem["yf"] = mem["ticker"].map(lambda t: _ALIAS.get(t, t))
    closes = _download_closes(sorted(set(mem["yf"])))
    rows = []
    for _, r in mem.iterrows():
        s = closes.get(r["yf"])
        if s is None:
            continue
        f = _forward(s, r["first_seen_at"])
        if f:
            rows.append({"ticker": r["ticker"], "label": r["first_setup_label"], **f})
    return pd.DataFrame(rows)


def render(df: pd.DataFrame) -> str:
    today = datetime.now().strftime("%Y-%m-%d")
    out = [f"# Label Efficacy — {today}", "",
           f"_{len(df)} names with a measurable forward window, from first-label date._", "",
           "## Forward returns by first label (median %)", "",
           "| label | n | 5d | 10d | 20d | peak | now | %pos 20d | %hit +15% |",
           "|---|---|---|---|---|---|---|---|---|"]
    for lab in _LABEL_ORDER:
        g = df[df["label"] == lab]
        gv = g.dropna(subset=["f20"])
        if len(gv) == 0:
            continue
        pos20 = (gv["f20"] > 0).mean() * 100
        hit = (g["peak"] > 15).mean() * 100
        out.append(
            f"| {lab} | {len(gv)} | {g['f5'].median():.1f} | {g['f10'].median():.1f} | "
            f"{gv['f20'].median():.1f} | {g['peak'].median():.1f} | {g['now'].median():.1f} | "
            f"{pos20:.0f}% | {hit:.0f}% |"
        )

    # avoid_wait winners vs losers (the trend-context split)
    aw = df[df["label"] == "avoid_wait"].dropna(subset=["f20"])
    win, los = aw[aw["peak"] >= 20], aw[aw["f20"] <= 0]
    if len(win) and len(los):
        out += ["", "## avoid_wait: winners (peak≥20%) vs losers (f20≤0) — label-time features", "",
                "| feature | winners | losers |", "|---|---|---|"]
        for f, name in [("r20_at", "20d momentum"), ("dist_high_at", "dist from high")]:
            out.append(f"| {name} | {win[f].median():.1f} | {los[f].median():.1f} |")

    # fresh_watch confirmation check
    fw = df[df["label"] == "fresh_watch"].dropna(subset=["f20"])
    if len(fw):
        good = fw[fw["peak"] >= 15]
        out += ["", "## fresh_watch", "",
                f"- n={len(fw)}, median 20d {fw['f20'].median():.1f}%, "
                f"%hit +15% {(fw['peak'] >= 15).mean() * 100:.0f}%",
                f"- winners' median 20d-momentum-at-label {good['r20_at'].median():.1f}% "
                f"vs all {fw['r20_at'].median():.1f}%"]

    out += ["", "_Caveat: forward returns are regime-dependent; read alongside the "
            "market regime of the window. Re-tune setups.py thresholds only on a "
            "multi-regime trend, not a single month._"]
    return "\n".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description="Monthly label-efficacy backtest")
    _default_memory = os.environ.get(
        "MARKET_REVIEW_REPORT",
        str(Path(__file__).resolve().parents[2].parent / "Market_Review" / "reports" / "watchlist_memory.csv"),
    ).replace("ticker_setups.csv", "watchlist_memory.csv")
    ap.add_argument("--memory", default=_default_memory)
    ap.add_argument("--out-dir", default=str(Path(__file__).parent.parent / "docs" / "label_efficacy"))
    args = ap.parse_args()

    df = run(Path(args.memory))
    if df.empty:
        print("label_efficacy: no data (price fetch failed?)")
        return
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    report = render(df)
    stamp = datetime.now().strftime("%Y-%m-%d")
    (out_dir / f"{stamp}.md").write_text(report)
    (out_dir / "latest.md").write_text(report)
    df.to_csv(out_dir / f"{stamp}.csv", index=False)
    print(f"label_efficacy → {out_dir / (stamp + '.md')}  ({len(df)} names)")


if __name__ == "__main__":
    main()
