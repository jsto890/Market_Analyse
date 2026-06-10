"""
sentiment_bridge.py

Reads Market_Review's ticker_setups.csv, runs each qualifying ticker through
Argus's 52-agent technical analysis, and produces a combined report ranked by
a weighted sentiment + technical conviction score.

Usage:
    cd <path-to-repo>/argus
    python ../sentiment_bridge.py [--min-quality 6] [--include-late-chase] [--out ../reports/]
"""
from __future__ import annotations

import argparse
import sys
import os
import json
import concurrent.futures
from datetime import datetime
from pathlib import Path
from typing import Optional
import pandas as pd

# ── paths ────────────────────────────────────────────────────────────────────
ARGUS_ROOT    = Path(__file__).parent / "argus"
REVIEW_REPORT = Path(os.environ.get("MARKET_REVIEW_REPORT", "<path-to-market-review>/reports/ticker_setups.csv"))
OUT_DIR       = Path(__file__).parent / "reports"

sys.path.insert(0, str(ARGUS_ROOT))
sys.path.insert(0, str(Path(__file__).parent))     # for sibling modules (sector_rotation)

from sector_rotation import build_rotation_section  # noqa: E402
from argus.data.market import get_history          # noqa: E402
from argus.action_card.builder import build_action_card, _distill_notes, _detect_ticker_regime  # noqa: E402
from argus.indicators.compute import compute_all   # noqa: E402
from argus.agents.base import Verdict              # noqa: E402
from argus.catalyst import catalyst_leg            # noqa: E402
from argus.settings import settings               # noqa: E402
from argus.weights_config import BRIDGE_WEIGHTS    # noqa: E402  loaded from config/weights.yaml
from argus.sector_taxonomy import resolve_sector   # noqa: E402


# ── config ────────────────────────────────────────────────────────────────────
ACTIONABLE_LABELS = {"fresh_watch", "building", "momentum_confirmed"}
# Backtest (1 May–10 Jun): extended/late_chase were the *strongest* forward
# performers (+10%/+23% median 20d). Don't hard-drop them — let them reach Argus,
# which applies the technical/regime filter. Disable with --no-chase in a
# mean-reverting tape.
CHASE_LABELS      = {"extended", "late_chase"}
LATE_CHASE_LABEL  = "late_chase"
ALIGN_SENT        = 0.30   # sentiment ≥ this → fully aligned (group1)
NEAR_SENT         = 0.20   # sentiment in [NEAR, ALIGN) → near-aligned (flagged, still group2)
MAX_WORKERS       = 6
SENTIMENT_WEIGHT = BRIDGE_WEIGHTS["sentiment"]
TECHNICAL_WEIGHT = BRIDGE_WEIGHTS["technical"]
CATALYST_WEIGHT  = BRIDGE_WEIGHTS["catalyst"]
BOOST_DELTA      = 0.10
MAX_QUALITY      = 15.0  # normalisation ceiling


def blend_legs(sentiment_score, tech_score, catalyst_score):
    """Weighted blend over the legs that are present; renormalize weights when one is None."""
    legs = [(SENTIMENT_WEIGHT, sentiment_score),
            (TECHNICAL_WEIGHT, tech_score),
            (CATALYST_WEIGHT, catalyst_score)]
    present = [(w, s) for w, s in legs if s is not None]
    total_w = sum(w for w, _ in present)
    if total_w == 0:
        return 0.0
    return sum(w * s for w, s in present) / total_w


def apply_gates(combined, gates):
    """Apply catalyst hard gates to a blended score."""
    if "veto" in gates or "derank" in gates:
        return min(combined, 0.0)
    if "boost" in gates and combined > 0:
        return min(1.0, combined + BOOST_DELTA)
    return combined


def market_regime() -> tuple[str, bool]:
    """Classify the broad tape by running Argus's regime detector on SPY + QQQ.

    Returns (label, risk_on). Chasing extended/late_chase names pays off in a
    risk-on (trending-up) tape and gets punished when it turns — so the chase
    labels are gated on this. Defaults to risk-on if data can't be fetched, to
    preserve prior behaviour rather than over-restrict on a transient failure."""
    risk_on_count = total = 0
    detail = []
    for sym in ("SPY", "QQQ"):
        try:
            df = get_history(sym, period="1y", interval="1d")
            if df is None or len(df) < 60:
                continue
            di = compute_all(df)
            regime = _detect_ticker_regime(di)
            last = float(di["close"].iloc[-1])
            ema50 = float(di["ema_50"].iloc[-1])
            uptrend = last > ema50
            ron = uptrend and regime in ("trending", "trending_late", "neutral")
            risk_on_count += int(ron)
            total += 1
            detail.append(f"{sym} {regime} {'↑' if uptrend else '↓'}")
        except Exception:
            continue
    if total == 0:
        return "unknown (fetch failed)", True
    risk_on = risk_on_count == total  # require BOTH indices risk-on
    return " · ".join(detail), risk_on

