"""Catalyst / fundamental third leg for the sentiment×technical bridge."""
from .types import CatalystEvent, CatalystPool, CatalystResult
from .score import catalyst_leg, INTRA_WEIGHTS

__all__ = ["CatalystEvent", "CatalystPool", "CatalystResult", "catalyst_leg", "INTRA_WEIGHTS"]
