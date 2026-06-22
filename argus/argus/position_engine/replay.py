"""Replay driver (design spec §10/§12). Walks a ticker's daily history bar by bar:
computes bias/strength/levels (pure), steps bias + overlay state machines, and
persists position_signals + trades. Single-shot entries; health=None (Phase 3).
WARMUP bars are skipped so indicators are valid. Used by both the live job and the
on-demand 'Run model' endpoint (run_kind differs)."""
import pandas as pd

from .bias import BiasState, step_bias, bias_score
from .strength import strength_components, score_strength, arm_eligible
from .levels import entry_trigger, compute_levels, gap_skip
from .overlay import OverlayState, OverlayCtx, step_overlay
from .progress import progress_r, progress_pct, risk_state
from . import store as _store

WARMUP = 200  # need 200-SMA etc.


def _clear_prior_trades(conn, ticker, model_ver, mode):
    """Replay is a full recompute, so its prior trades/legs/events must be cleared
    first — open_trade is a plain INSERT under a UNIQUE(entry_ts) key, so a second
    run would otherwise collide. position_signals self-replace via their PK."""
    conn.execute(
        "DELETE FROM trade_legs WHERE trade_id IN "
        "(SELECT id FROM trades WHERE ticker=? AND tf='1d' AND model_ver=? AND mode=?)",
        (ticker, model_ver, mode))
    conn.execute(
        "DELETE FROM position_events WHERE ticker=? AND tf='1d' AND model_ver=?",
        (ticker, model_ver))
    conn.execute(
        "DELETE FROM trades WHERE ticker=? AND tf='1d' AND model_ver=? AND mode=?",
        (ticker, model_ver, mode))
    conn.commit()


def replay(conn, *, ticker, daily: pd.DataFrame, spy: pd.DataFrame,
           sector: pd.DataFrame | None, model_ver: str, run_kind: str = "live",
           mode: str = "paper") -> int:
    data_date = str(daily.index[-1].date())
    weekly = daily.resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    _clear_prior_trades(conn, ticker, model_ver, mode)

    bstate = BiasState()
    ostate = OverlayState("FLAT")
    armed_prev = False
    trade_id = None
    cur_levels = None
    init_stop = init_target = entry_px = None
    n = 0

    for i in range(WARMUP, len(daily)):
        win = daily.iloc[: i + 1]
        bar = daily.iloc[i]
        ts = str(daily.index[i].date())
        wk = weekly[weekly.index <= daily.index[i]]

        score = bias_score(win, wk)
        bstate = step_bias(bstate, score)
        comp = strength_components(win, spy.iloc[: i + 1], sector.iloc[: i + 1] if sector is not None else None)
        strength, tier = score_strength(comp)
        armed_prev = arm_eligible(armed_prev, strength) if bstate.bias == "LONG" else False

        # entry signal on completed bar (used when overlay is FLAT)
        sig = entry_trigger(win) if (bstate.bias == "LONG" and armed_prev) else False
        if sig and ostate.overlay == "FLAT":
            cur_levels = compute_levels(entry_px=float(bar["close"]), daily=win)

        levels = cur_levels or {"entry": None, "stop": None, "target": None, "armed": False}
        ctx = OverlayCtx(bias=bstate.bias, armed_eligible=armed_prev, entry_signal=sig,
                         bar_open=float(bar["open"]), bar_high=float(bar["high"]),
                         bar_low=float(bar["low"]), bar_close=float(bar["close"]),
                         levels=levels, bar_index=i, cooldown_until=ostate.cooldown_until)
        prev_overlay = ostate.overlay
        ostate, exit_reason, events = step_overlay(ostate, ctx)

        # side effects on transitions
        if prev_overlay == "ARMED" and ostate.overlay == "LONG":
            fill = events[0]["fill_px"]
            if cur_levels and gap_skip(cur_levels["entry"], fill, cur_levels["atr"]):
                ostate = OverlayState("FLAT")  # gap-skip: abandon the fill
                cur_levels = None
            else:
                entry_px, init_stop, init_target = fill, cur_levels["stop"], cur_levels["target"]
                trade_id = _store.open_trade(conn, ticker=ticker, tf="1d", model_ver=model_ver,
                                             mode=mode, entry_ts=ts, entry_px=fill, qty=1.0,
                                             init_stop=init_stop, init_target=init_target)
        if ostate.overlay == "EXIT" and trade_id is not None:
            exit_px = init_stop if exit_reason == "stop" else float(bar["open"])
            r = progress_r(exit_px, entry_px, init_stop) if entry_px else None
            _store.close_trade(conn, trade_id, exit_ts=ts, exit_px=exit_px,
                               exit_reason=exit_reason, r_multiple=r)
            trade_id = None

        # per-bar signal row
        pr = progress_r(float(bar["close"]), entry_px, init_stop) if (ostate.overlay == "LONG" and entry_px) else None
        pp = progress_pct(float(bar["close"]), init_stop, init_target) if (ostate.overlay == "LONG" and init_stop) else None
        rs = risk_state(init_stop, entry_px, init_stop) if (ostate.overlay == "LONG" and entry_px) else None
        _store.write_signal(conn, {
            "ts": ts, "ticker": ticker, "tf": "1d", "model_ver": model_ver,
            "bias": bstate.bias, "bias_strength": strength, "strength_tier": tier,
            "overlay": ostate.overlay, "entry": entry_px if ostate.overlay == "LONG" else None,
            "stop": init_stop if ostate.overlay == "LONG" else None,
            "target": init_target if ostate.overlay == "LONG" else None,
            "avg_cost": entry_px if ostate.overlay == "LONG" else None,
            "leg_count": 1 if ostate.overlay == "LONG" else 0,
            "progress_r": pr, "progress_pct": pp,
            "progress_denom": (init_target - entry_px) if (ostate.overlay == "LONG" and entry_px) else None,
            "progress_anchor": None, "health": None, "health_flags": None, "risk_state": rs,
            "structure": None, "exit_reason": exit_reason, "cooldown_until": ostate.cooldown_until,
            "run_kind": run_kind, "data_date": data_date,
        })
        # EXIT is transient — clear trade levels after persisting the exit bar
        if ostate.overlay == "EXIT":
            entry_px = init_stop = init_target = cur_levels = None
        n += 1
    return n
