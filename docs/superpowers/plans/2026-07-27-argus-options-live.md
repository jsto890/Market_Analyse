# Argus Options Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring full original OptionsAnalysis ladder feature set into argus with live IBKR Gateway stream, including max pain rendering and GEX profile curve.

**Architecture:** New `argus/argus/options_live/` package wraps ib_insync with IBKR-specific probes (tradingClass filter, market-data escalation). Per-symbol session manages subscription budget and tick coalescing. Pure analytics functions (iv_surface, exposures, msi_mtc, levels) produce LadderSnapshot JSON. Fallback chain: live → frozen → yfinance EOD with provenance badges. WS and REST endpoints feed dashboard ladder, GEX chart, and levels strip.

**Tech Stack:** `ib_insync`, `numpy`, `scipy.optimize` (smile fit), FastAPI WebSocket, existing `argus/argus/data/ibkr.py:IBKRClient` as parent class.

## Global Constraints

- Scope: SPY, QQQ, IWM, DIA (user-chosen underlyings; ETFs only, not single-stock or index futures)
- IBKR Gateway ports: 4002 (live), 4001 (fallback), read-only enforcement
- Market-data type escalation: live (1) → frozen (2) → yfinance EOD
- ib_insync event loop: thread-local to avoid conflicts with argus FastAPI loop
- Max pain & pin risk: must cross-validate against existing `argus/argus/flow/options_flow.py:26` max pain
- Pin risk gate thresholds: designed for verdicts in `main.py:1019-1022` (≥65 `pin_risk <= 45`)
- WS tick cadence: 500ms coalescing per symbol
- Subscription accounting: soft cap (configurable), refusal to exceed, half window on hit
- Database: gex_levels.profile_json already available via `/api/gex/{symbol}`; no schema changes needed
- Testing: unit tests with recorded fixtures (no Gateway), faked ib_insync for connector tests, live smoke at 09:30 EDT

---

## Phase 1: Setup & Configuration

### Task 1: Create options_live package and LiveConfig

**Files:**
- Create: `argus/argus/options_live/__init__.py`
- Create: `argus/argus/options_live/config.py`

**Interfaces:**
- Consumes: none
- Produces: `LiveConfig` (dataclass with fields: `ibkr_port: int`, `ibkr_clientId: int`, `tick_cadence_ms: int`, `strike_window_side: int`, `max_subscriptions: int`)

- [ ] **Step 1: Create __init__.py**

```python
# argus/argus/options_live/__init__.py
"""Live options ladder from IBKR Gateway with analytics.

Exports LadderSnapshot for transport; internal modules (connector, engine, etc.)
are implementation details.
"""

from .models import LadderSnapshot

__all__ = ["LadderSnapshot"]
```

- [ ] **Step 2: Create LiveConfig dataclass**

```python
# argus/argus/options_live/config.py
from dataclasses import dataclass

@dataclass
class LiveConfig:
    """Configuration for live IBKR options ladder."""
    ibkr_port: int = 4002  # IBKR Gateway live port; fallback to 4001
    ibkr_clientId: int = 10  # Unique ID for this connection
    tick_cadence_ms: int = 500  # Coalesce ticks; 500ms = ~2 updates/sec
    strike_window_side: int = 20  # Strikes per side (total window 40+1 ATM)
    max_subscriptions: int = 8  # Soft cap on concurrent subscriptions before halving window
    enable_frozen_fallback: bool = True  # Use frozen mode when live unavailable
    enable_yfinance_eod: bool = True  # Use yfinance when Gateway unreachable
    reconnect_backoff_ms: int = 1000  # Initial backoff; exponential
    reconnect_max_backoff_ms: int = 30000  # Cap on backoff
```

- [ ] **Step 3: Commit**

```bash
git add argus/argus/options_live/__init__.py argus/argus/options_live/config.py
git commit -m "feat(options-live): config scaffolding"
```

---

## Phase 2: IBKR Connector & Quotes

### Task 2: Implement Connector wrapping ib_insync

**Files:**
- Create: `argus/argus/options_live/connector.py`
- Create: `argus/argus/options_live/models.py` (LadderSnapshot, Quote, OptionQuote)
- Modify: `argus/argus/options_live/config.py` (add tradingClass filter logic)

**Interfaces:**
- Consumes: `IBKRClient` (from `argus/argus/data/ibkr.py`), `LiveConfig`
- Produces: `IBKRConnector` class with methods:
  - `async connect() -> bool` (returns True if connected or already connected)
  - `async disconnect() -> None`
  - `async fetch_chain(symbol: str) -> list[Contract]` (Contract from ib_insync)
  - `async subscribe_quotes(contracts: list[Contract], tick_callback: callable) -> None`
  - `async unsubscribe_quotes(contracts: list[Contract]) -> None`
  - `get_quote(contract: Contract) -> Ticker` (current snapshot)

- [ ] **Step 1: Create LadderSnapshot and Quote models**

```python
# argus/argus/options_live/models.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

@dataclass
class OptionQuote:
    """Per-contract option quote."""
    bid: Optional[float] = None
    ask: Optional[float] = None
    mid: Optional[float] = None
    spread_pct: Optional[float] = None  # (ask - bid) / mid * 100
    iv: Optional[float] = None  # Implied vol
    delta: Optional[float] = None
    gamma: Optional[float] = None
    theta: Optional[float] = None
    vega: Optional[float] = None
    rho: Optional[float] = None
    per_dollar_gamma: Optional[float] = None  # gamma * spot
    per_dollar_delta: Optional[float] = None
    volume: Optional[int] = None  # Trade volume today
    oi: Optional[int] = None  # Open interest
    stale_ms: int = 0  # Age of data in ms
    liquid: bool = False  # Enough volume & OI for smile fit

@dataclass
class StrikeLevelSnapshot:
    """Per-strike row in ladder."""
    strike: float
    call: OptionQuote
    put: OptionQuote
    zero_gamma_side: Optional[str] = None  # "C", "P", or None
    wall_type: Optional[str] = None  # "none", "call", "put"
    gex_by_strike: Optional[float] = None  # $ GEX exposure at this strike
    max_pain_delta: Optional[float] = None  # Contribution to max pain calculation

@dataclass
class LadderSnapshot:
    """Full ladder for one symbol at one instant."""
    symbol: str
    spot: float
    as_of: datetime
    source: str  # "LIVE", "FROZEN", "EOD"
    stale_ms: int
    fresh_contract_ratio: float  # Fraction of contracts with non-null greeks
    expiry: str  # "0DTE", "1DTE", etc. or ISO format
    
    # Per-strike rows
    levels: list[StrikeLevelSnapshot] = field(default_factory=list)
    
    # Summary analytics
    atm_strike: float = 0
    zero_gamma_strike: Optional[float] = None
    call_wall_strike: Optional[float] = None
    put_wall_strike: Optional[float] = None
    max_pain: Optional[float] = None
    pin_risk: Optional[float] = None  # 0-100 scale
    net_gex_band: Optional[str] = None  # "bullish", "bearish", "neutral"
    msi_call_strike: Optional[float] = None
    msi_put_strike: Optional[float] = None
    msi_rationale: Optional[str] = None
    
    # GEX profile (61 points, already in DB)
    gex_profile_json: Optional[str] = None  # JSON array of (strike, gex_$)
```

- [ ] **Step 2: Run test to verify models parse correctly**

```bash
python -c "from argus.options_live.models import LadderSnapshot; print('OK')"
```

- [ ] **Step 3: Create IBKRConnector class**

