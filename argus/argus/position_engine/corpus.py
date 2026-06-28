"""Calibration corpus (design spec §3, Phase 3b-1). Reads the committed point-in-time
S&P 500 membership and builds/queries a SQLite cache of ADJUSTED daily OHLCV. Runtime
code never scrapes — membership comes from config/sp500_membership.json (built once by
tools/corpus/build_sp500_membership.py). Network fetching is injected for testability."""
import json
from pathlib import Path

import pandas as pd

from ..db import get_conn


def load_membership(path) -> dict:
    """Parse the committed membership JSON into typed intervals.
    Returns {"benchmarks": [...], "members": {ticker: [(start_ts, end_ts_or_None), ...]}}."""
    raw = json.loads(Path(path).read_text())
    members = {}
    for tkr, ivals in raw.get("members", {}).items():
        members[tkr] = [(pd.Timestamp(s), pd.Timestamp(e) if e else None) for s, e in ivals]
    return {"benchmarks": list(raw.get("_benchmarks", [])), "members": members}


def members_active_between(membership: dict, start, end) -> set:
    """Every member whose in-index interval overlaps [start, end], plus all benchmarks."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    out = set(membership["benchmarks"])
    for tkr, ivals in membership["members"].items():
        for s, e in ivals:
            e_eff = e if e is not None else end
            if s <= end and e_eff >= start:          # interval overlaps the window
                out.add(tkr)
                break
    return out
