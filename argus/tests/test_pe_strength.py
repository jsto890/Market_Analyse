from argus.position_engine.strength import score_strength, tier_of, arm_eligible


def test_tiers():
    assert tier_of(10) == "weak"
    assert tier_of(55) == "building"
    assert tier_of(85) == "strong"


def test_score_clamps_and_averages():
    comp = {"S1": 80, "S2": 80, "S3": 80, "S4": 80, "S5": 80}
    s, tier = score_strength(comp)
    assert s == 80 and tier == "strong"
    s2, _ = score_strength({"S1": 0, "S2": 0, "S3": 0, "S4": 0, "S5": 0})
    assert s2 == 0


def test_arm_gate_hysteresis():
    assert arm_eligible(False, 60) is True      # crosses arm=50
    assert arm_eligible(False, 45) is False     # below arm
    assert arm_eligible(True, 45) is True        # stays armed in [40,50)
    assert arm_eligible(True, 38) is False       # drops below disarm=40
