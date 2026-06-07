"""Build the Action Card: synthesise all agent votes into one verdict
plus entry / stop / target / risk-reward."""
from __future__ import annotations

import dataclasses
import json
import time
from dataclasses import dataclass, field, asdict
from typing import List
import numpy as np
import pandas as pd

from ..agents.base import Vote, Verdict
from ..agents import run_all
from ..indicators import compute_all
from ..settings import settings

# ── Sector lookup — static map for common tickers, yfinance fallback ─────────
_STATIC_SECTORS: dict[str, str] = {
    # Broad market / ETFs
    "SPY": "Broad Market", "QQQ": "Technology", "IWM": "Small Cap",
    "DIA": "Broad Market", "MDY": "Mid Cap",
    "XLK": "Technology", "XLF": "Financials", "XLV": "Healthcare",
    "XLE": "Energy", "XLI": "Industrials", "XLY": "Consumer Cyclical",
    "XLP": "Consumer Defensive", "XLB": "Materials", "XLRE": "Real Estate",
    "XLU": "Utilities", "XLC": "Comm Services",
    # Large-caps
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "AVGO": "Technology", "META": "Comm Services", "GOOGL": "Comm Services",
    "AMZN": "Consumer Cyclical", "TSLA": "Consumer Cyclical",
    "JPM": "Financials", "BAC": "Financials", "GS": "Financials",
    "MA": "Financials", "WFC": "Financials", "MS": "Financials",
    "JNJ": "Healthcare", "UNH": "Healthcare", "LLY": "Healthcare", "PFE": "Healthcare",
    "WMT": "Consumer Defensive", "COST": "Consumer Defensive",
    "HD": "Consumer Cyclical", "MCD": "Consumer Cyclical", "NKE": "Consumer Cyclical",
    "DIS": "Comm Services", "NFLX": "Comm Services",
    "BA": "Industrials", "CAT": "Industrials", "DE": "Industrials", "HON": "Industrials",
    "XOM": "Energy", "CVX": "Energy",
    "ORCL": "Technology", "AMD": "Technology",
}

_SECTOR_CACHE: dict[str, tuple[float, str]] = {}
_SECTOR_TTL_S = 86400  # 24h

def _lookup_sector(symbol: str) -> str:
    """Return sector for display, '' if unknown. Static map first, yfinance fallback cached 24h."""
    sym = symbol.upper()
    if sym in _STATIC_SECTORS:
        return _STATIC_SECTORS[sym]
    now = time.time()
    cached = _SECTOR_CACHE.get(sym)
    if cached is not None and now - cached[0] < _SECTOR_TTL_S:
        return cached[1]
    try:
        import yfinance as yf
        sector = str(yf.Ticker(sym).info.get("sector", "") or "")
    except Exception:
        sector = ""
    _SECTOR_CACHE[sym] = (now, sector)
    return sector

# Correlated agent families — each family's combined contribution is capped so that
# momentum stocks with many confirming MA/breakout signals don't inflate the score.
_FAMILIES: dict[str, frozenset[str]] = {
    "ma_trend": frozenset({
        "Minervini Trend Template", "Weinstein Stage", "Weekly/Daily Alignment",
        "EMA Alignment", "Price vs EMA200", "HMA Slope", "KAMA Slope",
        "Golden/Death Cross", "Supertrend", "Parabolic SAR", "ADX Trend Strength",
        "EMA8/20 Cross", "EMA20/50 Cross",
    }),
    "breakout": frozenset({
        "Buyable Gap Up", "Volume Surge", "Donchian Breakout", "Keltner Breakout",
        "Opening Gap", "High Tight Flag", "Pocket Pivot",
    }),
    "squeeze": frozenset({
        "TTM Squeeze", "TTM Squeeze Streak", "VCP", "NR7/Inside Day",
    }),
    "momentum_osc": frozenset({
        "RSI Zone", "RSI(2) Extreme", "Stochastic", "Stochastic RSI",
        "Williams %R", "CCI", "WaveTrend", "Schaff Trend Cycle",
    }),
    "weekly_structure": frozenset({
        "Weekly EMA Trend", "Weekly RSI Zone", "Weekly MACD Cross",
        "Weekly Price Structure", "Weekly OBV Trend", "Weekly Bollinger Position",
    }),
}

_FAMILY_MAX: dict[str, float] = {
    "ma_trend": 2.5,
    "breakout": 1.5,
    "squeeze": 1.0,
    "momentum_osc": 1.5,
    "weekly_structure": 2.0,
}

_AGENT_FAMILY: dict[str, str] = {
    name: fam for fam, members in _FAMILIES.items() for name in members
}

