"""Normalize IBKR quotes to OptionQuote."""

from typing import Optional, Tuple, Dict
from .models import OptionQuote
import logging

logger = logging.getLogger(__name__)


def ticker_to_quote(ticker_dict: Dict) -> OptionQuote:
    """Convert ib_insync ticker dict to OptionQuote.

    Handles None/missing fields gracefully.
    """
    bid = ticker_dict.get("bid")
    ask = ticker_dict.get("ask")
    mid = ticker_dict.get("mid")

    # Compute mid if not provided
    if mid is None and bid is not None and ask is not None:
        mid = (bid + ask) / 2

    # Compute spread %
    spread_pct = None
    if bid is not None and ask is not None and mid and mid > 0:
        spread_pct = ((ask - bid) / mid) * 100

    volume = ticker_dict.get("volume")
    oi = ticker_dict.get("oi")

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
        volume=int(volume) if volume else None,
        oi=int(oi) if oi else None,
        stale_ms=ticker_dict.get("stale_ms", 0),
        liquid=(
            (volume or 0) > 10 and (oi or 0) > 100
        ),
    )


def organize_by_strike(
    quotes: list[Tuple],  # [(contract, ticker_dict), ...]
) -> Dict[float, Tuple[Optional[OptionQuote], Optional[OptionQuote]]]:
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
