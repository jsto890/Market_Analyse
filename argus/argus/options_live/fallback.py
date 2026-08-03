"""Fallback yfinance EOD option chain fetch when IBKR unavailable."""

import asyncio
import datetime
import logging
from typing import Optional

import yfinance as yf

from .models import LadderSnapshot, OptionQuote, StrikeLevelSnapshot

logger = logging.getLogger(__name__)


async def get_eod_ladder(symbol: str, expiry: str) -> Optional[LadderSnapshot]:
    """Fetch option chain from yfinance EOD when IBKR unavailable.

    Args:
        symbol: Stock ticker (e.g., "SPY")
        expiry: ISO format expiration date (e.g., "2026-07-31")

    Returns:
        LadderSnapshot with source="EOD", no greeks (None).
        None if expiry unavailable or fetch fails.
    """
    try:
        # Run blocking yfinance call in thread pool
        ladder = await asyncio.to_thread(
            _fetch_eod_ladder_sync,
            symbol,
            expiry,
        )
        return ladder
    except Exception as e:
        logger.error("EOD ladder fetch failed for %s %s: %s", symbol, expiry, e)
        return None


def _fetch_eod_ladder_sync(symbol: str, expiry: str) -> Optional[LadderSnapshot]:
    """Synchronous yfinance fetch.

    Args:
        symbol: Stock ticker
        expiry: ISO format date string

    Returns:
        LadderSnapshot or None if expiry unavailable
    """
    ticker = yf.Ticker(symbol)

    # Check if expiry is available
    if not hasattr(ticker, "options") or not ticker.options:
        logger.warning("No options available for %s", symbol)
        return None

    # Normalize expiry format: yfinance returns tuples or strings in YYYY-MM-DD
    available_expirations = list(ticker.options)
    if expiry not in available_expirations:
        logger.warning(
            "Expiry %s not available for %s; available: %s",
            expiry,
            symbol,
            available_expirations[:5],
        )
        return None

    try:
        # Fetch option chain
        chain = ticker.option_chain(expiry)
        calls_df = chain.calls
        puts_df = chain.puts

        # Get current spot price (use bid/ask midpoint if available)
        info = ticker.info or {}
        spot = info.get("regularMarketPrice", None)

        if spot is None:
            logger.warning("Cannot determine spot price for %s", symbol)
            return None

        # Build strike -> (call_quote, put_quote) map
        levels = []
        call_by_strike = {row["strike"]: row for _, row in calls_df.iterrows()}
        put_by_strike = {row["strike"]: row for _, row in puts_df.iterrows()}

        # Use union of all strikes available
        all_strikes = sorted(set(call_by_strike.keys()) | set(put_by_strike.keys()))

        for strike in all_strikes:
            call_row = call_by_strike.get(strike)
            put_row = put_by_strike.get(strike)

            call_quote = _build_quote(call_row, strike) if call_row is not None else OptionQuote()
            put_quote = _build_quote(put_row, strike) if put_row is not None else OptionQuote()

            level = StrikeLevelSnapshot(
                strike=strike,
                call=call_quote,
                put=put_quote,
                zero_gamma_side=None,
                wall_type=None,
                gex_by_strike=None,
                max_pain_delta=None,
            )
            levels.append(level)

        # Determine ATM strike (closest to spot)
        atm_strike = min(all_strikes, key=lambda s: abs(s - spot)) if all_strikes else None

        # Build ladder snapshot
        ladder = LadderSnapshot(
            symbol=symbol,
            spot=spot,
            as_of=datetime.datetime.now(datetime.timezone.utc),
            source="EOD",
            stale_ms=0,
            fresh_contract_ratio=1.0,  # EOD data is complete
            expiry=expiry,
            levels=levels,
            atm_strike=atm_strike,
            zero_gamma_strike=None,
            call_wall_strike=None,
            put_wall_strike=None,
            max_pain=None,
            pin_risk=None,
            net_gex_band=None,
            msi_call_strike=None,
            msi_put_strike=None,
            msi_rationale=None,
        )
        return ladder

    except Exception as e:
        logger.error("Error building EOD ladder for %s %s: %s", symbol, expiry, e)
        return None


def _build_quote(row, strike: float) -> OptionQuote:
    """Build OptionQuote from yfinance row.

    Args:
        row: pandas Series from option chain DataFrame
        strike: Strike price for reference

    Returns:
        OptionQuote with bid, ask, mid, spread_pct, iv, volume, oi
    """
    import math

    bid_val = row.get("bid", 0.0)
    bid = float(bid_val) if not (isinstance(bid_val, float) and math.isnan(bid_val)) else None
    bid = bid if bid and bid > 0 else None

    ask_val = row.get("ask", 0.0)
    ask = float(ask_val) if not (isinstance(ask_val, float) and math.isnan(ask_val)) else None
    ask = ask if ask and ask > 0 else None

    volume_val = row.get("volume", 0)
    try:
        volume = int(volume_val) if not (isinstance(volume_val, float) and math.isnan(volume_val)) else None
    except (ValueError, TypeError):
        volume = None
    volume = volume if volume and volume > 0 else None

    oi_val = row.get("openInterest", 0)
    try:
        oi = int(oi_val) if not (isinstance(oi_val, float) and math.isnan(oi_val)) else None
    except (ValueError, TypeError):
        oi = None
    oi = oi if oi and oi > 0 else None

    iv_val = row.get("impliedVolatility", 0.0)
    iv = float(iv_val) if not (isinstance(iv_val, float) and math.isnan(iv_val)) else None
    iv = iv if iv and iv > 0 else None

    # Compute mid and spread
    mid = None
    spread_pct = None

    if bid is not None and ask is not None:
        mid = (bid + ask) / 2.0
        spread_pct = ((ask - bid) / mid * 100.0) if mid > 0 else None
    elif bid is not None:
        mid = bid
    elif ask is not None:
        mid = ask

    return OptionQuote(
        bid=bid,
        ask=ask,
        mid=mid,
        spread_pct=spread_pct,
        iv=iv,
        delta=None,
        gamma=None,
        theta=None,
        vega=None,
        rho=None,
        per_dollar_gamma=None,
        per_dollar_delta=None,
        volume=volume,
        oi=oi,
        stale_ms=0,
        liquid=False,
    )
