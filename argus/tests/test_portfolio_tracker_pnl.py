import pandas as pd
import pytest


def _fake_history():
    idx = pd.date_range("2026-01-01", periods=30, freq="D")
    return pd.DataFrame({"open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}, index=idx)


def test_positions_with_edge_carries_market_value_and_pnl(monkeypatch):
    from argus.portfolio import tracker as T
    from argus.agents.base import Verdict

    class _FakeCard:
        verdict = Verdict.LONG
        score = 0.5
        high_conviction = False

    class _FakeIB:
        def portfolio_items(self):
            return [{
                "account": "U123", "symbol": "AAPL", "sec_type": "STK", "exchange": "SMART",
                "currency": "USD", "position": 10.0, "avg_cost": 180.0,
                "market_price": 190.5, "market_value": 1905.0, "unrealized_pnl": 105.0,
            }]

    pt = T.PortfolioTracker.__new__(T.PortfolioTracker)
    pt.ib = _FakeIB()
    monkeypatch.setattr(T, "get_history", lambda *a, **k: _fake_history())
    monkeypatch.setattr(T, "build_action_card", lambda *a, **k: _FakeCard())

    rows = pt.positions_with_edge()
    assert len(rows) == 1
    assert rows[0]["market_value"] == 1905.0
    assert rows[0]["unrealized_pnl"] == 105.0
    assert rows[0]["edge"] == "HOLD/ADD"
