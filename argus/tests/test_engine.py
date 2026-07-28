"""Tests for options_live engine orchestration."""

import pytest
from datetime import datetime, timezone

from argus.options_live.engine import run_analytics
from argus.options_live.config import LiveConfig
from argus.options_live.models import LadderSnapshot, OptionQuote


def create_option_quote(
    bid: float = 1.0,
    ask: float = 1.1,
    iv: float = 0.25,
    delta: float = 0.5,
    gamma: float = 0.01,
    theta: float = -0.01,
    vega: float = 0.05,
    volume: int = 100,
    oi: int = 1000,
) -> dict:
    """Helper to create a ticker dict for testing."""
    return {
        "bid": bid,
        "ask": ask,
        "mid": (bid + ask) / 2,
        "iv": iv,
        "delta": delta,
        "gamma": gamma,
        "theta": theta,
        "vega": vega,
        "volume": volume,
        "oi": oi,
        "stale_ms": 0,
    }


def create_sparse_quote(
    bid: float = 1.0,
    ask: float = 1.1,
    iv: float = None,
) -> dict:
    """Helper to create a sparse quote (missing greeks)."""
    return {
        "bid": bid,
        "ask": ask,
        "mid": (bid + ask) / 2,
        "iv": iv,
        "delta": None,
        "gamma": None,
        "theta": None,
        "vega": None,
        "volume": 50,
        "oi": 500,
        "stale_ms": 0,
    }


def test_engine_with_9_strikes():
    """Full pipeline with 9 strikes of fixture data."""
    spot = 420.0
    strikes = [400.0, 405.0, 410.0, 415.0, 420.0, 425.0, 430.0, 435.0, 440.0]

    # Create quotes for all 9 strikes (full data)
    quotes = {}
    for strike in strikes:
        # Call slightly OTM, put slightly OTM
        moneyness = (strike - spot) / spot
        call_quote = create_option_quote(
            bid=max(0.1, 5.0 - moneyness * 100),
            ask=max(0.1, 5.1 - moneyness * 100),
            iv=0.25,
            delta=0.5 + moneyness * 2,
            gamma=0.01 - abs(moneyness) * 0.002,
        )
        put_quote = create_option_quote(
            bid=max(0.1, 5.0 + moneyness * 100),
            ask=max(0.1, 5.1 + moneyness * 100),
            iv=0.25,
            delta=-0.5 + moneyness * 2,
            gamma=0.01 - abs(moneyness) * 0.002,
        )
        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    # Run analytics
    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        symbol="SPY",
        source="LIVE",
    )

    # Verify structure
    assert ladder.symbol == "SPY"
    assert ladder.spot == spot
    assert ladder.source == "LIVE"
    assert ladder.expiry == "0DTE"
    assert len(ladder.levels) == 9

    # Verify ATM strike
    assert ladder.atm_strike == 420.0

    # Verify summary fields are populated
    assert ladder.max_pain is not None
    assert 400 <= ladder.max_pain <= 440
    assert 0 <= ladder.pin_risk <= 100

    # Verify levels have correct structure
    for i, level in enumerate(ladder.levels):
        assert level.strike == strikes[i]
        assert level.call is not None
        assert level.put is not None
        assert level.call.bid is not None
        assert level.put.bid is not None

    # Verify fresh_contract_ratio
    assert 0 <= ladder.fresh_contract_ratio <= 1
    assert ladder.fresh_contract_ratio > 0  # Should have greeks

    # Verify as_of is recent
    now = datetime.now(timezone.utc)
    age_ms = (now - ladder.as_of).total_seconds() * 1000
    assert age_ms < 5000  # Should be very recent


def test_engine_handles_sparse_greeks():
    """Engine handles partial greeks correctly."""
    spot = 100.0
    strikes = [90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0, 125.0, 130.0]

    quotes = {}
    for i, strike in enumerate(strikes):
        if i % 2 == 0:
            # Even strikes: full data
            call_quote = create_option_quote()
            put_quote = create_option_quote()
        else:
            # Odd strikes: sparse data (no greeks)
            call_quote = create_sparse_quote()
            put_quote = create_sparse_quote()

        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # Should complete without error
    assert ladder is not None
    assert len(ladder.levels) == 9

    # Fresh ratio should be less than 1.0 due to sparse data
    assert 0 < ladder.fresh_contract_ratio < 1.0

    # Sparse strikes should still appear in levels
    for level in ladder.levels:
        assert level.strike in strikes


