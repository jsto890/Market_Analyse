import pandas as pd
import pytest


class _FakeBar:
    def __init__(self, date, o, h, l, c, v):
        self.date, self.open, self.high, self.low, self.close, self.volume = date, o, h, l, c, v


def test_historical_bars_returns_lowercase_ohlcv(monkeypatch):
    from argus.data import ibkr
    bars = [_FakeBar(pd.Timestamp("2024-03-01 10:00"), 10, 11, 9, 10.5, 100),
            _FakeBar(pd.Timestamp("2024-03-01 11:00"), 10.5, 12, 10, 11.5, 120)]

    class _FakeIB:
        def isConnected(self): return True
        def qualifyContracts(self, c): return [c]
        def reqHistoricalData(self, *a, **k): return bars

    client = ibkr.IBKRClient.__new__(ibkr.IBKRClient)
    client.ib = _FakeIB()
    monkeypatch.setattr(client, "connect", lambda: None)
    df = client.historical_bars("AAPL", duration="2 D", bar_size="1 hour")
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert len(df) == 2 and df.index.name == "ts"


def test_ibkr_fetcher_slices_by_day_and_falls_back_on_failure(monkeypatch):
    import argus.position_engine.fills as F
    idx = pd.to_datetime(["2024-03-01 10:00", "2024-03-01 11:00", "2024-03-04 10:00"])
    frame = pd.DataFrame({"open": [1, 2, 3], "high": [1, 2, 3], "low": [1, 2, 3],
                          "close": [1, 2, 3], "volume": [1, 1, 1]}, index=idx)
    monkeypatch.setattr(F, "_ibkr_window", lambda *a, **k: frame)
    fetch = F.make_ibkr_intraday_fetcher("AAPL", years=1)
    assert len(fetch("2024-03-01")) == 2
    assert fetch("2024-03-02") is None

    # a raising source must degrade to None (daily fallback), never crash the backtest
    monkeypatch.setattr(F, "_ibkr_window", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("TWS down")))
    fetch2 = F.make_ibkr_intraday_fetcher("AAPL", years=1)
    assert fetch2("2024-03-01") is None
