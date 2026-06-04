"""Chart Chat + AI Analysis — natural-language Q&A grounded in live
indicator values via Anthropic Claude.

If ANTHROPIC_API_KEY is unset, falls back to a deterministic templated
report so the system stays fully usable offline.
"""
from __future__ import annotations

import json
from typing import Optional
import pandas as pd

from ..settings import settings
from ..action_card import build_action_card
from ..indicators import compute_all, INDICATOR_LIST


def _grounding_payload(symbol: str, df: pd.DataFrame) -> dict:
    df_ind = compute_all(df) if "rsi_14" not in df.columns else df
    last = df_ind.iloc[-1]
    indicators = {k: (None if pd.isna(last.get(k)) else float(last.get(k)))
                  for k in INDICATOR_LIST if k in df_ind.columns}
    card = build_action_card(symbol, df_ind)
    return {
        "symbol": symbol.upper(),
        "as_of": str(df_ind.index[-1]),
        "price": float(last["close"]),
        "indicators": indicators,
        "action_card": card.to_dict(),
    }


def _templated_report(payload: dict) -> str:
    card = payload["action_card"]
    inds = payload["indicators"]
    lines = [
        f"# Analysis — {payload['symbol']} as of {payload['as_of']}",
        f"Price: {payload['price']:.2f}",
        "",
        f"**Verdict: {card['verdict']}** (score {card['score']:+.2f}, "
        f"{card['agreement_pct']:.0f}% agreement, {'⚡ HIGH' if card['high_conviction'] else 'normal'} conviction)",
        f"Entry {card['entry']:.2f} | Stop {card['stop']:.2f} | Target {card['target']:.2f} | RR {card['risk_reward']:.2f}",
        "",
        "## Trend",
        f"- EMA8/20/50/200: {inds.get('ema_8'):.2f} / {inds.get('ema_20'):.2f} / {inds.get('ema_50'):.2f} / {inds.get('ema_200'):.2f}"
        if inds.get('ema_200') else "- EMAs unavailable",
        f"- ADX(14): {inds.get('adx_14'):.1f}" if inds.get('adx_14') else "",
        "",
        "## Momentum",
        f"- RSI(14): {inds.get('rsi_14'):.1f}" if inds.get('rsi_14') else "",
        f"- MACD: {inds.get('macd'):.3f} (signal {inds.get('macd_signal'):.3f})"
        if inds.get('macd') is not None else "",
        f"- Stoch RSI: K={inds.get('stochrsi_k'):.1f}" if inds.get('stochrsi_k') else "",
        "",
        "## Volume",
        f"- OBV: {inds.get('obv'):.0f}" if inds.get('obv') else "",
        f"- CMF(20): {inds.get('cmf_20'):.3f}" if inds.get('cmf_20') is not None else "",
        "",
        "## Agents in agreement",
        ", ".join(card["agreed"]) or "—",
        "",
        "## Dissenters",
        ", ".join(card["dissented"]) or "—",
    ]
    return "\n".join(l for l in lines if l)


def written_analysis(symbol: str, df: pd.DataFrame) -> dict:
    """Generate a written research report for a symbol."""
    payload = _grounding_payload(symbol, df)
    if not settings.anthropic_api_key:
        return {"mode": "templated", "report": _templated_report(payload), "grounding": payload}
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1500,
            system=(
                "You are an institutional equity analyst. Write a concise, professional "
                "trade-thesis report for the given symbol. Ground every claim in the JSON "
                "indicator payload provided — do not invent data. Cover: trend, support/"
                "resistance, volume, momentum, pattern identification, and a final trade "
                "thesis with risk/reward. Markdown only."
            ),
            messages=[{"role": "user", "content": json.dumps(payload, default=str)}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        return {"mode": "claude", "report": text, "grounding": payload}
    except Exception as e:
        return {"mode": "fallback", "error": str(e),
                "report": _templated_report(payload), "grounding": payload}


def chart_chat(symbol: str, df: pd.DataFrame, question: str) -> dict:
    """Answer a free-form question grounded in indicator values."""
    payload = _grounding_payload(symbol, df)
    if not settings.anthropic_api_key:
        return {
            "mode": "fallback",
            "answer": "Anthropic key not set. Templated context only:\n\n"
                     + _templated_report(payload),
            "grounding": payload,
        }
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=800,
            system=(
                "You are a trading assistant grounded in live indicator data. "
                "Answer questions using ONLY the JSON payload provided. If a value "
                "isn't in the payload, say so."
            ),
            messages=[
                {"role": "user", "content": f"Data:\n{json.dumps(payload, default=str)}"},
                {"role": "user", "content": f"Question: {question}"},
            ],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        return {"mode": "claude", "answer": text, "grounding": payload}
    except Exception as e:
        return {"mode": "error", "error": str(e), "grounding": payload}
