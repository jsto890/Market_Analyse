"""Exit premise-check (design spec 2026-06-29). Extracts baseline trades into enriched held
paths, sizes the oracle ceiling, applies the exit-overlay family, and runs a paired
name-cluster aggregate-level bootstrap -> conjunction p (max(p_mar,p_exp)) -> Holm over the
candidate rules -> premise_check_report.json. Reuses metrics.aggregate (NOT beats_baseline).

INFERENCE (pre-registered): pooled OOS 2021-2024; name-cluster paired bootstrap n_boot=2000;
p_rule=max(p_mar,p_exp); >=30 active trades else ABSTAIN; Holm over candidate rules only;
GO iff >=1 candidate wins; per-year deltas are a non-gating regime annotation."""
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from ..db import get_conn
from ..indicators.compute import _atr
from .schema import ensure_schema
from .replay import replay
from .metrics import aggregate
from .evalstats import holm
from .exits import RULES, CONTROL, realized_r

CANDIDATES = list(RULES)
OOS_YEARS = (2021, 2022, 2023, 2024)
MIN_TRADES = 30
N_BOOT = 2000


def _enrich(daily: pd.DataFrame) -> pd.DataFrame:
    d = daily.copy()
    d["atr14"] = _atr(d["high"], d["low"], d["close"], 14)
    d["donch_low20"] = d["low"].rolling(20).min().shift(1)
    return d


def extract_trades(ticker, daily, spy, *, replay_fn=replay) -> list:
    d = _enrich(daily)
    idx = d.index
    fd, tmp = tempfile.mkstemp(suffix=".db"); os.close(fd)
    conn = get_conn(tmp)
    try:
        ensure_schema(conn)
        replay_fn(conn, ticker=ticker, daily=daily, spy=spy, sector=None,
                  model_ver="bt", run_kind="backtest", mode="paper")
        trows = conn.execute(
            "SELECT entry_ts, entry_px, init_stop, exit_ts, r_multiple, mfe_r FROM trades "
            "WHERE ticker=? AND exit_ts IS NOT NULL ORDER BY entry_ts", (ticker,)).fetchall()
        flags = {r["ts"]: (r["health_flags"] or "") for r in conn.execute(
            "SELECT ts, health_flags FROM position_signals WHERE ticker=? AND overlay='LONG'",
            (ticker,))}
    finally:
        conn.close(); os.unlink(tmp)

    out = []
    for t in trows:
        e, x = pd.Timestamp(t["entry_ts"]), pd.Timestamp(t["exit_ts"])
        if e not in idx or x not in idx:
            continue
        ep, xp = idx.get_loc(e), idx.get_loc(x)
        r = float(t["entry_px"]) - float(t["init_stop"])
        if r <= 0:
            continue
        path = d.iloc[ep:xp + 1].copy()
        path["health_flags"] = [flags.get(str(ts.date()), "") for ts in path.index]
        out.append({"ticker": ticker, "entry_ts": e, "entry_px": float(t["entry_px"]),
                    "r": r, "hold_r": float(t["r_multiple"]),
                    "mfe_r": float(t["mfe_r"]) if t["mfe_r"] is not None else float(t["r_multiple"]),
                    "path": path})
    return out
