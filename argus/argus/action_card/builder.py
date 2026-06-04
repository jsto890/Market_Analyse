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


def _entry_stop_target(df: pd.DataFrame, verdict: Verdict, is_extended: bool = False) -> tuple[float, float, float, float]:
    """ATR-based entry/stop/target. RR target = 2.0."""
    last = float(df["close"].iloc[-1])
    atr = float(df["atr_14"].iloc[-1]) if "atr_14" in df.columns else last * 0.015
    if np.isnan(atr) or atr <= 0:
        atr = last * 0.015
    atr_mult_stop   = 2.0 if is_extended else 1.5
    atr_mult_target = 4.0 if is_extended else 3.0
    if verdict == Verdict.LONG:
        entry = last
        stop = round(last - atr_mult_stop * atr, 2)
        target = round(last + atr_mult_target * atr, 2)
    elif verdict == Verdict.SHORT:
        entry = last
        stop = round(last + atr_mult_stop * atr, 2)
        target = round(last - atr_mult_target * atr, 2)
    else:
        return last, last, last, 0.0
    rr = abs(target - entry) / max(abs(entry - stop), 1e-9)
    return float(entry), float(stop), float(target), float(rr)


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

    entry, stop, target, rr = _entry_stop_target(df_ind, verdict, is_extended)
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
        votes=votes,
        agreed=agreed,
        dissented=dissented,
        notes=notes,
    )
