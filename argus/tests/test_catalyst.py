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


def test_event_catalyst_vote():
    from argus.agents.base import Verdict
    from argus.catalyst.types import CatalystPool, CatalystEvent
    from argus.catalyst.agents import event_catalyst_vote
    pool = CatalystPool(ticker="XYZ")
    events = [CatalystEvent("fda", 1, 1.0, 0.9, "claude"),
              CatalystEvent("dilution", -1, 1.0, 0.8, "claude")]
    v = event_catalyst_vote(pool, events)
    assert v.agent == "event_catalyst" and v.verdict == Verdict.LONG and v.confidence > 0.5
    # no positive events -> abstain
    v2 = event_catalyst_vote(pool, [CatalystEvent("dilution", -1, 1.0, 0.8, "claude")])
    assert v2.verdict == Verdict.WAIT and v2.confidence == 0.0


def test_earnings_proximity_vote():
    from argus.agents.base import Verdict
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.agents import earnings_proximity_vote
    v = earnings_proximity_vote(CatalystPool("XYZ", metrics={"days_to_earnings": 5}), [])
    assert v.verdict == Verdict.LONG and v.confidence > 0
    v2 = earnings_proximity_vote(CatalystPool("XYZ", metrics={"days_to_earnings": 40}), [])
    assert v2.verdict == Verdict.WAIT
    v3 = earnings_proximity_vote(CatalystPool("XYZ", metrics={}), [])
    assert v3.verdict == Verdict.WAIT


def test_squeeze_setup_vote():
    from argus.agents.base import Verdict
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.agents import squeeze_setup_vote
    v = squeeze_setup_vote(CatalystPool("XYZ", metrics={"short_pct_float": 28.0, "dtc": 7.0}), [])
    assert v.verdict == Verdict.LONG and v.confidence > 0.5
    v2 = squeeze_setup_vote(CatalystPool("XYZ", metrics={"short_pct_float": 4.0, "dtc": 1.0}), [])
    assert v2.verdict == Verdict.WAIT
    v3 = squeeze_setup_vote(CatalystPool("XYZ", metrics={}), [])
    assert v3.verdict == Verdict.WAIT


def test_growth_profitability_vote():
    from argus.agents.base import Verdict
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.agents import growth_profitability_vote
    v = growth_profitability_vote(CatalystPool("XYZ", metrics={"revenue_growth": 0.45}), [])
    assert v.verdict == Verdict.LONG
    # pre-revenue / missing -> abstain (never penalize)
    v2 = growth_profitability_vote(CatalystPool("XYZ", metrics={}), [])
    assert v2.verdict == Verdict.WAIT


def test_analyst_upside_vote():
    from argus.agents.base import Verdict
    from argus.catalyst.types import CatalystPool
    from argus.catalyst.agents import analyst_upside_vote
    v = analyst_upside_vote(CatalystPool("XYZ", metrics={"price": 10.0, "analyst_target": 15.0}), [])
    assert v.verdict == Verdict.LONG and v.confidence > 0
    v2 = analyst_upside_vote(CatalystPool("XYZ", metrics={"price": 10.0, "analyst_target": 8.0}), [])
    assert v2.verdict == Verdict.SHORT
    v3 = analyst_upside_vote(CatalystPool("XYZ", metrics={}), [])
    assert v3.verdict == Verdict.WAIT


def test_meta_score_abstain_renorm():
    from argus.agents.base import Vote, Verdict
    from argus.catalyst.score import meta_score
    # all abstain -> None
    abst = [Vote("event_catalyst", Verdict.WAIT, 0.0, "", "catalyst")]
    assert meta_score(abst) is None
    # single LONG event -> positive score on its own renormalized weight
    one = [Vote("event_catalyst", Verdict.LONG, 0.8, "", "catalyst"),
           Vote("squeeze_setup", Verdict.WAIT, 0.0, "", "catalyst")]
    s = meta_score(one)
    assert s is not None and 0.79 <= s <= 0.81
    # a SHORT pulls the score negative
    mix = [Vote("event_catalyst", Verdict.LONG, 0.5, "", "catalyst"),
           Vote("analyst_upside", Verdict.SHORT, 0.5, "", "catalyst")]
    assert meta_score(mix) < 0.4


def test_evaluate_gates():
    from argus.catalyst.types import CatalystEvent
    from argus.catalyst.score import evaluate_gates
    # dilution -> derank
    g, f = evaluate_gates([CatalystEvent("offering", -1, 2.0, 0.8, "claude")], {})
    assert "derank" in g and any("DILUTION" in x for x in f)
    # going concern -> veto
    g2, f2 = evaluate_gates([CatalystEvent("going_concern", -1, 1.0, 0.9, "claude")], {})
    assert "veto" in g2
    # fresh FDA -> boost
    g3, f3 = evaluate_gates([CatalystEvent("fda", 1, 1.0, 0.9, "claude")], {})
    assert "boost" in g3 and "⚡" in f3
    # earnings metric -> flag only, no gate
    g4, f4 = evaluate_gates([], {"days_to_earnings": 5})
    assert g4 == [] and any("earnings" in x for x in f4)


