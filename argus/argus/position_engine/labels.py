"""Forward max-adverse-excursion label (design spec §4, Phase 3b-2). PRE-REGISTERED:
horizon = 20 trading days, adverse threshold k = 1.5 ATR. For each in-position bar,
mae = drawdown from this close to the lowest forward low over the next `horizon` bars
(capped at series end), expressed in ATR(14) units. Pure: frame in, labels out. The
score never causes a trade — this only measures forward deterioration."""
import numpy as np
import pandas as pd

from ..indicators.compute import _atr

H_DEFAULT = 20
K_DEFAULT = 1.5


def forward_mae(daily: pd.DataFrame, *, horizon: int = H_DEFAULT, k: float = K_DEFAULT) -> pd.DataFrame:
    c = daily["close"].to_numpy(dtype=float)
    low = daily["low"].to_numpy(dtype=float)
    atr = _atr(daily["high"], daily["low"], daily["close"], 14).to_numpy(dtype=float)
    n = len(c)
    mae = np.full(n, np.nan)
    for t in range(n):
        end = min(t + horizon, n - 1)
        if end <= t or not np.isfinite(atr[t]) or atr[t] <= 0:
            continue
        fwd_low = np.min(low[t + 1:end + 1])
        mae[t] = max(0.0, (c[t] - fwd_low) / atr[t])
    out = pd.DataFrame(index=daily.index)
    out["fwd_mae"] = mae
    out["adverse"] = np.where(np.isnan(mae), np.nan, (mae >= k).astype(float))
    return out