# Tickers that use a cashtag not directly fetchable from yfinance.
# Maps the cashtag used in Market_Review → (yfinance_symbol, currency_note).
# Priority: OTC USD equivalent if liquid enough, otherwise primary exchange.
# Maps Market_Review cashtag → (yfinance_symbol, min_bars_override).
# SIVE.ST has 3324 bars of history; SIVEF OTC only has 33 — too few for Argus.
# Technical signals from SIVE.ST are valid (same company); levels are in SEK.
TICKER_ALIASES: dict[str, tuple[str, int]] = {
    "SIVE":  ("SIVE.ST", 200),
    "SIVEF": ("SIVE.ST", 200),
}
_DEFAULT_MIN_BARS = 50


# ── helpers ───────────────────────────────────────────────────────────────────
def _sentiment_bias(setup_label: str) -> float:
    """Convert setup label to a directional bias score (positive = bullish)."""
    return {
        "momentum_confirmed": 1.0,
        "building":           0.85,
        "fresh_watch":        0.70,
        "late_chase":         0.30,
        "extended":           0.20,
        "avoid_wait":        -0.50,
        "noise":              0.00,
    }.get(setup_label, 0.0)


def _catalyst_ibkr():
    try:
        from argus.data.ibkr import IBKRClient
        return IBKRClient.instance()
    except Exception:
        return None


def _analyse_ticker(row: pd.Series) -> Optional[dict]:
    ticker = row["ticker"]
    alias_entry = TICKER_ALIASES.get(ticker.upper())
    fetch_sym, min_bars = alias_entry if alias_entry else (ticker, _DEFAULT_MIN_BARS)
    try:
        df = get_history(fetch_sym, period="2y", interval="1d")
        if df is None or len(df) < min_bars:
            return None
        # TRAILING returns as of the report date (how much the name has ALREADY run) —
        # shown in the report as momentum/extension context. NOT forward returns.
        # The weight-optimisation backtest computes its own forward returns in
        # tools/weight_opt/ and must never read these columns as labels.
        ret_1d   = float(df["close"].pct_change(1).iloc[-1])   if len(df) >= 2   else float("nan")
        ret_5d   = float(df["close"].pct_change(5).iloc[-1])   if len(df) >= 6   else float("nan")
        ret_20d  = float(df["close"].pct_change(20).iloc[-1])  if len(df) >= 21  else float("nan")
        ret_126d = float(df["close"].pct_change(126).iloc[-1]) if len(df) >= 127 else float("nan")
        ret_252d = float(df["close"].pct_change(252).iloc[-1]) if len(df) >= 253 else float("nan")
        card = build_action_card(fetch_sym, df)
    except Exception as exc:
        print(f"  [skip] {ticker}: {exc}", file=sys.stderr)
        return None

    # ── scores ────────────────────────────────────────────────────────────────
    sentiment_norm  = min(float(row.get("quality_score", 0)), MAX_QUALITY) / MAX_QUALITY
    sentiment_bias  = _sentiment_bias(row.get("setup_label", "noise"))
    sentiment_score = sentiment_norm * sentiment_bias          # -1..+1 weighted by quality

    # Technical score: positive for LONG conviction, negative for SHORT
    tech_raw   = float(card.score)                             # -1..+1 from Argus
    tech_score = tech_raw if card.verdict != Verdict.WAIT else 0.0

    try:
        cat = catalyst_leg(
            ticker, setups_row=row, ibkr=None,
            api_key=settings.anthropic_api_key,
        )
    except Exception:
        from argus.catalyst.types import CatalystResult
        cat = CatalystResult(score=None)
    catalyst_score = cat.score
    combined = blend_legs(sentiment_score, tech_score, catalyst_score)
    combined = apply_gates(combined, cat.gates)

    # Per-sub-agent signed vote confidence (LONG=+conf, SHORT=-conf, WAIT/abstain=0).
    # Persisted so the intra-catalyst weights can be forward-validated against
    # realised returns once enough daily snapshots accumulate.
    vote_conf = {f"vote_{v.agent}": (v.confidence if v.verdict == Verdict.LONG
                                     else -v.confidence if v.verdict == Verdict.SHORT
                                     else 0.0)
                 for v in cat.votes}

    # ── alignment label ───────────────────────────────────────────────────────
    s_bullish = sentiment_bias > 0.5
    t_long    = card.verdict == Verdict.LONG
    t_short   = card.verdict == Verdict.SHORT
    t_wait    = card.verdict == Verdict.WAIT

    if s_bullish and t_long:
        alignment = "ALIGNED"
    elif s_bullish and t_short:
        alignment = "DIVERGING"
    elif s_bullish and t_wait:
        alignment = "TECH_WAIT"
    elif not s_bullish and t_long:
        alignment = "CONTRARIAN"
    else:
        alignment = "NEUTRAL"

    # ── sector ────────────────────────────────────────────────────────────────
    try:
        sector_tuple = resolve_sector(fetch_sym)
    except Exception:
        sector_tuple = ("Other", "")

    # ── group membership ──────────────────────────────────────────────────────
    # Soft sentiment band instead of a hard cliff: ≥ ALIGN_SENT is fully aligned;
    # [NEAR_SENT, ALIGN_SENT) is "near-aligned" (flagged), so a name like CGEH at
    # 0.289 isn't dropped to plain tech+catalyst by 0.011.
    cat_score_present = catalyst_score is not None
    long_with_cat = card.verdict == Verdict.LONG and cat_score_present and catalyst_score > 0
    group1 = long_with_cat and sentiment_score >= ALIGN_SENT
    near_aligned = long_with_cat and not group1 and sentiment_score >= NEAR_SENT
    group2 = long_with_cat and not group1

    return {
        "ticker":            ticker,
        "fetch_symbol":      fetch_sym if fetch_sym != ticker else ticker,
        "setup_label":       row.get("setup_label", ""),
        "conviction":        str(row.get("conviction", "") or ""),
        "quality_score":     round(float(row.get("quality_score", 0)), 2),
        "cluster_overlap":   int(float(row.get("cluster_overlap", 0) or 0)),
        "cluster_confirmed": str(row.get("cluster_confirmed", "false")),
        "cluster_bonus":     round(float(row.get("cluster_bonus", 0) or 0), 2),
        "source_score":      round(float(row.get("source_score", 0)), 2),
        "mentions":          int(row.get("mention_count", 0)),
        "accounts":          int(row.get("distinct_account_count", 0)),
        "catalysts":         ", ".join(sorted({f"{e.type}{'+' if e.direction > 0 else '-'}"
                                               for e in cat.events})) or str(row.get("catalysts", "")),
        "top_accounts":      str(row.get("top_accounts", "")),
        "ret_1d":            round(ret_1d * 100, 2),
        "ret_5d":            round(ret_5d * 100, 2),
        "ret_20d":           round(ret_20d * 100, 2),
        "ret_126d":          round(ret_126d * 100, 2),
        "ret_252d":          round(ret_252d * 100, 2),
        "argus_verdict":     card.verdict.value,
        "argus_score":       round(card.score, 3),
        "high_conviction":   card.high_conviction,
        "agreement_pct":     round(card.agreement_pct, 1),
        "long_votes":        card.long_votes,
        "short_votes":       card.short_votes,
        "wait_votes":        card.wait_votes,
        "entry":             card.entry,
        "stop":              card.stop,
        "target":            card.target,
        "risk_reward":       round(card.risk_reward, 2),
        "is_extended":       card.is_extended,
        "entry_quality":     card.entry_quality,
        "stop_anchor":       card.stop_anchor,
        "sentiment_score":   round(sentiment_score, 3),
        "tech_score":        round(tech_score, 3),
        "combined_score":    round(combined, 3),
        "catalyst_score":    round(catalyst_score, 3) if catalyst_score is not None else "",
        "vote_event_catalyst":     round(vote_conf.get("vote_event_catalyst", 0.0), 3),
        "vote_earnings_proximity": round(vote_conf.get("vote_earnings_proximity", 0.0), 3),
        "vote_squeeze_setup":      round(vote_conf.get("vote_squeeze_setup", 0.0), 3),
        "vote_growth_profitability": round(vote_conf.get("vote_growth_profitability", 0.0), 3),
        "vote_analyst_upside":     round(vote_conf.get("vote_analyst_upside", 0.0), 3),
        "gate_flags":        " ".join(cat.flags),
        "alignment":         alignment,
        "action_label":      card.action_label,
        "trade_style":       card.trade_style,
        "combo":             card.combo,
        "ticker_regime":     card.ticker_regime,
        "n_eff":             round(card.n_eff, 1),
        "group1":            group1,
        "group2":            group2,
        "near_aligned":      near_aligned,
        # private keys stripped from CSV
        "_votes":            card.votes,
        "_cat_events":       cat.events,
        "_cat_metrics":      cat.metrics,
        "_cat_flags":        cat.flags,
        "_sector":           sector_tuple,
    }


