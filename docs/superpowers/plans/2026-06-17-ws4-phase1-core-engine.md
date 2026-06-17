# WS-4 Phase 1 — Core Position Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the technicals-only core of the WS-4 Position Engine — the two-axis state machine (bias + trade overlay), the level model, the progress math, and the SQLite persistence — as pure, unit-tested functions plus a `replay()` driver that turns a ticker's price history into a persisted `position_signals` + `trades` stream.

**Architecture:** Pure functions (no I/O) for every signal/level/state computation (`bias`, `strength`, `levels`, `progress`, `overlay`), wrapped by a thin side-effect layer (`events`, `store`) and a `replay()` runner. Indicators come from the existing `argus/indicators/compute.py` (`_ema/_sma/_rsi/_roc/_atr/_adx`). This phase has **no backtest harness, no health monitor, no dashboard/API** (later phases) — its acceptance is unit tests + a synthetic end-to-end lifecycle test.

**Tech Stack:** Python 3.11, pandas, numpy, SQLite via `argus.db.get_conn`. Tests with pytest under `argus/tests/`. Run all commands from `/Users/josephstorey/Market_Analyse/argus`.

**Spec:** `docs/superpowers/specs/2026-06-17-ws4-position-engine-design.md` (§2–§6, §10, §12 are Phase 1).

---

## Scope of this plan

**In:** `position_engine/{__init__,schema,bias,strength,levels,progress,overlay,events,store,replay}.py` + tests. Technicals-only baseline. Daily timeframe. Single-shot entries (DCA leg accounting present in schema/store, no add-signal). Health columns exist but are written `NULL` (health is Phase 3).

**Out (later phases):** backtest harness + leakage test, health monitor signals, on-demand API + chart arrows, dashboard badges, bridge CSV migration. All parameters here are the spec's *starting points* — Phase 1 freezes them as module constants; optimisation happens in the backtest phase.

## File Structure (all under `argus/argus/position_engine/`)

| File | Responsibility | Pure? |
|---|---|---|
| `__init__.py` | package marker | — |
| `schema.py` | idempotent DDL for `position_signals`, `trades`, `trade_legs`, `position_events` | — |
| `bias.py` | `bias_score(weekly, daily)` + `step_bias(prev, score)` (Schmitt + confirm + dwell) | yes |
| `strength.py` | `strength_components(daily, spy, sector)` + `score_strength(comp)` + `arm_eligible(prev, s)` | yes |
| `levels.py` | `entry_trigger(daily)`, `compute_levels(entry_px, daily)`, `gap_skip(...)`, `trail_stop(...)` | yes |
| `progress.py` | `progress_r`, `progress_pct`, `risk_state` | yes |
| `overlay.py` | `step_overlay(prev, ctx)` — the trade-overlay state machine | yes |
| `events.py` | `record_event(conn, ...)` — sole writer of `progress_denom` (freeze + log + update in one txn) | no |
| `store.py` | `ensure`+`write_signal`, `open_trade`, `close_trade`, `add_leg`, cache read | no |
| `replay.py` | `replay(ticker, daily, weekly, spy, sector, model_ver)` — ties pure fns + persistence | no |

