import numpy as np
import pandas as pd
from argus.position_engine.evalstats import auc, rank_ic_by_day, cluster_bootstrap_ci, holm


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
