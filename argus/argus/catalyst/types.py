from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CatalystEvent:
    type: str            # one of classify.ALL_TYPES
    direction: int       # +1 bullish, 0 neutral, -1 bearish
    recency_days: float  # days since the event/headline
    confidence: float    # 0..1
    source: str = ""     # "news" | "chatter" | "claude"
    detail: str = ""     # quoted text or matched headline
    dated: bool = True   # False when recency_days is a fallback guess, not a real timestamp


@dataclass
class CatalystPool:
    ticker: str
    chatter_tags: list = field(default_factory=list)    # list[str] from ticker_setups.csv
    news_texts: list = field(default_factory=list)       # list[str] headlines/snippets
    news_timestamps: list = field(default_factory=list)  # list[float|None] Unix timestamps parallel to news_texts
    metrics: dict = field(default_factory=dict)          # normalized numeric fundamentals

    def is_empty(self) -> bool:
        return not (self.chatter_tags or self.news_texts or self.metrics)


@dataclass
class CatalystResult:
    score: float | None                                 # -1..+1, or None if all legs abstain
    votes: list = field(default_factory=list)           # list[Vote]
    events: list = field(default_factory=list)          # list[CatalystEvent]
    gates: list = field(default_factory=list)           # machine codes: veto/derank/boost
    flags: list = field(default_factory=list)           # display flags: ⚡ / ⚠ DILUTION / ...
    metrics: dict = field(default_factory=dict)         # fundamentals from CatalystPool
