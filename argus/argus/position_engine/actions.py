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


def format_actions(actions, *, asof) -> str:
    if not actions:
        return f"# Daily actions ({asof})\n\nNo actions today.\n"
    entries = [a for a in actions if a["kind"] == "ENTRY"]
    exits = [a for a in actions if a["kind"] == "EXIT"]
    trails = [a for a in actions if a["kind"] == "TRAIL"]
    lines = [f"# Daily actions ({asof})", ""]
    if entries:
        lines.append("## New entries")
        lines += [f"- BUY {a['ticker']}  entry {a['entry']:.2f}  stop {a['stop']:.2f}  "
                  f"target {a['target']:.2f}" for a in entries]
        lines.append("")
    if exits:
        lines.append("## Exits")
        lines += [f"- SELL {a['ticker']}" for a in exits]
        lines.append("")
    if trails:
        lines.append("## Stop adjustments")
        lines += [f"- {a['ticker']}: move stop {a['prev_stop']:.2f} -> {a['stop']:.2f}"
                  for a in trails]
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_actions(actions, *, asof, out_dir) -> dict:
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "actions.json").write_text(json.dumps({"asof": str(asof), "actions": actions}, indent=2))
    (out_dir / "actions.md").write_text(format_actions(actions, asof=asof))
    return {"json": str(out_dir / "actions.json"), "md": str(out_dir / "actions.md"), "n": len(actions)}
