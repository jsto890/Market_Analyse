"""Backtest-only cost/fill model (design spec §11). Re-prices each engine exit:
exact intraday fills when intraday bars exist, else a conservative daily fallback
(stop -> min(stop, exit-day open) gap-through; target/time/bias -> next-bar open;
straddle day -> stop-first). All fills are net of slippage + commission. Lives
outside the engine so live arrows never see slippage."""
from dataclasses import dataclass

import pandas as pd

from ..data.market import get_history


@dataclass(frozen=True)
class FillModel:
    slippage_bps: float = 5.0          # per side
    commission_per_share: float = 0.005


def _net_sell(px: float, fm: FillModel) -> float:
    """Proceeds from selling 1 share: slippage against you + commission."""
    return px * (1.0 - fm.slippage_bps / 1e4) - fm.commission_per_share


def net_buy(px: float, fm: FillModel) -> float:
    """Cost to buy 1 share (used by metrics for the entry leg)."""
    return px * (1.0 + fm.slippage_bps / 1e4) + fm.commission_per_share


def price_exit(reason: str, *, stop: float, target: float, day: pd.Series,
               next_day: pd.Series | None, intraday: pd.DataFrame | None,
               fm: FillModel) -> tuple[str, float]:
    """Return (resolved_reason, net_exit_px) for one exit. `day` is the engine's
    exit-day OHLC; `next_day` the bar after (None at series end); `intraday` the
    day's lower-TF bars or None."""
    if intraday is not None and len(intraday) > 0:
        return _price_exit_intraday(stop, target, intraday, fm)

    stop_in = day["low"] <= stop
    target_in = day["high"] >= target
    if stop_in:                                  # stop-first on straddle days
        return "stop", _net_sell(min(stop, float(day["open"])), fm)
    if target_in:
        nxt = float((next_day if next_day is not None else day)["open"])
        return "target", _net_sell(nxt, fm)
    # neither level in range this day -> a time/bias_flip exit; fill next open
    nxt = float((next_day if next_day is not None else day)["open"])
    return reason, _net_sell(nxt, fm)


def _price_exit_intraday(stop: float, target: float, intraday: pd.DataFrame,
                         fm: FillModel) -> tuple[str, float]:
    """Walk the day's lower-TF bars; first level touched wins (resolves order)."""
    for _, b in intraday.iterrows():
        hit_stop = b["low"] <= stop
        hit_target = b["high"] >= target
        if hit_stop and hit_target:              # same sub-bar straddle -> conservative
            return "stop", _net_sell(min(stop, float(b["open"])), fm)
        if hit_stop:
            return "stop", _net_sell(min(stop, float(b["open"])), fm)
        if hit_target:
            return "target", _net_sell(max(target, float(b["open"])), fm)
    # not touched intraday (engine exit was time/bias_flip): fill at the last close
    last = float(intraday.iloc[-1]["close"])
    return "time", _net_sell(last, fm)


def make_intraday_fetcher(ticker: str, interval: str = "60m", period: str = "2y"):
    """Return fetch(day_ts) -> intraday OHLC for that calendar day, or None when
    the source has no bars for it (the common historical case). Pulled once, sliced
    per day. Source-agnostic: swap get_history for a deeper feed without changing
    the resolver."""
    try:
        intr = get_history(ticker, period=period, interval=interval)
    except Exception:
        intr = None

    def fetch(day_ts) -> pd.DataFrame | None:
        if intr is None or intr.empty:
            return None
        d = pd.Timestamp(day_ts).date()
        sl = intr[intr.index.normalize() == pd.Timestamp(d)]
        return sl if len(sl) else None

    return fetch
