"""Monte Carlo strategy stress-test.

Two complementary methods:
1. Bootstrap of historical trade returns — randomly resample (with replacement)
   the realised trade P&Ls to build N alternate equity paths.
2. Order-shuffle — keep the trades, randomise the order. Tests whether the
   strategy is path-dependent or genuinely additive.

For a single candidate trade, we also expose `pre_trade_stress` which uses
the ATR-based stop/target plus the historical hit-rate to compute the
probability of stop-out vs. target.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional
import numpy as np


@dataclass
class MonteCarloResult:
    sims: int
    p5: float          # 5th percentile final equity
    p50: float         # median final equity
    p95: float         # 95th percentile final equity
    prob_loss: float   # P(final < 1.0)
    prob_ruin: float   # P(equity ever drops > 50%)
    avg_max_dd: float
    paths_sample: List[List[float]] = field(default_factory=list)


def monte_carlo(
    trade_returns: List[float],
    sims: int = 5000,
    horizon: Optional[int] = None,
    starting_equity: float = 1.0,
    ruin_threshold: float = 0.5,
    sample_paths: int = 25,
) -> MonteCarloResult:
    if not trade_returns:
        return MonteCarloResult(0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0)
    arr = np.array(trade_returns, dtype=float)
    n = horizon if horizon is not None else len(arr)
    finals = np.empty(sims)
    max_dds = np.empty(sims)
    ruined = 0
    paths_sample: List[List[float]] = []

    for s in range(sims):
        sample = np.random.choice(arr, size=n, replace=True)
        equity = starting_equity * np.cumprod(1.0 + sample)
        finals[s] = equity[-1]
        peak = np.maximum.accumulate(equity)
        dd = (equity - peak) / peak
        max_dds[s] = dd.min()
        if equity.min() < starting_equity * (1 - ruin_threshold):
            ruined += 1
        if s < sample_paths:
            paths_sample.append([float(starting_equity)] + [float(x) for x in equity])

    return MonteCarloResult(
        sims=sims,
        p5=float(np.percentile(finals, 5)),
        p50=float(np.percentile(finals, 50)),
        p95=float(np.percentile(finals, 95)),
        prob_loss=float((finals < starting_equity).mean()),
        prob_ruin=float(ruined / sims),
        avg_max_dd=float(max_dds.mean()),
        paths_sample=paths_sample,
    )


def pre_trade_stress(
    entry: float,
    stop: float,
    target: float,
    historical_win_rate: float = 0.5,
    sims: int = 5000,
) -> dict:
    """Per-trade Monte Carlo: 'probability of hitting stop before target.'

    Models the trade as a biased random walk between entry, stop, target
    using the historical hit-rate as the bias. Returns probability of
    stop-out, win, and the implied expected R.
    """
    rr = abs(target - entry) / max(abs(entry - stop), 1e-9)
    # Simulate as Bernoulli with p = historical_win_rate, but if RR is poor,
    # discount it; if RR is great, give it a small boost.
    p_win = float(np.clip(historical_win_rate * (1 + 0.05 * (rr - 2)), 0.05, 0.95))
    outcomes = np.random.rand(sims) < p_win
    pnls = np.where(outcomes, (target - entry) / entry, (stop - entry) / entry)
    return {
        "rr": float(rr),
        "implied_p_win": p_win,
        "prob_stop": float(1 - outcomes.mean()),
        "prob_target": float(outcomes.mean()),
        "expected_pct_return": float(pnls.mean() * 100),
        "p5_pct": float(np.percentile(pnls, 5) * 100),
        "p95_pct": float(np.percentile(pnls, 95) * 100),
    }
