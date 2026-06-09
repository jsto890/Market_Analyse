"""Offline validation for the catalyst leg. No network. Run: python tests/test_catalyst.py"""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
_TMP = tempfile.mkdtemp(prefix="argus_cat_test_")
os.environ.setdefault("DATA_DIR", _TMP)
os.environ.setdefault("DB_PATH", str(Path(_TMP) / "argus.db"))


def test_types_construct():
    from argus.catalyst.types import CatalystEvent, CatalystPool, CatalystResult
    ev = CatalystEvent(type="fda", direction=1, recency_days=2.0, confidence=0.9, source="news")
    assert ev.type == "fda" and ev.direction == 1
    pool = CatalystPool(ticker="AMPG")
    assert pool.is_empty() is True
    pool2 = CatalystPool(ticker="AMPG", chatter_tags=["fda"])
    assert pool2.is_empty() is False
    res = CatalystResult(score=None)
    assert res.score is None and res.votes == [] and res.gates == []


def main():
    test_types_construct()
    print("OK test_catalyst")


if __name__ == "__main__":
    main()
