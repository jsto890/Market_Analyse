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
