"""IBKR client wrapper around ib_insync.

Lazy connection — we only spin up the IB event loop if you actually call
something that needs it. This means the rest of the app works fine even
when TWS/IB Gateway isn't running.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Optional
import threading

from ..settings import settings


def parse_news_headlines(items) -> list[str]:
    """Extract plain headline strings from IBKR historical-news rows; tolerant of junk."""
    out: list[str] = []
    for it in (items or []):
        headline = getattr(it, "headline", None)
        if isinstance(headline, str) and headline.strip():
            out.append(headline.strip())
    return out


class IBKRClient:
    _lock = threading.Lock()
    _instance: Optional["IBKRClient"] = None

    def __init__(self) -> None:
        from ib_insync import IB  # local import — only required when used

        self._IB = IB
        self.ib = IB()

    @classmethod
    def instance(cls) -> "IBKRClient":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    # ---------- connection ----------

    def connect(self) -> None:
        if self.ib.isConnected():
            self.ib.disconnect()
        # Recreate IB() so its internal asyncio primitives bind to the
        # current thread's loop rather than a stale one from a prior request.
        self.ib = self._IB()
        self.ib.connect(
            host=settings.ibkr_host,
            port=settings.ibkr_port,
            clientId=settings.ibkr_client_id,
            timeout=10,
        )

    def disconnect(self) -> None:
        if self.ib.isConnected():
            self.ib.disconnect()

    # ---------- account ----------

    def positions(self) -> list[dict]:
        self.connect()
        out = []
        for p in self.ib.positions():
            out.append({
                "account": p.account,
                "symbol": p.contract.symbol,
                "sec_type": p.contract.secType,
                "exchange": p.contract.exchange,
                "currency": p.contract.currency,
                "position": float(p.position),
                "avg_cost": float(p.avgCost),
            })
        return out

    def account_summary(self) -> dict:
        self.connect()
        rows = self.ib.accountSummary()
        return {r.tag: r.value for r in rows}

    # ---------- orders ----------

    def place_market_order(
        self, symbol: str, side: str, qty: int, exchange: str = "SMART"
    ) -> dict:
        if not settings.ibkr_live_trading:
            return {
                "ok": False,
                "error": "IBKR_LIVE_TRADING is off. Set it to 1 in .env to enable.",
            }
        self.connect()
        from ib_insync import Stock, MarketOrder

        contract = Stock(symbol.upper(), exchange, "USD")
        self.ib.qualifyContracts(contract)
        order = MarketOrder(side.upper(), qty)
        trade = self.ib.placeOrder(contract, order)
        self.ib.sleep(1)
        return {
            "ok": True,
            "symbol": symbol.upper(),
            "side": side.upper(),
            "qty": qty,
            "status": trade.orderStatus.status,
            "order_id": trade.order.orderId,
        }

    def fundamentals(self, symbol: str) -> dict:
        """Fetch fundamental data for a symbol via IBKR ReportSnapshot + market data.

        Returns: earnings_date, days_to_earnings, short_pct_float, dtc,
                 analyst_target, analyst_rating, week52_high, week52_low,
                 iv_rank (approximated from IV vs hist vol), pe_ratio,
                 market_cap, revenue_ttm, eps_ttm.
        All values are None if IBKR cannot provide them.
        """
        self.connect()
        from ib_insync import Stock

        contract = Stock(symbol, "SMART", "USD")
        self.ib.qualifyContracts(contract)

        result: dict = {"symbol": symbol}

        # ── Fundamental report (ReportSnapshot = key financial ratios) ──
        try:
            xml_raw = self.ib.reqFundamentalData(contract, "ReportSnapshot")
            if xml_raw:
                root = ET.fromstring(xml_raw)
                def _ratio(code: str) -> Optional[float]:
                    el = root.find(f".//Ratio[@FieldName='{code}']")
                    if el is not None and el.text:
                        try: return float(el.text)
                        except ValueError: return None
                    return None

                result["pe_ratio"]     = _ratio("P/E")
                result["eps_ttm"]      = _ratio("EPS")
                result["revenue_ttm"]  = _ratio("TTMREV")
                result["market_cap"]   = _ratio("MKTCAP")

                # Analyst target mean and consensus
                tgt_el = root.find(".//ConsRecommendationTrend/ConsRec[@Type='MEAN']")
                result["analyst_target"] = float(tgt_el.find("TargetPrice").text) if tgt_el is not None and tgt_el.find("TargetPrice") is not None else None
                rating_el = root.find(".//ConsRecommendationTrend/ConsRec[@Type='CONSENSUS']")
                result["analyst_rating"] = rating_el.find("Rating").text if rating_el is not None and rating_el.find("Rating") is not None else None

                # Short interest & days to cover
                short_el = root.find(".//ShortInterest")
                if short_el is not None:
                    si_pct  = short_el.find("ShortInterestPct")
                    si_dtc  = short_el.find("DaysToCover")
                    result["short_pct_float"] = float(si_pct.text) if si_pct is not None and si_pct.text else None
                    result["dtc"]             = float(si_dtc.text) if si_dtc is not None and si_dtc.text else None
                else:
                    result["short_pct_float"] = None
                    result["dtc"]             = None
        except Exception:
            result.setdefault("pe_ratio", None)
            result.setdefault("eps_ttm", None)
            result.setdefault("revenue_ttm", None)
            result.setdefault("market_cap", None)
            result.setdefault("analyst_target", None)
            result.setdefault("analyst_rating", None)
            result.setdefault("short_pct_float", None)
            result.setdefault("dtc", None)

        # ── Calendar report (earnings date) ──
        try:
            xml_cal = self.ib.reqFundamentalData(contract, "CalendarReport")
            if xml_cal:
                root_cal = ET.fromstring(xml_cal)
                now = datetime.now(timezone.utc)
                # Find next earnings date
                dates = []
                for el in root_cal.iter("EarningsDate"):
                    if el.text:
                        try:
                            dt = datetime.fromisoformat(el.text.replace("Z", "+00:00"))
                            if dt > now:
                                dates.append(dt)
                        except ValueError:
                            pass
                if dates:
                    next_earn = min(dates)
                    result["earnings_date"] = next_earn.strftime("%Y-%m-%d")
                    result["days_to_earnings"] = (next_earn - now).days
                else:
                    result["earnings_date"] = None
                    result["days_to_earnings"] = None
        except Exception:
            result.setdefault("earnings_date", None)
            result.setdefault("days_to_earnings", None)

        # ── Market data snapshot (IV, 52w high/low) ──
        try:
            ticker = self.ib.reqMktData(contract, "104,165,293,456", snapshot=True)
            self.ib.sleep(2)
            result["week52_high"] = float(ticker.high52Week) if ticker.high52Week and ticker.high52Week == ticker.high52Week else None
            result["week52_low"]  = float(ticker.low52Week)  if ticker.low52Week  and ticker.low52Week  == ticker.low52Week  else None
            result["iv_30d"]      = float(ticker.impliedVolatility) if ticker.impliedVolatility and ticker.impliedVolatility == ticker.impliedVolatility else None
            result["hist_vol_30d"]= float(ticker.histVolatility)    if ticker.histVolatility    and ticker.histVolatility    == ticker.histVolatility    else None
            if result["iv_30d"] and result["hist_vol_30d"] and result["hist_vol_30d"] > 0:
                result["iv_vs_hv"] = round(result["iv_30d"] / result["hist_vol_30d"], 2)
            else:
                result["iv_vs_hv"] = None
            self.ib.cancelMktData(contract)
        except Exception:
            result.setdefault("week52_high", None)
            result.setdefault("week52_low", None)
            result.setdefault("iv_30d", None)
            result.setdefault("hist_vol_30d", None)
            result.setdefault("iv_vs_hv", None)

        return result

    def historical_bars(self, symbol: str, *, end: str = "", duration: str = "1 Y",
                        bar_size: str = "1 hour", what: str = "TRADES",
                        use_rth: bool = True):
        """Historical OHLCV bars via reqHistoricalData. Columns lowercase
        open/high/low/close/volume, DatetimeIndex named 'ts' (matches data.market).
        Empty DataFrame on no data."""
        import pandas as pd
        from ib_insync import Stock

        self.connect()
        contract = Stock(symbol.upper(), "SMART", "USD")
        self.ib.qualifyContracts(contract)
        bars = self.ib.reqHistoricalData(
            contract, endDateTime=end, durationStr=duration, barSizeSetting=bar_size,
            whatToShow=what, useRTH=use_rth, formatDate=1)
        cols = ["open", "high", "low", "close", "volume"]
        if not bars:
            return pd.DataFrame(columns=cols)
        df = pd.DataFrame(
            [{"ts": b.date, "open": b.open, "high": b.high, "low": b.low,
              "close": b.close, "volume": b.volume} for b in bars]
        ).set_index("ts")
        df.index = pd.to_datetime(df.index)
        df.index.name = "ts"
        return df[cols]

    def historical_news(self, symbol: str, total: int = 10) -> list[str]:
        """Best-effort recent news headlines for a symbol. Returns [] on any failure
        or if no news-provider subscription is available."""
        try:
            self.connect()
            from ib_insync import Stock
            contract = Stock(symbol, "SMART", "USD")
            self.ib.qualifyContracts(contract)
            provider_codes = "+".join(p.code for p in self.ib.reqNewsProviders())
            if not provider_codes:
                return []
            items = self.ib.reqHistoricalNews(contract.conId, provider_codes, "", "", total)
            return parse_news_headlines(items)
        except Exception:
            return []

    def place_bracket_order(
        self,
        symbol: str,
        side: str,
        qty: int,
        entry: float,
        stop: float,
        target: float,
        exchange: str = "SMART",
    ) -> dict:
        """Bracket = entry limit + protective stop + take-profit limit."""
        if not settings.ibkr_live_trading:
            return {"ok": False, "error": "IBKR_LIVE_TRADING is off."}
        self.connect()
        from ib_insync import Stock

        contract = Stock(symbol.upper(), exchange, "USD")
        self.ib.qualifyContracts(contract)
        bracket = self.ib.bracketOrder(
            action=side.upper(),
            quantity=qty,
            limitPrice=entry,
            takeProfitPrice=target,
            stopLossPrice=stop,
        )
        trades = [self.ib.placeOrder(contract, o) for o in bracket]
        self.ib.sleep(1)
        return {
            "ok": True,
            "symbol": symbol.upper(),
            "side": side.upper(),
            "qty": qty,
            "entry": entry,
            "stop": stop,
            "target": target,
            "ids": [t.order.orderId for t in trades],
        }