Shared constants live at the top of each module (the spec's starting numbers). Dataclasses `BiasState`, `OverlayState`, `OverlayCtx` are defined in their owning modules and imported where needed.

---

### Task 1: Schema — four tables

**Files:**
- Create: `argus/argus/position_engine/__init__.py` (empty)
- Create: `argus/argus/position_engine/schema.py`
- Test: `argus/tests/test_pe_schema.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_schema.py
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema


def test_creates_four_tables(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert {"position_signals", "trades", "trade_legs", "position_events"} <= names


def test_idempotent(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    ensure_schema(conn)  # second call must not raise
    conn.close()
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_schema.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.position_engine'`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/__init__.py
```

```python
# argus/argus/position_engine/schema.py
"""WS-4 Position Engine tables (design spec §10). Idempotent DDL — callers run
ensure_schema() on every use (same pattern as options_intel/schema.py)."""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS position_signals (
      ts TEXT NOT NULL, ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d',
      model_ver TEXT NOT NULL,
      bias TEXT NOT NULL, bias_strength INTEGER NOT NULL, strength_tier TEXT NOT NULL,
      overlay TEXT NOT NULL,
      entry REAL, stop REAL, target REAL,
      avg_cost REAL, leg_count INTEGER NOT NULL DEFAULT 0,
      progress_r REAL, progress_pct REAL, progress_denom REAL, progress_anchor REAL,
      health INTEGER, health_flags TEXT, risk_state TEXT, structure TEXT,
      exit_reason TEXT, cooldown_until TEXT,
      run_kind TEXT NOT NULL DEFAULT 'live', data_date TEXT NOT NULL,
      PRIMARY KEY (ticker, tf, ts, model_ver, run_kind)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_possig_ticker_ts ON position_signals(ticker, tf, ts)",
    "CREATE INDEX IF NOT EXISTS idx_possig_cache ON position_signals(ticker, model_ver, data_date, run_kind)",
    """CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d', model_ver TEXT NOT NULL,
      mode TEXT NOT NULL, side TEXT NOT NULL DEFAULT 'long',
      entry_ts TEXT NOT NULL, entry_px REAL NOT NULL, qty REAL NOT NULL,
      init_stop REAL NOT NULL, init_target REAL NOT NULL,
      exit_ts TEXT, exit_px REAL, exit_reason TEXT,
      r_multiple REAL, mae_r REAL, mfe_r REAL, holding_bars INTEGER,
      leg_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE (ticker, tf, model_ver, mode, entry_ts)
    )""",
    """CREATE TABLE IF NOT EXISTS trade_legs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER NOT NULL REFERENCES trades(id),
      leg_no INTEGER NOT NULL, ts TEXT NOT NULL,
      px REAL NOT NULL, qty REAL NOT NULL, kind TEXT NOT NULL,
      UNIQUE (trade_id, leg_no)
    )""",
    """CREATE TABLE IF NOT EXISTS position_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id INTEGER, ticker TEXT NOT NULL, tf TEXT NOT NULL DEFAULT '1d',
      model_ver TEXT NOT NULL, ts TEXT NOT NULL, kind TEXT NOT NULL, exit_reason TEXT,
      old_denom REAL, new_denom REAL, old_target REAL, new_target REAL,
      old_stop REAL, new_stop REAL, frozen_anchor REAL, detail TEXT,
      UNIQUE (ticker, tf, model_ver, ts, kind)
    )""",
]


def ensure_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_schema.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/__init__.py argus/argus/position_engine/schema.py argus/tests/test_pe_schema.py
git commit -m "feat(position-engine): four-table schema (signals/trades/legs/events)"
```

---

### Task 2: Bias score (directional vote)

**Files:**
- Create: `argus/argus/position_engine/bias.py`
- Test: `argus/tests/test_pe_bias.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_bias.py
import numpy as np
import pandas as pd
from argus.position_engine.bias import bias_score


def _df(closes, highs=None, lows=None, vols=None):
    n = len(closes)
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    c = np.array(closes, float)
    return pd.DataFrame({
        "open": c, "high": (c * 1.01 if highs is None else highs),
        "low": (c * 0.99 if lows is None else lows), "close": c,
        "volume": (np.full(n, 1e6) if vols is None else vols),
    }, index=idx)


def test_uptrend_scores_positive_downtrend_negative():
    up = _df(list(np.linspace(50, 120, 320)))      # long steady advance
    down = _df(list(np.linspace(120, 50, 320)))
    # weekly is resampled inside bias_score; pass the same daily df as both views
    assert bias_score(up, up) >= 4
    assert bias_score(down, down) <= -4


def test_choppy_flat_is_mid_band():
    flat = _df(list(100 + 2 * np.sin(np.linspace(0, 12, 320))))
    assert -4 < bias_score(flat, flat) < 4
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_bias.py::test_uptrend_scores_positive_downtrend_negative -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/bias.py
"""Bias direction (design spec §3): weekly-weighted technical vote → bias_score
in [-9, +9], then step_bias() applies Schmitt hysteresis + confirmation + dwell.
Indicators reuse argus.indicators.compute. Starting thresholds are spec constants."""
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ..indicators.compute import _sma, _ema, _adx

ENTER, LEAVE, CONFIRM, DWELL = 4, 1, 2, 10  # spec §3 starting values


def _slope(s: pd.Series, n: int) -> float:
    s = s.dropna()
    if len(s) < n:
        return 0.0
    y = s.iloc[-n:].to_numpy()
    return float(np.polyfit(np.arange(n), y, 1)[0])


def _weekly_votes(weekly: pd.DataFrame) -> int:
    c = weekly["close"]
    sma30 = _sma(c, 30)
    v1 = 1 if c.iloc[-1] > sma30.iloc[-1] else -1
    sl = _slope(sma30, 10)
    band = 0.003 * float(c.iloc[-1])
    v2 = 1 if sl > band else (-1 if sl < -band else 0)
    h, l = weekly["high"], weekly["low"]
    hh = h.iloc[-1] > h.iloc[-10:-1].max() and l.iloc[-1] > l.iloc[-10:-1].min()
    ll = h.iloc[-1] < h.iloc[-10:-1].max() and l.iloc[-1] < l.iloc[-10:-1].min()
    v3 = 1 if hh else (-1 if ll else 0)
    return v1 + v2 + v3


def _daily_votes(daily: pd.DataFrame) -> int:
    c = daily["close"]
    ema50, sma200 = _ema(c, 50), _sma(c, 200)
    d1 = 1 if c.iloc[-1] > ema50.iloc[-1] else -1
    d2 = 1 if ema50.iloc[-1] > sma200.iloc[-1] else -1
    adx, pdi, ndi = _adx(daily["high"], daily["low"], c, 14)
    if adx.iloc[-1] >= 20:
        d3 = 1 if pdi.iloc[-1] > ndi.iloc[-1] else -1
    else:
        d3 = 0
    return d1 + d2 + d3


def bias_score(daily: pd.DataFrame, weekly: pd.DataFrame | None = None) -> int:
    """Score in [-9, +9]; weekly double-weighted. If weekly is None it is
    resampled from daily (W-FRI)."""
    if weekly is None or weekly is daily:
        weekly = daily.resample("W-FRI").agg(
            {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()
    return int(2 * _weekly_votes(weekly) + _daily_votes(daily))


@dataclass(frozen=True)
class BiasState:
    bias: str = "NEUTRAL"      # LONG | NEUTRAL | SHORT
    bars_in_state: int = 0
    pending: str | None = None  # candidate direction awaiting confirmation
    confirm_count: int = 0


def step_bias(prev: BiasState, score: int) -> BiasState:
    """Schmitt hysteresis (enter ±ENTER, leave at ±LEAVE) + CONFIRM consecutive
    bars + DWELL minimum hold. NEUTRAL is the buffer between thresholds."""
    # 1. minimum dwell — cannot change until DWELL bars elapsed
    locked = prev.bars_in_state < DWELL
    # 2. determine the target direction this bar wants
    if prev.bias == "LONG":
        want = "LONG" if score > LEAVE else "NEUTRAL"
    elif prev.bias == "SHORT":
        want = "SHORT" if score < -LEAVE else "NEUTRAL"
    else:  # NEUTRAL
        want = "LONG" if score >= ENTER else ("SHORT" if score <= -ENTER else "NEUTRAL")
    if want == prev.bias or locked:
        return BiasState(prev.bias, prev.bars_in_state + 1, None, 0)
    # 3. confirmation: the want must hold CONFIRM consecutive bars
    if prev.pending == want:
        cc = prev.confirm_count + 1
    else:
        cc = 1
    if cc >= CONFIRM:
        return BiasState(want, 0, None, 0)
    return BiasState(prev.bias, prev.bars_in_state + 1, want, cc)
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_bias.py -q`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the hysteresis state-machine test**

```python
# append to argus/tests/test_pe_bias.py
from argus.position_engine.bias import BiasState, step_bias, DWELL, CONFIRM


def _run(scores, start=BiasState()):
    st = start
    out = []
    for sc in scores:
        st = step_bias(st, sc)
        out.append(st.bias)
    return out, st


def test_requires_confirmation_then_commits():
    # one strong bar does not flip; two consecutive do
    out, _ = _run([5])
    assert out[-1] == "NEUTRAL"          # 1 bar of +5: pending, not committed
    out, st = _run([5, 5])
    assert st.bias == "LONG"             # CONFIRM=2 consecutive → committed


def test_min_dwell_blocks_immediate_flip():
    _, st = _run([5, 5])                  # now LONG, bars_in_state=0
    # feed deeply negative scores; dwell (10) blocks any change for DWELL bars
    out, st2 = _run([-9] * (DWELL - 1), start=st)
    assert all(b == "LONG" for b in out)  # locked by dwell
    # after dwell elapses, two confirming bears flip to NEUTRAL then SHORT path
    _, st3 = _run([-9, -9], start=st2)
    assert st3.bias in ("NEUTRAL", "SHORT")


def test_hysteresis_holds_through_mid_band():
    _, st = _run([5, 5])                  # LONG
    _, st2 = _run([2] * (DWELL + 3), start=st)  # score 2 > LEAVE(1) → stays LONG
    assert st2.bias == "LONG"
```

- [ ] **Step 6: Run + commit**

Run: `.venv/bin/python -m pytest tests/test_pe_bias.py -q`  (Expected: PASS, 5 tests)

```bash
git add argus/argus/position_engine/bias.py argus/tests/test_pe_bias.py
git commit -m "feat(position-engine): bias vote + Schmitt/confirm/dwell hysteresis"
```

---

### Task 3: Strength composite + tiers + arm gate

**Files:**
- Create: `argus/argus/position_engine/strength.py`
- Test: `argus/tests/test_pe_strength.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_strength.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_strength.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/strength.py
"""Strength 0-100 (design spec §4): fixed equal-weight 5-component composite,
3 display tiers, and the arm/disarm entry gate with hysteresis."""
import numpy as np
import pandas as pd

from ..indicators.compute import _ema, _atr, _adx, _roc

ARM, DISARM = 50, 40  # spec §4


def _clamp01(x: float) -> float:
    return float(max(0.0, min(1.0, x)))


def _logistic(x: float, x0: float = 0.0, k: float = 1.0) -> float:
    return 1.0 / (1.0 + np.exp(-k * (x - x0)))


def strength_components(daily: pd.DataFrame, spy: pd.DataFrame,
                        sector: pd.DataFrame | None = None) -> dict:
    """Each component in [0,100]. spy/sector are aligned daily closes for RS."""
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    adx, _, _ = _adx(h, l, c, 14)
    s1 = _clamp01((adx.iloc[-1] - 15) / 25) * 100

    roc12 = _roc(c, 60)                       # ~12 weeks of trading days
    rank = (roc12.rank(pct=True).iloc[-1]) if roc12.notna().sum() > 5 else 0.5
    s2 = float(rank) * 100

    def _ret(df, n=65):
        return float(df["close"].iloc[-1] / df["close"].iloc[-n] - 1) if len(df) > n else 0.0
    excess = _ret(daily) - _ret(spy)
    if sector is not None:
        excess = (excess + (_ret(daily) - _ret(sector))) / 2
    s3 = _logistic(excess, 0.0, 20.0) * 100

    atr = _atr(h, l, c, 14).iloc[-1]
    dist = (c.iloc[-1] - _ema(c, 50).iloc[-1]) / atr if atr else 0.0
    # inverted-U: peak at +1.25 ATR, penalise <0 and >4
    s4 = _clamp01(1 - abs(dist - 1.25) / 2.75) * 100

    up = v.where(c.diff() > 0, 0.0).rolling(20).sum().iloc[-1]
    dn = v.where(c.diff() < 0, 0.0).rolling(20).sum().iloc[-1]
    ratio = up / dn if dn else 2.0
    s5 = _logistic(ratio, 1.0, 2.0) * 100

    return {"S1": s1, "S2": s2, "S3": s3, "S4": s4, "S5": s5}


def score_strength(comp: dict) -> tuple[int, str]:
    s = int(round(sum(comp[k] for k in ("S1", "S2", "S3", "S4", "S5")) / 5))
    s = max(0, min(100, s))
    return s, tier_of(s)


def tier_of(s: int) -> str:
    return "weak" if s < 40 else ("building" if s < 70 else "strong")


def arm_eligible(prev_armed: bool, strength: int) -> bool:
    """Hysteresis: arm at >=ARM, disarm only below DISARM."""
    if prev_armed:
        return strength >= DISARM
    return strength >= ARM
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_strength.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/strength.py argus/tests/test_pe_strength.py
git commit -m "feat(position-engine): strength composite, tiers, arm-gate hysteresis"
```

---

### Task 4: Level model (entry trigger, stop, target, gap-skip, trail)

**Files:**
- Create: `argus/argus/position_engine/levels.py`
- Test: `argus/tests/test_pe_levels.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_levels.py
import numpy as np
import pandas as pd
from argus.position_engine.levels import (entry_trigger, compute_levels,
                                          gap_skip, trail_stop, RR_FLOOR)


def _df(rows):
    idx = pd.date_range("2024-01-01", periods=len(rows), freq="D")
    return pd.DataFrame(rows, index=idx, columns=["open", "high", "low", "close", "volume"])


def test_entry_trigger_fires_on_pullback_resume():
    # uptrend, a pullback toward EMA, then a resumption bar closing above prior high on volume
    base = [[100, 101, 99, 100, 1e6]] * 60
    # drift up to build EMA below price
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(60)]
    pull = [[129, 129, 127, 127.5, 1e6]]          # dip toward EMA
    resume = [[128, 131, 128, 130.5, 1.5e6]]       # close > prior high, vol up
    df = _df(up + pull + resume)
    assert entry_trigger(df) is True


def test_no_trigger_without_volume():
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(60)]
    pull = [[129, 129, 127, 127.5, 1e6]]
    weak = [[128, 131, 128, 130.5, 0.5e6]]         # resume but low volume
    df = _df(up + pull + weak)
    assert entry_trigger(df) is False


def test_compute_levels_rr_and_stop():
    up = [[100 + i * 0.5, 100 + i * 0.5 + 1, 100 + i * 0.5 - 1, 100 + i * 0.5, 1e6] for i in range(80)]
    df = _df(up)
    lv = compute_levels(entry_px=df["close"].iloc[-1], daily=df)
    assert lv["stop"] < lv["entry"] < lv["target"]
    assert lv["rr"] >= RR_FLOOR or lv["armed"] is False


def test_gap_skip():
    assert gap_skip(entry_signal_close=100, next_open=101.0, atr=1.0) is True   # >0.75 ATR gap
    assert gap_skip(entry_signal_close=100, next_open=100.3, atr=1.0) is False


def test_trail_only_ratchets_up():
    # at +1R move to breakeven; beyond, chandelier; never down
    assert trail_stop(prior_stop=95, close=110, atr=2.0, progress_r=1.5, entry=100) >= 100
    assert trail_stop(prior_stop=104, close=108, atr=2.0, progress_r=2.0, entry=100) >= 104
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_levels.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/levels.py
"""Structural ATR-scaled levels (design spec §5). Independent of bias/strength.
All fills resolve at T+1 open in the runner; this module only computes levels and
the entry-trigger condition on completed bars."""
import pandas as pd

from ..indicators.compute import _ema, _atr

BUY_ZONE_ATR = 0.5      # pullback proximity to EMA
RESUME_VOL = 1.2        # resumption volume vs 20d avg
STOP_ATR = 1.5
TRAIL_ATR = 2.5
GAP_ATR = 0.75
RR_FLOOR = 1.8
SWING_LB = 10


def entry_trigger(daily: pd.DataFrame) -> bool:
    """True if the last completed bar is a pullback-to-EMA + resumption + volume."""
    if len(daily) < 60:
        return False
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    atr = _atr(h, l, c, 14).iloc[-1]
    ema20, ema50 = _ema(c, 20).iloc[-1], _ema(c, 50).iloc[-1]
    prev = daily.iloc[-2]
    bar = daily.iloc[-1]
    near = min(abs(prev["low"] - ema20), abs(prev["low"] - ema50)) <= BUY_ZONE_ATR * atr
    resume = bar["close"] > prev["high"]
    vol_ok = bar["volume"] >= RESUME_VOL * v.iloc[-21:-1].mean()
    return bool(near and resume and vol_ok)


def compute_levels(entry_px: float, daily: pd.DataFrame) -> dict:
    c, h, l = daily["close"], daily["high"], daily["low"]
    atr = float(_atr(h, l, c, 14).iloc[-1])
    swing_low = float(l.iloc[-SWING_LB:].min())
    stop = min(swing_low, entry_px - STOP_ATR * atr)
    r = entry_px - stop
    struct_target = float(h.iloc[-SWING_LB:].max())
    target = min(entry_px + 2.0 * r, struct_target) if struct_target > entry_px else entry_px + 2.0 * r
    rr = (target - entry_px) / r if r > 0 else 0.0
    return {"entry": entry_px, "stop": stop, "target": target, "rr": rr,
            "armed": rr >= RR_FLOOR, "atr": atr}


def gap_skip(entry_signal_close: float, next_open: float, atr: float) -> bool:
    return next_open > entry_signal_close + GAP_ATR * atr


def trail_stop(prior_stop: float, close: float, atr: float, progress_r: float,
               entry: float) -> float:
    """Sticky, ratchet-up only. >=+1R: breakeven; beyond: chandelier max."""
    candidate = prior_stop
    if progress_r >= 1.0:
        candidate = max(candidate, entry)                 # breakeven
    if progress_r > 1.0:
        candidate = max(candidate, close - TRAIL_ATR * atr)  # chandelier
    return max(prior_stop, candidate)
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_levels.py -q`
Expected: PASS (5 tests). If `test_entry_trigger_fires_on_pullback_resume` is brittle on the synthetic series, adjust the synthetic `pull`/`resume` bars so `prev["low"]` lands within 0.5 ATR of an EMA — the assertion is on *behavior*, keep the construction faithful to it.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/levels.py argus/tests/test_pe_levels.py
git commit -m "feat(position-engine): structural level model + entry trigger + trail/gap-skip"
```

---

### Task 5: Progress math

**Files:**
- Create: `argus/argus/position_engine/progress.py`
- Test: `argus/tests/test_pe_progress.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_progress.py
from argus.position_engine.progress import progress_r, progress_pct, risk_state


def test_progress_r_is_off_initial_risk():
    # entry 100, init_stop 95 → R=5. price 107.5 → +1.5R
    assert progress_r(price=107.5, avg_cost=100, init_stop=95) == 1.5
    assert progress_r(price=97.5, avg_cost=100, init_stop=95) == -0.5


def test_progress_pct_stop_to_target():
    # stop 95, target 115, price 105 → (105-95)/(115-95)=50%
    assert progress_pct(price=105, stop=95, target=115) == 50.0
    assert progress_pct(price=95, stop=95, target=115) == 0.0


def test_risk_state_labels():
    assert risk_state(stop=95, avg_cost=100, init_stop=95) == "at_risk"
    assert risk_state(stop=100, avg_cost=100, init_stop=95) == "breakeven"
    assert risk_state(stop=104, avg_cost=100, init_stop=95) == "locked"
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_progress.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/progress.py
"""Progress + risk readings (design spec §9). Pure functions of price/levels.
R-multiple basis is the ORIGINAL risk (avg_cost - init_stop); avg_cost moves the
reward numerator only, never the R denominator."""


def progress_r(price: float, avg_cost: float, init_stop: float) -> float:
    risk = avg_cost - init_stop
    if risk <= 0:
        return 0.0
    return round((price - avg_cost) / risk, 4)


def progress_pct(price: float, stop: float, target: float) -> float:
    denom = target - stop
    if denom <= 0:
        return 0.0
    return round(max(0.0, min(1.0, (price - stop) / denom)) * 100, 2)


def risk_state(stop: float, avg_cost: float, init_stop: float) -> str:
    if stop > avg_cost:
        return "locked"
    if stop >= avg_cost - 1e-9 or stop > init_stop:
        return "breakeven" if abs(stop - avg_cost) < 1e-6 else "locked"
    return "at_risk"
```

Note: simplify `risk_state` so the three labels are unambiguous — `stop < init_stop+ε ⇒ at_risk`, `stop == avg_cost ⇒ breakeven`, `stop > avg_cost ⇒ locked`. Adjust to:

```python
def risk_state(stop: float, avg_cost: float, init_stop: float) -> str:
    if abs(stop - avg_cost) < 1e-6:
        return "breakeven"
    if stop > avg_cost:
        return "locked"
    return "at_risk"
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_progress.py -q`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/progress.py argus/tests/test_pe_progress.py
git commit -m "feat(position-engine): progress-R / progress-pct / risk-state math"
```

---

### Task 6: Trade-overlay state machine

**Files:**
- Create: `argus/argus/position_engine/overlay.py`
- Test: `argus/tests/test_pe_overlay.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_overlay.py
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_overlay.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/overlay.py
"""Trade-overlay state machine (design spec §6). Pure: step_overlay(prev, ctx) →
(next_state, exit_reason, events). FLAT→ARMED→LONG→EXIT→COOLDOWN, long-only.
EXIT is a transient one-bar event that settles to COOLDOWN. ARMED fills at the
NEXT bar's open (no same-bar FLAT→LONG = no lookahead). bar_index is an integer
bar counter used for min-hold / cooldown windows."""
from dataclasses import dataclass, field

MIN_HOLD_BARS = 3
COOLDOWN_BARS = 5


@dataclass(frozen=True)
class OverlayState:
    overlay: str = "FLAT"          # FLAT | ARMED | LONG | EXIT | COOLDOWN
    entry_index: int | None = None
    cooldown_until: int | None = None


@dataclass
class OverlayCtx:
    bias: str
    armed_eligible: bool
    entry_signal: bool
    bar_open: float
    bar_high: float
    bar_low: float
    bar_close: float
    levels: dict
    bar_index: int
    cooldown_until: int | None = None


def step_overlay(prev: OverlayState, ctx: OverlayCtx):
    events: list[dict] = []

    # invariant: any non-flat overlay under a non-LONG bias force-exits
    if ctx.bias != "LONG" and prev.overlay in ("ARMED", "LONG"):
        return OverlayState("EXIT", prev.entry_index), "bias_flip", events
    if ctx.bias != "LONG" and prev.overlay == "ARMED":
        return OverlayState("FLAT"), None, events

    if prev.overlay == "FLAT":
        if ctx.armed_eligible and ctx.entry_signal and ctx.levels.get("armed", True):
            return OverlayState("ARMED"), None, events
        return OverlayState("FLAT"), None, events

    if prev.overlay == "ARMED":
        # fill at THIS bar's open (T+1 of the signal bar)
        events.append({"kind": "entry", "fill_px": ctx.bar_open, "ts_index": ctx.bar_index})
        return OverlayState("LONG", entry_index=ctx.bar_index), None, events

    if prev.overlay == "LONG":
        stop, target = ctx.levels["stop"], ctx.levels["target"]
        held = ctx.bar_index - (prev.entry_index or ctx.bar_index)
        # stop always allowed (even inside min-hold); target/time gated by min-hold
        if ctx.bar_low <= stop:
            return OverlayState("EXIT", prev.entry_index), "stop", events
        if held >= MIN_HOLD_BARS and ctx.bar_high >= target:
            return OverlayState("EXIT", prev.entry_index), "target", events
        return OverlayState("LONG", entry_index=prev.entry_index), None, events

    if prev.overlay == "EXIT":
        return OverlayState("COOLDOWN", cooldown_until=ctx.bar_index + COOLDOWN_BARS), None, events

    if prev.overlay == "COOLDOWN":
        if prev.cooldown_until is not None and ctx.bar_index >= prev.cooldown_until and ctx.bias == "LONG":
            return OverlayState("FLAT"), None, events
        return OverlayState("COOLDOWN", cooldown_until=prev.cooldown_until), None, events

    return OverlayState("FLAT"), None, events
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_overlay.py -q`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the forbidden-edge assertion sweep**

```python
# append to argus/tests/test_pe_overlay.py
def test_invariant_no_position_under_nonlong_bias():
    for ov in ("ARMED", "LONG"):
        st = OverlayState(overlay=ov, entry_index=90)
        st2, reason, _ = step_overlay(st, ctx(bias="SHORT", bar_index=120))
        assert st2.overlay == "EXIT" and reason == "bias_flip"


def test_cooldown_blocks_rearm_until_window():
    st = OverlayState(overlay="COOLDOWN", cooldown_until=130)
    st2, _, _ = step_overlay(st, ctx(bar_index=129, entry_signal=True, armed_eligible=True))
    assert st2.overlay == "COOLDOWN"   # still locked at 129
```

- [ ] **Step 6: Run + commit**

Run: `.venv/bin/python -m pytest tests/test_pe_overlay.py -q`  (Expected: PASS, 9 tests)

```bash
git add argus/argus/position_engine/overlay.py argus/tests/test_pe_overlay.py
git commit -m "feat(position-engine): trade-overlay state machine + forbidden-edge tests"
```

---

### Task 7: Events (denom rule) + store

**Files:**
- Create: `argus/argus/position_engine/events.py`
- Create: `argus/argus/position_engine/store.py`
- Test: `argus/tests/test_pe_store.py`

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_store.py
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.store import write_signal, open_trade, close_trade
from argus.position_engine.events import record_event


def _conn(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    return conn


def test_write_signal_upserts(tmp_path):
    conn = _conn(tmp_path)
    row = {"ts": "2026-06-17", "ticker": "NVDA", "tf": "1d", "model_ver": "v1",
           "bias": "LONG", "bias_strength": 72, "strength_tier": "strong",
           "overlay": "LONG", "entry": 100, "stop": 95, "target": 115,
           "avg_cost": 100, "leg_count": 1, "progress_r": 0.5, "progress_pct": 50,
           "progress_denom": 15, "progress_anchor": 0, "health": None, "health_flags": None,
           "risk_state": "at_risk", "structure": "20EMA", "exit_reason": None,
           "cooldown_until": None, "run_kind": "live", "data_date": "2026-06-17"}
    write_signal(conn, row)
    write_signal(conn, {**row, "overlay": "EXIT"})  # same PK → replace
    got = conn.execute("SELECT overlay FROM position_signals WHERE ticker='NVDA'").fetchone()
    conn.close()
    assert got["overlay"] == "EXIT"


def test_open_then_close_trade(tmp_path):
    conn = _conn(tmp_path)
    tid = open_trade(conn, ticker="NVDA", tf="1d", model_ver="v1", mode="paper",
                     entry_ts="2026-06-10", entry_px=100.0, qty=10, init_stop=95.0, init_target=115.0)
    close_trade(conn, tid, exit_ts="2026-06-17", exit_px=112.0, exit_reason="target",
                r_multiple=2.4, holding_bars=5)
    t = conn.execute("SELECT * FROM trades WHERE id=?", (tid,)).fetchone()
    conn.close()
    assert t["exit_reason"] == "target" and t["r_multiple"] == 2.4


def test_record_event_moves_denom_only_with_log(tmp_path):
    conn = _conn(tmp_path)
    tid = open_trade(conn, ticker="NVDA", tf="1d", model_ver="v1", mode="paper",
                     entry_ts="2026-06-10", entry_px=100.0, qty=10, init_stop=95.0, init_target=115.0)
    record_event(conn, trade_id=tid, ticker="NVDA", tf="1d", model_ver="v1",
                 ts="2026-06-15", kind="move_target", old_denom=15, new_denom=20,
                 old_target=115, new_target=120, frozen_anchor=0.6)
    ev = conn.execute("SELECT * FROM position_events WHERE kind='move_target'").fetchone()
    conn.close()
    assert ev["new_denom"] == 20 and ev["frozen_anchor"] == 0.6
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_store.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement store.py**

```python
# argus/argus/position_engine/store.py
"""Persistence for the Position Engine. write_signal upserts per-bar rows;
open/close_trade manage round-trips. progress_denom is NEVER written here — only
via events.record_event (the anti-silent-rescale rule)."""
_SIG_COLS = ("ts", "ticker", "tf", "model_ver", "bias", "bias_strength", "strength_tier",
             "overlay", "entry", "stop", "target", "avg_cost", "leg_count", "progress_r",
             "progress_pct", "progress_denom", "progress_anchor", "health", "health_flags",
             "risk_state", "structure", "exit_reason", "cooldown_until", "run_kind", "data_date")


def write_signal(conn, row: dict) -> None:
    cols = ",".join(_SIG_COLS)
    ph = ",".join(f":{c}" for c in _SIG_COLS)
    conn.execute(f"INSERT OR REPLACE INTO position_signals ({cols}) VALUES ({ph})",
                 {c: row.get(c) for c in _SIG_COLS})
    conn.commit()


def open_trade(conn, *, ticker, tf, model_ver, mode, entry_ts, entry_px, qty,
               init_stop, init_target) -> int:
    cur = conn.execute(
        "INSERT INTO trades (ticker,tf,model_ver,mode,side,entry_ts,entry_px,qty,"
        "init_stop,init_target,leg_count) VALUES (?,?,?,?,'long',?,?,?,?,?,1)",
        (ticker, tf, model_ver, mode, entry_ts, entry_px, qty, init_stop, init_target))
    conn.commit()
    return cur.lastrowid


def close_trade(conn, trade_id: int, *, exit_ts, exit_px, exit_reason,
                r_multiple=None, mae_r=None, mfe_r=None, holding_bars=None) -> None:
    conn.execute(
        "UPDATE trades SET exit_ts=?, exit_px=?, exit_reason=?, r_multiple=?, "
        "mae_r=?, mfe_r=?, holding_bars=? WHERE id=?",
        (exit_ts, exit_px, exit_reason, r_multiple, mae_r, mfe_r, holding_bars, trade_id))
    conn.commit()


def add_leg(conn, *, trade_id, leg_no, ts, px, qty, kind) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO trade_legs (trade_id,leg_no,ts,px,qty,kind) VALUES (?,?,?,?,?,?)",
        (trade_id, leg_no, ts, px, qty, kind))
    conn.commit()