# Regime × family confidence multipliers applied POST-cap.
# Scaling per-vote confidence before the cap means boosters (>1.0) are silently
# swallowed when a family already hits its cap, making amplification a no-op.
# Applying the multiplier to the capped family total ensures both suppression
# and amplification take effect consistently.
#
# Theory: trend agents (ma_trend, breakout) are reliable in trends but whipsaw
# in ranges; oscillators are reliable in ranges but misfire in strong trends.
_REGIME_FAMILY_MULT: dict[str, dict[str, float]] = {
    "trending": {
        "ma_trend":       1.0,   # MA crossovers valid in trend
        "breakout":       1.2,   # breakouts have follow-through in trends
        "squeeze":        0.7,   # squeezes ambiguous mid-trend
        "momentum_osc":   0.3,   # oscillators unreliable mid-trend (overbought ≠ extended if trend intact)
        "weekly_structure": 1.0, # weekly trend most reliable in trending markets
    },
    # ADX > 25 but declining — trend losing momentum, oscillators become more informative
    "trending_late": {
        "ma_trend":       0.9,
        "breakout":       0.8,   # fewer breakouts when trend wanes
        "squeeze":        0.9,   # squeezes useful as trend consolidates
        "momentum_osc":   0.8,   # oscillators reliable in transition; oversold = good entry
        "weekly_structure": 1.0,
    },
    "ranging": {
        "ma_trend":       0.4,   # MAs whipsaw in chop
        "breakout":       0.4,   # most breakouts fail without trend
        "squeeze":        1.3,   # squeezes resolve well from ranging bases
        "momentum_osc":   1.2,   # oscillators accurate in mean-reverting ranges
        "weekly_structure": 1.1, # weekly structure frames the range boundaries
    },
    "gap_down_continuation": {
        "ma_trend":       0.7,   # trend is down; MAs may lag
        "breakout":       0.3,   # gap-down is breakdown, not setup
        "squeeze":        0.5,   # ambiguous on gap-down day
        "momentum_osc":   0.3,   # oversold ≠ bounce when price < EMA50
        "weekly_structure": 0.7, # weekly lags intraday gap events
    },
    "neutral": {
        "ma_trend":       0.9,
        "breakout":       0.9,
        "squeeze":        0.9,
        "momentum_osc":   0.9,
        "weekly_structure": 1.0,
    },
}

# Family combos with negative expectancy in backtest — veto these to WATCH.
# Combo string: ma_trend + breakout + squeeze + momentum_osc direction (L/S/N).
# LNNL/LLNL: oscillator confirms LONG while trend is already up = "entering extended".
_WEAK_COMBOS: frozenset[str] = frozenset({"LNNL", "LLNL", "LLLL"})
# LSNS/LNLL/LSNL: dip-in-uptrend. LLNS/LLLS: breakout+trend with oscillator counter-pressure.
# All show 50-53% WR in neutral+ranging regime (n>=10).
_STRONG_COMBOS: frozenset[str] = frozenset({"LSNS", "LNLL", "LSNL", "LLNS", "LLLS"})


def _detect_ticker_regime(df: pd.DataFrame) -> str:
    """Classify per-ticker market regime from recent OHLCV + indicators."""
    gap = float(df['open'].iloc[-1] / df['close'].iloc[-2] - 1) if len(df) > 1 else 0.0
    try:
        ema50 = float(df['ema_50'].iloc[-1]) if 'ema_50' in df.columns else None
        if ema50 is not None and pd.isna(ema50):
            ema50 = None
    except Exception:
        ema50 = None
    last = float(df['close'].iloc[-1])
    if gap < -0.02 and ema50 is not None and last < ema50:
        return 'gap_down_continuation'
    adx_val, adx_slope = _adx_context(df)
    if adx_val is not None and adx_val > 25:
        # Trend weakening: ADX still above 25 but actively declining.
        # Pullback entries and oscillators become more reliable in this transition phase.
        if adx_slope == 'falling':
            return 'trending_late'
        return 'trending'
    if adx_val is not None and adx_val < 20:
        return 'ranging'
    return 'neutral'


def _adx_context(df: pd.DataFrame) -> tuple[float | None, str]:
    """Return (adx_value, slope_label) where slope_label is 'rising'/'falling'/'flat'/''."""
    try:
        col = df['adx_14'] if 'adx_14' in df.columns else None
        if col is None or len(col) < 6:
            return None, ''
        adx_now  = float(col.iloc[-1])
        adx_5d   = float(col.iloc[-6])
        if pd.isna(adx_now) or pd.isna(adx_5d):
            return None, ''
        delta = adx_now - adx_5d
        if delta > 2.0:
            slope = 'rising'
        elif delta < -2.0:
            slope = 'falling'
        else:
            slope = 'flat'
        return round(adx_now, 1), slope
    except Exception:
        return None, ''


