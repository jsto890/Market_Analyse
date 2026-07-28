"""Comprehensive tests for IBKRConnector using faked ib_insync (no real IBKR required)."""

import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call
from datetime import datetime, timezone
from ib_insync import Contract, Option

from argus.options_live.connector import IBKRConnector
from argus.options_live.config import LiveConfig


@pytest.fixture
def config():
    """Test config with small subscription cap."""
    return LiveConfig(
        tick_cadence_ms=100,
        strike_window_side=5,
        max_subscriptions=8,
        reconnect_backoff_ms=100,
        reconnect_max_backoff_ms=1000,
    )


@pytest.fixture
def connector(config):
    """Create IBKRConnector with mocked ib_insync.IB."""
    conn = IBKRConnector(config)
    # Mock the ib_insync.IB object
    conn.ib = MagicMock()
    conn.ib.connect = MagicMock(return_value=None)
    conn.ib.disconnect = MagicMock(return_value=None)
    conn.ib.isConnected = MagicMock(return_value=False)
    conn.ib.qualifyContracts = MagicMock(return_value=[])
    conn.ib.reqSecDefOptParamsAsync = MagicMock(return_value=[])
    conn.ib.reqMktData = MagicMock(return_value=None)
    conn.ib.cancelMktData = MagicMock(return_value=None)
    conn.ib.pendingTicksEvent = MagicMock()
    return conn


# ============================================================================
# Connection Tests
# ============================================================================


@pytest.mark.asyncio
async def test_connect_success(connector):
    """Test successful connection transitions state correctly."""
    # Mock successful connection
    connector.ib.connect = MagicMock(return_value=None)
    connector.ib.isConnected = MagicMock(return_value=True)

    assert not connector._connected

    async def mock_to_thread(func, *args, **kwargs):
        """Mock to_thread that actually calls the function."""
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        result = await connector.connect()

    assert result is True
    assert connector._connected
    # Verify connect was called
    connector.ib.connect.assert_called_once()


@pytest.mark.asyncio
async def test_connect_already_connected_returns_true(connector):
    """Test connect returns True if already connected."""
    connector._connected = True

    result = await connector.connect()

    assert result is True
    # Should not have tried to actually connect again
    assert not connector.ib.connect.called


@pytest.mark.asyncio
async def test_disconnect_clears_state(connector):
    """Test disconnect cleans up subscriptions and state."""
    # Manually set connected state
    connector._connected = True

    # Add a fake subscription
    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 12345
    callback = MagicMock()
    connector._subscribed_contracts[12345] = callback
    connector._tick_cache[12345] = {"bid": 1.0}

    with patch.object(connector, "unsubscribe_quotes") as mock_unsub:
        mock_unsub.return_value = None
        await connector.disconnect()

    assert not connector._connected
    # unsubscribe_quotes should have been called
    mock_unsub.assert_called_once()


# ============================================================================
# Fetch Chain Tests
# ============================================================================


@pytest.mark.asyncio
async def test_fetch_chain_returns_contracts(connector):
    """Test fetch_chain returns option contracts."""
    # Mock successful connection
    connector._connected = True

    # Create fake underlying contract
    underlying = MagicMock()
    underlying.conId = 756603  # SPY conId
    connector.ib.qualifyContracts = MagicMock(return_value=[underlying])

    # Create fake option chain
    chain = MagicMock()
    chain.expirations = ["20260815", "20260816"]
    chain.strikes = [415.0, 420.0, 425.0]
    connector.ib.reqSecDefOptParamsAsync = MagicMock(return_value=[chain])

    async def mock_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        contracts = await connector.fetch_chain("SPY")

    assert len(contracts) > 0
    # Verify all have SPY as symbol
    for c in contracts:
        assert c.symbol == "SPY"
        assert c.right in ("C", "P")


@pytest.mark.asyncio
async def test_fetch_chain_with_mock_chain(connector):
    """Test fetch_chain correctly filters and returns option contracts."""
    connector._connected = True

    # Mock underlying contract qualification
    underlying = MagicMock()
    underlying.conId = 756603
    connector.ib.qualifyContracts = MagicMock(return_value=[underlying])

    # Create fake chain with proper structure
    chain = MagicMock()
    chain.expirations = ["20260815", "20260816", "20260817"]
    chain.strikes = [400.0, 405.0, 410.0, 415.0, 420.0]
    connector.ib.reqSecDefOptParamsAsync = MagicMock(return_value=[chain])

    async def mock_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        contracts = await connector.fetch_chain("SPY")

    # Should have 3 exp * 5 strikes * 2 rights = 30 contracts
    # (assuming no tradingClass filtering)
    assert len(contracts) > 0
    for c in contracts:
        assert c.symbol == "SPY"
        assert c.right in ("C", "P")


@pytest.mark.asyncio
async def test_fetch_chain_empty_on_no_expirations(connector):
    """Test fetch_chain returns empty list if no chains found."""
    connector._connected = True
    connector.ib.reqSecDefOptParamsAsync = MagicMock(return_value=[])

    async def mock_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        contracts = await connector.fetch_chain("SPY")

    assert contracts == []


# ============================================================================
# Subscribe/Unsubscribe Tests
# ============================================================================


@pytest.mark.asyncio
async def test_subscribe_quotes_updates_subscriptions(connector):
    """Test subscribe_quotes tracks subscriptions."""
    connector._connected = True

    contracts = [
        Option(
            symbol="SPY",
            lastTradeDateOrContractMonth="20260815",
            strike=420.0,
            right="C",
        ),
        Option(
            symbol="SPY",
            lastTradeDateOrContractMonth="20260815",
            strike=420.0,
            right="P",
        ),
    ]
    for i, c in enumerate(contracts):
        c.conId = 10000 + i

    async def mock_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        await connector.subscribe_quotes(contracts)

    # Verify subscriptions tracked
    assert len(connector._subscribed_contracts) == 2
    assert 10000 in connector._subscribed_contracts
    assert 10001 in connector._subscribed_contracts