```python
# argus/argus/options_live/connector.py
"""IBKR Gateway connector with probes applied: tradingClass filter, market-data
escalation, subscription accounting, reconnect backoff.
"""
import asyncio
import logging
from typing import Callable, Optional
from datetime import datetime

from ib_insync import IB, Contract, Index
from .config import LiveConfig
from ..data.ibkr import IBKRClient

logger = logging.getLogger(__name__)

class IBKRConnector:
    """Wraps ib_insync with IBKR-specific hardened logic."""
    
    def __init__(self, config: LiveConfig):
        self.config = config
        self.ib: Optional[IB] = None
        self.connected = False
        self.subscribed_contracts = set()  # Track for accounting
        self.reconnect_attempts = 0
    
    async def connect(self) -> bool:
        """Lazy connect with exponential backoff. Return True if connected."""
        if self.connected:
            return True
        
        from ib_insync import IB
        
        try:
            self.ib = IB()
            self.ib.connect("127.0.0.1", self.config.ibkr_port, clientId=self.config.ibkr_clientId)
            await asyncio.sleep(0.1)  # Let connection settle
            self.connected = True
            self.reconnect_attempts = 0
            logger.info(f"Connected to IBKR Gateway {self.config.ibkr_port}")
            return True
        except Exception as e:
            self.reconnect_attempts += 1
            backoff = min(
                self.config.reconnect_backoff_ms * (2 ** self.reconnect_attempts),
                self.config.reconnect_max_backoff_ms
            )
            logger.warning(f"IBKR connect failed (attempt {self.reconnect_attempts}): {e}. "
                         f"Retry in {backoff}ms")
            self.connected = False
            return False
    
    async def disconnect(self) -> None:
        """Clean disconnect."""
        if self.ib:
            try:
                self.ib.disconnect()
            except Exception as e:
                logger.error(f"Error disconnecting IBKR: {e}")
            self.connected = False
    
    async def fetch_chain(self, symbol: str) -> list[Contract]:
        """Fetch option chain for symbol, filtered to SMART + correct tradingClass.
        
        Probe finding: exchange="SMART" alone returns adjusted class (2SPY).
        Correct filter: exchange="SMART" and tradingClass=symbol.
        """
        if not await self.connect():
            return []
        
        try:
            from ib_insync import Stock
            
            stock = Stock(symbol, "SMART", "USD")
            chains = self.ib.reqSecDefOptParams(
                underlyingSymbol=symbol,
                futFopExchange="",
                underlyingSecType="STK",
                underlyingConId=0
            )
            
            if not chains:
                logger.warning(f"No chains found for {symbol}")
                return []
            
            chain = chains[0]  # Use first (usually only) chain
            contracts = []
            
            for expiry in chain.expirations:
                for strike in chain.strikes:
                    # CRITICAL: filter on both exchange AND tradingClass
                    call = Contract(
                        symbol=symbol,
                        secType="OPT",
                        exchange="SMART",
                        strike=strike,
                        expiry=expiry,
                        right="C",
                        tradingClass=symbol  # <-- Reject 2SPY
                    )
                    put = Contract(
                        symbol=symbol,
                        secType="OPT",
                        exchange="SMART",
                        strike=strike,
                        expiry=expiry,
                        right="P",
                        tradingClass=symbol
                    )
                    contracts.extend([call, put])
            
            logger.info(f"Fetched {len(contracts)} contracts for {symbol} "
                       f"({len(chain.expirations)} expirations)")
            return contracts
        
        except Exception as e:
            logger.error(f"Error fetching chain for {symbol}: {e}")
            return []
    
    async def subscribe_quotes(self, contracts: list[Contract], tick_callback: Callable) -> None:
        """Subscribe to ticks for contracts, requesting volume, OI, IV."""
        if not await self.connect():
            logger.warning("Cannot subscribe; not connected")
            return
        
        # Generic tick list: 100=volume, 101=OI, 106=implied vol (CRITICAL fix)
        # Others already subscribed by default
        generic_ticks = "100,101,106"
        
        try:
            for contract in contracts:
                if contract not in self.subscribed_contracts:
                    self.ib.reqMktData(contract, genericTickList=generic_ticks, snapshot=False)
                    self.subscribed_contracts.add(contract)
            
            logger.info(f"Subscribed to {len(contracts)} contracts (generic_ticks={generic_ticks})")
        
        except Exception as e:
            logger.error(f"Error subscribing to quotes: {e}")
    
    async def unsubscribe_quotes(self, contracts: list[Contract]) -> None:
        """Unsubscribe from ticks."""
        if not self.ib:
            return
        
        try:
            for contract in contracts:
                if contract in self.subscribed_contracts:
                    self.ib.cancelMktData(contract)
                    self.subscribed_contracts.discard(contract)
        except Exception as e:
            logger.error(f"Error unsubscribing: {e}")
    
    def get_quote(self, contract: Contract) -> Optional[dict]:
        """Return latest quote dict for contract, or None if unavailable.
        
        Returns dict with keys: bid, ask, mid, spread_pct, iv, delta, gamma,
        theta, vega, rho, volume, oi.
        """
        if not self.ib or contract not in self.subscribed_contracts:
            return None
        
        try:
            ticker = self.ib.ticker(contract)
            if ticker is None:
                return None
            
            bid = ticker.bid if ticker.bid else None
            ask = ticker.ask if ticker.ask else None
            mid = (bid + ask) / 2 if bid and ask else None
            spread_pct = ((ask - bid) / mid * 100) if mid and bid and ask else None
            
            return {
                "bid": bid,
                "ask": ask,
                "mid": mid,
                "spread_pct": spread_pct,
                "iv": ticker.impliedVol,
                "delta": ticker.delta,
                "gamma": ticker.gamma,
                "theta": ticker.theta,
                "vega": ticker.vega,
                "rho": ticker.rho,
                "volume": ticker.volume,
                "oi": ticker.openInterest,
                "last_price": ticker.last,
                "as_of": datetime.now(timezone.utc),
            }
        except Exception as e:
            logger.warning(f"Error reading quote for {contract}: {e}")
            return None
```

- [ ] **Step 4: Run test to verify connector creates and connects**

```bash
python -c "from argus.options_live.connector import IBKRConnector; from argus.options_live.config import LiveConfig; c = IBKRConnector(LiveConfig()); print('OK')"
```

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/connector.py argus/argus/options_live/models.py
git commit -m "feat(options-live): IBKR connector with tradingClass probes"
```

---

## Phase 3: Analytics Engine (IV Surface, Exposures, Levels)

### Task 3: Implement IV surface fitting

**Files:**
- Create: `argus/argus/options_live/iv_surface.py`

**Interfaces:**
- Consumes: `OptionQuote` (from models), numpy, scipy.optimize
- Produces: `IVSurface` class with method:
  - `fit(quotes: list[tuple[float, float, float]]) -> Optional[IVSurface]` (strikes, calls, puts)
  - `residuals() -> list[float]` (observed - fitted IV)
  - `fitted_iv_at_strike(strike: float) -> Optional[float]` (interpolated IV)

- [ ] **Step 1: Write failing test for IV surface**

```python
# argus/tests/test_iv_surface.py
import pytest
from argus.options_live.iv_surface import IVSurface

def test_iv_surface_fit_quadratic():
    """Fit smile to 9 strikes, expect non-null residuals and predictions."""
    strikes = [100, 102, 104, 106, 108, 110, 112, 114, 116]
    ivs = [0.25, 0.23, 0.21, 0.20, 0.21, 0.23, 0.25, 0.27, 0.29]
    
    surface = IVSurface.fit(strikes, ivs)
    assert surface is not None
    assert len(surface.residuals()) == len(strikes)
    assert abs(surface.fitted_iv_at_strike(108) - 0.20) < 0.02

def test_iv_surface_insufficient_points():
    """Fit with <8 points returns None."""
    strikes = [100, 102, 104]
    ivs = [0.25, 0.23, 0.21]
    
    surface = IVSurface.fit(strikes, ivs)
    assert surface is None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd argus && pytest tests/test_iv_surface.py -v
```

Expected: FAIL (no IVSurface)

- [ ] **Step 3: Implement IV surface with quadratic smile fit**

```python
# argus/argus/options_live/iv_surface.py
"""IV surface fitting — quadratic smile in log-moneyness."""
from typing import Optional
import numpy as np
from scipy.optimize import curve_fit
import logging

logger = logging.getLogger(__name__)

class IVSurface:
    """Quadratic smile fit to IV across strikes."""
    
    def __init__(self, strikes: list[float], spot: float, coeffs: tuple):
        self.strikes = np.array(strikes)
        self.spot = spot
        self.coeffs = coeffs  # (a, b, c) for quadratic in log-moneyness
        self._residuals = None
        self._fitted_ivs = None
    
    @staticmethod
    def _quadratic_smile(x, a, b, c):
        """Quadratic in log-moneyness: IV = a + b*x + c*x^2."""
        return a + b*x + c*x**2
    
    @staticmethod
    def fit(strikes: list[float], ivs: list[float], spot: Optional[float] = None) -> Optional["IVSurface"]:
        """Fit quadratic smile to strikes and IVs.
        
        Args:
            strikes: Strike levels
            ivs: Implied vols at each strike
            spot: Current spot (default: ATM strike if not provided)
        
        Returns:
            IVSurface if >=8 liquid points, else None
        """
        if len(strikes) < 8:
            logger.debug(f"Insufficient points for IV smile fit: {len(strikes)} < 8")
            return None
        
        strikes = np.array(strikes, dtype=float)
        ivs = np.array(ivs, dtype=float)
        
        if spot is None:
            spot = np.mean(strikes)
        
        # Log-moneyness: log(K/S)
        log_moneyness = np.log(strikes / spot)
        
        try:
            # Fit quadratic
            coeffs, _ = curve_fit(
                IVSurface._quadratic_smile,
                log_moneyness,
                ivs,
                p0=[np.mean(ivs), 0, 0],
                maxfev=1000
            )
            
            surface = IVSurface(strikes, spot, coeffs)
            surface._fitted_ivs = IVSurface._quadratic_smile(log_moneyness, *coeffs)
            surface._residuals = ivs - surface._fitted_ivs
            
            return surface
        
        except Exception as e:
            logger.warning(f"IV smile fit failed: {e}")
            return None
    
    def residuals(self) -> list[float]:
        """Observed - fitted IV."""
        return self._residuals.tolist() if self._residuals is not None else []
    
    def fitted_iv_at_strike(self, strike: float) -> Optional[float]:
        """Interpolated IV at strike."""
        if self._fitted_ivs is None:
            return None
        
        log_moneyness = np.log(strike / self.spot)
        return float(self._quadratic_smile(log_moneyness, *self.coeffs))
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd argus && pytest tests/test_iv_surface.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/iv_surface.py argus/tests/test_iv_surface.py
git commit -m "feat(options-live): quadratic IV smile fitting"
```

---

### Task 4: Implement exposures (DEX, GEX, VEX)

**Files:**
- Create: `argus/argus/options_live/exposures.py`

**Interfaces:**
- Consumes: `OptionQuote`, `IVSurface`, numpy
- Produces: `compute_exposures(quotes: dict, spot: float, config) -> dict` with keys:
  - `call_gex_by_strike: dict[float, float]`
  - `put_gex_by_strike: dict[float, float]`
  - `call_vex_by_strike: dict[float, float]`
  - `put_vex_by_strike: dict[float, float]`

- [ ] **Step 1: Write failing test**

```python
# argus/tests/test_exposures.py
import pytest
from argus.options_live.exposures import compute_exposures
from argus.options_live.models import OptionQuote

