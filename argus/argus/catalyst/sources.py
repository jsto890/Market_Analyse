from __future__ import annotations

from .types import CatalystPool


def _default_yf_info(ticker: str) -> dict:
    import yfinance as yf
    return yf.Ticker(ticker).info or {}


def _default_yf_news(ticker: str) -> list[dict]:
    """Return list of {text, ts} dicts. ts is Unix timestamp or None."""
    import yfinance as yf
    out: list[dict] = []
    for item in (yf.Ticker(ticker).news or []):
        title = item.get("title") or item.get("content", {}).get("title")
        if not (isinstance(title, str) and title.strip()):
            continue
        ts = (item.get("providerPublishTime") or item.get("publishedAt")
              or item.get("publish_time") or item.get("publishTime"))
        out.append({"text": title.strip(), "ts": float(ts) if ts else None})
    return out


def _chatter_tags(setups_row) -> list[str]:
    if setups_row is None:
        return []
    raw = setups_row.get("catalysts") or ""
    return [t.strip() for t in str(raw).replace(",", ";").split(";") if t.strip()]


def _safe(fn, ticker, default):
    try:
        return fn(ticker)
    except Exception:
        return default


def _earnings_from_yf(ticker: str) -> dict:
    """Last earnings date + EPS actual/estimate from yfinance earnings_dates."""
    try:
        import yfinance as yf
        import math
        from datetime import datetime, timezone
        hist = yf.Ticker(ticker).earnings_dates
        if hist is None or hist.empty:
            return {}
        now = datetime.now(timezone.utc)
        try:
            past = hist[hist.index < now]
        except TypeError:
            past = hist[hist.index < now.replace(tzinfo=None)]
        if past.empty:
            return {}
        row = past.iloc[0]
        result: dict = {}
        try:
            result["last_earnings_ts"] = row.name.timestamp()
        except Exception:
            pass
        def _f(v):
            return None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)
        eps_act = _f(row.get("Reported EPS"))
        eps_est = _f(row.get("EPS Estimate"))
        if eps_act is not None:
            result["eps_actual"] = eps_act
        if eps_est is not None:
            result["eps_estimate"] = eps_est
        if eps_act is not None and eps_est is not None and eps_est != 0:
            result["eps_surprise"] = eps_act - eps_est
        return result
    except Exception:
        return {}


def _upgrades_from_yf(ticker: str) -> dict:
    """Most recent analyst upgrade/downgrade within 90 days."""
    try:
        import yfinance as yf
        from datetime import datetime, timezone, timedelta
        ud = yf.Ticker(ticker).upgrades_downgrades
        if ud is None or ud.empty:
            return {}
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=90)
        try:
            recent = ud[ud.index >= cutoff]
        except Exception:
            recent = ud.head(5)
        if recent.empty:
            return {}
        row = recent.iloc[0]
        result: dict = {}
        firm = str(row.get("Firm", "") or "").strip()
        if firm:
            result["recent_ud_firm"] = firm
        result["recent_ud_action"] = str(row.get("Action", "") or "").strip()
        result["recent_ud_to"] = str(row.get("ToGrade", "") or "").strip()
        result["recent_ud_from"] = str(row.get("FromGrade", "") or "").strip()
        try:
            result["recent_ud_ts"] = recent.index[0].timestamp()
        except Exception:
            pass
        return result
    except Exception:
        return {}


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
    yf_earnings_fn=_earnings_from_yf,
    yf_upgrades_fn=_upgrades_from_yf,
) -> CatalystPool:
    """Pool free catalyst/fundamental data for one ticker. All sources best-effort."""
    info = _safe(yf_info_fn, ticker, {})
    raw_news = list(_safe(yf_news_fn, ticker, []))
    metrics = _metrics_from_yf(info) if info else {}
    metrics.update(_safe(yf_earnings_fn, ticker, {}) or {})
    metrics.update(_safe(yf_upgrades_fn, ticker, {}) or {})

    if ibkr is not None:
        fund = _safe(lambda t: ibkr.fundamentals(t), ticker, {}) or {}
        if fund.get("market_cap"):
            metrics["market_cap"] = float(fund["market_cap"])
        if fund.get("short_pct_float") is not None:
            metrics["short_pct_float"] = float(fund["short_pct_float"])
        if fund.get("dtc") is not None:
            metrics["dtc"] = float(fund["dtc"])
        if fund.get("days_to_earnings") is not None:
            metrics["days_to_earnings"] = float(fund["days_to_earnings"])
        if fund.get("analyst_target"):
            metrics["analyst_target"] = float(fund["analyst_target"])
        if fund.get("analyst_rating"):
            metrics["analyst_rating"] = str(fund["analyst_rating"])
        raw_news += _safe(lambda t: ibkr.historical_news(t), ticker, [])

    # Normalise news items: accept either dicts ({text, ts}) or plain strings.
    seen: set[str] = set()
    unique_news: list[dict] = []
    for item in raw_news:
        if isinstance(item, dict):
            t, ts = item.get("text", ""), item.get("ts")
        else:
            t, ts = str(item), None
        if t and t not in seen:
            seen.add(t)
            unique_news.append({"text": t, "ts": ts})

    return CatalystPool(
        ticker=ticker,
        chatter_tags=_chatter_tags(setups_row),
        news_texts=[n["text"] for n in unique_news],
        news_timestamps=[n["ts"] for n in unique_news],
        metrics=metrics,
    )