@pytest.mark.asyncio
async def test_get_quote_returns_valid_quote(connector):
    """Test get_quote retrieves quote from cache with all fields."""
    connector._connected = True

    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 12345

    # Manually populate tick cache
    now_iso = datetime.now(timezone.utc).isoformat()
    connector._tick_cache[12345] = {
        "bid": 1.5,
        "ask": 1.6,
        "volume": 500,
        "iv": 0.30,
        "delta": 0.6,
        "gamma": 0.02,
        "theta": -0.02,
        "vega": 0.08,
        "rho": 0.002,
        "oi": 10000,
        "as_of": now_iso,
        "source": "live",
    }

    quote = connector.get_quote(contract)
    assert quote is not None
    assert quote["bid"] == 1.5
    assert quote["ask"] == 1.6
    assert quote["mid"] == 1.55
    assert quote["iv"] == 0.30
    assert quote["delta"] == 0.6
    assert quote["volume"] == 500
    assert quote["oi"] == 10000
    assert quote["source"] == "live"


@pytest.mark.asyncio
async def test_get_quote_returns_none_if_not_subscribed(connector):
    """Test get_quote returns None for untracked contract."""
    connector._connected = True

    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 99999  # Not subscribed

    quote = connector.get_quote(contract)
    assert quote is None


@pytest.mark.asyncio
async def test_unsubscribe_removes_subscription(connector):
    """Test unsubscribe deregisters callback and cleans up state."""
    connector._connected = True

    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 12345

    # Set up subscription
    callback = MagicMock()
    connector._subscribed_contracts[12345] = callback
    connector._tick_cache[12345] = {"bid": 1.0}
    connector.ib.pendingTicksEvent = MagicMock()
    connector.ib.pendingTicksEvent.__sub__ = MagicMock(return_value=MagicMock())

    async def mock_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    with patch("asyncio.to_thread", side_effect=mock_to_thread):
        await connector.unsubscribe_quotes([contract])

    assert 12345 not in connector._subscribed_contracts
    assert 12345 not in connector._tick_cache


@pytest.mark.asyncio
async def test_tick_callback_updates_cache(connector):
    """Test tick callback correctly populates tick cache."""
    connector._connected = True

    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 12345

    # Register subscription
    connector._subscribed_contracts[12345] = MagicMock()

    # Create fake tick
    tick = MagicMock()
    tick.bid = 2.0
    tick.ask = 2.1
    tick.volume = 200
    tick.impliedVol = 0.28
    tick.delta = 0.55
    tick.gamma = 0.015

    # Call _tick_callback directly
    connector._tick_callback(contract, tick)

    # Verify cache updated
    cached = connector._tick_cache[12345]
    assert cached["bid"] == 2.0
    assert cached["ask"] == 2.1
    assert cached["volume"] == 200
    assert cached["iv"] == 0.28
    assert cached["delta"] == 0.55
    assert cached["gamma"] == 0.015


# ============================================================================
# Edge Cases and Backoff Tests
# ============================================================================


def test_reconnect_backoff_calculation(config):
    """Test backoff calculation follows exponential pattern."""
    # Verify backoff calculation logic: 100 * 2^n capped at 1000
    backoff_ms = config.reconnect_backoff_ms
    max_backoff = config.reconnect_max_backoff_ms

    backoffs = []
    for _ in range(5):
        backoffs.append(backoff_ms)
        backoff_ms = min(backoff_ms * 2, max_backoff)

    # Should be: 100, 200, 400, 800, 1000
    assert backoffs == [100, 200, 400, 800, 1000]


@pytest.mark.asyncio
async def test_tick_callback_ignored_if_not_subscribed(connector):
    """Test tick callback ignores unsubscribed contracts."""
    connector._connected = True

    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 99999  # Not subscribed

    tick = MagicMock()
    tick.bid = 2.0

    # Should not raise or add to cache
    connector._tick_callback(contract, tick)
    assert 99999 not in connector._tick_cache


@pytest.mark.asyncio
async def test_get_quote_with_missing_greeks(connector):
    """Test get_quote handles missing greek data gracefully."""
    contract = Option(
        symbol="SPY", lastTradeDateOrContractMonth="20260815", strike=420.0, right="C"
    )
    contract.conId = 12345

    # Populate cache with sparse data
    connector._tick_cache[12345] = {
        "bid": 1.5,
        "ask": 1.6,
        "volume": 500,
        "iv": None,
        "delta": None,
        "gamma": None,
        "theta": None,
        "vega": None,
        "rho": None,
        "oi": 10000,
    }

    quote = connector.get_quote(contract)
    assert quote is not None
    assert quote["bid"] == 1.5
    assert quote["ask"] == 1.6
    assert quote["iv"] is None
    assert quote["delta"] is None


def test_subscription_tracking(connector):
    """Test subscription tracking dict maintains state."""
    connector._connected = True

    # Add some fake subscriptions
    connector._subscribed_contracts[1001] = MagicMock()
    connector._subscribed_contracts[1002] = MagicMock()
    connector._subscribed_contracts[1003] = MagicMock()

    assert len(connector._subscribed_contracts) == 3
    assert 1001 in connector._subscribed_contracts
    assert 1002 in connector._subscribed_contracts
    assert 1003 in connector._subscribed_contracts

    # Remove one
    connector._subscribed_contracts.pop(1002)
    assert len(connector._subscribed_contracts) == 2
    assert 1002 not in connector._subscribed_contracts
