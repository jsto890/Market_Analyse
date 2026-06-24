import pandas as pd
from argus.position_engine.metrics import aggregate

# three closed trades, R-multiples +2, -1, +1 ; 252 bars; exposure 30 bars
TRADES = pd.DataFrame([
    {"r_multiple": 2.0, "holding_bars": 10, "exit_reason": "target"},
    {"r_multiple": -1.0, "holding_bars": 5, "exit_reason": "stop"},
    {"r_multiple": 1.0, "holding_bars": 15, "exit_reason": "target"},
])


def test_aggregate_core_metrics():
    m = aggregate(TRADES, n_bars=252, years=1.0, bh_return=0.10, bh_maxdd=0.20,
                  spy_return=0.08, spy_maxdd=0.15)
    assert m["n_trades"] == 3
    assert abs(m["win_rate"] - 2 / 3) < 1e-9
    assert abs(m["avg_r"] - (2 - 1 + 1) / 3) < 1e-9
    assert abs(m["expectancy"] - 2 / 3) < 1e-9      # net R per trade
    assert abs(m["exposure"] - 30 / 252) < 1e-9
    assert m["net_r"] == 2.0


def test_max_drawdown_in_r():
    # cumulative R curve: 2, 1, 2 -> peak 2 then trough 1 -> maxDD_R = 1.0
    m = aggregate(TRADES, n_bars=252, years=1.0, bh_return=0.10, bh_maxdd=0.20,
                  spy_return=0.08, spy_maxdd=0.15)
    assert abs(m["max_dd_r"] - 1.0) < 1e-9
    assert abs(m["mar"] - (2.0 / 1.0) / 1.0) < 1e-9  # (net_r/years)/max_dd_r


def test_empty_trades_is_safe():
    m = aggregate(pd.DataFrame(columns=["r_multiple", "holding_bars", "exit_reason"]),
                  n_bars=252, years=1.0, bh_return=0.0, bh_maxdd=0.0,
                  spy_return=0.0, spy_maxdd=0.0)
    assert m["n_trades"] == 0 and m["mar"] == 0.0
    # empty and populated paths must expose the identical key set (guards drift)
    populated = aggregate(TRADES, n_bars=252, years=1.0, bh_return=0.10, bh_maxdd=0.20,
                          spy_return=0.08, spy_maxdd=0.15)
    assert m.keys() == populated.keys()
