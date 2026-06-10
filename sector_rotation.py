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
_TOP_N = 50  # constituents per industry

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

# Themes with no native yfinance industry — equal-weighted custom baskets of
# pure-play tickers. Rendered alongside the industry rows.
_CUSTOM_BASKETS = {
    "Quantum Computing": ["IONQ", "RGTI", "QBTS", "QUBT", "ARQQ", "QSI", "LAES"],
}

# Trading-day windows. All three are shown AND used in the rotation score
# (1D/1Y/6M dropped — noise or not informative for rotation).
_WINDOWS = [("1W", 5), ("1M", 21), ("3M", 63)]


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
    """Momentum acceleration in monthly % points: this month vs the quarter's pace.

        Rot = 1M − 3M/3

    i.e. the last month's return minus the average month over the trailing quarter.
    >0 ⇒ the recent month is hotter than the quarterly trend (money flowing in
    faster, heating up); <0 ⇒ decelerating/cooling. 1W is shown as a leading
    "this week" read but kept out of the score — annualising it would let one
    noisy week dominate a multi-week rotation signal."""
    r1m = rets.get("1M")
    r3m = rets.get("3M")
    if r1m is None:
        return None
    base = (r3m / 3.0) if r3m is not None else 0.0
    return r1m - base


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
    for basket in _CUSTOM_BASKETS.values():
        all_tickers.update(basket)
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

    # custom equal-weighted baskets (themes with no yfinance industry)
    for name, members in _CUSTOM_BASKETS.items():
        weighted = {}
        for label, _ in _WINDOWS:
            vals = [tret[sym][label] for sym in members
                    if sym in tret and label in tret[sym]]
            if vals:
                weighted[label] = sum(vals) / len(vals)
        if not weighted:
            continue
        rows.append({
            "sector": "Custom",
            "industry": name,
            "n": sum(1 for sym in members if sym in tret),
            "returns": weighted,
            "score": _rotation_score(weighted),
        })
    return rows


# ── rank-movement snapshots ──────────────────────────────────────────────────
_RANKS_PATH = _CONFIG_DIR / "rotation_ranks.json"


def _load_rank_snapshots() -> dict:
    if _RANKS_PATH.exists():
        try:
            return json.loads(_RANKS_PATH.read_text())
        except Exception:
            return {}
    return {}


def _save_rank_snapshot(today: str, ranks: dict[str, int]) -> None:
    snaps = _load_rank_snapshots()
    snaps[today] = ranks
    for old in sorted(snaps)[:-10]:   # keep the last 10 dated snapshots
        snaps.pop(old, None)
    try:
        tmp = _RANKS_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(snaps, indent=2))
        tmp.replace(_RANKS_PATH)
    except Exception:
        pass


def _rank_delta_tag(industry: str, cur_rank: int, baseline: dict[str, int]) -> str:
    """Movement up/down the rotation leaderboard since the previous report."""
    if industry not in baseline:
        return "🆕"
    delta = baseline[industry] - cur_rank   # +ve = climbed toward the top
    if delta > 0:
        return f"🟢▲{delta}"
    if delta < 0:
        return f"🔴▼{abs(delta)}"
    return "•"


# ── markdown rendering ───────────────────────────────────────────────────────
def _fmt_pct(v: float | None) -> str:
    if v is None:
        return "—"
    return f"{v:+.0f}%"


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

    today = time.strftime("%Y-%m-%d")
    snaps = _load_rank_snapshots()
    prior_dates = [d for d in snaps if d < today]
    baseline = snaps[max(prior_dates)] if prior_dates else {}
    cur_ranks = {r["industry"]: i + 1 for i, r in enumerate(scored)}

    lines = [
        "## Sector Rotation",
        "_The industries we trade, ranked by **Rot** (momentum acceleration)._",
        "",
        "- **n** — how many of the industry's top ~50 constituents had usable price data.",
        "- **1W / 1M / 3M** — market-cap-weighted **% price return** of those constituents "
        "over the trailing 1 week / 1 month / 3 months.",
        "- **Rot** — momentum acceleration in **monthly % points** = 1M − (3M ÷ 3): "
        "the last month's return minus the average month over the quarter. "
        "Positive = heating up (money flowing in faster than the quarter's trend), negative = cooling. "
        "(1W is shown as a leading read but kept out of Rot — one noisy week shouldn't drive a multi-week signal.)",
        "- **Δrank** — move up/down this leaderboard since the previous report "
        "(🟢▲ climbed, 🔴▼ fell, • unchanged, 🆕 new).",
        "",
        "| Industry | n | 1W | 1M | 3M | Rot | Δrank |",
        "|----------|---|----|----|----|-----|-------|",
    ]
    for r in scored:
        ret = r["returns"]
        delta = _rank_delta_tag(r["industry"], cur_ranks[r["industry"]], baseline)
        lines.append(
            f"| {r['industry']} | {r.get('n', '')} | {_fmt_pct(ret.get('1W'))} | "
            f"{_fmt_pct(ret.get('1M'))} | {_fmt_pct(ret.get('3M'))} | "
            f"{r['score']:+.1f} | {delta} |"
        )
    lines.append("")

    _save_rank_snapshot(today, cur_ranks)
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    refresh = "--refresh" in sys.argv
    print(build_rotation_section(force_refresh=refresh))
