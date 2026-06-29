# WS-4 Daily Action Notifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A notify-only, position-agnostic daily action-list generator that diffs the engine's persisted `position_signals` into ENTRY/EXIT/TRAIL actions and renders them for manual execution.

**Architecture:** One new unit `argus/argus/position_engine/actions.py`: `daily_actions` (diff the two latest signal bars per universe ticker → typed actions), `format_actions` (markdown), `write_actions` (JSON + md artifact). No network, no IBKR, no orders.

**Tech Stack:** Python 3.11, sqlite via `get_conn`, pytest. Reads the existing `position_signals` table.

## Global Constants (from the spec)

- **venv + cwd:** run from `argus/` with `.venv/bin/python`. Package `argus/argus/`, tests `argus/tests/`. `git add` paths repo-root-relative (`argus/...`).
- **No order placement, no IBKR, no sizing** — notify-only by design (user is the gate).
- **Reads only `position_signals`** (cols: `ts, overlay, entry, stop, target, model_ver, run_kind`); diffs the 2 most-recent bars per ticker. Stop-change uses `abs(Δ) > 1e-6`.
- **Action kinds:** `ENTRY` (not-LONG→LONG, emits entry/stop/target), `EXIT` (LONG→EXIT/FLAT/COOLDOWN), `TRAIL` (LONG→LONG with changed stop, emits stop/prev_stop). <2 bars → skip; unchanged hold → silent.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

### File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/actions.py` | **New.** `daily_actions`, `format_actions`, `write_actions`. |
| `argus/tests/test_pe_actions.py` | **New.** Offline tests over synthetic two-bar signal sequences. |

---

## Task 1: `daily_actions` — diff signals into typed actions

**Files:**
- Create: `argus/argus/position_engine/actions.py`
- Test: `argus/tests/test_pe_actions.py`

**Interfaces:**
- Produces: `daily_actions(conn, *, universe, model_ver="bt", run_kind="live", asof=None) -> list[dict]`. Each dict: `{"kind": "ENTRY"|"EXIT"|"TRAIL", "ticker": str, ...}` — ENTRY adds `entry/stop/target`, TRAIL adds `stop/prev_stop`.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_actions.py
import pandas as pd
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.actions import daily_actions


def _sig(conn, ticker, ts, overlay, *, entry=None, stop=None, target=None,
         model_ver="bt", run_kind="live"):
    conn.execute(
        "INSERT INTO position_signals (ts, ticker, tf, model_ver, bias, bias_strength, "
        "strength_tier, overlay, entry, stop, target, leg_count, run_kind, data_date) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (ts, ticker, "1d", model_ver, "LONG", 60, "strong", overlay, entry, stop, target,
         0, run_kind, ts))
    conn.commit()


def _conn(tmp_path):
    c = get_conn(tmp_path / "a.db"); ensure_schema(c); return c


def test_entry_action_on_flat_to_long(tmp_path):
    c = _conn(tmp_path)
    _sig(c, "NVDA", "2024-01-04", "ARMED")
    _sig(c, "NVDA", "2024-01-05", "LONG", entry=100.0, stop=95.0, target=110.0)
    acts = daily_actions(c, universe=["NVDA"])
    c.close()
    assert acts == [{"kind": "ENTRY", "ticker": "NVDA", "entry": 100.0, "stop": 95.0, "target": 110.0}]


def test_exit_action_on_long_to_exit(tmp_path):
    c = _conn(tmp_path)
    _sig(c, "AAPL", "2024-01-04", "LONG", entry=180.0, stop=175.0, target=190.0)
    _sig(c, "AAPL", "2024-01-05", "EXIT")
    acts = daily_actions(c, universe=["AAPL"])
    c.close()
    assert acts == [{"kind": "EXIT", "ticker": "AAPL"}]


def test_trail_action_on_stop_move(tmp_path):
    c = _conn(tmp_path)
    _sig(c, "MSFT", "2024-01-04", "LONG", entry=400.0, stop=390.0, target=420.0)
    _sig(c, "MSFT", "2024-01-05", "LONG", entry=400.0, stop=395.0, target=420.0)
    acts = daily_actions(c, universe=["MSFT"])
    c.close()
    assert acts == [{"kind": "TRAIL", "ticker": "MSFT", "stop": 395.0, "prev_stop": 390.0}]


