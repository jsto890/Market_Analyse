import pandas as pd
from fastapi.testclient import TestClient


def test_catalysts_endpoint_shape(monkeypatch):
    import argus.catalysts.provider as prov
    monkeypatch.setattr(prov, "_default_calendar",
                        lambda s: {"Earnings Date": [pd.Timestamp("2026-08-01").date()]})
    monkeypatch.setattr(prov, "_default_upgrades",
                        lambda s: pd.DataFrame(
                            {"Firm": ["UBS"], "ToGrade": ["Buy"], "FromGrade": ["Neutral"],
                             "Action": ["up"]}, index=pd.to_datetime([pd.Timestamp.now().normalize()])))
    monkeypatch.setattr(prov, "_default_history", lambda s, **k: None)
    monkeypatch.setattr(prov, "_default_past", lambda s: None)

    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/catalysts/AAPL")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "AAPL"
    assert body["next_earnings"] == "2026-08-01"
    assert body["analyst"][0]["firm"] == "UBS"
    assert "degraded" in body
