"""Per-ticker news: merge yfinance Ticker.news + IBKR historical_news, dedupe by title.
Used by GET /api/news/{symbol} and the ticker-page News card. Any source failing is non-fatal."""
from typing import Callable


def _default_yf(sym):
    import yfinance as yf
    return yf.Ticker(sym).news or []


def _default_ibkr(sym, total=10):
    from ..data import IBKRClient
    return IBKRClient.instance().historical_news(sym, total=total)


def _yf_url(content: dict):
    if content.get("previewUrl"):
        return content["previewUrl"]
    cu = content.get("canonicalUrl")
    return cu.get("url") if isinstance(cu, dict) else None


def ticker_news(symbol: str, yf_fetch: Callable = _default_yf,
                ibkr_fetch: Callable = _default_ibkr, limit: int = 12) -> list[dict]:
    sym = symbol.upper()
    out, seen = [], set()

    try:
        for n in (yf_fetch(sym) or []):
            c = n.get("content", n)
            title = (c.get("title") or "").strip()
            if not title or title.lower() in seen:
                continue
            seen.add(title.lower())
            prov = c.get("provider") or {}
            out.append({"headline": title, "source": "yfinance",
                        "body": c.get("summary") or c.get("description"),
                        "url": _yf_url(c), "ts": c.get("pubDate") or c.get("displayTime"),
                        "provider": prov.get("displayName") if isinstance(prov, dict) else None,
                        "ticker": sym})
    except Exception:
        pass

    try:
        for hl in (ibkr_fetch(sym) or []):
            t = (hl or "").strip()
            if not t or t.lower() in seen:
                continue
            seen.add(t.lower())
            out.append({"headline": t, "source": "ibkr", "body": None, "url": None,
                        "ts": None, "provider": "IBKR", "ticker": sym})
    except Exception:
        pass

    return out[:limit]
