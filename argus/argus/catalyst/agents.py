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