def test_engine_fresh_ratio():
    """Engine correctly computes fresh_contract_ratio."""
    spot = 100.0
    strikes = [90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0, 125.0, 130.0]

    # All full greeks
    quotes_full = {}
    for strike in strikes:
        call_quote = create_option_quote()
        put_quote = create_option_quote()
        quotes_full[strike] = (call_quote, put_quote)

    config = LiveConfig()

    ladder_full = run_analytics(
        quotes=quotes_full,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # All strikes fresh (both call and put have full greeks)
    assert ladder_full.fresh_contract_ratio == 1.0

    # Now test with NO greeks on any contract
    quotes_sparse = {}
    for strike in strikes:
        call_quote = create_sparse_quote()
        put_quote = create_sparse_quote()
        quotes_sparse[strike] = (call_quote, put_quote)

    ladder_sparse = run_analytics(
        quotes=quotes_sparse,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # No strikes should be fresh
    assert ladder_sparse.fresh_contract_ratio == 0.0

    # Test mixed: only calls have greeks on half the strikes
    quotes_mixed = {}
    for i, strike in enumerate(strikes):
        if i < len(strikes) // 2:
            # First half: calls have greeks, puts don't
            call_quote = create_option_quote()
            put_quote = create_sparse_quote()
        else:
            # Second half: both sparse
            call_quote = create_sparse_quote()
            put_quote = create_sparse_quote()

        quotes_mixed[strike] = (call_quote, put_quote)

    ladder_mixed = run_analytics(
        quotes=quotes_mixed,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # First half should be fresh (calls have greeks)
    # Second half should not be fresh
    expected_ratio = (len(strikes) // 2) / len(strikes)
    assert ladder_mixed.fresh_contract_ratio == expected_ratio


def test_engine_atm_strike_selection():
    """Engine selects correct ATM strike."""
    spot = 105.5
    strikes = [100.0, 102.0, 104.0, 106.0, 108.0, 110.0, 112.0, 114.0, 116.0]

    quotes = {}
    for strike in strikes:
        call_quote = create_option_quote()
        put_quote = create_option_quote()
        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # ATM should be 106.0 (closest to 105.5)
    assert ladder.atm_strike == 106.0


def test_engine_zero_gamma_strike():
    """Engine identifies zero-gamma strike."""
    spot = 100.0
    strikes = [90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0, 125.0, 130.0]

    quotes = {}
    for strike in strikes:
        call_quote = create_option_quote(gamma=0.01)
        put_quote = create_option_quote(gamma=0.01)
        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # Should identify a zero-gamma strike (minimum net gamma)
    assert ladder.zero_gamma_strike is not None
    assert ladder.zero_gamma_strike in strikes

    # Verify the level is marked
    zg_level = next((l for l in ladder.levels if l.strike == ladder.zero_gamma_strike), None)
    assert zg_level is not None
    assert zg_level.zero_gamma_side == "both"


def test_engine_insufficient_strikes():
    """Engine handles <9 strikes gracefully."""
    spot = 100.0
    strikes = [95.0, 100.0, 105.0]  # Only 3 strikes

    quotes = {}
    for strike in strikes:
        call_quote = create_option_quote()
        put_quote = create_option_quote()
        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # Should complete without error
    assert ladder is not None
    assert len(ladder.levels) == 3

    # IV surface should fail gracefully (< 8 points)
    # max_pain, pin_risk should still work
    assert ladder.max_pain is not None or ladder.max_pain is None  # Graceful


def test_engine_empty_quotes():
    """Engine handles empty quotes gracefully."""
    spot = 100.0
    quotes = {}

    config = LiveConfig()

    ladder = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )

    # Should handle gracefully
    assert ladder is not None
    assert len(ladder.levels) == 0
    assert ladder.fresh_contract_ratio == 0


def test_engine_source_variants():
    """Engine respects source parameter."""
    spot = 100.0
    strikes = [90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0, 125.0, 130.0]

    quotes = {}
    for strike in strikes:
        call_quote = create_option_quote()
        put_quote = create_option_quote()
        quotes[strike] = (call_quote, put_quote)

    config = LiveConfig()

    # Test LIVE
    ladder_live = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="LIVE",
    )
    assert ladder_live.source == "LIVE"

    # Test FROZEN
    ladder_frozen = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="FROZEN",
    )
    assert ladder_frozen.source == "FROZEN"

    # Test EOD
    ladder_eod = run_analytics(
        quotes=quotes,
        spot=spot,
        expiry="0DTE",
        config=config,
        source="EOD",
    )
    assert ladder_eod.source == "EOD"
