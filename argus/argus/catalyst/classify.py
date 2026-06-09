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
