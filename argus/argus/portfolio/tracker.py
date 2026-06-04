"""Portfolio tracker: read live IBKR positions and overlay the current
Argus edge for each one (HOLD/ADD, CONSIDER SELLING, NEUTRAL)."""
from __future__ import annotations

from typing import List
from ..data import IBKRClient, get_history
from ..action_card import build_action_card
from ..agents.base import Verdict
from ..settings import settings


class PortfolioTracker:
    def __init__(self) -> None:
        self.ib = IBKRClient.instance()

    def _yf_watchlist_rows(self) -> List[dict]:
        syms = [s.strip().upper() for s in settings.ibkr_watchlist.split(",") if s.strip()]
        rows = []
        for sym in syms:
            try:
                df = get_history(sym, period="1y", interval="1d")
                if df.empty:
                    rows.append({"symbol": sym, "ibkr_offline": True, "edge": "NO DATA"})
                    continue
                card = build_action_card(sym, df)
                rows.append({
                    "symbol": sym,
                    "ibkr_offline": True,
                    "position": None,
                    "avg_cost": None,
                    "edge": card.verdict.value,
                    "verdict": card.verdict.value,
                    "score": card.score,
                    "high_conviction": card.high_conviction,
                })
            except Exception as e:
                rows.append({"symbol": sym, "ibkr_offline": True, "edge": "ERROR", "error": str(e)})
        return rows

    def positions_with_edge(self) -> List[dict]:
        rows = []
        try:
            positions = self.ib.positions()
        except Exception as e:
            fallback = self._yf_watchlist_rows()
            if fallback:
                return fallback
            return [{"error": f"IBKR not connected: {e}", "ibkr_offline": True}]

        for p in positions:
            if p["sec_type"] != "STK":
                rows.append({**p, "edge": "N/A"})
                continue
            try:
                df = get_history(p["symbol"], period="1y", interval="1d")
                if df.empty:
                    rows.append({**p, "edge": "NO DATA"})
                    continue
                card = build_action_card(p["symbol"], df)
                if p["position"] > 0:
                    if card.verdict == Verdict.LONG:
                        edge = "HOLD/ADD"
                    elif card.verdict == Verdict.SHORT:
                        edge = "CONSIDER SELLING"
                    else:
                        edge = "NEUTRAL"
                else:
                    if card.verdict == Verdict.SHORT:
                        edge = "HOLD/ADD"
                    elif card.verdict == Verdict.LONG:
                        edge = "CONSIDER COVERING"
                    else:
                        edge = "NEUTRAL"
                rows.append({
                    **p,
                    "edge": edge,
                    "verdict": card.verdict.value,
                    "score": card.score,
                    "high_conviction": card.high_conviction,
                })
            except Exception as e:
                rows.append({**p, "edge": "ERROR", "error": str(e)})
        return rows
