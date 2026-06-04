"""Very simplified Elliott Wave labeller.

Real Elliott Wave is famously subjective; we collapse it to a pivot-based
heuristic that estimates whether price is in an impulsive (1-2-3-4-5) or
corrective (A-B-C) phase based on the alternation of recent swing highs
and lows.
"""
from __future__ import annotations
import pandas as pd
import numpy as np
from scipy.signal import find_peaks  # type: ignore


def label_phase(df: pd.DataFrame) -> dict:
    if len(df) < 60:
        return {"phase": "UNCLEAR", "wave": None, "swings": []}
    c = df["close"].values
    highs, _ = find_peaks(c, distance=5)
    lows, _ = find_peaks(-c, distance=5)
    swings = sorted(
        [(i, "H", float(c[i])) for i in highs] + [(i, "L", float(c[i])) for i in lows]
    )
    if len(swings) < 5:
        return {"phase": "UNCLEAR", "wave": None, "swings": []}
    last5 = swings[-5:]
    pattern = "".join(s[1] for s in last5)
    # Up impulse: L H L H L H ... (alternating, higher highs/higher lows)
    closes = [s[2] for s in last5]
    up_impulse = closes[0] < closes[2] < closes[4] and closes[1] < closes[3]
    down_impulse = closes[0] > closes[2] > closes[4] and closes[1] > closes[3]
    if up_impulse:
        return {"phase": "IMPULSE_UP", "wave": "3-or-5", "swings": last5}
    if down_impulse:
        return {"phase": "IMPULSE_DOWN", "wave": "3-or-5", "swings": last5}
    return {"phase": "CORRECTIVE", "wave": "A-B-C", "swings": last5}