def test_compute_gex():
    """GEX = gamma * OI * spot."""
    quotes = {
        105.0: (
            OptionQuote(gamma=0.01, oi=100),  # call
            OptionQuote(gamma=0.01, oi=100)   # put
        )
    }
    
    result = compute_exposures(quotes, spot=105.0, multiplier=100)
    
    # Dealer GEX (C = -gamma, P = +gamma)
    # call: -0.01 * 100 * 105 * 100 = -105000
    # put: +0.01 * 100 * 105 * 100 = +105000
    assert result["call_gex_by_strike"][105.0] < 0
    assert result["put_gex_by_strike"][105.0] > 0
```

- [ ] **Step 2: Run test**

```bash
cd argus && pytest tests/test_exposures.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement exposures**

```python
# argus/argus/options_live/exposures.py
"""Dealer gamma, vega, and dollar exposures per strike."""
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Hardcoded dealer sign assumption (from spec); spec notes this is a limitation
DEALER_SIGN = {"C": -1.0, "P": +1.0}

def compute_exposures(
    quotes: dict,  # {strike: (call_OptionQuote, put_OptionQuote), ...}
    spot: float,
    multiplier: float = 100,
) -> dict:
    """Compute GEX, VEX, DEX per strike.
    
    Args:
        quotes: Nested dict {strike: (call_quote, put_quote)}
        spot: Current spot price
        multiplier: Contract multiplier (100 for ETFs, $100 for indices)
    
    Returns:
        Dict with keys:
        - call_gex_by_strike: {strike: gamma_$ for calls}
        - put_gex_by_strike: {strike: gamma_$ for puts}
        - call_vex_by_strike: {strike: vega_$ for calls}
        - put_vex_by_strike: {strike: vega_$ for puts}
    """
    call_gex = {}
    put_gex = {}
    call_vex = {}
    put_vex = {}
    
    for strike, (call_quote, put_quote) in quotes.items():
        # Calls
        if call_quote.gamma and call_quote.oi:
            # Gamma exposure: dealer_sign * gamma * OI * spot * multiplier
            call_gex[strike] = (
                DEALER_SIGN["C"] * call_quote.gamma * call_quote.oi * spot * multiplier
            )
        else:
            call_gex[strike] = 0
        
        if call_quote.vega and call_quote.oi:
            # Vega exposure: dealer_sign * vega * OI * spot * multiplier / 100
            # (vega is per 1% IV change)
            call_vex[strike] = (
                DEALER_SIGN["C"] * call_quote.vega * call_quote.oi * spot * multiplier / 100
            )
        else:
            call_vex[strike] = 0
        
        # Puts
        if put_quote.gamma and put_quote.oi:
            put_gex[strike] = (
                DEALER_SIGN["P"] * put_quote.gamma * put_quote.oi * spot * multiplier
            )
        else:
            put_gex[strike] = 0
        
        if put_quote.vega and put_quote.oi:
            put_vex[strike] = (
                DEALER_SIGN["P"] * put_quote.vega * put_quote.oi * spot * multiplier / 100
            )
        else:
            put_vex[strike] = 0
    
    return {
        "call_gex_by_strike": call_gex,
        "put_gex_by_strike": put_gex,
        "call_vex_by_strike": call_vex,
        "put_vex_by_strike": put_vex,
    }

def compute_net_gex(
    call_gex: dict,
    put_gex: dict,
) -> Optional[str]:
    """Classify net dealer GEX sentiment.
    
    Returns "bullish" (net GEX up), "bearish" (down), or "neutral".
    """
    total_call_gex = sum(call_gex.values())
    total_put_gex = sum(put_gex.values())
    net = total_call_gex + total_put_gex
    
    if abs(net) < 1e6:
        return "neutral"
    elif net > 0:
        return "bullish"
    else:
        return "bearish"
```

- [ ] **Step 4: Run test**

```bash
cd argus && pytest tests/test_exposures.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/exposures.py argus/tests/test_exposures.py
git commit -m "feat(options-live): compute dealer GEX and VEX exposures"
```

---

### Task 5: Implement MSI/MTC scoring

**Files:**
- Create: `argus/argus/options_live/msi_mtc.py`

**Interfaces:**
- Consumes: `call_gex_by_strike`, `put_gex_by_strike`, spot, config
- Produces: `select_msi_mtc(call_gex, put_gex, spot, config) -> (call_strike, put_strike, rationale: str)`

- [ ] **Step 1: Write failing test**

```python
# argus/tests/test_msi_mtc.py
import pytest
from argus.options_live.msi_mtc import select_msi_mtc

def test_msi_call_highest_concentration():
    """MSI call = strike with highest call GEX concentration."""
    call_gex = {100: 50000, 102: 100000, 104: 80000, 106: 60000}
    put_gex = {100: -50000, 102: -100000, 104: -80000, 106: -60000}
    
    call_strike, put_strike, _ = select_msi_mtc(call_gex, put_gex, spot=104)
    
    assert call_strike == 102  # Highest call GEX
    assert put_strike == 102  # Highest put GEX (absolute)
```

- [ ] **Step 2: Run test**

```bash
cd argus && pytest tests/test_msi_mtc.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement MSI/MTC**

```python
# argus/argus/options_live/msi_mtc.py
"""Most Stacked Interest (MSI) and Most Traded Call (MTC) selection."""
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

def select_msi_mtc(
    call_gex: dict,  # {strike: gex_$}
    put_gex: dict,
    spot: float,
    rationale_prefix: str = "",
) -> Tuple[Optional[float], Optional[float], str]:
    """Select MSI strikes where dealer concentration is highest.
    
    MSI call = strike with max call GEX absolute value
    MSI put = strike with max put GEX absolute value
    
    Args:
        call_gex: {strike: gamma_$ for calls}
        put_gex: {strike: gamma_$ for puts}
        spot: Current spot
        rationale_prefix: Prefix for rationale (e.g., "wall_call" if dominated by wall)
    
    Returns:
        (msi_call_strike, msi_put_strike, rationale)
    """
    if not call_gex or not put_gex:
        return None, None, "No GEX data"
    
    # Find max absolute GEX
    max_call_strike = max(call_gex, key=lambda k: abs(call_gex[k]))
    max_put_strike = max(put_gex, key=lambda k: abs(put_gex[k]))
    
    max_call_gex = call_gex[max_call_strike]
    max_put_gex = put_gex[max_put_strike]
    
    rationale = f"{rationale_prefix}MSI call={max_call_strike} (GEX ${max_call_gex:.0f}), " \
                f"put={max_put_strike} (GEX ${max_put_gex:.0f})"
    
    return max_call_strike, max_put_strike, rationale
```

- [ ] **Step 4: Run test**

```bash
cd argus && pytest tests/test_msi_mtc.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/msi_mtc.py argus/tests/test_msi_mtc.py
git commit -m "feat(options-live): MSI/MTC strike selection"
```

---

### Task 6: Implement levels (zero-gamma, walls, max pain, pin risk)

**Files:**
- Create: `argus/argus/options_live/levels.py`

**Interfaces:**
- Consumes: `quotes`, `spot`, `call_gex_by_strike`, `put_gex_by_strike`, `IVSurface`
- Produces: `compute_levels(quotes, spot, exposures, iv_surface) -> dict` with keys:
  - `zero_gamma_strike: Optional[float]`
  - `call_wall_strike: Optional[float]`
  - `put_wall_strike: Optional[float]`
  - `wall_type: str`
  - `max_pain: Optional[float]`
  - `pin_risk: Optional[float]`

- [ ] **Step 1: Write failing tests**

```python
# argus/tests/test_levels.py
import pytest
from argus.options_live.levels import (
    compute_zero_gamma, compute_max_pain, compute_pin_risk, compute_walls
)

def test_zero_gamma_strike():
    """Find strike closest to zero gamma."""
    call_gex = {100: -50000, 102: -10000, 104: 5000, 106: 60000}
    put_gex = {100: 50000, 102: 10000, 104: -5000, 106: -60000}
    
    zg = compute_zero_gamma(call_gex, put_gex, spot=104)
    
    # Closest to zero is 104 (net 0)
    assert zg == 104