def _capped_weights(votes: list[Vote], regime: str = "neutral") -> tuple[float, float]:
    """Confidence-weighted long/short sums with per-family caps + post-cap regime scaling.

    Regime multipliers are applied AFTER the cap so that suppression and amplification
    both take effect even when families are at their cap ceiling.
    """
    fam_long:  dict[str, float] = {f: 0.0 for f in _FAMILIES}
    fam_short: dict[str, float] = {f: 0.0 for f in _FAMILIES}
    raw_long  = 0.0
    raw_short = 0.0
    for v in votes:
        fam = _AGENT_FAMILY.get(v.agent)
        if fam:
            if v.verdict == Verdict.LONG:    fam_long[fam]  += v.confidence
            elif v.verdict == Verdict.SHORT: fam_short[fam] += v.confidence
        else:
            if v.verdict == Verdict.LONG:    raw_long  += v.confidence
            elif v.verdict == Verdict.SHORT: raw_short += v.confidence
    mults = _REGIME_FAMILY_MULT.get(regime, {})
    long_w  = raw_long  + sum(
        min(fam_long[f],  _FAMILY_MAX[f]) * mults.get(f, 1.0) for f in _FAMILIES
    )
    short_w = raw_short + sum(
        min(fam_short[f], _FAMILY_MAX[f]) * mults.get(f, 1.0) for f in _FAMILIES
    )
    return long_w, short_w


def _loo_family_attribution(votes: list[Vote], base_score: float,
                             regime: str = "neutral") -> dict[str, float]:
    """Leave-one-family-out score delta per family (regime-aware)."""
    attrs = {}
    for fam in _FAMILIES:
        remaining = [v for v in votes if _AGENT_FAMILY.get(v.agent) != fam]
        lw, sw = _capped_weights(remaining, regime)
        tw = lw + sw
        s_without = (lw - sw) / tw if tw > 0 else 0.0
        attrs[fam] = round(base_score - s_without, 4)
    return attrs


def _bootstrap_ci(votes: list[Vote], regime: str = "neutral",
                  n_iter: int = 1000) -> tuple[float, float]:
    """Bootstrap 90% CI on score by resampling votes with replacement (regime-aware)."""
    if not votes:
        return 0.0, 0.0
    n = len(votes)
    rng = np.random.default_rng(42)
    scores = []
    for _ in range(n_iter):
        sample = [votes[i] for i in rng.integers(0, n, size=n)]
        lw, sw = _capped_weights(sample, regime)
        tw = lw + sw
        scores.append((lw - sw) / tw if tw > 0 else 0.0)
    scores.sort()
    return round(scores[int(0.05 * n_iter)], 4), round(scores[int(0.95 * n_iter)], 4)


def _effective_n(votes: list[Vote]) -> float:
    """Inverse Herfindahl over capped family weight shares + an 'other' bucket.
    Returns 1.0 (one family dominates) → ~5-6 (fully spread)."""
    fam_w: dict[str, float] = {f: 0.0 for f in _FAMILIES}
    other = 0.0
    for v in votes:
        if v.verdict not in (Verdict.LONG, Verdict.SHORT):
            continue
        w = v.confidence
        fam = _AGENT_FAMILY.get(v.agent)
        if fam:
            fam_w[fam] = min(fam_w[fam] + w, _FAMILY_MAX[fam])
        else:
            other += w
    total = sum(fam_w.values()) + other
    if total <= 0:
        return 0.0
    shares = [w / total for w in fam_w.values()] + [other / total]
    return round(1.0 / sum(p * p for p in shares if p > 0), 2)


def _family_dominant(votes: list[Vote], fam: str) -> str:
    """Return 'L', 'S', or 'N' (neutral/mixed) for a family's dominant direction.
    Uses raw (unscaled) votes so combo reflects agent signal content, not regime distortion."""
    fv = [v for v in votes if _AGENT_FAMILY.get(v.agent) == fam]
    if not fv:
        return "N"
    lc = sum(v.confidence for v in fv if v.verdict == Verdict.LONG)
    sc = sum(v.confidence for v in fv if v.verdict == Verdict.SHORT)
    if lc > sc * 1.3:
        return "L"
    if sc > lc * 1.3:
        return "S"
    return "N"


def _combo_string(votes: list[Vote]) -> str:
    """ma_trend + breakout + squeeze + momentum_osc + weekly_structure dominant directions."""
    return "".join(_family_dominant(votes, f)
                   for f in ("ma_trend", "breakout", "squeeze", "momentum_osc",
                              "weekly_structure"))


# ─────────────────────────────────────────────────────────────────────────────
# LLM meta-analyst
#
# A lightweight, advisory layer on top of the rule-based card. It reasons about
# things the deterministic system structurally cannot: cross-family COHERENCE,
# vote-source INDEPENDENCE (same-data agents double-counting), and which agent
# notes actually matter. It NEVER touches the score or action_label — its output
# is carried in separate advisory fields (meta_note, meta_adjustment).
#
# Design constraints honoured here:
#   • Model: claude-haiku-4-5 (settings.meta_analyst_model)
#   • Input < 500 tokens (compact JSON; ≤6 distilled notes, family L/S/N summary)
#   • < 2s wall time (hard timeout in settings.meta_analyst_timeout_s)
#   • 60-min cache keyed on (combo, regime, score-bucket, action_label)
#   • Graceful degradation: any failure → (0.5, 0.0, "")
# ─────────────────────────────────────────────────────────────────────────────

