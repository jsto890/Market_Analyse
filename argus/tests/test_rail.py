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
