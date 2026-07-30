class _FakeContract:
    def __init__(self, symbol, sec_type="STK", exchange="SMART", currency="USD"):
        self.symbol = symbol
        self.secType = sec_type
        self.exchange = exchange
        self.currency = currency


class _FakePortfolioItem:
    def __init__(self, symbol, position, market_price, market_value, avg_cost, unrealized_pnl, account="U123"):
        self.contract = _FakeContract(symbol)
        self.position = position
        self.marketPrice = market_price
        self.marketValue = market_value
        self.averageCost = avg_cost
        self.unrealizedPNL = unrealized_pnl
        self.account = account


def test_portfolio_items_carries_market_value_and_unrealized_pnl(monkeypatch):
    from argus.data import ibkr

    class _FakeIB:
        def isConnected(self):
            return True

        def portfolio(self):
            return [_FakePortfolioItem("AAPL", 10, 190.5, 1905.0, 180.0, 105.0)]

    client = ibkr.IBKRClient.__new__(ibkr.IBKRClient)
    client.ib = _FakeIB()
    monkeypatch.setattr(client, "connect", lambda: None)

    rows = client.portfolio_items()
    assert rows == [{
        "account": "U123",
        "symbol": "AAPL",
        "sec_type": "STK",
        "exchange": "SMART",
        "currency": "USD",
        "position": 10.0,
        "avg_cost": 180.0,
        "market_price": 190.5,
        "market_value": 1905.0,
        "unrealized_pnl": 105.0,
    }]