_META_NEUTRAL: tuple[float, float, str] = (0.5, 0.0, "")

# Module-level cache: key -> (timestamp, (coherence, adjustment, note)).
_META_CACHE: dict[tuple, tuple[float, tuple[float, float, str]]] = {}
_META_CACHE_TTL_S = 60 * 60  # 60 minutes

_META_SYSTEM = (
    "You are a meta-analyst auditing a rule-based stock trading signal. The "
    "rule-based verdict is already decided; do NOT re-derive it. Your job is to "
    "judge whether the signals COHERE, whether the confirming votes are "
    "INDEPENDENT (not the same indicator counted several times), and to name the "
    "single biggest risk the rules may have missed. "
    "Return ONLY minified JSON: "
    '{"coherence_score":<0..1>,"risk_note":"<=1 sentence","confidence_adjustment":<-0.2..0.2>}. '
    "coherence_score: 1=all families tell one story, 0=they contradict. "
    "confidence_adjustment: positive if the picture is cleaner than the score "
    "implies, negative if it is shakier (e.g. trend up but weekly structure "
    "bearish, or confirmations all from one data source). Be conservative; use "
    "0.0 when unsure."
)


def _meta_cache_key(combo: str, regime: str, score: float, action_label: str) -> tuple:
    """Bucket score to 0.05 so near-identical signals share a cached answer."""
    return (combo, regime, round(score * 20) / 20, action_label)


def _distill_notes(votes: list[Vote], verdict: Verdict, limit: int = 6) -> list[dict]:
    """Pick the most informative agent notes to keep the prompt under budget.

    Prioritises: actionable (LONG/SHORT) votes, then highest confidence, then
    notes that carry content (non-empty, not pure boilerplate). One note per
    agent, truncated, so the LLM sees signal not noise."""
    scored: list[tuple[float, dict]] = []
    for v in votes:
        if v.verdict == Verdict.WAIT or not v.note:
            continue
        # rank: agreeing votes first, then by confidence
        agree_bonus = 1.0 if v.verdict == verdict else 0.0
        rank = agree_bonus + min(v.confidence, 2.0)
        scored.append((rank, {
            "agent": v.agent,
            "dir": v.verdict.value[0],          # L / S
            "conf": round(float(v.confidence), 2),
            "fam": _AGENT_FAMILY.get(v.agent, v.family or "other"),
            "note": v.note[:80],
        }))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [d for _, d in scored[:limit]]


def _build_meta_payload(
    votes: list[Vote], regime: str, score: float, combo: str, action_label: str,
) -> dict:
    """Compact structured summary (< 500 tokens) for the meta-analyst."""
    fam_dirs = {f: _family_dominant(votes, f) for f in _FAMILIES}
    return {
        "regime": regime,
        "rule_verdict": action_label,
        "score": round(float(score), 3),          # signed conviction, -1..1
        "family_directions": fam_dirs,            # L/S/N per capped family
        "combo": combo,                           # ma+break+sqz+mosc+weekly
        "n_long": sum(1 for v in votes if v.verdict == Verdict.LONG),
        "n_short": sum(1 for v in votes if v.verdict == Verdict.SHORT),
        "key_notes": _distill_notes(
            votes, Verdict.LONG if score >= 0 else Verdict.SHORT
        ),
    }


def _parse_meta_response(text: str) -> tuple[float, float, str]:
    """Parse + clamp the model's JSON. Any malformation → neutral."""
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        data = json.loads(text[start:end])
        coherence = float(data.get("coherence_score", 0.5))
        adjustment = float(data.get("confidence_adjustment", 0.0))
        note = str(data.get("risk_note", "") or "")
        coherence = max(0.0, min(1.0, coherence))
        adjustment = max(-0.2, min(0.2, adjustment))
        return coherence, adjustment, note[:160]
    except Exception:
        return _META_NEUTRAL


def _meta_analyst(
    votes: list[Vote], regime: str, score: float, combo: str, action_label: str,
) -> tuple[float, float, str]:
    """Advisory LLM coherence check. Returns (coherence_score, confidence_adjustment, risk_note).

    Never raises and never modifies the rule-based verdict. Degrades to
    (0.5, 0.0, "") if disabled, un-keyed, or the call fails/times out.
    """
    if not settings.meta_analyst_enabled or not settings.anthropic_api_key:
        return _META_NEUTRAL

    # WAIT/AVOID cards carry no tradeable thesis to audit — skip the spend.
    if action_label in ("WAIT", "AVOID"):
        return _META_NEUTRAL

    key = _meta_cache_key(combo, regime, score, action_label)
    cached = _META_CACHE.get(key)
    now = time.time()
    if cached is not None and now - cached[0] < _META_CACHE_TTL_S:
        return cached[1]

    try:
        import anthropic
        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.meta_analyst_timeout_s,
            max_retries=0,   # one shot — we have a 2s budget, not time to retry
        )
        payload = _build_meta_payload(votes, regime, score, combo, action_label)
        resp = client.messages.create(
            model=settings.meta_analyst_model,
            max_tokens=160,
            system=_META_SYSTEM,
            messages=[{"role": "user", "content": json.dumps(payload, default=str)}],
        )
        text = "".join(b.text for b in resp.content if hasattr(b, "text"))
        result = _parse_meta_response(text)
    except Exception:
        result = _META_NEUTRAL

    # Cache even neutral results so a transient failure doesn't hammer the API.
    _META_CACHE[key] = (now, result)
    return result


