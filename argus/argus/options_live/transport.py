"""Serialize LadderSnapshot for JSON transport."""
from datetime import datetime
from typing import Optional
from .models import LadderSnapshot


def serialize_ladder(ladder: LadderSnapshot) -> dict:
    """Convert LadderSnapshot to JSON-serializable dict for REST/WS.

    Args:
        ladder: LadderSnapshot instance

    Returns:
        Dict with all fields serialized:
        - symbol, spot, as_of, source, stale_ms, stale_ms, expiry
        - atm_strike, zero_gamma_strike, call_wall_strike, put_wall_strike
        - max_pain, pin_risk, net_gex_band
        - msi_call_strike, msi_put_strike, msi_rationale
        - gex_profile_json
        - levels: list of {strike, call: {...14 fields}, put: {...14 fields},
                           zero_gamma_side, wall_type, gex_by_strike, max_pain_delta}
    """
    return {
        "symbol": ladder.symbol,
        "spot": ladder.spot,
        "as_of": ladder.as_of.isoformat(),
        "source": ladder.source,
        "stale_ms": ladder.stale_ms,
        "fresh_contract_ratio": ladder.fresh_contract_ratio,
        "expiry": ladder.expiry,
        "atm_strike": ladder.atm_strike,
        "zero_gamma_strike": ladder.zero_gamma_strike,
        "call_wall_strike": ladder.call_wall_strike,
        "put_wall_strike": ladder.put_wall_strike,
        "max_pain": ladder.max_pain,
        "pin_risk": ladder.pin_risk,
        "net_gex_band": ladder.net_gex_band,
        "msi_call_strike": ladder.msi_call_strike,
        "msi_put_strike": ladder.msi_put_strike,
        "msi_rationale": ladder.msi_rationale,
        "gex_profile_json": ladder.gex_profile_json,
        "levels": [
            {
                "strike": level.strike,
                "call": {
                    "bid": level.call.bid,
                    "ask": level.call.ask,
                    "mid": level.call.mid,
                    "spread_pct": level.call.spread_pct,
                    "iv": level.call.iv,
                    "delta": level.call.delta,
                    "gamma": level.call.gamma,
                    "theta": level.call.theta,
                    "vega": level.call.vega,
                    "rho": level.call.rho,
                    "volume": level.call.volume,
                    "oi": level.call.oi,
                    "stale_ms": level.call.stale_ms,
                    "liquid": level.call.liquid,
                },
                "put": {
                    "bid": level.put.bid,
                    "ask": level.put.ask,
                    "mid": level.put.mid,
                    "spread_pct": level.put.spread_pct,
                    "iv": level.put.iv,
                    "delta": level.put.delta,
                    "gamma": level.put.gamma,
                    "theta": level.put.theta,
                    "vega": level.put.vega,
                    "rho": level.put.rho,
                    "volume": level.put.volume,
                    "oi": level.put.oi,
                    "stale_ms": level.put.stale_ms,
                    "liquid": level.put.liquid,
                },
                "zero_gamma_side": level.zero_gamma_side,
                "wall_type": level.wall_type,
                "gex_by_strike": level.gex_by_strike,
                "call_gex_by_strike": level.call_gex_by_strike,
                "put_gex_by_strike": level.put_gex_by_strike,
                "max_pain_delta": level.max_pain_delta,
            }
            for level in ladder.levels
        ],
    }
