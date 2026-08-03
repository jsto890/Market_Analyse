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


@dataclass
class StrikeLevelSnapshot:
    """Per-strike row in ladder."""
    strike: float
    call: OptionQuote
    put: OptionQuote
    zero_gamma_side: Optional[str] = None  # "C", "P", "both", or None
    wall_type: Optional[str] = None  # "none", "call", "put", "both"
    gex_by_strike: Optional[float] = None  # $ GEX exposure at this strike (call + put)
    call_gex_by_strike: Optional[float] = None  # $ GEX exposure from calls only
    put_gex_by_strike: Optional[float] = None  # $ GEX exposure from puts only
    max_pain_delta: Optional[float] = None  # Contribution to max pain calculation


@dataclass
class LadderSnapshot:
    """Full ladder for one symbol at one instant."""
    symbol: str
    spot: float
    as_of: Any  # datetime.datetime
    source: str  # "LIVE", "FROZEN", "EOD"
    stale_ms: int
    fresh_contract_ratio: float  # Fraction of contracts with non-null greeks
    expiry: str  # "0DTE", "1DTE", etc. or ISO format

    # Per-strike rows
    levels: list = None  # list[StrikeLevelSnapshot]

    # Summary analytics
    atm_strike: float = 0
    zero_gamma_strike: Optional[float] = None
    call_wall_strike: Optional[float] = None
    put_wall_strike: Optional[float] = None
    max_pain: Optional[float] = None
    pin_risk: Optional[float] = None  # 0-100 scale
    net_gex_band: Optional[str] = None  # "bullish", "bearish", "neutral"
    msi_call_strike: Optional[float] = None
    msi_put_strike: Optional[float] = None
    msi_rationale: Optional[str] = None


    def __post_init__(self):
        """Initialize levels list if not provided."""
        if self.levels is None:
            self.levels = []
