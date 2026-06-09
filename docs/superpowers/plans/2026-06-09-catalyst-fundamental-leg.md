# Catalyst / Fundamental Leg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third decision leg that scores each ticker on catalysts + fundamentals (pooled from X chatter, yfinance, IBKR), classifies event news with Claude Haiku, and blends into the bridge with its own weight and hard gates.

**Architecture:** A self-contained `argus/argus/catalyst/` package produces a `−1..+1` meta-score + typed catalyst events + gate flags per ticker. `sentiment_bridge.py` consumes it as a third weighted leg (0.35 sentiment / 0.45 technical / 0.20 catalyst), renormalizing weights when a leg is absent and applying gates after the blend. Every unit takes injectable inputs so tests run fully offline.

**Tech Stack:** Python 3.11, `argus` package (reuses `Vote`/`Verdict`, `IBKRClient`, `settings`), yfinance, anthropic (Haiku), standalone assertion test scripts (no pytest).

---

## Conventions for every task

- **Python:** `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python`
- **Run dir:** `/Users/josephstorey/Market_Analyse/argus`
- **Test file:** `tests/test_catalyst.py` — a standalone script (matches `tests/offline.py`). Run with:
  `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
- The test script sets `sys.path` and a temp `DATA_DIR` **before** importing `argus.settings` (mirrors `tests/offline.py`). Each task appends its test function(s) and a call in `main()`. Tasks are done in order, so a test only calls code from its own or earlier tasks.
- **Commit** from the repo root `/Users/josephstorey/Market_Analyse`.

## File structure (locked)

```
argus/argus/catalyst/__init__.py      # exports catalyst_leg, CatalystResult
argus/argus/catalyst/types.py         # CatalystEvent, CatalystPool, CatalystResult
argus/argus/catalyst/classify.py      # classify_events + keyword_fallback + type enums
argus/argus/catalyst/agents.py        # 5 sub-agent vote functions
argus/argus/catalyst/score.py         # meta_score, evaluate_gates, catalyst_leg
argus/argus/catalyst/sources.py       # gather_pool (yfinance + IBKR + chatter, per-day cache)
argus/argus/data/ibkr.py              # MODIFY: add historical_news()
sentiment_bridge.py                   # MODIFY: weights, blend, gates, output columns
argus/tests/test_catalyst.py          # standalone test script
```

---

## Task 1: Package scaffold + shared types + test harness

**Files:**
- Create: `argus/argus/catalyst/__init__.py`
- Create: `argus/argus/catalyst/types.py`
- Create: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test harness**

Create `argus/tests/test_catalyst.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.catalyst'`

- [ ] **Step 3: Create the package + types**

Create `argus/argus/catalyst/__init__.py`:

```python
"""Catalyst / fundamental third leg for the sentiment×technical bridge."""
from .types import CatalystEvent, CatalystPool, CatalystResult

__all__ = ["CatalystEvent", "CatalystPool", "CatalystResult"]
```

Create `argus/argus/catalyst/types.py`:

```python
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CatalystEvent:
    type: str            # one of classify.ALL_TYPES
    direction: int       # +1 bullish, 0 neutral, -1 bearish
    recency_days: float  # days since the event/headline
    confidence: float    # 0..1
    source: str = ""     # "news" | "chatter" | "claude"


@dataclass
class CatalystPool:
    ticker: str
    chatter_tags: list = field(default_factory=list)   # list[str] from ticker_setups.csv
    news_texts: list = field(default_factory=list)      # list[str] headlines/snippets
    metrics: dict = field(default_factory=dict)         # normalized numeric fundamentals

    def is_empty(self) -> bool:
        return not (self.chatter_tags or self.news_texts or self.metrics)


@dataclass
class CatalystResult:
    score: float | None                                 # -1..+1, or None if all legs abstain
    votes: list = field(default_factory=list)           # list[Vote]
    events: list = field(default_factory=list)          # list[CatalystEvent]
    gates: list = field(default_factory=list)           # machine codes: veto/derank/boost
    flags: list = field(default_factory=list)           # display flags: ⚡ / ⚠ DILUTION / ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/__init__.py argus/argus/catalyst/types.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): scaffold package + shared types + test harness"
```

---

## Task 2: Keyword fallback classifier