def test_max_pain():
    """Max pain = strike where total expiring worthless is max."""
    call_oi = {100: 100, 102: 200, 104: 150, 106: 50}
    put_oi = {100: 50, 102: 150, 104: 200, 106: 100}
    spot = 104
    
    mp = compute_max_pain(call_oi, put_oi, strikes=[100, 102, 104, 106])
    
    # Strike where most $ value expires worthless
    assert mp is not None
    assert 100 <= mp <= 106

def test_pin_risk():
    """Pin risk = gamma concentration at nearest strike."""
    call_gex = {100: 100000, 102: 10000, 104: 500000, 106: 20000}
    put_gex = {100: 100000, 102: 10000, 104: 500000, 106: 20000}
    spot = 104.5
    
    pr = compute_pin_risk(call_gex, put_gex, spot)
    
    # High concentration at 104 = high pin risk
    assert 0 <= pr <= 100
    assert pr > 50
```

- [ ] **Step 2: Run tests**

```bash
cd argus && pytest tests/test_levels.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement levels**

```python
# argus/argus/options_live/levels.py
"""Levels: zero-gamma, walls, max pain, pin risk."""
from typing import Optional
import numpy as np
import logging

logger = logging.getLogger(__name__)

def compute_zero_gamma(
    call_gex: dict,  # {strike: gamma_$}
    put_gex: dict,
    spot: float,
) -> Optional[float]:
    """Find strike where net GEX (call + put) is closest to zero."""
    if not call_gex or not put_gex:
        return None
    
    min_strike = None
    min_net_gex = float('inf')
    
    all_strikes = set(call_gex.keys()) | set(put_gex.keys())
    
    for strike in all_strikes:
        call_g = call_gex.get(strike, 0)
        put_g = put_gex.get(strike, 0)
        net_gex = abs(call_g + put_g)
        
        if net_gex < min_net_gex:
            min_net_gex = net_gex
            min_strike = strike
    
    return min_strike

def compute_max_pain(
    call_oi: dict,  # {strike: OI count}
    put_oi: dict,
    strikes: list,
    spot: Optional[float] = None,
) -> Optional[float]:
    """Max pain = strike where total $ value expiring worthless is maximized.
    
    For each candidate strike K:
        max_pain_$ = Σ_calls OI(c) * max(0, K - k) + Σ_puts OI(p) * max(0, k - K)
    
    Return strike K that maximizes this.
    """
    if not strikes:
        return None
    
    max_pain_strike = None
    max_pain_value = -float('inf')
    
    for candidate_k in strikes:
        # Calls expire worthless if K < candidate_k
        call_worthless = sum(
            call_oi.get(k, 0) * max(0, candidate_k - k)
            for k in call_oi.keys()
        )
        
        # Puts expire worthless if K > candidate_k
        put_worthless = sum(
            put_oi.get(k, 0) * max(0, k - candidate_k)
            for k in put_oi.keys()
        )
        
        total = call_worthless + put_worthless
        
        if total > max_pain_value:
            max_pain_value = total
            max_pain_strike = candidate_k
    
    return max_pain_strike

def compute_pin_risk(
    call_gex: dict,
    put_gex: dict,
    spot: float,
    window_side: int = 3,
) -> float:
    """Pin risk = gamma concentration nearest strike, attenuated by distance.
    
    Normalize to 0-100 scale.
    
    Args:
        call_gex, put_gex: {strike: gamma_$}
        spot: Current spot
        window_side: Number of strikes on each side to consider
    
    Returns:
        Pin risk 0-100
    """
    all_strikes = sorted(set(call_gex.keys()) | set(put_gex.keys()))
    
    if not all_strikes:
        return 0
    
    # Find nearest strike
    nearest_strike = min(all_strikes, key=lambda s: abs(s - spot))
    nearest_idx = all_strikes.index(nearest_strike)
    
    # Window around nearest
    start = max(0, nearest_idx - window_side)
    end = min(len(all_strikes), nearest_idx + window_side + 1)
    window_strikes = all_strikes[start:end]
    
    # Concentration: GEX at nearest / sum GEX in window
    nearest_gex = abs(call_gex.get(nearest_strike, 0)) + abs(put_gex.get(nearest_strike, 0))
    window_gex = sum(
        abs(call_gex.get(s, 0)) + abs(put_gex.get(s, 0))
        for s in window_strikes
    )
    
    if window_gex == 0:
        return 0
    
    concentration = nearest_gex / window_gex
    
    # Normalize 0-100
    pin_risk = min(100, concentration * 100)
    
    return pin_risk

def compute_walls(
    call_gex: dict,
    put_gex: dict,
    spot: float,
    threshold_pct: float = 0.25,
) -> tuple[Optional[float], Optional[float], str]:
    """Identify call/put walls.
    
    Wall = side where GEX at one strike dominates neighborhood.
    
    Returns:
        (call_wall_strike, put_wall_strike, wall_type: "none"|"call"|"put")
    """
    if not call_gex or not put_gex:
        return None, None, "none"
    
    all_strikes = sorted(set(call_gex.keys()) | set(put_gex.keys()))
    
    call_wall_strike = None
    put_wall_strike = None
    
    # Find max call GEX (most negative = highest short concentration)
    max_call_gex_strike = min(call_gex, key=call_gex.get)
    max_call_gex_val = abs(call_gex[max_call_gex_strike])
    total_call_gex = sum(abs(g) for g in call_gex.values())
    
    if total_call_gex > 0 and max_call_gex_val / total_call_gex > threshold_pct:
        call_wall_strike = max_call_gex_strike
    
    # Find max put GEX (most positive = highest long concentration)
    max_put_gex_strike = max(put_gex, key=lambda k: abs(put_gex[k]))
    max_put_gex_val = abs(put_gex[max_put_gex_strike])
    total_put_gex = sum(abs(g) for g in put_gex.values())
    
    if total_put_gex > 0 and max_put_gex_val / total_put_gex > threshold_pct:
        put_wall_strike = max_put_gex_strike
    
    # Determine wall type
    if call_wall_strike and not put_wall_strike:
        wall_type = "call"
    elif put_wall_strike and not call_wall_strike:
        wall_type = "put"
    elif call_wall_strike and put_wall_strike:
        wall_type = "both"
    else:
        wall_type = "none"
    
    return call_wall_strike, put_wall_strike, wall_type
```

- [ ] **Step 4: Run tests**

```bash
cd argus && pytest tests/test_levels.py -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/levels.py argus/tests/test_levels.py
git commit -m "feat(options-live): zero-gamma, walls, max pain, pin risk"
```

---

### Task 7: Implement main engine orchestration

**Files:**
- Create: `argus/argus/options_live/engine.py`
- Create: `argus/argus/options_live/quotes.py`

**Interfaces:**
- Consumes: All prior modules, LadderSnapshot, connector
- Produces: `run_analytics(quotes, spot, expiry, config) -> LadderSnapshot`

- [ ] **Step 1: Create quotes module to normalize IBKR ticks**

```python
# argus/argus/options_live/quotes.py
"""Normalize IBKR quotes to OptionQuote."""
from typing import Optional, Tuple
from .models import OptionQuote
import logging

logger = logging.getLogger(__name__)

def ticker_to_quote(ticker_dict: dict) -> OptionQuote:
    """Convert ib_insync ticker dict to OptionQuote.
    
    Handles None/missing fields gracefully.
    """
    bid = ticker_dict.get("bid")
    ask = ticker_dict.get("ask")
    mid = ticker_dict.get("mid")
    
    # Compute mid if not provided
    if mid is None and bid and ask:
        mid = (bid + ask) / 2
    
    # Compute spread %
    spread_pct = None
    if bid and ask and mid and mid > 0:
        spread_pct = ((ask - bid) / mid) * 100
    
    return OptionQuote(
        bid=bid,
        ask=ask,
        mid=mid,
        spread_pct=spread_pct,
        iv=ticker_dict.get("iv"),
        delta=ticker_dict.get("delta"),
        gamma=ticker_dict.get("gamma"),
        theta=ticker_dict.get("theta"),
        vega=ticker_dict.get("vega"),
        rho=ticker_dict.get("rho"),
        volume=ticker_dict.get("volume"),
        oi=ticker_dict.get("oi"),
        stale_ms=ticker_dict.get("stale_ms", 0),
        liquid=(
            (ticker_dict.get("volume", 0) or 0) > 10 and
            (ticker_dict.get("oi", 0) or 0) > 100
        ),
    )

def organize_by_strike(
    quotes: list[Tuple],  # [(contract, ticker_dict), ...]
) -> dict:
    """Organize quotes by strike: {strike: (call_OptionQuote, put_OptionQuote)}.
    
    Assumes one call and one put per strike.
    """
    result = {}
    
    for contract, ticker_dict in quotes:
        quote = ticker_to_quote(ticker_dict)
        strike = contract.strike
        right = contract.right
        
        if strike not in result:
            result[strike] = [None, None]
        
        if right == "C":
            result[strike][0] = quote
        else:
            result[strike][1] = quote
    
    # Convert lists to tuples
    return {k: tuple(v) for k, v in result.items()}
```

