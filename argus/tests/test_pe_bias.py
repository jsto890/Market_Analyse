import numpy as np
import pandas as pd
from argus.position_engine.bias import bias_score


def _df(closes, highs=None, lows=None, vols=None):
    n = len(closes)
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    c = np.array(closes, float)
    return pd.DataFrame({
        "open": c, "high": (c * 1.01 if highs is None else highs),
        "low": (c * 0.99 if lows is None else lows), "close": c,
        "volume": (np.full(n, 1e6) if vols is None else vols),
    }, index=idx)


def test_uptrend_scores_positive_downtrend_negative():
    up = _df(list(np.linspace(50, 120, 320)))      # long steady advance
    down = _df(list(np.linspace(120, 50, 320)))
    # weekly is resampled inside bias_score; pass the same daily df as both views
    assert bias_score(up, up) >= 4
    assert bias_score(down, down) <= -4


def test_choppy_flat_is_mid_band():
    flat = _df(list(100 + 2 * np.sin(np.linspace(0, 12, 320))))
    assert -4 < bias_score(flat, flat) < 4


from argus.position_engine.bias import BiasState, step_bias, DWELL, CONFIRM


def _run(scores, start=None):
    # Default start: NEUTRAL that has already served its dwell (ready to transition)
    if start is None:
        start = BiasState(bars_in_state=DWELL)
    st = start
    out = []
    for sc in scores:
        st = step_bias(st, sc)
        out.append(st.bias)
    return out, st


def test_requires_confirmation_then_commits():
    # one strong bar does not flip; two consecutive do
    out, _ = _run([5])
    assert out[-1] == "NEUTRAL"          # 1 bar of +5: pending, not committed
    out, st = _run([5, 5])
    assert st.bias == "LONG"             # CONFIRM=2 consecutive → committed


def test_min_dwell_blocks_immediate_flip():
    _, st = _run([5, 5])                  # now LONG, bars_in_state=0
    # feed deeply negative scores; dwell (10) blocks any change for DWELL bars
    out, st2 = _run([-9] * (DWELL - 1), start=st)
    assert all(b == "LONG" for b in out)  # locked by dwell
    # after dwell elapses, CONFIRM+1 bars: 1 absorbs the still-locked bar
    # (bars_in_state reaches DWELL), then CONFIRM unlocked bars commit the flip
    _, st3 = _run([-9] * (CONFIRM + 1), start=st2)
    assert st3.bias in ("NEUTRAL", "SHORT")


def test_hysteresis_holds_through_mid_band():
    _, st = _run([5, 5])                  # LONG
    _, st2 = _run([2] * (DWELL + 3), start=st)  # score 2 > LEAVE(1) → stays LONG
    assert st2.bias == "LONG"