# ── report generators ─────────────────────────────────────────────────────────
def _action_emoji(r: dict) -> str:
    a = r["alignment"]
    hc = r["high_conviction"]
    if a == "ALIGNED" and hc:
        return "⚡ STRONG BUY"
    if a == "ALIGNED":
        return "✅ BUY"
    if a == "TECH_WAIT":
        return "⏳ WAIT (tech)"
    if a == "DIVERGING":
        return "⚠️  DIVERGING"
    if a == "CONTRARIAN":
        return "🔄 CONTRARIAN"
    return "—"


_RET_PERIODS = [("1D", "ret_1d"), ("1W", "ret_5d"), ("1M", "ret_20d"),
                ("6M", "ret_126d"), ("1Y", "ret_252d")]


def _returns_pills(r: dict) -> str:
    """Compact green/red pill strip of period returns for the Obsidian report."""
    pills = []
    for label, key in _RET_PERIODS:
        v = r.get(key)
        if v is None or pd.isna(v):
            continue
        color = "#22c55e" if v >= 0 else "#ef4444"
        bg    = "#0d3b1e" if v >= 0 else "#3b1414"
        pills.append(
            f'<span style="background:{bg};color:{color};padding:1px 6px;'
            f'border-radius:6px;font-family:monospace;font-size:0.85em">'
            f'{label} {v:+.1f}%</span>'
        )
    return " ".join(pills) if pills else "—"


def _returns_strip(r: dict) -> str:
    """Compact green/red returns strip (1D/1W/1M/6M/1Y) for table cells."""
    parts = []
    for label, key in _RET_PERIODS:
        v = r.get(key)
        if v is None or pd.isna(v):
            parts.append(f'<span style="color:#6b7280">{label} —</span>')
            continue
        color = "#22c55e" if v >= 0 else "#ef4444"
        parts.append(f'<span style="color:{color}">{label} {v:+.0f}%</span>')
    return " ".join(parts)


