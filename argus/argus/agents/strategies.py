"""The 45+ voting agents. Each is a pure function returning a Vote.

Many of these are intentionally short — Argus voting agents are largely
threshold checks on indicator values. The complex ones (SMC, Wyckoff,
Elliott, ICS) live in their own modules and are wrapped here.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Vote, Verdict
from ..indicators import compute_all
from ..indicators.smc import break_of_structure, order_block
from ..indicators.wyckoff import classify as wyckoff_phase
from ..indicators.elliott import label_phase as elliott_phase


# ---------------- helpers ----------------

def _last(s):
    try:
        return float(s.iloc[-1])
    except Exception:
        return np.nan


_REQUIRED_COLS = frozenset({"rsi_14", "macd", "atr_14", "ema_8", "obv", "ttm_squeeze", "hma_20", "stc"})


def _ensure(df: pd.DataFrame) -> pd.DataFrame:
    if not _REQUIRED_COLS.issubset(df.columns):
        return compute_all(df)
    return df


def _swing_lows(series: pd.Series, radius: int = 2) -> list[tuple[int, float]]:
    lows = []
    n = len(series)
    for i in range(radius, n - radius):
        v = float(series.iloc[i])
        if all(v <= float(series.iloc[i - j]) for j in range(1, radius + 1)) \
                and all(v <= float(series.iloc[i + j]) for j in range(1, radius + 1)):
            lows.append((i, v))
    return lows


def _swing_highs(series: pd.Series, radius: int = 2) -> list[tuple[int, float]]:
    highs = []
    n = len(series)
    for i in range(radius, n - radius):
        v = float(series.iloc[i])
        if all(v >= float(series.iloc[i - j]) for j in range(1, radius + 1)) \
                and all(v >= float(series.iloc[i + j]) for j in range(1, radius + 1)):
            highs.append((i, v))
    return highs


def _vote(name, verdict, conf, note=""):
    return Vote(name, verdict, conf, note)


# ---------------- TREND family ----------------

def ema_alignment(df):
    df = _ensure(df)
    e8, e20, e50, e200 = (_last(df[c]) for c in ("ema_8", "ema_20", "ema_50", "ema_200"))
    if any(np.isnan(x) for x in (e8, e20, e50, e200)):
        return _vote("EMA Alignment", Verdict.WAIT, 0.0, "insufficient data")
    if e8 > e20 > e50 > e200:
        return _vote("EMA Alignment", Verdict.LONG, 0.9, "8>20>50>200")
    if e8 < e20 < e50 < e200:
        return _vote("EMA Alignment", Verdict.SHORT, 0.9, "8<20<50<200")
    return _vote("EMA Alignment", Verdict.WAIT, 0.3, "mixed")


def sma_50_200_cross(df):
    df = _ensure(df)
    s50, s200 = _last(df["sma_50"]), _last(df["sma_200"])
    if np.isnan(s50) or np.isnan(s200):
        return _vote("Golden/Death Cross", Verdict.WAIT, 0.0)
    return _vote("Golden/Death Cross",
                 Verdict.LONG if s50 > s200 else Verdict.SHORT, 0.7)


def price_vs_ema200(df):
    df = _ensure(df)
    c, e = _last(df["close"]), _last(df["ema_200"])
    if np.isnan(e):
        return _vote("Price vs EMA200", Verdict.WAIT, 0.0)
    diff = (c - e) / e
    if diff > 0.02:
        return _vote("Price vs EMA200", Verdict.LONG, min(1.0, abs(diff) * 10))
    if diff < -0.02:
        return _vote("Price vs EMA200", Verdict.SHORT, min(1.0, abs(diff) * 10))
    return _vote("Price vs EMA200", Verdict.WAIT, 0.2)


def supertrend_dir(df):
    df = _ensure(df)
    d = _last(df["supertrend_dir"])
    if np.isnan(d):
        return _vote("Supertrend", Verdict.WAIT, 0.0)
    return _vote("Supertrend", Verdict.LONG if d > 0 else Verdict.SHORT, 0.75)


def psar_dir(df):
    df = _ensure(df)
    if "psar" not in df.columns:
        return _vote("Parabolic SAR", Verdict.WAIT, 0.0)
    p, c = _last(df["psar"]), _last(df["close"])
    if np.isnan(p):
        return _vote("Parabolic SAR", Verdict.WAIT, 0.0)
    return _vote("Parabolic SAR", Verdict.LONG if c > p else Verdict.SHORT, 0.6)


def adx_trend(df):
    df = _ensure(df)
    adx, dmp, dmn = _last(df["adx_14"]), _last(df["dmp_14"]), _last(df["dmn_14"])
    if any(np.isnan(x) for x in (adx, dmp, dmn)):
        return _vote("ADX Trend Strength", Verdict.WAIT, 0.0)
    if adx < 20:
        return _vote("ADX Trend Strength", Verdict.WAIT, 0.4, "weak trend")
    return _vote("ADX Trend Strength",
                 Verdict.LONG if dmp > dmn else Verdict.SHORT,
                 min(1.0, adx / 50))


def hma_slope(df):
    df = _ensure(df)
    if "hma_20" not in df.columns or len(df) < 5:
        return _vote("HMA Slope", Verdict.WAIT, 0.0)
    s = df["hma_20"]
    slope = (s.iloc[-1] - s.iloc[-5]) / s.iloc[-5] if s.iloc[-5] else 0
    if np.isnan(slope):
        return _vote("HMA Slope", Verdict.WAIT, 0.0)
    if slope > 0.005:
        return _vote("HMA Slope", Verdict.LONG, min(1.0, slope * 50))
    if slope < -0.005:
        return _vote("HMA Slope", Verdict.SHORT, min(1.0, abs(slope) * 50))
    return _vote("HMA Slope", Verdict.WAIT, 0.2)


def kama_slope(df):
    df = _ensure(df)
    if "kama_20" not in df.columns or len(df) < 6:
        return _vote("KAMA Slope", Verdict.WAIT, 0.0)
    s = df["kama_20"]
    slope = (s.iloc[-1] - s.iloc[-5]) / s.iloc[-5] if s.iloc[-5] else 0
    if slope > 0.003:
        return _vote("KAMA Slope", Verdict.LONG, 0.6)
    if slope < -0.003:
        return _vote("KAMA Slope", Verdict.SHORT, 0.6)
    return _vote("KAMA Slope", Verdict.WAIT, 0.2)


# ---------------- MOMENTUM family ----------------

def rsi_zone(df):
    df = _ensure(df)
    r = _last(df["rsi_14"])
    if np.isnan(r):
        return _vote("RSI Zone", Verdict.WAIT, 0.0)
    if r < 30:
        return _vote("RSI Zone", Verdict.LONG, 0.7, "oversold")
    if r > 70:
        return _vote("RSI Zone", Verdict.SHORT, 0.7, "overbought")
    if r > 55:
        return _vote("RSI Zone", Verdict.LONG, 0.4)
    if r < 45:
        return _vote("RSI Zone", Verdict.SHORT, 0.4)
    return _vote("RSI Zone", Verdict.WAIT, 0.2)


def rsi2_extreme(df):
    df = _ensure(df)
    r = _last(df["rsi_2"])
    if np.isnan(r):
        return _vote("RSI(2) Extreme", Verdict.WAIT, 0.0)
    if r < 10:
        return _vote("RSI(2) Extreme", Verdict.LONG, 0.6, "snap-back setup")
    if r > 90:
        return _vote("RSI(2) Extreme", Verdict.SHORT, 0.6)
    return _vote("RSI(2) Extreme", Verdict.WAIT, 0.1)


def macd_signal(df):
    df = _ensure(df)
    m, s = _last(df["macd"]), _last(df["macd_signal"])
    if np.isnan(m) or np.isnan(s):
        return _vote("MACD Signal", Verdict.WAIT, 0.0)
    if m > s:
        return _vote("MACD Signal", Verdict.LONG, 0.7 if m > 0 else 0.5)
    if m < s:
        return _vote("MACD Signal", Verdict.SHORT, 0.7 if m < 0 else 0.5)
    return _vote("MACD Signal", Verdict.WAIT, 0.3)


def macd_hist_momentum(df):
    df = _ensure(df)
    if "macd_hist" not in df.columns or len(df) < 3:
        return _vote("MACD Histogram", Verdict.WAIT, 0.0)
    h = df["macd_hist"]
    if h.iloc[-1] > 0 and h.iloc[-1] > h.iloc[-2]:
        return _vote("MACD Histogram", Verdict.LONG, 0.6)
    if h.iloc[-1] < 0 and h.iloc[-1] < h.iloc[-2]:
        return _vote("MACD Histogram", Verdict.SHORT, 0.6)
    return _vote("MACD Histogram", Verdict.WAIT, 0.3)


def stoch_signal(df):
    df = _ensure(df)
    k, d = _last(df["stoch_k"]), _last(df["stoch_d"])
    if np.isnan(k) or np.isnan(d):
        return _vote("Stochastic", Verdict.WAIT, 0.0)
    if k < 20 and k > d:
        return _vote("Stochastic", Verdict.LONG, 0.55)
    if k > 80 and k < d:
        return _vote("Stochastic", Verdict.SHORT, 0.55)
    return _vote("Stochastic", Verdict.WAIT, 0.2)


def stoch_rsi(df):
    df = _ensure(df)
    k, d = _last(df["stochrsi_k"]), _last(df["stochrsi_d"])
    if np.isnan(k) or np.isnan(d):
        return _vote("Stochastic RSI", Verdict.WAIT, 0.0)
    if k < 20 and k > d:
        return _vote("Stochastic RSI", Verdict.LONG, 0.6)
    if k > 80 and k < d:
        return _vote("Stochastic RSI", Verdict.SHORT, 0.6)
    return _vote("Stochastic RSI", Verdict.WAIT, 0.2)


def williams_r(df):
    df = _ensure(df)
    w = _last(df["willr_14"])
    if np.isnan(w):
        return _vote("Williams %R", Verdict.WAIT, 0.0)
    if w < -80:
        return _vote("Williams %R", Verdict.LONG, 0.55)
    if w > -20:
        return _vote("Williams %R", Verdict.SHORT, 0.55)
    return _vote("Williams %R", Verdict.WAIT, 0.2)


def cci_signal(df):
    df = _ensure(df)
    c = _last(df["cci_20"])
    if np.isnan(c):
        return _vote("CCI", Verdict.WAIT, 0.0)
    if c < -100:
        return _vote("CCI", Verdict.LONG, 0.5)
    if c > 100:
        return _vote("CCI", Verdict.SHORT, 0.5)
    return _vote("CCI", Verdict.WAIT, 0.2)


def roc_momentum(df):
    df = _ensure(df)
    r = _last(df["roc_10"])
    if np.isnan(r):
        return _vote("ROC", Verdict.WAIT, 0.0)
    if r > 2:
        return _vote("ROC", Verdict.LONG, min(1.0, r / 10))
    if r < -2:
        return _vote("ROC", Verdict.SHORT, min(1.0, abs(r) / 10))
    return _vote("ROC", Verdict.WAIT, 0.2)


def tsi_signal(df):
    df = _ensure(df)
    t = _last(df["tsi"])
    if np.isnan(t):
        return _vote("TSI", Verdict.WAIT, 0.0)
    if t > 0:
        return _vote("TSI", Verdict.LONG, 0.5)
    if t < 0:
        return _vote("TSI", Verdict.SHORT, 0.5)
    return _vote("TSI", Verdict.WAIT, 0.2)


def wavetrend(df):
    df = _ensure(df)
    w1, w2 = _last(df["wavetrend_wt1"]), _last(df["wavetrend_wt2"])
    if np.isnan(w1) or np.isnan(w2):
        return _vote("WaveTrend", Verdict.WAIT, 0.0)
    if w1 < -53 and w1 > w2:
        return _vote("WaveTrend", Verdict.LONG, 0.6, "oversold cross")
    if w1 > 53 and w1 < w2:
        return _vote("WaveTrend", Verdict.SHORT, 0.6, "overbought cross")
    return _vote("WaveTrend", Verdict.WAIT, 0.2)


def schaff_trend_cycle(df):
    df = _ensure(df)
    s = _last(df["stc"]) if "stc" in df.columns else np.nan
    if np.isnan(s):
        return _vote("Schaff Trend Cycle", Verdict.WAIT, 0.0)
    if s < 25:
        return _vote("Schaff Trend Cycle", Verdict.LONG, 0.5)
    if s > 75:
        return _vote("Schaff Trend Cycle", Verdict.SHORT, 0.5)
    return _vote("Schaff Trend Cycle", Verdict.WAIT, 0.2)


def mfi_signal(df):
    df = _ensure(df)
    m = _last(df["mfi_14"])
    if np.isnan(m):
        return _vote("MFI", Verdict.WAIT, 0.0)
    if m < 20:
        return _vote("MFI", Verdict.LONG, 0.5)
    if m > 80:
        return _vote("MFI", Verdict.SHORT, 0.5)
    return _vote("MFI", Verdict.WAIT, 0.2)


# ---------------- VOLATILITY / SQUEEZE ----------------

def ttm_squeeze_break(df):
    df = _ensure(df)
    if "ttm_squeeze" not in df.columns or len(df) < 5:
        return _vote("TTM Squeeze", Verdict.WAIT, 0.0)
    sq = df["ttm_squeeze"]
    # Squeeze release = was 1 in past 5 bars, now 0
    released = sq.iloc[-5:-1].sum() > 0 and sq.iloc[-1] == 0
    if released and _last(df["macd_hist"]) > 0:
        return _vote("TTM Squeeze", Verdict.LONG, 0.75, "squeeze release up")
    if released and _last(df["macd_hist"]) < 0:
        return _vote("TTM Squeeze", Verdict.SHORT, 0.75, "squeeze release down")
    if sq.iloc[-1] == 1:
        return _vote("TTM Squeeze", Verdict.WAIT, 0.5, "in squeeze")
    return _vote("TTM Squeeze", Verdict.WAIT, 0.2)


def bollinger_position(df):
    df = _ensure(df)
    c, u, l, m = (_last(df[x]) for x in ("close", "bbu_20", "bbl_20", "bbm_20"))
    if any(np.isnan(x) for x in (c, u, l, m)):
        return _vote("Bollinger Position", Verdict.WAIT, 0.0)
    if c <= l:
        return _vote("Bollinger Position", Verdict.LONG, 0.55, "at lower band")
    if c >= u:
        return _vote("Bollinger Position", Verdict.SHORT, 0.55, "at upper band")
    return _vote("Bollinger Position", Verdict.WAIT, 0.2)


def keltner_breakout(df):
    df = _ensure(df)
    c, u, l = (_last(df[x]) for x in ("close", "kc_upper", "kc_lower"))
    if any(np.isnan(x) for x in (c, u, l)):
        return _vote("Keltner Breakout", Verdict.WAIT, 0.0)
    if c > u:
        return _vote("Keltner Breakout", Verdict.LONG, 0.6)
    if c < l:
        return _vote("Keltner Breakout", Verdict.SHORT, 0.6)
    return _vote("Keltner Breakout", Verdict.WAIT, 0.2)


def donchian_breakout(df):
    df = _ensure(df)
    c, u, l = (_last(df[x]) for x in ("close", "donchian_up", "donchian_low"))
    if any(np.isnan(x) for x in (c, u, l)):
        return _vote("Donchian Breakout", Verdict.WAIT, 0.0)
    if c >= u:
        return _vote("Donchian Breakout", Verdict.LONG, 0.65)
    if c <= l:
        return _vote("Donchian Breakout", Verdict.SHORT, 0.65)
    return _vote("Donchian Breakout", Verdict.WAIT, 0.2)


def atr_expansion(df):
    df = _ensure(df)
    if "atr_14" not in df.columns or len(df) < 30:
        return _vote("ATR Expansion", Verdict.WAIT, 0.0)
    a = df["atr_14"]
    ratio = a.iloc[-1] / a.iloc[-20]
    if ratio > 1.5 and _last(df["close"]) > _last(df["ema_20"]):
        return _vote("ATR Expansion", Verdict.LONG, 0.5, "vol expansion up")
    if ratio > 1.5 and _last(df["close"]) < _last(df["ema_20"]):
        return _vote("ATR Expansion", Verdict.SHORT, 0.5, "vol expansion down")
    return _vote("ATR Expansion", Verdict.WAIT, 0.2)


# ---------------- VOLUME family ----------------

def obv_trend(df):
    df = _ensure(df)
    if "obv" not in df.columns or len(df) < 20:
        return _vote("OBV Trend", Verdict.WAIT, 0.0)
    o = df["obv"]
    if o.iloc[-1] > o.iloc[-20]:
        return _vote("OBV Trend", Verdict.LONG, 0.5)
    if o.iloc[-1] < o.iloc[-20]:
        return _vote("OBV Trend", Verdict.SHORT, 0.5)
    return _vote("OBV Trend", Verdict.WAIT, 0.2)


def cmf_signal(df):
    df = _ensure(df)
    c = _last(df["cmf_20"])
    if np.isnan(c):
        return _vote("CMF", Verdict.WAIT, 0.0)
    if c > 0.1:
        return _vote("CMF", Verdict.LONG, 0.5, "buying pressure")
    if c < -0.1:
        return _vote("CMF", Verdict.SHORT, 0.5)
    return _vote("CMF", Verdict.WAIT, 0.2)


def ad_line(df):
    df = _ensure(df)
    if "ad" not in df.columns or len(df) < 20:
        return _vote("A/D Line", Verdict.WAIT, 0.0)
    a = df["ad"]
    if a.iloc[-1] > a.iloc[-20]:
        return _vote("A/D Line", Verdict.LONG, 0.4)
    return _vote("A/D Line", Verdict.SHORT, 0.4)


def vwap_position(df):
    df = _ensure(df)
    if "vwap" not in df.columns:
        return _vote("VWAP Position", Verdict.WAIT, 0.0)
    c, v = _last(df["close"]), _last(df["vwap"])
    if np.isnan(v):
        return _vote("VWAP Position", Verdict.WAIT, 0.0)
    return _vote("VWAP Position",
                 Verdict.LONG if c > v else Verdict.SHORT, 0.4)


def volume_surge(df):
    df = _ensure(df)
    if len(df) < 21:
        return _vote("Volume Surge", Verdict.WAIT, 0.0)
    v = df["volume"]
    avg = v.iloc[-21:-1].mean()
    if v.iloc[-1] > 2 * avg and _last(df["ret_1"]) > 0:
        return _vote("Volume Surge", Verdict.LONG, 0.6, "2x avg + up close")
    if v.iloc[-1] > 2 * avg and _last(df["ret_1"]) < 0:
        return _vote("Volume Surge", Verdict.SHORT, 0.6, "2x avg + down close")
    return _vote("Volume Surge", Verdict.WAIT, 0.2)


# ---------------- ICHIMOKU ----------------

def ichimoku_cloud(df):
    df = _ensure(df)
    cols = ("close", "ichi_senkou_a", "ichi_senkou_b", "ichi_tenkan", "ichi_kijun")
    if not all(c in df.columns for c in cols):
        return _vote("Ichimoku Cloud", Verdict.WAIT, 0.0)
    c, a, b, t, k = (_last(df[x]) for x in cols)
    if any(np.isnan(x) for x in (c, a, b, t, k)):
        return _vote("Ichimoku Cloud", Verdict.WAIT, 0.0)
    above = c > max(a, b)
    below = c < min(a, b)
    if above and t > k:
        return _vote("Ichimoku Cloud", Verdict.LONG, 0.85, "above cloud + bullish TK")
    if below and t < k:
        return _vote("Ichimoku Cloud", Verdict.SHORT, 0.85)
    return _vote("Ichimoku Cloud", Verdict.WAIT, 0.3)


# ---------------- ELDER ----------------

def elder_impulse(df):
    df = _ensure(df)
    if "elder_bull" not in df.columns:
        return _vote("Elder Impulse", Verdict.WAIT, 0.0)
    bull = df["elder_bull"].iloc[-1]
    bear = df["elder_bear"].iloc[-1]
    if not (isinstance(bull, float) and np.isnan(bull)) and bull:
        return _vote("Elder Impulse", Verdict.LONG, 0.6, "bullish impulse")
    if not (isinstance(bear, float) and np.isnan(bear)) and bear:
        return _vote("Elder Impulse", Verdict.SHORT, 0.6, "bearish impulse")
    return _vote("Elder Impulse", Verdict.WAIT, 0.2)


# ---------------- STRUCTURE ----------------

def market_structure(df):
    df = _ensure(df)
    if len(df) < 35:
        return _vote("Market Structure", Verdict.WAIT, 0.0, "insufficient data")
    h = df["high"].iloc[-30:]
    l = df["low"].iloc[-30:]

    price_highs = _swing_highs(h, radius=3)
    price_lows = _swing_lows(l, radius=3)

    hh = len(price_highs) >= 2 and price_highs[-1][1] > price_highs[-2][1]
    hl = len(price_lows) >= 2 and price_lows[-1][1] > price_lows[-2][1]
    ll = len(price_lows) >= 2 and price_lows[-1][1] < price_lows[-2][1]
    lh = len(price_highs) >= 2 and price_highs[-1][1] < price_highs[-2][1]

    if hh and hl:
        return _vote("Market Structure", Verdict.LONG, 0.75, "HH+HL uptrend")
    if ll and lh:
        return _vote("Market Structure", Verdict.SHORT, 0.75, "LL+LH downtrend")
    return _vote("Market Structure", Verdict.WAIT, 0.2, "transitional structure")


def smc_bos(df):
    bos = break_of_structure(df, lookback=20)
    if bos > 0:
        return _vote("SMC: Break of Structure", Verdict.LONG, 0.7, "bullish BOS")
    if bos < 0:
        return _vote("SMC: Break of Structure", Verdict.SHORT, 0.7, "bearish BOS")
    return _vote("SMC: Break of Structure", Verdict.WAIT, 0.2)


def smc_order_block(df):
    ob = order_block(df)
    c = _last(df["close"])
    if ob.get("bullish") and c < ob["bullish"] * 1.01:
        return _vote("SMC: Order Block", Verdict.LONG, 0.55, f"near OB {ob['bullish']:.2f}")
    if ob.get("bearish") and c > ob["bearish"] * 0.99:
        return _vote("SMC: Order Block", Verdict.SHORT, 0.55)
    return _vote("SMC: Order Block", Verdict.WAIT, 0.2)


def wyckoff_agent(df):
    phase = wyckoff_phase(df)
    if phase == "MARKUP":
        return _vote("Wyckoff Phase", Verdict.LONG, 0.65, phase)
    if phase == "ACCUMULATION":
        return _vote("Wyckoff Phase", Verdict.LONG, 0.5, phase)
    if phase == "MARKDOWN":
        return _vote("Wyckoff Phase", Verdict.SHORT, 0.65, phase)
    if phase == "DISTRIBUTION":
        return _vote("Wyckoff Phase", Verdict.SHORT, 0.5, phase)
    return _vote("Wyckoff Phase", Verdict.WAIT, 0.2, phase)


def elliott_agent(df):
    e = elliott_phase(df)
    if e["phase"] == "IMPULSE_UP":
        return _vote("Elliott Wave", Verdict.LONG, 0.55, e["wave"])
    if e["phase"] == "IMPULSE_DOWN":
        return _vote("Elliott Wave", Verdict.SHORT, 0.55, e["wave"])
    return _vote("Elliott Wave", Verdict.WAIT, 0.25, e["phase"])


# ---------------- INSTITUTIONAL ----------------

def ics_score(df):
    """Approximated 'Institutional Conviction Score' (0-100).

    Real ICS uses dark-pool prints which need a paid feed. This proxy
    blends on-balance volume momentum, money-flow index, and price
    location relative to the 200-day VWAP-equivalent (rolling vwap of
    typical price).
    """
    df = _ensure(df)
    if len(df) < 200:
        return _vote("Institutional Conviction Score", Verdict.WAIT, 0.0,
                     "ICS unavailable (need >=200 bars)")
    obv = df["obv"]
    obv_z = (obv.iloc[-1] - obv.iloc[-200:].mean()) / max(obv.iloc[-200:].std(), 1)
    mfi = _last(df["mfi_14"])
    tp = (df["high"] + df["low"] + df["close"]) / 3
    rolling_vwap = (tp * df["volume"]).rolling(50).sum() / df["volume"].rolling(50).sum()
    rv = _last(rolling_vwap)
    c = _last(df["close"])
    rv_pos = (c - rv) / rv * 100 if rv else 0

    score = 50 + 10 * obv_z + 0.3 * (mfi - 50) + 5 * rv_pos
    score = float(np.clip(score, 0, 100))
    if score >= 70:
        return _vote("Institutional Conviction Score", Verdict.LONG, score / 100, f"ICS={score:.0f}")
    if score <= 30:
        return _vote("Institutional Conviction Score", Verdict.SHORT, (100 - score) / 100, f"ICS={score:.0f}")
    return _vote("Institutional Conviction Score", Verdict.WAIT, 0.3, f"ICS={score:.0f}")


# ---------------- CROSSES / EXTRA ----------------

def ema8_20_cross(df):
    df = _ensure(df)
    if len(df) < 3:
        return _vote("EMA8/20 Cross", Verdict.WAIT, 0.0)
    e8, e20 = df["ema_8"], df["ema_20"]
    if e8.iloc[-1] > e20.iloc[-1] and e8.iloc[-2] <= e20.iloc[-2]:
        return _vote("EMA8/20 Cross", Verdict.LONG, 0.65, "fresh bullish cross")
    if e8.iloc[-1] < e20.iloc[-1] and e8.iloc[-2] >= e20.iloc[-2]:
        return _vote("EMA8/20 Cross", Verdict.SHORT, 0.65)
    return _vote("EMA8/20 Cross", Verdict.WAIT, 0.2)


def ema20_50_cross(df):
    df = _ensure(df)
    if len(df) < 3:
        return _vote("EMA20/50 Cross", Verdict.WAIT, 0.0)
    a, b = df["ema_20"], df["ema_50"]
    if a.iloc[-1] > b.iloc[-1] and a.iloc[-2] <= b.iloc[-2]:
        return _vote("EMA20/50 Cross", Verdict.LONG, 0.7)
    if a.iloc[-1] < b.iloc[-1] and a.iloc[-2] >= b.iloc[-2]:
        return _vote("EMA20/50 Cross", Verdict.SHORT, 0.7)
    return _vote("EMA20/50 Cross", Verdict.WAIT, 0.2)


def momentum_5_20(df):
    df = _ensure(df)
    r5, r20 = _last(df["ret_5"]), _last(df["ret_20"])
    if np.isnan(r5) or np.isnan(r20):
        return _vote("5/20 Momentum", Verdict.WAIT, 0.0)
    if r5 > 0 and r20 > 0:
        return _vote("5/20 Momentum", Verdict.LONG, min(1.0, (r5 + r20) * 5))
    if r5 < 0 and r20 < 0:
        return _vote("5/20 Momentum", Verdict.SHORT, min(1.0, (abs(r5) + abs(r20)) * 5))
    return _vote("5/20 Momentum", Verdict.WAIT, 0.2)


def gap_pattern(df):
    if len(df) < 3:
        return _vote("Opening Gap", Verdict.WAIT, 0.0)
    today_open = df["open"].iloc[-1]
    yesterday_close = df["close"].iloc[-2]
    gap = (today_open - yesterday_close) / yesterday_close
    if gap > 0.015 and df["close"].iloc[-1] > today_open:
        return _vote("Opening Gap", Verdict.LONG, 0.5, "gap up + held")
    if gap < -0.015 and df["close"].iloc[-1] < today_open:
        return _vote("Opening Gap", Verdict.SHORT, 0.5)
    return _vote("Opening Gap", Verdict.WAIT, 0.2)


def inside_outside_bar(df):
    if len(df) < 2:
        return _vote("Inside/Outside Bar", Verdict.WAIT, 0.0)
    h, l = df["high"].iloc[-1], df["low"].iloc[-1]
    ph, pl = df["high"].iloc[-2], df["low"].iloc[-2]
    if h > ph and l < pl and df["close"].iloc[-1] > df["open"].iloc[-1]:
        return _vote("Inside/Outside Bar", Verdict.LONG, 0.45, "outside bar up")
    if h > ph and l < pl and df["close"].iloc[-1] < df["open"].iloc[-1]:
        return _vote("Inside/Outside Bar", Verdict.SHORT, 0.45)
    return _vote("Inside/Outside Bar", Verdict.WAIT, 0.2)


def z_score_mean_reversion(df):
    df = _ensure(df)
    z = _last(df["z_score_20"])
    if np.isnan(z):
        return _vote("Z-Score Mean Reversion", Verdict.WAIT, 0.0)
    if z < -2:
        return _vote("Z-Score Mean Reversion", Verdict.LONG, 0.55, f"z={z:.2f}")
    if z > 2:
        return _vote("Z-Score Mean Reversion", Verdict.SHORT, 0.55, f"z={z:.2f}")
    return _vote("Z-Score Mean Reversion", Verdict.WAIT, 0.2)


def rsi_divergence(df):
    df = _ensure(df)
    n_window = 40
    if len(df) < n_window + 5:
        return _vote("RSI Divergence", Verdict.WAIT, 0.0, "insufficient data")
    c = df["close"].iloc[-n_window:]
    r = df["rsi_14"].iloc[-n_window:]

    price_lows = _swing_lows(c)
    if len(price_lows) >= 2:
        i1, pv1 = price_lows[-2]
        i2, pv2 = price_lows[-1]
        rv1, rv2 = float(r.iloc[i1]), float(r.iloc[i2])
        if not (np.isnan(rv1) or np.isnan(rv2)) and pv2 < pv1 and rv2 > rv1:
            return _vote("RSI Divergence", Verdict.LONG, 0.75,
                         "bullish div: lower price low, higher RSI low")

    price_highs = _swing_highs(c)
    if len(price_highs) >= 2:
        i1, pv1 = price_highs[-2]
        i2, pv2 = price_highs[-1]
        rv1, rv2 = float(r.iloc[i1]), float(r.iloc[i2])
        if not (np.isnan(rv1) or np.isnan(rv2)) and pv2 > pv1 and rv2 < rv1:
            return _vote("RSI Divergence", Verdict.SHORT, 0.75,
                         "bearish div: higher price high, lower RSI high")

    return _vote("RSI Divergence", Verdict.WAIT, 0.0)


def trend_quality(df):
    """ADX + R^2 of close vs. time to gauge trend cleanness."""
    df = _ensure(df)
    if len(df) < 50:
        return _vote("Trend Quality", Verdict.WAIT, 0.0)
    y = df["close"].iloc[-50:].values
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    fit = slope * x + intercept
    ss_res = ((y - fit) ** 2).sum()
    ss_tot = ((y - y.mean()) ** 2).sum() or 1
    r2 = 1 - ss_res / ss_tot
    if r2 > 0.7 and slope > 0:
        return _vote("Trend Quality", Verdict.LONG, min(1.0, r2))
    if r2 > 0.7 and slope < 0:
        return _vote("Trend Quality", Verdict.SHORT, min(1.0, r2))
    return _vote("Trend Quality", Verdict.WAIT, 0.3)


def fifty_two_week_position(df):
    df = _ensure(df)
    if len(df) < 252:
        return _vote("52-Week Position", Verdict.WAIT, 0.0)
    w = df.iloc[-252:]
    pos = (w["close"].iloc[-1] - w["low"].min()) / (w["high"].max() - w["low"].min() + 1e-9)
    if pos > 0.85:
        return _vote("52-Week Position", Verdict.LONG, 0.5, "near 52w high")
    if pos < 0.15:
        return _vote("52-Week Position", Verdict.SHORT, 0.5, "near 52w low")
    return _vote("52-Week Position", Verdict.WAIT, 0.2)


def support_resistance_test(df):
    df = _ensure(df)
    if len(df) < 60:
        return _vote("S/R Test", Verdict.WAIT, 0.0)
    last = df["close"].iloc[-1]
    recent_high = df["high"].iloc[-60:-1].max()
    recent_low = df["low"].iloc[-60:-1].min()
    if last > recent_high:
        return _vote("S/R Test", Verdict.LONG, 0.6, "broke 60d high")
    if last < recent_low:
        return _vote("S/R Test", Verdict.SHORT, 0.6, "broke 60d low")
    return _vote("S/R Test", Verdict.WAIT, 0.2)


def candle_pattern_engulfing(df):
    if len(df) < 2:
        return _vote("Engulfing Pattern", Verdict.WAIT, 0.0)
    o1, c1 = df["open"].iloc[-2], df["close"].iloc[-2]
    o2, c2 = df["open"].iloc[-1], df["close"].iloc[-1]
    if c1 < o1 and c2 > o2 and c2 > o1 and o2 < c1:
        return _vote("Engulfing Pattern", Verdict.LONG, 0.55, "bullish engulfing")
    if c1 > o1 and c2 < o2 and c2 < o1 and o2 > c1:
        return _vote("Engulfing Pattern", Verdict.SHORT, 0.55, "bearish engulfing")
    return _vote("Engulfing Pattern", Verdict.WAIT, 0.2)


def relative_strength_vs_spy(df):
    """Compare 20d return vs SPY 20d return. Long if outperforming + up."""
    df = _ensure(df)
    if len(df) < 21 or _last(df["ret_20"]) is None or np.isnan(_last(df["ret_20"])):
        return _vote("Relative Strength vs SPY", Verdict.WAIT, 0.0)
    try:
        from ..data.market import get_history
        spy = get_history("SPY", period="3mo", interval="1d")
        if spy.empty or len(spy) < 21:
            return _vote("Relative Strength vs SPY", Verdict.WAIT, 0.0)
        spy_ret = float(spy["close"].iloc[-1] / spy["close"].iloc[-21] - 1)
        my_ret = float(_last(df["ret_20"]))
        diff = my_ret - spy_ret
        if diff > 0.03:
            return _vote("Relative Strength vs SPY", Verdict.LONG, min(1.0, diff * 10))
        if diff < -0.03:
            return _vote("Relative Strength vs SPY", Verdict.SHORT, min(1.0, abs(diff) * 10))
        return _vote("Relative Strength vs SPY", Verdict.WAIT, 0.2)
    except Exception as e:
        return _vote("Relative Strength vs SPY", Verdict.WAIT, 0.0, f"err: {e}")


_SECTOR_ETF: dict[str, str] = {
    "Technology": "XLK",
    "Financial Services": "XLF",
    "Healthcare": "XLV",
    "Consumer Cyclical": "XLY",
    "Consumer Defensive": "XLP",
    "Energy": "XLE",
    "Industrials": "XLI",
    "Basic Materials": "XLB",
    "Real Estate": "XLRE",
    "Utilities": "XLU",
    "Communication Services": "XLC",
}


_SECTOR_CACHE: dict[str, str] = {}


def relative_strength_vs_sector(df):
    """Compare 20d return vs the ticker's GICS sector ETF.
    Requires df.attrs['symbol'] to be set by build_action_card."""
    df = _ensure(df)
    if len(df) < 21:
        return _vote("RS vs Sector", Verdict.WAIT, 0.0)
    sym = (df.attrs or {}).get("symbol", "")
    if not sym:
        return _vote("RS vs Sector", Verdict.WAIT, 0.0, "no symbol")
    try:
        import yfinance as yf
        from ..data.market import get_history
        if sym not in _SECTOR_CACHE:
            _SECTOR_CACHE[sym] = yf.Ticker(sym).info.get("sector", "") or ""
        sector = _SECTOR_CACHE[sym]
        etf = _SECTOR_ETF.get(sector)
        if not etf:
            return _vote("RS vs Sector", Verdict.WAIT, 0.0, f"no ETF for '{sector}'")
        etf_df = get_history(etf, period="3mo", interval="1d")
        if etf_df.empty or len(etf_df) < 21:
            return _vote("RS vs Sector", Verdict.WAIT, 0.0)
        etf_ret = float(etf_df["close"].iloc[-1] / etf_df["close"].iloc[-21] - 1)
        my_ret = float(_last(df["ret_20"]))
        if np.isnan(my_ret):
            return _vote("RS vs Sector", Verdict.WAIT, 0.0)
        diff = my_ret - etf_ret
        if diff > 0.03:
            return _vote("RS vs Sector", Verdict.LONG, min(1.0, diff * 10), f"+{diff:.1%} vs {etf}")
        if diff < -0.03:
            return _vote("RS vs Sector", Verdict.SHORT, min(1.0, abs(diff) * 10), f"{diff:.1%} vs {etf}")
        return _vote("RS vs Sector", Verdict.WAIT, 0.2, f"{diff:+.1%} vs {etf}")
    except Exception as e:
        return _vote("RS vs Sector", Verdict.WAIT, 0.0, f"err: {e}")


# ---------------- regime ----------------

def vix_regime(df):
    """Skip-stub: real version checks VIX level. Returns WAIT."""
    try:
        from ..data.market import get_history
        vix = get_history("^VIX", period="3mo", interval="1d")
        if vix.empty:
            return _vote("VIX Regime", Verdict.WAIT, 0.0)
        v = float(vix["close"].iloc[-1])
        if v < 15:
            return _vote("VIX Regime", Verdict.LONG, 0.4, f"low vol VIX={v:.1f}")
        if v > 25:
            return _vote("VIX Regime", Verdict.SHORT, 0.4, f"high vol VIX={v:.1f}")
        return _vote("VIX Regime", Verdict.WAIT, 0.2, f"VIX={v:.1f}")
    except Exception:
        return _vote("VIX Regime", Verdict.WAIT, 0.0)


# ============================================================
# NEW AGENTS — Pattern / Pre-filter expansion
# ============================================================

# ---------------- PRE-FILTER ----------------

def adr_filter(df):
    """Average Daily Range % pre-filter.

    Stocks with ADR < 3% lack enough intraday range to be worth swing-trading.
    When ADR passes, a weak directional lean follows the 5-day return (capped
    at 0.35 to avoid double-counting with momentum agents).
    """
    df = _ensure(df)
    if len(df) < 20:
        return _vote("ADR% Filter", Verdict.WAIT, 0.0, "insufficient data")
    adr = _last(df["adr_20"])
    if np.isnan(adr):
        rng = (df["high"].iloc[-20:] - df["low"].iloc[-20:]) / df["close"].iloc[-20:].replace(0, np.nan) * 100
        adr = float(rng.mean())
    if np.isnan(adr) or adr < 3.0:
        return _vote("ADR% Filter", Verdict.WAIT, 0.0, f"ADR={adr:.1f}%<3% — skip" if not np.isnan(adr) else "ADR unavailable")
    r5 = _last(df["ret_5"])
    conf = min(0.35, adr / 30)
    if not np.isnan(r5) and r5 > 0:
        return _vote("ADR% Filter", Verdict.LONG, conf, f"ADR={adr:.1f}%")
    if not np.isnan(r5) and r5 < 0:
        return _vote("ADR% Filter", Verdict.SHORT, conf, f"ADR={adr:.1f}%")
    return _vote("ADR% Filter", Verdict.WAIT, conf * 0.5, f"ADR={adr:.1f}%")


# ---------------- TREND QUALITY ----------------

def minervini_trend_template(df):
    """Minervini Trend Template — all checks must pass for LONG.

    Any single failure disqualifies the stock from long consideration.
    RS check uses 12m return vs SPY as a proxy for IBD RS ≥ 70; defaults
    to pass if SPY data is unavailable (network failure should not block).
    """
    df = _ensure(df)
    if len(df) < 252:
        return _vote("Minervini Trend Template", Verdict.WAIT, 0.0, "need 252 bars")

    c = _last(df["close"])
    sma200 = _last(df["sma_200"])
    sma150_s = df["sma_150"] if "sma_150" in df.columns else df["close"].rolling(150).mean()
    sma150 = _last(sma150_s)
    sma50 = _last(df["sma_50"])

    if any(np.isnan(x) for x in (c, sma200, sma150, sma50)):
        return _vote("Minervini Trend Template", Verdict.WAIT, 0.0, "MA data unavailable")

    sma200_25ago = float(df["sma_200"].iloc[-25])
    ma200_rising = sma200 > sma200_25ago

    w52_high = float(df["high"].iloc[-252:].max())
    w52_low = float(df["low"].iloc[-252:].min())
    ret_12m = c / float(df["close"].iloc[-252]) - 1

    rs_pass = True  # default pass when SPY unavailable (network failure)
    rs_note = "RS unchecked"
    try:
        from ..data.market import get_history
        spy = get_history("SPY", period="1y", interval="1d")
        if len(spy) >= 252:
            spy_ret = float(spy["close"].iloc[-1] / spy["close"].iloc[-252] - 1)
            rs_pass = ret_12m > spy_ret
            rs_note = f"RS {'pass' if rs_pass else 'fail'}"
    except Exception:
        pass

    checks = [
        c > sma150,              # 1. Price > 150-day MA
        c > sma200,              # 2. Price > 200-day MA
        ma200_rising,            # 3. 200-day MA rising ≥1 month
        sma50 > sma150,          # 4. 50-day MA > 150-day MA
        sma150 > sma200,         # 5. 150-day MA > 200-day MA
        c > sma50,               # 6. Price > 50-day MA
        c >= w52_high * 0.75,    # 7. Within 25% of 52-week high
        c >= w52_low * 1.30,     # 8. ≥30% above 52-week low
        rs_pass,                 # 9. RS vs SPY proxy (IBD RS ≥70 approx)
    ]

    failed = [i + 1 for i, ok in enumerate(checks) if not ok]
    if not failed:
        return _vote("Minervini Trend Template", Verdict.LONG, 0.9, f"all checks pass | {rs_note}")
    return _vote("Minervini Trend Template", Verdict.WAIT, 0.0, f"failed: {failed} | {rs_note}")


def weinstein_stage(df):
    """Stan Weinstein Stage Analysis using 30-week (≈150-day) SMA.

    Stage 2 (advancing above rising 30W MA) is the only long entry zone.
    Stage 4 (below falling 30W MA) votes SHORT. Others WAIT.
    """
    df = _ensure(df)
    if len(df) < 160:
        return _vote("Weinstein Stage", Verdict.WAIT, 0.0, "need 160 bars")

    sma150 = df["sma_150"] if "sma_150" in df.columns else df["close"].rolling(150).mean()
    c = _last(df["close"])
    ma = _last(sma150)

    if np.isnan(ma):
        return _vote("Weinstein Stage", Verdict.WAIT, 0.0)

    ma_25ago = float(sma150.iloc[-25])
    rising = ma > ma_25ago
    above = c > ma

    if above and rising:
        return _vote("Weinstein Stage", Verdict.LONG, 0.85, "Stage 2: above rising 30W MA")
    if above and not rising:
        return _vote("Weinstein Stage", Verdict.WAIT, 0.0, "Stage 3: topping — MA rolling over")
    if not above and not rising:
        return _vote("Weinstein Stage", Verdict.SHORT, 0.8, "Stage 4: below falling 30W MA")
    return _vote("Weinstein Stage", Verdict.WAIT, 0.0, "Stage 1: basing")


def weekly_daily_alignment(df):
    """Timeframe alignment: daily signal quality vs weekly trend.

    Uses 50-day SMA as weekly trend proxy. Slope measured over 10 bars
    (2 weeks) to detect trend direction. LONG only when above rising 50-day MA.
    """
    df = _ensure(df)
    if len(df) < 60:
        return _vote("Weekly/Daily Alignment", Verdict.WAIT, 0.0)

    sma50 = df["sma_50"]
    c = _last(df["close"])
    ma50 = _last(sma50)

    if np.isnan(ma50):
        return _vote("Weekly/Daily Alignment", Verdict.WAIT, 0.0)

    ma_10ago = float(sma50.iloc[-10])
    weekly_up = ma50 > ma_10ago
    above = c > ma50

    if above and weekly_up:
        return _vote("Weekly/Daily Alignment", Verdict.LONG, 0.75, "above rising 50-day MA")
    if not above and not weekly_up:
        return _vote("Weekly/Daily Alignment", Verdict.SHORT, 0.75, "below falling 50-day MA")
    if above and not weekly_up:
        return _vote("Weekly/Daily Alignment", Verdict.WAIT, 0.2, "above MA but trend weakening")
    return _vote("Weekly/Daily Alignment", Verdict.WAIT, 0.2, "below MA in uptrend — wait")


# ---------------- VOLATILITY CONTRACTION ----------------

def nr7_inside_day(df):
    """NR7 / Inside Day — range compression before a directional move.

    NR7: today's range is the narrowest of the last 7 bars (today + 6 prior).
    Inside Day: today's high < prior high AND today's low > prior low.
    Direction from EMA 8/20 alignment; WAIT with 0.0 when no compression.
    """
    df = _ensure(df)
    if len(df) < 8:
        return _vote("NR7/Inside Day", Verdict.WAIT, 0.0)

    h, l = df["high"], df["low"]
    today_range = float(h.iloc[-1] - l.iloc[-1])
    # 6 prior bars: today becomes the 7th, so we're checking NR7
    prior_ranges = [float(h.iloc[i] - l.iloc[i]) for i in range(-7, -1)]

    is_nr7 = today_range <= min(prior_ranges)
    is_inside = float(h.iloc[-1]) < float(h.iloc[-2]) and float(l.iloc[-1]) > float(l.iloc[-2])

    if not (is_nr7 or is_inside):
        return _vote("NR7/Inside Day", Verdict.WAIT, 0.0)

    label = "NR7+Inside" if (is_nr7 and is_inside) else ("NR7" if is_nr7 else "Inside Day")
    e8, e20 = _last(df["ema_8"]), _last(df["ema_20"])
    if not np.isnan(e8) and not np.isnan(e20):
        if e8 > e20:
            return _vote("NR7/Inside Day", Verdict.LONG, 0.6, f"{label} in uptrend")
        return _vote("NR7/Inside Day", Verdict.SHORT, 0.6, f"{label} in downtrend")
    return _vote("NR7/Inside Day", Verdict.WAIT, 0.4, f"{label}: direction unclear")


def ttm_squeeze_streak(df):
    """TTM Squeeze consecutive bar count.

    Complements the release-based TTM Squeeze agent. Fires when a squeeze
    streak of 5+ bars shows momentum building in a clear direction.
    """
    df = _ensure(df)
    if "ttm_squeeze" not in df.columns or "macd_hist" not in df.columns or len(df) < 10:
        return _vote("TTM Squeeze Streak", Verdict.WAIT, 0.0)

    sq = df["ttm_squeeze"]
    hist = df["macd_hist"]

    streak = 0
    for i in range(len(sq) - 1, max(len(sq) - 30, -1), -1):
        if sq.iloc[i] == 1:
            streak += 1
        else:
            break

    if streak < 5:
        return _vote("TTM Squeeze Streak", Verdict.WAIT, 0.2, f"streak={streak}")

    h_now = _last(hist)
    h_prev = float(hist.iloc[-2])
    if np.isnan(h_now) or np.isnan(h_prev):
        return _vote("TTM Squeeze Streak", Verdict.WAIT, 0.3, f"{streak}bar squeeze, hist unavailable")

    conf = min(0.85, 0.5 + streak * 0.04)
    if h_now > 0 and h_now > h_prev:
        return _vote("TTM Squeeze Streak", Verdict.LONG, conf, f"{streak}bar squeeze, momentum↑")
    if h_now < 0 and h_now < h_prev:
        return _vote("TTM Squeeze Streak", Verdict.SHORT, conf, f"{streak}bar squeeze, momentum↓")
    return _vote("TTM Squeeze Streak", Verdict.WAIT, 0.3, f"{streak}bar squeeze, direction unclear")


def vcp(df):
    """Volatility Contraction Pattern (Minervini).

    Detects successive pullback swings that are each shallower in depth and
    shorter in duration (peak→trough), with volume drying up on the latest
    decline. Fires LONG when 2+ contracting swings are confirmed near the pivot.
    """
    df = _ensure(df)
    if len(df) < 60:
        return _vote("VCP", Verdict.WAIT, 0.0)

    n = min(len(df), 120)
    c_ = df["close"].iloc[-n:].reset_index(drop=True)
    h_ = df["high"].iloc[-n:].reset_index(drop=True)
    l_ = df["low"].iloc[-n:].reset_index(drop=True)
    v_ = df["volume"].iloc[-n:].reset_index(drop=True)

    # pw=7 for more robust daily swing detection
    pw = 7
    swing_highs = [
        (i, float(h_.iloc[i]))
        for i in range(pw, len(h_) - pw)
        if float(h_.iloc[i]) == float(h_.iloc[i - pw:i + pw + 1].max())
    ]
    swing_lows = [
        (i, float(l_.iloc[i]))
        for i in range(pw, len(l_) - pw)
        if float(l_.iloc[i]) == float(l_.iloc[i - pw:i + pw + 1].min())
    ]

    if len(swing_highs) < 2 or not swing_lows:
        return _vote("VCP", Verdict.WAIT, 0.0, "insufficient swing data")

    # Build pullbacks: (depth, decline_duration, peak_idx, trough_idx)
    # duration = peak→trough only (not peak→peak cycle)
    pullbacks = []
    for j in range(len(swing_highs) - 1):
        h_idx, h_val = swing_highs[j]
        h2_idx = swing_highs[j + 1][0]
        between = [(idx, val) for idx, val in swing_lows if h_idx < idx < h2_idx]
        if between:
            trough_idx, trough_val = min(between, key=lambda x: x[1])
            depth = (h_val - trough_val) / h_val
            decline_dur = trough_idx - h_idx
            pullbacks.append((depth, decline_dur, h_idx, trough_idx))

    if len(pullbacks) < 2:
        return _vote("VCP", Verdict.WAIT, 0.0, f"need 2+ pullbacks, got {len(pullbacks)}")

    recent = pullbacks[-3:]
    if len(recent) < 2:
        return _vote("VCP", Verdict.WAIT, 0.0)

    depths = [p[0] for p in recent]
    durations = [p[1] for p in recent]

    depth_ok = all(depths[i] > depths[i + 1] for i in range(len(depths) - 1))
    dur_ok = all(durations[i] >= durations[i + 1] for i in range(len(durations) - 1))

    # Volume dry-up: measure volume during the latest decline (h_idx→trough_idx)
    last_h_i = pullbacks[-1][2]
    last_t_i = pullbacks[-1][3]
    if last_t_i > last_h_i and last_h_i > 0:
        decline_vol = float(v_.iloc[last_h_i:last_t_i + 1].mean())
        prior_start = max(0, last_h_i - 20)
        prior_vol_s = v_.iloc[prior_start:last_h_i]
        vol_dry = len(prior_vol_s) > 0 and decline_vol < float(prior_vol_s.mean()) * 0.85
    else:
        vol_dry = False

    last_pivot = swing_highs[-1][1]
    near_pivot = float(c_.iloc[-1]) >= last_pivot * 0.95

    if depth_ok and dur_ok and vol_dry:
        conf = min(0.85, 0.5 + len(recent) * 0.08 + (0.1 if near_pivot else 0))
        detail = f"{len(recent)} contractions {[f'{d*100:.0f}%' for d in depths]}"
        return _vote("VCP", Verdict.LONG, conf, detail)
    if depth_ok:
        return _vote("VCP", Verdict.WAIT, 0.3, f"partial VCP {[f'{d*100:.0f}%' for d in depths]}")
    return _vote("VCP", Verdict.WAIT, 0.0)


# ---------------- MOMENTUM / BREAKOUT ----------------

def pocket_pivot(df):
    """Pocket Pivot — early institutional accumulation signal.

    Up-day volume must exceed the highest down-day volume in the prior 10
    sessions. Requires price to be constructively near the 50-day MA.
    """
    df = _ensure(df)
    if len(df) < 12:
        return _vote("Pocket Pivot", Verdict.WAIT, 0.0)

    c, v = df["close"], df["volume"]
    if _last(c) <= float(c.iloc[-2]):
        return _vote("Pocket Pivot", Verdict.WAIT, 0.0, "not an up day")

    # Require price near or above 50-day MA — filters downtrend bounces
    ma50 = _last(df["ema_50"])
    if not np.isnan(ma50) and _last(c) < ma50 * 0.95:
        return _vote("Pocket Pivot", Verdict.WAIT, 0.0, "below 50-day MA — no constructive base")

    today_vol = float(v.iloc[-1])
    down_vols = [
        float(v.iloc[i])
        for i in range(-11, -1)
        if float(c.iloc[i]) < float(c.iloc[i - 1])
    ]
    if not down_vols:
        return _vote("Pocket Pivot", Verdict.WAIT, 0.2, "no down days in prior 10")

    max_down_vol = max(down_vols)
    if today_vol > max_down_vol:
        ratio = today_vol / max_down_vol
        conf = min(0.85, 0.5 + (ratio - 1) * 0.15)
        return _vote("Pocket Pivot", Verdict.LONG, conf, f"vol {ratio:.1f}x max down-day vol")
    return _vote("Pocket Pivot", Verdict.WAIT, 0.0)


def buyable_gap_up(df):
    """Buyable Gap Up — gap open above prior high on heavy volume, close holds.

    Standard O'Neil rule: close must remain above the prior day's high.
    Failed BGU (gap fills below prior high) is bearish.
    """
    df = _ensure(df)
    if len(df) < 22:
        return _vote("Buyable Gap Up", Verdict.WAIT, 0.0)

    open_ = float(df["open"].iloc[-1])
    close_ = float(df["close"].iloc[-1])
    prev_high = float(df["high"].iloc[-2])

    if open_ <= prev_high:
        return _vote("Buyable Gap Up", Verdict.WAIT, 0.0)

    avg_vol = float(df["volume"].iloc[-22:-1].mean())
    vol_ok = float(df["volume"].iloc[-1]) >= 1.5 * avg_vol
    not_filled = close_ > prev_high

    if vol_ok and not_filled:
        gap_pct = (open_ - prev_high) / prev_high * 100
        return _vote("Buyable Gap Up", Verdict.LONG, 0.80, f"BGU gap={gap_pct:.1f}% above prev high")
    if not not_filled:
        return _vote("Buyable Gap Up", Verdict.SHORT, 0.45, "failed BGU — gap filled")
    return _vote("Buyable Gap Up", Verdict.WAIT, 0.25, "gap up, volume insufficient")


def high_tight_flag(df):
    """High Tight Flag — 80%+ surge in ≤8 weeks, then <25% tight consolidation.

    Scans for the surge peak (must be ≥5 bars ago to allow flag to form),
    finds the surge low as the minimum of the 40 bars before the peak, then
    measures the flag as the maximum drawdown from the peak — not just today's
    close — so a partially-recovered flag is still captured correctly.
    """
    df = _ensure(df)
    if len(df) < 80:
        return _vote("High Tight Flag", Verdict.WAIT, 0.0)

    # numpy arrays for cleaner indexing
    c_arr = df["close"].values[-80:]
    v_arr = df["volume"].values[-80:]
    n = len(c_arr)

    # Find the best surge peak: highest surging peak that occurred 5-60 bars ago
    htf_peak_i = None
    htf_surge = 0.0

    for peak_i in range(n - 5, max(n - 61, -1), -1):
        if peak_i < 1:
            break
        peak_val = c_arr[peak_i]
        start = max(0, peak_i - 40)
        surge_low = c_arr[start:peak_i].min()
        if surge_low <= 0:
            continue
        surge = peak_val / surge_low - 1
        if surge >= 0.80 and surge > htf_surge:
            htf_surge = surge
            htf_peak_i = peak_i

    if htf_peak_i is None:
        return _vote("High Tight Flag", Verdict.WAIT, 0.0)

    # Flag metrics from peak to today
    flag_c = c_arr[htf_peak_i:]
    flag_v = v_arr[htf_peak_i:]
    peak_val = c_arr[htf_peak_i]

    # Pullback = deepest drawdown from peak within the flag period
    flag_low = flag_c.min()
    pullback = (peak_val - flag_low) / peak_val

    # Volume: flag avg vs pre-surge avg (40 bars before peak)
    pre_start = max(0, htf_peak_i - 40)
    pre_v = v_arr[pre_start:htf_peak_i]
    vol_dry = len(pre_v) > 0 and flag_v.mean() < pre_v.mean() * 0.85

    surge_pct = htf_surge * 100

    if pullback < 0.25 and vol_dry:
        return _vote("High Tight Flag", Verdict.LONG, 0.90,
                     f"HTF: +{surge_pct:.0f}% surge, {pullback*100:.0f}% flag, vol dry")
    if pullback < 0.25:
        return _vote("High Tight Flag", Verdict.LONG, 0.65,
                     f"HTF: +{surge_pct:.0f}% surge, flag forming")
    return _vote("High Tight Flag", Verdict.WAIT, 0.3,
                 f"HTF surge +{surge_pct:.0f}% but flag {pullback*100:.0f}% deep")
