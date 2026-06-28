"""Health monitor (design spec §7) — v1 ALERT-ONLY: computes five deterioration
signals into a severity-weighted composite health in [0,100] plus a tripped-flags
string. Pure (frames in, (int,str) out); drives NO trade decision. Weights are
frozen STARTING constants — Phase 3b fits them on forward outcomes across disjoint
OOS universes. H5 (catalyst) is injected (default off) until its event feed lands."""
import pandas as pd

from ..indicators.compute import _ema, _rsi, _roc, _atr, _sma

# Severity weights (Phase-3a starting values; Σ = 100 so all-tripped -> 0).
WEIGHTS = {"H1": 15, "H2": 25, "H3": 25, "H4": 15, "H5": 20}
_ORDER = ("H1", "H2", "H3", "H4", "H5")

# Signal thresholds (spec §7), frozen.
TREND_BREAK_ATR = 0.5      # H2: close below 50-EMA by >0.5*ATR
DISTRIB_LOOKBACK = 10      # H3: last 10 days
DISTRIB_MIN_DAYS = 3       # H3: >=3 high-volume down days
DISTRIB_VOL_MULT = 1.5     # H3: vol > 1.5x 20-day avg
RS_DECAY_WEEKS = 3         # H4: falls 3 consecutive weeks
RS_EXCESS_LB = 13          # H4: 13-week excess
MOM_ROC_WEEKS = 12         # H1: 12-week ROC
MOM_MA_WEEKS = 4           # H1: 4-week MA of the ROC
MOM_RSI_MAX = 50           # H1: RSI(14) < 50
MOM_CONSEC_DAYS = 2        # H1: for 2 consecutive days


def h1_momentum_rollover(daily: pd.DataFrame, wk: pd.DataFrame) -> bool:
    """12-week ROC crosses below its 4-week MA while daily RSI(14) < 50, for 2
    consecutive days. Weekly ROC supplies the trend; daily RSI confirms weakness."""
    if len(wk) < MOM_ROC_WEEKS + MOM_MA_WEEKS or len(daily) < 16:
        return False
    roc = _roc(wk["close"], MOM_ROC_WEEKS)
    roc_ma = _sma(roc, MOM_MA_WEEKS)
    roc_below = (roc < roc_ma).iloc[-1]                       # current weekly rollover
    rsi = _rsi(daily["close"], 14)
    rsi_weak = bool((rsi.iloc[-MOM_CONSEC_DAYS:] < MOM_RSI_MAX).all())
    return bool(roc_below and rsi_weak)


def h2_trend_break(daily: pd.DataFrame) -> bool:
    """Daily close below the 50-EMA by more than 0.5*ATR for 2 consecutive closes."""
    c, h, l = daily["close"], daily["high"], daily["low"]
    if len(daily) < 51:
        return False
    ema = _ema(c, 50)
    atr = _atr(h, l, c, 14)
    below = (ema - c) > (TREND_BREAK_ATR * atr)
    return bool(below.iloc[-1] and below.iloc[-2])


def h3_distribution(daily: pd.DataFrame) -> bool:
    """>=3 of the last 10 days are high-volume down days: close in the lower third
    of the day's range AND volume > 1.5x its trailing 20-day average."""
    if len(daily) < 21:
        return False
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    rng = (h - l).replace(0, pd.NA)
    lower_third = (c - l) / rng <= (1.0 / 3.0)
    down = c.diff() < 0
    vol_avg = _sma(v, 20)
    high_vol = v > (DISTRIB_VOL_MULT * vol_avg)
    flagged = (lower_third.fillna(False) & down & high_vol).iloc[-DISTRIB_LOOKBACK:]
    return bool(int(flagged.sum()) >= DISTRIB_MIN_DAYS)


def composite(flags: dict) -> tuple[int, str]:
    """Severity-weighted: 100 - sum of tripped weights, clamped to [0,100]; plus the
    comma-joined tripped IDs in fixed H1..H5 order ('' when none)."""
    penalty = sum(WEIGHTS[k] for k in _ORDER if flags.get(k))
    health_val = max(0, min(100, 100 - penalty))
    tripped = ",".join(k for k in _ORDER if flags.get(k))
    return health_val, tripped


def health(daily: pd.DataFrame, wk: pd.DataFrame, spy: pd.DataFrame,
           sector: pd.DataFrame | None = None, *, h5_flag: bool = False) -> tuple[int, str]:
    """Compute the alert-only composite for the bar at the end of `daily`. H1/H4 are
    completed in Task 3; here they read False so the module is testable end-to-end."""
    flags = {
        "H1": h1_momentum_rollover(daily, wk),
        "H2": h2_trend_break(daily),
        "H3": h3_distribution(daily),
        "H4": False,
        "H5": bool(h5_flag),
    }
    return composite(flags)
