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

from argus.data.market import get_history          # noqa: E402
from argus.action_card.builder import build_action_card  # noqa: E402
from argus.agents.base import Verdict              # noqa: E402
from argus.catalyst import catalyst_leg            # noqa: E402
from argus.settings import settings               # noqa: E402
from argus.weights_config import BRIDGE_WEIGHTS    # noqa: E402  loaded from config/weights.yaml


# ── config ────────────────────────────────────────────────────────────────────
ACTIONABLE_LABELS = {"fresh_watch", "building", "momentum_confirmed"}
LATE_CHASE_LABEL  = "late_chase"
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

    return {
        "ticker":            ticker,
        "fetch_symbol":      fetch_sym if fetch_sym != ticker else ticker,
        "setup_label":       row.get("setup_label", ""),
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


def _write_markdown(
    results: list[dict],
    out_path: Path,
    min_quality: float,
    trust_lookup: dict | None = None,
    prev_sections: dict | None = None,
    persistence_days: dict | None = None,
) -> None:
    trust_lookup = trust_lookup or {}
    prev_sections = prev_sections or {}
    persistence_days = persistence_days or {}

    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    extra_count = sum(1 for r in results if r.get("extra"))
    extra_note = f" | `[T]` = {extra_count} force-included (pure technical, no sentiment data)" if extra_count else ""
    lines = [
        "# Sentiment × Technical Bridge Report",
        f"*Generated {ts} | min_quality ≥ {min_quality} | {len(results)} tickers analysed{extra_note}*",
        "",
        f"Scoring: **{SENTIMENT_WEIGHT:.0%} sentiment** (quality × setup bias) + **{TECHNICAL_WEIGHT:.0%} technical** (Argus ensemble) + **{CATALYST_WEIGHT:.0%} catalyst** (fundamentals/events)",
        "",
    ]

    # ── Summary header ────────────────────────────────────────────────────────
    aligned_all = [r for r in results if r["alignment"] == "ALIGNED"]
    aligned_hc  = [r for r in aligned_all if r["high_conviction"]]
    short_hc    = [r for r in results if r["argus_verdict"] == "SHORT" and r["high_conviction"]]
    extended_warn = [r for r in aligned_all if r.get("entry_quality") == "extended"]
    new_today   = [r for r in aligned_all if r["ticker"].upper() not in prev_sections]
    changed     = [
        (r["ticker"], prev_sections[r["ticker"].upper()], r["alignment"])
        for r in results
        if r["ticker"].upper() in prev_sections
        and prev_sections[r["ticker"].upper()] != r["alignment"]
    ]

    # Catalyst concentration across top HC picks
    from collections import Counter as _Counter
    cat_counts: _Counter = _Counter()
    for r in aligned_hc[:10]:
        for cat in (r["catalysts"] or "").replace(",", ";").split(";"):
            if cat.strip() and cat.strip() != "nan":
                cat_counts[cat.strip()] += 1
    top_cat, top_cat_n = cat_counts.most_common(1)[0] if cat_counts else ("", 0)

    # Sector concentration across aligned picks (top 15, parallel lookup)
    sector_warn = ""
    aligned_sample = [r["ticker"] for r in aligned_all[:15]]
    if aligned_sample:
        import concurrent.futures as _cf
        with _cf.ThreadPoolExecutor(max_workers=6) as _pool:
            sector_map = dict(zip(aligned_sample, _pool.map(_get_sector, aligned_sample)))
        sector_counts: _Counter = _Counter(s for s in sector_map.values() if s)
        if sector_counts:
            dom_sector, dom_n = sector_counts.most_common(1)[0]
            if dom_n >= 3:
                dom_tickers = [t for t in aligned_sample if sector_map.get(t) == dom_sector]
                sector_warn = (f"⚠ **Sector concentration:** {dom_n}/{len(aligned_sample)} aligned picks "
                               f"are **{dom_sector}** ({', '.join(dom_tickers[:6])})")

    short_hc_str = f" · **{len(short_hc)} HC short**" if short_hc else ""
    ext_str = f" · {len(extended_warn)} extended ⚠" if extended_warn else ""
    lines += [
        "---",
        f"**⚡ {len(aligned_hc)} HC longs{short_hc_str} · {len(aligned_all)} total aligned{ext_str}**",
        "",
    ]
    if new_today:
        lines.append(f"🆕 **New today:** {' · '.join(r['ticker'] for r in new_today[:8])}")
    for ticker, prev, curr in changed[:5]:
        _sec = {"ALIGNED": "✅ Aligned", "DIVERGING": "⚠ Diverging", "CONTRARIAN": "🔄 Contrarian",
                "TECH_WAIT": "⏳ Wait", "NEUTRAL": "— Neutral"}
        lines.append(f"🔀 **{ticker}** {_sec.get(prev, prev)} → {_sec.get(curr, curr)}")
    if top_cat_n >= 5:
        lines.append(f"⚠ **Concentration:** {top_cat_n}/{min(len(aligned_hc), 10)} HC picks share **{top_cat}** catalyst")
    if sector_warn:
        lines.append(sector_warn)
    lines += ["---", ""]

    # ── Group tables ──────────────────────────────────────────────────────────
    groups = {
        "ALIGNED":    ("Aligned — Sentiment + Technicals Both Bullish", "⚡✅"),
        "TECH_WAIT":  ("Technical Hold — Sentiment Positive, Argus Waiting", "⏳"),
        "DIVERGING":  ("Diverging — Sentiment Bullish, Argus Bearish", "⚠️"),
        "CONTRARIAN": ("Contrarian — Sentiment Bearish, Argus Bullish", "🔄"),
        "NEUTRAL":    ("Neutral / Mixed", "—"),
    }

    for key, (title, icon) in groups.items():
        subset = [r for r in results if r["alignment"] == key]
        if not subset:
            continue
        lines += [f"## {icon} {title}", ""]
        lines += [
            "| Ticker | Setup | Quality | Argus | Tier | Regime | Score | Entry | Agreement | Entry $ | Stop | Target | Returns (1D/1W/1M/6M/1Y) | Catalysts |",
            "|--------|-------|---------|-------|------|--------|-------|-------|-----------|---------|------|--------|--------------------------|-----------|",
        ]
        for r in subset:
            hc   = " ⚡" if r["high_conviction"] else ""
            tag  = " `[T]`" if r.get("extra") else ""
            eq   = "⚠ ext" if r.get("entry_quality") == "extended" else "clean"
            tier = r.get("action_label") or "—"
            reg  = r.get("ticker_regime") or "—"
            lines.append(
                f"| **{r['ticker']}**{tag} | {r['setup_label']} | {r['quality_score']} "
                f"| {r['argus_verdict']}{hc} | {tier} | {reg} | {r['combined_score']:+.3f} "
                f"| {eq} | {r['agreement_pct']}% "
                f"| {r['entry']:.2f} | {r['stop']:.2f} | {r['target']:.2f} "
                f"| {_returns_strip(r)} "
                f"| {(r['catalysts'] or '')[:40]} |"
            )
        lines.append("")

    # ── Top picks detail ──────────────────────────────────────────────────────
    top = [r for r in results if r["alignment"] == "ALIGNED"][:5]
    if top:
        lines += ["## Top Picks — Detail", ""]
        for r in top:
            ticker_up = r["ticker"].upper()
            persist = persistence_days.get(ticker_up, 0)
            persist_str = f" | **{persist}d** in Aligned" if persist > 1 else ""
            anchor = r.get("stop_anchor") or "ATR"
            trust_str = _format_trust(r.get("top_accounts", ""), trust_lookup)
            lines += [
                f"### {r['ticker']}  `{_action_emoji(r)}`",
                f"- **Setup:** {r['setup_label']} | **Quality:** {r['quality_score']}/15{persist_str} | **Source score:** {r['source_score']}",
                f"- **Accounts:** {r['accounts']} ({r['mentions']} mentions) — {trust_str}",
                f"- **Catalysts:** {r['catalysts']}",
                f"- **Returns:** {_returns_pills(r)} | Entry: {r['entry_quality']}{' ⚠️' if r['is_extended'] else ''}",
                f"- **Argus:** {r['argus_verdict']} `{r.get('action_label','—')}` | Score {r['argus_score']:+.3f} | Agreement {r['agreement_pct']}% | N_eff {r.get('n_eff','—')} | Combo {r.get('combo','—')} | {r.get('ticker_regime','—')} | Votes L:{r['long_votes']} S:{r['short_votes']} W:{r['wait_votes']}",
                f"- **Trade:** Entry {r['entry']:.2f}  Stop {r['stop']:.2f} *({anchor})*  Target {r['target']:.2f}  R:R {r['risk_reward']:.1f}x",
                f"- **Combined score:** {r['combined_score']:+.3f}",
                "",
            ]

    out_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Markdown → {out_path}")


def _write_csv(results: list[dict], out_path: Path) -> None:
    pd.DataFrame(results).to_csv(out_path, index=False)
    print(f"CSV      → {out_path}")


# ── main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Sentiment × Technical bridge")
    parser.add_argument("--min-quality", type=float, default=6.0,
                        help="Minimum quality_score from Market_Review (default 6)")
    parser.add_argument("--include-late-chase", action="store_true",
                        help="Also analyse late_chase tickers (lower priority)")
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

    keep_labels = ACTIONABLE_LABELS.copy()
    if args.include_late_chase:
        keep_labels.add(LATE_CHASE_LABEL)

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

    # ── load account trust data ───────────────────────────────────────────────
    trust_lookup: dict[str, dict] = {}
    trust_path = Path(os.environ.get("MARKET_REVIEW_ROOT", "/Users/josephstorey/Market_Review")) / "reports" / "account_backtest.csv"
    if trust_path.exists():
        try:
            trust_df = pd.read_csv(trust_path)
            for _, trow in trust_df.iterrows():
                trust_lookup[trow["account"]] = {
                    "hit_rate_1d": float(trow.get("hit_rate_1d") or 0),
                    "n": int(float(trow.get("complete_1d_count") or 0)),
                }
        except Exception as exc:
            print(f"  [warn] Could not load trust data: {exc}", file=sys.stderr)

    # ── load previous results for delta + persistence ─────────────────────────
    prev_sections: dict[str, str] = {}  # ticker_upper -> alignment last run
    persistence_days: dict[str, int] = {}  # ticker_upper -> consecutive days in current alignment

    latest_csv = out_dir / "bridge_latest.csv"
    if latest_csv.exists():
        try:
            prev_df = pd.read_csv(latest_csv)
            prev_sections = {str(t).upper(): str(a) for t, a in zip(prev_df["ticker"], prev_df["alignment"])}
        except Exception:
            pass

    # Count consecutive days in same alignment from dated reports (last 7)
    dated_csvs = sorted(out_dir.glob("bridge_????????_????.csv"), reverse=True)[:7]
    for r in results:
        ticker_up = r["ticker"].upper()
        current_alignment = r["alignment"]
        count = 0
        for dated_csv in dated_csvs:
            try:
                hist_df = pd.read_csv(dated_csv)
                match = hist_df[hist_df["ticker"].str.upper() == ticker_up]
                if not match.empty and match.iloc[0]["alignment"] == current_alignment:
                    count += 1
                else:
                    break
            except Exception:
                break
        persistence_days[ticker_up] = count

    # ── write outputs ─────────────────────────────────────────────────────────
    ts_tag = datetime.now().strftime("%Y%m%d_%H%M")
    _write_markdown(results, out_dir / f"bridge_{ts_tag}.md", args.min_quality,
                    trust_lookup, prev_sections, persistence_days)
    _write_csv(results,      out_dir / f"bridge_{ts_tag}.csv")

    # also overwrite a stable "latest" copy
    _write_markdown(results, out_dir / "bridge_latest.md", args.min_quality,
                    trust_lookup, prev_sections, persistence_days)
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
