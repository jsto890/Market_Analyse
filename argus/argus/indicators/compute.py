"""Indicator computation in pure pandas/numpy. No external TA library —
everything is implemented from scratch so the project runs anywhere
Python + pandas runs.

Column-name contract: agents read these specific columns from the
returned DataFrame, so do not rename them without updating
`argus/agents/strategies.py`.
"""
from __future__ import annotations

from typing import List
import pandas as pd
import numpy as np


INDICATOR_LIST: List[str] = [
    # Trend / MA family
    "ema_8", "ema_20", "ema_50", "ema_100", "ema_200",
    "sma_20", "sma_50", "sma_150", "sma_200",
    "tema_20", "dema_20", "kama_20", "hma_20", "wma_20",
    # Momentum
    "rsi_14", "rsi_2", "stoch_k", "stoch_d", "stochrsi_k", "stochrsi_d",
    "macd", "macd_signal", "macd_hist",
    "willr_14", "cci_20", "roc_10", "mom_10", "tsi",
    # Volatility / channels
    "atr_14", "natr_14", "bbu_20", "bbm_20", "bbl_20",
    "kc_upper", "kc_basis", "kc_lower",
    "donchian_up", "donchian_basis", "donchian_low",
    # Volume
    "obv", "ad", "cmf_20", "mfi_14", "vwap",
    # Trend systems
    "adx_14", "dmp_14", "dmn_14", "psar", "supertrend", "supertrend_dir",
    # Ichimoku
    "ichi_tenkan", "ichi_kijun", "ichi_senkou_a", "ichi_senkou_b", "ichi_chikou",
    # Specials
    "wavetrend_wt1", "wavetrend_wt2", "stc",
    "ttm_squeeze", "ttm_squeeze_pro",
    "elder_bull", "elder_bear",
    "z_score_20",
    "ret_1", "ret_5", "ret_20",
    # Pre-filter / pattern
    "adr_20",
]


# ---------- primitives ----------

def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def _sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def _wma(s: pd.Series, n: int) -> pd.Series:
    weights = np.arange(1, n + 1, dtype=float)
    return s.rolling(n).apply(lambda x: np.dot(x, weights) / weights.sum(), raw=True)


def _hma(s: pd.Series, n: int) -> pd.Series:
    half = max(int(n / 2), 1)
    sqrt = max(int(np.sqrt(n)), 1)
    return _wma(2 * _wma(s, half) - _wma(s, n), sqrt)


def _kama(s: pd.Series, n: int = 20, fast: int = 2, slow: int = 30) -> pd.Series:
    change = (s - s.shift(n)).abs()
    volatility = s.diff().abs().rolling(n).sum()
    er = change / volatility.replace(0, np.nan)
    sc = (er * (2 / (fast + 1) - 2 / (slow + 1)) + 2 / (slow + 1)) ** 2
    out = pd.Series(np.nan, index=s.index)
    seed_idx = sc.first_valid_index()
    if seed_idx is None:
        return out
    out.loc[seed_idx] = s.loc[seed_idx]
    prev = s.loc[seed_idx]
    for i in s.index[s.index.get_loc(seed_idx) + 1:]:
        sci = sc.loc[i]
        if pd.isna(sci):
            out.loc[i] = prev
            continue
        prev = prev + sci * (s.loc[i] - prev)
        out.loc[i] = prev
    return out


def _tema(s: pd.Series, n: int) -> pd.Series:
    e1 = _ema(s, n)
    e2 = _ema(e1, n)
    e3 = _ema(e2, n)
    return 3 * (e1 - e2) + e3


def _dema(s: pd.Series, n: int) -> pd.Series:
    e1 = _ema(s, n)
    return 2 * e1 - _ema(e1, n)


def _rsi(s: pd.Series, n: int = 14) -> pd.Series:
    delta = s.diff()
    up = delta.clip(lower=0)
    down = -delta.clip(upper=0)
    roll_up = up.ewm(alpha=1 / n, adjust=False).mean()
    roll_dn = down.ewm(alpha=1 / n, adjust=False).mean()
    rs = roll_up / roll_dn.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _stoch(h: pd.Series, l: pd.Series, c: pd.Series, k: int = 14, d: int = 3) -> tuple[pd.Series, pd.Series]:
    ll = l.rolling(k).min()
    hh = h.rolling(k).max()
    k_line = 100 * (c - ll) / (hh - ll).replace(0, np.nan)
    d_line = k_line.rolling(d).mean()
    return k_line, d_line


def _stochrsi(c: pd.Series, n: int = 14, k: int = 3, d: int = 3) -> tuple[pd.Series, pd.Series]:
    rsi = _rsi(c, n)
    minr = rsi.rolling(n).min()
    maxr = rsi.rolling(n).max()
    raw = (rsi - minr) / (maxr - minr).replace(0, np.nan) * 100
    k_line = raw.rolling(k).mean()
    d_line = k_line.rolling(d).mean()
    return k_line, d_line


