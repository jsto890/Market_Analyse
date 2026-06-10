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

import numpy as np
import pandas as pd

_CONFIG_DIR = Path(__file__).parent / "config"
_CONSTITUENTS_CACHE = _CONFIG_DIR / "sector_constituents.json"
_CACHE_TTL_DAYS = 7
_TOP_N = 50           # constituents per industry
_BENCHMARK = "SPY"    # RRG benchmark — broad market (rotation = strength vs this)
_SHRINK_K = 5         # ranking shrinkage strength: w = n/(n+K) toward the cross-sectional mean
_BREADTH_SMA = 50     # breadth = % of constituents above their N-day moving average
_RANK_HYSTERESIS = 2  # only flag a Δrank move of at least this many positions (smaller = noise)

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


# ── RRG engine (Relative Rotation Graph) ─────────────────────────────────────
# Equal-weighted (breadth, not mega-cap dominated) sector index vs a broad-market
# benchmark; JdK-style RS-Ratio (relative-strength level) + RS-Momentum (whether
# that strength is accelerating). This is a *relative* rotation measure — it
# isolates genuine rotation from market beta, unlike absolute momentum.
def _equal_weight_index(members_df: pd.DataFrame) -> pd.Series:
    """Chained equal-weighted index from member close series (mean daily return)."""
    daily = members_df.pct_change(fill_method=None)
    ew = daily.mean(axis=1)            # average over names that have data each day
    return (1.0 + ew.fillna(0.0)).cumprod()


def _wma(s: pd.Series, n: int) -> pd.Series:
    w = np.arange(1, n + 1, dtype=float)
    return s.rolling(n).apply(lambda x: np.dot(x, w) / w.sum(), raw=True)


def _rrg(rs: pd.Series) -> tuple[float | None, float | None]:
    """JdK RS-Ratio and RS-Momentum (centred at 100) for a relative-strength line."""
    rs = rs.dropna()
    if len(rs) < 35:
        return None, None
    rs_smooth = _wma(rs, 10)
    rs_bench = _wma(rs_smooth, 10)
    rs_ratio = 100.0 * rs_smooth / rs_bench
    rs_mom = 100.0 * rs_ratio / rs_ratio.shift(10)
    ratio, mom = rs_ratio.iloc[-1], rs_mom.iloc[-1]
    if pd.isna(ratio) or pd.isna(mom):
        return None, None
    return float(ratio), float(mom)


def _quadrant(ratio: float, mom: float) -> str:
    if ratio >= 100 and mom >= 100:
        return "🟢 Leading"
    if ratio >= 100 and mom < 100:
        return "🟡 Weakening"
    if ratio < 100 and mom < 100:
        return "🔴 Lagging"
    return "🔵 Improving"


def _returns_from_index(idx: pd.Series) -> dict[str, float]:
    """Trailing % returns of an index series over the display windows."""
    idx = idx.dropna()
    out: dict[str, float] = {}
    for label, n in _WINDOWS:
        if len(idx) > n and idx.iloc[-1 - n] > 0:
            out[label] = (idx.iloc[-1] / idx.iloc[-1 - n] - 1.0) * 100.0
    return out


def _breadth(members_df: pd.DataFrame) -> float | None:
    """% of constituents trading above their N-day moving average (participation)."""
    above = total = 0
    for col in members_df.columns:
        s = members_df[col].dropna()
        if len(s) < _BREADTH_SMA:
            continue
        total += 1
        if s.iloc[-1] > s.iloc[-_BREADTH_SMA:].mean():
            above += 1
    return (100.0 * above / total) if total else None


def _rrg_row(name: str, sector: str, members: list[str],
             closes: pd.DataFrame, bench_idx: pd.Series) -> dict | None:
    present = [m for m in members if m in closes.columns]
    if not present:
        return None
    sec_idx = _equal_weight_index(closes[present])
    rs = (sec_idx / bench_idx).dropna()
    ratio, mom = _rrg(rs)
    if ratio is None:
        return None
    return {
        "sector": sector,
        "industry": name,
        "n": len(present),                       # internal: drives ranking shrinkage
        "rs_ratio": ratio,
        "rs_mom": mom,
        "quadrant": _quadrant(ratio, mom),
        "breadth": _breadth(closes[present]),
        "returns": _returns_from_index(sec_idx),
        # raw composite: distance into the Leading corner (shrunk for ranking below)
        "score_raw": (ratio - 100.0) + (mom - 100.0),
    }


