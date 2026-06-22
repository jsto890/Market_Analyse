"""Invariants that must hold across the whole engine output (design spec §6/§10)."""
import numpy as np
import pandas as pd
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.replay import replay


def _series():
    seg = list(np.linspace(50, 148, 217))
    pull = [145.0, 142.5, 140.5, 139.5]
    resume = [142.0]
    fill = [142.5]
    cont = [144.0, 145.5, 147.0]
    drop = list(np.linspace(146.0, 120, 18))
    closes = seg + pull + resume + fill + cont + drop
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    sidx = 221
    vol[sidx] = 1.7e6
    high[sidx] = c[sidx] + 0.8
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c,
                         "volume": vol}, index=idx)


def test_no_position_overlay_under_nonlong_bias(tmp_path):
    conn = get_conn(tmp_path / "pe.db"); ensure_schema(conn)
    df = _series(); replay(conn, ticker="T", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    bad = conn.execute(
        "SELECT COUNT(*) c FROM position_signals "
        "WHERE overlay IN ('ARMED','LONG','EXIT') AND bias != 'LONG'").fetchone()["c"]
    conn.close()
    assert bad == 0


def test_exit_rows_carry_a_reason(tmp_path):
    conn = get_conn(tmp_path / "pe.db"); ensure_schema(conn)
    df = _series(); replay(conn, ticker="T", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    missing = conn.execute(
        "SELECT COUNT(*) c FROM position_signals WHERE overlay='EXIT' AND exit_reason IS NULL").fetchone()["c"]
    conn.close()
    assert missing == 0