def _macd(c: pd.Series, fast: int = 12, slow: int = 26, sig: int = 9) -> tuple[pd.Series, pd.Series, pd.Series]:
    macd = _ema(c, fast) - _ema(c, slow)
    signal = _ema(macd, sig)
    hist = macd - signal
    return macd, signal, hist


def _willr(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 14) -> pd.Series:
    hh = h.rolling(n).max()
    ll = l.rolling(n).min()
    return -100 * (hh - c) / (hh - ll).replace(0, np.nan)


def _cci(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 20) -> pd.Series:
    tp = (h + l + c) / 3
    sma = tp.rolling(n).mean()
    mad = (tp - sma).abs().rolling(n).mean()
    return (tp - sma) / (0.015 * mad.replace(0, np.nan))


def _roc(s: pd.Series, n: int = 10) -> pd.Series:
    return (s / s.shift(n) - 1) * 100


def _mom(s: pd.Series, n: int = 10) -> pd.Series:
    return s - s.shift(n)


def _tsi(c: pd.Series, r: int = 25, s: int = 13) -> pd.Series:
    m = c.diff()
    ema1 = _ema(m, r); ema2 = _ema(ema1, s)
    abs_ema1 = _ema(m.abs(), r); abs_ema2 = _ema(abs_ema1, s)
    return 100 * ema2 / abs_ema2.replace(0, np.nan)


def _atr(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 14) -> pd.Series:
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def _bbands(c: pd.Series, n: int = 20, k: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    m = c.rolling(n).mean()
    s = c.rolling(n).std()
    return m + k * s, m, m - k * s


def _keltner(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 20, k: float = 2.0) -> tuple[pd.Series, pd.Series, pd.Series]:
    basis = _ema(c, n)
    atr = _atr(h, l, c, n)
    return basis + k * atr, basis, basis - k * atr


def _donchian(h: pd.Series, l: pd.Series, n: int = 20) -> tuple[pd.Series, pd.Series, pd.Series]:
    up = h.rolling(n).max()
    lo = l.rolling(n).min()
    return up, (up + lo) / 2, lo


def _obv(c: pd.Series, v: pd.Series) -> pd.Series:
    direction = np.sign(c.diff().fillna(0))
    return (direction * v).cumsum()


def _ad(h: pd.Series, l: pd.Series, c: pd.Series, v: pd.Series) -> pd.Series:
    rng = (h - l).replace(0, np.nan)
    mfm = ((c - l) - (h - c)) / rng
    return (mfm * v).fillna(0).cumsum()


def _cmf(h: pd.Series, l: pd.Series, c: pd.Series, v: pd.Series, n: int = 20) -> pd.Series:
    rng = (h - l).replace(0, np.nan)
    mfm = ((c - l) - (h - c)) / rng
    mfv = mfm * v
    return mfv.rolling(n).sum() / v.rolling(n).sum()


def _mfi(h: pd.Series, l: pd.Series, c: pd.Series, v: pd.Series, n: int = 14) -> pd.Series:
    tp = (h + l + c) / 3
    raw = tp * v
    pos = raw.where(tp > tp.shift(), 0).rolling(n).sum()
    neg = raw.where(tp < tp.shift(), 0).rolling(n).sum()
    mr = pos / neg.replace(0, np.nan)
    return 100 - 100 / (1 + mr)


def _vwap(h: pd.Series, l: pd.Series, c: pd.Series, v: pd.Series) -> pd.Series:
    tp = (h + l + c) / 3
    return (tp * v).cumsum() / v.cumsum().replace(0, np.nan)


def _adx(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 14) -> tuple[pd.Series, pd.Series, pd.Series]:
    up = h.diff()
    dn = -l.diff()
    plus_dm = ((up > dn) & (up > 0)) * up
    minus_dm = ((dn > up) & (dn > 0)) * dn
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / n, adjust=False).mean()
    plus_di = 100 * plus_dm.ewm(alpha=1 / n, adjust=False).mean() / atr.replace(0, np.nan)
    minus_di = 100 * minus_dm.ewm(alpha=1 / n, adjust=False).mean() / atr.replace(0, np.nan)
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan)
    adx = dx.ewm(alpha=1 / n, adjust=False).mean()
    return adx, plus_di, minus_di