The deterministic fallback used when Claude is unavailable. Built first because it has no external deps and the Claude path reuses its type enums.

**Files:**
- Create: `argus/argus/catalyst/classify.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append to `test_catalyst.py`, and add calls in `main()`)

```python
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
```

Add to `main()` before the print: `test_keyword_fallback()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.catalyst.classify'`

- [ ] **Step 3: Implement `classify.py` (enums + keyword fallback only)**

Create `argus/argus/catalyst/classify.py`:

```python
from __future__ import annotations

import re

from .types import CatalystEvent, CatalystPool

POSITIVE_TYPES = frozenset({
    "acquisition", "fda", "contract", "partnership",
    "breakthrough", "earnings_beat", "upgrade", "index_inclusion",
})
NEGATIVE_TYPES = frozenset({
    "earnings_miss", "downgrade", "dilution", "offering",
    "going_concern", "reverse_split",
})
ALL_TYPES = POSITIVE_TYPES | NEGATIVE_TYPES | frozenset({"other"})

_DIRECTION = {t: 1 for t in POSITIVE_TYPES} | {t: -1 for t in NEGATIVE_TYPES}

# Ordered keyword patterns -> catalyst type. First match per text wins per type.
_PATTERNS: list[tuple[str, str]] = [
    ("fda", r"\bfda\b|approval|clearance|breakthrough therapy|pdufa|phase\s*[123]"),
    ("acquisition", r"\bacquir|acquisition|merger|to be acquired|buyout|takeover"),
    ("contract", r"\bcontract|award(ed)?|purchase order|deal worth|wins?\b.*\bdeal"),
    ("partnership", r"\bpartnership|collaborat|joint venture|teams up|strategic alliance"),
    ("breakthrough", r"\bbreakthrough|milestone|positive (top.?line|results)|data readout"),
    ("earnings_beat", r"\bbeats?\b.*\b(estimates|eps|revenue)|tops? (estimates|forecast)"),
    ("earnings_miss", r"\bmiss(es|ed)?\b.*\b(estimates|eps|revenue)|cuts? guidance"),
    ("upgrade", r"\bupgrade(d|s)?\b|raised price target|initiates? .*\bbuy"),
    ("downgrade", r"\bdowngrade(d|s)?\b|cut price target"),
    ("dilution", r"\bdilut|shelf registration|atm program|warrant"),
    ("offering", r"\boffering|registered direct|public offering|prices?\b.*\bshares"),
    ("going_concern", r"\bgoing concern|bankruptcy|chapter 11|delisting"),
    ("reverse_split", r"\breverse (stock )?split"),
    ("index_inclusion", r"\b(added to|joins|inclusion in) (the )?(s&p|russell|nasdaq).*index"),
]

# Map chatter tag substrings -> type.
_CHATTER_MAP: list[tuple[str, str]] = [
    ("fda", "fda"), ("biotech", "fda"), ("earnings", "earnings_beat"),
    ("filing", "contract"), ("merger", "acquisition"), ("contract", "contract"),
    ("partnership", "partnership"),
]


def keyword_fallback(pool: CatalystPool, *, recency_days: float = 3.0) -> list[CatalystEvent]:
    """Deterministic keyword classification over pooled news + chatter tags."""
    events: list[CatalystEvent] = []
    seen: set[str] = set()
    blob = " \n ".join(pool.news_texts).lower()
    for ctype, pattern in _PATTERNS:
        if ctype in seen:
            continue
        if re.search(pattern, blob):
            events.append(CatalystEvent(
                type=ctype, direction=_DIRECTION.get(ctype, 0),
                recency_days=recency_days, confidence=0.6, source="chatter",
            ))
            seen.add(ctype)
    for tag in pool.chatter_tags:
        low = str(tag).lower()
        for needle, ctype in _CHATTER_MAP:
            if needle in low and ctype not in seen:
                events.append(CatalystEvent(
                    type=ctype, direction=_DIRECTION.get(ctype, 0),
                    recency_days=recency_days, confidence=0.5, source="chatter",
                ))
                seen.add(ctype)
    return events
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/classify.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): keyword-fallback classifier + type enums"
```

---

## Task 3: Claude classifier with fallback

**Files:**
- Modify: `argus/argus/catalyst/classify.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_classify_events_with_claude(); test_classify_events_falls_back_on_bad_json(); test_classify_events_no_client_uses_fallback()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ImportError: cannot import name 'classify_events'`