def test_parse_news_headlines():
    from argus.data.ibkr import parse_news_headlines
    class _Item:
        def __init__(self, h): self.headline = h
    items = [_Item("AAA: FDA approval granted"), _Item("BBB: prices offering")]
    out = parse_news_headlines(items)
    assert out == ["AAA: FDA approval granted", "BBB: prices offering"]
    assert parse_news_headlines(None) == []
    assert parse_news_headlines([object()]) == []  # missing .headline -> skipped


def test_gather_pool_normalizes_metrics():
    from argus.catalyst.sources import gather_pool
    fake_info = {
        "currentPrice": 10.0, "marketCap": 2.0e8, "shortPercentOfFloat": 0.22,
        "revenueGrowth": 0.4, "profitMargins": -0.1, "targetMeanPrice": 18.0,
        "recommendationKey": "buy",
    }
    pool = gather_pool(
        "XYZ",
        setups_row={"catalysts": "fda;biotech"},
        yf_info_fn=lambda t: fake_info,
        yf_news_fn=lambda t: ["XYZ gets FDA approval"],
        ibkr=None,
    )
    assert pool.metrics["price"] == 10.0
    assert pool.metrics["short_pct_float"] == 22.0       # fraction -> percent
    assert pool.metrics["analyst_target"] == 18.0
    assert pool.chatter_tags == ["fda", "biotech"]
    assert pool.news_texts == ["XYZ gets FDA approval"]


def test_gather_pool_best_effort_on_failure():
    from argus.catalyst.sources import gather_pool
    def boom(t): raise RuntimeError("offline")
    pool = gather_pool("XYZ", setups_row=None, yf_info_fn=boom, yf_news_fn=boom, ibkr=None)
    assert pool.is_empty() is True


def test_catalyst_leg_orchestrates():
    from argus.catalyst import catalyst_leg
    from argus.catalyst.types import CatalystPool, CatalystEvent
    pool = CatalystPool(
        ticker="XYZ",
        news_texts=["XYZ FDA approval"],
        metrics={"short_pct_float": 25.0, "dtc": 8.0, "days_to_earnings": 5},
    )
    res = catalyst_leg(
        "XYZ", pool=pool,
        classify=lambda p: [CatalystEvent("fda", 1, 1.0, 0.9, "claude")],
    )
    assert res.score is not None and res.score > 0
    assert "boost" in res.gates and "⚡" in res.flags
    assert any("earnings" in f for f in res.flags)


def test_catalyst_leg_empty_pool_returns_none():
    from argus.catalyst import catalyst_leg
    from argus.catalyst.types import CatalystPool
    res = catalyst_leg("XYZ", pool=CatalystPool("XYZ"), classify=lambda p: [])
    assert res.score is None


def test_blend_and_gates():
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))  # repo root for sentiment_bridge
    import sentiment_bridge as sb
    # all three legs present: 0.35*1 + 0.45*1 + 0.20*1 = 1.0
    assert abs(sb.blend_legs(1.0, 1.0, 1.0) - 1.0) < 1e-9
    # catalyst absent -> renormalize over sentiment+technical (0.35/0.45 -> sums 0.8)
    expected = (0.35 * 0.5 + 0.45 * 1.0) / 0.80
    assert abs(sb.blend_legs(0.5, 1.0, None) - expected) < 1e-9
    # derank caps to <= 0
    assert sb.apply_gates(0.7, ["derank"]) <= 0.0
    # veto caps to <= 0
    assert sb.apply_gates(0.9, ["veto"]) <= 0.0
    # boost lifts a positive score
    assert sb.apply_gates(0.4, ["boost"]) > 0.4


def main():
    test_types_construct()
    test_keyword_fallback()
    test_classify_events_with_claude(); test_classify_events_falls_back_on_bad_json(); test_classify_events_no_client_uses_fallback()
    test_event_catalyst_vote(); test_earnings_proximity_vote()
    test_squeeze_setup_vote(); test_growth_profitability_vote(); test_analyst_upside_vote()
    test_meta_score_abstain_renorm()
    test_evaluate_gates()
    test_parse_news_headlines()
    test_gather_pool_normalizes_metrics(); test_gather_pool_best_effort_on_failure()
    test_catalyst_leg_orchestrates(); test_catalyst_leg_empty_pool_returns_none()
    test_blend_and_gates()
    print("OK test_catalyst")


if __name__ == "__main__":
    main()
