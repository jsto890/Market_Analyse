from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.store import write_signal, open_trade, close_trade
from argus.position_engine.events import record_event


def _conn(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    return conn


def test_write_signal_upserts(tmp_path):
    conn = _conn(tmp_path)
    row = {"ts": "2026-06-17", "ticker": "NVDA", "tf": "1d", "model_ver": "v1",
           "bias": "LONG", "bias_strength": 72, "strength_tier": "strong",
           "overlay": "LONG", "entry": 100, "stop": 95, "target": 115,
           "avg_cost": 100, "leg_count": 1, "progress_r": 0.5, "progress_pct": 50,
           "progress_denom": 15, "progress_anchor": 0, "health": None, "health_flags": None,
           "risk_state": "at_risk", "structure": "20EMA", "exit_reason": None,
           "cooldown_until": None, "run_kind": "live", "data_date": "2026-06-17"}
    write_signal(conn, row)
    write_signal(conn, {**row, "overlay": "EXIT"})  # same PK → replace
    got = conn.execute("SELECT overlay FROM position_signals WHERE ticker='NVDA'").fetchone()
    conn.close()
    assert got["overlay"] == "EXIT"


def test_open_then_close_trade(tmp_path):
    conn = _conn(tmp_path)
    tid = open_trade(conn, ticker="NVDA", tf="1d", model_ver="v1", mode="paper",
                     entry_ts="2026-06-10", entry_px=100.0, qty=10, init_stop=95.0, init_target=115.0)
    close_trade(conn, tid, exit_ts="2026-06-17", exit_px=112.0, exit_reason="target",
                r_multiple=2.4, holding_bars=5)
    t = conn.execute("SELECT * FROM trades WHERE id=?", (tid,)).fetchone()
    conn.close()
    assert t["exit_reason"] == "target" and t["r_multiple"] == 2.4


def test_record_event_moves_denom_only_with_log(tmp_path):
    conn = _conn(tmp_path)
    tid = open_trade(conn, ticker="NVDA", tf="1d", model_ver="v1", mode="paper",
                     entry_ts="2026-06-10", entry_px=100.0, qty=10, init_stop=95.0, init_target=115.0)
    record_event(conn, trade_id=tid, ticker="NVDA", tf="1d", model_ver="v1",
                 ts="2026-06-15", kind="move_target", old_denom=15, new_denom=20,
                 old_target=115, new_target=120, frozen_anchor=0.6)
    ev = conn.execute("SELECT * FROM position_events WHERE kind='move_target'").fetchone()
    conn.close()
    assert ev["new_denom"] == 20 and ev["frozen_anchor"] == 0.6