- [ ] **Step 3: Add `classify_events` to `classify.py`**

Append to `argus/argus/catalyst/classify.py`:

```python
import json

_PROMPT = (
    "You are a financial catalyst extractor. Given recent headlines/snippets for one "
    "stock ticker, return a JSON array of catalyst events. Each item: "
    '{"type": one of %s, "direction": 1 (bullish) / 0 / -1 (bearish), '
    '"recency_days": integer days since the event, "confidence": 0..1, '
    '"source_snippet": short quote}. Only include real, ticker-specific catalysts. '
    "Return [] if none. Return ONLY the JSON array.\n\nTicker: %s\nHeadlines:\n%s"
)
_NEWS_CAP = 25


def _build_client(api_key: str):
    if not api_key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except Exception:
        return None


def _parse_events(text: str) -> list[CatalystEvent]:
    data = json.loads(text)
    out: list[CatalystEvent] = []
    for item in data:
        ctype = str(item.get("type", "other"))
        if ctype not in ALL_TYPES:
            ctype = "other"
        out.append(CatalystEvent(
            type=ctype,
            direction=int(item.get("direction", 0)),
            recency_days=float(item.get("recency_days", 3) or 3),
            confidence=max(0.0, min(1.0, float(item.get("confidence", 0.5) or 0.5))),
            source="claude",
        ))
    return out


def classify_events(
    pool: CatalystPool,
    *,
    client=None,
    api_key: str = "",
    model: str = "claude-haiku-4-5",
) -> list[CatalystEvent]:
    """Classify pooled text into typed catalyst events via Claude; keyword fallback on any failure."""
    if not pool.news_texts and not pool.chatter_tags:
        return []
    if client is None:
        client = _build_client(api_key)
    if client is None:
        return keyword_fallback(pool)
    try:
        headlines = "\n".join(f"- {t}" for t in pool.news_texts[:_NEWS_CAP])
        prompt = _PROMPT % (sorted(ALL_TYPES), pool.ticker, headlines)
        resp = client.messages.create(
            model=model, max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.content[0].text.strip()
        events = _parse_events(text)
        return events if events else keyword_fallback(pool)
    except Exception:
        return keyword_fallback(pool)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/classify.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): Claude Haiku classifier with keyword fallback"
```

---

## Task 4: Sub-agents — event_catalyst + earnings_proximity

**Files:**
- Create: `argus/argus/catalyst/agents.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_event_catalyst_vote(); test_earnings_proximity_vote()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.catalyst.agents'`

- [ ] **Step 3: Implement `agents.py` (first two agents + shared constants/helpers)**

Create `argus/argus/catalyst/agents.py`:

```python
from __future__ import annotations

from argus.agents.base import Vote, Verdict

from .classify import POSITIVE_TYPES
from .types import CatalystEvent, CatalystPool

FAMILY = "catalyst"
EARNINGS_WINDOW_DAYS = 14
EVENT_RECENCY_DAYS = 30.0


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def _abstain(name: str, note: str = "no data") -> Vote:
    return Vote(name, Verdict.WAIT, 0.0, note, FAMILY)


def _recency_factor(recency_days: float) -> float:
    return max(0.0, 1.0 - recency_days / EVENT_RECENCY_DAYS)


def event_catalyst_vote(pool: CatalystPool, events: list[CatalystEvent]) -> Vote:
    positives = [e for e in events if e.direction > 0 and e.type in POSITIVE_TYPES]
    if not positives:
        return _abstain("event_catalyst", "no positive catalyst")
    strength = max(e.confidence * _recency_factor(e.recency_days) for e in positives)
    types = ", ".join(sorted({e.type for e in positives}))
    return Vote("event_catalyst", Verdict.LONG, _clamp(strength), types, FAMILY)


def earnings_proximity_vote(pool: CatalystPool, events: list[CatalystEvent]) -> Vote:
    d = pool.metrics.get("days_to_earnings")
    if d is None:
        return _abstain("earnings_proximity")
    if 0 <= d <= EARNINGS_WINDOW_DAYS:
        conf = _clamp(0.6 * (1.0 - d / EARNINGS_WINDOW_DAYS))
        return Vote("earnings_proximity", Verdict.LONG, conf, f"earnings in {d}d", FAMILY)
    return _abstain("earnings_proximity", f"earnings {d}d out")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/agents.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): event_catalyst + earnings_proximity agents"
```