def _classify_action(
    verdict: Verdict, score: float, regime: str, combo: str,
    n_eff: float, inflation_gap: float, adx: float | None,
) -> tuple[str, str]:
    """Return (trade_style, action_label).

    action_label tiers:
      PRIME_LONG     — highest-expectancy setup (STRONG_COMBO, neutral/ranging/trending_late)
      STANDARD_LONG  — solid BULLISH_SETUP not meeting PRIME criteria
      WATCH          — long signal but weak/extended setup
      AVOID          — short signal or gap-down continuation
      WAIT           — no actionable signal
    """
    if verdict == Verdict.WAIT:
        return "NONE", "WAIT"
    if verdict == Verdict.SHORT or regime == "gap_down_continuation":
        return "NONE", "AVOID"

    ma_dir = combo[0] if len(combo) >= 4 else "N"
    br_dir = combo[1] if len(combo) >= 4 else "N"
    sq_dir = combo[2] if len(combo) >= 4 else "N"
    mo_dir = combo[3] if len(combo) >= 4 else "N"
    wk_dir = combo[4] if len(combo) >= 5 else "N"

    # Extension veto: oscillators confirming LONG in an active trend = price already extended.
    # Does NOT apply to trending_late: when ADX is falling, oscillator overbought can mean
    # a healthy final push rather than exhaustion. WEAK_COMBOS (LNNL, LLNL, LLLL) protect
    # against the genuinely dangerous overbought-in-weakening-trend patterns.
    if ma_dir == "L" and mo_dir == "L" and regime == "trending":
        return "NONE", "WATCH"

    # Oscillator-divergence score adjustment (affects tier logic only, not raw score)
    # trending_late: ADX is falling so overbought oscillators don't signal extension;
    # we already exempt trending_late from the extension veto above for the same reason.
    adj = score
    if ma_dir == "L" and mo_dir == "S":
        adj += 0.08   # oversold oscillators in uptrend = pullback entry point
    elif ma_dir == "L" and mo_dir == "L" and regime != "trending_late":
        adj -= 0.05   # extension penalty (not applied in weakening-trend regime)

    # Weak combo veto — match against first 4 chars only (family combos are 4-char patterns)
    if combo[:4] in _WEAK_COMBOS:
        return "MIXED", "WATCH"

    # Trade style
    _trend_regimes = ("trending", "trending_late", "neutral")
    if sq_dir == "L" and br_dir == "L" and regime in _trend_regimes:
        trade_style = "BREAKOUT"
    elif ma_dir == "L" and mo_dir == "S" and regime in _trend_regimes:
        trade_style = "MOMENTUM"
    elif regime in _trend_regimes and ma_dir == "L":
        trade_style = "SWING"
    elif regime == "ranging" and mo_dir == "L":
        trade_style = "MEAN_REVERT"
    else:
        trade_style = "MIXED"

    # Tier assignment. Combo[:4] = 4-char daily family pattern; combo[4] = weekly direction.
    # trending_late qualifies for PRIME_LONG — oscillators are more reliable when ADX is declining.
    # In ranging, weekly=L (bullish weekly) conflicts with ranging regime — the stock is
    # rangebound but weekly thinks it's trending up, creating directional uncertainty.
    # PRIME_LONG in ranging requires weekly=S or N for confirmation quality.
    is_prime = (
        combo[:4] in _STRONG_COMBOS
        and adj >= 0.40
        and 2.0 <= n_eff <= 3.0
        and regime in ("neutral", "ranging", "trending_late")
        and not (regime == "ranging" and wk_dir == "L")
    )
    is_standard = (
        adj >= 0.30
        and n_eff > 1.4
        and inflation_gap < 0.15
        and regime in _trend_regimes
        and combo[:4] not in _WEAK_COMBOS
    )

    if is_prime:
        return trade_style, "PRIME_LONG"
    if is_standard:
        return trade_style, "STANDARD_LONG"
    return trade_style, "WATCH"


