"""The ONLY writer permitted to change progress_denom (design spec §10). Each
denom-mutating event (add_leg/trim/move_target) freezes the prior progress into
frozen_anchor and appends a typed row in a single transaction."""


def record_event(conn, *, trade_id, ticker, tf, model_ver, ts, kind, exit_reason=None,
                 old_denom=None, new_denom=None, old_target=None, new_target=None,
                 old_stop=None, new_stop=None, frozen_anchor=None, detail=None) -> None:
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO position_events "
            "(trade_id,ticker,tf,model_ver,ts,kind,exit_reason,old_denom,new_denom,"
            "old_target,new_target,old_stop,new_stop,frozen_anchor,detail) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (trade_id, ticker, tf, model_ver, ts, kind, exit_reason, old_denom, new_denom,
             old_target, new_target, old_stop, new_stop, frozen_anchor, detail))