---

## Task 5: Sub-agents — squeeze_setup + growth_profitability + analyst_upside

**Files:**
- Modify: `argus/argus/catalyst/agents.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_squeeze_setup_vote(); test_growth_profitability_vote(); test_analyst_upside_vote()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ImportError: cannot import name 'squeeze_setup_vote'`

- [ ] **Step 3: Append the three agents to `agents.py`**

Append to `argus/argus/catalyst/agents.py`:

```python
SQUEEZE_SHORT_PCT = 15.0
SQUEEZE_DTC = 5.0
ANALYST_UPSIDE_MIN = 0.10


def squeeze_setup_vote(pool: CatalystPool, events: list[CatalystEvent]) -> Vote:
    sp = pool.metrics.get("short_pct_float")
    dtc = pool.metrics.get("dtc")
    if sp is None and dtc is None:
        return _abstain("squeeze_setup")
    triggered = (sp is not None and sp >= SQUEEZE_SHORT_PCT) or (dtc is not None and dtc >= SQUEEZE_DTC)
    if not triggered:
        return _abstain("squeeze_setup", "no squeeze")
    sp_conf = _clamp(0.5 + (sp - SQUEEZE_SHORT_PCT) / 40.0) if sp is not None else 0.0
    dtc_conf = _clamp(0.5 + (dtc - SQUEEZE_DTC) / 15.0) if dtc is not None else 0.0
    conf = max(sp_conf, dtc_conf)
    return Vote("squeeze_setup", Verdict.LONG, conf,
                f"short={sp}% dtc={dtc}", FAMILY)


def growth_profitability_vote(pool: CatalystPool, events: list[CatalystEvent]) -> Vote:
    rg = pool.metrics.get("revenue_growth")
    pm = pool.metrics.get("profit_margin")
    if rg is None and pm is None:
        return _abstain("growth_profitability", "pre-revenue/no data")
    score = 0.0
    if rg is not None:
        score += rg                      # e.g. 0.45 = 45% YoY
    if pm is not None and pm > 0:
        score += pm
    if score <= 0:
        return _abstain("growth_profitability", "no growth")
    return Vote("growth_profitability", Verdict.LONG, _clamp(score), f"rev_g={rg} margin={pm}", FAMILY)


def analyst_upside_vote(pool: CatalystPool, events: list[CatalystEvent]) -> Vote:
    price = pool.metrics.get("price")
    target = pool.metrics.get("analyst_target")
    if not price or not target:
        return _abstain("analyst_upside")
    upside = (target - price) / price
    if upside >= ANALYST_UPSIDE_MIN:
        return Vote("analyst_upside", Verdict.LONG, _clamp(upside), f"upside={upside:.0%}", FAMILY)
    if upside <= -ANALYST_UPSIDE_MIN:
        return Vote("analyst_upside", Verdict.SHORT, _clamp(-upside), f"downside={upside:.0%}", FAMILY)
    return _abstain("analyst_upside", "fair value")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/agents.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): squeeze, growth, analyst agents"
```

---

## Task 6: Meta-score aggregation

**Files:**
- Create: `argus/argus/catalyst/score.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_meta_score_abstain_renorm()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.catalyst.score'`

- [ ] **Step 3: Implement `meta_score` in `score.py`**

Create `argus/argus/catalyst/score.py`:

```python
from __future__ import annotations

from argus.agents.base import Vote, Verdict

INTRA_WEIGHTS = {
    "event_catalyst": 0.40,
    "squeeze_setup": 0.20,
    "earnings_proximity": 0.15,
    "growth_profitability": 0.15,
    "analyst_upside": 0.10,
}


def meta_score(votes: list[Vote]) -> float | None:
    """Signed-confidence weighted average over non-abstaining votes; None if all abstain."""
    total_w = 0.0
    acc = 0.0
    for v in votes:
        if v.verdict == Verdict.WAIT or v.confidence <= 0:
            continue
        w = INTRA_WEIGHTS.get(v.agent, 0.0)
        if w == 0:
            continue
        signed = v.confidence if v.verdict == Verdict.LONG else -v.confidence
        acc += w * signed
        total_w += w
    if total_w == 0:
        return None
    return max(-1.0, min(1.0, acc / total_w))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/score.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): meta-score aggregation with abstain renormalization"
```

