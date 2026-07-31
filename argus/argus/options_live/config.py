from dataclasses import dataclass


@dataclass
class LiveConfig:
    """Configuration for live IBKR options ladder."""
    ibkr_port: int = 4003  # IBKR Gateway paper port
    ibkr_clientId: int = 10  # Unique ID for this connection
    tick_cadence_ms: int = 500  # Coalesce ticks; 500ms = ~2 updates/sec
    strike_window_side: int = 20  # Strikes per side (total window 40+1 ATM)
    max_subscriptions: int = 8  # Soft cap on concurrent subscriptions before halving window
    enable_frozen_fallback: bool = True  # Use frozen mode when live unavailable
    enable_yfinance_eod: bool = True  # Use yfinance when Gateway unreachable
    reconnect_backoff_ms: int = 1000  # Initial backoff; exponential
    reconnect_max_backoff_ms: int = 30000  # Cap on backoff
