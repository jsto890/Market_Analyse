from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

import yaml
import yfinance as yf

_CONFIG_DIR = Path(__file__).parent.parent.parent / "config"
_TAXONOMY_PATH = _CONFIG_DIR / "sector_taxonomy.yaml"
_CACHE_PATH = _CONFIG_DIR / "sector_cache.json"

_taxonomy: dict[str, Any] | None = None
_cache: dict[str, dict[str, str]] | None = None
_lock = threading.RLock()  # reentrant: _get_yf_data nests _load_cache under the lock


def _load_taxonomy() -> dict[str, Any]:
    global _taxonomy
    with _lock:
        if _taxonomy is None:
            try:
                with open(_TAXONOMY_PATH) as f:
                    _taxonomy = yaml.safe_load(f)
            except Exception as e:
                raise RuntimeError(f"Failed to load taxonomy from {_TAXONOMY_PATH}: {e}") from e
        return _taxonomy


def _load_cache() -> dict[str, dict[str, str]]:
    global _cache
    with _lock:
        if _cache is None:
            if _CACHE_PATH.exists():
                try:
                    with open(_CACHE_PATH) as f:
                        _cache = json.load(f)
                except (json.JSONDecodeError, IOError):
                    _cache = {}
            else:
                _cache = {}
        return _cache


def _save_cache_locked(cache: dict[str, dict[str, str]]) -> None:
    """Atomic write (temp + rename). Caller must hold _lock."""
    tmp = _CACHE_PATH.with_suffix(".json.tmp")
    with open(tmp, "w") as f:
        json.dump(cache, f, indent=2)
    os.replace(tmp, _CACHE_PATH)


def _fetch_yfinance(ticker: str) -> dict[str, str] | None:
    """Return {sector, industry} on success, or None on fetch failure.

    None signals a transient error so the caller does NOT cache it — otherwise a
    single network/auth blip would freeze the ticker as ('Other', '') forever."""
    try:
        info = yf.Ticker(ticker).info
    except Exception:
        return None
    return {
        "sector": info.get("sector", "") or "",
        "industry": info.get("industry", "") or "",
    }


def _get_yf_data(ticker: str) -> dict[str, str]:
    with _lock:
        cache = _load_cache()
        if ticker in cache:
            return cache[ticker]
    # Network call outside the lock — don't block other threads on slow IO.
    data = _fetch_yfinance(ticker)
    if data is None:
        return {"sector": "", "industry": ""}  # not cached; retried next run
    with _lock:
        cache = _load_cache()
        cache[ticker] = data
        _save_cache_locked(cache)
    return data


def resolve_sector(ticker: str) -> tuple[str, str]:
    """Return (Family, Sub-sector) for a ticker.

    Resolution order:
    1. Explicit override in taxonomy YAML
    2. yfinance industry → sub-sector via industry substring match in YAML
    3. ("Other", raw_yfinance_industry or "")
    """
    ticker = ticker.upper()
    taxonomy = _load_taxonomy()
    families: dict[str, dict[str, Any]] = taxonomy["families"]

    # Pass 1: override check
    for family, sub_sectors in families.items():
        for sub_sector, cfg in sub_sectors.items():
            if ticker in cfg.get("overrides", []):
                return (family, sub_sector)

    # Need yfinance data for industry match and fallback
    yf_data = _get_yf_data(ticker)
    industry = yf_data.get("industry", "")

    # Pass 2: industry substring match
    if industry:
        industry_lower = industry.lower()
        for family, sub_sectors in families.items():
            for sub_sector, cfg in sub_sectors.items():
                for pattern in cfg.get("industries", []):
                    if pattern.lower() in industry_lower:
                        return (family, sub_sector)

    # Pass 3: fallback
    return ("Other", industry)


if __name__ == "__main__":
    print("NVDA:", resolve_sector("NVDA"))   # expect ("AI / Compute", "Semiconductors")
    print("OKLO:", resolve_sector("OKLO"))   # expect ("Nuclear / Uranium", "SMR / Nuclear Tech")
    print("AAPL:", resolve_sector("AAPL"))   # expect ("Other", <some industry>)
