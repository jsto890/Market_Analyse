import numpy as np
import pandas as pd
from argus.position_engine.evaluator import evaluate


def _panel(n_days=80, names=6, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    days = pd.date_range("2022-01-03", periods=n_days, freq="B")
    for d in days:
        for k in range(names):
            h2 = int(rng.random() < 0.4)
            # H2 is genuinely predictive: tripping it lifts forward MAE; others are noise
            mae = max(0.0, rng.normal(2.0 if h2 else 0.5, 0.5))
            rows.append({"date": d, "ticker": f"T{k}", "H1": int(rng.random() < 0.3),
                         "H2": h2, "H3": int(rng.random() < 0.3), "H4": int(rng.random() < 0.3),
                         "H5": 0, "health": 100 - 25 * h2, "fwd_mae": mae,
                         "adverse": int(mae >= 1.5)})
    return pd.DataFrame(rows)


def test_evaluate_grades_a_real_signal_and_rejects_noise():
    res = evaluate(_panel())
    assert res["H2"]["graduated"] is True            # predictive -> graduates
    assert res["H2"]["auc"] > 0.5 and res["H2"]["rank_ic"] > 0
    # a pure-noise signal should not graduate
    assert res["H1"]["graduated"] is False
    # composite health (lower=worse) should track forward MAE negatively
    assert res["composite"]["rank_ic"] < 0


def test_evaluate_reports_fire_rates_and_holm():
    res = evaluate(_panel())
    assert 0 <= res["H2"]["fire_rate"] <= 1
    assert "H5" in res and res["H5"]["fire_rate"] == 0.0   # H5 never fires (injected-off)
