"""IBKR connector with hardened logic for live options quotes."""

import asyncio
import logging
from datetime import date
from typing import Callable, Optional

from ib_insync import IB, Contract, Option, Stock
from ib_insync.objects import OptionChain

from .config import LiveConfig

logger = logging.getLogger(__name__)


def resolve_expiry(expirations: list[str], expiry: str) -> Optional[str]:
    """Pick one IBKR expiration (YYYYMMDD) from the chain's list.

    Accepts the "0DTE" alias — the nearest expiration on or after today — or an
    explicit date in either YYYYMMDD or YYYY-MM-DD form. None when the requested
    date is not listed, which the caller must treat as a failure rather than
    subscribing to everything.
    """
    if not expirations:
        return None
    listed = sorted(expirations)
    if expiry.upper() == "0DTE":
        today = date.today().strftime("%Y%m%d")
        return next((e for e in listed if e >= today), None)
    wanted = expiry.replace("-", "")
    return wanted if wanted in listed else None


def select_strikes(strikes: list[float], spot: Optional[float], window_side: int) -> list[float]:
    """The window_side strikes either side of spot, spot's own strike included.

    Subscribing to a whole chain is what blows IBKR's line limit: SPY lists ~40
    expirations × ~200 strikes × 2 rights. Without a spot price there is nothing
    to centre on, so the window is taken around the middle of the listed strikes
    rather than silently returning all of them.
    """
    ordered = sorted(strikes)
    if not ordered or window_side <= 0:
        return ordered
    if spot is None:
        centre = len(ordered) // 2
    else:
        centre = min(range(len(ordered)), key=lambda i: abs(ordered[i] - spot))
    lo = max(0, centre - window_side)
    return ordered[lo:centre + window_side + 1]


