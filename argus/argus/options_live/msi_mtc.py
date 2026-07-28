"""MSI/MTC strike selection — highest dealer gamma concentration."""

from typing import Optional, Tuple


def select_msi_mtc(
    call_gex: dict,
    put_gex: dict,
    spot: float,
    rationale_prefix: str = "",
) -> Tuple[Optional[float], Optional[float], str]:
    """Select MSI strikes where dealer concentration is highest.

    MSI call = strike with max call GEX absolute value
    MSI put = strike with max put GEX absolute value

    Args:
        call_gex: {strike: gamma_$ for calls}
        put_gex: {strike: gamma_$ for puts}
        spot: Current spot
        rationale_prefix: Prefix for rationale (e.g., "wall_call" if dominated by wall)

    Returns:
        (msi_call_strike, msi_put_strike, rationale)
    """
    msi_call = None
    msi_put = None
    details = []

    # Find MSI call: strike with max absolute GEX
    if call_gex:
        msi_call = max(call_gex.keys(), key=lambda k: abs(call_gex[k]))
        max_call_gex = call_gex[msi_call]
        details.append(f"MSI call {msi_call} ({max_call_gex:,.0f})")

    # Find MSI put: strike with max absolute GEX
    if put_gex:
        msi_put = max(put_gex.keys(), key=lambda k: abs(put_gex[k]))
        max_put_gex = put_gex[msi_put]
        details.append(f"MSI put {msi_put} ({max_put_gex:,.0f})")

    rationale = " | ".join(details)
    if rationale_prefix:
        rationale = f"{rationale_prefix}: {rationale}" if rationale else rationale_prefix

    return msi_call, msi_put, rationale