def compute_rotation(force_refresh: bool = False,
                     industries: set[str] | None = _TRADED_INDUSTRIES) -> list[dict]:
    """RRG rows (RS-Ratio, RS-Momentum, quadrant, returns) per traded industry."""
    sectors = _load_constituents(force_refresh=force_refresh)
    if not sectors:
        return []

    def _included(ikey: str) -> bool:
        return industries is None or ikey in industries

    all_tickers: set[str] = {_BENCHMARK}
    for sec in sectors.values():
        for ikey, ind in sec["industries"].items():
            if _included(ikey):
                all_tickers.update(ind["constituents"].keys())
    for basket in _CUSTOM_BASKETS.values():
        all_tickers.update(basket)

    closes = _download_closes(sorted(all_tickers))
    if closes.empty or _BENCHMARK not in closes.columns:
        return []
    bench = closes[_BENCHMARK]
    if isinstance(bench, pd.DataFrame):
        bench = bench.iloc[:, 0]
    bench_idx = (1.0 + bench.pct_change(fill_method=None).fillna(0.0)).cumprod()

    rows: list[dict] = []
    for sec in sectors.values():
        for ikey, ind in sec["industries"].items():
            if not _included(ikey):
                continue
            row = _rrg_row(ind["name"], sec["name"],
                           list(ind["constituents"].keys()), closes, bench_idx)
            if row:
                rows.append(row)
    for name, members in _CUSTOM_BASKETS.items():
        row = _rrg_row(name, "Custom", members, closes, bench_idx)
        if row:
            rows.append(row)

    # Shrink the ranking score toward the cross-sectional mean by basket size
    # (James–Stein style, w = n/(n+K)). A 3-name basket needs a much larger raw
    # signal to rank high than a 50-name one, so thin baskets (uranium, quantum)
    # stop topping/bottoming the board on sampling noise. Displayed RS-Ratio/Mom
    # are untouched — only the rank order is size-adjusted.
    if rows:
        mean_raw = sum(r["score_raw"] for r in rows) / len(rows)
        for r in rows:
            w = r["n"] / (r["n"] + _SHRINK_K)
            r["score"] = w * r["score_raw"] + (1.0 - w) * mean_raw
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
    """Movement up/down the rotation leaderboard since the previous report.

    Hysteresis: only flag a move of ≥ _RANK_HYSTERESIS positions — a ±1 shuffle on
    a noisy continuous score carries no real information."""
    if industry not in baseline:
        return "🆕"
    delta = baseline[industry] - cur_rank   # +ve = climbed toward the top
    if abs(delta) < _RANK_HYSTERESIS:
        return "•"
    if delta > 0:
        return f"🟢▲{delta}"
    return f"🔴▼{abs(delta)}"


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
        f"_Relative Rotation Graph vs {_BENCHMARK} — equal-weighted across the top ~50 "
        "constituents per industry (breadth, not mega-cap dominated)._",
        "",
        "- **Quadrant** — 🟢 Leading (strong & still rising) · 🔵 Improving (weak but turning "
        "up — *early rotation in*) · 🟡 Weakening (strong but fading) · 🔴 Lagging (weak & falling).",
        "- **RS-Ratio** — relative-strength **level** vs the market (>100 = outperforming).",
        "- **RS-Mom** — relative-strength **momentum** (>100 = that outperformance is accelerating).",
        "- **Breadth** — % of constituents above their 50-day MA (participation; confirms a move is broad, not one name).",
        "- **1W / 1M / 3M** — equal-weighted % price return of the constituents (context).",
        "- **Δrank** — move up/down this leaderboard since the previous report "
        f"(🟢▲ climbed, 🔴▼ fell, • <{_RANK_HYSTERESIS} / unchanged, 🆕 new). "
        "Ranking is size-adjusted, so thin baskets (uranium, quantum) aren't ranked on a few names' noise.",
        "",
        "| Industry | Quadrant | RS-Ratio | RS-Mom | Breadth | 1W | 1M | 3M | Δrank |",
        "|----------|----------|----------|--------|---------|----|----|----|-------|",
    ]
    for r in scored:
        ret = r["returns"]
        delta = _rank_delta_tag(r["industry"], cur_ranks[r["industry"]], baseline)
        breadth = f"{r['breadth']:.0f}%" if r.get("breadth") is not None else "—"
        lines.append(
            f"| {r['industry']} | {r['quadrant']} | {r['rs_ratio']:.1f} | {r['rs_mom']:.1f} | {breadth} | "
            f"{_fmt_pct(ret.get('1W'))} | {_fmt_pct(ret.get('1M'))} | {_fmt_pct(ret.get('3M'))} | "
            f"{delta} |"
        )
    lines.append("")

    _save_rank_snapshot(today, cur_ranks)
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    refresh = "--refresh" in sys.argv
    print(build_rotation_section(force_refresh=refresh))