class IBKRConnector:
    """Wraps ib_insync with IBKR-specific hardening."""

    def __init__(self, config: LiveConfig):
        self.config = config
        self.ib = IB()
        self._connected = False
        self._reconnect_backoff_ms = config.reconnect_backoff_ms
        self._subscribed_contracts = {}  # contract_id -> internal_tick_callback
        self._tick_cache = {}  # contract_id -> tick data dict

    async def connect(self) -> bool:
        """Lazy connect with exponential backoff.

        Returns True if connected or already connected.
        """
        if self._connected:
            return True

        backoff = self._reconnect_backoff_ms
        max_backoff = self.config.reconnect_max_backoff_ms

        while backoff <= max_backoff:
            try:
                await asyncio.to_thread(
                    self.ib.connect,
                    "127.0.0.1",
                    self.config.ibkr_port,
                    self.config.ibkr_clientId,
                )
                self._connected = True
                logger.info("IBKR connected on port %d", self.config.ibkr_port)
                self._reconnect_backoff_ms = self.config.reconnect_backoff_ms
                return True
            except Exception as e:
                logger.warning(
                    "IBKR connect failed (backoff %dms): %s",
                    backoff,
                    e,
                )
                await asyncio.sleep(backoff / 1000.0)
                backoff = min(backoff * 2, max_backoff)

        logger.error("IBKR connect exhausted backoff; giving up")
        return False

    async def disconnect(self) -> None:
        """Disconnect and clean up subscriptions."""
        if self._subscribed_contracts:
            await self.unsubscribe_quotes(
                [Contract(conId=cid) for cid in self._subscribed_contracts.keys()]
            )
        self.ib.disconnect()
        self._connected = False
        self._tick_cache.clear()

    async def fetch_chain(self, symbol: str, expiry: str = "0DTE",
                          window_side: int = 0) -> list[Contract]:
        """Fetch option contracts for one expiry of symbol using reqSecDefOptParams.

        CRITICAL: Uses reqSecDefOptParams to get expirations/strikes,
        filters on both exchange="SMART" AND tradingClass=symbol
        to reject "2SPY" (adjusted class).

        Callers pass the expiry they intend to subscribe to. Returning the whole
        chain — every expiration, every strike, both rights — is what would blow
        IBKR's market-data line limit the moment subscribe_quotes ran on it.
        """
        if not self._connected:
            if not await self.connect():
                logger.error("Cannot fetch chain; not connected")
                return []

        try:
            # First qualify the underlying to get conId
            underlying = Contract(symbol=symbol, secType="STK", currency="USD")
            qualified = await asyncio.to_thread(
                self.ib.qualifyContracts, underlying
            )

            if not qualified:
                logger.warning("Cannot qualify underlying %s", symbol)
                return []

            underlying = qualified[0]

            # Use reqSecDefOptParams to fetch chains (expirations, strikes)
            chains: list[OptionChain] = await asyncio.to_thread(
                self.ib.reqSecDefOptParamsAsync,
                symbol,
                "",
                "STK",
                int(underlying.conId),
            )

            if not chains:
                logger.warning("No option chains found for %s", symbol)
                return []

            # Only needed to centre the strike window; skip the round trip when
            # the caller wants every listed strike anyway.
            spot = await self._spot_price(underlying) if window_side > 0 else None

            # Build Option contracts from chains, filtering adjusted classes
            contracts = []
            for chain in chains:
                exp = resolve_expiry(list(chain.expirations), expiry)
                if exp is None:
                    logger.warning(
                        "Expiry %s not listed for %s; skipping chain", expiry, symbol
                    )
                    continue
                for strike in select_strikes(list(chain.strikes), spot, window_side):
                    for right in ["C", "P"]:
                        contract = Option(
                            symbol=symbol,
                            lastTradeDateOrContractMonth=exp,
                            strike=strike,
                            right=right,
                            exchange="SMART",
                        )
                        # Filter: accept only if tradingClass matches symbol (not "2SPY", etc.)
                        if contract.tradingClass == symbol or contract.tradingClass == "":
                            contracts.append(contract)

            logger.info(
                "Fetched %d option contracts for %s expiry=%s (spot=%s, window=±%d)",
                len(contracts),
                symbol,
                expiry,
                spot,
                window_side,
            )
            return contracts

        except Exception as e:
            logger.error("fetch_chain error for %s: %s", symbol, e)
            return []

    async def _spot_price(self, underlying: Contract) -> Optional[float]:
        """Last price for the qualified underlying, or None if IBKR won't give one.

        Only used to centre the strike window; None is survivable — select_strikes
        falls back to the middle of the listed strikes.
        """
        try:
            tickers = await asyncio.to_thread(self.ib.reqTickers, underlying)
        except Exception as e:
            logger.warning("spot price unavailable for %s: %s", underlying.symbol, e)
            return None
        for t in tickers or []:
            for field in ("last", "close", "marketPrice"):
                px = getattr(t, field, None)
                if callable(px):
                    try:
                        px = px()
                    except Exception:
                        continue
                if px is not None and px == px and px > 0:  # px == px rejects NaN
                    return float(px)
        return None

    def _tick_callback(self, contract: Contract, tick) -> None:
        """Internal callback to populate tick cache from market data updates.

        Called on each tick from pendingTicksEvent.
        """
        cid = contract.conId
        if cid not in self._subscribed_contracts:
            return  # Not subscribed

        # Extract tick data fields
        tick_data = {
            "bid": getattr(tick, "bid", None),
            "ask": getattr(tick, "ask", None),
            "volume": getattr(tick, "volume", None),
            "iv": getattr(tick, "impliedVol", None),
            "delta": getattr(tick, "delta", None),
            "gamma": getattr(tick, "gamma", None),
            "theta": getattr(tick, "theta", None),
            "vega": getattr(tick, "vega", None),
            "rho": getattr(tick, "rho", None),
            "oi": getattr(tick, "oi", None),
            "as_of": getattr(tick, "time", None),
        }
        self._tick_cache[cid] = tick_data
        logger.debug("Updated tick cache for conId=%d", cid)

    async def subscribe_quotes(
        self,
        contracts: list[Contract],
        tick_callback: Callable = None,
    ) -> None:
        """Subscribe to generic ticks 100 (volume), 101 (OI), 106 (IV).

        Args:
            contracts: List of contracts to subscribe to.
            tick_callback: (Optional) external callback; internal cache update always applied.
        """
        if not self._connected:
            if not await self.connect():
                logger.error("Cannot subscribe; not connected")
                return

        for contract in contracts:
            try:
                cid = contract.conId
                if cid not in self._subscribed_contracts:
                    # Request generic ticks: 100=volume, 101=OI, 106=IV
                    # MUST succeed before registering callback to prevent leak
                    await asyncio.to_thread(
                        self.ib.reqMktData,
                        contract,
                        "100,101,106",  # Generic ticks for volume, OI, IV
                        False,
                        False,
                    )
                    # Register internal callback ONLY after reqMktData succeeds
                    self.ib.pendingTicksEvent += self._tick_callback
                    self._subscribed_contracts[cid] = self._tick_callback
                    logger.debug("Subscribed to %s (conId=%d)", contract, cid)

            except Exception as e:
                logger.error("subscribe error for %s: %s", contract, e)

    async def unsubscribe_quotes(self, contracts: list[Contract]) -> None:
        """Unsubscribe from quotes and remove callback to prevent leak."""
        for contract in contracts:
            try:
                cid = contract.conId
                if cid in self._subscribed_contracts:
                    # Cancel market data
                    await asyncio.to_thread(self.ib.cancelMktData, contract)

                    # Unregister callback to prevent accumulation
                    callback = self._subscribed_contracts[cid]
                    self.ib.pendingTicksEvent -= callback

                    self._subscribed_contracts.pop(cid, None)
                    self._tick_cache.pop(cid, None)
                    logger.debug("Unsubscribed from %s (conId=%d)", contract, cid)
            except Exception as e:
                logger.error("unsubscribe error for %s: %s", contract, e)

    def get_quote(self, contract: Contract) -> Optional[dict]:
        """Return dict with keys: bid, ask, mid, spread_pct, iv, delta, gamma,
        theta, vega, rho, volume, oi, as_of, source.

        Returns None if no data available.
        """
        cid = contract.conId
        if cid not in self._tick_cache:
            return None

        tick_data = self._tick_cache[cid]
        mid = None
        if tick_data.get("bid") is not None and tick_data.get("ask") is not None:
            mid = (tick_data["bid"] + tick_data["ask"]) / 2.0

        spread_pct = None
        if mid and mid > 0:
            spread_pct = (
                (tick_data.get("ask", 0) - tick_data.get("bid", 0)) / mid * 100
            )

        return {
            "bid": tick_data.get("bid"),
            "ask": tick_data.get("ask"),
            "mid": mid,
            "spread_pct": spread_pct,
            "iv": tick_data.get("iv"),
            "delta": tick_data.get("delta"),
            "gamma": tick_data.get("gamma"),
            "theta": tick_data.get("theta"),
            "vega": tick_data.get("vega"),
            "rho": tick_data.get("rho"),
            "volume": tick_data.get("volume"),
            "oi": tick_data.get("oi"),
            "as_of": tick_data.get("as_of"),
            "source": tick_data.get("source", "live"),
        }
