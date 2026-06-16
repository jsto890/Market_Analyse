"""Local FinBERT scorer (ProsusAI/finbert) — free, no API cost. Lazy singleton:
the ~8s model load happens once per process, on first score. Signed score =
P(positive) − P(negative) ∈ [−1, 1]. Empty text scores 0.0 (neutral)."""
import threading

_MODEL = "ProsusAI/finbert"
_pipe = None
_lock = threading.Lock()


def _get_pipeline():
    global _pipe
    if _pipe is None:
        with _lock:
            if _pipe is None:
                from transformers import pipeline
                _pipe = pipeline("text-classification", model=_MODEL, top_k=None)
    return _pipe


def _signed(scored) -> float:
    d = {x["label"].lower(): x["score"] for x in scored}
    return round(float(d.get("positive", 0.0) - d.get("negative", 0.0)), 4)


def score_headline(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    out = _get_pipeline()(text[:512])  # FinBERT max ~512 tokens; truncate defensively
    return _signed(out[0])


def score_batch(texts: list[str]) -> list[float]:
    """Score many headlines; empties map to 0.0 without hitting the model."""
    idx = [i for i, t in enumerate(texts) if t and t.strip()]
    results = [0.0] * len(texts)
    if not idx:
        return results
    pipe = _get_pipeline()
    outs = pipe([texts[i][:512] for i in idx])
    for i, o in zip(idx, outs):
        results[i] = _signed(o)
    return results