---

## Task 7: Gate evaluation

**Files:**
- Modify: `argus/argus/catalyst/score.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_evaluate_gates()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ImportError: cannot import name 'evaluate_gates'`

- [ ] **Step 3: Append `evaluate_gates` to `score.py`**

Append to `argus/argus/catalyst/score.py`:

```python
from .types import CatalystEvent  # noqa: E402

GATE_RECENCY_DAYS = 30.0
HARD_POSITIVE = frozenset({"fda", "acquisition", "contract"})
EARNINGS_FLAG_DAYS = 14


def evaluate_gates(events: list[CatalystEvent], metrics: dict) -> tuple[list[str], list[str]]:
    """Return (gate_codes, display_flags). Evaluated worst-first; veto beats derank beats boost."""
    gates: list[str] = []
    flags: list[str] = []
    fresh = [e for e in events if e.recency_days <= GATE_RECENCY_DAYS]

    if any(e.type in {"going_concern", "reverse_split"} for e in fresh):
        gates.append("veto")
        flags.append("⛔ STRUCTURAL")
    if any(e.type in {"dilution", "offering"} for e in fresh):
        gates.append("derank")
        flags.append("⚠ DILUTION")
    if "veto" not in gates and "derank" not in gates and any(
        e.type in HARD_POSITIVE and e.direction > 0 and e.confidence >= 0.6 for e in fresh
    ):
        gates.append("boost")
        flags.append("⚡")

    d = metrics.get("days_to_earnings")
    if d is not None and 0 <= d <= EARNINGS_FLAG_DAYS:
        flags.append(f"earnings≤{EARNINGS_FLAG_DAYS}d")
    return gates, flags
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/score.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): hard gate evaluation"
```

---

## Task 8: IBKR historical news helper

**Files:**
- Modify: `argus/argus/data/ibkr.py` (add method to the existing `IBKRClient` class)
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

This test uses a fake client object to exercise the parsing logic without IBKR. It calls the module-level helper `parse_news_headlines` that the method delegates to.

```python
def test_parse_news_headlines():
    from argus.data.ibkr import parse_news_headlines
    class _Item:
        def __init__(self, h): self.headline = h
    items = [_Item("AAA: FDA approval granted"), _Item("BBB: prices offering")]
    out = parse_news_headlines(items)
    assert out == ["AAA: FDA approval granted", "BBB: prices offering"]
    assert parse_news_headlines(None) == []
    assert parse_news_headlines([object()]) == []  # missing .headline -> skipped
```

Add to `main()`: `test_parse_news_headlines()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ImportError: cannot import name 'parse_news_headlines'`

- [ ] **Step 3: Add helper + method to `ibkr.py`**

Add this module-level function near the top of `argus/argus/data/ibkr.py` (after imports):

```python
def parse_news_headlines(items) -> list[str]:
    """Extract plain headline strings from IBKR historical-news rows; tolerant of junk."""
    out: list[str] = []
    for it in (items or []):
        headline = getattr(it, "headline", None)
        if isinstance(headline, str) and headline.strip():
            out.append(headline.strip())
    return out
```

Add this method to the `IBKRClient` class (alongside `fundamentals`):

```python
    def historical_news(self, symbol: str, total: int = 10) -> list[str]:
        """Best-effort recent news headlines for a symbol. Returns [] on any failure
        or if no news-provider subscription is available."""
        try:
            self.connect()
            from ib_insync import Stock
            contract = Stock(symbol, "SMART", "USD")
            self.ib.qualifyContracts(contract)
            provider_codes = "+".join(p.code for p in self.ib.reqNewsProviders())
            if not provider_codes:
                return []
            items = self.ib.reqHistoricalNews(contract.conId, provider_codes, "", "", total)
            return parse_news_headlines(items)
        except Exception:
            return []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/data/ibkr.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): IBKR historical_news helper (best-effort)"
```

---

## Task 9: Pool gathering (sources.py)

**Files:**
- Create: `argus/argus/catalyst/sources.py`
- Test: `argus/tests/test_catalyst.py`

