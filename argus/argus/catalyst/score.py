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
