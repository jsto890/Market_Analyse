"""Tests for IV surface quadratic smile fitting."""

import numpy as np
from argus.options_live.iv_surface import IVSurface


def test_iv_surface_fit_quadratic():
    """Fit smile to 9 strikes, verify residuals and predictions."""
    # Create synthetic data: quadratic smile centered at ATM
    # IV(x) = 0.20 + 0.05*x + 0.10*x^2
    spot = 100.0
    strikes = np.array([80.0, 85.0, 90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0])

    # True coefficients
    a_true, b_true, c_true = 0.20, 0.05, 0.10

    # Compute log-moneyness and synthetic IVs
    x = np.log(strikes / spot)
    ivs = a_true + b_true * x + c_true * x ** 2

    # Add small noise to make it more realistic
    np.random.seed(42)
    ivs_noisy = ivs + np.random.normal(0, 0.002, len(ivs))

    # Fit the surface
    surface = IVSurface.fit(strikes.tolist(), ivs_noisy.tolist(), spot=spot)

    # Verify we got a surface
    assert surface is not None, "Fit should succeed with 9 points"

    # Check that coefficients are reasonable (should be close to true values)
    a, b, c = surface.coeffs
    assert 0.15 < a < 0.25, f"a={a} should be near 0.20"
    assert -0.05 < b < 0.15, f"b={b} should be near 0.05"
    assert 0.05 < c < 0.15, f"c={c} should be near 0.10"

    # Verify residuals exist and have correct length
    residuals = surface.residuals()
    assert len(residuals) == len(strikes), "Residuals should match strike count"

    # Verify residuals are small (noise should be recovered)
    residuals_arr = np.array(residuals)
    assert np.abs(residuals_arr).mean() < 0.01, "Mean residual should be small"

    # Test interpolation at ATM
    fitted_iv_atm = surface.fitted_iv_at_strike(spot)
    assert fitted_iv_atm is not None, "Should interpolate at ATM"
    assert 0.15 < fitted_iv_atm < 0.25, f"ATM IV={fitted_iv_atm} should be near 0.20"

    # Test interpolation at OTM call (higher strike)
    otm_strike = 110.0
    fitted_iv_otm = surface.fitted_iv_at_strike(otm_strike)
    assert fitted_iv_otm is not None, "Should interpolate at OTM"
    # OTM call should have higher IV due to positive c coefficient (smile)
    assert fitted_iv_otm > fitted_iv_atm, "OTM should have higher IV than ATM (smile)"


def test_iv_surface_insufficient_points():
    """Fit with <8 points returns None."""
    spot = 100.0

    # Test with 7 points (insufficient)
    strikes_7 = [90.0, 95.0, 100.0, 105.0, 110.0, 115.0, 120.0]
    ivs_7 = [0.22, 0.21, 0.20, 0.20, 0.21, 0.22, 0.23]

    surface = IVSurface.fit(strikes_7, ivs_7, spot=spot)
    assert surface is None, "Fit should return None with <8 points"

    # Test with 5 points
    strikes_5 = [90.0, 95.0, 100.0, 105.0, 110.0]
    ivs_5 = [0.22, 0.21, 0.20, 0.21, 0.22]

    surface = IVSurface.fit(strikes_5, ivs_5, spot=spot)
    assert surface is None, "Fit should return None with 5 points"

    # Test with 0 points
    surface = IVSurface.fit([], [], spot=spot)
    assert surface is None, "Fit should return None with 0 points"
