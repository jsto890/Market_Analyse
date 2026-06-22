"""Persistence for the Position Engine. write_signal upserts per-bar rows;
open/close_trade manage round-trips. progress_denom is NEVER written here — only
via events.record_event (the anti-silent-rescale rule)."""
_SIG_COLS = ("ts", "ticker", "tf", "model_ver", "bias", "bias_strength", "strength_tier",
             "overlay", "entry", "stop", "target", "avg_cost", "leg_count", "progress_r",
             "progress_pct", "progress_denom", "progress_anchor", "health", "health_flags",
             "risk_state", "structure", "exit_reason", "cooldown_until", "run_kind", "data_date")


def write_signal(conn, row: dict) -> None:
    cols = ",".join(_SIG_COLS)
    ph = ",".join(f":{c}" for c in _SIG_COLS)
    conn.execute(f"INSERT OR REPLACE INTO position_signals ({cols}) VALUES ({ph})",
                 {c: row.get(c) for c in _SIG_COLS})
    conn.commit()


def open_trade(conn, *, ticker, tf, model_ver, mode, entry_ts, entry_px, qty,
               init_stop, init_target) -> int:
    cur = conn.execute(
        "INSERT INTO trades (ticker,tf,model_ver,mode,side,entry_ts,entry_px,qty,"
        "init_stop,init_target,leg_count) VALUES (?,?,?,?,'long',?,?,?,?,?,1)",
        (ticker, tf, model_ver, mode, entry_ts, entry_px, qty, init_stop, init_target))
    conn.commit()
    return cur.lastrowid


def close_trade(conn, trade_id: int, *, exit_ts, exit_px, exit_reason,
                r_multiple=None, mae_r=None, mfe_r=None, holding_bars=None) -> None:
    conn.execute(
        "UPDATE trades SET exit_ts=?, exit_px=?, exit_reason=?, r_multiple=?, "
        "mae_r=?, mfe_r=?, holding_bars=? WHERE id=?",
        (exit_ts, exit_px, exit_reason, r_multiple, mae_r, mfe_r, holding_bars, trade_id))
    conn.commit()


def add_leg(conn, *, trade_id, leg_no, ts, px, qty, kind) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO trade_legs (trade_id,leg_no,ts,px,qty,kind) VALUES (?,?,?,?,?,?)",
        (trade_id, leg_no, ts, px, qty, kind))
    conn.commit()
