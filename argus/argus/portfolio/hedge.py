"""Hedge calculator. Given long exposure $X and a coverage %, compute the
exact number of inverse-ETF shares OR SPY put contracts needed to hedge.

Assumptions:
- Inverse ETFs (e.g. SH = -1x SPY, SDS = -2x SPY, SPXU = -3x SPY) hedge
  notional dollar-for-dollar after applying the leverage factor.
- Put-option hedge sizes by delta. We assume an at-the-money put has
  delta ~ -0.50 unless caller overrides. 1 contract = 100 shares.
"""
from __future__ import annotations

from typing import Optional
from ..data import get_quote


INVERSE_ETFS = {
    "SH":   {"factor": -1.0, "name": "ProShares Short S&P500"},
    "SDS":  {"factor": -2.0, "name": "ProShares UltraShort S&P500"},
    "SPXU": {"factor": -3.0, "name": "ProShares UltraPro Short S&P500"},
    "PSQ":  {"factor": -1.0, "name": "ProShares Short QQQ"},
    "QID":  {"factor": -2.0, "name": "ProShares UltraShort QQQ"},
}


def hedge_for_long_book(
    portfolio_value: float,
    coverage_pct: float = 0.5,
    spy_put_strike_delta: float = -0.5,
) -> dict:
    """Return both ETF and put-option hedging proposals."""
    coverage_dollars = portfolio_value * coverage_pct
    out = {
        "portfolio_value": portfolio_value,
        "coverage_pct": coverage_pct,
        "coverage_dollars": coverage_dollars,
        "etf_hedges": [],
        "spy_put_hedge": None,
    }

    for sym, meta in INVERSE_ETFS.items():
        q = get_quote(sym)
        if not q:
            continue
        factor = abs(meta["factor"])
        notional_per_share = q["price"] * factor
        shares = round(coverage_dollars / notional_per_share) if notional_per_share else 0
        out["etf_hedges"].append({
            "symbol": sym,
            "name": meta["name"],
            "leverage": meta["factor"],
            "price": q["price"],
            "shares": shares,
            "approx_cost": round(shares * q["price"], 2),
        })

    spy = get_quote("SPY")
    if spy:
        spy_price = spy["price"]
        # Each put contract delta-hedges (delta * 100 * spy_price) dollars of long
        notional_per_contract = abs(spy_put_strike_delta) * 100 * spy_price
        contracts = round(coverage_dollars / notional_per_contract) if notional_per_contract else 0
        out["spy_put_hedge"] = {
            "symbol": "SPY",
            "spot": spy_price,
            "assumed_delta": spy_put_strike_delta,
            "contracts": contracts,
            "notional_covered": round(contracts * notional_per_contract, 2),
            "note": "ATM put; refine with real chain via /api/options/SPY",
        }

    return out
