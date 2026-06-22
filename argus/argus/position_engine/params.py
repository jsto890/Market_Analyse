"""The 8 pre-registered tunable axes (design spec §11/§192) as 10 numeric fields —
`bias_enter`/`bias_leave` and `arm`/`disarm` are two-sided spreads, each one axis.
Frozen for injection. Defaults equal the Phase-1 module constants, so existing callers are unchanged.
NOT included (held fixed by the spec): min-hold, R:R floor, resumption volume,
gap-skip ATR, swing lookback, strength weights."""
from dataclasses import dataclass


@dataclass(frozen=True)
class EngineParams:
    bias_enter: int = 4      # bias.ENTER  (Schmitt upper)
    bias_leave: int = 1      # bias.LEAVE  (Schmitt lower)
    confirm_bars: int = 2    # bias.CONFIRM
    min_dwell: int = 10      # bias.DWELL
    arm: int = 50            # strength.ARM
    disarm: int = 40         # strength.DISARM
    buy_zone_atr: float = 0.5  # levels.BUY_ZONE_ATR
    stop_atr: float = 1.5      # levels.STOP_ATR
    trail_atr: float = 2.5     # levels.TRAIL_ATR
    cooldown_bars: int = 5     # overlay.COOLDOWN_BARS


DEFAULT = EngineParams()
