"""Backtest-only cost/fill model (design spec §11). Re-prices each engine exit:
exact intraday fills when intraday bars exist, else a conservative daily fallback
(stop -> min(stop, exit-day open) gap-through; target/time/bias -> next-bar open;
straddle day -> stop-first). All fills are net of slippage + commission. Lives
outside the engine so live arrows never see slippage."""
import warnings
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
    except Exception as exc:  # degrade to daily-fallback fills, but make it observable
        warnings.warn(f"intraday fetch failed for {ticker!r} ({exc!r}); using daily fallback")
        intr = None

    def fetch(day_ts) -> pd.DataFrame | None:
        if intr is None or intr.empty:
            return None
        d = pd.Timestamp(day_ts).date()
        sl = intr[intr.index.normalize() == pd.Timestamp(d)]
        return sl if len(sl) else None

    return fetch


def _ibkr_window(ticker: str, years: int, bar_size: str) -> pd.DataFrame:
    """Page IBKR hourly bars back `years` in <=1Y chunks (IBKR's per-request cap
    for intraday sizes), oldest-first. Isolated so tests can monkeypatch it."""
    from ..data.ibkr import IBKRClient
    client = IBKRClient.instance()
    frames, end = [], ""
    for _ in range(max(1, years)):
        chunk = client.historical_bars(ticker, end=end, duration="1 Y", bar_size=bar_size)
        if chunk.empty:
            break
        frames.append(chunk)
        end = chunk.index[0].strftime("%Y%m%d %H:%M:%S")
    if not frames:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    combined = pd.concat(frames).sort_index()
    return combined[~combined.index.duplicated()]


def make_ibkr_intraday_fetcher(ticker: str, *, years: int = 5, bar_size: str = "1 hour"):
    """fetch(day_ts) -> that day's IBKR intraday bars, or None. Any IBKR failure
    (TWS down, no subscription, missing day) degrades to None so the backtest falls
    back to the conservative daily fill model rather than crashing."""
    try:
        intr = _ibkr_window(ticker, years, bar_size)
    except Exception as exc:  # degrade to daily-fallback fills, but make it observable
        warnings.warn(f"IBKR intraday fetch failed for {ticker!r} ({exc!r}); using daily fallback")
        intr = None

    def fetch(day_ts):
        if intr is None or intr.empty:
            return None
        sl = intr[intr.index.normalize() == pd.Timestamp(pd.Timestamp(day_ts).date())]
        return sl if len(sl) else None

    return fetch