def _psar(h: pd.Series, l: pd.Series, af_step: float = 0.02, af_max: float = 0.2) -> pd.Series:
    n = len(h)
    psar = np.zeros(n)
    if n < 2:
        return pd.Series(psar, index=h.index)
    bull = True
    af = af_step
    ep = h.iloc[0]
    psar[0] = l.iloc[0]
    for i in range(1, n):
        prev = psar[i - 1]
        if bull:
            psar[i] = prev + af * (ep - prev)
            if l.iloc[i] < psar[i]:
                bull = False
                psar[i] = ep
                ep = l.iloc[i]
                af = af_step
            else:
                if h.iloc[i] > ep:
                    ep = h.iloc[i]
                    af = min(af + af_step, af_max)
        else:
            psar[i] = prev + af * (ep - prev)
            if h.iloc[i] > psar[i]:
                bull = True
                psar[i] = ep
                ep = h.iloc[i]
                af = af_step
            else:
                if l.iloc[i] < ep:
                    ep = l.iloc[i]
                    af = min(af + af_step, af_max)
    return pd.Series(psar, index=h.index)


def _supertrend(h: pd.Series, l: pd.Series, c: pd.Series, n: int = 10, mult: float = 3.0) -> tuple[pd.Series, pd.Series]:
    atr = _atr(h, l, c, n)
    hl2 = (h + l) / 2
    upper = hl2 + mult * atr
    lower = hl2 - mult * atr
    final_upper = upper.copy()
    final_lower = lower.copy()
    for i in range(1, len(c)):
        if upper.iloc[i] < final_upper.iloc[i - 1] or c.iloc[i - 1] > final_upper.iloc[i - 1]:
            final_upper.iloc[i] = upper.iloc[i]
        else:
            final_upper.iloc[i] = final_upper.iloc[i - 1]
        if lower.iloc[i] > final_lower.iloc[i - 1] or c.iloc[i - 1] < final_lower.iloc[i - 1]:
            final_lower.iloc[i] = lower.iloc[i]
        else:
            final_lower.iloc[i] = final_lower.iloc[i - 1]

    st = pd.Series(index=c.index, dtype=float)
    direction = pd.Series(index=c.index, dtype=float)
    for i in range(len(c)):
        if i == 0:
            st.iloc[i] = final_upper.iloc[i]
            direction.iloc[i] = -1
            continue
        prev_dir = direction.iloc[i - 1]
        if prev_dir == 1:
            if c.iloc[i] < final_lower.iloc[i]:
                st.iloc[i] = final_upper.iloc[i]
                direction.iloc[i] = -1
            else:
                st.iloc[i] = final_lower.iloc[i]
                direction.iloc[i] = 1
        else:
            if c.iloc[i] > final_upper.iloc[i]:
                st.iloc[i] = final_lower.iloc[i]
                direction.iloc[i] = 1
            else:
                st.iloc[i] = final_upper.iloc[i]
                direction.iloc[i] = -1
    return st, direction


def _ichimoku(h: pd.Series, l: pd.Series, c: pd.Series) -> dict:
    conv = (h.rolling(9).max() + l.rolling(9).min()) / 2
    base = (h.rolling(26).max() + l.rolling(26).min()) / 2
    span_a = ((conv + base) / 2).shift(26)
    span_b = ((h.rolling(52).max() + l.rolling(52).min()) / 2).shift(26)
    chikou = c.shift(-26)
    return {"tenkan": conv, "kijun": base, "senkou_a": span_a, "senkou_b": span_b, "chikou": chikou}


def _wavetrend(h: pd.Series, l: pd.Series, c: pd.Series, n1: int = 10, n2: int = 21) -> tuple[pd.Series, pd.Series]:
    ap = (h + l + c) / 3
    esa = ap.ewm(span=n1, adjust=False).mean()
    d = (ap - esa).abs().ewm(span=n1, adjust=False).mean()
    ci = (ap - esa) / (0.015 * d.replace(0, np.nan))
    wt1 = ci.ewm(span=n2, adjust=False).mean()
    wt2 = wt1.rolling(4).mean()
    return wt1, wt2


def _stc(c: pd.Series, fast: int = 23, slow: int = 50, length: int = 10) -> pd.Series:
    macd = _ema(c, fast) - _ema(c, slow)
    lo = macd.rolling(length).min()
    hi = macd.rolling(length).max()
    fast_k = 100 * (macd - lo) / (hi - lo).replace(0, np.nan)
    fast_d = fast_k.ewm(span=2, adjust=False).mean()
    lo2 = fast_d.rolling(length).min()
    hi2 = fast_d.rolling(length).max()
    fast_k2 = 100 * (fast_d - lo2) / (hi2 - lo2).replace(0, np.nan)
    return fast_k2.ewm(span=2, adjust=False).mean()


# ---------- main entry ----------

def _safe(out: pd.DataFrame, name: str, val) -> None:
    if val is None:
        out[name] = np.nan
    else:
        out[name] = val


