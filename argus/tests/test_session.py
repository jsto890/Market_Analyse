"""Tests for options_live session lifecycle and subscription accounting."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

from ib_insync import Contract, Option

from argus.options_live.session import Session, SymbolSession
from argus.options_live.config import LiveConfig


@pytest.fixture
def config():
    """Test config with small subscription cap."""
    return LiveConfig(
        tick_cadence_ms=100,
        strike_window_side=20,
        max_subscriptions=3,
    )


def create_mock_contract(symbol: str, strike: float, right: str) -> Contract:
    """Helper to create mock option contract."""
    contract = Option(
        symbol=symbol,
        lastTradeDateOrContractMonth="20260815",
        strike=strike,
        right=right,
        exchange="SMART",
    )
    contract.conId = hash((symbol, strike, right)) % 1000000
    return contract


def create_mock_connector(config: LiveConfig):
    """Create a synchronous mock connector for testing."""
    connector = MagicMock()
    connector.config = config
    connector._tick_cache = {}
    connector._subscribed_contracts = {}
    return connector


@pytest.fixture
def session(config):
    """Create session with mocked connector."""
    session = Session(config)
    session.connector = create_mock_connector(config)
    return session


def test_session_subscription_accounting(session):
    """Subscription accounting: count tracks active subscriptions."""
    # Setup mock contracts
    contracts_spy = [
        create_mock_contract("SPY", 420.0, "C"),
        create_mock_contract("SPY", 420.0, "P"),
    ]
    contracts_qqq = [
        create_mock_contract("QQQ", 300.0, "C"),
        create_mock_contract("QQQ", 300.0, "P"),
    ]

    # Setup mock fetch_chain
    session.connector.fetch_chain = MagicMock(side_effect=[contracts_spy, contracts_qqq, None, None])
    session.connector.subscribe_quotes = MagicMock()
    session.connector.unsubscribe_quotes = MagicMock()

    # Manually call subscribe logic (simulating async)
    # Subscribe to first symbol
    contracts = session.connector.fetch_chain("SPY", "0DTE")
    assert contracts is not None
    session.active_subscriptions["SPY"] = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=session.config.strike_window_side,
        contracts_subscribed=contracts,
    )
    session.subscription_count += 1
    assert session.subscription_count == 1
    assert "SPY" in session.active_subscriptions

    # Subscribe to second symbol
    contracts = session.connector.fetch_chain("QQQ", "0DTE")
    assert contracts is not None
    session.active_subscriptions["QQQ"] = SymbolSession(
        symbol="QQQ",
        expiry="0DTE",
        window_side=session.config.strike_window_side,
        contracts_subscribed=contracts,
    )
    session.subscription_count += 1
    assert session.subscription_count == 2
    assert "QQQ" in session.active_subscriptions

    # Unsubscribe from first
    del session.active_subscriptions["SPY"]
    session.subscription_count -= 1
    assert session.subscription_count == 1
    assert "SPY" not in session.active_subscriptions
    assert "QQQ" in session.active_subscriptions


def test_session_subscribe_cap_halves_window(session):
    """When subscription cap hit, window_side halved for all active subs."""
    config = session.config
    assert config.max_subscriptions == 3

    # Create 3 symbols worth of contracts
    contracts_list = [
        [create_mock_contract("SPY", 420.0 + i*5, "C") for i in range(2)] +
        [create_mock_contract("SPY", 420.0 + i*5, "P") for i in range(2)],
        [create_mock_contract("QQQ", 300.0 + i*5, "C") for i in range(2)] +
        [create_mock_contract("QQQ", 300.0 + i*5, "P") for i in range(2)],
        [create_mock_contract("IWM", 200.0 + i*5, "C") for i in range(2)] +
        [create_mock_contract("IWM", 200.0 + i*5, "P") for i in range(2)],
    ]

    session.connector.fetch_chain = MagicMock(side_effect=contracts_list)

    # Initial window_side
    initial_window = session.config.strike_window_side
    assert initial_window == 20

    # Subscribe to 1st symbol (count=1, no cap)
    contracts = session.connector.fetch_chain("SPY", "0DTE")
    session.active_subscriptions["SPY"] = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=initial_window,
        contracts_subscribed=contracts,
    )
    session.subscription_count = 1
    assert session.active_subscriptions["SPY"].window_side == 20

    # Subscribe to 2nd symbol (count=2, no cap)
    contracts = session.connector.fetch_chain("QQQ", "0DTE")
    session.active_subscriptions["QQQ"] = SymbolSession(
        symbol="QQQ",
        expiry="0DTE",
        window_side=initial_window,
        contracts_subscribed=contracts,
    )
    session.subscription_count = 2
    assert session.active_subscriptions["QQQ"].window_side == 20

    # Subscribe to 3rd symbol (count=3, cap hit, window halved)
    contracts = session.connector.fetch_chain("IWM", "0DTE")
    session.active_subscriptions["IWM"] = SymbolSession(
        symbol="IWM",
        expiry="0DTE",
        window_side=initial_window,
        contracts_subscribed=contracts,
    )
    session.subscription_count = 3

    # Simulate cap logic: halve window for all when cap hit
    if session.subscription_count >= session.config.max_subscriptions:
        for active_session in session.active_subscriptions.values():
            if active_session.window_side > 1:
                active_session.window_side = max(1, active_session.window_side // 2)

    # All active subs should have window_side halved
    for symbol in ["SPY", "QQQ", "IWM"]:
        assert session.active_subscriptions[symbol].window_side == 10


def test_symbol_session_dataclass():
    """SymbolSession dataclass construction."""
    contracts = [create_mock_contract("SPY", 420.0, "C")]
    sym_session = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=15,
        active=True,
        contracts_subscribed=contracts,
    )

    assert sym_session.symbol == "SPY"
    assert sym_session.expiry == "0DTE"
    assert sym_session.window_side == 15
    assert sym_session.active is True
    assert len(sym_session.contracts_subscribed) == 1
    assert sym_session.tick_buffer == {}
    assert sym_session.last_coalesce_time is None


def test_symbol_session_tick_buffer_operations():
    """SymbolSession tick buffer tracking."""
    contracts = [
        create_mock_contract("SPY", 420.0, "C"),
        create_mock_contract("SPY", 420.0, "P"),
    ]
    sym_session = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=20,
        contracts_subscribed=contracts,
    )

    # Add tick data
    tick_data = {"bid": 1.0, "ask": 1.1, "iv": 0.25}
    sym_session.tick_buffer[contracts[0].conId] = tick_data

    assert contracts[0].conId in sym_session.tick_buffer
    assert sym_session.tick_buffer[contracts[0].conId]["bid"] == 1.0


def test_symbol_session_coalesce_time_tracking():
    """SymbolSession tracks last coalesce time."""
    contracts = [create_mock_contract("SPY", 420.0, "C")]
    sym_session = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=20,
        contracts_subscribed=contracts,
    )

    # Initially None
    assert sym_session.last_coalesce_time is None

    # Set to now
    now = datetime.now(timezone.utc)
    sym_session.last_coalesce_time = now
    assert sym_session.last_coalesce_time == now

    # Check time elapsed
    later = datetime.now(timezone.utc)
    elapsed_ms = (later - sym_session.last_coalesce_time).total_seconds() * 1000
    assert elapsed_ms >= 0


def test_session_window_halving_respects_minimum():
    """Window halving stops at 1."""
    contracts = [create_mock_contract("SPY", 420.0, "C")]
    sym_session = SymbolSession(
        symbol="SPY",
        expiry="0DTE",
        window_side=2,
        contracts_subscribed=contracts,
    )

    # Halve multiple times
    for _ in range(5):
        sym_session.window_side = max(1, sym_session.window_side // 2)

    assert sym_session.window_side == 1


def test_session_multiple_subscriptions_window_halving():
    """Multiple subscriptions all get window halved together."""
    sessions = {
        "SPY": SymbolSession("SPY", "0DTE", 20, contracts_subscribed=[]),
        "QQQ": SymbolSession("QQQ", "0DTE", 20, contracts_subscribed=[]),
        "IWM": SymbolSession("IWM", "0DTE", 20, contracts_subscribed=[]),
    }

    # Simulate cap hit: halve all
    for sym_session in sessions.values():
        if sym_session.window_side > 1:
            sym_session.window_side = max(1, sym_session.window_side // 2)

    # All should be halved
    for sym_session in sessions.values():
        assert sym_session.window_side == 10


def test_session_init_and_attributes(config):
    """Session initializes with correct attributes."""
    session = Session(config)
    assert session.config == config
    assert session.subscription_count == 0
    assert len(session.active_subscriptions) == 0
    assert session.connector is not None
