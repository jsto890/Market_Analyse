"""Tests yfinance EOD fallback option chain fetch."""

import asyncio
import datetime
from unittest import mock

import pytest

from argus.options_live.fallback import get_eod_ladder, _build_quote, _fetch_eod_ladder_sync
from argus.options_live.models import LadderSnapshot, OptionQuote, StrikeLevelSnapshot


class TestEODLadderFetch:
    """Test EOD ladder fetch and structure building."""

    def test_eod_ladder_fetch(self):
        """Fetch real SPY option chain and verify LadderSnapshot structure."""
        # Use a current date or the first available expiration
        ladder = asyncio.run(get_eod_ladder("SPY", "2026-07-28"))

        # Verify structure
        assert ladder is not None, "Should fetch SPY ladder"
        assert ladder.symbol == "SPY"
        assert ladder.source == "EOD"
        assert ladder.expiry == "2026-07-28"
        assert ladder.spot > 0, "Spot price should be positive"
        assert ladder.as_of is not None
        assert ladder.levels is not None
        assert len(ladder.levels) > 0, "Should have strike levels"

        # Verify first level structure
        first_level = ladder.levels[0]
        assert isinstance(first_level, StrikeLevelSnapshot)
        assert first_level.strike > 0
        assert isinstance(first_level.call, OptionQuote)
        assert isinstance(first_level.put, OptionQuote)

    def test_eod_missing_expiry(self):
        """Handle missing expiry gracefully."""
        # Use a date far in the future that won't exist
        ladder = asyncio.run(get_eod_ladder("SPY", "2099-12-31"))
        assert ladder is None, "Should return None for missing expiry"

    def test_build_quote_with_bid_ask(self):
        """Build quote with valid bid/ask."""
        row = {
            "bid": 1.50,
            "ask": 1.60,
            "impliedVolatility": 0.25,
            "volume": 100,
            "openInterest": 500,
        }
        quote = _build_quote(row, strike=100.0)

        assert quote.bid == 1.50
        assert quote.ask == 1.60
        assert quote.mid == 1.55
        assert quote.spread_pct == pytest.approx((1.60 - 1.50) / 1.55 * 100, rel=0.01)
        assert quote.iv == 0.25
        assert quote.volume == 100
        assert quote.oi == 500

    def test_build_quote_with_zero_bid_ask(self):
        """Build quote with zero bid/ask (illiquid option)."""
        row = {
            "bid": 0.0,
            "ask": 0.0,
            "impliedVolatility": 0.001,
            "volume": 0,
            "openInterest": 0,
        }
        quote = _build_quote(row, strike=100.0)

        assert quote.bid is None
        assert quote.ask is None
        assert quote.mid is None
        assert quote.spread_pct is None
        assert quote.volume is None
        assert quote.oi is None

    def test_build_quote_with_only_ask(self):
        """Build quote with only ask price (bid=0)."""
        row = {
            "bid": 0.0,
            "ask": 2.50,
            "impliedVolatility": 0.20,
            "volume": 50,
            "openInterest": 100,
        }
        quote = _build_quote(row, strike=100.0)

        assert quote.bid is None
        assert quote.ask == 2.50
        assert quote.mid == 2.50
        assert quote.volume == 50
        assert quote.oi == 100

    def test_build_quote_no_greeks(self):
        """Verify EOD quotes have no greeks (delta, gamma, etc.)."""
        row = {
            "bid": 1.0,
            "ask": 1.10,
            "impliedVolatility": 0.25,
            "volume": 10,
            "openInterest": 50,
        }
        quote = _build_quote(row, strike=100.0)

        assert quote.delta is None
        assert quote.gamma is None
        assert quote.theta is None
        assert quote.vega is None
        assert quote.rho is None
        assert quote.per_dollar_gamma is None
        assert quote.per_dollar_delta is None