```

- [ ] **Step 4: Implement events.py**

```python
# argus/argus/position_engine/events.py
"""The ONLY writer permitted to change progress_denom (design spec §10). Each
denom-mutating event (add_leg/trim/move_target) freezes the prior progress into
frozen_anchor and appends a typed row in a single transaction."""


def record_event(conn, *, trade_id, ticker, tf, model_ver, ts, kind, exit_reason=None,
                 old_denom=None, new_denom=None, old_target=None, new_target=None,
                 old_stop=None, new_stop=None, frozen_anchor=None, detail=None) -> None:
    with conn:
        conn.execute(
            "INSERT OR IGNORE INTO position_events "
            "(trade_id,ticker,tf,model_ver,ts,kind,exit_reason,old_denom,new_denom,"
            "old_target,new_target,old_stop,new_stop,frozen_anchor,detail) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (trade_id, ticker, tf, model_ver, ts, kind, exit_reason, old_denom, new_denom,
             old_target, new_target, old_stop, new_stop, frozen_anchor, detail))
```

- [ ] **Step 5: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_store.py -q`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add argus/argus/position_engine/store.py argus/argus/position_engine/events.py argus/tests/test_pe_store.py
git commit -m "feat(position-engine): store + event log (sole progress_denom writer)"
```

---

### Task 8: Replay runner — ties pure functions to persistence

**Files:**
- Create: `argus/argus/position_engine/replay.py`
- Test: `argus/tests/test_pe_replay.py`

- [ ] **Step 1: Write the failing test (synthetic end-to-end lifecycle)**

```python
# argus/tests/test_pe_replay.py
import numpy as np
import pandas as pd
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.replay import replay


