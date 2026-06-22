from argus.position_engine.progress import progress_r, progress_pct, risk_state


def test_progress_r_is_off_initial_risk():
    # entry 100, init_stop 95 → R=5. price 107.5 → +1.5R
    assert progress_r(price=107.5, avg_cost=100, init_stop=95) == 1.5
    assert progress_r(price=97.5, avg_cost=100, init_stop=95) == -0.5


def test_progress_pct_stop_to_target():
    # stop 95, target 115, price 105 → (105-95)/(115-95)=50%
    assert progress_pct(price=105, stop=95, target=115) == 50.0
    assert progress_pct(price=95, stop=95, target=115) == 0.0


def test_risk_state_labels():
    assert risk_state(stop=95, avg_cost=100, init_stop=95) == "at_risk"
    assert risk_state(stop=100, avg_cost=100, init_stop=95) == "breakeven"
    assert risk_state(stop=104, avg_cost=100, init_stop=95) == "locked"
