import pytest
from argus.position_engine.overlay import OverlayState, OverlayCtx, step_overlay, COOLDOWN_BARS


def ctx(**kw):
    base = dict(bias="LONG", armed_eligible=True, entry_signal=False,
                bar_open=100.0, bar_high=101.0, bar_low=99.0, bar_close=100.0,
                levels={"entry": 100.0, "stop": 95.0, "target": 115.0},
                bar_index=100, cooldown_until=None)
    base.update(kw)
    return OverlayCtx(**base)


def test_flat_to_armed_to_long_fills_at_open():
    st = OverlayState(overlay="FLAT")
    st2, reason, ev = step_overlay(st, ctx(entry_signal=True))
    assert st2.overlay == "ARMED" and ev == []        # signal bar arms, no fill yet
    # next bar: ARMED → LONG, fill at the bar's OPEN
    st3, reason, ev = step_overlay(st2, ctx(bar_open=100.5))
    assert st3.overlay == "LONG"
    assert ev and ev[0]["kind"] == "entry" and ev[0]["fill_px"] == 100.5


def test_stop_hit_exits_with_reason_stop():
    st = OverlayState(overlay="LONG", entry_index=90)
    st2, reason, ev = step_overlay(st, ctx(bar_index=120, bar_low=94.0))  # gaps/tags stop 95
    assert st2.overlay == "EXIT" and reason == "stop"


def test_target_hit_exits_with_reason_target():
    st = OverlayState(overlay="LONG", entry_index=90)
    st2, reason, _ = step_overlay(st, ctx(bar_index=120, bar_high=116.0))
    assert st2.overlay == "EXIT" and reason == "target"


def test_min_hold_blocks_nonstop_exit():
    st = OverlayState(overlay="LONG", entry_index=118)
    # only 1 bar held; a (future) health/time exit must be blocked, but a stop still fires
    st2, reason, _ = step_overlay(st, ctx(bar_index=119, bar_low=94.0))
    assert reason == "stop"   # stop always allowed inside min-hold


def test_bias_flip_forces_exit():
    st = OverlayState(overlay="LONG", entry_index=90)
    st2, reason, _ = step_overlay(st, ctx(bias="NEUTRAL", bar_index=120))
    assert st2.overlay == "EXIT" and reason == "bias_flip"


def test_exit_settles_to_cooldown_then_flat():
    st = OverlayState(overlay="EXIT")
    st2, _, _ = step_overlay(st, ctx(bar_index=120))
    assert st2.overlay == "COOLDOWN" and st2.cooldown_until == 120 + COOLDOWN_BARS
    # still locked
    st3, _, _ = step_overlay(st2, ctx(bar_index=121, entry_signal=True))
    assert st3.overlay == "COOLDOWN"
    # after the window, returns to FLAT
    st4, _, _ = step_overlay(st2, ctx(bar_index=120 + COOLDOWN_BARS))
    assert st4.overlay == "FLAT"


def test_forbidden_flat_to_long_direct():
    st = OverlayState(overlay="FLAT")
    # entry_signal alone never yields LONG on the same bar
    st2, _, _ = step_overlay(st, ctx(entry_signal=True))
    assert st2.overlay != "LONG"


def test_invariant_no_position_under_nonlong_bias():
    for ov in ("ARMED", "LONG"):
        st = OverlayState(overlay=ov, entry_index=90)
        st2, reason, _ = step_overlay(st, ctx(bias="SHORT", bar_index=120))
        assert st2.overlay == "EXIT" and reason == "bias_flip"


def test_cooldown_blocks_rearm_until_window():
    st = OverlayState(overlay="COOLDOWN", cooldown_until=130)
    st2, _, _ = step_overlay(st, ctx(bar_index=129, entry_signal=True, armed_eligible=True))
    assert st2.overlay == "COOLDOWN"   # still locked at 129
