"""Base classes for the voting-agent system."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Callable
import pandas as pd


class Verdict(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    WAIT = "WAIT"


@dataclass
class Vote:
    agent: str
    verdict: Verdict
    confidence: float  # 0..1
    note: str = ""
    family: str = ""


@dataclass
class Agent:
    name: str
    family: str  # trend / momentum / volume / volatility / structure / institutional
    fn: Callable[[pd.DataFrame], Vote]
    description: str = ""

    def vote(self, df: pd.DataFrame) -> Vote:
        try:
            v = self.fn(df)
            v.family = self.family
            return v
        except Exception as e:  # never crash the ensemble on one bad agent
            return Vote(self.name, Verdict.WAIT, 0.0, f"error: {e}", self.family)