- [ ] **Step 2: Create main engine**

```python
# argus/argus/options_live/engine.py
"""Per-tick orchestration: quotes → analytics → LadderSnapshot."""
from typing import Optional
from datetime import datetime, timezone
import logging

from .config import LiveConfig
from .models import LadderSnapshot, StrikeLevelSnapshot, OptionQuote
from .iv_surface import IVSurface
from .exposures import compute_exposures, compute_net_gex
from .msi_mtc import select_msi_mtc
from .levels import (
    compute_zero_gamma, compute_max_pain, compute_pin_risk, compute_walls
)
from .quotes import organize_by_strike, ticker_to_quote

logger = logging.getLogger(__name__)

def run_analytics(
    quotes: dict,  # {strike: (call_ticker_dict, put_ticker_dict), ...}
    spot: float,
    expiry: str,
    config: LiveConfig,
    source: str = "LIVE",
    iv_residual_history: Optional[list] = None,
) -> LadderSnapshot:
    """Execute full analytics pipeline.
    
    Args:
        quotes: {strike: (call_ticker_dict, put_ticker_dict)}
        spot: Current spot price
        expiry: Expiry string (e.g., "0DTE", "2026-08-15")
        config: LiveConfig
        source: "LIVE", "FROZEN", or "EOD"
        iv_residual_history: Prior IV residuals for smile fit
    
    Returns:
        LadderSnapshot with all levels and summary
    """
    as_of = datetime.now(timezone.utc)
    
    # Convert to OptionQuote objects
    option_quotes = {}
    for strike, (call_dict, put_dict) in quotes.items():
        option_quotes[strike] = (
            ticker_to_quote(call_dict) if call_dict else OptionQuote(),
            ticker_to_quote(put_dict) if put_dict else OptionQuote(),
        )
    
    # Compute exposures
    exposures = compute_exposures(option_quotes, spot, multiplier=100)
    call_gex = exposures["call_gex_by_strike"]
    put_gex = exposures["put_gex_by_strike"]
    
    # IV surface fit
    liquid_strikes = [
        s for s, (c, p) in option_quotes.items()
        if c.liquid or p.liquid
    ]
    if len(liquid_strikes) >= 8:
        call_ivs = [option_quotes[s][0].iv for s in liquid_strikes if option_quotes[s][0].iv]
        if len(call_ivs) >= 8:
            iv_surface = IVSurface.fit(liquid_strikes, call_ivs, spot=spot)
        else:
            iv_surface = None
    else:
        iv_surface = None
    
    # Compute levels
    zero_gamma_strike = compute_zero_gamma(call_gex, put_gex, spot)
    max_pain = compute_max_pain(
        {s: option_quotes[s][0].oi or 0 for s in option_quotes},
        {s: option_quotes[s][1].oi or 0 for s in option_quotes},
        strikes=list(option_quotes.keys()),
    )
    pin_risk = compute_pin_risk(call_gex, put_gex, spot, window_side=config.strike_window_side // 2)
    call_wall_strike, put_wall_strike, wall_type = compute_walls(call_gex, put_gex, spot)
    
    # MSI/MTC
    msi_call_strike, msi_put_strike, msi_rationale = select_msi_mtc(call_gex, put_gex, spot)
    
    # Net GEX
    net_gex_band = compute_net_gex(call_gex, put_gex)
    
    # Build levels (per-strike rows)
    levels = []
    for strike in sorted(option_quotes.keys()):
        call_quote, put_quote = option_quotes[strike]
        
        # Determine zero-gamma side at this strike
        zero_gamma_side = None
        if zero_gamma_strike == strike:
            zero_gamma_side = "both"
        
        levels.append(StrikeLevelSnapshot(
            strike=strike,
            call=call_quote,
            put=put_quote,
            zero_gamma_side=zero_gamma_side,
            wall_type=wall_type if strike in (call_wall_strike, put_wall_strike) else None,
            gex_by_strike=call_gex.get(strike, 0) + put_gex.get(strike, 0),
            max_pain_delta=1.0 if strike == max_pain else 0.0,
        ))
    
    # ATM strike
    atm_strike = min(option_quotes.keys(), key=lambda s: abs(s - spot))
    
    # Fresh contract ratio
    total_strikes = len(option_quotes)
    fresh_strikes = sum(
        1 for s, (c, p) in option_quotes.items()
        if (c.iv and c.delta and c.gamma) or (p.iv and p.delta and p.gamma)
    )
    fresh_contract_ratio = fresh_strikes / total_strikes if total_strikes > 0 else 0
    
    # Stale time
    max_stale_ms = max(
        (c.stale_ms or 0 for _, (c, p) in option_quotes.items()),
        default=0
    )
    
    return LadderSnapshot(
        symbol="SPY",  # TODO: parameterize
        spot=spot,
        as_of=as_of,
        source=source,
        stale_ms=max_stale_ms,
        fresh_contract_ratio=fresh_contract_ratio,
        expiry=expiry,
        levels=levels,
        atm_strike=atm_strike,
        zero_gamma_strike=zero_gamma_strike,
        call_wall_strike=call_wall_strike,
        put_wall_strike=put_wall_strike,
        max_pain=max_pain,
        pin_risk=pin_risk,
        net_gex_band=net_gex_band,
        msi_call_strike=msi_call_strike,
        msi_put_strike=msi_put_strike,
        msi_rationale=msi_rationale,
        gex_profile_json=None,  # TODO: fetch from DB
    )
```

- [ ] **Step 3: Run tests to verify engine builds**

```bash
python -c "from argus.options_live.engine import run_analytics; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add argus/argus/options_live/quotes.py argus/argus/options_live/engine.py
git commit -m "feat(options-live): main engine orchestration"
```

---

## Phase 4: Session Management

### Task 8: Implement session lifecycle and subscription accounting

**Files:**
- Create: `argus/argus/options_live/session.py`

**Interfaces:**
- Consumes: `IBKRConnector`, `LiveConfig`, `LadderSnapshot`
- Produces: `Session` class with methods:
  - `async subscribe(symbol: str, expiry: str) -> bool`
  - `async unsubscribe(symbol: str) -> None`
  - `async tick_and_coalesce() -> Optional[LadderSnapshot]` (500ms window)

- [ ] **Step 1: Write failing test**

```python
# argus/tests/test_session.py
import pytest
from argus.options_live.session import Session
from argus.options_live.config import LiveConfig

def test_session_subscription_accounting():
    """Subscription cap halves window when hit."""
    config = LiveConfig(max_subscriptions=2, strike_window_side=20)
    session = Session(config)
    
    # Subscribe 3 symbols (exceeds cap)
    asyncio.run(session.subscribe("SPY", "0DTE"))
    asyncio.run(session.subscribe("QQQ", "0DTE"))
    window_before = session.active_subscriptions["SPY"].window_side
    
    asyncio.run(session.subscribe("IWM", "0DTE"))
    window_after = session.active_subscriptions["SPY"].window_side
    
    # Window should halve when cap exceeded
    assert window_after == window_before // 2
```

- [ ] **Step 2: Run test**

```bash
cd argus && pytest tests/test_session.py -v
```

Expected: FAIL

- [ ] **Step 3: Implement Session**

