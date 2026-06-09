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
