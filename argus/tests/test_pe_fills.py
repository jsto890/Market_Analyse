import pandas as pd
from argus.position_engine.fills import FillModel, price_exit

FM = FillModel(slippage_bps=5.0, commission_per_share=0.005)


def _day(o, h, l, c):
    return pd.Series({"open": o, "high": h, "low": l, "close": c})


def test_stop_gap_through_fills_at_open_not_level():
    # opened at 90 which is BELOW the 95 stop -> you eat the gap, fill ~90 (net of costs)
    bar, nxt = _day(90, 96, 89, 95), _day(95, 97, 94, 96)
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop"
    assert 89.9 < px < 90.0  # min(stop, open)=90, minus sell-side slippage/commission


def test_stop_intraday_pierce_fills_at_stop():
    bar, nxt = _day(98, 99, 94, 96), _day(96, 97, 95, 96)  # opened above stop, traded down through it
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop" and 94.8 < px < 95.0  # min(stop, open)=95, net of costs


def test_target_fills_at_next_open_in_daily_fallback():
    bar, nxt = _day(110, 121, 109, 118), _day(119, 122, 118, 120)
    reason, px = price_exit("target", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "target" and 118.9 < px < 119.0  # next_open=119, net of costs


def test_straddle_day_resolves_stop_first_without_intraday():
    bar, nxt = _day(108, 121, 94, 119), _day(119, 120, 118, 119)  # both 95 and 120 in range
    reason, px = price_exit("target", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop"  # conservative: stop wins the ambiguous day


def _intraday(rows):
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"])


def test_intraday_resolves_target_first_when_it_trades_first():
    # within the day: bar 1 tags the target (120) before any later bar tags the stop (95)
    intr = _intraday([[118, 121, 117, 120], [119, 119, 94, 95]])
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=_day(118, 121, 94, 95),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "target" and 119.9 < px < 120.0  # filled at the target limit, net


def test_intraday_resolves_stop_first_when_it_trades_first():
    intr = _intraday([[118, 119, 94, 96], [96, 121, 96, 120]])  # stop tagged in bar 1
    reason, px = price_exit("target", stop=95.0, target=120.0, day=_day(118, 121, 94, 120),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "stop" and 94.8 < px < 95.0


def test_intraday_target_gap_up_fills_better_than_limit():
    intr = _intraday([[122, 123, 121, 122]])  # opens above the 120 target -> fill at 122
    reason, px = price_exit("target", stop=95.0, target=120.0, day=_day(122, 123, 121, 122),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "target" and px > 121.0


def test_make_intraday_fetcher_slices_by_day(monkeypatch):
    import argus.position_engine.fills as F
    idx = pd.to_datetime(["2024-03-01 09:30", "2024-03-01 10:30", "2024-03-04 09:30"])
    fake = pd.DataFrame({"open": [1, 2, 3], "high": [1, 2, 3], "low": [1, 2, 3],
                         "close": [1, 2, 3], "volume": [1, 1, 1]}, index=idx)
    monkeypatch.setattr(F, "get_history", lambda *a, **k: fake)
    fetch = F.make_intraday_fetcher("X")
    assert len(fetch("2024-03-01")) == 2
    assert fetch("2024-03-02") is None