def _wilson_ci(k: int, n: int, z: float = 1.645) -> tuple[float, float]:
    """Wilson score 90% CI for proportion k/n."""
    if n == 0:
        return 0.0, 1.0
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    margin = z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5 / denom
    return max(0.0, centre - margin), min(1.0, centre + margin)


def _format_trust(accounts_str: str, trust_lookup: dict) -> str:
    """Top accounts with hit rate + Wilson 90% CI. Amber flag when n < 15."""
    parts = []
    for handle in (accounts_str or "").split(";")[:4]:
        handle = handle.strip()
        if not handle:
            continue
        info = trust_lookup.get(handle)
        if info and info["n"] >= 5:
            n = info["n"]
            hr = info["hit_rate_1d"]
            k = round(hr * n)
            lo, hi = _wilson_ci(k, n)
            ci_str = f"[{int(lo*100)}–{int(hi*100)}%]"
            low_n_flag = " ⚠" if n < 15 else ""
            parts.append(f"{handle} {int(hr * 100)}%{ci_str}({n}){low_n_flag}")
        elif info and info["n"] > 0:
            parts.append(f"{handle} ⟨n={info['n']}⟩")
        else:
            parts.append(handle)
    return " · ".join(parts) if parts else (accounts_str or "")[:60]


def _get_sector(ticker: str) -> str:
    """Best-effort yfinance sector lookup for concentration warnings."""
    try:
        import yfinance as yf
        return yf.Ticker(ticker).info.get("sector", "") or ""
    except Exception:
        return ""


def _build_sector_rotation_section(full_df: pd.DataFrame) -> str:
    # Map setup_label to direction arrow
    _LABEL_ARROW = {
        "fresh_watch": "↑",
        "building":    "↑",
        "momentum_confirmed": "↑",
        "extended":    "→",
        "late_chase":  "→",
        "avoid_wait":  "↓",
    }

    # Build nested dict: family → subsector → direction → count
    tree: dict[str, dict[str, dict[str, int]]] = {}
    for _, row in full_df.iterrows():
        ticker = str(row.get("ticker", "")).strip()
        label = str(row.get("setup_label", "")).strip()
        arrow = _LABEL_ARROW.get(label)
        if arrow is None:
            continue
        # Resolve via the same alias map the detail tables use, so a ticker
        # can't land in two different families across the report.
        alias = TICKER_ALIASES.get(ticker.upper())
        fetch_sym = alias[0] if alias else ticker
        try:
            family, subsector = resolve_sector(fetch_sym)
        except Exception:
            family, subsector = "Other", ""
        if not family:
            family = "Other"
        if not subsector:
            continue  # skip unclassified (ETFs, crypto, missing industry) — not real sectors
        tree.setdefault(family, {}).setdefault(subsector, {"↑": 0, "→": 0, "↓": 0})
        tree[family][subsector][arrow] += 1

    _DIR_RANK = {"↑": 0, "→": 1}

    def _family_score(fam: str) -> int:
        return sum(c["↑"] + c["→"] for c in tree[fam].values())

    # Curated families first (by activity); the "Other" catch-all always last.
    real = sorted((f for f in tree if f != "Other"), key=_family_score, reverse=True)
    ordered = real + (["Other"] if "Other" in tree else [])

    lines = [
        "## Sector Rotation",
        "_Where fresh money is moving — inflow (↑) and running (→). Dormant/cooling names omitted._",
        "",
        "```",
    ]

    any_rows = False
    for family in ordered:
        display_family = "Broader Market" if family == "Other" else family
        rows = []
        for sub, counts in tree[family].items():
            # snapshot of inflow/running only; ↓-only (avoid_wait) sub-sectors are dormant
            if counts["↑"] == 0 and counts["→"] == 0:
                continue
            dom = "↑" if counts["↑"] >= counts["→"] else "→"
            rows.append((sub, dom, counts[dom]))
        if not rows:
            continue
        rows.sort(key=lambda r: (_DIR_RANK[r[1]], -r[2]))
        lines.append(display_family)
        for sub, dom, n in rows:
            lines.append(f"  {dom} {sub} ({n})")
        lines.append("")
        any_rows = True

    if not any_rows:
        lines.append("No inflow/running activity today.")
        lines.append("")
    lines.append("```")
    return "\n".join(lines)


import re as _re

_EVENT_LABELS = {
    "fda": "FDA approval", "acquisition": "acquisition", "contract": "contract win",
    "partnership": "partnership", "breakthrough": "breakthrough",
    "earnings_beat": "earnings beat", "earnings_miss": "earnings miss",
    "upgrade": "analyst upgrade", "downgrade": "analyst downgrade",
    "dilution": "dilution", "offering": "offering",
    "going_concern": "going concern", "reverse_split": "reverse split",
    "index_inclusion": "index inclusion", "other": "catalyst",
}


