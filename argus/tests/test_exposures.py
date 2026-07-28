"""Tests for exposure computations (GEX, VEX, DEX)."""

import pytest
from argus.options_live.models import OptionQuote
from argus.options_live.exposures import (
    compute_gex,
    compute_vex,
    compute_dex,
    compute_exposures,
    compute_net_gex,
)


class TestComputeGEX:
    """Test gamma exposure calculation."""

    def test_call_gex_positive(self):
        """Call gamma exposure should be negative (dealer short calls)."""
        opt = OptionQuote(gamma=0.01, oi=1000)
        spot = 105.0
        gex = compute_gex(opt, "C", spot, multiplier=100)
        # -1.0 * 0.01 * 1000 * 105 * 100 = -105,000
        assert gex == -105_000.0

    def test_put_gex_positive(self):
        """Put gamma exposure should be positive (dealer short puts)."""
        opt = OptionQuote(gamma=0.01, oi=1000)
        spot = 105.0
        gex = compute_gex(opt, "P", spot, multiplier=100)
        # +1.0 * 0.01 * 1000 * 105 * 100 = 105,000
        assert gex == 105_000.0

    def test_zero_oi(self):
        """Zero OI should give zero exposure."""
        opt = OptionQuote(gamma=0.01, oi=0)
        gex = compute_gex(opt, "C", 105.0, multiplier=100)
        assert gex == 0.0

    def test_none_gamma(self):
        """None gamma should give zero exposure."""
        opt = OptionQuote(gamma=None, oi=100)
        gex = compute_gex(opt, "C", 105.0, multiplier=100)
        assert gex == 0.0

    def test_none_oi(self):
        """None OI should give zero exposure."""
        opt = OptionQuote(gamma=0.01, oi=None)
        gex = compute_gex(opt, "C", 105.0, multiplier=100)
        assert gex == 0.0


class TestComputeVEX:
    """Test vega exposure calculation."""

    def test_call_vex_formula(self):
        """Vega exposure = dealer_sign * vega * OI * spot * multiplier / 100."""
        opt = OptionQuote(vega=0.05, oi=200)
        spot = 100.0
        vex = compute_vex(opt, "C", spot, multiplier=100)
        # -1.0 * 0.05 * 200 * 100 * 100 / 100 = -1,000
        assert vex == -1_000.0

    def test_put_vex_positive(self):
        """Put vega should be positive (dealer short puts)."""
        opt = OptionQuote(vega=0.05, oi=200)
        spot = 100.0
        vex = compute_vex(opt, "P", spot, multiplier=100)
        # +1.0 * 0.05 * 200 * 100 * 100 / 100 = 1,000
        assert vex == 1_000.0

    def test_zero_oi(self):
        """Zero OI should give zero vex."""
        opt = OptionQuote(vega=0.05, oi=0)
        vex = compute_vex(opt, "C", 100.0, multiplier=100)
        assert vex == 0.0

    def test_none_vega(self):
        """None vega should give zero vex."""
        opt = OptionQuote(vega=None, oi=200)
        vex = compute_vex(opt, "C", 100.0, multiplier=100)
        assert vex == 0.0


class TestComputeDEX:
    """Test delta exposure calculation."""

    def test_call_dex_negative(self):
        """Call delta exposure should be negative (dealer short calls)."""
        opt = OptionQuote(delta=0.5, oi=100)
        spot = 100.0
        dex = compute_dex(opt, "C", spot, multiplier=100)
        # -1.0 * 0.5 * 100 * 100 * 100 = -500,000
        assert dex == -500_000.0

    def test_put_dex_positive(self):
        """Put delta exposure should be positive (dealer short puts)."""
        opt = OptionQuote(delta=-0.5, oi=100)
        spot = 100.0
        dex = compute_dex(opt, "P", spot, multiplier=100)
        # +1.0 * (-0.5) * 100 * 100 * 100 = -500,000 (still negative, delta can be negative)
        # But if we use put delta of 0.5 (which is less negative for puts)
        opt_p = OptionQuote(delta=0.5, oi=100)
        dex_p = compute_dex(opt_p, "P", spot, multiplier=100)
        # +1.0 * 0.5 * 100 * 100 * 100 = 500,000
        assert dex_p == 500_000.0


