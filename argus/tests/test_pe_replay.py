import numpy as np
import pandas as pd
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.replay import replay
from argus.position_engine.params import EngineParams


def _series():
    # long uptrend to a local peak (the future target), a shallow pullback toward
    # the moving averages (entry trigger), a brief continuation, then a sharp drop
    # back through the stop. Warmup (200) + cold-start dwell mean the entry must
    # land well after bar ~211, so the peak/pullback sit in the 215-225 region.
    seg = list(np.linspace(50, 148, 217))       # 0..216 rise to peak 148
    pull = [145.0, 142.5, 140.5, 139.5]          # 217..220 pullback toward EMA
    resume = [142.0]                             # 221 signal bar (close > prev high)
    fill = [142.5]                              # 222 fill bar (no gap)
    cont = [144.0, 145.5, 147.0]                # 223..225 continuation
    drop = list(np.linspace(146.0, 120, 18))    # 226.. sharp drop through stop
    closes = seg + pull + resume + fill + cont + drop
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    sidx = 221                                   # resume/signal bar: lift volume
    vol[sidx] = 1.7e6
    high[sidx] = c[sidx] + 0.8                    # keep resume high below the peak
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c,
                         "volume": vol}, index=idx)


def test_replay_produces_signals_and_a_round_trip(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    spy = df.copy()  # flat-ish benchmark stand-in
    rows = replay(conn, ticker="TEST", daily=df, spy=spy, sector=None,
                  model_ver="v1", run_kind="ondemand")
    # there is at least one persisted signal per bar evaluated
    n_sig = conn.execute("SELECT COUNT(*) c FROM position_signals WHERE ticker='TEST'").fetchone()["c"]
    states = {r["overlay"] for r in conn.execute(
        "SELECT DISTINCT overlay FROM position_signals WHERE ticker='TEST'")}
    trades = conn.execute("SELECT * FROM trades WHERE ticker='TEST'").fetchall()
    conn.close()
    assert n_sig > 0
    # the lifecycle visited LONG and exited
    assert "LONG" in states
    assert any(t["exit_reason"] is not None for t in trades)


def test_replay_is_idempotent(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    n1 = conn.execute("SELECT COUNT(*) c FROM position_signals").fetchone()["c"]
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    n2 = conn.execute("SELECT COUNT(*) c FROM position_signals").fetchone()["c"]
    conn.close()
    assert n1 == n2  # INSERT OR REPLACE keyed on (ticker,tf,ts,model_ver,run_kind)


def test_trail_ratchets_stop_up_and_locks_gains(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    # tight trail forces an above-entry (locked) stop-out on the post-peak drop
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1",
           run_kind="ondemand", params=EngineParams(trail_atr=1.0))
    t = conn.execute("SELECT * FROM trades WHERE ticker='TEST' AND exit_reason='stop'").fetchone()
    conn.close()
    assert t is not None
    # exit above entry => the trail locked gain rather than taking the original stop
    assert t["exit_px"] > t["entry_px"]