def _extract_catalyst_ctx(event_type: str, detail: str, metrics: dict | None = None) -> str:
    """Extract a short, meaningful context string from a catalyst headline + metrics."""
    metrics = metrics or {}

    if event_type in ("earnings_beat", "earnings_miss"):
        eps_surprise = metrics.get("eps_surprise")
        eps_actual   = metrics.get("eps_actual")
        eps_estimate = metrics.get("eps_estimate")
        if eps_surprise is not None and eps_estimate is not None:
            sign = "+" if eps_surprise >= 0 else ""
            return f"EPS ${eps_actual:.2f} vs est ${eps_estimate:.2f} ({sign}${eps_surprise:.2f})"
        if eps_actual is not None:
            return f"EPS ${eps_actual:.2f}"

    elif event_type in ("upgrade", "downgrade"):
        firm   = metrics.get("recent_ud_firm", "")
        to_g   = metrics.get("recent_ud_to", "")
        from_g = metrics.get("recent_ud_from", "")
        if firm and to_g and from_g and from_g != to_g:
            return f"{firm}: {from_g} → {to_g}"
        if firm and to_g:
            return f"{firm} → {to_g}" if (from_g and from_g != to_g) else f"{firm} ({to_g})"
        if firm:
            return firm

    if not detail:
        return ""
    d = detail.strip()

    if event_type in ("acquisition", "merger"):
        m = (_re.search(r'acquir(?:es?|ing|ed)\s+([A-Z][A-Za-z0-9 &]{1,25})', d)
             or _re.search(r'(?:buyout of|to buy|acquired by)\s+([A-Z][A-Za-z0-9 &]{1,25})', d, _re.I)
             or _re.search(r'([A-Z][A-Za-z0-9]{2,20})\s+(?:Buyout|Acquisition|Merger)\b', d)
             or _re.search(r'(?:merger with|acquisition of)\s+([A-Z][A-Za-z0-9 &]{1,25})', d, _re.I))
        if m:
            return m.group(1).strip().rstrip(',. ')[:25]

    elif event_type == "partnership":
        m = _re.search(
            r'(?:partners? with|partnership with|teams? up with|collaborat\w+ with|alliance with|strategic\s+\w+\s+with)\s+([A-Z][A-Za-z0-9 &]{1,25})',
            d, _re.I,
        )
        if m:
            return m.group(1).strip().rstrip(',. ')[:25]

    elif event_type == "contract":
        m = _re.search(r'\$([0-9.]+\s*(?:billion|million|bn|m|B|M)?)', d, _re.I)
        if m:
            return m.group(1).strip()

    return ""


# Notes that carry no discriminating signal (saturated/constant) — pushed to the
# back of their family so a more specific note takes the slot.
_LOW_VALUE_NOTE = _re.compile(r"^ICS=(100|0)$")

# Family priority: surface specific structural / relative-strength / event signals
# before generic trend confirmations. Covers both the cap-families used for the 38
# mapped agents and the registry families (structure, institutional, momentum, …)
# that the remaining agents fall back to.
_FAMILY_ORDER = [
    "structure", "breakout", "institutional", "weekly_structure",
    "squeeze", "momentum_osc", "momentum", "ma_trend", "trend",
    "volume", "volatility", "risk_filter", "prefilter", "other",
]


def _diverse_tech_notes(votes: list, verdict, limit: int = 5) -> list[str]:
    """Pick family-diverse technical notes: best one per agent family, up to limit total."""
    all_notes = _distill_notes(votes, verdict, 25)  # large pool first
    by_family: dict[str, list[str]] = {}
    for d in all_notes:
        fam = d.get("fam") or "other"
        by_family.setdefault(fam, []).append(d["note"])
    # within each family, demote low-value/saturated notes (stable sort keeps rank)
    for notes in by_family.values():
        notes.sort(key=lambda n: 1 if _LOW_VALUE_NOTE.match(n.strip()) else 0)

    chosen: list[str] = []
    seen_notes: set[str] = set()

    # First pass: one note per family in priority order
    for fam in _FAMILY_ORDER:
        for note in by_family.get(fam, []):
            if note not in seen_notes:
                chosen.append(note)
                seen_notes.add(note)
                break
        if len(chosen) >= limit:
            break

    # Fill remaining slots with any leftover high-ranked notes
    if len(chosen) < limit:
        for d in all_notes:
            if len(chosen) >= limit:
                break
            if d["note"] not in seen_notes:
                chosen.append(d["note"])
                seen_notes.add(d["note"])

    return chosen


