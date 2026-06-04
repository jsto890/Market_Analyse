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


# ── config ────────────────────────────────────────────────────────────────────
ACTIONABLE_LABELS = {"fresh_watch", "building", "momentum_confirmed"}
LATE_CHASE_LABEL  = "late_chase"
MAX_WORKERS       = 6
SENTIMENT_WEIGHT  = 0.40
TECHNICAL_WEIGHT  = 0.60
MAX_QUALITY       = 15.0  # normalisation ceiling

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


def _analyse_ticker(row: pd.Series) -> Optional[dict]:
    ticker = row["ticker"]
    alias_entry = TICKER_ALIASES.get(ticker.upper())
    fetch_sym, min_bars = alias_entry if alias_entry else (ticker, _DEFAULT_MIN_BARS)
    try:
        df = get_history(fetch_sym, period="2y", interval="1d")
        if df is None or len(df) < min_bars:
            return None
        ret_1d  = float(df["close"].pct_change(1).iloc[-1])  if len(df) >= 2  else float("nan")
        ret_5d  = float(df["close"].pct_change(5).iloc[-1])  if len(df) >= 6  else float("nan")
        ret_20d = float(df["close"].pct_change(20).iloc[-1]) if len(df) >= 21 else float("nan")
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

    combined = SENTIMENT_WEIGHT * sentiment_score + TECHNICAL_WEIGHT * tech_score

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
        "catalysts":         str(row.get("catalysts", "")),
        "top_accounts":      str(row.get("top_accounts", "")),
        "ret_1d":            round(ret_1d * 100, 2),
        "ret_5d":            round(ret_5d * 100, 2),
        "ret_20d":           round(ret_20d * 100, 2),
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
        "sentiment_score":   round(sentiment_score, 3),
        "tech_score":        round(tech_score, 3),
        "combined_score":    round(combined, 3),
        "alignment":         alignment,
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


def _write_markdown(results: list[dict], out_path: Path, min_quality: float) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    extra_count = sum(1 for r in results if r.get("extra"))
    extra_note = f" | `[T]` = {extra_count} force-included (pure technical, no sentiment data)" if extra_count else ""
    lines = [
        f"# Sentiment × Technical Bridge Report",
        f"*Generated {ts} | min_quality ≥ {min_quality} | {len(results)} tickers analysed{extra_note}*",
        "",
        "Scoring: **40% sentiment** (quality × setup bias) + **60% technical** (Argus 52-agent ensemble)",
        "",
    ]

    # Group by alignment
    groups = {
        "ALIGNED":     ("Aligned — Sentiment + Technicals Both Bullish", "⚡✅"),
        "TECH_WAIT":   ("Technical Hold — Sentiment Positive, Argus Waiting", "⏳"),
        "DIVERGING":   ("Diverging — Sentiment Bullish, Argus Bearish", "⚠️"),
        "CONTRARIAN":  ("Contrarian — Sentiment Bearish, Argus Bullish", "🔄"),
        "NEUTRAL":     ("Neutral / Mixed", "—"),
    }

    for key, (title, icon) in groups.items():
        subset = [r for r in results if r["alignment"] == key]
        if not subset:
            continue
        lines += [f"## {icon} {title}", ""]
        lines += [
            "| Ticker | Setup | Quality | Argus | Score | HiCon | Agreement | Entry | Stop | Target | R:R | Catalysts |",
            "|--------|-------|---------|-------|-------|-------|-----------|-------|------|--------|-----|-----------|",
        ]
        for r in subset:
            hc = "⚡" if r["high_conviction"] else ""
            tag = " `[T]`" if r.get("extra") else ""
            lines.append(
                f"| **{r['ticker']}**{tag} | {r['setup_label']} | {r['quality_score']} "
                f"| {r['argus_verdict']} {hc} | {r['combined_score']:+.3f} "
                f"| {'Yes' if r['high_conviction'] else 'No'} | {r['agreement_pct']}% "
                f"| {r['entry']:.2f} | {r['stop']:.2f} | {r['target']:.2f} "
                f"| {r['risk_reward']:.1f}x | {r['catalysts'][:40]} |"
            )
        lines.append("")

    # Top picks detail
    top = [r for r in results if r["alignment"] == "ALIGNED"][:5]
    if top:
        lines += ["## Top Picks — Detail", ""]
        for r in top:
            lines += [
                f"### {r['ticker']}  `{_action_emoji(r)}`",
                f"- **Setup:** {r['setup_label']} | **Quality:** {r['quality_score']}/15 | **Source score:** {r['source_score']}",
                f"- **Sentiment accounts:** {r['accounts']} ({r['mentions']} mentions) — {r['top_accounts'][:60]}",
                f"- **Catalysts:** {r['catalysts']}",
                f"- **Price:** 1d {r['ret_1d']:+.1f}%  5d {r['ret_5d']:+.1f}%  20d {r['ret_20d']:+.1f}%  | Entry quality: {r['entry_quality']}{' ⚠️ extended' if r['is_extended'] else ''}",
                f"- **Argus:** {r['argus_verdict']} | Score {r['argus_score']:+.3f} | Agreement {r['agreement_pct']}% | Votes L:{r['long_votes']} S:{r['short_votes']} W:{r['wait_votes']}",
                f"- **Trade:** Entry {r['entry']:.2f}  Stop {r['stop']:.2f}  Target {r['target']:.2f}  R:R {r['risk_reward']:.1f}x",
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

    # ── write outputs ─────────────────────────────────────────────────────────
    ts_tag = datetime.now().strftime("%Y%m%d_%H%M")
    _write_markdown(results, out_dir / f"bridge_{ts_tag}.md", args.min_quality)
    _write_csv(results,      out_dir / f"bridge_{ts_tag}.csv")

    # also overwrite a stable "latest" copy
    _write_markdown(results, out_dir / "bridge_latest.md", args.min_quality)
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
