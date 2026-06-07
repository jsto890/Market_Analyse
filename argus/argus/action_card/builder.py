"""Build the Action Card: synthesise all agent votes into one verdict
plus entry / stop / target / risk-reward."""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, asdict
from typing import List
import numpy as np
import pandas as pd

from ..agents.base import Vote, Verdict
from ..agents import run_all
from ..indicators import compute_all

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
        "momentum_osc":   0.3,   # oversold in a trend = continuation trap
        "weekly_structure": 1.0, # weekly trend most reliable in trending markets
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
_WEAK_COMBOS: frozenset[str] = frozenset({"LNNL", "LLNL"})
# LSNS/LNLL/LSNL: highest expectancy combos — "dip in uptrend" pattern.
_STRONG_COMBOS: frozenset[str] = frozenset({"LSNS", "LNLL", "LSNL"})


def _detect_ticker_regime(df: pd.DataFrame) -> str:
    """Classify per-ticker market regime from recent OHLCV + indicators."""
    try:
        adx = float(df['adx_14'].iloc[-1]) if 'adx_14' in df.columns else None
        if pd.isna(adx):
            adx = None
    except Exception:
        adx = None
    gap = float(df['open'].iloc[-1] / df['close'].iloc[-2] - 1) if len(df) > 1 else 0.0
    try:
        ema50 = float(df['ema_50'].iloc[-1]) if 'ema_50' in df.columns else None
        if pd.isna(ema50):
            ema50 = None
    except Exception:
        ema50 = None
    last = float(df['close'].iloc[-1])
    if gap < -0.02 and ema50 is not None and last < ema50:
        return 'gap_down_continuation'
    if adx is not None and adx > 25:
        return 'trending'
    if adx is not None and adx < 20:
        return 'ranging'
    return 'neutral'


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
    """ma_trend + breakout + squeeze + momentum_osc dominant directions."""
    return "".join(_family_dominant(votes, f)
                   for f in ("ma_trend", "breakout", "squeeze", "momentum_osc"))


def _classify_action(
    verdict: Verdict, score: float, regime: str, combo: str,
    n_eff: float, inflation_gap: float, adx: float | None,
) -> tuple[str, str]:
    """Return (trade_style, action_label).

    action_label tiers:
      PRIME_LONG     — highest-expectancy setup (dip-in-uptrend, neutral/ranging regime)
      BREAKOUT_LONG  — squeeze breakout in trending regime
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
    mo_dir = combo[3] if len(combo) >= 4 else "N"
    sq_dir = combo[2] if len(combo) >= 4 else "N"
    br_dir = combo[1] if len(combo) >= 4 else "N"

    # Extension veto: oscillators confirming LONG while trend is already up in ADX > 25
    if (ma_dir == "L" and mo_dir == "L" and adx is not None and adx > 25
            and regime == "trending"):
        return "NONE", "WATCH"

    # Oscillator-divergence score adjustment (affects tier logic only, not raw score)
    adj = score
    if ma_dir == "L" and mo_dir == "S":
        adj += 0.08   # dip in uptrend: overbought oscillators = momentum continuation
    elif ma_dir == "L" and mo_dir == "L":
        adj -= 0.05   # extended entry penalty

    # Weak combo veto
    if combo in _WEAK_COMBOS:
        return "MIXED", "WATCH"

    # Trade style
    if sq_dir == "L" and br_dir == "L" and regime in ("trending", "neutral"):
        trade_style = "BREAKOUT"
    elif ma_dir == "L" and mo_dir == "S" and regime in ("trending", "neutral"):
        trade_style = "MOMENTUM"
    elif regime in ("trending", "neutral") and ma_dir == "L":
        trade_style = "SWING"
    elif regime == "ranging" and mo_dir == "L":
        trade_style = "MEAN_REVERT"
    else:
        trade_style = "MIXED"

    # Tier assignment
    is_prime = (
        combo in _STRONG_COMBOS
        and adj >= 0.40
        and 1.4 <= n_eff <= 2.5
        and regime in ("neutral", "ranging")
    )
    is_breakout = (
        trade_style == "BREAKOUT"
        and adj >= 0.35
        and regime in ("trending", "neutral")
    )
    is_standard = (
        adj >= 0.30
        and n_eff > 1.4
        and inflation_gap < 0.15
        and regime in ("trending", "neutral")
        and combo not in _WEAK_COMBOS
    )

    if is_prime:
        return trade_style, "PRIME_LONG"
    if is_breakout:
        return trade_style, "BREAKOUT_LONG"
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
    combo: str = "NNNN"              # family dominant directions: ma+break+squeeze+mosc
    trade_style: str = "NONE"        # MOMENTUM | SWING | BREAKOUT | MEAN_REVERT | MIXED | NONE
    action_label: str = "WAIT"       # PRIME_LONG | BREAKOUT_LONG | STANDARD_LONG | WATCH | AVOID | WAIT
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
        votes=votes,
        agreed=agreed,
        dissented=dissented,
        notes=notes,
    )
