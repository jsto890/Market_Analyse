"""Build the Action Card: synthesise all agent votes into one verdict
plus entry / stop / target / risk-reward."""
from __future__ import annotations

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
}

_FAMILY_MAX: dict[str, float] = {
    "ma_trend": 2.5,
    "breakout": 1.5,
    "squeeze": 1.0,
    "momentum_osc": 1.5,
}

_AGENT_FAMILY: dict[str, str] = {
    name: fam for fam, members in _FAMILIES.items() for name in members
}


def _capped_weights(votes: list[Vote]) -> tuple[float, float]:
    """Confidence-weighted long/short sums with per-family caps."""
    fam_long: dict[str, float] = {f: 0.0 for f in _FAMILIES}
    fam_short: dict[str, float] = {f: 0.0 for f in _FAMILIES}
    raw_long = 0.0
    raw_short = 0.0
    for v in votes:
        fam = _AGENT_FAMILY.get(v.agent)
        if fam:
            if v.verdict == Verdict.LONG:
                fam_long[fam] += v.confidence
            elif v.verdict == Verdict.SHORT:
                fam_short[fam] += v.confidence
        else:
            if v.verdict == Verdict.LONG:
                raw_long += v.confidence
            elif v.verdict == Verdict.SHORT:
                raw_short += v.confidence
    long_w = raw_long + sum(min(fam_long[f], _FAMILY_MAX[f]) for f in _FAMILIES)
    short_w = raw_short + sum(min(fam_short[f], _FAMILY_MAX[f]) for f in _FAMILIES)
    return long_w, short_w


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

    votes = run_all(df_ind)

    long_w, short_w = _capped_weights(votes)
    total_w = long_w + short_w

    long_n = sum(1 for v in votes if v.verdict == Verdict.LONG)
    short_n = sum(1 for v in votes if v.verdict == Verdict.SHORT)
    wait_n = sum(1 for v in votes if v.verdict == Verdict.WAIT)
    actionable = long_n + short_n
    agreement = (max(long_n, short_n) / actionable) if actionable else 0.0

    if total_w == 0:
        verdict = Verdict.WAIT
        score = 0.0
    else:
        net = (long_w - short_w) / total_w  # -1..+1
        if net > 0.15:
            verdict = Verdict.LONG
        elif net < -0.15:
            verdict = Verdict.SHORT
        else:
            verdict = Verdict.WAIT
        score = float(net)

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
        votes=votes,
        agreed=agreed,
        dissented=dissented,
        notes=notes,
    )
