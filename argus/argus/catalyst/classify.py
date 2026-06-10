from __future__ import annotations

import re
import time

from .types import CatalystEvent, CatalystPool


def _ts_to_recency(ts: float | None, now: float) -> float:
    """Convert a Unix publish timestamp to days-ago float. Returns 3.0 if unknown."""
    if ts is None:
        return 3.0
    days = (now - ts) / 86400.0
    return max(0.0, round(days, 1))

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
            detail=str(item.get("source_snippet", "") or ""),
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
        now = time.time()
        headline_lines = []
        for i, t in enumerate(pool.news_texts[:_NEWS_CAP]):
            ts = pool.news_timestamps[i] if i < len(pool.news_timestamps) else None
            age = f"{int(_ts_to_recency(ts, now))}d ago" if ts else "age unknown"
            headline_lines.append(f"- [{age}] {t}")
        headlines = "\n".join(headline_lines)
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


def keyword_fallback(pool: CatalystPool, *, recency_days: float = 3.0) -> list[CatalystEvent]:
    """Deterministic keyword classification over pooled news + chatter tags."""
    now = time.time()
    events: list[CatalystEvent] = []
    seen: set[str] = set()
    for ctype, pattern in _PATTERNS:
        if ctype in seen:
            continue
        for i, headline in enumerate(pool.news_texts):
            if re.search(pattern, headline.lower()):
                ts = pool.news_timestamps[i] if i < len(pool.news_timestamps) else None
                actual_recency = _ts_to_recency(ts, now) if ts else recency_days
                events.append(CatalystEvent(
                    type=ctype, direction=_DIRECTION.get(ctype, 0),
                    recency_days=actual_recency, confidence=0.6, source="chatter",
                    detail=headline[:120],
                ))
                seen.add(ctype)
                break
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
