from __future__ import annotations

from .types import CatalystPool


def _default_yf_info(ticker: str) -> dict:
    import yfinance as yf
    return yf.Ticker(ticker).info or {}


def _default_yf_news(ticker: str) -> list[str]:
    import yfinance as yf
    out: list[str] = []
    for item in (yf.Ticker(ticker).news or []):
        title = item.get("title") or item.get("content", {}).get("title")
        if isinstance(title, str) and title.strip():
            out.append(title.strip())
    return out


def _chatter_tags(setups_row) -> list[str]:
    if not setups_row:
        return []
    raw = setups_row.get("catalysts") or ""
    return [t.strip() for t in str(raw).replace(",", ";").split(";") if t.strip()]


def _safe(fn, ticker, default):
    try:
        return fn(ticker)
    except Exception:
        return default


def _metrics_from_yf(info: dict) -> dict:
    m: dict = {}
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    if price:
        m["price"] = float(price)
    if info.get("marketCap"):
        m["market_cap"] = float(info["marketCap"])
    spf = info.get("shortPercentOfFloat")
    if spf is not None:
        m["short_pct_float"] = float(spf) * 100.0   # yfinance gives a fraction
    if info.get("revenueGrowth") is not None:
        m["revenue_growth"] = float(info["revenueGrowth"])
    if info.get("profitMargins") is not None:
        m["profit_margin"] = float(info["profitMargins"])
    if info.get("targetMeanPrice"):
        m["analyst_target"] = float(info["targetMeanPrice"])
    if info.get("recommendationKey"):
        m["analyst_rating"] = str(info["recommendationKey"])
    return m


def gather_pool(
    ticker: str,
    setups_row=None,
    *,
    ibkr=None,
    yf_info_fn=_default_yf_info,
    yf_news_fn=_default_yf_news,
) -> CatalystPool:
    """Pool free catalyst/fundamental data for one ticker. All sources best-effort."""
    info = _safe(yf_info_fn, ticker, {})
    news = list(_safe(yf_news_fn, ticker, []))
    metrics = _metrics_from_yf(info) if info else {}

    if ibkr is not None:
        fund = _safe(lambda t: ibkr.fundamentals(t), ticker, {}) or {}
        if fund.get("market_cap"):
            metrics["market_cap"] = float(fund["market_cap"])
        if fund.get("short_pct_float") is not None:
            metrics["short_pct_float"] = float(fund["short_pct_float"])  # IBKR returns percent, not fraction
        if fund.get("dtc") is not None:
            metrics["dtc"] = float(fund["dtc"])
        if fund.get("days_to_earnings") is not None:
            metrics["days_to_earnings"] = float(fund["days_to_earnings"])
        if fund.get("analyst_target"):
            metrics["analyst_target"] = float(fund["analyst_target"])
        if fund.get("analyst_rating"):
            metrics["analyst_rating"] = str(fund["analyst_rating"])
        news += _safe(lambda t: ibkr.historical_news(t), ticker, [])

    seen: set[str] = set()
    news_unique = [n for n in news if not (n in seen or seen.add(n))]

    return CatalystPool(
        ticker=ticker,
        chatter_tags=_chatter_tags(setups_row),
        news_texts=news_unique,
        metrics=metrics,
    )
