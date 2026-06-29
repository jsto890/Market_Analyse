import numpy as np
import pandas as pd
from argus.position_engine.premise import _enrich, extract_trades, _metrics, oracle_ceiling, bootstrap_rule, apply_rules, rule_correlation, evaluate


def _series():
    # inlined uptrend->pullback->continuation->drop with a LONG round-trip (from test_pe_replay)
    seg = list(np.linspace(50, 148, 217))
    closes = seg + [145.0, 142.5, 140.5, 139.5] + [142.0] + [142.5] + [144.0, 145.5, 147.0] \
        + list(np.linspace(146.0, 120, 18))
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    high[221] = c[221] + 0.8
    vol[221] = 1.7e6
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c, "volume": vol}, index=idx)


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_enrich_adds_full_series_indicator_columns():
    d = _enrich(_series())
    assert {"atr14", "donch_low20"}.issubset(d.columns)
    assert d["atr14"].iloc[-1] > 0
    assert np.isnan(d["donch_low20"].iloc[0])         # shifted -> first is NaN


def test_extract_trades_returns_enriched_paths():
    df = _series()
    spy = _spy(len(df), df.index)
    trades = extract_trades("TEST", df, spy)
    assert len(trades) >= 1
    t = trades[0]
    assert {"ticker", "entry_ts", "entry_px", "r", "hold_r", "mfe_r", "path"} <= set(t)
    assert t["r"] > 0
    assert {"atr14", "donch_low20", "health_flags"}.issubset(t["path"].columns)
    assert len(t["path"]) >= 2                          # at least entry..exit
    assert t["mfe_r"] >= t["hold_r"]          # max favorable excursion >= realized
    assert t["mfe_r"] > 0                       # the canned series runs up while held


def test_metrics_returns_mar_and_expectancy():
    mar, exp = _metrics([1.0, -0.5, 2.0, -0.5], years=1.0)
    assert abs(exp - 0.5) < 1e-9                       # mean R
    assert mar > 0                                     # net 2.0 over a drawdown


def test_oracle_ceiling_beats_hold():
    # NB metrics.aggregate gives mar=0 when there is NO drawdown (the _safe_ratio convention),
    # so the oracle series must still contain a loss for MAR to be well-defined.
    trades = [{"entry_ts": pd.Timestamp("2021-01-04"), "hold_r": 0.5, "mfe_r": 2.0},
              {"entry_ts": pd.Timestamp("2021-02-01"), "hold_r": -0.4, "mfe_r": -0.2},
              {"entry_ts": pd.Timestamp("2021-03-01"), "hold_r": 1.0, "mfe_r": 3.0}]
    oc = oracle_ceiling(trades, years=1.0)
    assert abs(oc["hold_exp"] - np.mean([0.5, -0.4, 1.0])) < 1e-9
    assert abs(oc["oracle_exp"] - np.mean([2.0, -0.2, 3.0])) < 1e-9   # oracle = max(hold, mfe)
    assert oc["uplift_exp"] > 0 and oc["uplift_mar"] > 0


def _rule_df(n_names=40, edge=0.0, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(n_names):
        for j in range(3):
            hold = rng.normal(0.2, 1.0)
            rows.append({"ticker": f"T{k}", "entry_ts": pd.Timestamp("2021-01-04") + pd.Timedelta(days=k * 5 + j),
                         "hold_r": hold, "rule_r": hold + edge})
    return pd.DataFrame(rows)


def test_bootstrap_rule_small_p_for_clear_edge():
    bs = bootstrap_rule(_rule_df(edge=0.6, seed=1), years=1.0, n_boot=400, seed=2)
    assert bs["p_exp"] < 0.05 and bs["p_rule"] == max(bs["p_mar"], bs["p_exp"])


def test_bootstrap_rule_large_p_for_no_edge():
    bs = bootstrap_rule(_rule_df(edge=0.0, seed=3), years=1.0, n_boot=400, seed=4)
    assert bs["p_exp"] > 0.05


def _toy_trade(entry_ts="2021-02-01"):
    n = 30
    c = np.concatenate([np.linspace(100, 140, 12), np.linspace(139, 110, 18)])  # run up then drop
    path = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6), "atr14": np.full(n, 2.0),
                         "donch_low20": np.full(n, 115.0), "health_flags": [""] * n},
                        index=pd.date_range(entry_ts, periods=n, freq="B"))
    return {"ticker": "T0", "entry_ts": pd.Timestamp(entry_ts), "entry_px": 100.0,
            "r": 10.0, "hold_r": (c[-1] - 100.0) / 10.0, "mfe_r": (c.max() - 100.0) / 10.0,
            "path": path}


def test_apply_rules_one_row_per_trade_and_rule():
    df = apply_rules([_toy_trade(), _toy_trade("2022-02-01")])
    assert set(df["rule"].unique()) == {"giveback_trail", "chandelier_high", "donchian_break",
                                        "no_progress", "profit_target_3r", "health_exit"}
    assert len(df) == 2 * 6
    # the giveback rule should fire on this run-up-then-drop path and beat the round-tripped hold
    gb = df[(df["rule"] == "giveback_trail")]
    assert gb["active"].all()
    assert (gb["rule_r"] > gb["hold_r"]).all()


def test_rule_correlation_is_fraction_in_0_1():
    df = apply_rules([_toy_trade(), _toy_trade("2022-02-01")])
    corr = rule_correlation(df)
    assert all(0.0 <= v <= 1.0 for v in corr.values())
    assert "chandelier_high|giveback_trail" in corr or "giveback_trail|chandelier_high" in corr


def _apply_df(good_edge=0.8, n_names=40, seed=0):
    # build a synthetic apply_df directly: giveback_trail has a real edge, others none, health hurts
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(n_names):
        for j in range(2):
            hold = rng.normal(0.1, 1.0)
            ets = pd.Timestamp("2021-03-01") + pd.Timedelta(days=k * 4 + j)
            for rule, edge in [("giveback_trail", good_edge), ("chandelier_high", 0.0),
                               ("donchian_break", 0.0), ("no_progress", 0.0),
                               ("profit_target_3r", -0.3), ("health_exit", -0.5)]:
                rows.append({"trade": k * 2 + j, "ticker": f"T{k}", "entry_ts": ets, "rule": rule,
                             "rule_r": hold + edge, "hold_r": hold, "exit_offset": 3, "active": True})
    return pd.DataFrame(rows)


def test_evaluate_graduates_real_edge_and_excludes_control_from_holm():
    res, go = evaluate(_apply_df(good_edge=0.8, seed=1), years=1.0, n_boot=400, seed=2)
    assert go is True
    assert res["giveback_trail"]["holm_win"] is True
    assert "holm_win" not in res["health_exit"]                 # control not in Holm
    assert res["health_exit"]["p_rule"] > 0.5                   # control hurts


def test_evaluate_abstains_below_min_trades():
    df = _apply_df(good_edge=0.8, seed=1)
    df = df[df["trade"] < 10]                                    # ~20 active < 30 floor
    res, go = evaluate(df, years=1.0, n_boot=200, seed=2)
    assert res["giveback_trail"]["status"] == "ABSTAIN_LOW_N"
    assert go is False
