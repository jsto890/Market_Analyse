"""Session lifecycle & subscription accounting with tick coalescing."""

import asyncio
import logging
from typing import Optional, Dict, List
from datetime import datetime, timezone
from dataclasses import dataclass, field

from ib_insync import Contract

from .config import LiveConfig
from .connector import IBKRConnector
from .models import LadderSnapshot
from .engine import run_analytics

logger = logging.getLogger(__name__)


@dataclass
class SymbolSession:
    """Per-symbol session tracking subscription state."""
    symbol: str
    expiry: str
    window_side: int
    active: bool = True
    contracts_subscribed: List[Contract] = field(default_factory=list)
    tick_buffer: Dict[int, dict] = field(default_factory=dict)  # {contract_id: latest_tick}
    last_coalesce_time: Optional[datetime] = None


class Session:
    """Manages per-symbol options subscriptions with tick coalescing.

    Lifecycle:
    - subscribe(): Add symbol to watch list; if cap exceeded, halve window_side for all
    - tick_and_coalesce(): Collect ticks, return LadderSnapshot when coalesce interval met
    - unsubscribe(): Remove symbol, cleanup contracts
    """

    def __init__(self, config: LiveConfig):
        """Initialize session with connector and empty subscriptions.

        Args:
            config: LiveConfig with max_subscriptions, tick_cadence_ms, strike_window_side
        """
        self.config = config
        self.connector = IBKRConnector(config)
        self.active_subscriptions: Dict[str, SymbolSession] = {}  # {symbol: SymbolSession}
        self.subscription_count = 0

    async def connect(self) -> bool:
        """Connect IBKR connector."""
        return await self.connector.connect()

    async def disconnect(self) -> None:
        """Disconnect and cleanup all subscriptions."""
        for session in list(self.active_subscriptions.values()):
            await self.unsubscribe(session.symbol)
        await self.connector.disconnect()

    async def subscribe(self, symbol: str, expiry: str) -> bool:
        """Subscribe to options for symbol/expiry.

        If subscription count reaches max_subscriptions, halve strike_window for all
        active subscriptions and log a warning.

        Args:
            symbol: Stock symbol (e.g., "SPY")
            expiry: Expiry string (e.g., "0DTE", "2026-08-15")

        Returns:
            True if subscription succeeded; False if fetch_chain failed
        """
        if symbol in self.active_subscriptions:
            logger.warning("Symbol %s already subscribed", symbol)
            return True

        # Fetch option chain, narrowed to what we intend to subscribe to
        window_side = self.config.strike_window_side
        contracts = await self.connector.fetch_chain(symbol, expiry, window_side)
        if not contracts:
            logger.error("Failed to fetch chain for %s", symbol)
            return False

        # Create session
        session = SymbolSession(
            symbol=symbol,
            expiry=expiry,
            window_side=window_side,
            contracts_subscribed=contracts,
        )

        # Subscribe to quotes
        await self.connector.subscribe_quotes(contracts)

        self.active_subscriptions[symbol] = session
        self.subscription_count += 1
        logger.info("Subscribed to %s (expiry=%s); subscription_count=%d",
                   symbol, expiry, self.subscription_count)

        # Check soft cap
        if self.subscription_count >= self.config.max_subscriptions:
            logger.warning(
                "Subscription cap reached (%d >= %d); halving window_side for all active subs",
                self.subscription_count, self.config.max_subscriptions
            )
            for active_session in self.active_subscriptions.values():
                if active_session.window_side > 1:
                    active_session.window_side = max(1, active_session.window_side // 2)

        return True

    async def unsubscribe(self, symbol: str) -> None:
        """Unsubscribe from symbol and cleanup.

        Args:
            symbol: Symbol to remove
        """
        if symbol not in self.active_subscriptions:
            logger.warning("Symbol %s not subscribed", symbol)
            return

        session = self.active_subscriptions[symbol]

        # Unsubscribe from quotes
        await self.connector.unsubscribe_quotes(session.contracts_subscribed)

        # Remove session
        del self.active_subscriptions[symbol]
        self.subscription_count -= 1
        logger.info("Unsubscribed from %s; subscription_count=%d",
                   symbol, self.subscription_count)

    async def tick_and_coalesce(self) -> Optional[LadderSnapshot]:
        """Collect ticks from connector, coalesce at tick_cadence_ms interval.

        Per symbol session:
        1. Collect all pending ticks from connector tick_cache
        2. Store in tick_buffer
        3. Check if tick_cadence_ms elapsed since last_coalesce_time
        4. If coalescing, run_analytics() and return LadderSnapshot
        5. If not coalescing, return None

        Returns:
            LadderSnapshot if coalesce interval met; None otherwise

        Note:
            Only processes the first active symbol. Multi-symbol support requires
            returning a dict or list.
        """
        if not self.active_subscriptions:
            return None

        # For now, process first active symbol
        symbol = next(iter(self.active_subscriptions.keys()))
        session = self.active_subscriptions[symbol]

        # Collect ticks from connector
        for contract in session.contracts_subscribed:
            cid = contract.conId
            if cid in self.connector._tick_cache:
                session.tick_buffer[cid] = self.connector._tick_cache[cid]

        # Check coalesce cadence
        now = datetime.now(timezone.utc)
        if session.last_coalesce_time is None:
            session.last_coalesce_time = now
            return None

        elapsed_ms = (now - session.last_coalesce_time).total_seconds() * 1000
        if elapsed_ms < self.config.tick_cadence_ms:
            return None

        # Time to coalesce
        session.last_coalesce_time = now

        # Build quotes dict from tick_buffer and contracts
        quotes = {}
        for contract in session.contracts_subscribed:
            strike = contract.strike
            if strike not in quotes:
                quotes[strike] = (None, None)

            cid = contract.conId
            tick_data = session.tick_buffer.get(cid)
            if tick_data:
                if contract.right == "C":
                    quotes[strike] = (tick_data, quotes[strike][1])
                else:  # "P"
                    quotes[strike] = (quotes[strike][0], tick_data)

        # Run analytics
        try:
            ladder = run_analytics(
                quotes=quotes,
                spot=self._get_spot_price(symbol),
                expiry=session.expiry,
                config=self.config,
                symbol=symbol,
                source="LIVE",
            )
            logger.debug("Coalesced %s: %d strikes", symbol, len(ladder.levels))
            return ladder
        except Exception as e:
            logger.error("Analytics failed for %s: %s", symbol, e)
            return None

    def _get_spot_price(self, symbol: str) -> float:
        """Get current spot price (stub; requires quote feed in full impl)."""
        # In full implementation, would query live spot from connector
        # For now, return 0.0 as placeholder
        return 0.0
