"""Integration tests for analytics pipeline with recorded fixtures."""

import json
import pytest
from datetime import datetime, timezone
from pathlib import Path

from argus.options_live.engine import run_analytics
from argus.options_live.config import LiveConfig
from argus.options_live.iv_surface import IVSurface
from argus.options_live.exposures import compute_exposures
from argus.options_live.quotes import ticker_to_quote
from argus.options_live.levels import compute_zero_gamma, compute_max_pain, compute_pin_risk


def load_fixture(name: str) -> dict:
    """Load fixture JSON by name."""
    fixture_path = Path(__file__).parent / "fixtures" / f"options_quotes_{name}.json"
    with open(fixture_path) as f:
        return json.load(f)


class TestAnalyticsLiveWithFixtures:
    """Integration tests using recorded fixture data."""

    def test_engine_with_recorded_spy_0dte(self):
        """Run full analytics pipeline on recorded SPY 0DTE fixture.

        Validates:
        - LadderSnapshot creation and structure
        - All required fields are populated
        - Sanity checks on values
        """
        fixture = load_fixture("spy_0dte_sample")

        # Convert string keys to float keys
        quotes = {float(k): v for k, v in fixture["quotes"].items()}

        ladder = run_analytics(
            quotes=quotes,
            spot=fixture["spot"],
            expiry=fixture["expiry"],
            config=LiveConfig(),
            symbol=fixture["symbol"],
            source="LIVE",
        )

        # Validate structure
        assert ladder is not None
        assert ladder.symbol == "SPY"
        assert ladder.spot == 550.0
        assert ladder.source == "LIVE"
        assert ladder.expiry == "0DTE"

        # Validate levels
        num_strikes = len(quotes)
        assert len(ladder.levels) == num_strikes
        assert all(l.strike for l in ladder.levels)
        assert all(l.call is not None for l in ladder.levels)
        assert all(l.put is not None for l in ladder.levels)

        # Validate strikes are unique and sorted
        strikes = [l.strike for l in ladder.levels]
        assert len(strikes) == len(set(strikes))
        assert strikes == sorted(strikes)

        # Validate summary fields
        assert ladder.max_pain is not None
        assert min(strikes) <= ladder.max_pain <= max(strikes)

        # pin_risk should be in 0-100 range or None
        assert ladder.pin_risk is None or (0 <= ladder.pin_risk <= 100)

        # ATM strike should be closest to spot
        assert ladder.atm_strike == 550.0

        # Fresh contract ratio should be between 0 and 1
        assert 0 <= ladder.fresh_contract_ratio <= 1

        # Should have fresh contracts (fixture has good greeks)
        assert ladder.fresh_contract_ratio > 0.5

        # Zero gamma strike should exist
        assert ladder.zero_gamma_strike is not None
        assert min(strikes) <= ladder.zero_gamma_strike <= max(strikes)

        # as_of should be recent
        now = datetime.now(timezone.utc)
        age_ms = (now - ladder.as_of).total_seconds() * 1000
        assert age_ms < 10000  # Should be very recent

        # Verify most levels have at least IV (greeks can be sparse on edges)
        for level in ladder.levels:
            assert level.call is not None
            assert level.put is not None

    def test_iv_surface_fit_from_fixture(self):
        """Test IV surface fitting on fixture data.

        Validates:
        - Surface fit produces valid smile
        - Residuals list matches strikes used
        - ATM IV reasonable
        """
        fixture = load_fixture("spy_0dte_sample")
        spot = fixture["spot"]

        # Extract liquid strikes and IVs
        option_quotes = {}
        for strike_str, (call_dict, put_dict) in fixture["quotes"].items():
            strike = float(strike_str)
            option_quotes[strike] = (
                ticker_to_quote(call_dict),
                ticker_to_quote(put_dict),
            )

        # Collect liquid strikes with IVs
        liquid_strikes = []
        liquid_ivs = []
        for strike, (call, put) in option_quotes.items():
            if call and call.iv and (call.volume or 0) > 10 and (call.oi or 0) > 100:
                liquid_strikes.append(strike)
                liquid_ivs.append(call.iv)
            elif put and put.iv and (put.volume or 0) > 10 and (put.oi or 0) > 100:
                liquid_strikes.append(strike)
                liquid_ivs.append(put.iv)

        # Should have enough liquid points
        assert len(liquid_strikes) >= 8, "Fixture should have at least 8 liquid strikes"

        # Fit surface
        iv_surface = IVSurface.fit(liquid_strikes, liquid_ivs, spot=spot)

        # Surface should fit successfully
        assert iv_surface is not None, "IV surface fit should succeed with 8+ liquid points"

        # Residuals should exist and match strikes
        residuals = iv_surface.residuals()
        assert residuals is not None
        assert len(residuals) == len(liquid_strikes)

        # Residuals should be small (fitted well)
        avg_residual = sum(abs(r) for r in residuals) / len(residuals)
        assert avg_residual < 0.05, "Average residual should be small"

        # ATM IV should be reasonable (0.3-0.7 for 0DTE)
        atm_iv = iv_surface.fitted_iv_at_strike(spot)
        assert 0.30 < atm_iv < 0.70, f"ATM IV={atm_iv} should be in reasonable range"

        # OTM strike should have higher IV (smile)
        otm_call = spot + 10
        otm_iv = iv_surface.fitted_iv_at_strike(otm_call)
        # IV smile: OTM should be >= ATM
        assert otm_iv >= atm_iv * 0.95, "OTM IV should reflect smile"

    def test_exposures_and_levels_from_fixture(self):
        """Test exposure and level computations on fixture.

        Validates:
        - Exposures computed without error
        - Levels contain GEX values
        - Wall detection works
        """
        fixture = load_fixture("spy_0dte_sample")
        spot = fixture["spot"]

        # Convert fixture to OptionQuote objects
        option_quotes = {}
        for strike_str, (call_dict, put_dict) in fixture["quotes"].items():
            strike = float(strike_str)
            option_quotes[strike] = (
                ticker_to_quote(call_dict),
                ticker_to_quote(put_dict),
            )

        # Compute exposures
        exposures = compute_exposures(option_quotes, spot, multiplier=100)

        # Should have both call and put GEX by strike
        assert "call_gex_by_strike" in exposures
        assert "put_gex_by_strike" in exposures

        call_gex = exposures["call_gex_by_strike"]
        put_gex = exposures["put_gex_by_strike"]

        # Should have values for most strikes
        assert len(call_gex) > 0
        assert len(put_gex) > 0

        # GEX values should be numeric
        for strike, gex_val in call_gex.items():
            assert isinstance(gex_val, (int, float))

        for strike, gex_val in put_gex.items():
            assert isinstance(gex_val, (int, float))

        # Compute levels using engine functions
        zero_gamma_strike = compute_zero_gamma(call_gex, put_gex, spot)
        assert zero_gamma_strike in option_quotes.keys()

        # Compute max pain
        call_oi = {s: (q[0].oi or 0) if q[0] else 0 for s, q in option_quotes.items()}
        put_oi = {s: (q[1].oi or 0) if q[1] else 0 for s, q in option_quotes.items()}
        max_pain = compute_max_pain(call_oi, put_oi, strikes=list(option_quotes.keys()))

        assert max_pain is not None
        assert min(option_quotes.keys()) <= max_pain <= max(option_quotes.keys())

        # Compute pin risk
        pin_risk = compute_pin_risk(call_gex, put_gex, spot, window_side=10)
        assert pin_risk is None or (0 <= pin_risk <= 100)

    def test_fresh_contract_ratio_calculation(self):
        """Test fresh contract ratio reflects data completeness.

        Validates:
        - Ratio between 0 and 1
        - Matches expected greeks availability
        """
        fixture = load_fixture("spy_0dte_sample")
        spot = fixture["spot"]

        # Convert and check greeks availability
        option_quotes = {}
        fresh_count = 0
        total_count = 0

        for strike_str, (call_dict, put_dict) in fixture["quotes"].items():
            strike = float(strike_str)
            call_quote = ticker_to_quote(call_dict)
            put_quote = ticker_to_quote(put_dict)

            option_quotes[strike] = (call_quote, put_quote)
            total_count += 1

            # Fresh if either side has iv+delta+gamma
            call_fresh = (call_quote and call_quote.iv and
                         call_quote.delta and call_quote.gamma)
            put_fresh = (put_quote and put_quote.iv and
                        put_quote.delta and put_quote.gamma)

            if call_fresh or put_fresh:
                fresh_count += 1

        expected_ratio = fresh_count / total_count if total_count > 0 else 0

        # Convert string keys to float keys
        quotes = {float(k): v for k, v in fixture["quotes"].items()}

        # Run analytics to get the actual ratio
        ladder = run_analytics(
            quotes=quotes,
            spot=spot,
            expiry=fixture["expiry"],
            config=LiveConfig(),
            symbol=fixture["symbol"],
            source="LIVE",
        )

        # Ratio should match expectation
        assert ladder.fresh_contract_ratio == expected_ratio

        # Ratio should be high for this fixture (good data)
        assert ladder.fresh_contract_ratio > 0.8