`gather_pool` normalizes yfinance `.info` + IBKR fundamentals into `pool.metrics`, pulls news text, and reads chatter tags from a setups row. yfinance and IBKR are injected for testing.

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_gather_pool_normalizes_metrics(); test_gather_pool_best_effort_on_failure()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.catalyst.sources'`

- [ ] **Step 3: Implement `sources.py`**

Create `argus/argus/catalyst/sources.py`:

```python
from __future__ import annotations

from .types import CatalystPool


def _default_yf_info(ticker: str) -> dict:
    import yfinance as yf
    return yf.Ticker(ticker).info or {}


def _default_yf_news(ticker: str) -> list[str]:
    import yfinance as yf
    out: list[str] = []
    for item in (yf.Ticker(ticker).news or []):
        title = item.get("title") or item.get("content", {}).get("title")
        if isinstance(title, str) and title.strip():
            out.append(title.strip())
    return out


def _chatter_tags(setups_row) -> list[str]:
    if not setups_row:
        return []
    raw = setups_row.get("catalysts") or ""
    return [t for t in str(raw).replace(",", ";").split(";") if t.strip()]


def _safe(fn, ticker, default):
    try:
        return fn(ticker)
    except Exception:
        return default


def _metrics_from_yf(info: dict) -> dict:
    m: dict = {}
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if price:
        m["price"] = float(price)
    if info.get("marketCap"):
        m["market_cap"] = float(info["marketCap"])
    spf = info.get("shortPercentOfFloat")
    if spf is not None:
        m["short_pct_float"] = float(spf) * 100.0   # yfinance gives a fraction
    if info.get("revenueGrowth") is not None:
        m["revenue_growth"] = float(info["revenueGrowth"])
    if info.get("profitMargins") is not None:
        m["profit_margin"] = float(info["profitMargins"])
    if info.get("targetMeanPrice"):
        m["analyst_target"] = float(info["targetMeanPrice"])
    if info.get("recommendationKey"):
        m["analyst_rating"] = str(info["recommendationKey"])
    return m


def gather_pool(
    ticker: str,
    setups_row=None,
    *,
    ibkr=None,
    yf_info_fn=_default_yf_info,
    yf_news_fn=_default_yf_news,
) -> CatalystPool:
    """Pool free catalyst/fundamental data for one ticker. All sources best-effort."""
    info = _safe(yf_info_fn, ticker, {})
    news = list(_safe(yf_news_fn, ticker, []))
    metrics = _metrics_from_yf(info) if info else {}

    if ibkr is not None:
        fund = _safe(lambda t: ibkr.fundamentals(t), ticker, {}) or {}
        # IBKR enriches/overrides where present
        if fund.get("market_cap"):
            metrics["market_cap"] = float(fund["market_cap"])
        if fund.get("short_pct_float") is not None:
            metrics["short_pct_float"] = float(fund["short_pct_float"])
        if fund.get("dtc") is not None:
            metrics["dtc"] = float(fund["dtc"])
        if fund.get("days_to_earnings") is not None:
            metrics["days_to_earnings"] = float(fund["days_to_earnings"])
        if fund.get("analyst_target"):
            metrics["analyst_target"] = float(fund["analyst_target"])
        if fund.get("analyst_rating"):
            metrics["analyst_rating"] = str(fund["analyst_rating"])
        news += _safe(lambda t: ibkr.historical_news(t), ticker, [])

    # dedupe news preserving order
    seen: set[str] = set()
    news_unique = [n for n in news if not (n in seen or seen.add(n))]

    return CatalystPool(
        ticker=ticker,
        chatter_tags=_chatter_tags(setups_row),
        news_texts=news_unique,
        metrics=metrics,
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/sources.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): pool gathering from yfinance + IBKR + chatter"
```

---

## Task 10: `catalyst_leg` orchestrator + package export

**Files:**
- Modify: `argus/argus/catalyst/score.py`
- Modify: `argus/argus/catalyst/__init__.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

```python
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
```

Add to `main()`: `test_catalyst_leg_orchestrates(); test_catalyst_leg_empty_pool_returns_none()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `ImportError: cannot import name 'catalyst_leg'`

- [ ] **Step 3: Add `catalyst_leg` to `score.py` and export it**

Append to `argus/argus/catalyst/score.py`:

