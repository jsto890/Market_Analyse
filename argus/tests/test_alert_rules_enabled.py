import sqlite3


def test_set_rule_enabled_toggles_and_persists():
    from argus.alerts.rules import add_rule, set_rule_enabled, list_rules

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    rule = add_rule(conn, "verdict", "NVDA", {"target": "LONG"})
    assert rule["enabled"] is True

    ok = set_rule_enabled(conn, rule["id"], False)
    assert ok is True
    rules = list_rules(conn)
    assert rules[0]["enabled"] is False

    ok2 = set_rule_enabled(conn, rule["id"], True)
    assert ok2 is True
    assert list_rules(conn)[0]["enabled"] is True


def test_set_rule_enabled_returns_false_for_unknown_id():
    from argus.alerts.rules import set_rule_enabled

    conn = sqlite3.connect(":memory:")
    assert set_rule_enabled(conn, 9999, False) is False
