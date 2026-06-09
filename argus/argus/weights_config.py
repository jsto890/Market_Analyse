"""Single source of truth for bridge scoring weights.

Loads config/weights.yaml (override path via $WEIGHTS_CONFIG). Validates the
constraints and falls back to in-code defaults if the file is missing or invalid,
so the live pipeline can never be broken by a bad or half-written config.
"""
from __future__ import annotations

import os
from pathlib import Path

# In-code defaults — used if the config file is missing or fails validation.
_DEFAULT_BRIDGE = {"sentiment": 0.35, "technical": 0.45, "catalyst": 0.20}
_DEFAULT_INTRA = {
    "event_catalyst": 0.40,
    "squeeze_setup": 0.20,
    "earnings_proximity": 0.15,
    "growth_profitability": 0.15,
    "analyst_upside": 0.10,
}

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_PATH = _REPO_ROOT / "config" / "weights.yaml"


def _config_path() -> Path:
    return Path(os.environ.get("WEIGHTS_CONFIG", str(_DEFAULT_PATH)))


def _valid(weights: dict, expected_keys: set, lo: float, hi: float) -> bool:
    if set(weights) != expected_keys:
        return False
    vals = [weights[k] for k in expected_keys]
    if any(not isinstance(v, (int, float)) or v < lo or v > hi for v in vals):
        return False
    return abs(sum(vals) - 1.0) < 1e-6


def load_weights() -> tuple[dict, dict]:
    """Return (bridge_weights, catalyst_intra_weights), falling back to defaults."""
    path = _config_path()
    try:
        import yaml
        with path.open() as fh:
            cfg = yaml.safe_load(fh) or {}
    except Exception:
        return dict(_DEFAULT_BRIDGE), dict(_DEFAULT_INTRA)

    bridge = cfg.get("bridge", {})
    intra = cfg.get("catalyst_intra", {})
    if not _valid(bridge, set(_DEFAULT_BRIDGE), 0.10, 1.0):
        bridge = dict(_DEFAULT_BRIDGE)
    if not _valid(intra, set(_DEFAULT_INTRA), 0.05, 0.50):
        intra = dict(_DEFAULT_INTRA)
    return dict(bridge), dict(intra)


BRIDGE_WEIGHTS, INTRA_WEIGHTS = load_weights()