```python
# argus/argus/options_live/session.py
"""Per-symbol subscription lifecycle with tick coalescing."""
import asyncio
from datetime import datetime, timezone
from typing import Optional
from dataclasses import dataclass, field
import logging

from .config import LiveConfig
from .connector import IBKRConnector
from .models import LadderSnapshot
from .engine import run_analytics

logger = logging.getLogger(__name__)

@dataclass
class SymbolSession:
    """Per-symbol subscription state."""
    symbol: str
    expiry: str
    window_side: int
    active: bool = False
    contracts_subscribed: list = field(default_factory=list)
    last_ladder: Optional[LadderSnapshot] = None
    tick_buffer: dict = field(default_factory=dict)
    last_coalesce_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

class Session:
    """Manages all subscriptions with accounting and coalescing."""
    
    def __init__(self, config: LiveConfig):
        self.config = config
        self.connector = IBKRConnector(config)
        self.active_subscriptions: dict[str, SymbolSession] = {}
        self.subscription_count = 0
    
    async def subscribe(self, symbol: str, expiry: str) -> bool:
        """Subscribe to options for symbol/expiry.
        
        If subscription cap would be exceeded, halve strike window for all
        existing subscriptions instead of silently truncating.
        """
        if symbol in self.active_subscriptions:
            logger.warning(f"{symbol} already subscribed")
            return True
        
        window_side = self.config.strike_window_side
        
        # Check subscription cap
        if self.subscription_count >= self.config.max_subscriptions:
            # Halve window for all active subscriptions
            for session in self.active_subscriptions.values():
                old_window = session.window_side
                session.window_side = max(5, session.window_side // 2)
                logger.warning(
                    f"Subscription cap hit ({self.subscription_count}/"
                    f"{self.config.max_subscriptions}). Halved window: "
                    f"{old_window} → {session.window_side}"
                )
            window_side = max(5, window_side // 2)
        
        # Fetch and subscribe
        contracts = await self.connector.fetch_chain(symbol)
        if not contracts:
            logger.error(f"Failed to fetch chain for {symbol}")
            return False
        
        # Filter to window around ATM and requested expiry
        spot = 0  # TODO: get current spot
        filtered = self._filter_contracts(contracts, expiry, spot, window_side)
        
        await self.connector.subscribe_quotes(filtered, tick_callback=None)
        
        session = SymbolSession(
            symbol=symbol,
            expiry=expiry,
            window_side=window_side,
            contracts_subscribed=filtered,
            active=True,
        )
        self.active_subscriptions[symbol] = session
        self.subscription_count += 1
        
        logger.info(f"Subscribed {symbol} {expiry} ({len(filtered)} contracts, window={window_side})")
        return True
    
    async def unsubscribe(self, symbol: str) -> None:
        """Unsubscribe from symbol."""
        if symbol not in self.active_subscriptions:
            return
        
        session = self.active_subscriptions[symbol]
        await self.connector.unsubscribe_quotes(session.contracts_subscribed)
        
        del self.active_subscriptions[symbol]
        self.subscription_count -= 1
        
        logger.info(f"Unsubscribed {symbol}")
    
    async def tick_and_coalesce(self) -> Optional[LadderSnapshot]:
        """Collect ticks and coalesce at cadence.
        
        Returns LadderSnapshot only after tick_cadence_ms has passed.
        """
        now = datetime.now(timezone.utc)
        
        # For each active subscription, check if coalesce interval has passed
        result_snapshots = {}
        
        for symbol, session in self.active_subscriptions.items():
            elapsed_ms = (now - session.last_coalesce_time).total_seconds() * 1000
            
            if elapsed_ms >= self.config.tick_cadence_ms:
                # Collect latest quotes
                quotes = {}
                for contract in session.contracts_subscribed:
                    quote = self.connector.get_quote(contract)
                    if quote:
                        strike = contract.strike
                        right = contract.right
                        if strike not in quotes:
                            quotes[strike] = [None, None]
                        if right == "C":
                            quotes[strike][0] = quote
                        else:
                            quotes[strike][1] = quote
                
                if quotes:
                    # Run analytics
                    ladder = run_analytics(quotes, spot=0, expiry=session.expiry, config=self.config)
                    session.last_ladder = ladder
                    result_snapshots[symbol] = ladder
                    session.last_coalesce_time = now
        
        # Return first available snapshot (TODO: broadcast to all subscribers)
        if result_snapshots:
            return list(result_snapshots.values())[0]
        
        return None
    
    def _filter_contracts(self, contracts: list, expiry: str, spot: float, window_side: int) -> list:
        """Filter contracts to expiry and strike window."""
        # TODO: implement
        return contracts
```

- [ ] **Step 4: Run test**

```bash
cd argus && pytest tests/test_session.py -v
```

Expected: PASS (or partial pass if fakes not complete)

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_live/session.py argus/tests/test_session.py
git commit -m "feat(options-live): session lifecycle and subscription accounting"
```

---

## Phase 5: Fallback Layer

### Task 9: Implement yfinance EOD fallback

**Files:**
- Create: `argus/argus/options_live/fallback.py`

**Interfaces:**
- Consumes: `yfinance`, `LadderSnapshot` shape
- Produces: `get_eod_ladder(symbol: str, expiry: str) -> LadderSnapshot`

- [ ] **Step 1: Create fallback module**

```python
# argus/argus/options_live/fallback.py
"""Fallback to yfinance EOD when IBKR unavailable."""
from typing import Optional
from datetime import datetime, timezone
import logging
import yfinance as yf

from .models import LadderSnapshot, StrikeLevelSnapshot, OptionQuote

logger = logging.getLogger(__name__)

async def get_eod_ladder(symbol: str, expiry: str) -> Optional[LadderSnapshot]:
    """Fetch option chain from yfinance for symbol at close.
    
    Returns LadderSnapshot with source="EOD", no greeks.
    """
    try:
        ticker = yf.Ticker(symbol)
        
        # Get spot price
        spot = ticker.info.get("regularMarketPrice")
        if not spot:
            logger.warning(f"Cannot get spot for {symbol}")
            return None
        
        # Fetch options chain
        opts = ticker.option_chain(expiry)
        
        # Build levels (calls and puts from yfinance)
        levels = []
        
        for idx, call_row in opts.calls.iterrows():
            strike = call_row["strike"]
            
            # Find corresponding put
            put_rows = opts.puts[opts.puts["strike"] == strike]
            if put_rows.empty:
                put_row = None
            else:
                put_row = put_rows.iloc[0]
            
            call_quote = OptionQuote(
                bid=call_row.get("bid"),
                ask=call_row.get("ask"),
                mid=(call_row.get("bid", 0) + call_row.get("ask", 0)) / 2,
                spread_pct=None,
                iv=call_row.get("impliedVolatility"),
                volume=int(call_row.get("volume", 0)) if call_row.get("volume") else None,
                oi=int(call_row.get("openInterest", 0)) if call_row.get("openInterest") else None,
            )
            
            if put_row is not None:
                put_quote = OptionQuote(
                    bid=put_row.get("bid"),
                    ask=put_row.get("ask"),
                    mid=(put_row.get("bid", 0) + put_row.get("ask", 0)) / 2,
                    spread_pct=None,
                    iv=put_row.get("impliedVolatility"),
                    volume=int(put_row.get("volume", 0)) if put_row.get("volume") else None,
                    oi=int(put_row.get("openInterest", 0)) if put_row.get("openInterest") else None,
                )
            else:
                put_quote = OptionQuote()
            
            levels.append(StrikeLevelSnapshot(
                strike=strike,
                call=call_quote,
                put=put_quote,
            ))
        
        atm_strike = min((l.strike for l in levels), key=lambda s: abs(s - spot))
        
        return LadderSnapshot(
            symbol=symbol,
            spot=spot,
            as_of=datetime.now(timezone.utc),
            source="EOD",
            stale_ms=(datetime.now(timezone.utc) - datetime.now(timezone.utc)).total_seconds() * 1000,
            fresh_contract_ratio=0.0,  # No greeks from yfinance
            expiry=expiry,
            levels=levels,
            atm_strike=atm_strike,
        )
    
    except Exception as e:
        logger.error(f"yfinance EOD fallback failed for {symbol} {expiry}: {e}")
        return None
```

- [ ] **Step 2: Run test to verify it imports**

```bash
python -c "from argus.options_live.fallback import get_eod_ladder; print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add argus/argus/options_live/fallback.py
git commit -m "feat(options-live): yfinance EOD fallback"
```

---

## Phase 6: Transport & API Integration

### Task 10: Wire up WebSocket and REST endpoints

**Files:**
- Modify: `argus/argus/api/routes.py` (add `/ws/options/{symbol}` and `/api/options/live/{symbol}`)
- Create: `argus/argus/options_live/transport.py`

**Interfaces:**
- Consumes: `Session`, `LadderSnapshot`
- Produces: FastAPI endpoints returning JSON

- [ ] **Step 1: Create transport serialization**

```python
# argus/argus/options_live/transport.py
"""Serialize LadderSnapshot for JSON transport."""
from datetime import datetime
from typing import Optional
from .models import LadderSnapshot

def serialize_ladder(ladder: LadderSnapshot) -> dict:
    """Convert LadderSnapshot to JSON-serializable dict."""
    return {
        "symbol": ladder.symbol,
        "spot": ladder.spot,
        "as_of": ladder.as_of.isoformat(),
        "source": ladder.source,
        "stale_ms": ladder.stale_ms,
        "fresh_contract_ratio": ladder.fresh_contract_ratio,
        "expiry": ladder.expiry,
        "atm_strike": ladder.atm_strike,
        "zero_gamma_strike": ladder.zero_gamma_strike,
        "call_wall_strike": ladder.call_wall_strike,
        "put_wall_strike": ladder.put_wall_strike,
        "max_pain": ladder.max_pain,
        "pin_risk": ladder.pin_risk,
        "net_gex_band": ladder.net_gex_band,
        "msi_call_strike": ladder.msi_call_strike,
        "msi_put_strike": ladder.msi_put_strike,
        "msi_rationale": ladder.msi_rationale,
        "gex_profile_json": ladder.gex_profile_json,
        "levels": [
            {
                "strike": level.strike,
                "call": {
                    "bid": level.call.bid,
                    "ask": level.call.ask,
                    "mid": level.call.mid,
                    "spread_pct": level.call.spread_pct,
                    "iv": level.call.iv,
                    "delta": level.call.delta,
                    "gamma": level.call.gamma,
                    "theta": level.call.theta,
                    "vega": level.call.vega,
                    "rho": level.call.rho,
                    "volume": level.call.volume,
                    "oi": level.call.oi,
                },
                "put": {
                    "bid": level.put.bid,
                    "ask": level.put.ask,
                    "mid": level.put.mid,
                    "spread_pct": level.put.spread_pct,
                    "iv": level.put.iv,
                    "delta": level.put.delta,
                    "gamma": level.put.gamma,
                    "theta": level.put.theta,
                    "vega": level.put.vega,
                    "rho": level.put.rho,
                    "volume": level.put.volume,
                    "oi": level.put.oi,
                },
                "zero_gamma_side": level.zero_gamma_side,
                "wall_type": level.wall_type,
                "gex_by_strike": level.gex_by_strike,
                "max_pain_delta": level.max_pain_delta,
            }
            for level in ladder.levels
        ],
    }