def _family_vote_counts(votes: list[Vote]) -> dict[str, dict]:
    """Per cap-family vote breakdown for dashboard display.
    Includes an 'other' bucket for uncapped agents."""
    result: dict[str, dict] = {}
    other_l = other_s = other_w = 0
    for v in votes:
        fam = _AGENT_FAMILY.get(v.agent)
        if fam:
            if fam not in result:
                result[fam] = {'long': 0, 'short': 0, 'wait': 0}
            result[fam][v.verdict.value.lower()] += 1
        else:
            if v.verdict == Verdict.LONG:
                other_l += 1
            elif v.verdict == Verdict.SHORT:
                other_s += 1
            else:
                other_w += 1
    result['other'] = {'long': other_l, 'short': other_s, 'wait': other_w}
    return result


@dataclass
class ActionCard:
    symbol: str
    verdict: Verdict
    score: float                    # -1..+1, sign = direction, |x| = conviction
    high_conviction: bool           # >= 75% indicator agreement
    entry: float
    stop: float
    target: float
    risk_reward: float
    long_votes: int
    short_votes: int
    wait_votes: int
    agreement_pct: float
    ret_1d: float = 0.0
    ret_5d: float = 0.0
    ret_20d: float = 0.0
    is_extended: bool = False
    entry_quality: str = "clean"
    stop_anchor: str = ""
    score_ci_lo: float = 0.0         # bootstrap 5th-percentile score
    score_ci_hi: float = 0.0         # bootstrap 95th-percentile score
    inflation_gap: float = 0.0       # agreement_pct/100 - weight_conviction; >0.15 = correlated inflation
    family_attribution: dict = field(default_factory=dict)  # LOO score delta per family
    family_votes: dict = field(default_factory=dict)         # per cap-family vote counts for bars
    ticker_regime: str = "neutral"   # gap_down_continuation | trending | ranging | neutral
    n_eff: float = 0.0               # inverse Herfindahl over family weight shares
    high_vol_regime: bool = False    # 50d realized vol > 252d realized vol
    combo: str = "NNNNN"             # family dominant directions: ma+break+squeeze+mosc+weekly
    trade_style: str = "NONE"        # MOMENTUM | SWING | BREAKOUT | MEAN_REVERT | MIXED | NONE
    action_label: str = "WAIT"       # PRIME_LONG | BREAKOUT_LONG | STANDARD_LONG | WATCH | AVOID | WAIT
    sector: str = ""                  # yfinance sector for display; empty if unknown
    adx_value: float | None = None    # current ADX-14 value, None if unavailable
    adx_slope: str = ""               # 'rising' | 'falling' | 'flat' | ''
    # ── LLM meta-analyst (advisory only; does NOT feed score or action_label) ──
    meta_coherence: float = 0.5      # 0..1 — do the signals tell one story? 0.5 = unknown/neutral
    meta_adjustment: float = 0.0     # -0.2..+0.2 — suggested up/down-weight of action_label conviction
    meta_note: str = ""              # one-sentence risk the rule-based system may have missed
    votes: List[Vote] = field(default_factory=list)
    agreed: List[str] = field(default_factory=list)
    dissented: List[str] = field(default_factory=list)
    notes: str = ""

    def to_dict(self) -> dict:
        d = asdict(self)
        d["verdict"] = self.verdict.value
        d["votes"] = [
            {"agent": v.agent, "verdict": v.verdict.value, "confidence": v.confidence, "note": v.note, "family": v.family}
            for v in self.votes
        ]
        return d


def _find_level_for_stop(df: pd.DataFrame, last: float, atr: float, direction: str) -> tuple[float, str] | None:
    """Nearest technical level to anchor a stop. Returns (level, name) or None."""
    candidates: list[tuple[float, str]] = []

    def _col(name: str) -> float | None:
        if name not in df.columns:
            return None
        v = float(df[name].iloc[-1])
        return None if np.isnan(v) else v

    if direction == "long":
        if len(df) >= 15:
            swing_lo = float(df["low"].iloc[-15:-1].min())
            if swing_lo < last:
                candidates.append((swing_lo, "swing_low"))
        for col in ("ema_50", "ema_200", "sma_50", "sma_200"):
            v = _col(col)
            if v is not None and v < last:
                candidates.append((v, col))
        st, st_dir = _col("supertrend"), _col("supertrend_dir")
        if st is not None and st_dir is not None and st_dir > 0 and st < last:
            candidates.append((st, "supertrend"))
        psar = _col("psar")
        if psar is not None and psar < last:
            candidates.append((psar, "psar"))
        valid = [(c, n) for c, n in candidates if c < last - 0.3 * atr]
        return max(valid, key=lambda x: x[0]) if valid else None

    else:  # short
        if len(df) >= 15:
            swing_hi = float(df["high"].iloc[-15:-1].max())
            if swing_hi > last:
                candidates.append((swing_hi, "swing_high"))
        for col in ("ema_50", "ema_200", "sma_50", "sma_200"):
            v = _col(col)
            if v is not None and v > last:
                candidates.append((v, col))
        st, st_dir = _col("supertrend"), _col("supertrend_dir")
        if st is not None and st_dir is not None and st_dir < 0 and st > last:
            candidates.append((st, "supertrend"))
        psar = _col("psar")
        if psar is not None and psar > last:
            candidates.append((psar, "psar"))
        valid = [(c, n) for c, n in candidates if c > last + 0.3 * atr]
        return min(valid, key=lambda x: x[0]) if valid else None


