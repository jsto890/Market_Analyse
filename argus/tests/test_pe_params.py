from dataclasses import FrozenInstanceError
from argus.position_engine.params import EngineParams, DEFAULT
from argus.position_engine.bias import BiasState, step_bias, ENTER, LEAVE, CONFIRM, DWELL
from argus.position_engine.strength import arm_eligible, ARM, DISARM


def test_defaults_equal_phase1_constants():
    assert (DEFAULT.bias_enter, DEFAULT.bias_leave) == (ENTER, LEAVE)
    assert DEFAULT.confirm_bars == CONFIRM and DEFAULT.min_dwell == DWELL
    assert (DEFAULT.arm, DEFAULT.disarm) == (ARM, DISARM)


def test_params_is_frozen():
    import pytest
    with pytest.raises(FrozenInstanceError):
        DEFAULT.arm = 99  # frozen dataclass


def test_arm_gate_respects_injected_params():
    loose = EngineParams(arm=10, disarm=5)
    assert arm_eligible(False, 12) is False
    assert arm_eligible(False, 12, loose) is True


def test_step_bias_respects_injected_enter_threshold():
    easy = EngineParams(bias_enter=2, confirm_bars=1, min_dwell=0)
    st = BiasState(bias="NEUTRAL", bars_in_state=99)
    assert step_bias(st, 2).bias == "NEUTRAL"
    assert step_bias(st, 2, easy).bias == "LONG"
