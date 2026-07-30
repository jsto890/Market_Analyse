"""Tests for options live transport layer (serialization and REST endpoints)."""
import pytest
import json
from datetime import datetime, timezone
from argus.options_live.models import (
    LadderSnapshot,
    StrikeLevelSnapshot,
    OptionQuote,
)
from argus.options_live.transport import serialize_ladder


class TestSerializeLadder:
    """Test serialize_ladder() function."""

    def test_serialize_ladder_all_fields_present(self):
        """Serialized ladder includes all required fields."""
        now = datetime.now(timezone.utc)
        ladder = LadderSnapshot(
            symbol="SPY",
            spot=450.0,
            as_of=now,
            source="LIVE",
            stale_ms=100,
            fresh_contract_ratio=0.95,
            expiry="0DTE",
            levels=[],
            atm_strike=450.0,
            zero_gamma_strike=450.5,
            call_wall_strike=455.0,
            put_wall_strike=445.0,
            max_pain=452.0,
            pin_risk=65.5,
            net_gex_band="bullish",
            msi_call_strike=455.0,
            msi_put_strike=445.0,
            msi_rationale="highest_gex",
            gex_profile_json='[{"strike": 450, "gex": 1000}]',
        )

        result = serialize_ladder(ladder)

        assert result["symbol"] == "SPY"
        assert result["spot"] == 450.0
        assert result["source"] == "LIVE"
        assert result["stale_ms"] == 100
        assert result["fresh_contract_ratio"] == 0.95
        assert result["expiry"] == "0DTE"
        assert result["atm_strike"] == 450.0
        assert result["zero_gamma_strike"] == 450.5
        assert result["call_wall_strike"] == 455.0
        assert result["put_wall_strike"] == 445.0
        assert result["max_pain"] == 452.0
        assert result["pin_risk"] == 65.5
        assert result["net_gex_band"] == "bullish"
        assert result["msi_call_strike"] == 455.0
        assert result["msi_put_strike"] == 445.0
        assert result["msi_rationale"] == "highest_gex"
        assert result["gex_profile_json"] == '[{"strike": 450, "gex": 1000}]'

    def test_serialize_ladder_as_of_isoformat(self):
        """Serialized as_of is ISO format string."""
        now = datetime(2026, 7, 28, 14, 30, 45, 123456, tzinfo=timezone.utc)
        ladder = LadderSnapshot(
            symbol="SPY",
            spot=450.0,
            as_of=now,
            source="LIVE",
            stale_ms=0,
            fresh_contract_ratio=0.0,
            expiry="0DTE",
        )

        result = serialize_ladder(ladder)

        assert isinstance(result["as_of"], str)
        assert result["as_of"] == "2026-07-28T14:30:45.123456+00:00"

    def test_serialize_ladder_with_levels(self):
        """Serialized levels include all 14 fields per call/put."""
        ladder = LadderSnapshot(
            symbol="SPY",
            spot=450.0,
            as_of=datetime.now(timezone.utc),
            source="LIVE",
            stale_ms=50,
            fresh_contract_ratio=0.8,
            expiry="0DTE",
            levels=[
                StrikeLevelSnapshot(
                    strike=450.0,
                    call=OptionQuote(
                        bid=2.5,
                        ask=2.6,
                        mid=2.55,
                        spread_pct=0.39,
                        iv=0.18,
                        delta=0.65,
                        gamma=0.001,
                        theta=-0.05,
                        vega=0.02,
                        rho=0.03,
                        volume=100,
                        oi=1000,
                        stale_ms=25,
                        liquid=True,
                    ),
                    put=OptionQuote(
                        bid=1.8,
                        ask=1.9,
                        mid=1.85,
                        spread_pct=0.54,
                        iv=0.19,
                        delta=-0.35,
                        gamma=0.001,
                        theta=-0.02,
                        vega=0.02,
                        rho=-0.01,
                        volume=150,
                        oi=1200,
                        stale_ms=30,
                        liquid=True,
                    ),
                    zero_gamma_side="both",
                    wall_type="none",
                    gex_by_strike=5000.0,
                    max_pain_delta=1.0,
                )
            ],
        )

        result = serialize_ladder(ladder)

        assert len(result["levels"]) == 1
        level = result["levels"][0]

        # Check strike
        assert level["strike"] == 450.0

        # Check call (14 fields)
        call = level["call"]
        assert call["bid"] == 2.5
        assert call["ask"] == 2.6
        assert call["mid"] == 2.55
        assert call["spread_pct"] == 0.39
        assert call["iv"] == 0.18
        assert call["delta"] == 0.65
        assert call["gamma"] == 0.001
        assert call["theta"] == -0.05
        assert call["vega"] == 0.02
        assert call["rho"] == 0.03
        assert call["volume"] == 100
        assert call["oi"] == 1000
        assert call["stale_ms"] == 25
        assert call["liquid"] is True

        # Check put (14 fields)
        put = level["put"]
        assert put["bid"] == 1.8
        assert put["ask"] == 1.9
        assert put["mid"] == 1.85
        assert put["spread_pct"] == 0.54
        assert put["iv"] == 0.19
        assert put["delta"] == -0.35
        assert put["gamma"] == 0.001
        assert put["theta"] == -0.02
        assert put["vega"] == 0.02
        assert put["rho"] == -0.01
        assert put["volume"] == 150
        assert put["oi"] == 1200
        assert put["stale_ms"] == 30
        assert put["liquid"] is True

        # Check level metadata
        assert level["zero_gamma_side"] == "both"
        assert level["wall_type"] == "none"
        assert level["gex_by_strike"] == 5000.0
        assert level["max_pain_delta"] == 1.0

    def test_serialize_ladder_level_has_split_gex(self):
        """Each serialized level carries call_gex_by_strike and put_gex_by_strike
        as distinct fields, not the same combined value twice."""
        ladder = LadderSnapshot(
            symbol="SPY", spot=450.0, as_of=datetime.now(timezone.utc),
            source="LIVE", stale_ms=0, fresh_contract_ratio=1.0, expiry="0DTE",
            levels=[
                StrikeLevelSnapshot(
                    strike=450.0,
                    call=OptionQuote(bid=2.5, ask=2.6, mid=2.55),
                    put=OptionQuote(bid=1.8, ask=1.9, mid=1.85),
                    gex_by_strike=5000.0,
                    call_gex_by_strike=3200.0,
                    put_gex_by_strike=1800.0,
                )
            ],
        )

        result = serialize_ladder(ladder)
        level = result["levels"][0]

        assert level["call_gex_by_strike"] == 3200.0
        assert level["put_gex_by_strike"] == 1800.0
        assert level["call_gex_by_strike"] != level["put_gex_by_strike"]

    def test_serialize_ladder_with_none_values(self):
        """Serialized ladder handles None values gracefully."""
        ladder = LadderSnapshot(
            symbol="SPY",
            spot=450.0,
            as_of=datetime.now(timezone.utc),
            source="EOD",
            stale_ms=0,
            fresh_contract_ratio=0.0,
            expiry="0DTE",
            levels=[
                StrikeLevelSnapshot(
                    strike=450.0,
                    call=OptionQuote(),  # All None
                    put=OptionQuote(),  # All None
                    zero_gamma_side=None,
                    wall_type=None,
                    gex_by_strike=None,
                    max_pain_delta=None,
                )
            ],
            atm_strike=450.0,
            zero_gamma_strike=None,
            call_wall_strike=None,
            put_wall_strike=None,
            max_pain=None,
            pin_risk=None,
            net_gex_band=None,
            msi_call_strike=None,
            msi_put_strike=None,
            msi_rationale=None,
            gex_profile_json=None,
        )

        result = serialize_ladder(ladder)

        # Top-level
        assert result["zero_gamma_strike"] is None
        assert result["call_wall_strike"] is None
        assert result["max_pain"] is None
        assert result["gex_profile_json"] is None

        # Level
        level = result["levels"][0]
        assert level["call"]["bid"] is None
        assert level["call"]["iv"] is None
        assert level["zero_gamma_side"] is None
        assert level["gex_by_strike"] is None

    def test_serialize_ladder_json_serializable(self):
        """Serialized ladder can be JSON-encoded."""
        ladder = LadderSnapshot(
            symbol="QQQ",
            spot=420.5,
            as_of=datetime.now(timezone.utc),
            source="FROZEN",
            stale_ms=200,
            fresh_contract_ratio=0.85,
            expiry="1DTE",
            levels=[
                StrikeLevelSnapshot(
                    strike=420.0,
                    call=OptionQuote(bid=3.0, ask=3.1, iv=0.2),
                    put=OptionQuote(bid=2.0, ask=2.1, iv=0.21),
                )
            ],
            atm_strike=420.0,
            max_pain=421.0,
            pin_risk=55.0,
        )

        result = serialize_ladder(ladder)

        # Should be JSON-serializable
        json_str = json.dumps(result)
        assert len(json_str) > 0

        # Deserialize and verify
        deserialized = json.loads(json_str)
        assert deserialized["symbol"] == "QQQ"
        assert deserialized["spot"] == 420.5

    def test_serialize_ladder_multiple_levels(self):
        """Serialized ladder with multiple levels."""
        levels = [
            StrikeLevelSnapshot(
                strike=float(strike),
                call=OptionQuote(bid=2.0, iv=0.18),
                put=OptionQuote(bid=1.0, iv=0.19),
            )
            for strike in range(440, 461, 2)
        ]

        ladder = LadderSnapshot(
            symbol="SPY",
            spot=450.0,
            as_of=datetime.now(timezone.utc),
            source="LIVE",
            stale_ms=50,
            fresh_contract_ratio=0.9,
            expiry="0DTE",
            levels=levels,
        )

        result = serialize_ladder(ladder)

        assert len(result["levels"]) == len(levels)
        assert result["levels"][0]["strike"] == 440.0
        assert result["levels"][-1]["strike"] == 460.0

    def test_serialize_ladder_preserves_numeric_precision(self):
        """Serialized ladder preserves floating-point precision."""
        ladder = LadderSnapshot(
            symbol="IWM",
            spot=202.123456,
            as_of=datetime.now(timezone.utc),
            source="LIVE",
            stale_ms=75,
            fresh_contract_ratio=0.876543,
            expiry="0DTE",
            levels=[
                StrikeLevelSnapshot(
                    strike=200.987654,
                    call=OptionQuote(
                        bid=2.123,
                        ask=2.456,
                        mid=2.2895,
                        spread_pct=0.1468,
                        iv=0.18765432,
                        delta=0.654321,
                        gamma=0.0012345,
                    ),
                    put=OptionQuote(iv=0.19876543),
                )
            ],
            atm_strike=200.987654,
            max_pain=201.654321,
            pin_risk=75.123456,
        )

        result = serialize_ladder(ladder)

        # Numeric values should be preserved
        assert result["spot"] == 202.123456
        assert result["fresh_contract_ratio"] == 0.876543
        level = result["levels"][0]
        assert level["strike"] == 200.987654
        assert level["call"]["iv"] == pytest.approx(0.18765432, rel=1e-6)
        assert result["pin_risk"] == pytest.approx(75.123456, rel=1e-6)


class TestRESTEndpoint:
    """Test REST endpoint /api/options/live/{symbol}.

    Note: Comprehensive REST tests require pytest-asyncio and mocking Session.
    Basic integration testing is covered in smoke tests (test_options_smoke).
    """

    def test_endpoint_imports_successfully(self):
        """Verify REST endpoint is properly defined in routes."""
        from argus.api.routes import build_app

        app = build_app()

        # Check that the endpoint is registered
        routes = [route.path for route in app.routes]
        assert any("/api/options/live/{symbol}" in route for route in routes), \
            "Endpoint /api/options/live/{symbol} not found in routes"