def _find_level_for_target(df: pd.DataFrame, last: float, risk: float, direction: str) -> float | None:
    """Nearest technical resistance/support for target, requiring R:R >= 1.5."""
    candidates: list[float] = []

    def _col(name: str) -> float | None:
        if name not in df.columns:
            return None
        v = float(df[name].iloc[-1])
        return None if np.isnan(v) else v

    if direction == "long":
        don_up = _col("donchian_up")
        if don_up is not None and don_up > last:
            candidates.append(don_up)
        bbu = _col("bbu_20")
        if bbu is not None and bbu > last:
            candidates.append(bbu)
        if len(df) >= 20:
            swing_hi = float(df["high"].iloc[-20:-1].max())
            if swing_hi > last:
                candidates.append(swing_hi)
        valid = [c for c in candidates if c >= last + 1.5 * risk]
        return min(valid) if valid else None

    else:  # short
        don_lo = _col("donchian_low")
        if don_lo is not None and don_lo < last:
            candidates.append(don_lo)
        bbl = _col("bbl_20")
        if bbl is not None and bbl < last:
            candidates.append(bbl)
        if len(df) >= 20:
            swing_lo = float(df["low"].iloc[-20:-1].min())
            if swing_lo < last:
                candidates.append(swing_lo)
        valid = [c for c in candidates if c <= last - 1.5 * risk]
        return max(valid) if valid else None


def _entry_stop_target(
    df: pd.DataFrame,
    verdict: Verdict,
    is_extended: bool = False,
    agreement: float = 0.5,
    score: float = 0.0,
) -> tuple[float, float, float, float, str]:
    """Adaptive entry/stop/target anchored to technical levels, scaled by conviction."""
    last = float(df["close"].iloc[-1])
    atr = float(df["atr_14"].iloc[-1]) if "atr_14" in df.columns else last * 0.015
    if np.isnan(atr) or atr <= 0:
        atr = last * 0.015
    base_mult = 2.0 if is_extended else 1.5

    if verdict == Verdict.LONG:
        entry = last
        result = _find_level_for_stop(df, last, atr, "long")
        if result is not None:
            tech_stop, anchor = result
            if agreement >= 0.75:
                stop = round(tech_stop * 0.998, 2)
                stop_anchor = anchor
            elif agreement >= 0.60:
                stop = round(min(tech_stop - 0.2 * atr, last - base_mult * atr), 2)
                stop_anchor = anchor + "-buf"
            else:
                stop = round(last - base_mult * atr, 2)
                stop_anchor = "ATR"
        else:
            stop = round(last - base_mult * atr, 2)
            stop_anchor = "ATR"
        risk = last - stop
        rr_mult = 2.0 + min(abs(score), 1.0)
        tech_target = _find_level_for_target(df, last, risk, "long")
        target = round(tech_target if tech_target is not None else last + rr_mult * risk, 2)

    elif verdict == Verdict.SHORT:
        entry = last
        result = _find_level_for_stop(df, last, atr, "short")
        if result is not None:
            tech_stop, anchor = result
            if agreement >= 0.75:
                stop = round(tech_stop * 1.002, 2)
                stop_anchor = anchor
            elif agreement >= 0.60:
                stop = round(max(tech_stop + 0.2 * atr, last + base_mult * atr), 2)
                stop_anchor = anchor + "-buf"
            else:
                stop = round(last + base_mult * atr, 2)
                stop_anchor = "ATR"
        else:
            stop = round(last + base_mult * atr, 2)
            stop_anchor = "ATR"
        risk = stop - last
        rr_mult = 2.0 + min(abs(score), 1.0)
        tech_target = _find_level_for_target(df, last, risk, "short")
        target = round(tech_target if tech_target is not None else last - rr_mult * risk, 2)

    else:
        return last, last, last, 0.0, ""

    rr = abs(target - entry) / max(abs(entry - stop), 1e-9)
    return float(entry), float(stop), float(target), float(rr), stop_anchor


