"""Options ladder levels: zero-gamma, walls, max pain, pin risk."""

from typing import Optional, Tuple


def compute_zero_gamma(
    call_gex: dict,
    put_gex: dict,
    spot: float,
) -> Optional[float]:
    """Find strike where net GEX (call + put) is closest to zero.

    Args:
        call_gex: {strike: gamma_$} for calls
        put_gex: {strike: gamma_$} for puts
        spot: Current underlying price

    Returns:
        Strike with min(|call_gex[s] + put_gex[s]|), or None if no data
    """
    if not call_gex and not put_gex:
        return None

    # Collect all strikes and compute net GEX
    all_strikes = set(call_gex.keys()) | set(put_gex.keys())
    net_gex = {}

    for strike in all_strikes:
        c_gex = call_gex.get(strike, 0.0)
        p_gex = put_gex.get(strike, 0.0)
        net_gex[strike] = c_gex + p_gex

    # Find strike with minimum absolute net GEX
    zero_gamma_strike = min(net_gex.keys(), key=lambda k: abs(net_gex[k]))
    return zero_gamma_strike


def compute_max_pain(
    call_oi: dict,
    put_oi: dict,
    strikes: list,
    spot: Optional[float] = None,
) -> Optional[float]:
    """Find max pain: strike where total $ value expiring worthless is maximized.

    For each candidate strike K:
        max_pain_$ = Σ_calls OI(c) * max(0, K - k) + Σ_puts OI(p) * max(0, k - K)

    Args:
        call_oi: {strike: OI count} for calls
        put_oi: {strike: OI count} for puts
        strikes: List of candidate strikes to evaluate
        spot: Current spot price (unused, for future filtering)

    Returns:
        Strike K that maximizes total worthless value, or None if no data
    """
    if not strikes or (not call_oi and not put_oi):
        return None

    max_pain_value = -1.0
    max_pain_strike = None

    for candidate_k in strikes:
        # Calculate $ value expiring worthless at strike K
        worthless = 0.0

        # Call value expiring worthless: if K < call strike, all value lost
        for call_strike, oi_count in call_oi.items():
            if oi_count > 0:
                # Max loss occurs if stock closes below strike
                loss = max(0.0, candidate_k - call_strike)
                worthless += oi_count * loss

        # Put value expiring worthless: if K > put strike, all value lost
        for put_strike, oi_count in put_oi.items():
            if oi_count > 0:
                # Max loss occurs if stock closes above strike
                loss = max(0.0, put_strike - candidate_k)
                worthless += oi_count * loss

        # Track the strike that maximizes worthless value
        if worthless > max_pain_value:
            max_pain_value = worthless
            max_pain_strike = candidate_k

    return max_pain_strike


def compute_pin_risk(
    call_gex: dict,
    put_gex: dict,
    spot: float,
    window_side: int = 3,
) -> float:
    """Compute pin risk: gamma concentration at nearest strike (0-100 scale).

    Pin risk reflects the concentration of GEX at the nearest strike,
    attenuated by distance from spot. High values indicate potential pinning
    (gamma squeeze around a specific strike).

    Args:
        call_gex: {strike: gamma_$} for calls
        put_gex: {strike: gamma_$} for puts
        spot: Current underlying price
        window_side: Number of strikes on each side to consider

    Returns:
        Pin risk score 0-100
    """
    if not call_gex and not put_gex:
        return 0.0

    # Collect all strikes
    all_strikes = sorted(set(call_gex.keys()) | set(put_gex.keys()))
    if not all_strikes:
        return 0.0

    # Find nearest strike to spot
    nearest_strike = min(all_strikes, key=lambda s: abs(s - spot))

    # Get GEX at nearest strike
    nearest_call_gex = abs(call_gex.get(nearest_strike, 0.0))
    nearest_put_gex = abs(put_gex.get(nearest_strike, 0.0))
    nearest_total_gex = nearest_call_gex + nearest_put_gex

    # Compute total GEX in window around nearest strike
    nearest_idx = all_strikes.index(nearest_strike)
    window_start = max(0, nearest_idx - window_side)
    window_end = min(len(all_strikes), nearest_idx + window_side + 1)
    window_strikes = all_strikes[window_start:window_end]

    window_gex = 0.0
    for strike in window_strikes:
        window_gex += abs(call_gex.get(strike, 0.0))
        window_gex += abs(put_gex.get(strike, 0.0))

    # Avoid division by zero
    if window_gex == 0.0:
        return 0.0

    # Concentration ratio: GEX at nearest / total in window
    concentration = nearest_total_gex / window_gex

    # Scale to 0-100; cap at 100
    pin_risk = min(100.0, concentration * 100.0)

    return pin_risk


def compute_walls(
    call_gex: dict,
    put_gex: dict,
    spot: float,
    threshold_pct: float = 0.25,
) -> Tuple[Optional[float], Optional[float], str]:
    """Identify call/put walls: strikes with dominant GEX concentration.

    Wall = side where GEX at one strike dominates neighborhood (>threshold_pct).

    Args:
        call_gex: {strike: gamma_$} for calls
        put_gex: {strike: gamma_$} for puts
        spot: Current underlying price
        threshold_pct: Concentration threshold (0.25 = 25%)

    Returns:
        (call_wall_strike, put_wall_strike, wall_type)
        wall_type: "none" | "call" | "put" | "both"
    """
    call_wall = None
    put_wall = None
    wall_type = "none"

    # Check for call wall
    if call_gex:
        total_call_gex = sum(abs(v) for v in call_gex.values())
        if total_call_gex > 0:
            # Find the strike with max absolute call GEX
            max_call_strike = max(call_gex.keys(), key=lambda k: abs(call_gex[k]))
            max_call_gex = abs(call_gex[max_call_strike])

            # Check if it dominates the neighborhood
            if max_call_gex / total_call_gex > threshold_pct:
                call_wall = max_call_strike

    # Check for put wall
    if put_gex:
        total_put_gex = sum(abs(v) for v in put_gex.values())
        if total_put_gex > 0:
            # Find the strike with max absolute put GEX
            max_put_strike = max(put_gex.keys(), key=lambda k: abs(put_gex[k]))
            max_put_gex = abs(put_gex[max_put_strike])

            # Check if it dominates the neighborhood
            if max_put_gex / total_put_gex > threshold_pct:
                put_wall = max_put_strike

    # Determine wall type
    if call_wall and put_wall:
        wall_type = "both"
    elif call_wall:
        wall_type = "call"
    elif put_wall:
        wall_type = "put"

    return call_wall, put_wall, wall_type
