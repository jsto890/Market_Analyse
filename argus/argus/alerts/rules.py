"""Alert rules engine.

A rule watches a condition the app already computes and fires (dispatch + log)
when it flips, with per-rule dedupe so it doesn't spam. Kinds:

  verdict  {target}        - the action_card verdict for `symbol` becomes `target`
  earnings {days}          - `symbol` has earnings within `days` (once/day)
  price    {level,dir}     - `symbol` price crosses `dir` ("above"/"below") `level`

Evaluated on demand via /api/alerts/evaluate (wire to launchd for polling).
"""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timezone
from typing import Optional

from ..db import get_conn

SCHEMA = """
CREATE TABLE IF NOT EXISTS alert_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT NOT NULL,
    symbol        TEXT NOT NULL,
    params_json   TEXT NOT NULL DEFAULT '{}',
    note          TEXT,
    enabled       INTEGER NOT NULL DEFAULT 1,
    created_ts    TEXT NOT NULL,
    last_fired_ts TEXT,
    last_state    TEXT
);
"""

VALID_KINDS = {"verdict", "earnings", "price"}


def ensure_rules_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    try:
        d["params"] = json.loads(d.pop("params_json") or "{}")
    except (json.JSONDecodeError, TypeError):
        d["params"] = {}
    d["enabled"] = bool(d["enabled"])
    return d


def list_rules(conn: sqlite3.Connection) -> list[dict]:
    ensure_rules_schema(conn)
    rows = conn.execute("SELECT * FROM alert_rules ORDER BY id DESC").fetchall()
    return [_row(r) for r in rows]


def add_rule(conn: sqlite3.Connection, kind: str, symbol: str,
             params: dict, note: str | None = None) -> dict:
    ensure_rules_schema(conn)
    kind = kind.lower().strip()
    if kind not in VALID_KINDS:
        raise ValueError(f"unknown kind '{kind}' (want one of {sorted(VALID_KINDS)})")
    cur = conn.execute(
        "INSERT INTO alert_rules (kind, symbol, params_json, note, enabled, created_ts) "
        "VALUES (?,?,?,?,1,?)",
        (kind, symbol.upper().strip(), json.dumps(params or {}), note,
         datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    r = conn.execute("SELECT * FROM alert_rules WHERE id=?", (cur.lastrowid,)).fetchone()
    return _row(r)


def delete_rule(conn: sqlite3.Connection, rule_id: int) -> bool:
    ensure_rules_schema(conn)
    cur = conn.execute("DELETE FROM alert_rules WHERE id=?", (rule_id,))
    conn.commit()
    return cur.rowcount > 0


def set_rule_enabled(conn: sqlite3.Connection, rule_id: int, enabled: bool) -> bool:
    ensure_rules_schema(conn)
    cur = conn.execute(
        "UPDATE alert_rules SET enabled=? WHERE id=?", (1 if enabled else 0, rule_id)
    )
    conn.commit()
    return cur.rowcount > 0


def _set_state(conn: sqlite3.Connection, rule_id: int, state: str | None,
               fired: bool) -> None:
    if fired:
        conn.execute(
            "UPDATE alert_rules SET last_state=?, last_fired_ts=? WHERE id=?",
            (state, datetime.now(timezone.utc).isoformat(), rule_id))
    else:
        conn.execute("UPDATE alert_rules SET last_state=? WHERE id=?", (state, rule_id))
    conn.commit()


# ── per-kind evaluation: returns (fire, new_state, title, body) ──────────────

def _eval_verdict(rule: dict) -> tuple[bool, str | None, str, str]:
    from ..action_card import build_action_card
    sym = rule["symbol"]
    target = str(rule["params"].get("target", "LONG")).upper()
    try:
        card = build_action_card(sym) or {}
    except Exception:
        return False, rule.get("last_state"), "", ""
    v = str(card.get("verdict") or "").upper()
    fire = bool(v) and v == target and rule.get("last_state") != target
    body = (f"{sym} verdict is now {v} "
            f"(score {card.get('score')}, R:R {card.get('risk_reward')})")
    return fire, v or rule.get("last_state"), f"{sym}: verdict → {v}", body


def _eval_earnings(rule: dict, conn: sqlite3.Connection) -> tuple[bool, str | None, str, str]:
    from ..calendar.store import upcoming as calendar_upcoming
    from ..calendar.schema import ensure_calendar_schema
    sym = rule["symbol"]
    days = int(rule["params"].get("days", 3))
    ensure_calendar_schema(conn)
    today = date.today().isoformat()
    events = [dict(e) for e in calendar_upcoming(conn, today, days)]
    hit = next((e for e in events
                if str(e.get("category") or "") == "earnings"
                and str(e.get("symbol") or "").upper() == sym), None)
    # once per day
    fire = hit is not None and rule.get("last_state") != today
    state = today if hit is not None else rule.get("last_state")
    body = f"{sym} earnings {hit.get('date') if hit else ''} (within {days}d)"
    return fire, state, f"{sym}: earnings soon", body


def _eval_price(rule: dict) -> tuple[bool, str | None, str, str]:
    from ..data import get_quote
    sym = rule["symbol"]
    p = rule["params"]
    level = p.get("level")
    direction = str(p.get("direction", "above")).lower()
    if level is None:
        return False, rule.get("last_state"), "", ""
    q = get_quote(sym) or {}
    price = q.get("price")
    if price is None:
        return False, rule.get("last_state"), "", ""
    side = "above" if price >= float(level) else "below"
    fire = side == direction and rule.get("last_state") != direction
    body = f"{sym} crossed {direction} {level} (now {price:.2f})"
    return fire, side, f"{sym}: {direction} {level}", body


def evaluate_rules(conn: Optional[sqlite3.Connection] = None,
                   fire: bool = True) -> list[dict]:
    """Evaluate every enabled rule; dispatch+log fired ones. Returns fired list."""
    own = conn is None
    conn = conn or get_conn()
    fired: list[dict] = []
    try:
        for rule in list_rules(conn):
            if not rule["enabled"]:
                continue
            try:
                if rule["kind"] == "verdict":
                    do_fire, state, title, body = _eval_verdict(rule)
                elif rule["kind"] == "earnings":
                    do_fire, state, title, body = _eval_earnings(rule, conn)
                elif rule["kind"] == "price":
                    do_fire, state, title, body = _eval_price(rule)
                else:
                    continue
            except Exception:
                continue
            _set_state(conn, rule["id"], state, do_fire)
            if do_fire and fire:
                _dispatch(title, body, {"rule_id": rule["id"], "kind": rule["kind"],
                                        "symbol": rule["symbol"]})
                fired.append({"rule_id": rule["id"], "title": title, "body": body})
    finally:
        if own:
            conn.close()
    return fired


def _dispatch(title: str, body: str, payload: dict) -> None:
    from .dispatcher import dispatch_alert, AlertChannels
    from .log import AlertLog
    ch = dispatch_alert(title, body, payload, AlertChannels())
    try:
        AlertLog().log_alert(title, body, payload, {"results": ch.results})
    except Exception:
        pass


def main() -> int:
    from ..db import heartbeat
    fired = evaluate_rules()
    heartbeat("alerts-evaluate", "ok", f"{len(fired)} fired")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
