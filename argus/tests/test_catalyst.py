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


def test_keyword_fallback():
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.classify import keyword_fallback
    pool = CatalystPool(
        ticker="XYZ",
        chatter_tags=["earnings"],
        news_texts=["XYZ announces FDA approval for lead drug",
                    "XYZ prices $50M registered direct offering"],
    )
    events = keyword_fallback(pool)
    types = {e.type for e in events}
    assert "fda" in types
    assert "offering" in types
    fda = next(e for e in events if e.type == "fda")
    assert fda.direction == 1 and fda.source == "chatter"
    off = next(e for e in events if e.type == "offering")
    assert off.direction == -1


class _FakeMessages:
    def __init__(self, payload): self._payload = payload
    def create(self, **kwargs):
        class _Block: text = self._payload
        class _Resp: content = [_Block()]
        return _Resp()


class _FakeClient:
    def __init__(self, payload): self.messages = _FakeMessages(payload)


def test_classify_events_with_claude():
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.classify import classify_events
    payload = '[{"type":"fda","direction":1,"recency_days":1,"confidence":0.9,"source_snippet":"approval"}]'
    pool = CatalystPool(ticker="XYZ", news_texts=["XYZ gets FDA nod"])
    events = classify_events(pool, client=_FakeClient(payload))
    assert len(events) == 1 and events[0].type == "fda" and events[0].source == "claude"


def test_classify_events_falls_back_on_bad_json():
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.classify import classify_events
    pool = CatalystPool(ticker="XYZ", news_texts=["XYZ prices public offering of shares"])
    events = classify_events(pool, client=_FakeClient("not json"))
    assert any(e.type == "offering" for e in events)  # fell back to keyword_fallback


def test_classify_events_no_client_uses_fallback():
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.classify import classify_events
    pool = CatalystPool(ticker="XYZ", news_texts=["XYZ announces FDA approval"])
    events = classify_events(pool, client=None, api_key="")
    assert any(e.type == "fda" for e in events)


def main():
    test_types_construct()
    test_keyword_fallback()
    test_classify_events_with_claude(); test_classify_events_falls_back_on_bad_json(); test_classify_events_no_client_uses_fallback()
    print("OK test_catalyst")


if __name__ == "__main__":
    main()
