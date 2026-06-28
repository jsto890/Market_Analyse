import json
import numpy as np
import pandas as pd
from argus.db import get_conn
from argus.position_engine.corpus import (
    load_membership, members_active_between,
    ensure_price_schema, build_corpus, load_prices,
)

_FIXTURE = {
    "_benchmarks": ["SPY", "XLK"],
    "members": {
        "AAA": [["2012-01-01", "2016-06-30"]],          # left index mid-corpus
        "BBB": [["2018-03-01", None]],                  # joined 2018, still in
        "CCC": [["2010-01-01", None]],                  # always in
        "DDD": [["2009-01-01", "2013-01-01"]],          # left before corpus window
    },
}


def _write(tmp_path):
    p = tmp_path / "membership.json"
    p.write_text(json.dumps(_FIXTURE))
    return p


def test_load_membership_parses_intervals_and_benchmarks(tmp_path):
    m = load_membership(_write(tmp_path))
    assert m["benchmarks"] == ["SPY", "XLK"]
    assert m["members"]["BBB"] == [(pd.Timestamp("2018-03-01"), None)]
    assert m["members"]["AAA"][0][1] == pd.Timestamp("2016-06-30")


def test_members_active_between_overlap_and_benchmarks(tmp_path):
    m = load_membership(_write(tmp_path))
    active = members_active_between(m, pd.Timestamp("2014-01-01"), pd.Timestamp("2024-01-01"))
    assert {"AAA", "BBB", "CCC"} <= active     # overlap the window
    assert "DDD" not in active                 # left before 2014
    assert {"SPY", "XLK"} <= active            # benchmarks always included


def test_members_active_between_excludes_non_overlapping(tmp_path):
    m = load_membership(_write(tmp_path))
    active = members_active_between(m, pd.Timestamp("2017-01-01"), pd.Timestamp("2017-12-31"))
    assert "AAA" not in active                 # AAA left 2016-06-30
    assert "BBB" not in active                 # BBB joined 2018-03-01
    assert "CCC" in active


def _fake_frame(n=30, start="2014-01-02"):
    idx = pd.bdate_range(start, periods=n)
    c = np.linspace(100, 130, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_build_corpus_writes_prices_and_manifest(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)

    def fetch(ticker, start):
        return None if ticker == "BAD" else _fake_frame()

    man = build_corpus(["AAA", "BAD", "SPY"], conn=conn, fetch=fetch, start="2014-01-01")
    assert {r["ticker"] for r in man["fetched"]} == {"AAA", "SPY"}
    assert man["skipped"][0]["ticker"] == "BAD"
    px = load_prices(conn, "AAA")
    conn.close()
    assert list(px.columns) == ["open", "high", "low", "close", "volume"]
    assert len(px) == 30 and px.index.is_monotonic_increasing


def test_build_corpus_is_idempotent(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)
    fetch = lambda t, s: _fake_frame()
    build_corpus(["AAA"], conn=conn, fetch=fetch, start="2014-01-01")
    build_corpus(["AAA"], conn=conn, fetch=fetch, start="2014-01-01")   # 2nd run must not duplicate
    n = conn.execute("SELECT COUNT(*) c FROM prices WHERE ticker='AAA'").fetchone()["c"]
    conn.close()
    assert n == 30                                  # INSERT OR REPLACE on (ticker,date)


def test_load_prices_respects_date_window(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)
    build_corpus(["AAA"], conn=conn, fetch=lambda t, s: _fake_frame(60), start="2014-01-01")
    sl = load_prices(conn, "AAA", start="2014-01-10", end="2014-02-10")
    conn.close()
    assert sl.index.min() >= pd.Timestamp("2014-01-10")
    assert sl.index.max() <= pd.Timestamp("2014-02-10")