def build_action_card(symbol: str, df: pd.DataFrame) -> ActionCard:
    df_ind = compute_all(df) if "rsi_14" not in df.columns else df

    ret_1d  = float(df["close"].pct_change(1).iloc[-1])  if len(df) >= 2  else 0.0
    ret_5d  = float(df["close"].pct_change(5).iloc[-1])  if len(df) >= 6  else 0.0
    ret_20d = float(df["close"].pct_change(20).iloc[-1]) if len(df) >= 21 else 0.0
    is_extended = abs(ret_1d) > 0.05 or abs(ret_5d) > 0.15

    df_ind.attrs['symbol'] = symbol.upper()
    df_ind.attrs['ticker'] = symbol.upper()

    ticker_regime = _detect_ticker_regime(df_ind)

    votes = run_all(df_ind)
    # votes are kept RAW (unscaled) throughout — regime scaling is applied post-cap
    # inside _capped_weights so amplification isn't swallowed by the cap ceiling.

    long_w, short_w = _capped_weights(votes, ticker_regime)
    total_w = long_w + short_w

    long_n = sum(1 for v in votes if v.verdict == Verdict.LONG)
    short_n = sum(1 for v in votes if v.verdict == Verdict.SHORT)
    wait_n  = sum(1 for v in votes if v.verdict == Verdict.WAIT)
    actionable = long_n + short_n
    agreement  = (max(long_n, short_n) / actionable) if actionable else 0.0

    if total_w == 0:
        verdict = Verdict.WAIT
        score   = 0.0
    else:
        net = (long_w - short_w) / total_w  # -1..+1
        if net > 0.15:
            verdict = Verdict.LONG
        elif net < -0.15:
            verdict = Verdict.SHORT
        else:
            verdict = Verdict.WAIT
        score = float(net)

    # Inflation gap: vote-count agreement vs weight-based conviction.
    weight_conviction = (1.0 + abs(score)) / 2.0
    inflation_gap = round(agreement - weight_conviction, 4)

    score_ci_lo, score_ci_hi = _bootstrap_ci(votes, ticker_regime)
    family_attribution = _loo_family_attribution(votes, score, ticker_regime)
    family_votes_map   = _family_vote_counts(votes)
    n_eff = _effective_n(votes)

    # ADX for action classification
    try:
        _adx = float(df_ind["adx_14"].iloc[-1]) if "adx_14" in df_ind.columns else None
        if _adx is not None and pd.isna(_adx):
            _adx = None
    except Exception:
        _adx = None

    combo_str  = _combo_string(votes)
    trade_style, action_label = _classify_action(
        verdict, score, ticker_regime, combo_str, n_eff, inflation_gap, _adx
    )

    # Risk filter override: high-confidence WAIT from earnings/event agents forces WAIT
    for v in votes:
        if v.verdict == Verdict.WAIT and v.confidence >= 1.5 and v.family == "risk_filter":
            action_label = "WAIT"
            trade_style = "NONE"
            break

    # High-vol regime: 50d annualised vol > 252d annualised vol.
    _ret = df["close"].pct_change().dropna()
    if len(_ret) >= 252:
        high_vol_regime = bool(_ret.iloc[-50:].std() > _ret.iloc[-252:].std())
    elif len(_ret) >= 50:
        high_vol_regime = bool(_ret.iloc[-50:].std() > _ret.std())
    else:
        high_vol_regime = False

    entry, stop, target, rr, stop_anchor = _entry_stop_target(df_ind, verdict, is_extended, agreement, score)
    high_conviction = agreement >= 0.75 and verdict != Verdict.WAIT

    agreed = [v.agent for v in votes if v.verdict == verdict and verdict != Verdict.WAIT]
    dissented = [v.agent for v in votes
                 if v.verdict != Verdict.WAIT and v.verdict != verdict]

    notes = ""
    if high_conviction:
        notes = "⚡ HIGH CONVICTION — ≥75% of actionable indicators agree."

    # Advisory LLM coherence pass. Runs only when meta_analyst_enabled + key set;
    # otherwise returns neutral instantly. Output is carried in separate fields and
    # deliberately does NOT modify verdict, score, or action_label above.
    meta_coherence, meta_adjustment, meta_note = _meta_analyst(
        votes, ticker_regime, score, combo_str, action_label
    )

    sector = _lookup_sector(symbol)
    adx_value, adx_slope = _adx_context(df_ind)

    return ActionCard(
        symbol=symbol.upper(),
        verdict=verdict,
        score=score,
        high_conviction=high_conviction,
        entry=entry,
        stop=stop,
        target=target,
        risk_reward=rr,
        long_votes=long_n,
        short_votes=short_n,
        wait_votes=wait_n,
        agreement_pct=agreement * 100,
        ret_1d=ret_1d,
        ret_5d=ret_5d,
        ret_20d=ret_20d,
        is_extended=is_extended,
        entry_quality="extended" if is_extended else "clean",
        stop_anchor=stop_anchor,
        score_ci_lo=score_ci_lo,
        score_ci_hi=score_ci_hi,
        inflation_gap=inflation_gap,
        family_attribution=family_attribution,
        family_votes=family_votes_map,
        ticker_regime=ticker_regime,
        n_eff=n_eff,
        high_vol_regime=high_vol_regime,
        combo=combo_str,
        trade_style=trade_style,
        action_label=action_label,
        sector=sector,
        adx_value=adx_value,
        adx_slope=adx_slope,
        meta_coherence=meta_coherence,
        meta_adjustment=meta_adjustment,
        meta_note=meta_note,
        votes=votes,
        agreed=agreed,
        dissented=dissented,
        notes=notes,
    )
