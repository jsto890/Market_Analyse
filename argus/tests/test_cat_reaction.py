import pandas as pd

from argus.catalysts.reaction import earnings_reaction_pct


def _hist():
    idx = pd.to_datetime(["2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"])
    return pd.DataFrame({"open": [100, 101, 102, 110],
                         "high": [101, 102, 103, 112],
                         "low": [99, 100, 101, 109],
                         "close": [100, 101, 103, 111],
                         "volume": [1, 1, 1, 1]}, index=idx)


def test_reaction_uses_next_session_close_over_prior_close():
    pct = earnings_reaction_pct(_hist(), "2026-05-28")
    assert pct is not None
    assert round(pct, 1) == 7.8  # (111-103)/103*100


def test_reaction_same_day_when_no_next_session():
    pct = earnings_reaction_pct(_hist(), "2026-05-29")
    assert round(pct, 1) == 0.9  # (111-110)/110*100


def test_reaction_none_when_date_absent():
    assert earnings_reaction_pct(_hist(), "2020-01-01") is None
