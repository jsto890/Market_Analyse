"""Tests MSI/MTC strike selection."""

import pytest
from argus.options_live.msi_mtc import select_msi_mtc


class TestMSISelection:
    """Test Most Stacked Interest strike selection."""

    def test_msi_call_highest_concentration(self):
        """MSI call = strike with max absolute GEX."""
        call_gex = {100.0: -50_000, 102.0: -100_000, 104.0: 80_000}
        put_gex = {}
        spot = 101.0

        msi_call, msi_put, rationale = select_msi_mtc(call_gex, put_gex, spot)

        # Max absolute GEX is |-100_000| at strike 102.0
        assert msi_call == 102.0
        assert msi_put is None
        assert "MSI call 102.0" in rationale

    def test_msi_put_highest_concentration(self):
        """MSI put = strike with max absolute GEX."""
        call_gex = {}
        put_gex = {100.0: 75_000, 99.0: 150_000, 98.0: 50_000}
        spot = 101.0

        msi_call, msi_put, rationale = select_msi_mtc(call_gex, put_gex, spot)

        # Max absolute GEX is |150_000| at strike 99.0
        assert msi_call is None
        assert msi_put == 99.0
        assert "MSI put 99.0" in rationale

    def test_msi_both_sides(self):
        """MSI selection on both call and put sides."""
        call_gex = {100.0: -30_000, 102.0: -120_000, 104.0: 90_000}
        put_gex = {98.0: 60_000, 100.0: 110_000, 102.0: 40_000}
        spot = 101.0

        msi_call, msi_put, rationale = select_msi_mtc(call_gex, put_gex, spot)

        assert msi_call == 102.0  # max abs is |-120_000|
        assert msi_put == 100.0   # max abs is |110_000|
        assert "MSI call 102.0" in rationale
        assert "MSI put 100.0" in rationale

    def test_msi_empty_dicts(self):
        """Handle empty dicts (return None)."""
        call_gex = {}
        put_gex = {}
        spot = 101.0

        msi_call, msi_put, rationale = select_msi_mtc(call_gex, put_gex, spot)

        assert msi_call is None
        assert msi_put is None
        assert rationale == ""

    def test_msi_empty_calls_with_puts(self):
        """Handle empty calls dict with valid puts."""
        call_gex = {}
        put_gex = {100.0: 80_000}
        spot = 101.0

        msi_call, msi_put, rationale = select_msi_mtc(call_gex, put_gex, spot)

        assert msi_call is None
        assert msi_put == 100.0
        assert "MSI put" in rationale

    def test_msi_rationale_prefix(self):
        """Rationale includes prefix when provided."""
        call_gex = {102.0: -100_000}
        put_gex = {100.0: 100_000}
        spot = 101.0

        _, _, rationale = select_msi_mtc(
            call_gex, put_gex, spot, rationale_prefix="wall_call"
        )

        assert rationale.startswith("wall_call:")
        assert "MSI call 102.0" in rationale
        assert "MSI put 100.0" in rationale

    def test_msi_negative_gex_absolute_value(self):
        """Correctly use absolute value for negative GEX."""
        call_gex = {100.0: -5_000, 102.0: -200_000, 104.0: 30_000}
        put_gex = {}
        spot = 101.0

        msi_call, _, _ = select_msi_mtc(call_gex, put_gex, spot)

        # |-200_000| is larger than |-5_000| or |30_000|
        assert msi_call == 102.0

    def test_msi_single_strike(self):
        """Handle single strike in each dict."""
        call_gex = {100.0: -50_000}
        put_gex = {100.0: 50_000}
        spot = 100.0

        msi_call, msi_put, _ = select_msi_mtc(call_gex, put_gex, spot)

        assert msi_call == 100.0
        assert msi_put == 100.0
