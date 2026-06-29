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