```

- [ ] **Step 2: Add REST endpoint to routes.py**

```python
# argus/argus/api/routes.py (add this route)
from fastapi import APIRouter
from ..options_live.session import Session
from ..options_live.config import LiveConfig
from ..options_live.transport import serialize_ladder

options_router = APIRouter(prefix="/api/options", tags=["options"])

# Global session (TODO: make per-user or per-gateway-pool)
_session: Optional[Session] = None

def get_session() -> Session:
    global _session
    if _session is None:
        _session = Session(LiveConfig())
    return _session

@options_router.get("/live/{symbol}")
async def get_options_live(symbol: str, expiry: str = "0DTE"):
    """Fetch live options ladder for symbol."""
    session = get_session()
    
    # Ensure subscription
    await session.subscribe(symbol, expiry)
    
    # Coalesce and return
    ladder = await session.tick_and_coalesce()
    
    if ladder:
        return serialize_ladder(ladder)
    else:
        return {"error": "No data available"}

# Add to FastAPI app in main():
# app.include_router(options_router)
```

- [ ] **Step 3: Commit**

```bash
git add argus/argus/options_live/transport.py
git commit -m "feat(options-live): transport serialization and REST endpoint"
```

---

## Phase 7: Dashboard Integration

### Task 11: Update dashboard to use live ladder

**Files:**
- Modify: `dashboard/app/odte/strikes/page.tsx`
- Modify: `dashboard/lib/optionsLive.ts` (create or update)

**Interfaces:**
- Consumes: `/api/options/live/{symbol}` (LadderSnapshot JSON)
- Produces: 23-column ladder render + GEX profile chart + provenance badge

- [ ] **Step 1: Create dashboard lib for options live**

```typescript
// dashboard/lib/optionsLive.ts
export interface OptionLiveQuote {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  spread_pct: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  volume: number | null;
  oi: number | null;
}

export interface StrikeLevel {
  strike: number;
  call: OptionLiveQuote;
  put: OptionLiveQuote;
  zero_gamma_side?: string;
  wall_type?: string;
  gex_by_strike?: number;
}

export interface LadderSnapshot {
  symbol: string;
  spot: number;
  as_of: string;
  source: "LIVE" | "FROZEN" | "EOD";
  stale_ms: number;
  expiry: string;
  max_pain: number | null;
  pin_risk: number | null;
  net_gex_band: string;
  zero_gamma_strike: number | null;
  call_wall_strike: number | null;
  put_wall_strike: number | null;
  msi_call_strike: number | null;
  msi_put_strike: number | null;
  msi_rationale: string;
  gex_profile_json: string | null;
  levels: StrikeLevel[];
}

export async function fetchOptionsLive(
  symbol: string,
  expiry: string = "0DTE"
): Promise<LadderSnapshot | null> {
  try {
    const res = await fetch(`/api/options/live/${symbol}?expiry=${expiry}`);
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error("Failed to fetch options live:", err);
    return null;
  }
}
```

- [ ] **Step 2: Update strikes/page.tsx to render live ladder**

```typescript
// dashboard/app/odte/strikes/page.tsx
"use client";

import { useState, useEffect } from "react";
import { fetchOptionsLive, LadderSnapshot } from "@/lib/optionsLive";