def test_no_action_on_unchanged_hold_or_single_bar(tmp_path):
    c = _conn(tmp_path)
    _sig(c, "MSFT", "2024-01-04", "LONG", entry=400.0, stop=390.0, target=420.0)
    _sig(c, "MSFT", "2024-01-05", "LONG", entry=400.0, stop=390.0, target=420.0)  # stop unchanged
    _sig(c, "TSLA", "2024-01-05", "LONG", entry=250.0, stop=240.0, target=270.0)  # only 1 bar
    acts = daily_actions(c, universe=["MSFT", "TSLA"])
    c.close()
    assert acts == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_actions.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.actions`.

- [ ] **Step 3: Implement `daily_actions`**

```python
# argus/argus/position_engine/actions.py
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_actions.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/actions.py argus/tests/test_pe_actions.py
git commit -m "feat(actions): daily_actions — diff position_signals into ENTRY/EXIT/TRAIL" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `format_actions` + `write_actions` — render + artifact

**Files:**
- Modify: `argus/argus/position_engine/actions.py`
- Test: `argus/tests/test_pe_actions.py`

**Interfaces:**
- Consumes: `daily_actions` output.
- Produces:
  - `format_actions(actions, *, asof) -> str` — markdown grouped by kind; "No actions today." when empty.
  - `write_actions(actions, *, asof, out_dir) -> dict` — writes `actions.json` + `actions.md`, returns `{"json", "md", "n"}`.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_actions.py
import json
from argus.position_engine.actions import format_actions, write_actions


def test_format_actions_groups_by_kind():
    acts = [{"kind": "ENTRY", "ticker": "NVDA", "entry": 100.0, "stop": 95.0, "target": 110.0},
            {"kind": "EXIT", "ticker": "AAPL"},
            {"kind": "TRAIL", "ticker": "MSFT", "stop": 395.0, "prev_stop": 390.0}]
    md = format_actions(acts, asof="2024-01-05")
    assert "## New entries" in md and "BUY NVDA" in md
    assert "## Exits" in md and "SELL AAPL" in md
    assert "## Stop adjustments" in md and "390.00 -> 395.00" in md


def test_format_actions_empty():
    assert "No actions today." in format_actions([], asof="2024-01-05")


def test_write_actions_writes_json_and_md(tmp_path):
    acts = [{"kind": "EXIT", "ticker": "AAPL"}]
    res = write_actions(acts, asof="2024-01-05", out_dir=tmp_path)
    payload = json.loads((tmp_path / "actions.json").read_text())
    assert payload["asof"] == "2024-01-05" and payload["actions"] == acts
    assert (tmp_path / "actions.md").exists() and res["n"] == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_actions.py::test_format_actions_groups_by_kind -v`
Expected: FAIL — `ImportError: cannot import name 'format_actions'`.

- [ ] **Step 3: Implement `format_actions` + `write_actions`** (append to `actions.py`)

```python
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_actions.py -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/actions.py argus/tests/test_pe_actions.py
git commit -m "feat(actions): format_actions markdown + write_actions JSON/md artifact" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| Diff latest 2 signal bars per ticker → ENTRY/EXIT/TRAIL | 1 |
| ENTRY emits entry/stop/target; TRAIL emits stop/prev_stop; EXIT bare | 1 |
| <2 bars skipped; unchanged hold silent; stop-change ε=1e-6 | 1 |
| Position-agnostic, reads only position_signals, no IBKR/orders | 1 |
| Human-readable grouped markdown + "no actions" | 2 |
| JSON + md artifact | 2 |

**Out of scope (per spec):** order placement, IBKR reconciliation, sizing, delivery-channel
integration (Discord/email) — the daily-run wiring/morning-brief append is a thin later seam.
**Gating note:** promoting beyond notify-only is gated on the Phase-2 corpus validation.
