from fastapi.testclient import TestClient


def _seed(db):
    from argus.db import get_conn
    from argus.news.schema import ensure_news_schema
    from argus.news.store import insert_item
    conn = get_conn(db); ensure_news_schema(conn)
    for i, (tk, hl, brk) in enumerate([(None, "Fed holds", 0), ("AAPL", "AAPL up", 0),
                                       (None, "BREAKING: bank fails", 1)]):
        insert_item(conn, {"ts": f"2026-06-16T00:0{i}:00Z", "source": "discord", "headline": hl,
                           "ticker": tk, "body": None, "url": None, "tags": None,
                           "is_breaking": brk, "dedup_key": f"m{i}"})
    conn.close()


def test_news_feed_cursor(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db"); monkeypatch.setenv("ARGUS_DB", db); _seed(db)
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/news?after=0&limit=10")
    assert r.status_code == 200
    body = r.json()
    assert body["cursor"] == 3 and len(body["items"]) == 3
    assert body["items"][2]["is_breaking"] == 1
    r2 = c.get("/api/news?after=2")
    assert [i["id"] for i in r2.json()["items"]] == [3]


def test_news_for_symbol(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db"); monkeypatch.setenv("ARGUS_DB", db)
    import argus.api.routes as routes
    monkeypatch.setattr(routes, "ticker_news",
                        lambda sym, **k: [{"headline": f"{sym} news", "source": "yfinance",
                                           "url": "u", "ts": "t", "provider": "Reuters",
                                           "ticker": sym, "body": None}])
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/news/AAPL")
    assert r.status_code == 200
    assert r.json()["items"][0]["headline"] == "AAPL news"
