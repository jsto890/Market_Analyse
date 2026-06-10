"""
sector_rotation.py

Data-driven sector rotation for the daily report. Builds a market-cap-weighted
return profile (1D/1W/1M/3M/6M/1Y) for every yfinance industry from the top ~20
constituents of each, then ranks industries by a rotation score that captures
short- vs long-term momentum (money accelerating in or out).

Constituent membership is cached weekly (it barely changes); prices are
bulk-downloaded fresh each run. All network work is best-effort: any failure
degrades to a note rather than breaking the report.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd

_CONFIG_DIR = Path(__file__).parent / "config"
_CONSTITUENTS_CACHE = _CONFIG_DIR / "sector_constituents.json"
_CACHE_TTL_DAYS = 7
_TOP_N = 20  # constituents per industry

# yfinance sector keys (the 11 GICS-style sectors)
_SECTOR_KEYS = [
    "technology", "financial-services", "healthcare", "consumer-cyclical",
    "communication-services", "industrials", "consumer-defensive", "energy",
    "basic-materials", "real-estate", "utilities",
]

# The yfinance industries we actually trade — AI/Compute, Software, networking/
# optical, hardware, defense/space, uranium. (Crypto and Quantum have no native
# yfinance industry; they're override-baskets handled elsewhere.) The rotation
# view is restricted to these so it isn't diluted by random sectors.
_TRADED_INDUSTRIES = {
    "semiconductors", "semiconductor-equipment-materials",
    "communication-equipment", "computer-hardware", "electronic-components",
    "scientific-technical-instruments", "information-technology-services",
    "software-infrastructure", "software-application",
    "aerospace-defense", "uranium",
}

# Trading-day windows. 1W/1M/3M are shown; 6M is a background input to the
# rotation score only (1D and 1Y add noise/aren't informative for rotation).
_WINDOWS = [("1W", 5), ("1M", 21), ("3M", 63), ("6M", 126)]


# ── constituent membership (weekly cache) ────────────────────────────────────
def _fetch_constituents() -> dict:
    """Pull each sector's industries and their top-N constituents (symbol→weight)."""
    import yfinance as yf
    sectors: dict = {}
    for skey in _SECTOR_KEYS:
        try:
            sec = yf.Sector(skey)
            industries = sec.industries  # DataFrame indexed by industry key
        except Exception:
            continue
        if industries is None or industries.empty:
            continue
        ind_map: dict = {}
        for ikey, irow in industries.iterrows():
            try:
                tc = yf.Industry(ikey).top_companies
            except Exception:
                continue
            if tc is None or tc.empty:
                continue
            top = tc.head(_TOP_N)
            weights = {}
            for sym, crow in top.iterrows():
                w = crow.get("market weight")
                weights[str(sym)] = float(w) if pd.notna(w) else 0.0
            if weights:
                ind_map[str(ikey)] = {
                    "name": str(irow.get("name", ikey)),
                    "constituents": weights,
                }
        if ind_map:
            sectors[skey] = {"name": str(getattr(sec, "name", skey)), "industries": ind_map}
    return sectors


def _load_constituents(force_refresh: bool = False) -> dict:
    """Return cached constituents, refreshing if older than the TTL."""
    cache = None
    if _CONSTITUENTS_CACHE.exists():
        try:
            cache = json.loads(_CONSTITUENTS_CACHE.read_text())
        except Exception:
            cache = None
    fresh = (
        cache is not None
        and (time.time() - cache.get("_fetched", 0)) < _CACHE_TTL_DAYS * 86400
        and cache.get("sectors")
    )
    if fresh and not force_refresh:
        return cache["sectors"]

    sectors = _fetch_constituents()
    if sectors:
        try:
            tmp = _CONSTITUENTS_CACHE.with_suffix(".json.tmp")
            tmp.write_text(json.dumps({"_fetched": time.time(), "sectors": sectors}, indent=2))
            tmp.replace(_CONSTITUENTS_CACHE)
        except Exception:
            pass
        return sectors
    # fetch failed — fall back to stale cache if we have one
    return cache["sectors"] if cache and cache.get("sectors") else {}


# ── prices + returns ─────────────────────────────────────────────────────────
def _download_closes(tickers: list[str]) -> pd.DataFrame:
    """Bulk-download 1y daily closes for all tickers. Returns DataFrame (cols=tickers)."""
    import yfinance as yf
    frames = []
    for i in range(0, len(tickers), 150):  # chunk to stay under yfinance limits
        chunk = tickers[i:i + 150]
        try:
            data = yf.download(chunk, period="1y", interval="1d",
                               auto_adjust=True, progress=False, threads=True)
        except Exception:
            continue
        if data is None or data.empty:
            continue
        closes = data["Close"] if "Close" in data.columns.get_level_values(0) else data
        if isinstance(closes, pd.Series):  # single ticker
            closes = closes.to_frame(chunk[0])
        frames.append(closes)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1)


