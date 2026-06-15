import pandas as pd
from fastapi.testclient import TestClient


def test_catalysts_endpoint_shape(monkeypatch):
    import argus.catalysts.provider as prov
    monkeypatch.setattr(prov, "_default_calendar",
                        lambda s: {"Earnings Date": [pd.Timestamp("2026-08-01").date()]})
    # 2 days ago in UTC — deterministic recent-past date. (Timestamp.now() is machine-LOCAL,
    # which can be a calendar day ahead of the provider's datetime.now(timezone.utc) `today`,
    # making the upgrade look future-dated and get dropped by the `d > t` filter — flaky by tz.)
    recent = pd.Timestamp.utcnow().tz_localize(None).normalize() - pd.Timedelta(days=2)
    monkeypatch.setattr(prov, "_default_upgrades",
                        lambda s: pd.DataFrame(
                            {"Firm": ["UBS"], "ToGrade": ["Buy"], "FromGrade": ["Neutral"],
                             "Action": ["up"]}, index=pd.to_datetime([recent])))
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
