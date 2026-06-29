"""Early-exit overlays for the exit premise-check (design spec §Components). Each rule is a
pure path-functional: given the held OHLC slice (with precomputed `atr14`, `donch_low20`,
`health_flags` columns), entry price and risk r, it returns the 0-based offset of the bar
whose close triggers an exit, or None. `realized_r` re-prices at the T+1 open. Rules only
exit at or before the structural exit (the path ends at it), so an overlay can only differ
from hold by exiting EARLIER. PRE-REGISTERED fixed params — do not tune."""
import numpy as np
import pandas as pd


def giveback_trail(path, entry_px, r, *, activate=1.5, keep=0.60):
    high = path["high"].to_numpy(float)
    close = path["close"].to_numpy(float)
    peak = -np.inf
    for t in range(len(path)):
        peak = max(peak, (high[t] - entry_px) / r)
        if peak >= activate and (close[t] - entry_px) / r <= keep * peak:
            return t
    return None


def chandelier_high(path, entry_px, r, *, k=3.0):
    high = path["high"].to_numpy(float)
    close = path["close"].to_numpy(float)
    atr = path["atr14"].to_numpy(float)
    hh = -np.inf
    for t in range(len(path)):
        hh = max(hh, high[t])
        if np.isfinite(atr[t]) and close[t] < hh - k * atr[t]:
            return t
    return None


def donchian_break(path, entry_px, r, *, n=20):
    close = path["close"].to_numpy(float)
    dl = path["donch_low20"].to_numpy(float)
    for t in range(len(path)):
        if np.isfinite(dl[t]) and close[t] < dl[t]:
            return t
    return None


def no_progress(path, entry_px, r, *, m=8):
    high = path["high"].to_numpy(float)
    hh, last_new = high[0], 0
    for t in range(len(path)):
        if high[t] > hh:
            hh, last_new = high[t], t
        if t - last_new >= m:
            return t
    return None


def profit_target_3r(path, entry_px, r, *, mult=3.0):
    close = path["close"].to_numpy(float)
    for t in range(len(path)):
        if close[t] >= entry_px + mult * r:
            return t
    return None


def health_exit(path, entry_px, r):
    flags = path["health_flags"].tolist()
    for t in range(len(path)):
        if flags[t] and str(flags[t]).strip():
            return t
    return None


def realized_r(path, entry_px, r, offset, baseline_r) -> float:
    """R at a T+1-open fill; baseline_r if the rule never fired or fired on the last held bar."""
    if offset is None or offset + 1 >= len(path) or r <= 0:
        return float(baseline_r)
    fill = float(path["open"].iloc[offset + 1])
    return (fill - entry_px) / r


RULES = {"giveback_trail": giveback_trail, "chandelier_high": chandelier_high,
         "donchian_break": donchian_break, "no_progress": no_progress,
         "profit_target_3r": profit_target_3r}
CONTROL = {"health_exit": health_exit}
