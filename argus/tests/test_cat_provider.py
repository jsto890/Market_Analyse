import pandas as pd

from argus.catalysts.provider import build_catalysts


def fake_calendar(sym):
    return {"Earnings Date": [pd.Timestamp("2026-08-01").date()]}


def fake_upgrades(sym):
    idx = pd.to_datetime(["2026-06-03", "2026-05-10", "2026-01-02"])
    return pd.DataFrame({"Firm": ["UBS", "MS", "GS"],
                         "ToGrade": ["Buy", "Overweight", "Sell"],
                         "FromGrade": ["Neutral", "Equalweight", "Neutral"],
                         "Action": ["up", "up", "down"]}, index=idx)


def fake_history(sym, period="2y", interval="1d"):
    idx = pd.to_datetime(["2026-05-27", "2026-05-28", "2026-05-29"])
    return pd.DataFrame({"open": [101, 102, 110], "high": [1, 1, 1], "low": [1, 1, 1],
                         "close": [101, 103, 111], "volume": [1, 1, 1]}, index=idx)


def fake_past_earnings(sym):
    idx = pd.to_datetime(["2026-08-01", "2026-05-28", "2026-02-27"])
    return pd.DataFrame({"Surprise(%)": [float("nan"), 12.4, 8.0]}, index=idx)


def test_build_full_payload(monkeypatch):
    c = build_catalysts("AAPL", today="2026-06-13", calendar=fake_calendar,
                        upgrades=fake_upgrades, history=fake_history,
                        past_earnings=fake_past_earnings)
    assert c["symbol"] == "AAPL"
    assert c["next_earnings"] == "2026-08-01"
    assert c["last_earnings"]["date"] == "2026-05-28"
    assert round(c["last_earnings"]["reaction_pct"], 1) == 7.8
    assert c["last_earnings"]["surprise_pct"] == 12.4
    firms = [a["firm"] for a in c["analyst"]]
    assert firms[0] == "UBS"            # 2026-06-03 newest
    assert "GS" not in firms            # 2026-01-02 too old (>90d)


def test_degrades_without_past_earnings(monkeypatch):
    def boom(sym):
        raise ImportError("Import lxml failed")
    c = build_catalysts("AAPL", today="2026-06-13", calendar=fake_calendar,
                        upgrades=fake_upgrades, history=fake_history,
                        past_earnings=boom)
    assert c["next_earnings"] == "2026-08-01"
    assert c["last_earnings"] is None
    assert c["analyst"]
    assert c["degraded"] == ["past_earnings"]


def test_empty_symbol_safe(monkeypatch):
    c = build_catalysts("ZZZZ", today="2026-06-13",
                        calendar=lambda s: {}, upgrades=lambda s: None,
                        history=lambda s, **k: None, past_earnings=lambda s: None)
    assert c["next_earnings"] is None and c["last_earnings"] is None and c["analyst"] == []
