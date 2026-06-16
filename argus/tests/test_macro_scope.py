import argus.macro.scope as sc


def test_macro_us_keyword_adds_us_and_global():
    assert sc.scopes_for(None, "Fed signals rate cut as CPI inflation cools") == {"global", "us"}


def test_plain_headline_is_global_only():
    assert sc.scopes_for(None, "Company unveils new logo") == {"global"}


def test_ticker_adds_sector_and_us(monkeypatch):
    monkeypatch.setattr(sc, "resolve_sector", lambda t: ("AI / Compute", "Semiconductors"))
    assert sc.scopes_for("NVDA", "Nvidia earnings beat estimates") == {
        "global", "us", "sector:AI / Compute"}


def test_ticker_unmapped_sector_skipped(monkeypatch):
    monkeypatch.setattr(sc, "resolve_sector", lambda t: ("Other", "whatever"))
    assert sc.scopes_for("ZZZZ", "some move") == {"global", "us"}


def test_empty_headline_no_crash():
    assert sc.scopes_for(None, "") == {"global"}