class TestEODMissingData:
    """Test handling of sparse or missing data."""

    def test_eod_ladder_with_missing_strikes_call_only(self):
        """Build ladder when some strikes lack calls."""
        # Mock yfinance for partial data
        calls_df = mock.MagicMock()
        puts_df = mock.MagicMock()

        calls_df.iterrows.return_value = [
            (0, {"strike": 400.0, "bid": 1.0, "ask": 1.1, "impliedVolatility": 0.20, "volume": 100, "openInterest": 1000}),
            (1, {"strike": 410.0, "bid": 0.5, "ask": 0.6, "impliedVolatility": 0.20, "volume": 50, "openInterest": 500}),
        ]
        puts_df.iterrows.return_value = [
            (0, {"strike": 400.0, "bid": 0.5, "ask": 0.6, "impliedVolatility": 0.20, "volume": 100, "openInterest": 1000}),
            (1, {"strike": 410.0, "bid": 1.0, "ask": 1.1, "impliedVolatility": 0.20, "volume": 50, "openInterest": 500}),
            (2, {"strike": 420.0, "bid": 2.0, "ask": 2.1, "impliedVolatility": 0.20, "volume": 25, "openInterest": 250}),
        ]

        with mock.patch("yfinance.Ticker") as MockTicker:
            ticker = MockTicker.return_value
            ticker.options = ("2026-07-31",)
            ticker.option_chain.return_value = mock.MagicMock(calls=calls_df, puts=puts_df)
            ticker.info = {"regularMarketPrice": 410.0}

            ladder = _fetch_eod_ladder_sync("SPY", "2026-07-31")

        assert ladder is not None
        assert len(ladder.levels) == 3  # All unique strikes: 400, 410, 420
        assert ladder.levels[0].strike == 400.0
        assert ladder.levels[1].strike == 410.0
        assert ladder.levels[2].strike == 420.0

        # Verify 410 has both call and put
        mid_level = ladder.levels[1]
        assert mid_level.call.bid == 0.5
        assert mid_level.put.bid == 1.0

        # Verify 420 has put but no call (call will have None values)
        high_level = ladder.levels[2]
        assert high_level.put.bid == 2.0
        assert high_level.call.bid is None

    def test_fetch_eod_ladder_sync_atm_strike(self):
        """Verify ATM strike is correctly identified."""
        # Mock yfinance
        calls_df = mock.MagicMock()
        puts_df = mock.MagicMock()

        calls_df.iterrows.return_value = [
            (0, {"strike": 100.0, "bid": 1.0, "ask": 1.1, "impliedVolatility": 0.20, "volume": 100, "openInterest": 1000}),
            (1, {"strike": 105.0, "bid": 0.5, "ask": 0.6, "impliedVolatility": 0.20, "volume": 50, "openInterest": 500}),
            (2, {"strike": 110.0, "bid": 0.1, "ask": 0.2, "impliedVolatility": 0.20, "volume": 10, "openInterest": 100}),
        ]
        puts_df.iterrows.return_value = [
            (0, {"strike": 100.0, "bid": 0.5, "ask": 0.6, "impliedVolatility": 0.20, "volume": 100, "openInterest": 1000}),
            (1, {"strike": 105.0, "bid": 1.0, "ask": 1.1, "impliedVolatility": 0.20, "volume": 50, "openInterest": 500}),
            (2, {"strike": 110.0, "bid": 2.0, "ask": 2.1, "impliedVolatility": 0.20, "volume": 10, "openInterest": 100}),
        ]

        with mock.patch("yfinance.Ticker") as MockTicker:
            ticker = MockTicker.return_value
            ticker.options = ("2026-07-31",)
            ticker.option_chain.return_value = mock.MagicMock(calls=calls_df, puts=puts_df)
            ticker.info = {"regularMarketPrice": 105.0}

            ladder = _fetch_eod_ladder_sync("SPY", "2026-07-31")

        assert ladder is not None
        assert ladder.atm_strike == 105.0, "ATM should be closest to spot"

    def test_fetch_eod_ladder_sync_no_spot(self):
        """Handle missing spot price gracefully."""
        with mock.patch("yfinance.Ticker") as MockTicker:
            ticker = MockTicker.return_value
            ticker.options = ("2026-07-31",)
            ticker.info = {}  # No regularMarketPrice

            ladder = _fetch_eod_ladder_sync("SPY", "2026-07-31")

        assert ladder is None, "Should return None when spot price unavailable"

    def test_fetch_eod_ladder_sync_no_options(self):
        """Handle symbol with no options available."""
        with mock.patch("yfinance.Ticker") as MockTicker:
            ticker = MockTicker.return_value
            ticker.options = []  # No options available

            ladder = _fetch_eod_ladder_sync("XYZ", "2026-07-31")

        assert ladder is None, "Should return None when no options available"