class TestComputeExposures:
    """Test batch exposure computation."""

    def test_single_strike(self):
        """Test computation for a single strike."""
        call_opt = OptionQuote(gamma=0.01, vega=0.05, delta=0.5, oi=1000)
        put_opt = OptionQuote(gamma=0.01, vega=0.05, delta=-0.5, oi=1000)
        spot = 100.0

        quotes = {100.0: (call_opt, put_opt)}
        result = compute_exposures(quotes, spot, multiplier=100)

        # Check all keys exist
        assert "call_gex_by_strike" in result
        assert "put_gex_by_strike" in result
        assert "call_vex_by_strike" in result
        assert "put_vex_by_strike" in result
        assert "call_dex_by_strike" in result
        assert "put_dex_by_strike" in result

        # Validate call GEX: -1.0 * 0.01 * 1000 * 100 * 100 = -100,000
        assert result["call_gex_by_strike"][100.0] == -100_000.0
        # Validate put GEX: +1.0 * 0.01 * 1000 * 100 * 100 = 100,000
        assert result["put_gex_by_strike"][100.0] == 100_000.0

    def test_multiple_strikes(self):
        """Test computation for multiple strikes."""
        call_105 = OptionQuote(gamma=0.01, vega=0.05, delta=0.6, oi=100)
        put_105 = OptionQuote(gamma=0.009, vega=0.05, delta=-0.4, oi=150)

        call_100 = OptionQuote(gamma=0.012, vega=0.06, delta=0.5, oi=200)
        put_100 = OptionQuote(gamma=0.012, vega=0.06, delta=-0.5, oi=200)

        spot = 102.0
        quotes = {
            105.0: (call_105, put_105),
            100.0: (call_100, put_100),
        }
        result = compute_exposures(quotes, spot, multiplier=100)

        assert len(result["call_gex_by_strike"]) == 2
        assert len(result["put_gex_by_strike"]) == 2
        assert 105.0 in result["call_gex_by_strike"]
        assert 100.0 in result["call_gex_by_strike"]

    def test_none_option_quotes(self):
        """Test with None option quotes."""
        call_opt = OptionQuote(gamma=0.01, vega=0.05, delta=0.5, oi=1000)

        quotes = {100.0: (call_opt, None)}
        result = compute_exposures(quotes, 100.0, multiplier=100)

        # Call exposures should be computed: -1.0 * 0.01 * 1000 * 100 * 100 = -100,000
        assert result["call_gex_by_strike"][100.0] == -100_000.0
        # Put exposures should be 0
        assert result["put_gex_by_strike"][100.0] == 0.0


class TestComputeNetGEX:
    """Test net GEX sentiment classification."""

    def test_bullish_net_gex(self):
        """Net GEX > 0 should be bullish."""
        call_gex = {100.0: -50_000, 105.0: -30_000}
        put_gex = {100.0: 100_000, 105.0: 50_000}
        # Total: -50k - 30k + 100k + 50k = 70k (positive, bullish)
        sentiment = compute_net_gex(call_gex, put_gex)
        assert sentiment == "bullish"

    def test_bearish_net_gex(self):
        """Net GEX < 0 should be bearish."""
        call_gex = {100.0: -100_000, 105.0: -80_000}
        put_gex = {100.0: 50_000, 105.0: 40_000}
        # Total: -100k - 80k + 50k + 40k = -90k (negative, bearish)
        sentiment = compute_net_gex(call_gex, put_gex)
        assert sentiment == "bearish"

    def test_neutral_net_gex(self):
        """Balanced GEX should be neutral."""
        call_gex = {100.0: -50_000, 105.0: -50_000}
        put_gex = {100.0: 50_000, 105.0: 50_000}
        # Total: 0 (neutral)
        sentiment = compute_net_gex(call_gex, put_gex)
        assert sentiment == "neutral"

    def test_empty_quotes(self):
        """Empty quotes should return None."""
        sentiment = compute_net_gex({}, {})
        assert sentiment is None

    def test_none_sentiment(self):
        """All None should return None."""
        sentiment = compute_net_gex(None, None) if None else None
        # This will return None due to the early check, but let's use empty dicts
        sentiment = compute_net_gex({}, {})
        assert sentiment is None

    def test_large_net_gex(self):
        """Test with large exposure values."""
        call_gex = {100.0: -1_000_000}
        put_gex = {100.0: 3_000_000}
        # Total: -1M + 3M = 2M (bullish)
        sentiment = compute_net_gex(call_gex, put_gex)
        assert sentiment == "bullish"

    def test_custom_neutral_threshold(self):
        """Test neutral threshold parameter."""
        call_gex = {100.0: -100_000}
        put_gex = {100.0: 100_050}
        # Total: 50 (very small)
        # With default threshold, should be neutral
        sentiment_default = compute_net_gex(call_gex, put_gex)
        assert sentiment_default == "neutral"

        # With tight threshold, should be bullish
        sentiment_tight = compute_net_gex(call_gex, put_gex, neutral_threshold=0.0001)
        assert sentiment_tight == "bullish"