def _series():
    # 220 bars: long uptrend (builds LONG bias), a pullback+resume (entry), then a
    # sharp drop through the stop (exit), then flat.
    up = list(np.linspace(50, 130, 180))
    pull = [129, 128, 127.5]
    resume = [131]
    drop = list(np.linspace(131, 100, 36))
    closes = up + pull + resume + drop
    n = len(closes)
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    c = np.array(closes, float)
    return pd.DataFrame({"open": c, "high": c * 1.01, "low": c * 0.99,
                         "close": c, "volume": np.full(n, 1e6)}, index=idx)


def test_replay_produces_signals_and_a_round_trip(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    spy = df.copy()  # flat-ish benchmark stand-in
    rows = replay(conn, ticker="TEST", daily=df, spy=spy, sector=None,
                  model_ver="v1", run_kind="ondemand")
    # there is at least one persisted signal per bar evaluated
    n_sig = conn.execute("SELECT COUNT(*) c FROM position_signals WHERE ticker='TEST'").fetchone()["c"]
    states = {r["overlay"] for r in conn.execute(
        "SELECT DISTINCT overlay FROM position_signals WHERE ticker='TEST'")}
    trades = conn.execute("SELECT * FROM trades WHERE ticker='TEST'").fetchall()
    conn.close()
    assert n_sig > 0
    # the lifecycle visited LONG and exited
    assert "LONG" in states
    assert any(t["exit_reason"] is not None for t in trades)


def test_replay_is_idempotent(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    n1 = conn.execute("SELECT COUNT(*) c FROM position_signals").fetchone()["c"]
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    n2 = conn.execute("SELECT COUNT(*) c FROM position_signals").fetchone()["c"]
    conn.close()
    assert n1 == n2  # INSERT OR REPLACE keyed on (ticker,tf,ts,model_ver,run_kind)
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py -q`
Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Implement**

```python
# argus/argus/position_engine/replay.py
"""Replay driver (design spec §10/§12). Walks a ticker's daily history bar by bar:
computes bias/strength/levels (pure), steps bias + overlay state machines, and
persists position_signals + trades. Single-shot entries; health=None (Phase 3).
WARMUP bars are skipped so indicators are valid. Used by both the live job and the
on-demand 'Run model' endpoint (run_kind differs)."""
import pandas as pd

from .bias import BiasState, step_bias, bias_score
from .strength import strength_components, score_strength, arm_eligible
from .levels import entry_trigger, compute_levels, gap_skip
from .overlay import OverlayState, OverlayCtx, step_overlay
from .progress import progress_r, progress_pct, risk_state
from . import store as _store

WARMUP = 200  # need 200-SMA etc.


def replay(conn, *, ticker, daily: pd.DataFrame, spy: pd.DataFrame,
           sector: pd.DataFrame | None, model_ver: str, run_kind: str = "live",
           mode: str = "paper") -> int:
    data_date = str(daily.index[-1].date())
    weekly = daily.resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()

    bstate = BiasState()
    ostate = OverlayState("FLAT")
    armed_prev = False
    trade_id = None
    cur_levels = None
    init_stop = init_target = entry_px = None
    n = 0

    for i in range(WARMUP, len(daily)):
        win = daily.iloc[: i + 1]
        bar = daily.iloc[i]
        ts = str(daily.index[i].date())
        wk = weekly[weekly.index <= daily.index[i]]

        score = bias_score(win, wk)
        bstate = step_bias(bstate, score)
        comp = strength_components(win, spy.iloc[: i + 1], sector.iloc[: i + 1] if sector is not None else None)
        strength, tier = score_strength(comp)
        armed_prev = arm_eligible(armed_prev, strength) if bstate.bias == "LONG" else False

        # entry signal on completed bar (used when overlay is FLAT)
        sig = entry_trigger(win) if (bstate.bias == "LONG" and armed_prev) else False
        if sig and ostate.overlay == "FLAT":
            cur_levels = compute_levels(entry_px=float(bar["close"]), daily=win)

        levels = cur_levels or {"entry": None, "stop": None, "target": None, "armed": False}
        ctx = OverlayCtx(bias=bstate.bias, armed_eligible=armed_prev, entry_signal=sig,
                         bar_open=float(bar["open"]), bar_high=float(bar["high"]),
                         bar_low=float(bar["low"]), bar_close=float(bar["close"]),
                         levels=levels, bar_index=i, cooldown_until=ostate.cooldown_until)
        prev_overlay = ostate.overlay
        ostate, exit_reason, events = step_overlay(ostate, ctx)

        # side effects on transitions
        if prev_overlay == "ARMED" and ostate.overlay == "LONG":
            fill = events[0]["fill_px"]
            if cur_levels and gap_skip(cur_levels["entry"], fill, cur_levels["atr"]):
                ostate = OverlayState("FLAT")  # gap-skip: abandon the fill
                cur_levels = None
            else:
                entry_px, init_stop, init_target = fill, cur_levels["stop"], cur_levels["target"]
                trade_id = _store.open_trade(conn, ticker=ticker, tf="1d", model_ver=model_ver,
                                             mode=mode, entry_ts=ts, entry_px=fill, qty=1.0,
                                             init_stop=init_stop, init_target=init_target)
        if ostate.overlay == "EXIT" and trade_id is not None:
            exit_px = init_stop if exit_reason == "stop" else float(bar["open"])
            r = progress_r(exit_px, entry_px, init_stop) if entry_px else None
            _store.close_trade(conn, trade_id, exit_ts=ts, exit_px=exit_px,
                               exit_reason=exit_reason, r_multiple=r)
            trade_id = None

        # per-bar signal row
        pr = progress_r(float(bar["close"]), entry_px, init_stop) if (ostate.overlay == "LONG" and entry_px) else None
        pp = progress_pct(float(bar["close"]), init_stop, init_target) if (ostate.overlay == "LONG" and init_stop) else None
        rs = risk_state(init_stop, entry_px, init_stop) if (ostate.overlay == "LONG" and entry_px) else None
        _store.write_signal(conn, {
            "ts": ts, "ticker": ticker, "tf": "1d", "model_ver": model_ver,
            "bias": bstate.bias, "bias_strength": strength, "strength_tier": tier,
            "overlay": ostate.overlay, "entry": entry_px if ostate.overlay == "LONG" else None,
            "stop": init_stop if ostate.overlay == "LONG" else None,
            "target": init_target if ostate.overlay == "LONG" else None,
            "avg_cost": entry_px if ostate.overlay == "LONG" else None,
            "leg_count": 1 if ostate.overlay == "LONG" else 0,
            "progress_r": pr, "progress_pct": pp,
            "progress_denom": (init_target - entry_px) if (ostate.overlay == "LONG" and entry_px) else None,
            "progress_anchor": None, "health": None, "health_flags": None, "risk_state": rs,
            "structure": None, "exit_reason": exit_reason, "cooldown_until": ostate.cooldown_until,
            "run_kind": run_kind, "data_date": data_date,
        })
        # EXIT is transient — clear trade levels after persisting the exit bar
        if ostate.overlay == "EXIT":
            entry_px = init_stop = init_target = cur_levels = None
        n += 1
    return n
```

- [ ] **Step 4: Run to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py -q`
Expected: PASS (2 tests). If the synthetic series doesn't trigger an entry (the trigger is strict), tune `_series()` so the pullback bar's low lands within 0.5·ATR of the 20/50-EMA and the resume bar closes above the prior high on ≥1.2× volume — keep the assertion (visited LONG + exited) and make the data honor it.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/replay.py argus/tests/test_pe_replay.py
git commit -m "feat(position-engine): replay runner — bias+overlay over history → signals/trades"
```

---

### Task 9: Full-suite green + denom-audit guard

**Files:**
- Test: `argus/tests/test_pe_invariants.py`

- [ ] **Step 1: Write the cross-cutting invariant test**

```python
# argus/tests/test_pe_invariants.py
"""Invariants that must hold across the whole engine output (design spec §6/§10)."""
import numpy as np
import pandas as pd
from argus.db import get_conn
from argus.position_engine.schema import ensure_schema
from argus.position_engine.replay import replay


def _series():
    up = list(np.linspace(50, 130, 180)); pull = [129, 128, 127.5]; resume = [131]
    drop = list(np.linspace(131, 100, 36)); closes = up + pull + resume + drop
    n = len(closes); idx = pd.date_range("2024-01-01", periods=n, freq="D"); c = np.array(closes, float)
    return pd.DataFrame({"open": c, "high": c * 1.01, "low": c * 0.99, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_no_position_overlay_under_nonlong_bias(tmp_path):
    conn = get_conn(tmp_path / "pe.db"); ensure_schema(conn)
    df = _series(); replay(conn, ticker="T", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    bad = conn.execute(
        "SELECT COUNT(*) c FROM position_signals "
        "WHERE overlay IN ('ARMED','LONG','EXIT') AND bias != 'LONG'").fetchone()["c"]
    conn.close()
    assert bad == 0


def test_exit_rows_carry_a_reason(tmp_path):
    conn = get_conn(tmp_path / "pe.db"); ensure_schema(conn)
    df = _series(); replay(conn, ticker="T", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    missing = conn.execute(
        "SELECT COUNT(*) c FROM position_signals WHERE overlay='EXIT' AND exit_reason IS NULL").fetchone()["c"]
    conn.close()
    assert missing == 0
```

- [ ] **Step 2: Run the invariant test**

Run: `.venv/bin/python -m pytest tests/test_pe_invariants.py -q`
Expected: PASS (2 tests).

- [ ] **Step 3: Run the FULL position-engine suite**

Run: `.venv/bin/python -m pytest tests/test_pe_*.py -q`
Expected: PASS (all ~30 tests across the 8 test files).

- [ ] **Step 4: Run the WHOLE argus suite (no regressions)**

Run: `.venv/bin/python -m pytest -q`
Expected: PASS (existing 92 + the new position-engine tests).

- [ ] **Step 5: Commit**

```bash
git add argus/tests/test_pe_invariants.py
git commit -m "test(position-engine): cross-cutting state invariants (bias coupling, exit reason)"
```

---

## Self-Review

**1. Spec coverage (Phase 1 portions):**
- §2 two-axis model (bias + overlay enums) → Tasks 2/6, schema Task 1. ✓
- §3 bias vote + Schmitt/confirm/dwell → Task 2. ✓
- §4 strength composite + tiers + arm gate → Task 3. ✓
- §5 level model (entry trigger, stop, target, R:R floor, gap-skip, trail) → Task 4. ✓
- §6 overlay transitions + forbidden edges + bias coupling + cooldown + min-hold + typed exit reason → Task 6 (+ Task 9 invariants). ✓
- §9 progress/risk math → Task 5. ✓
- §10 four-table schema + event-log denom rule + run_kind/data_date → Tasks 1/7. ✓
- §12 module structure + replay + test surface → Task 8/9. ✓
- **Deferred (correctly out of Phase 1):** health monitor (§7, Phase 3), backtest harness + leakage test (§11, Phase 2), API/dashboard arrows (Phase 4), bridge migration (§13, Phase 5). The `health`/`health_flags` columns exist but write NULL.

**2. Placeholder scan:** No TBD/TODO. The two "tune the synthetic series" notes (Tasks 4/8) are explicit instructions to keep the *behavioral* assertion while making constructed data honor it — not placeholders. `risk_state` ships the corrected second version (the note replaces the first).

**3. Type consistency:** `BiasState`/`step_bias`, `score_strength→(int,tier)`, `arm_eligible(prev,strength)`, `compute_levels→{entry,stop,target,rr,armed,atr}`, `OverlayState`/`OverlayCtx`/`step_overlay→(state,reason,events)`, `progress_r/pct/risk_state`, and the `store`/`events` signatures are used identically in `replay.py` and the tests. The `position_signals` column set in `store._SIG_COLS` matches the schema and the `write_signal` row dicts.

**Note for the implementer:** parameters here are the spec's *starting constants* (module-level). Do not tune them in Phase 1 — Phase 2's backtest harness owns optimisation under the ≤8-DoF / OOS discipline. Keep every signal/level/state function **pure** (no DB, no `datetime.now`) so the test surface stays linear and the future leakage-shuffle test is meaningful.
