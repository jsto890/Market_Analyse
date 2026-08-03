"""Per-tick orchestration: quotes → analytics → LadderSnapshot."""

from typing import Optional, Dict, Tuple
from datetime import datetime, timezone
import logging

from .config import LiveConfig
from .models import LadderSnapshot, StrikeLevelSnapshot, OptionQuote
from .iv_surface import IVSurface
from .exposures import compute_exposures, compute_net_gex
from .msi_mtc import select_msi_mtc
from .levels import (
    compute_zero_gamma, compute_max_pain, compute_pin_risk, compute_walls
)
from .quotes import ticker_to_quote

logger = logging.getLogger(__name__)


def run_analytics(
    quotes: Dict[float, Tuple],  # {strike: (call_ticker_dict, put_ticker_dict), ...}
    spot: float,
    expiry: str,
    config: LiveConfig,
    symbol: str = "SPY",
    source: str = "LIVE",
    iv_residual_history: Optional[list] = None,
) -> LadderSnapshot:
    """Execute full analytics pipeline.

    Per-tick orchestration:
    1. Convert ticker dicts to OptionQuote objects
    2. Compute exposures (call_gex, put_gex, etc.)
    3. Fit IV surface
    4. Compute levels (zero-gamma, walls, max pain, pin risk)
    5. Compute MSI/MTC
    6. Build StrikeLevelSnapshot rows
    7. Return LadderSnapshot with all summary + levels

    Args:
        quotes: {strike: (call_ticker_dict, put_ticker_dict)}
        spot: Current spot price
        expiry: Expiry string (e.g., "0DTE", "2026-08-15")
        config: LiveConfig
        symbol: Symbol being analyzed (default "SPY")
        source: "LIVE", "FROZEN", or "EOD"
        iv_residual_history: Prior IV residuals for smile fit

    Returns:
        LadderSnapshot with full ladder + summary
    """
    as_of = datetime.now(timezone.utc)

    # Step 1: Convert to OptionQuote objects
    option_quotes = {}
    for strike, (call_dict, put_dict) in quotes.items():
        option_quotes[strike] = (
            ticker_to_quote(call_dict) if call_dict else OptionQuote(),
            ticker_to_quote(put_dict) if put_dict else OptionQuote(),
        )

    # Step 2: Compute exposures
    exposures = compute_exposures(option_quotes, spot, multiplier=100)
    call_gex = exposures["call_gex_by_strike"]
    put_gex = exposures["put_gex_by_strike"]

    # Step 3: IV surface fit
    iv_surface = None
    liquid_strikes = [
        s for s, (c, p) in option_quotes.items()
        if c.liquid or p.liquid
    ]
    if len(liquid_strikes) >= 8:
        # Collect IV from liquid contracts
        call_ivs = []
        for s in liquid_strikes:
            c, p = option_quotes[s]
            if c.iv:
                call_ivs.append(c.iv)
            elif p.iv:
                call_ivs.append(p.iv)

        if len(call_ivs) >= 8:
            try:
                iv_surface = IVSurface.fit(liquid_strikes, call_ivs, spot=spot)
            except Exception as e:
                logger.warning(f"IV surface fit failed: {e}")
                iv_surface = None

    # Step 4: Compute levels
    zero_gamma_strike = compute_zero_gamma(call_gex, put_gex, spot)

    call_oi = {s: (option_quotes[s][0].oi or 0) for s in option_quotes}
    put_oi = {s: (option_quotes[s][1].oi or 0) for s in option_quotes}
    max_pain = compute_max_pain(call_oi, put_oi, strikes=list(option_quotes.keys()))

    pin_risk = compute_pin_risk(call_gex, put_gex, spot, window_side=config.strike_window_side // 2)
    call_wall_strike, put_wall_strike, wall_type = compute_walls(call_gex, put_gex, spot)

    # Step 5: MSI/MTC
    msi_call_strike, msi_put_strike, msi_rationale = select_msi_mtc(call_gex, put_gex, spot)

    # Step 6: Net GEX
    net_gex_band = compute_net_gex(call_gex, put_gex)

    # Step 7: Build levels (per-strike rows)
    levels = []
    for strike in sorted(option_quotes.keys()):
        call_quote, put_quote = option_quotes[strike]

        # Determine zero-gamma side at this strike
        zero_gamma_side = None
        if zero_gamma_strike == strike:
            zero_gamma_side = "both"

        # Determine wall type at this strike
        level_wall_type = None
        if strike == call_wall_strike and strike == put_wall_strike:
            level_wall_type = "both"
        elif strike == call_wall_strike:
            level_wall_type = "call"
        elif strike == put_wall_strike:
            level_wall_type = "put"

        levels.append(StrikeLevelSnapshot(
            strike=strike,
            call=call_quote,
            put=put_quote,
            zero_gamma_side=zero_gamma_side,
            wall_type=level_wall_type,
            gex_by_strike=call_gex.get(strike, 0) + put_gex.get(strike, 0),
            call_gex_by_strike=call_gex.get(strike, 0),
            put_gex_by_strike=put_gex.get(strike, 0),
            max_pain_delta=1.0 if strike == max_pain else 0.0,
        ))

    # ATM strike
    if option_quotes:
        atm_strike = min(option_quotes.keys(), key=lambda s: abs(s - spot))
    else:
        atm_strike = spot

    # Fresh contract ratio: fraction of strikes with complete greeks
    total_strikes = len(option_quotes)
    fresh_strikes = sum(
        1 for s, (c, p) in option_quotes.items()
        if (c.iv and c.delta and c.gamma) or (p.iv and p.delta and p.gamma)
    )
    fresh_contract_ratio = fresh_strikes / total_strikes if total_strikes > 0 else 0

    # Stale time: max staleness across all contracts
    max_stale_ms = max(
        ((c.stale_ms or 0) for _, (c, p) in option_quotes.items()),
        default=0
    )
    max_stale_ms = max(max_stale_ms, max(((p.stale_ms or 0) for _, (c, p) in option_quotes.items()), default=0))

    # Step 8: Build and return LadderSnapshot
    return LadderSnapshot(
        symbol=symbol,
        spot=spot,
        as_of=as_of,
        source=source,
        stale_ms=max_stale_ms,
        fresh_contract_ratio=fresh_contract_ratio,
        expiry=expiry,
        levels=levels,
        atm_strike=atm_strike,
        zero_gamma_strike=zero_gamma_strike,
        call_wall_strike=call_wall_strike,
        put_wall_strike=put_wall_strike,
        max_pain=max_pain,
        pin_risk=pin_risk,
        net_gex_band=net_gex_band,
        msi_call_strike=msi_call_strike,
        msi_put_strike=msi_put_strike,
        msi_rationale=msi_rationale,
    )
