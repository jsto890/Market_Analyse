import numpy as np
import pandas as pd
from argus.position_engine.metrics import aggregate, block_bootstrap_ci, beats_baseline

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


def test_block_bootstrap_ci_brackets_the_mean():
    rng = np.random.default_rng(0)
    vals = rng.normal(0.5, 0.1, 300)            # clearly-positive series
    lo, hi = block_bootstrap_ci(vals, block_len=10, n_boot=500, seed=1)
    assert lo > 0 and lo < 0.5 < hi              # CI excludes zero, brackets mean


def test_success_bar_requires_mar_uplift_and_trade_budget():
    base = {"mar": 1.0, "trades_per_year": 20.0}
    good = {"mar": 1.20, "trades_per_year": 22.0}   # +20% MAR, +10% trades, CI ok
    res = beats_baseline(good, base, mar_uplift_ci=(0.05, 0.30))
    assert res["passed"] is True
    assert abs(res["mar_uplift"] - 0.20) < 1e-9

    churny = {"mar": 1.30, "trades_per_year": 30.0}  # +50% trades > 25% cap
    assert beats_baseline(churny, base, mar_uplift_ci=(0.10, 0.40))["passed"] is False

    noisy = {"mar": 1.20, "trades_per_year": 21.0}
    assert beats_baseline(noisy, base, mar_uplift_ci=(-0.02, 0.40))["passed"] is False  # CI spans 0


def test_success_bar_rejects_degenerate_zero_mar_baseline():
    # baseline with no drawdown -> aggregate() yields mar==0.0; relative uplift is
    # undefined, so the gate must NOT pass even for a strongly positive candidate.
    base = {"mar": 0.0, "trades_per_year": 20.0}
    cand = {"mar": 1.5, "trades_per_year": 21.0}
    res = beats_baseline(cand, base, mar_uplift_ci=(0.10, 0.40))
    assert res["passed"] is False
    assert res["baseline_degenerate"] is True
