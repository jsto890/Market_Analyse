"""Compute dealer gamma (GEX), vega (VEX), and delta (DEX) exposures."""

from typing import Optional
from .models import OptionQuote


# Dealer sign convention: assumed long calls, short puts
DEALER_SIGN = {"C": -1.0, "P": +1.0}


def compute_gex(
    option: OptionQuote,
    option_type: str,
    spot: float,
    multiplier: float = 100,
) -> float:
    """Compute gamma exposure ($) for a single contract.

    Gamma exposure = dealer_sign * gamma * OI * spot * multiplier

    Args:
        option: OptionQuote with gamma and oi fields
        option_type: "C" for call, "P" for put
        spot: Current stock/underlying price
        multiplier: Contract multiplier (100 for stock options)

    Returns:
        Gamma exposure in dollars (signed)
    """
    if option.gamma is None or option.oi is None or option.oi == 0:
        return 0.0

    dealer_sign = DEALER_SIGN.get(option_type, 0.0)
    return dealer_sign * option.gamma * option.oi * spot * multiplier


def compute_vex(
    option: OptionQuote,
    option_type: str,
    spot: float,
    multiplier: float = 100,
) -> float:
    """Compute vega exposure ($) for a single contract.

    Vega exposure = dealer_sign * vega * OI * spot * multiplier / 100
    (vega is per 1% IV change, so divide by 100 to get per-point vol)

    Args:
        option: OptionQuote with vega and oi fields
        option_type: "C" for call, "P" for put
        spot: Current stock/underlying price
        multiplier: Contract multiplier (100 for stock options)

    Returns:
        Vega exposure in dollars (signed)
    """
    if option.vega is None or option.oi is None or option.oi == 0:
        return 0.0

    dealer_sign = DEALER_SIGN.get(option_type, 0.0)
    return dealer_sign * option.vega * option.oi * spot * multiplier / 100.0


def compute_dex(
    option: OptionQuote,
    option_type: str,
    spot: float,
    multiplier: float = 100,
) -> float:
    """Compute delta exposure ($) for a single contract.

    Delta exposure = dealer_sign * delta * OI * spot * multiplier

    Args:
        option: OptionQuote with delta and oi fields
        option_type: "C" for call, "P" for put
        spot: Current stock/underlying price
        multiplier: Contract multiplier (100 for stock options)

    Returns:
        Delta exposure in dollars (signed)
    """
    if option.delta is None or option.oi is None or option.oi == 0:
        return 0.0

    dealer_sign = DEALER_SIGN.get(option_type, 0.0)
    return dealer_sign * option.delta * option.oi * spot * multiplier


def compute_exposures(
    quotes: dict,
    spot: float,
    multiplier: float = 100,
) -> dict:
    """Compute GEX, VEX, DEX per strike.

    Args:
        quotes: Dict mapping strike -> (call_OptionQuote, put_OptionQuote)
        spot: Current underlying price
        multiplier: Contract multiplier (100 for stock options)

    Returns:
        Dict with keys:
        - call_gex_by_strike: {strike: gex_$}
        - put_gex_by_strike: {strike: gex_$}
        - call_vex_by_strike: {strike: vex_$}
        - put_vex_by_strike: {strike: vex_$}
        - call_dex_by_strike: {strike: dex_$}
        - put_dex_by_strike: {strike: dex_$}
    """
    call_gex = {}
    put_gex = {}
    call_vex = {}
    put_vex = {}
    call_dex = {}
    put_dex = {}

    for strike, (call_opt, put_opt) in quotes.items():
        # Compute call exposures
        if call_opt is not None:
            call_gex[strike] = compute_gex(call_opt, "C", spot, multiplier)
            call_vex[strike] = compute_vex(call_opt, "C", spot, multiplier)
            call_dex[strike] = compute_dex(call_opt, "C", spot, multiplier)
        else:
            call_gex[strike] = 0.0
            call_vex[strike] = 0.0
            call_dex[strike] = 0.0

        # Compute put exposures
        if put_opt is not None:
            put_gex[strike] = compute_gex(put_opt, "P", spot, multiplier)
            put_vex[strike] = compute_vex(put_opt, "P", spot, multiplier)
            put_dex[strike] = compute_dex(put_opt, "P", spot, multiplier)
        else:
            put_gex[strike] = 0.0
            put_vex[strike] = 0.0
            put_dex[strike] = 0.0

    return {
        "call_gex_by_strike": call_gex,
        "put_gex_by_strike": put_gex,
        "call_vex_by_strike": call_vex,
        "put_vex_by_strike": put_vex,
        "call_dex_by_strike": call_dex,
        "put_dex_by_strike": put_dex,
    }


def compute_net_gex(
    call_gex: dict,
    put_gex: dict,
    neutral_threshold: float = 0.01,
) -> Optional[str]:
    """Classify net dealer GEX sentiment.

    Args:
        call_gex: Dict of {strike: gex_$} for calls
        put_gex: Dict of {strike: gex_$} for puts
        neutral_threshold: Threshold for "neutral" (as fraction of max exposure)

    Returns:
        "bullish" if total_gex > 0
        "bearish" if total_gex < 0
        "neutral" if abs(total_gex) is small
        None if no data
    """
    total_call_gex = sum(call_gex.values()) if call_gex else 0.0
    total_put_gex = sum(put_gex.values()) if put_gex else 0.0
    total_gex = total_call_gex + total_put_gex

    if not call_gex and not put_gex:
        return None

    # Compute magnitude for neutral threshold
    max_exposure = max(
        abs(total_call_gex),
        abs(total_put_gex),
        1.0,  # Avoid division by zero
    )

    if abs(total_gex) < neutral_threshold * max_exposure:
        return "neutral"
    elif total_gex > 0:
        return "bullish"
    else:
        return "bearish"