```python
from .agents import (  # noqa: E402
    event_catalyst_vote, earnings_proximity_vote, squeeze_setup_vote,
    growth_profitability_vote, analyst_upside_vote,
)
from .classify import classify_events  # noqa: E402
from .sources import gather_pool        # noqa: E402
from .types import CatalystPool, CatalystResult  # noqa: E402


def catalyst_leg(
    ticker: str,
    *,
    setups_row=None,
    ibkr=None,
    pool: CatalystPool | None = None,
    classify=None,
    api_key: str = "",
) -> CatalystResult:
    """Full catalyst leg for one ticker. Inject `pool`/`classify` for offline tests."""
    if pool is None:
        pool = gather_pool(ticker, setups_row, ibkr=ibkr)
    if pool.is_empty():
        return CatalystResult(score=None)
    if classify is None:
        classify = lambda p: classify_events(p, api_key=api_key)  # noqa: E731
    events = classify(pool)
    votes = [
        event_catalyst_vote(pool, events),
        earnings_proximity_vote(pool, events),
        squeeze_setup_vote(pool, events),
        growth_profitability_vote(pool, events),
        analyst_upside_vote(pool, events),
    ]
    score = meta_score(votes)
    gates, flags = evaluate_gates(events, pool.metrics)
    return CatalystResult(score=score, votes=votes, events=events, gates=gates, flags=flags)
```

Update `argus/argus/catalyst/__init__.py`:

```python
"""Catalyst / fundamental third leg for the sentiment×technical bridge."""
from .types import CatalystEvent, CatalystPool, CatalystResult
from .score import catalyst_leg, INTRA_WEIGHTS

__all__ = ["CatalystEvent", "CatalystPool", "CatalystResult", "catalyst_leg", "INTRA_WEIGHTS"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add argus/argus/catalyst/score.py argus/argus/catalyst/__init__.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): catalyst_leg orchestrator + package export"
```

---

## Task 11: Bridge integration

Add pure helpers `blend_legs` and `apply_gates` to `sentiment_bridge.py`, test them, then wire the leg into per-ticker scoring and the output rows.

**Files:**
- Modify: `sentiment_bridge.py`
- Test: `argus/tests/test_catalyst.py`

- [ ] **Step 1: Write the failing test** (append; add calls in `main()`)

The test imports `sentiment_bridge` from the repo root (one level above `argus/`).

```python
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
```

Add to `main()`: `test_blend_and_gates()`

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: FAIL — `AttributeError: module 'sentiment_bridge' has no attribute 'blend_legs'`

- [ ] **Step 3: Edit weights + add helpers in `sentiment_bridge.py`**

Change the existing weight constants (currently `SENTIMENT_WEIGHT = 0.40`, `TECHNICAL_WEIGHT = 0.60` at lines 40–41):

```python
SENTIMENT_WEIGHT = 0.35
TECHNICAL_WEIGHT = 0.45
CATALYST_WEIGHT  = 0.20
BOOST_DELTA      = 0.10
```

Add these pure helpers near the weight constants:

```python
def blend_legs(sentiment_score, tech_score, catalyst_score):
    """Weighted blend over the legs that are present; renormalize weights when one is None."""
    legs = [(SENTIMENT_WEIGHT, sentiment_score),
            (TECHNICAL_WEIGHT, tech_score),
            (CATALYST_WEIGHT, catalyst_score)]
    present = [(w, s) for w, s in legs if s is not None]
    total_w = sum(w for w, _ in present)
    if total_w == 0:
        return 0.0
    return sum(w * s for w, s in present) / total_w


def apply_gates(combined, gates):
    """Apply catalyst hard gates to a blended score."""
    if "veto" in gates or "derank" in gates:
        return min(combined, 0.0)
    if "boost" in gates and combined > 0:
        return min(1.0, combined + BOOST_DELTA)
    return combined
```

- [ ] **Step 4: Run test to verify it passes**

Run: `/Users/josephstorey/Market_Analyse/argus/.venv/bin/python tests/test_catalyst.py`
Expected: PASS — prints `OK test_catalyst`

- [ ] **Step 5: Wire the leg into per-ticker scoring**

In `sentiment_bridge.py`, add the import near the top (after the existing argus imports):

```python
from argus.catalyst import catalyst_leg
from argus.settings import settings
```

Replace the existing combine line (currently `combined = SENTIMENT_WEIGHT * sentiment_score + TECHNICAL_WEIGHT * tech_score`, ~line 98) with:

```python
    cat = catalyst_leg(
        ticker, setups_row=row, ibkr=_catalyst_ibkr(),
        api_key=settings.anthropic_api_key,
    )
    catalyst_score = cat.score
    combined = blend_legs(sentiment_score, tech_score, catalyst_score)
    combined = apply_gates(combined, cat.gates)
```

Add this helper near the other helpers (lazy IBKR; never breaks the run if IBKR is offline):

```python
def _catalyst_ibkr():
    try:
        from argus.data.ibkr import IBKRClient
        return IBKRClient.instance()
    except Exception:
        return None
```

- [ ] **Step 6: Add catalyst fields to the output row**

In the dict that becomes the report/CSV row (the block building `"combined_score": round(combined, 3)`, ~line 151), add:

```python
        "catalyst_score":  round(catalyst_score, 3) if catalyst_score is not None else "",
        "catalysts":       ", ".join(sorted({f"{e.type}{'+' if e.direction > 0 else '-'}"
                                              for e in cat.events})) or "",
        "gate_flags":      " ".join(cat.flags),
```

- [ ] **Step 7: Run the existing offline Argus test to confirm nothing regressed**

Run: `cd /Users/josephstorey/Market_Analyse/argus && .venv/bin/python tests/test_catalyst.py`
Expected: PASS — `OK test_catalyst`

- [ ] **Step 8: Commit**

```bash
cd /Users/josephstorey/Market_Analyse
git add sentiment_bridge.py argus/tests/test_catalyst.py
git commit -m "feat(catalyst): blend as third leg + gates in sentiment_bridge"
```

---

## Task 12: End-to-end live smoke + publish

**Files:** none (verification only)

- [ ] **Step 1: Run the bridge on today's setups with catalyst leg active**

```bash
cd /Users/josephstorey/Market_Analyse/argus
MARKET_REVIEW_REPORT="/Users/josephstorey/Market_Review/reports/ticker_setups.csv" \
.venv/bin/python ../sentiment_bridge.py \
    --min-quality 5 --include-late-chase \
    --extra-tickers "SMR,CCJ,UEC,OKLO,IONQ,RKLB,ASTS" \
    --out ../reports/ 2>&1 | tail -30
```
Expected: completes; report prints with no traceback. Some tickers show `catalyst_score` and `gate_flags`; names with no data show blank catalyst (renormalized blend, no crash).

- [ ] **Step 2: Confirm catalyst columns are present in output**

Run: `grep -i "catalyst" /Users/josephstorey/Market_Analyse/reports/bridge_latest.md | head`
Expected: catalyst score / flags visible in the report.

- [ ] **Step 3: Confirm the full offline test suite still passes**

Run: `cd /Users/josephstorey/Market_Analyse/argus && .venv/bin/python tests/test_catalyst.py`
Expected: PASS — `OK test_catalyst`

- [ ] **Step 4: Commit any report artifacts if desired (optional)**

```bash
cd /Users/josephstorey/Market_Analyse
git add -A && git commit -m "chore(catalyst): end-to-end smoke run" || echo "nothing to commit"
```

---

## Self-review notes

- **Spec coverage:** §3 data flow → Tasks 9/10; §5 sub-agents → Tasks 4/5; §6 Claude classify → Task 3; §7 gates → Task 7; §8 bridge weights/renorm/gates → Task 11; §9 report columns → Task 11 Step 6; §10 resilience (best-effort sources, empty-pool None, Claude fallback) → Tasks 3/9/10; §11 testing → every task. IBKR news (§4) → Task 8.
- **Deferred per spec:** per-day on-disk cache (§10) is intentionally omitted from v1 — the leg is idempotent and the daily volume is ~22 tickers; add later if Claude/news latency matters. Insider/institutional agents deferred per spec §14.
- **Type consistency:** `Vote(agent, verdict, confidence, note, family)` used everywhere; `CatalystPool.metrics` keys (`price`, `market_cap`, `short_pct_float`, `dtc`, `days_to_earnings`, `revenue_growth`, `profit_margin`, `analyst_target`, `analyst_rating`) consistent across `sources.py` and `agents.py`; gate codes `veto`/`derank`/`boost` consistent across `score.py` and `sentiment_bridge.apply_gates`.
