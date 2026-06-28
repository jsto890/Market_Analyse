"""Per-LONG-bar panel for health-signal evaluation (design spec §4). Runs the fixed
Phase-1 baseline `replay` over each corpus name into a throwaway per-run conn, reads the
LONG-state bars (whose `health_flags` already record which of H1..H5 fired in 3a), and
joins the forward-MAE label. sector=None is a documented v1 simplification (no per-name
sector map yet → H4 uses SPY-only RS; H1/H2/H3 unaffected).

Label = FIXED forward window by default (`cap_at_exit=False`). Capping the window at the
actual exit reintroduces time-to-exit CENSORING (F3): deterioration flags fire late in a
hold → short capped window → mechanically small MAE → spurious negative IC. Direct
evidence (30-name diagnostic): H2 fires with ~11 bars-to-exit vs ~21 for non-firing bars,
and capping inflates its negative IC ~6×. The predictive estimand for an alert-only score
is the stock's forward downside over a fixed horizon, independent of when we exit, so the
fixed window is correct. `cap_at_exit=True` retains the held-position variant."""
import os
import tempfile

import numpy as np
import pandas as pd

from ..db import get_conn
from .schema import ensure_schema
from .replay import replay
from .labels import forward_mae

_COLS = ["date", "ticker", "H1", "H2", "H3", "H4", "H5", "health", "fwd_mae", "adverse"]
_FLAGS = ["H1", "H2", "H3", "H4", "H5"]


def _parse_flags(s) -> dict:
    tripped = set((s or "").split(",")) - {""}
    return {f: 1 if f in tripped else 0 for f in _FLAGS}


def _long_run_caps(positions, n: int) -> np.ndarray:
    """Forward-window cap per bar so the label never scores beyond a held position
    (spec §4). Each maximal run of consecutive LONG bar-positions is capped at its own
    last bar; non-LONG bars default to series end (n-1)."""
    caps = np.full(n, n - 1, dtype=int)
    pos = sorted(positions)
    i = 0
    while i < len(pos):
        j = i
        while j + 1 < len(pos) and pos[j + 1] == pos[j] + 1:
            j += 1
        run_end = pos[j]
        for p in pos[i:j + 1]:
            caps[p] = run_end
        i = j + 1
    return caps


def build_panel(tickers, *, prices: dict, spy: pd.DataFrame, replay_fn=replay,
                model_ver: str = "bt", cap_at_exit: bool = False) -> pd.DataFrame:
    rows = []
    for tkr in tickers:
        daily = prices.get(tkr)
        if daily is None or len(daily) < 60:
            continue
        fd, tmp = tempfile.mkstemp(suffix=".db")          # throwaway; NEVER the live DB
        os.close(fd)
        conn = get_conn(tmp)
        try:
            ensure_schema(conn)
            replay_fn(conn, ticker=tkr, daily=daily, spy=spy, sector=None,
                      model_ver=model_ver, run_kind="backtest", mode="paper")
            sig = conn.execute(
                "SELECT ts, overlay, health, health_flags FROM position_signals "
                "WHERE ticker=? AND overlay='LONG' ORDER BY ts", (tkr,)).fetchall()
        finally:
            conn.close()
            os.unlink(tmp)
        if not sig:
            continue
        if cap_at_exit:
            pos_of = {ts: i for i, ts in enumerate(daily.index)}
            long_pos = [pos_of[pd.Timestamp(r["ts"])] for r in sig
                        if pd.Timestamp(r["ts"]) in pos_of]
            lab = forward_mae(daily, exit_pos=_long_run_caps(long_pos, len(daily)))
        else:
            lab = forward_mae(daily)                     # fixed forward window (F3, default)
        for r in sig:
            ts = pd.Timestamp(r["ts"])
            if ts not in lab.index:
                continue
            mae, adv = lab.loc[ts, "fwd_mae"], lab.loc[ts, "adverse"]
            if pd.isna(mae) or pd.isna(adv):
                continue
            rows.append({"date": ts, "ticker": tkr, "health": r["health"],
                         "fwd_mae": float(mae), "adverse": int(adv),
                         **_parse_flags(r["health_flags"])})
    return pd.DataFrame(rows, columns=_COLS)
