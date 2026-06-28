"""Single-config backtest orchestrator (design spec §11). Replays the engine into
a throwaway per-run SQLite file (never the live DB), re-prices every exit with the
cost/fill model, computes R-space metrics, and writes the per-run artifacts. No UI."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..db import get_conn
from .schema import ensure_schema
from .replay import replay
from .params import EngineParams, DEFAULT
from .fills import FillModel, price_exit, net_buy
from .metrics import aggregate

_REPO_ROOT = Path(__file__).resolve().parents[3]   # .../Market_Analyse
DEFAULT_FILL = FillModel()


def _bh(daily: pd.DataFrame) -> tuple[float, float]:
    """Buy-and-hold total return + max drawdown (%) over the frame."""
    c = daily["close"].to_numpy(dtype=float)
    if c.size < 2:
        return (0.0, 0.0)
    ret = c[-1] / c[0] - 1.0
    peak = pd.Series(c).cummax().to_numpy()
    maxdd = float(((peak - c) / peak).max())
    return (float(ret), maxdd)


def _price_trades(rows, daily, intraday, fm) -> pd.DataFrame:
    """Re-price each engine exit through the fill model; recompute net R.
    Stop exits fire at the TRAILED stop (replay stored it in exit_px), so re-price
    them against that level — NOT init_stop. R basis stays the original risk."""
    out = []
    idx = daily.index
    for t in rows:
        if t["exit_ts"] is None:                       # open at series end: skip
            continue
        entry_net = net_buy(float(t["entry_px"]), fm)
        risk = float(t["entry_px"]) - float(t["init_stop"])
        exit_ts = pd.Timestamp(t["exit_ts"])
        pos = idx.get_loc(exit_ts)
        day = daily.iloc[pos]
        next_day = daily.iloc[pos + 1] if pos + 1 < len(idx) else None
        intr = intraday(t["exit_ts"]) if callable(intraday) else None
        stop_level = float(t["exit_px"]) if t["exit_reason"] == "stop" else float(t["init_stop"])
        reason, exit_net = price_exit(t["exit_reason"], stop=stop_level,
                                      target=float(t["init_target"]), day=day,
                                      next_day=next_day, intraday=intr, fm=fm)
        r = (exit_net - entry_net) / risk if risk > 0 else 0.0
        hb = pos - idx.get_loc(pd.Timestamp(t["entry_ts"]))
        out.append({"entry_ts": t["entry_ts"], "exit_ts": t["exit_ts"],
                    "entry_px": entry_net, "exit_px": exit_net, "exit_reason": reason,
                    "r_multiple": r, "holding_bars": int(hb)})
    return pd.DataFrame(out, columns=["entry_ts", "exit_ts", "entry_px", "exit_px",
                                      "exit_reason", "r_multiple", "holding_bars"])


def run_backtest(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame,
                 sector: pd.DataFrame | None = None, params: EngineParams = DEFAULT,
                 fm: FillModel = DEFAULT_FILL, intraday=None, out_dir=None,
                 years: float | None = None, model_ver: str = "bt") -> dict:
    out_dir = Path(out_dir) if out_dir is not None else \
        _REPO_ROOT / "argus" / "backtests" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir.mkdir(parents=True, exist_ok=True)
    if years is None:
        years = max((daily.index[-1] - daily.index[0]).days / 365.25, 1e-9)

    conn = get_conn(out_dir / "run.db")            # throwaway per-run file
    ensure_schema(conn)
    replay(conn, ticker=ticker, daily=daily, spy=spy, sector=sector,
           model_ver=model_ver, run_kind="backtest", mode="paper", params=params)
    rows = conn.execute("SELECT * FROM trades WHERE ticker=? AND model_ver=?",
                        (ticker, model_ver)).fetchall()
    conn.close()

    priced = _price_trades(rows, daily, intraday, fm)
    bh_ret, bh_dd = _bh(daily)
    spy_ret, spy_dd = _bh(spy)
    metrics = aggregate(priced, n_bars=len(daily), years=years, bh_return=bh_ret,
                        bh_maxdd=bh_dd, spy_return=spy_ret, spy_maxdd=spy_dd)

    priced.to_csv(out_dir / "trades.csv", index=False)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (out_dir / "params.json").write_text(json.dumps(params.__dict__, indent=2))
    return metrics


def _cli():
    import argparse
    from ..data.market import get_history
    from .fills import make_ibkr_intraday_fetcher, make_intraday_fetcher
    ap = argparse.ArgumentParser(description="WS-4 position-engine backtest")
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--period", default="5y")
    ap.add_argument("--intraday-source", choices=["ibkr", "yf", "none"], default="ibkr",
                    help="exact-fill source; ibkr=1h multi-year, yf=~2y, none=daily fallback only")
    args = ap.parse_args()
    daily = get_history(args.ticker, period=args.period, interval="1d")
    spy = get_history("SPY", period=args.period, interval="1d")
    if args.intraday_source == "ibkr":
        intr = make_ibkr_intraday_fetcher(args.ticker)   # degrades to daily fallback if TWS is down
    elif args.intraday_source == "yf":
        intr = make_intraday_fetcher(args.ticker)
    else:
        intr = None
    m = run_backtest(ticker=args.ticker, daily=daily, spy=spy, intraday=intr)
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    _cli()
