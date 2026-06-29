"""Notify-only daily action-list generator (design spec 2026-06-30). Diffs the two most-recent
`position_signals` bars per universe ticker into typed ENTRY/EXIT/TRAIL actions for manual
execution. Position-agnostic: reads only the engine's own signals — no IBKR, no orders, no
sizing. The user is the gate."""
import json
from pathlib import Path

_EXITED = ("EXIT", "FLAT", "COOLDOWN")


def daily_actions(conn, *, universe, model_ver="bt", run_kind="live", asof=None) -> list:
    out = []
    for tkr in universe:
        q = ("SELECT ts, overlay, entry, stop, target FROM position_signals "
             "WHERE ticker=? AND model_ver=? AND run_kind=?")
        params = [tkr, model_ver, run_kind]
        if asof is not None:
            q += " AND ts<=?"; params.append(str(asof))
        q += " ORDER BY ts DESC LIMIT 2"
        rows = conn.execute(q, params).fetchall()
        if len(rows) < 2:
            continue
        today, prev = rows[0], rows[1]
        po, to = prev["overlay"], today["overlay"]
        if po != "LONG" and to == "LONG":
            out.append({"kind": "ENTRY", "ticker": tkr, "entry": today["entry"],
                        "stop": today["stop"], "target": today["target"]})
        elif po == "LONG" and to in _EXITED:
            out.append({"kind": "EXIT", "ticker": tkr})
        elif (po == "LONG" and to == "LONG" and today["stop"] is not None
              and prev["stop"] is not None
              and abs(float(today["stop"]) - float(prev["stop"])) > 1e-6):
            out.append({"kind": "TRAIL", "ticker": tkr,
                        "stop": today["stop"], "prev_stop": prev["stop"]})
    return out
