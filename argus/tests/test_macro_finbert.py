from argus.macro.finbert import score_headline, score_batch


def test_score_sign_is_directionally_correct():
    pos = score_headline("shares surge to record high on blowout profit and raised guidance")
    neg = score_headline("stock collapses on bankruptcy filing and massive write-downs")
    assert pos > 0.3
    assert neg < -0.3
    assert -1.0 <= pos <= 1.0 and -1.0 <= neg <= 1.0


def test_batch_matches_single_and_handles_empty():
    texts = ["profit beats expectations", "", "guidance slashed amid weak demand"]
    out = score_batch(texts)
    assert len(out) == 3
    assert out[1] == 0.0           # empty headline → neutral 0.0
    assert out[0] > 0 and out[2] < 0
