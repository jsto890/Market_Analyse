import json
import pandas as pd
from argus.position_engine.corpus import load_membership, members_active_between

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
