"""Multi-symbol screener. Runs the full agent stack against a list of
tickers in parallel and returns ranked Action Cards."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable, List, Optional

from ..action_card import build_action_card, ActionCard
from ..data import get_history


# Default universe: liquid US large-caps + sector ETFs. Easy to override.
DEFAULT_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "ORCL", "AMD",
    "JPM", "BAC", "WFC", "GS", "MS",
    "XOM", "CVX",
    "UNH", "LLY", "JNJ", "PFE",
    "WMT", "COST", "HD", "MCD", "NKE",
    "DIS", "NFLX",
    "BA", "CAT", "DE",
    "SPY", "QQQ", "IWM", "DIA",
    "XLK", "XLF", "XLE", "XLV", "XLY", "XLP", "XLI", "XLU", "XLB", "XLRE", "XLC",
]


def _score_one(symbol: str) -> Optional[ActionCard]:
    df = get_history(symbol, period="1y", interval="1d")
    if df.empty or len(df) < 60:
        return None
    return build_action_card(symbol, df)


def screen_universe(
    universe: Iterable[str] = DEFAULT_UNIVERSE,
    min_conviction: float = 0.0,
    workers: int = 8,
) -> List[ActionCard]:
    cards: List[ActionCard] = []
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_score_one, s): s for s in universe}
        for f in as_completed(futures):
            try:
                card = f.result()
                if card and abs(card.score) >= min_conviction:
                    cards.append(card)
            except Exception:
                continue
    cards.sort(key=lambda c: abs(c.score), reverse=True)
    return cards
