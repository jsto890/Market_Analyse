"""Data models for live options ladder."""

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class OptionQuote:
    """Per-contract option quote."""
    bid: Optional[float] = None
    ask: Optional[float] = None
    mid: Optional[float] = None
    spread_pct: Optional[float] = None  # (ask - bid) / mid * 100
    iv: Optional[float] = None  # Implied vol
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    rho: Optional[float] = None
    per_dollar_gamma: Optional[float] = None  # gamma * spot
    per_dollar_delta: Optional[float] = None
    volume: Optional[int] = None  # Trade volume today
    oi: Optional[int] = None  # Open interest
    stale_ms: int = 0  # Age of data in ms
    liquid: bool = False  # Enough volume & OI for smile fit


@dataclass
class Quote:
    """Stock/underlying quote."""
    bid: Optional[float] = None
    ask: Optional[float] = None
    mid: Optional[float] = None
    spread_pct: Optional[float] = None
    volume: Optional[int] = None
    last: Optional[float] = None
    stale_ms: int = 0


class LadderSnapshot:
    """Snapshot of an options ladder at a point in time."""
    pass