def _build_detail_block(r: dict) -> list[str]:
    conv = "⚡ STRONG" if r["high_conviction"] else "✅ GOOD"
    header = f"### {r['ticker']} — {conv} ({r['combined_score']:+.2f})"

    # Returns — colour-coded HTML spans
    ret_parts = []
    for label, key in _RET_PERIODS:
        v = r.get(key)
        if v is None or pd.isna(v):
            continue
        color = "#22c55e" if v >= 0 else "#ef4444"
        ret_parts.append(f'<span style="color:{color}">{label} {v:+.0f}%</span>')
    returns_cell = " · ".join(ret_parts) if ret_parts else "—"

    # Technicals — family-diverse notes
    votes = r.get("_votes") or []
    if votes:
        notes = _diverse_tech_notes(votes, Verdict.LONG, 5)
        tech_bullets = "<br>".join(f"• {n}" for n in notes) if notes else "• —"
    else:
        tech_bullets = "• —"

    # Fundamentals — bullet per present metric
    metrics = r.get("_cat_metrics") or {}
    fund_bullets_list = []
    rev_growth = metrics.get("revenue_growth")
    if rev_growth is not None:
        pct = round(float(rev_growth) * 100) if abs(float(rev_growth)) < 10 else round(float(rev_growth))
        fund_bullets_list.append(f"rev {pct:+d}%")
    profit_margin = metrics.get("profit_margin")
    if profit_margin is not None:
        pct = round(float(profit_margin) * 100) if abs(float(profit_margin)) < 10 else round(float(profit_margin))
        fund_bullets_list.append(f"margin {pct}%")
    analyst_rating = metrics.get("analyst_rating")
    analyst_target = metrics.get("analyst_target")
    price = metrics.get("price")
    if analyst_rating and analyst_target is not None and price is not None and float(price) > 0:
        upside = (float(analyst_target) - float(price)) / float(price) * 100
        fund_bullets_list.append(f"analyst {analyst_rating}, tgt ${float(analyst_target):.0f} ({upside:+.0f}%)")
    short_pct = metrics.get("short_pct_float")
    if short_pct is not None:
        fund_bullets_list.append(f"short {float(short_pct):.1f}%")
    dtc = metrics.get("dtc")
    if dtc is not None:
        fund_bullets_list.append(f"DTC {float(dtc):.1f}")
    fund_bullets = "<br>".join(f"• {item}" for item in fund_bullets_list) if fund_bullets_list else "• none"

    # Catalysts — bullet per event with context
    cat_bullets_list = []
    days_to_earnings = metrics.get("days_to_earnings")
    if days_to_earnings is not None and days_to_earnings >= 0:
        cat_bullets_list.append(f"earnings in {int(days_to_earnings)}d")
    import time as _time
    cat_events = r.get("_cat_events") or []
    seen_types: set[str] = set()
    for event in cat_events:
        if event.type in seen_types:
            continue
        seen_types.add(event.type)
        # Use actual earnings date for earnings events (news headline dates are unreliable)
        if event.type in ("earnings_beat", "earnings_miss") and metrics.get("last_earnings_ts"):
            n_days = int(round((_time.time() - metrics["last_earnings_ts"]) / 86400))
            age = f"{n_days}d ago" if n_days > 0 else "today"
        elif getattr(event, "dated", True):
            n_days = int(round(float(event.recency_days)))
            age = f"{n_days}d ago" if n_days > 0 else "today"
        else:
            age = "recent"  # no real timestamp — don't fabricate a day count
        label = _EVENT_LABELS.get(event.type, event.type.replace("_", " "))
        prefix = "⚡" if event.direction > 0 else "⚠"
        ctx = _extract_catalyst_ctx(event.type, getattr(event, "detail", ""), metrics)
        if ctx:
            cat_bullets_list.append(f"{prefix} {label} ({ctx}) · {age}")
        else:
            cat_bullets_list.append(f"{prefix} {label} · {age}")
    for flag in (r.get("_cat_flags") or []):
        if flag not in {"⚡"}:
            cat_bullets_list.append(flag)
    cat_bullets = "<br>".join(f"• {item}" for item in cat_bullets_list) if cat_bullets_list else "• none detected"

    # 2-column table: label | content. Escape pipes (else parsed as a column
    # delimiter) and dollar signs (else Obsidian pairs them as LaTeX math).
    def _cell(s: str) -> str:
        return s.replace("|", "\\|").replace("$", "\\$")

    table = [
        "| | |",
        "|---|---|",
        f"| **Returns** | {_cell(returns_cell)} |",
        f"| **Technicals** | {_cell(tech_bullets)} |",
        f"| **Fundamentals** | {_cell(fund_bullets)} |",
        f"| **Catalysts** | {_cell(cat_bullets)} |",
    ]

    return [header] + table


_CONV_TAG = {"high": "🟢 high", "med": "🟡 med", "low": "⚪ low"}


def _conv_tag(r: dict) -> str:
    """Social-signal conviction (chatter quality), distinct from the ⚡/✅ technical badge."""
    return _CONV_TAG.get(str(r.get("conviction", "")).lower(), "—")


def _gate_marker(r: dict) -> str:
    """Marker explaining why Combined ≠ the weighted blend of the shown legs.

    ⚡ catalyst boost (+) · ⚠ derank (dilution/offering) · ⛔ veto (structural).
    Without this the headline Combined can't be reconciled from the leg columns."""
    flags = r.get("gate_flags") or ""
    if "⛔" in flags:
        return " ⛔"
    if "DILUTION" in flags or "⚠" in flags:
        return " ⚠"
    if "⚡" in flags:
        return " ⚡"
    return ""