def compute_all(df: pd.DataFrame) -> pd.DataFrame:
    """Append every supported indicator to `df`. Returns a copy."""
    if df.empty or len(df) < 50:
        out = df.copy()
        for col in INDICATOR_LIST:
            out[col] = np.nan
        return out

    out = df.copy()
    h, l, c, v = out["high"], out["low"], out["close"], out["volume"]

    # Trend / MA
    for n in (8, 20, 50, 100, 200):
        out[f"ema_{n}"] = _ema(c, n)
    for n in (20, 50, 150, 200):
        out[f"sma_{n}"] = _sma(c, n)
    out["tema_20"] = _tema(c, 20)
    out["dema_20"] = _dema(c, 20)
    out["kama_20"] = _kama(c, 20)
    out["hma_20"] = _hma(c, 20)
    out["wma_20"] = _wma(c, 20)

    # Momentum
    out["rsi_14"] = _rsi(c, 14)
    out["rsi_2"] = _rsi(c, 2)
    sk, sd = _stoch(h, l, c)
    out["stoch_k"] = sk; out["stoch_d"] = sd
    srk, srd = _stochrsi(c)
    out["stochrsi_k"] = srk; out["stochrsi_d"] = srd
    macd, sig, hist = _macd(c)
    out["macd"] = macd; out["macd_signal"] = sig; out["macd_hist"] = hist
    out["willr_14"] = _willr(h, l, c, 14)
    out["cci_20"] = _cci(h, l, c, 20)
    out["roc_10"] = _roc(c, 10)
    out["mom_10"] = _mom(c, 10)
    out["tsi"] = _tsi(c)

    # Volatility / channels
    atr = _atr(h, l, c, 14)
    out["atr_14"] = atr
    out["natr_14"] = atr / c * 100
    bbu, bbm, bbl = _bbands(c, 20)
    out["bbu_20"] = bbu; out["bbm_20"] = bbm; out["bbl_20"] = bbl
    kcu, kcb, kcl = _keltner(h, l, c, 20)
    out["kc_upper"] = kcu; out["kc_basis"] = kcb; out["kc_lower"] = kcl
    du, db, dl = _donchian(h, l, 20)
    out["donchian_up"] = du; out["donchian_basis"] = db; out["donchian_low"] = dl

    # Volume
    out["obv"] = _obv(c, v)
    out["ad"] = _ad(h, l, c, v)
    out["cmf_20"] = _cmf(h, l, c, v, 20)
    out["mfi_14"] = _mfi(h, l, c, v, 14)
    out["vwap"] = _vwap(h, l, c, v)

    # Trend systems
    adx, dmp, dmn = _adx(h, l, c, 14)
    out["adx_14"] = adx; out["dmp_14"] = dmp; out["dmn_14"] = dmn
    out["psar"] = _psar(h, l)
    st, st_dir = _supertrend(h, l, c, 10, 3.0)
    out["supertrend"] = st; out["supertrend_dir"] = st_dir

    # Ichimoku
    ichi = _ichimoku(h, l, c)
    out["ichi_tenkan"] = ichi["tenkan"]
    out["ichi_kijun"] = ichi["kijun"]
    out["ichi_senkou_a"] = ichi["senkou_a"]
    out["ichi_senkou_b"] = ichi["senkou_b"]
    out["ichi_chikou"] = ichi["chikou"]

    # Specials
    wt1, wt2 = _wavetrend(h, l, c)
    out["wavetrend_wt1"] = wt1; out["wavetrend_wt2"] = wt2
    out["stc"] = _stc(c)

    # TTM Squeeze: BB inside KC
    squeeze = (out["bbu_20"] < out["kc_upper"]) & (out["bbl_20"] > out["kc_lower"])
    out["ttm_squeeze"] = squeeze.astype(int)
    out["ttm_squeeze_pro"] = (squeeze & (out["macd_hist"] > 0)).astype(int)

    # Elder Impulse
    e13 = _ema(c, 13)
    bull = (e13.diff() > 0) & (out["macd_hist"].diff() > 0)
    bear = (e13.diff() < 0) & (out["macd_hist"].diff() < 0)
    out["elder_bull"] = bull.astype(int)
    out["elder_bear"] = bear.astype(int)

    # Z-score & rolling returns
    out["z_score_20"] = (c - c.rolling(20).mean()) / c.rolling(20).std().replace(0, np.nan)
    out["ret_1"] = c.pct_change(1)
    out["ret_5"] = c.pct_change(5)
    out["ret_20"] = c.pct_change(20)

    # Average Daily Range % (simpler than ATR — raw H-L / C, 20-day mean)
    out["adr_20"] = ((h - l) / c * 100).rolling(20).mean()

    return out