def _returns_for(close: pd.Series) -> dict[str, float]:
    """Period returns (%) for one constituent; missing windows omitted."""
    close = close.dropna()
    out: dict[str, float] = {}
    for label, n in _WINDOWS:
        if len(close) > n:
            prev = close.iloc[-1 - n]
            if prev and prev > 0:
                out[label] = (close.iloc[-1] / prev - 1.0) * 100.0
    return out


# ── aggregation + scoring ────────────────────────────────────────────────────
def _rotation_score(rets: dict[str, float]) -> float | None:
    """Acceleration of the 1-month pace vs the trailing 6-month average monthly pace.

    score = r_1M − r_6M/6 . Positive ⇒ money rotating in faster than the longer
    trend (inflow accelerating); negative ⇒ cooling."""
    r1m = rets.get("1M")
    r6m = rets.get("6M")
    if r1m is None:
        return None
    baseline = (r6m / 6.0) if r6m is not None else 0.0
    return r1m - baseline


def compute_rotation(force_refresh: bool = False,
                     industries: set[str] | None = _TRADED_INDUSTRIES) -> list[dict]:
    """Return a list of per-industry rows with weighted returns + rotation score.

    `industries` restricts to a set of yfinance industry keys (default: the ones
    we trade). Pass None to compute every industry."""
    sectors = _load_constituents(force_refresh=force_refresh)
    if not sectors:
        return []

    def _included(ikey: str) -> bool:
        return industries is None or ikey in industries

    # collect unique tickers only from the industries we'll actually report
    all_tickers: set[str] = set()
    for sec in sectors.values():
        for ikey, ind in sec["industries"].items():
            if _included(ikey):
                all_tickers.update(ind["constituents"].keys())
    closes = _download_closes(sorted(all_tickers))
    if closes.empty:
        return []

    # per-ticker returns
    tret: dict[str, dict[str, float]] = {}
    for tkr in closes.columns:
        s = closes[tkr]
        if isinstance(s, pd.DataFrame):  # duplicate column guard
            s = s.iloc[:, 0]
        r = _returns_for(s)
        if r:
            tret[tkr] = r

    rows: list[dict] = []
    for skey, sec in sectors.items():
        for ikey, ind in sec["industries"].items():
            if not _included(ikey):
                continue
            weighted: dict[str, float] = {}
            for label, _ in _WINDOWS:
                num = den = 0.0
                for sym, w in ind["constituents"].items():
                    r = tret.get(sym, {}).get(label)
                    if r is not None and w > 0:
                        num += w * r
                        den += w
                if den > 0:
                    weighted[label] = num / den
            if not weighted:
                continue
            rows.append({
                "sector": sec["name"],
                "industry": ind["name"],
                "n": sum(1 for sym in ind["constituents"] if sym in tret),
                "returns": weighted,
                "score": _rotation_score(weighted),
            })
    return rows


# ── markdown rendering ───────────────────────────────────────────────────────
def _fmt_pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:+.0f}"


def build_rotation_section(force_refresh: bool = False,
                           industries: set[str] | None = _TRADED_INDUSTRIES) -> str:
    """Markdown section: traded industries ranked by rotation score."""
    try:
        rows = compute_rotation(force_refresh=force_refresh, industries=industries)
    except Exception:
        rows = []
    if not rows:
        return ("## Sector Rotation\n"
                "_Rotation model unavailable (data fetch failed); see candidate sectors below._\n")

    scored = [r for r in rows if r["score"] is not None]
    scored.sort(key=lambda r: r["score"], reverse=True)

    lines = [
        "## Sector Rotation",
        "_Sectors we trade, ranked by Rot = 1M − ⅙·6M (momentum acceleration). "
        "Market-cap-weighted over the top ~20 names per industry. Top = heating up, "
        "bottom = cooling. Ranks by change in pace, not level._",
        "",
        "| Industry | 1W | 1M | 3M | Rot |",
        "|----------|----|----|----|-----|",
    ]
    for r in scored:
        ret = r["returns"]
        lines.append(
            f"| {r['industry']} | {_fmt_pct(ret.get('1W'))} | "
            f"{_fmt_pct(ret.get('1M'))} | {_fmt_pct(ret.get('3M'))} | "
            f"{r['score']:+.1f} |"
        )
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    refresh = "--refresh" in sys.argv
    print(build_rotation_section(force_refresh=refresh))
