from __future__ import annotations

import math

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
    # tanh normalises growth: 50%→0.46, 100%→0.76, 200%→0.96 — prevents raw rg>1 overflow
    rg_score = math.tanh(rg) if rg is not None else 0.0
    # margin adds up to 0.5 bonus; pm is already a fraction so _clamp keeps it in [0,1]
    pm_score = _clamp(pm) * 0.5 if (pm is not None and pm > 0) else 0.0
    score = rg_score + pm_score
    if score <= 0:
        return _abstain("growth_profitability", "no growth")
    return Vote("growth_profitability", Verdict.LONG, _clamp(score), f"rev_g={rg:.2f} margin={pm:.3f}", FAMILY)


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
