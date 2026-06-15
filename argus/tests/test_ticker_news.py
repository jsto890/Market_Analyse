from argus.news.ticker_news import ticker_news


def fake_yf(sym):
    return [
        {"content": {"title": "AAPL hits record high", "summary": "s1",
                     "pubDate": "2026-06-16T12:00:00Z",
                     "provider": {"displayName": "Reuters"}, "previewUrl": "http://r/1"}},
        {"content": {"title": "Apple unveils new chip", "summary": "s2",
                     "pubDate": "2026-06-16T10:00:00Z",
                     "provider": {"displayName": "Bloomberg"}, "canonicalUrl": {"url": "http://b/2"}}},
    ]


def fake_ibkr(sym, total=10):
    return ["AAPL hits record high", "Analyst raises target"]


def test_merge_dedupes_by_title_and_normalizes(monkeypatch):
    rows = ticker_news("AAPL", yf_fetch=fake_yf, ibkr_fetch=fake_ibkr)
    titles = [r["headline"] for r in rows]
    assert len(rows) == 3
    assert titles.count("AAPL hits record high") == 1
    yf_row = next(r for r in rows if r["headline"] == "Apple unveils new chip")
    assert yf_row["source"] == "yfinance" and yf_row["url"] == "http://b/2"
    ib_row = next(r for r in rows if r["headline"] == "Analyst raises target")
    assert ib_row["source"] == "ibkr" and ib_row["url"] is None


def test_survives_fetcher_failure(monkeypatch):
    def boom(sym, total=10):
        raise RuntimeError("IBKR down")
    rows = ticker_news("AAPL", yf_fetch=fake_yf, ibkr_fetch=boom)
    assert len(rows) == 2 and all(r["source"] == "yfinance" for r in rows)
