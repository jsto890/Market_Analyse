"""Load the curated 2026 macro-release seed (config/econ_calendar_2026.yaml) and
generate the rule-based weekly events (jobless claims = every Thursday). Returns
plain event dicts ready for store.upsert_events. No I/O beyond reading the YAML."""
from datetime import date, timedelta
from pathlib import Path

import yaml

_CONFIG = Path(__file__).resolve().parents[3] / "config" / "econ_calendar_2026.yaml"


def _event(d: str, time_et, event: str, category: str, importance: str,
           source: str = "seed", ticker=None) -> dict:
    key = f"earnings:{ticker}:{d}" if ticker else f"{event}:{d}"
    return {"date": d, "time_et": time_et, "event": event, "category": category,
            "importance": importance, "source": source, "ticker": ticker,
            "dedup_key": key}


def load_seed_events(path: Path = _CONFIG) -> list[dict]:
    with open(path) as f:
        cfg = yaml.safe_load(f)
    out = []
    for ind in cfg["indicators"]:
        for d in ind["dates"]:
            out.append(_event(str(d), ind.get("time_et"), ind["event"],
                              ind["category"], ind["importance"]))
    return out


def weekly_claims(year: int = 2026) -> list[dict]:
    """Initial Jobless Claims — released every Thursday 8:30 ET."""
    d = date(year, 1, 1)
    d += timedelta(days=(3 - d.weekday()) % 7)  # first Thursday (Mon=0..Thu=3)
    out = []
    while d.year == year:
        out.append(_event(d.isoformat(), "08:30", "Initial Jobless Claims",
                          "jobs", "medium"))
        d += timedelta(days=7)
    return out


def all_seed_events(year: int = 2026) -> list[dict]:
    return load_seed_events() + weekly_claims(year)
