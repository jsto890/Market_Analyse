import numpy as np
import pandas as pd
from argus.position_engine.evalstats import (
    auc, rank_ic_by_day, cluster_bootstrap_ci, holm, permutation_pvalue,
)


def _daily_panel(seed, predictive):
    rng = np.random.default_rng(seed)
    rows = []
    for d in pd.date_range("2022-01-03", periods=40, freq="B"):
        for _ in range(6):
            s = float(rng.random())
            tgt = s + rng.normal(0, 0.05) if predictive else float(rng.random())
            rows.append({"date": d, "sig": s, "tgt": tgt})
    return pd.DataFrame(rows)


def test_permutation_pvalue_small_for_real_signal():
    p = permutation_pvalue(_daily_panel(0, True), "sig", "tgt", n_perm=500, seed=1)
    assert p < 0.05


def test_permutation_pvalue_large_for_noise():
    p = permutation_pvalue(_daily_panel(2, False), "sig", "tgt", n_perm=500, seed=3)
    assert p > 0.05


def test_permutation_pvalue_empty_when_signal_never_varies():
    # a constant signal contributes no day -> p defaults to 1.0 (cannot graduate)
    df = _daily_panel(0, True).assign(sig=0.0)
    assert permutation_pvalue(df, "sig", "tgt", n_perm=100, seed=1) == 1.0


def test_cluster_bootstrap_ci_abstains_when_too_few_days():
    days = pd.Series(np.full(20, 0.3))     # 20 IC-days < 3*block_days(30) -> degenerate, abstain
    lo, hi = cluster_bootstrap_ci(days, block_days=30, n_boot=200, seed=1)
    assert np.isnan(lo) and np.isnan(hi)


def test_auc_perfect_and_chance():
    assert auc([0.1, 0.2, 0.9, 0.8], [0, 0, 1, 1]) == 1.0
    assert abs(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]) - 0.5) < 1e-9
    assert auc([0.9, 0.8, 0.1, 0.2], [0, 0, 1, 1]) == 0.0


def test_rank_ic_by_day_groups_and_correlates():
    # two days; on each, signal rises with target -> rho = +1
    rows = []
    for day in ["2022-01-03", "2022-01-04"]:
        for s, t in [(0, 0.1), (1, 0.5), (2, 0.9)]:
            rows.append({"date": pd.Timestamp(day), "sig": s, "tgt": t})
    df = pd.DataFrame(rows)
    ics = rank_ic_by_day(df, "sig", "tgt")
    assert len(ics) == 2 and all(abs(v - 1.0) < 1e-9 for v in ics)


def test_cluster_bootstrap_ci_brackets_positive_mean():
    rng = np.random.default_rng(0)
    days = pd.Series(rng.normal(0.3, 0.05, 120))    # clearly-positive per-day metric
    lo, hi = cluster_bootstrap_ci(days, block_days=10, n_boot=500, seed=1)
    assert 0 < lo < 0.3 < hi


def test_cluster_bootstrap_ci_spans_zero_for_noise():
    rng = np.random.default_rng(2)
    days = pd.Series(rng.normal(0.0, 0.2, 120))
    lo, hi = cluster_bootstrap_ci(days, block_days=10, n_boot=500, seed=3)
    assert lo < 0 < hi


def test_holm_controls_familywise():
    # Holm thresholds .05/4=.0125, .05/3=.0167, .05/2=.025, .05 -> .001,.01 reject; .04,.30 not
    res = holm({"a": 0.001, "b": 0.01, "c": 0.04, "d": 0.30}, alpha=0.05)
    assert res["a"] is True and res["b"] is True
    assert res["c"] is False and res["d"] is False
