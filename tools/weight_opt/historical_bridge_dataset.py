"""Build the weight-optimisation panel from historical bridge CSVs.

Key correctness point: the bridge CSV `ret_Nd` columns are TRAILING returns
(the move that already happened before the pick). They are NOT used here.
This script recomputes TRUE forward returns by fetching price history and
measuring `close[date+N] / close[entry] - 1` from each report date forward —
which is valid because those report dates are now in the past.

Run under base conda (has yfinance):
    /Users/josephstorey/anaconda3/bin/python tools/weight_opt/historical_bridge_dataset.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from schema import FORWARD_HORIZONS, PANEL_COLUMNS, COLUMN_ALIASES, VOTE_COLUMNS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
REPORTS = REPO / "reports"
OUT = REPO / "docs" / "weight_optimisation"
PRICE_CACHE = OUT / "price_cache.parquet"

_FNAME_RE = re.compile(r"bridge_(\d{8})_(\d{4})\.csv$")


def _dedup_files() -> dict[str, Path]:
    """Map ISO date -> the bridge CSV with the latest HHMM that day (deterministic)."""
    best: dict[str, tuple[str, Path]] = {}
    for p in sorted(REPORTS.glob("bridge_*.csv")):
        m = _FNAME_RE.search(p.name)
        if not m:
            continue
        ymd, hhmm = m.group(1), m.group(2)
        iso = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
        if iso not in best or hhmm > best[iso][0]:
            best[iso] = (hhmm, p)
    return {iso: path for iso, (_, path) in best.items()}


def _load_rows(files: dict[str, Path]) -> pd.DataFrame:
    frames = []
    for iso, path in files.items():
        df = pd.read_csv(path).rename(columns=COLUMN_ALIASES)
        if "ticker" not in df or "sentiment_score" not in df or "tech_score" not in df:
            print(f"  [skip file] {path.name}: missing core columns", file=sys.stderr)
            continue
        df["date"] = iso
        df["source_file"] = path.name
        keep = ["date", "ticker", "source_file", "sentiment_score", "tech_score"]
        for opt in ("fetch_symbol", "catalyst_score", "alignment", "gate_flags", *VOTE_COLUMNS):
            if opt in df:
                keep.append(opt)
        frames.append(df[keep])
    panel = pd.concat(frames, ignore_index=True)
    panel["n_runs_date"] = panel.groupby("date")["ticker"].transform("size")
    for col in ("fetch_symbol", "catalyst_score", "alignment", "gate_flags", *VOTE_COLUMNS):
        if col not in panel:
            panel[col] = ""
    panel["fetch_symbol"] = panel["fetch_symbol"].fillna("").replace("", pd.NA)
    panel["fetch_symbol"] = panel["fetch_symbol"].fillna(panel["ticker"])
    panel["ticker"] = panel["ticker"].str.upper()
    return panel


def _fetch_prices(symbols: list[str]) -> pd.DataFrame:
    """Daily adjusted closes for all symbols, cached to parquet."""
    import yfinance as yf
    frames = {}
    for sym in sorted(set(symbols)):
        try:
            h = yf.Ticker(sym).history(period="4mo", interval="1d", auto_adjust=True)
            if h is not None and len(h):
                s = h["Close"].copy()
                s.index = pd.to_datetime(s.index).tz_localize(None).normalize()
                frames[sym] = s
        except Exception as e:
            print(f"  [no price] {sym}: {e}", file=sys.stderr)
    prices = pd.DataFrame(frames).sort_index()
    OUT.mkdir(parents=True, exist_ok=True)
    prices.to_parquet(PRICE_CACHE)
    return prices


def _forward_returns(panel: pd.DataFrame, prices: pd.DataFrame) -> pd.DataFrame:
    """Attach fwd_ret_Nd = close N trading days after entry / entry close - 1."""
    idx = prices.index
    for h in FORWARD_HORIZONS:
        panel[f"fwd_ret_{h}d"] = pd.NA

    for i, row in panel.iterrows():
        sym = row["fetch_symbol"]
        if sym not in prices.columns:
            continue
        series = prices[sym].dropna()
        if series.empty:
            continue
        rdate = pd.Timestamp(row["date"])
        # entry = first trading day on/after the report date
        entry_pos = series.index.searchsorted(rdate, side="left")
        if entry_pos >= len(series):
            continue
        entry_px = series.iloc[entry_pos]
        if entry_px <= 0:
            continue
        for h in FORWARD_HORIZONS:
            exit_pos = entry_pos + h
            if exit_pos < len(series):
                panel.at[i, f"fwd_ret_{h}d"] = float(series.iloc[exit_pos] / entry_px - 1.0)
    return panel


def main() -> None:
    files = _dedup_files()
    print(f"Distinct dates after dedup: {len(files)}")
    panel = _load_rows(files)
    print(f"Rows after load: {len(panel)} | unique tickers: {panel['ticker'].nunique()}")

    symbols = panel["fetch_symbol"].dropna().unique().tolist()
    prices = _fetch_prices(symbols)
    print(f"Priced symbols: {prices.shape[1]} / {len(symbols)}")

    panel = _forward_returns(panel, prices)
    panel = panel.reindex(columns=PANEL_COLUMNS)

    OUT.mkdir(parents=True, exist_ok=True)
    panel.to_csv(OUT / "panel.csv", index=False)
    print(f"Wrote {OUT / 'panel.csv'}  ({len(panel)} rows)")
    for h in FORWARD_HORIZONS:
        n = panel[f"fwd_ret_{h}d"].notna().sum()
        print(f"  fwd_ret_{h}d populated: {n}")


if __name__ == "__main__":
    main()
