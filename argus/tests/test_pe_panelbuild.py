import numpy as np
import pandas as pd
from argus.position_engine.panelbuild import build_panel, _long_run_caps


def test_long_run_caps_caps_each_run_at_its_end():
    # two LONG runs: positions {2,3,4} and {8,9}; n=12
    caps = _long_run_caps([2, 3, 4, 8, 9], 12)
    assert caps[2] == 4 and caps[3] == 4 and caps[4] == 4   # first run ends at 4
    assert caps[8] == 9 and caps[9] == 9                    # second run ends at 9
    assert caps[0] == 11 and caps[5] == 11                  # non-LONG bars: no cap (series end)


def _series():
    # inlined from test_pe_replay: uptrend -> pullback -> continuation -> drop, with a LONG round-trip
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


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_build_panel_has_long_bars_with_flags_and_label():
    df = _series()
    spy = _spy(len(df), df.index)
    panel = build_panel(["TEST"], prices={"TEST": df}, spy=spy)
    assert set(["date", "ticker", "H1", "H2", "H3", "H4", "H5", "health",
                "fwd_mae", "adverse"]).issubset(panel.columns)
    # the canned series opens and holds a long, so there is at least one LONG bar
    assert len(panel) >= 1
    assert panel["ticker"].unique().tolist() == ["TEST"]
    # flags are 0/1 ints parsed from health_flags; health is in [0,100]
    assert panel["H2"].isin([0, 1]).all()
    assert panel["health"].between(0, 100).all()


def test_build_panel_skips_names_with_no_long():
    # a flat series never opens a trade -> contributes no rows, build must not crash
    n = 260
    idx = pd.date_range("2022-01-03", periods=n, freq="B")
    flat = pd.DataFrame({"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0,
                         "volume": 1e6}, index=idx)
    panel = build_panel(["FLAT"], prices={"FLAT": flat}, spy=flat)
    assert list(panel.columns)  # well-formed empty frame
    assert len(panel) == 0
