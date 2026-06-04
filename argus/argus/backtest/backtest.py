"""Vectorised historical backtest of the ensemble signal.

Walks the price series bar-by-bar; on each bar with sufficient history,
asks the ensemble for a verdict and translates it into a position. Long
when the ensemble says LONG, short when SHORT, flat when WAIT.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, List
import numpy as np
import pandas as pd

from ..agents import run_all
from ..agents.base import Verdict
from ..indicators import compute_all


@dataclass
class BacktestResult:
    symbol: str
    bars: int
    trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    cagr: float
    sharpe: float
    sortino: float
    max_drawdown: float
    final_equity: float
    equity_curve: List[float] = field(default_factory=list)
    trade_returns: List[float] = field(default_factory=list)


def _ensemble_verdict(df_window: pd.DataFrame) -> Verdict:
    votes = run_all(df_window)
    long_w = sum(v.confidence for v in votes if v.verdict == Verdict.LONG)
    short_w = sum(v.confidence for v in votes if v.verdict == Verdict.SHORT)
    total = long_w + short_w
    if total == 0:
        return Verdict.WAIT
    net = (long_w - short_w) / total
    if net > 0.15:
        return Verdict.LONG
    if net < -0.15:
        return Verdict.SHORT
    return Verdict.WAIT


def backtest_signal(
    symbol: str,
    df: pd.DataFrame,
    warmup: int = 200,
    sample_every: int = 5,  # only re-evaluate signal every N bars to avoid churn
) -> BacktestResult:
    df_full = compute_all(df) if "rsi_14" not in df.columns else df
    n = len(df_full)
    if n < warmup + 10:
        return BacktestResult(symbol, n, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.0, [], [])

    closes = df_full["close"].values
    pos = 0  # -1 / 0 / +1
    equity = 1.0
    curve = [1.0] * warmup
    trade_returns: List[float] = []
    entry_price = 0.0

    for i in range(warmup, n):
        if (i - warmup) % sample_every == 0:
            v = _ensemble_verdict(df_full.iloc[: i + 1])
            new_pos = 1 if v == Verdict.LONG else (-1 if v == Verdict.SHORT else 0)
            if new_pos != pos:
                if pos != 0:
                    ret = pos * (closes[i] / entry_price - 1)
                    trade_returns.append(float(ret))
                pos = new_pos
                entry_price = closes[i]
        # mark to market
        if pos != 0 and i > warmup:
            bar_ret = pos * (closes[i] / closes[i - 1] - 1)
            equity *= (1 + bar_ret)
        curve.append(equity)

    if pos != 0:
        ret = pos * (closes[-1] / entry_price - 1)
        trade_returns.append(float(ret))

    arr = np.array(trade_returns) if trade_returns else np.array([0.0])
    wins = arr[arr > 0]
    losses = arr[arr < 0]
    win_rate = float(len(wins) / len(arr)) if len(arr) else 0.0
    avg_win = float(wins.mean()) if len(wins) else 0.0
    avg_loss = float(losses.mean()) if len(losses) else 0.0
    pf = float(wins.sum() / abs(losses.sum())) if losses.sum() != 0 else float("inf")

    eq = np.array(curve)
    rets = np.diff(eq) / eq[:-1]
    rets = rets[~np.isnan(rets)]
    days = max(n / 252, 1)
    cagr = float(eq[-1] ** (1 / days) - 1) if eq[-1] > 0 else -1.0
    sharpe = float(np.sqrt(252) * rets.mean() / rets.std()) if rets.std() > 0 else 0.0
    downside = rets[rets < 0]
    sortino = float(np.sqrt(252) * rets.mean() / downside.std()) if downside.size and downside.std() > 0 else 0.0
    peak = np.maximum.accumulate(eq)
    dd = (eq - peak) / peak
    max_dd = float(dd.min())

    return BacktestResult(
        symbol=symbol.upper(),
        bars=n,
        trades=len(trade_returns),
        win_rate=win_rate,
        avg_win=avg_win,
        avg_loss=avg_loss,
        profit_factor=pf,
        cagr=cagr,
        sharpe=sharpe,
        sortino=sortino,
        max_drawdown=max_dd,
        final_equity=float(eq[-1]),
        equity_curve=[float(x) for x in eq],
        trade_returns=[float(x) for x in trade_returns],
    )