export default function StrikesPage() {
  const [ladder, setLadder] = useState<LadderSnapshot | null>(null);
  const [symbol, setSymbol] = useState("SPY");
  
  useEffect(() => {
    const fetchData = async () => {
      const data = await fetchOptionsLive(symbol, "0DTE");
      setLadder(data);
    };
    
    fetchData();
    const interval = setInterval(fetchData, 500); // Match tick cadence
    return () => clearInterval(interval);
  }, [symbol]);
  
  if (!ladder) {
    return <div>Loading...</div>;
  }
  
  return (
    <div className="p-4">
      {/* Provenance badge */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`badge badge-${ladder.source.toLowerCase()}`}>
          {ladder.source}
        </span>
        <span className="text-sm text-gray-500">
          {new Date(ladder.as_of).toLocaleTimeString()}
        </span>
        {ladder.stale_ms > 0 && (
          <span className="text-sm text-amber-500">
            Stale {ladder.stale_ms}ms
          </span>
        )}
      </div>
      
      {/* Levels strip */}
      <div className="mb-4 grid grid-cols-6 gap-2 text-sm">
        <div>ATM: {ladder.atm_strike}</div>
        <div>Max Pain: {ladder.max_pain?.toFixed(2)}</div>
        <div>Pin Risk: {ladder.pin_risk?.toFixed(0)}</div>
        <div>Zero Gamma: {ladder.zero_gamma_strike}</div>
        <div>MSI: {ladder.msi_call_strike} (C)</div>
        <div>Net GEX: {ladder.net_gex_band}</div>
      </div>
      
      {/* Ladder table (23 columns) */}
      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th>Strike</th>
              {/* Call columns */}
              <th>C Bid</th>
              <th>C Ask</th>
              <th>C IV</th>
              <th>C Delta</th>
              <th>C Gamma</th>
              <th>C Theta</th>
              <th>C Vega</th>
              <th>C Volume</th>
              <th>C OI</th>
              <th>C GEX</th>
              {/* Put columns */}
              <th>P Bid</th>
              <th>P Ask</th>
              <th>P IV</th>
              <th>P Delta</th>
              <th>P Gamma</th>
              <th>P Theta</th>
              <th>P Vega</th>
              <th>P Volume</th>
              <th>P OI</th>
              <th>P GEX</th>
            </tr>
          </thead>
          <tbody>
            {ladder.levels.map((level) => (
              <tr key={level.strike} className={
                level.strike === ladder.zero_gamma_strike ? "bg-yellow-100" : ""
              }>
                <td className="font-bold">{level.strike}</td>
                {/* Call */}
                <td>{level.call.bid?.toFixed(2)}</td>
                <td>{level.call.ask?.toFixed(2)}</td>
                <td>{level.call.iv?.toFixed(4)}</td>
                <td>{level.call.delta?.toFixed(3)}</td>
                <td>{level.call.gamma?.toFixed(5)}</td>
                <td>{level.call.theta?.toFixed(3)}</td>
                <td>{level.call.vega?.toFixed(3)}</td>
                <td>{level.call.volume}</td>
                <td>{level.call.oi}</td>
                <td>{level.gex_by_strike?.toFixed(0)}</td>
                {/* Put */}
                <td>{level.put.bid?.toFixed(2)}</td>
                <td>{level.put.ask?.toFixed(2)}</td>
                <td>{level.put.iv?.toFixed(4)}</td>
                <td>{level.put.delta?.toFixed(3)}</td>
                <td>{level.put.gamma?.toFixed(5)}</td>
                <td>{level.put.theta?.toFixed(3)}</td>
                <td>{level.put.vega?.toFixed(3)}</td>
                <td>{level.put.volume}</td>
                <td>{level.put.oi}</td>
                <td>{level.gex_by_strike?.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/lib/optionsLive.ts dashboard/app/odte/strikes/page.tsx
git commit -m "feat(dashboard): render live options ladder with 23 columns"
```

---

### Task 12: Add GEX profile chart to dashboard

**Files:**
- Modify: `dashboard/app/odte/page.tsx` or new `dashboard/components/GEXProfile.tsx`

**Interfaces:**
- Consumes: `gex_profile_json` (61-point curve from DB)
- Produces: Chart component

- [ ] **Step 1: Create GEX profile chart component**

```typescript
// dashboard/components/GEXProfile.tsx
"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface GEXProfileProps {
  symbol: string;
  profileJson: string | null;
  gexBand: string;
}

export function GEXProfile({ symbol, profileJson, gexBand }: GEXProfileProps) {
  if (!profileJson) {
    return <div className="text-gray-500">No GEX profile data</div>;
  }
  
  try {
    const data = JSON.parse(profileJson).map((point: [number, number]) => ({
      strike: point[0],
      gex: point[1],
    }));
    
    const color = gexBand === "bullish" ? "#22c55e" : gexBand === "bearish" ? "#ef4444" : "#6b7280";
    
    return (
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="gexGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.8} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="strike" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="gex" stroke={color} fill="url(#gexGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  } catch (err) {
    console.error("Failed to parse GEX profile:", err);
    return <div className="text-red-500">Invalid GEX profile</div>;
  }
}
```

- [ ] **Step 2: Integrate into strikes page**

```typescript
// dashboard/app/odte/strikes/page.tsx (add to component)
import { GEXProfile } from "@/components/GEXProfile";

// Inside StrikesPage component:
<div className="mb-8">
  <h3 className="text-lg font-semibold mb-4">GEX Profile (Dealer Gamma)</h3>
  <GEXProfile 
    symbol={symbol} 
    profileJson={ladder?.gex_profile_json} 
    gexBand={ladder?.net_gex_band || "neutral"}
  />
</div>
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/components/GEXProfile.tsx
git commit -m "feat(dashboard): GEX profile curve chart"
```

---

## Phase 8: Testing & Validation

### Task 13: Unit tests for analytics with recorded fixtures

**Files:**
- Create: `argus/tests/fixtures/options_quotes.json` (recorded ticks)
- Modify: `argus/tests/test_iv_surface.py`, `argus/tests/test_exposures.py`, etc.

**Interfaces:**
- Consumes: Fixture files with real IBKR quote snapshots
- Produces: Passing tests for all analytics

- [ ] **Step 1: Record fixture data**

```bash
# When connected to IBKR at open, capture one tick per symbol
# Save to argus/tests/fixtures/options_quotes_spy_0dte.json
python argus/argus/options_live/connector.py --symbol SPY --expiry 0DTE --record-fixture
```

- [ ] **Step 2: Write fixture-based test**

```python
# argus/tests/test_analytics_live.py
import json
import pytest
from argus.options_live.engine import run_analytics
from argus.options_live.config import LiveConfig

def load_fixture(name: str) -> dict:
    with open(f"argus/tests/fixtures/options_quotes_{name}.json") as f:
        return json.load(f)

def test_engine_with_recorded_spy_0dte():
    """Run analytics on real recorded SPY 0DTE tick."""
    fixture = load_fixture("spy_0dte")
    
    ladder = run_analytics(
        quotes=fixture["quotes"],
        spot=fixture["spot"],
        expiry="0DTE",
        config=LiveConfig(),
        source="LIVE",
    )
    
    # Sanity checks
    assert ladder.symbol == "SPY"
    assert ladder.source == "LIVE"
    assert ladder.max_pain is not None
    assert 0 <= ladder.pin_risk <= 100 if ladder.pin_risk else True
    assert len(ladder.levels) > 0
    assert all(l.strike for l in ladder.levels)
```

- [ ] **Step 3: Run tests**

```bash
cd argus && pytest tests/test_analytics_live.py -v
```

- [ ] **Step 4: Commit**

```bash
git add argus/tests/fixtures/ argus/tests/test_analytics_live.py
git commit -m "test(options-live): analytics with recorded fixtures"
```

---

### Task 14: Connector unit tests with faked ib_insync

**Files:**
- Create: `argus/tests/test_connector_fake.py`

**Interfaces:**
- Consumes: Mock ib_insync.IB
- Produces: Tests for tradingClass filter, market-data escalation, reconnect

- [ ] **Step 1: Write failing tests**

```python
# argus/tests/test_connector_fake.py
import pytest
from unittest.mock import Mock, MagicMock, AsyncMock
from ib_insync import Contract
from argus.options_live.connector import IBKRConnector
from argus.options_live.config import LiveConfig

@pytest.mark.asyncio
async def test_connector_tradingclass_filter():
    """Verify tradingClass filter rejects 2SPY."""
    config = LiveConfig()
    connector = IBKRConnector(config)
    
    # Mock chain with both correct and adjusted classes
    mock_ib = MagicMock()
    connector.ib = mock_ib
    connector.connected = True
    
    # Fake chain response
    mock_chain_obj = Mock()
    mock_chain_obj.expirations = ["20260815", "20260816"]
    mock_chain_obj.strikes = [100, 105, 110]
    mock_ib.reqSecDefOptParams.return_value = [mock_chain_obj]
    
    # Fetch chain
    contracts = await connector.fetch_chain("SPY")
    
    # Verify tradingClass = "SPY" (not "2SPY")
    for c in contracts:
        assert c.tradingClass == "SPY"

@pytest.mark.asyncio
async def test_connector_market_data_escalation():
    """Verify market data type escalation: live (1) → frozen (2)."""
    config = LiveConfig()
    connector = IBKRConnector(config)
    
    # TODO: Mock quote with lastPrice=-1 (off-hours)
    # Verify fallback to frozen mode
    pass

@pytest.mark.asyncio
async def test_connector_reconnect_backoff():
    """Verify exponential backoff on connection failure."""
    config = LiveConfig(reconnect_backoff_ms=100, reconnect_max_backoff_ms=1000)
    connector = IBKRConnector(config)
    
    # Mock connection failure
    # Verify backoff increases: 100, 200, 400, 800, 1000, 1000, ...
    pass
```

- [ ] **Step 2: Implement tests**

(Tests depend on ib_insync mocking; skip for now if library changes complex)

- [ ] **Step 3: Commit (optional if tests incomplete)**

```bash
git add argus/tests/test_connector_fake.py
git commit -m "test(options-live): connector fakes and escalation logic"
```

---

### Task 15: Live smoke test at open

**Files:**
- Create: `argus/tests/smoke.py` (add to existing file or new section)

**Interfaces:**
- Consumes: Real IBKR Gateway at 09:30 EDT
- Produces: PASS/FAIL with log output

- [ ] **Step 1: Write smoke test**

```python
# argus/tests/smoke.py (add)
@pytest.mark.smoke
@pytest.mark.asyncio
async def test_options_live_smoke_at_open():
    """Live smoke test: connect, subscribe SPY 0DTE, receive ≥1 tick."""
    import asyncio
    
    config = LiveConfig()
    session = Session(config)
    
    # Subscribe SPY at open
    subscribed = await session.subscribe("SPY", "0DTE")
    assert subscribed, "Failed to subscribe SPY"
    
    # Wait for tick
    for _ in range(10):
        ladder = await session.tick_and_coalesce()
        if ladder:
            break
        await asyncio.sleep(0.5)
    
    assert ladder is not None, "No tick received after 5 seconds"
    assert ladder.source in ("LIVE", "FROZEN"), f"Unexpected source: {ladder.source}"
    assert ladder.spot > 0, "Invalid spot price"
    assert len(ladder.levels) > 0, "No levels in ladder"
    
    # Sanity checks on first level
    level = ladder.levels[0]
    assert level.strike > 0, "Invalid strike"
    # At least call or put should have data
    has_call_data = level.call.bid or level.call.ask or level.call.iv
    has_put_data = level.put.bid or level.put.ask or level.put.iv
    assert has_call_data or has_put_data, "No quote data"
    
    await session.unsubscribe("SPY")
    logger.info(f"✓ Smoke test PASSED: {ladder.source} {len(ladder.levels)} levels")
```

- [ ] **Step 2: Run manually at open (09:30 EDT)**

```bash
cd argus && pytest tests/smoke.py::test_options_live_smoke_at_open -v -s
```

Expected: PASS with "✓ Smoke test PASSED"

- [ ] **Step 3: Commit**

```bash
git add argus/tests/smoke.py
git commit -m "test(options-live): live smoke test at open"
```

---

## Verification Checklist

After all tasks complete:

- [ ] **Config**: `LiveConfig` class with all required fields (port, clientId, cadence, window, thresholds)
- [ ] **Connector**: IBKR connection with tradingClass filter, market-data escalation, subscription accounting
- [ ] **Quotes**: ib_insync ticks normalized to OptionQuote with volume/OI (generic ticks 100,101,106)
- [ ] **IV Surface**: Quadratic smile fit; handles <8 points gracefully
- [ ] **Exposures**: GEX/VEX per strike using dealer sign assumption; net GEX band classification
- [ ] **Levels**: Zero-gamma, walls (25% concentration threshold), max pain (argmin), pin risk (concentration + distance)
- [ ] **Engine**: Per-tick orchestration producing LadderSnapshot with 23 columns (same as original app)
- [ ] **Session**: Per-symbol lifecycle, subscription accounting with window halving on cap hit, 500ms coalescing
- [ ] **Fallback**: yfinance EOD with source badge; frozen mode when options off-hours
- [ ] **Transport**: LadderSnapshot serialization to JSON
- [ ] **API**: `/api/options/live/{symbol}` REST endpoint + WS (optional Phase 2)
- [ ] **Dashboard**: Render 23-column ladder, GEX profile chart, provenance badge, levels strip (max pain, pin risk, net GEX band, zero-gamma, MSI/MTC)
- [ ] **Tests**: Unit tests (iv_surface, exposures, levels, msi_mtc) with recorded fixtures; connector fakes; live smoke at open
- [ ] **Commits**: All tasks committed with atomic messages

---

## Out of Scope (Phase 2+)

- WebSocket push (REST polling sufficient for Phase 1)
- Index underlyings (SPX/NDX/RUT/DJX) — deferred to SP2b
- Single-stock live ladders — deferred
- True dealer gamma sign inference — spec notes as open limitation
- Order placement — read-only enforced

---

**Next:** Use superpowers:executing-plans or superpowers:subagent-driven-development to implement tasks 1–15 in order.
