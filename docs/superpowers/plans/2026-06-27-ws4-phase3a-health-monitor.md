# WS-4 Phase 3a · Health Monitor (alert-only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure `health.py` that computes the five spec §7 deterioration signals (H1–H4 live, H5 injected/off) into a severity-weighted composite `health ∈ [0,100]` + a `health_flags` string, wired into `replay()` so the per-bar `health`/`health_flags` columns (NULL today) are persisted — alert-only, driving no trade.

**Architecture:** New pure module `argus/argus/position_engine/health.py`, mirroring the existing pure-function style of `bias.py`/`strength.py` (data injected, no I/O). It takes the same per-bar windows `replay()` already has (`daily=win`, `wk`, daily-aligned `spy`/`sector`), reuses the indicator helpers in `argus/indicators/compute.py` (`_ema`, `_rsi`, `_roc`, `_atr`, `_sma`), and returns `(health:int, flags:str)`. `replay()` calls it once per bar and writes the result instead of `None`. The composite is **severity-weighted** (Option B): `health = 100 − Σ(weight of each tripped signal)`, with the 5 weights as **frozen starting constants** in this phase — Phase 3b owns fitting them against forward outcomes on disjoint OOS universes. H5 (catalyst risk) needs per-name event history the replay frame doesn't carry, so it is an **injected boolean, default `False`**; the weight slot exists but contributes nothing until 3b wires the feed.

**Tech Stack:** Python 3.11 (pandas, numpy), pytest. Code under `argus/argus/position_engine/`. Tests under `argus/tests/`. The venv is at `argus/.venv`; pytest and the package both resolve from the `argus/` directory.

## Global Constraints

- **venv + cwd:** run everything from the `argus/` directory with `.venv/bin/python` (e.g. `.venv/bin/python -m pytest tests/...`). The package is `argus/argus/`, tests are `argus/tests/`. (Repo root is one level up; `git add` paths are repo-root-relative → `argus/argus/...`, `argus/tests/...`.)
- **Alert-only:** health MUST NOT influence any bias/overlay/level/exit decision in `replay()`. It is computed and persisted only. No existing trade or signal value may change — the 154-test suite stays green.
- **Pure module:** `health.py` does no I/O, no DB, no network — frames in, `(int, str)` out. Mirrors `bias.py`/`strength.py`.
- **Frozen starting constants:** the 5 weights and every signal threshold are module-level constants (spec §7 values copied verbatim). They are Phase-3a *starting* values; Phase 3b tunes the weights. Do not invent a tuning loop here.
- **Reuse indicators:** use `argus.indicators.compute` helpers (`_ema`, `_rsi`, `_roc`, `_atr`, `_sma`); do not re-derive RSI/EMA/ATR by hand.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Decisions & findings (read before Task 1)