def _write_markdown(
    results: list[dict],
    out_path: Path,
    min_quality: float,
    full_setups_df: pd.DataFrame | None = None,
    regime_note: str = "",
) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# Daily Report",
        f"*Generated {ts}*",
        "",
    ]
    if regime_note:
        lines += [f"**Market regime:** {regime_note}", ""]

    # Section 1: Sector Rotation — broad-market, data-driven; fall back to the
    # watchlist-setup view only if the rotation data fetch fails.
    try:
        rotation_md = build_rotation_section()
    except Exception:
        rotation_md = ""
    if (not rotation_md or "unavailable" in rotation_md) and \
            full_setups_df is not None and not full_setups_df.empty:
        rotation_md = _build_sector_rotation_section(full_setups_df)
    if rotation_md:
        lines.append(rotation_md)
        lines.append("")

    # Section 2: Aligned (group1)
    group1 = [r for r in results if r.get("group1")]
    group2 = [r for r in results if r.get("group2")]

    lines += ["## Aligned — Sentiment + Technical + Catalyst all bullish", ""]
    if group1:
        lines += [
            "| Ticker | Signal | Conv | Sent | Tech | Cat | Combined | Sector |",
            "|--------|--------|------|------|------|-----|----------|--------|",
        ]
        for r in group1:
            conv = "⚡ STRONG" if r["high_conviction"] else "✅ GOOD"
            cat_str = f"{r['catalyst_score']:+.2f}" if r["catalyst_score"] != "" else "—"
            fam, sub = r.get("_sector", ("", ""))
            sector_str = f"{fam} → {sub}" if fam and sub else fam or sub or "—"
            lines.append(
                f"| **{r['ticker']}** | {conv} | {_conv_tag(r)} | {r['sentiment_score']:+.2f} | {r['tech_score']:+.2f} | {cat_str} | {r['combined_score']:+.2f}{_gate_marker(r)} | {sector_str} |"
            )
    else:
        lines.append("*No aligned candidates today.*")
    lines.append("")

    # Section 3: Technical + Catalyst (group2). Near-aligned names (sentiment just
    # below the alignment line) are flagged 🔸 and floated to the top.
    lines += ["## Technical + Catalyst bullish", "",
              "_🔸 = near-aligned: would be fully aligned but sentiment is just below "
              f"{ALIGN_SENT:.2f} (≥ {NEAR_SENT:.2f})._", ""]
    if group2:
        lines += [
            "| Ticker | Signal | Conv | Sent | Tech | Cat | Combined | Sector |",
            "|--------|--------|------|------|------|-----|----------|--------|",
        ]
        group2_sorted = sorted(
            group2, key=lambda r: (r.get("near_aligned", False), r["combined_score"]), reverse=True
        )
        for r in group2_sorted:
            conv = "⚡ STRONG" if r["high_conviction"] else "✅ GOOD"
            cat_str = f"{r['catalyst_score']:+.2f}" if r["catalyst_score"] != "" else "—"
            fam, sub = r.get("_sector", ("", ""))
            sector_str = f"{fam} → {sub}" if fam and sub else fam or sub or "—"
            tag = "🔸 " if r.get("near_aligned") else ""
            lines.append(
                f"| {tag}**{r['ticker']}** | {conv} | {_conv_tag(r)} | {r['sentiment_score']:+.2f} | {r['tech_score']:+.2f} | {cat_str} | {r['combined_score']:+.2f}{_gate_marker(r)} | {sector_str} |"
            )
    else:
        lines.append("*No technical + catalyst candidates today.*")
    lines.append("")

    # Section 4: Long Candidate Detail
    all_longs = sorted(group1 + group2, key=lambda r: r["combined_score"], reverse=True)
    if all_longs:
        lines += ["## Long Candidate Detail", ""]
        for r in all_longs:
            lines += _build_detail_block(r)
            lines.append("")

    # Footer
    lines += [
        "---",
        "_Signal (⚡ STRONG / ✅ GOOD) = Argus technical-agreement strength. Conv (🟢/🟡/⚪) = social-signal conviction (chatter quality), independent of price._  ",
        "_Combined markers: ⚡ catalyst boost · ⚠ derank · ⛔ veto._  ",
        "_Entry/stop/target intentionally omitted pending a separate exit-analysis — to be added later._",
    ]

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Markdown → {out_path}")


def _write_csv(results: list[dict], out_path: Path) -> None:
    csv_rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in results]
    pd.DataFrame(csv_rows).to_csv(out_path, index=False)
    print(f"CSV      → {out_path}")


# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Sentiment × Technical bridge")
    parser.add_argument("--min-quality", type=float, default=6.0,
                        help="Minimum quality_score from Market_Review (default 6)")
    parser.add_argument("--include-late-chase", action="store_true",
                        help="(deprecated no-op: chase labels are auto-gated by market regime)")
    parser.add_argument("--no-chase", action="store_true",
                        help="Never include extended/late_chase, regardless of regime")
    parser.add_argument("--force-chase", action="store_true",
                        help="Always include extended/late_chase, ignoring the regime gate")
    parser.add_argument("--extra-tickers", type=str, default="",
                        help="Comma-separated tickers to force-include regardless of quality (pure technical, zero sentiment weight)")
    parser.add_argument("--out", type=str, default=str(OUT_DIR),
                        help="Output directory for reports")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── load Market_Review picks ──────────────────────────────────────────────
    if not REVIEW_REPORT.exists():
        sys.exit(f"Market_Review report not found: {REVIEW_REPORT}")

    df = pd.read_csv(REVIEW_REPORT)
    df["quality_score"] = pd.to_numeric(df["quality_score"], errors="coerce").fillna(0)

    # Keep reference to full df for sector rotation
    full_setups_df = df.copy()

    # Chase labels (extended/late_chase) are gated on the market regime: included
    # only in a risk-on tape, unless overridden. --no-chase off; --force-chase on.
    regime_label, risk_on = market_regime()
    if args.no_chase:
        include_chase = False
    elif args.force_chase:
        include_chase = True
    else:
        include_chase = risk_on
    keep_labels = ACTIONABLE_LABELS.copy()
    if include_chase:
        keep_labels |= CHASE_LABELS
    print(f"Market regime: {regime_label} → risk_{'on' if risk_on else 'off'}; "
          f"chase labels {'INCLUDED' if include_chase else 'EXCLUDED'}")

    filtered = df[
        df["setup_label"].isin(keep_labels) &
        (df["quality_score"] >= args.min_quality)
    ].copy()

    print(f"Market_Review: {len(df)} total tickers → {len(filtered)} pass filters "
          f"(labels={sorted(keep_labels)}, min_quality={args.min_quality})")

    # Extra tickers: force-include with zero sentiment weight (pure technical)
    extra_symbols = [t.strip().upper() for t in args.extra_tickers.split(",") if t.strip()]
    if extra_symbols:
        existing = set(filtered["ticker"].str.upper())
        # Also include any from the full df that match (use their real sentiment data)
        from_review = df[df["ticker"].str.upper().isin(extra_symbols) & ~df["ticker"].str.upper().isin(existing)]
        stub_symbols = [s for s in extra_symbols if s not in existing and s not in set(from_review["ticker"].str.upper())]
        stubs = pd.DataFrame([{
            "ticker": sym, "asset_type": "equity", "setup_label": "noise",
            "quality_score": 0, "cluster_overlap": 0, "cluster_confirmed": "false",
            "cluster_bonus": 0, "source_score": 0, "mention_count": 0,
            "distinct_account_count": 0, "catalysts": "", "top_accounts": "",
            "prior_ret_1d": 0, "prior_ret_5d": 0, "prior_ret_20d": 0,
        } for sym in stub_symbols])
        filtered = pd.concat([filtered, from_review, stubs], ignore_index=True)
        print(f"Extra tickers: {len(extra_symbols)} requested → "
              f"{len(from_review)} from review data, {len(stub_symbols)} as stubs")

    if filtered.empty:
        sys.exit("No tickers passed filters — lower --min-quality or check the report.")

    # tag which tickers were force-included (for display)
    extra_set = {t.strip().upper() for t in args.extra_tickers.split(",") if t.strip()}

    # ── run Argus analysis in parallel ────────────────────────────────────────
    rows = [row for _, row in filtered.iterrows()]
    results = []
    print(f"Running Argus analysis on {len(rows)} tickers ({MAX_WORKERS} workers)…")

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(_analyse_ticker, row): row["ticker"] for row in rows}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            done += 1
            ticker = futures[fut]
            result = fut.result()
            if result:
                results.append(result)
                verdict = result["argus_verdict"]
                hc = "⚡" if result["high_conviction"] else " "
                align = result["alignment"]
                print(f"  [{done:>2}/{len(rows)}] {ticker:<8} {verdict:<5}{hc} "
                      f"score={result['combined_score']:+.3f}  {align}")
            else:
                print(f"  [{done:>2}/{len(rows)}] {ticker:<8} [skipped]")

    if not results:
        sys.exit("All tickers failed — check network / yfinance.")

    # tag extra tickers (pure technical — no real sentiment data)
    for r in results:
        r["extra"] = r["ticker"].upper() in extra_set

    # ── sort by combined score descending ─────────────────────────────────────
    results.sort(key=lambda r: r["combined_score"], reverse=True)

    # ── write outputs ─────────────────────────────────────────────────────────
    ts_tag = datetime.now().strftime("%Y%m%d_%H%M")
    regime_note = (f"{regime_label} — risk-{'on' if risk_on else 'off'}; "
                   f"chase entries {'ON' if include_chase else 'OFF'}")
    _write_markdown(results, out_dir / f"bridge_{ts_tag}.md", args.min_quality,
                    full_setups_df=full_setups_df, regime_note=regime_note)
    _write_csv(results,      out_dir / f"bridge_{ts_tag}.csv")

    # also overwrite a stable "latest" copy
    _write_markdown(results, out_dir / "bridge_latest.md", args.min_quality,
                    full_setups_df=full_setups_df, regime_note=regime_note)
    _write_csv(results,      out_dir / "bridge_latest.csv")

    # ── summary ───────────────────────────────────────────────────────────────
    aligned   = [r for r in results if r["alignment"] == "ALIGNED"]
    diverging = [r for r in results if r["alignment"] == "DIVERGING"]
    waiting   = [r for r in results if r["alignment"] == "TECH_WAIT"]

    print(f"\n{'─'*60}")
    print(f"  Results: {len(results)} analysed | "
          f"{len(aligned)} ALIGNED | {len(waiting)} TECH_WAIT | {len(diverging)} DIVERGING")
    if aligned:
        print(f"\n  Top ALIGNED picks:")
        for r in aligned[:5]:
            hc = "⚡" if r["high_conviction"] else "  "
            print(f"    {hc}{r['ticker']:<8} combined={r['combined_score']:+.3f}  "
                  f"entry={r['entry']:.2f}  stop={r['stop']:.2f}  "
                  f"target={r['target']:.2f}  R:R={r['risk_reward']:.1f}x")
    print(f"{'─'*60}\n")


if __name__ == "__main__":
    main()