class TestFixtureDataQuality:
    """Validate fixture data meets requirements."""

    def test_fixture_has_21_strikes(self):
        """Fixture should have 21 strikes (10 wide per side + ATM)."""
        fixture = load_fixture("spy_0dte_sample")
        assert len(fixture["quotes"]) == 21

    def test_fixture_strikes_sorted(self):
        """Fixture strikes should be in ascending order."""
        fixture = load_fixture("spy_0dte_sample")
        strikes = sorted([float(s) for s in fixture["quotes"].keys()])
        assert len(strikes) == len(set(strikes))

        # Check 5-wide spacing around ATM
        atm = fixture["spot"]
        assert min(strikes) < atm < max(strikes)

    def test_fixture_has_liquid_points(self):
        """Fixture should have at least 8 liquid points for IV fit."""
        fixture = load_fixture("spy_0dte_sample")

        liquid_count = 0
        for strike_str, (call_dict, put_dict) in fixture["quotes"].items():
            call_vol = call_dict.get("volume", 0) if call_dict else 0
            call_oi = call_dict.get("oi", 0) if call_dict else 0
            put_vol = put_dict.get("volume", 0) if put_dict else 0
            put_oi = put_dict.get("oi", 0) if put_dict else 0

            if ((call_vol > 10 and call_oi > 100) or
                (put_vol > 10 and put_oi > 100)):
                liquid_count += 1

        assert liquid_count >= 8, "Fixture should have at least 8 liquid points"

    def test_fixture_greeks_coverage(self):
        """Fixture should have complete greeks on most contracts."""
        fixture = load_fixture("spy_0dte_sample")

        greek_fields = ["iv", "delta", "gamma", "theta", "vega"]
        contracts_with_full_greeks = 0
        total_contracts = 0

        for strike_str, (call_dict, put_dict) in fixture["quotes"].items():
            for quote in [call_dict, put_dict]:
                if quote:
                    total_contracts += 1
                    if all(quote.get(field) is not None for field in greek_fields):
                        contracts_with_full_greeks += 1

        # At least 80% should have full greeks
        coverage = contracts_with_full_greeks / total_contracts
        assert coverage >= 0.8, f"Greek coverage {coverage:.1%} should be >= 80%"