1. **Signal definitions (spec §7, verbatim):**
   | # | Signal | Definition |
   |---|--------|-----------|
   | H1 | Momentum rollover | 12-wk ROC crosses below its 4-wk MA **while** RSI(14)<50, for 2 consecutive days |
   | H2 | Trend break | daily close below 50-EMA by >0.5·ATR for 2 consecutive closes |
   | H3 | Distribution | ≥3 of last 10 days are high-volume down days (close in lower 1/3 of the day's range **and** vol > 1.5× its 20-day avg) |
   | H4 | RS decay | 13-wk excess return vs SPY+sector is negative **and** has fallen 3 consecutive weeks |
   | H5 | Catalyst risk | held into earnings or a downgrade printed while LONG — **injected, default off in 3a** |

2. **Composite (Option B, severity-weighted):** `health = clamp(100 − Σ wᵢ·[Hᵢ tripped], 0, 100)`. Starting weights (frozen this phase): `H1=15, H2=25, H3=25, H4=15, H5=20` (Σ=100, so all-tripped → 0). Display anchors (spec §7): <35 degraded · 35–70 nominal · >70 strong. These weights are **deliberately un-fitted** — 3b replaces them with values fitted on forward outcomes across ≥3 disjoint OOS universes.

3. **`health_flags` encoding:** comma-joined tripped IDs in fixed H1..H5 order, e.g. `"H2,H3"`; empty string `""` when none tripped. The column is TEXT; readable and trivially splittable.

4. **Windows available in `replay()` per bar** (see `replay.py:54-62`): `win = daily.iloc[:i+1]`, `wk = weekly[weekly.index <= daily.index[i]]` (weekly resampled `W-FRI`), `spy.iloc[:i+1]`, `sector.iloc[:i+1] or None`. `health()` consumes exactly these — no new resampling in `replay()`. Per-bar recompute is the established pattern here (so is `strength_components`), so O(n) work per bar is acceptable.

5. **Weekly inputs for H1/H4:** `wk` is the ticker's weekly OHLCV. H4 also needs weekly SPY and (optional) sector. `replay()` only resamples the ticker today, so **Task 4 adds weekly SPY/sector resampling in `replay()`** (same `W-FRI` agg) and passes them in. H1 uses `wk["close"]`; H4 uses weekly excess vs SPY (+sector avg when present).

6. **Insufficient-history guard:** like `entry_trigger` (returns False when `len(daily) < 60`), each signal returns `False` when its lookback isn't covered, so health degrades to 100 ("no deterioration detected") rather than raising. Replay starts at `WARMUP=200`, so in practice all daily lookbacks are covered; the guards protect the unit tests and any short injected frame.

7. **Sector closes:** `strength.py:31-35` treats `spy`/`sector` as daily frames with a `close` column and uses 65-day (~13-wk) returns. H4 mirrors that excess construction but on the **weekly** frame across 13 weekly bars and checks the 3-week trend, not a single reading.

### File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/health.py` | **New.** Pure: 5 signal predicates + `health_flags` + weighted composite. Frames in, `(int, str)` out. |
| `argus/argus/position_engine/replay.py` | **Modify.** Resample weekly SPY/sector once; call `health(...)` per bar; write `health`/`health_flags` (replace the two `None`s at `replay.py:124`). |
| `argus/tests/test_pe_health.py` | **New.** Unit tests for each signal + the composite + the flags string. |
| `argus/tests/test_pe_replay.py` | **Modify.** One added case asserting replay persists a health int + flags string and that trade/signal outcomes are unchanged. |

---

## Task 1: `health.py` — H2/H3 (daily-only signals) + weighted composite

The two signals that need only the daily frame, plus the composite/flags machinery, so the module is end-to-end testable before the weekly signals land.

**Files:**
- Create: `argus/argus/position_engine/health.py`
- Test: `argus/tests/test_pe_health.py`

**Interfaces:**
- Produces:
  - `WEIGHTS: dict[str,int]` = `{"H1":15,"H2":25,"H3":25,"H4":15,"H5":20}`
  - `h2_trend_break(daily: pd.DataFrame) -> bool`
  - `h3_distribution(daily: pd.DataFrame) -> bool`
  - `composite(flags: dict[str, bool]) -> tuple[int, str]` — returns `(health, "H2,H3")`
  - `health(daily, wk, spy, sector=None, *, h5_flag=False) -> tuple[int, str]` (full version completed in Task 3; Task 1 lands a version that wires H2/H3/H5 and stubs H1/H4 to `False`)

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_health.py
import numpy as np
import pandas as pd

from argus.position_engine.health import (
    WEIGHTS, h2_trend_break, h3_distribution, composite, health,
)


def _flat_daily(n=80, px=100.0):
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    c = np.full(n, px)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_composite_no_flags_is_full_health():
    h, flags = composite({"H1": False, "H2": False, "H3": False, "H4": False, "H5": False})
    assert h == 100 and flags == ""


def test_composite_subtracts_weights_and_lists_flags_in_order():
    h, flags = composite({"H1": False, "H2": True, "H3": True, "H4": False, "H5": False})
    assert h == 100 - WEIGHTS["H2"] - WEIGHTS["H3"]      # 100-25-25 = 50
    assert flags == "H2,H3"                               # fixed H1..H5 order


def test_composite_clamps_at_zero():
    allflags = {k: True for k in ("H1", "H2", "H3", "H4", "H5")}
    h, flags = composite(allflags)
    assert h == 0 and flags == "H1,H2,H3,H4,H5"


def test_h2_trend_break_fires_after_two_closes_below_ema_by_atr():
    d = _flat_daily(80, 100.0)
    # drive the last two closes well below the 50-EMA (>0.5 ATR); ATR~2 here
    d.iloc[-2, d.columns.get_loc("close")] = 80.0
    d.iloc[-1, d.columns.get_loc("close")] = 79.0
    assert h2_trend_break(d) is True


def test_h2_trend_break_false_when_above_ema():
    assert h2_trend_break(_flat_daily(80, 100.0)) is False


def test_h2_requires_two_consecutive_closes():
    d = _flat_daily(80, 100.0)
    d.iloc[-1, d.columns.get_loc("close")] = 79.0   # only the final close breaks
    assert h2_trend_break(d) is False


def test_h3_distribution_fires_on_three_highvol_down_days():
    d = _flat_daily(80, 100.0)
    cl = d.columns.get_loc("close"); op = d.columns.get_loc("open")
    hi = d.columns.get_loc("high"); lo = d.columns.get_loc("low")
    vo = d.columns.get_loc("volume")
    for k in (-2, -5, -8):                      # 3 of the last 10 bars
        d.iloc[k, op] = 100.0; d.iloc[k, hi] = 100.5
        d.iloc[k, lo] = 95.0;  d.iloc[k, cl] = 95.3   # close in lower 1/3 of range
        d.iloc[k, vo] = 2.0e6                          # > 1.5x the 1e6 average
    assert h3_distribution(d) is True


def test_h3_distribution_false_on_quiet_tape():
    assert h3_distribution(_flat_daily(80, 100.0)) is False


def test_health_is_alertonly_int_and_string():
    d = _flat_daily(80, 100.0)
    h, flags = health(d, wk=d.resample("W-FRI").last().dropna(), spy=d, sector=None)
    assert isinstance(h, int) and isinstance(flags, str)
    assert 0 <= h <= 100


def test_health_h5_flag_subtracts_its_weight():
    d = _flat_daily(80, 100.0)
    wk = d.resample("W-FRI").last().dropna()
    h0, f0 = health(d, wk=wk, spy=d, sector=None, h5_flag=False)
    h1, f1 = health(d, wk=wk, spy=d, sector=None, h5_flag=True)
    assert h0 == 100 and f0 == ""
    assert h1 == 100 - WEIGHTS["H5"] and f1 == "H5"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.health`.

- [ ] **Step 3: Implement `health.py` (H2/H3 + composite + H1/H4 stubbed to False)**

```python
# argus/argus/position_engine/health.py
"""Health monitor (design spec §7) — v1 ALERT-ONLY: computes five deterioration
signals into a severity-weighted composite health in [0,100] plus a tripped-flags
string. Pure (frames in, (int,str) out); drives NO trade decision. Weights are
frozen STARTING constants — Phase 3b fits them on forward outcomes across disjoint
OOS universes. H5 (catalyst) is injected (default off) until its event feed lands."""
import pandas as pd

from ..indicators.compute import _ema, _rsi, _roc, _atr, _sma

# Severity weights (Phase-3a starting values; Σ = 100 so all-tripped -> 0).
WEIGHTS = {"H1": 15, "H2": 25, "H3": 25, "H4": 15, "H5": 20}
_ORDER = ("H1", "H2", "H3", "H4", "H5")

# Signal thresholds (spec §7), frozen.
TREND_BREAK_ATR = 0.5      # H2: close below 50-EMA by >0.5*ATR
DISTRIB_LOOKBACK = 10      # H3: last 10 days
DISTRIB_MIN_DAYS = 3       # H3: >=3 high-volume down days
DISTRIB_VOL_MULT = 1.5     # H3: vol > 1.5x 20-day avg
RS_DECAY_WEEKS = 3         # H4: falls 3 consecutive weeks
RS_EXCESS_LB = 13          # H4: 13-week excess


def h2_trend_break(daily: pd.DataFrame) -> bool:
    """Daily close below the 50-EMA by more than 0.5*ATR for 2 consecutive closes."""
    c, h, l = daily["close"], daily["high"], daily["low"]
    if len(daily) < 51:
        return False
    ema = _ema(c, 50)
    atr = _atr(h, l, c, 14)
    below = (ema - c) > (TREND_BREAK_ATR * atr)
    return bool(below.iloc[-1] and below.iloc[-2])


def h3_distribution(daily: pd.DataFrame) -> bool:
    """>=3 of the last 10 days are high-volume down days: close in the lower third
    of the day's range AND volume > 1.5x its trailing 20-day average."""
    if len(daily) < 21:
        return False
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    rng = (h - l).replace(0, pd.NA)
    lower_third = (c - l) / rng <= (1.0 / 3.0)
    down = c.diff() < 0
    vol_avg = _sma(v, 20)
    high_vol = v > (DISTRIB_VOL_MULT * vol_avg)
    flagged = (lower_third.fillna(False) & down & high_vol).iloc[-DISTRIB_LOOKBACK:]
    return bool(int(flagged.sum()) >= DISTRIB_MIN_DAYS)


def composite(flags: dict) -> tuple[int, str]:
    """Severity-weighted: 100 - sum of tripped weights, clamped to [0,100]; plus the
    comma-joined tripped IDs in fixed H1..H5 order ('' when none)."""
    penalty = sum(WEIGHTS[k] for k in _ORDER if flags.get(k))
    health_val = max(0, min(100, 100 - penalty))
    tripped = ",".join(k for k in _ORDER if flags.get(k))
    return health_val, tripped


def health(daily: pd.DataFrame, wk: pd.DataFrame, spy: pd.DataFrame,
           sector: pd.DataFrame | None = None, *, h5_flag: bool = False) -> tuple[int, str]:
    """Compute the alert-only composite for the bar at the end of `daily`. H1/H4 are
    completed in Task 3; here they read False so the module is testable end-to-end."""
    flags = {
        "H1": False,
        "H2": h2_trend_break(daily),
        "H3": h3_distribution(daily),
        "H4": False,
        "H5": bool(h5_flag),
    }
    return composite(flags)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -v`
Expected: PASS (all Task-1 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/health.py argus/tests/test_pe_health.py
git commit -m "feat(position-engine): health H2/H3 + severity-weighted composite (alert-only)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `health.py` — H1 momentum rollover (weekly + daily)

**Files:**
- Modify: `argus/argus/position_engine/health.py`
- Test: `argus/tests/test_pe_health.py` (add cases)

**Interfaces:**
- Consumes: `_roc`, `_sma`, `_rsi` (already imported in Task 1).
- Produces: `h1_momentum_rollover(daily: pd.DataFrame, wk: pd.DataFrame) -> bool`.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_health.py
def _weekly_from(daily):
    return daily.resample("W-FRI").agg(
        {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna()


def test_h1_false_on_steady_uptrend():
    # rising daily -> RSI>50 and ROC above its MA: no rollover
    idx = pd.date_range("2023-01-01", periods=400, freq="D")
    c = np.linspace(50, 150, 400)
    d = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                      "volume": np.full(400, 1e6)}, index=idx)
    assert h1_momentum_rollover(d, _weekly_from(d)) is False


def test_h1_fires_when_roc_rolls_over_under_weak_rsi():
    # long rise then a sustained 2-week fade: 12wk ROC dips below its 4wk MA while
    # daily RSI(14) prints < 50 on the last two days
    idx = pd.date_range("2022-06-01", periods=460, freq="D")
    up = np.linspace(50, 160, 430)
    fade = np.linspace(160, 138, 30)            # ~4-week rollover into weakness
    c = np.concatenate([up, fade])
    d = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                      "volume": np.full(len(c), 1e6)}, index=idx)
    assert h1_momentum_rollover(d, _weekly_from(d)) is True
```

Add the import to the test file's `health` import line: `h1_momentum_rollover`.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -k h1 -v`
Expected: FAIL — `ImportError: cannot import name 'h1_momentum_rollover'`.

- [ ] **Step 3: Implement H1 and wire it into `health()`**

```python
# add to argus/argus/position_engine/health.py
MOM_ROC_WEEKS = 12         # H1: 12-week ROC
MOM_MA_WEEKS = 4           # H1: 4-week MA of the ROC
MOM_RSI_MAX = 50           # H1: RSI(14) < 50
MOM_CONSEC_DAYS = 2        # H1: for 2 consecutive days


def h1_momentum_rollover(daily: pd.DataFrame, wk: pd.DataFrame) -> bool:
    """12-week ROC crosses below its 4-week MA while daily RSI(14) < 50, for 2
    consecutive days. Weekly ROC supplies the trend; daily RSI confirms weakness."""
    if len(wk) < MOM_ROC_WEEKS + MOM_MA_WEEKS or len(daily) < 16:
        return False
    roc = _roc(wk["close"], MOM_ROC_WEEKS)
    roc_ma = _sma(roc, MOM_MA_WEEKS)
    roc_below = (roc < roc_ma).iloc[-1]                       # current weekly rollover
    rsi = _rsi(daily["close"], 14)
    rsi_weak = bool((rsi.iloc[-MOM_CONSEC_DAYS:] < MOM_RSI_MAX).all())
    return bool(roc_below and rsi_weak)
```

Update `health()` to call it:

```python
        "H1": h1_momentum_rollover(daily, wk),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -v`
Expected: PASS (Task 1 + H1 cases).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/health.py argus/tests/test_pe_health.py
git commit -m "feat(position-engine): health H1 momentum rollover (12wk ROC vs 4wk MA + weak RSI)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `health.py` — H4 relative-strength decay (weekly excess vs SPY+sector)

**Files:**
- Modify: `argus/argus/position_engine/health.py`
- Test: `argus/tests/test_pe_health.py` (add cases)

**Interfaces:**
- Consumes: weekly ticker frame `wk`, weekly `spy`, optional weekly `sector` (Task 4 supplies the weekly SPY/sector from `replay()`).
- Produces: `h4_rs_decay(wk: pd.DataFrame, spy_wk: pd.DataFrame, sector_wk: pd.DataFrame | None) -> bool`. `health()` signature changes so its SPY/sector args are the **weekly** frames used by H4.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_health.py
def test_h4_false_when_outperforming():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    tkr = pd.DataFrame({"close": np.linspace(100, 160, 30)}, index=wks)   # strong
    spy = pd.DataFrame({"close": np.linspace(100, 110, 30)}, index=wks)   # weak bench
    assert h4_rs_decay(tkr, spy, None) is False


def test_h4_fires_on_three_weeks_of_negative_falling_excess():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    spy_c = np.linspace(100, 130, 30)                  # benchmark grinds up
    tkr_c = spy_c.copy()
    tkr_c[-3:] = [spy_c[-3] * 0.97, spy_c[-2] * 0.94, spy_c[-1] * 0.90]  # 3 weeks of decay
    tkr = pd.DataFrame({"close": tkr_c}, index=wks)
    spy = pd.DataFrame({"close": spy_c}, index=wks)
    assert h4_rs_decay(tkr, spy, None) is True


def test_h4_uses_sector_when_present():
    wks = pd.date_range("2023-01-06", periods=30, freq="W-FRI")
    spy_c = np.linspace(100, 130, 30)
    tkr_c = spy_c.copy()
    tkr_c[-3:] = [spy_c[-3] * 0.97, spy_c[-2] * 0.94, spy_c[-1] * 0.90]
    tkr = pd.DataFrame({"close": tkr_c}, index=wks)
    spy = pd.DataFrame({"close": spy_c}, index=wks)
    sector = pd.DataFrame({"close": spy_c}, index=wks)
    assert h4_rs_decay(tkr, spy, sector) is True
```

Add `h4_rs_decay` to the test file's import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -k h4 -v`
Expected: FAIL — `ImportError: cannot import name 'h4_rs_decay'`.

- [ ] **Step 3: Implement H4 and finalize `health()`**

```python
# add to argus/argus/position_engine/health.py
def _excess_series(wk: pd.DataFrame, spy_wk: pd.DataFrame,
                   sector_wk: pd.DataFrame | None) -> pd.Series:
    """Rolling 13-week excess return of the ticker over SPY (and sector, averaged
    when present), aligned on the weekly index."""
    def roll(df):
        return df["close"] / df["close"].shift(RS_EXCESS_LB) - 1.0
    tkr_r = roll(wk)
    exc = tkr_r - roll(spy_wk).reindex(wk.index)
    if sector_wk is not None:
        exc = (exc + (tkr_r - roll(sector_wk).reindex(wk.index))) / 2.0
    return exc.dropna()


def h4_rs_decay(wk: pd.DataFrame, spy_wk: pd.DataFrame,
                sector_wk: pd.DataFrame | None) -> bool:
    """13-week excess vs SPY (+sector) is negative now AND has fallen for 3
    consecutive weeks."""
    exc = _excess_series(wk, spy_wk, sector_wk)
    if len(exc) < RS_DECAY_WEEKS + 1:
        return False
    negative_now = bool(exc.iloc[-1] < 0)
    last = exc.iloc[-(RS_DECAY_WEEKS + 1):]
    falling = bool((last.diff().dropna() < 0).all())   # 3 consecutive weekly declines
    return negative_now and falling
```

Replace `health()` so H4 is live and the SPY/sector args are explicitly the weekly frames:

```python
def health(daily: pd.DataFrame, wk: pd.DataFrame, spy_wk: pd.DataFrame,
           sector_wk: pd.DataFrame | None = None, *, h5_flag: bool = False) -> tuple[int, str]:
    """Alert-only composite for the bar ending `daily`. `wk`/`spy_wk`/`sector_wk` are
    the weekly frames (H1 uses wk; H4 uses all three). Drives no trade decision."""
    flags = {
        "H1": h1_momentum_rollover(daily, wk),
        "H2": h2_trend_break(daily),
        "H3": h3_distribution(daily),
        "H4": h4_rs_decay(wk, spy_wk, sector_wk),
        "H5": bool(h5_flag),
    }
    return composite(flags)
```

Then fix the two Task-1 `health(...)` tests that passed a daily `spy=d`: change them to pass weekly frames (`spy_wk=_weekly_from(d)`), since the contract is now weekly. Update `test_health_is_alertonly_int_and_string` and `test_health_h5_flag_subtracts_its_weight` accordingly (a flat series trips nothing, so the asserted values are unchanged).

- [ ] **Step 4: Run the full health test module**

Run: `.venv/bin/python -m pytest tests/test_pe_health.py -v`
Expected: PASS (every health case).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/health.py argus/tests/test_pe_health.py
git commit -m "feat(position-engine): health H4 RS decay + finalize weighted composite" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Wire `health()` into `replay()` — persist health/health_flags

**Files:**
- Modify: `argus/argus/position_engine/replay.py`
- Test: `argus/tests/test_pe_replay.py` (add one case; keep the existing three green)

**Interfaces:**
- Consumes: `health(daily, wk, spy_wk, sector_wk, h5_flag=False)` from Task 3.
- Produces: per-bar `position_signals.health` (int) + `health_flags` (str) populated for every written bar (was NULL).

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_replay.py
def test_replay_persists_health_int_and_flags_string(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    n_default = replay(conn, ticker="H", daily=df, spy=df, sector=None, model_ver="v1",
                       run_kind="ondemand")
    rows = conn.execute(
        "SELECT health, health_flags FROM position_signals WHERE ticker='H'").fetchall()
    conn.close()
    assert rows, "expected persisted signal rows"
    # health is a populated int in range; flags is a string (possibly empty), never NULL
    assert all(r["health"] is not None and 0 <= r["health"] <= 100 for r in rows)
    assert all(isinstance(r["health_flags"], str) for r in rows)


def test_health_does_not_change_trade_outcomes(tmp_path):
    # alert-only: persisting health must not alter the trade the engine books
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    replay(conn, ticker="H2", daily=df, spy=df, sector=None, model_ver="v1", run_kind="ondemand")
    t = conn.execute("SELECT exit_reason, exit_px FROM trades WHERE ticker='H2'").fetchone()
    conn.close()
    assert t is not None and t["exit_reason"] == "stop"   # same round-trip as test_pe_replay's base case
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py::test_replay_persists_health_int_and_flags_string -v`
Expected: FAIL — `health` column is `None` (assert on `r["health"] is not None` fails).

- [ ] **Step 3: Resample weekly SPY/sector and call `health()` per bar**

In `argus/argus/position_engine/replay.py`, add the import near the other `.` imports (after `from .progress import ...`):

```python
from .health import health as _health
```

After the ticker `weekly` is built (`replay.py:41-42`), resample the benchmarks once:

```python
    _wk_agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    spy_weekly = spy.resample("W-FRI").agg(_wk_agg).dropna()
    sector_weekly = (sector.resample("W-FRI").agg(_wk_agg).dropna()
                     if sector is not None else None)
```

Inside the per-bar loop, after `wk` is sliced (`replay.py:58`), compute the alert-only health for this bar (point-in-time slices, mirroring `wk`):

```python
        spy_wk = spy_weekly[spy_weekly.index <= daily.index[i]]
        sector_wk = (sector_weekly[sector_weekly.index <= daily.index[i]]
                     if sector_weekly is not None else None)
        h_val, h_flags = _health(win, wk, spy_wk, sector_wk)   # h5_flag deferred (off)
```

Replace the two `None`s in the `write_signal` dict (`replay.py:124`) — change
`"progress_anchor": None, "health": None, "health_flags": None, "risk_state": rs,`
to:

```python
            "progress_anchor": None, "health": h_val, "health_flags": h_flags, "risk_state": rs,
```

Leave every bias/strength/level/overlay line untouched — health is write-only.

- [ ] **Step 4: Run the new cases + the full replay module + the suite**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py -v && .venv/bin/python -m pytest tests/ -q`
Expected: replay cases PASS (incl. the unchanged trade round-trip); full suite green (**156 passed** = prior 154 + the 2 new replay cases; the health unit tests from Tasks 1–3 also count — final count is whatever the run reports, record it).

- [ ] **Step 5: Update the stale module docstring**

In `replay.py:1-5`, the docstring says `health=None (Phase 3)`. Change that clause to `health computed alert-only (Phase 3a)`.

- [ ] **Step 6: Commit**

```bash
git add argus/argus/position_engine/replay.py argus/tests/test_pe_replay.py
git commit -m "feat(position-engine): wire alert-only health into replay (persist health/health_flags)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-suite regression + close-out

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all green. Record the exact count (≈ 154 prior + new health unit tests + 2 replay cases).

- [ ] **Step 2: Confirm alert-only invariant held**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py tests/test_pe_invariants.py -q`
Expected: green — the pre-existing trade/overlay invariants are unchanged, proving health did not perturb the engine.

- [ ] **Step 3: Commit the regression marker**

```bash
git commit --allow-empty -m "test(position-engine): WS-4 Phase 3a health-monitor full-suite regression green" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (spec §7 coverage)

| Spec §7 requirement | Task |
|---|---|
| H1 momentum rollover (12-wk ROC vs 4-wk MA + RSI<50, 2 days) | 2 |
| H2 trend break (close < 50-EMA by >0.5·ATR, 2 closes) | 1 |
| H3 distribution (≥3/10 high-vol down days) | 1 |
| H4 RS decay (13-wk excess negative + falls 3 weeks) | 3 |
| H5 catalyst risk (injected, off in 3a) | 1 (slot) / Phase 3b (feed) |
| `health ∈ [0,100]` + display anchors | 1 (`composite`) |
| `health_flags` (tripped sub-signals) | 1 (`composite`) |
| Alert-only — does not auto-close in v1 | 4 (write-only) + 5 (invariant) |
| Persist per-bar health into `position_signals` | 4 |

**Deferred to Phase 3b (by design, NOT in this plan):** fitting the 5 severity weights on forward-return / paired-exit-Δ across ≥3 disjoint point-in-time OOS universes (censoring-aware, block-bootstrap CI), and wiring the H5 earnings/downgrade event feed. The censoring-aware graduation evaluation (spec §7) and the multi-name universe runner are 3b consumers of the Phase-2 backtest harness — health stays alert-only until then.

---

## Execution handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
