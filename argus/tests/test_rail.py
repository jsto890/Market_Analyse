import pandas as pd

from argus.data.rail import rail_quotes, RAIL_BASKET


def fake_download(symbols, **kwargs):
    idx = pd.to_datetime(["2026-06-11", "2026-06-12"])
    data = {s: [100.0, 110.0] for s in symbols}
    data["ES=F"] = [100.0, float("nan")]  # ragged: no Friday print
    return pd.DataFrame(data, index=idx)


def test_rail_quotes_per_symbol_last_valid(monkeypatch):
    out = rail_quotes(fetch=fake_download)
    by = {q["symbol"]: q for q in out["quotes"]}
    assert by["ES=F"]["price"] == 100.0
    assert by["BTC-USD"]["price"] == 110.0
    assert round(by["BTC-USD"]["change_pct"], 1) == 10.0
    assert set(by) == set(RAIL_BASKET)
    assert out["groups"]["futures"] and out["groups"]["indices"] and out["groups"]["forex"]


def test_rail_quotes_survives_empty(monkeypatch):
    out = rail_quotes(fetch=lambda symbols, **k: pd.DataFrame())
    assert out["quotes"] == [] and out["error"] == "no data"


def _fake_fetch_three_rows(symbols, **kwargs):
    idx = pd.to_datetime(["2026-07-16", "2026-07-17", "2026-07-20"])
    return pd.DataFrame({s: [98.0, 100.0, 101.0] for s in RAIL_BASKET}, index=idx)


def test_rail_quotes_include_three_closes():
    q = rail_quotes(fetch=_fake_fetch_three_rows)["quotes"][0]
    assert q["price"] == 101.0
    assert q["last_close"] == 100.0
    assert q["prev_close"] == 98.0
    assert q["change_pct"] == 1.0  # unchanged legacy field


def test_rail_quotes_two_rows_fallback():
    def fetch_two(symbols, **kwargs):
        idx = pd.to_datetime(["2026-07-17", "2026-07-20"])
        return pd.DataFrame({s: [100.0, 101.0] for s in RAIL_BASKET}, index=idx)
    q = rail_quotes(fetch=fetch_two)["quotes"][0]
    assert q["last_close"] == 100.0
    assert q["prev_close"] == 100.0  # falls back to last_close


def test_rail_quotes_union_index_weekend_rows():
    # Futures trade Sunday; SPY doesn't — union index gives SPY NaN weekend
    # rows that ffill would flatten. Closes must come from each symbol's own
    # real prints, not the padded frame.
    def fetch_union(symbols, **kwargs):
        idx = pd.to_datetime(["2026-07-16", "2026-07-17", "2026-07-19", "2026-07-20"])
        data = {s: [98.0, 100.0, float("nan"), float("nan")] for s in RAIL_BASKET}
        data["ES=F"] = [7400.0, 7497.75, 7490.0, 7497.5]  # trades the weekend
        return pd.DataFrame(data, index=idx)

    by = {q["symbol"]: q for q in rail_quotes(fetch=fetch_union)["quotes"]}
    assert by["SPY"]["price"] == 100.0
    assert by["SPY"]["last_close"] == 98.0     # Thursday, not ffilled Friday
    assert by["ES=F"]["price"] == 7497.5
    assert by["ES=F"]["last_close"] == 7490.0
    assert by["ES=F"]["prev_close"] == 7497.75
