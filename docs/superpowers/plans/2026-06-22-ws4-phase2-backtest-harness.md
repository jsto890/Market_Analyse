# WS-4 Phase 2 · Backtest Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A no-UI, point-in-time backtest harness that replays the Phase-1 position engine over ticker×period with injectable parameters and a realistic multi-timeframe fill model, emits a per-run trade log + metrics, sweeps the 8 pre-registered tunables, and gates on the leakage shuffle test and the locked success bar.

**Architecture:** Reuse the tested `replay()` runner (not vectorbt — not installed, and the machine is stateful) driven into a **throwaway per-run SQLite file**, never the live DB. The 8 tunables are injected via a frozen `EngineParams` threaded as an optional default arg through the Phase-1 pure functions + `replay` (defaults = today's constants, so all 126 tests stay green). A **separate backtest cost/fill layer** re-prices each engine exit from the OHLC frame — exact intraday fills when intraday history exists, a conservative daily fallback when it doesn't — keeping slippage/commission out of the live signal engine. Metrics are **R-space** (sizing-free, consistent with the signals-only engine). Validation = block-bootstrap CI + the leakage shuffle gate + the pre-registered MAR/trades-per-year comparator.

**Tech Stack:** Python 3 (pandas 3.0, numpy 2.4, scipy 1.17), SQLite via `argus.db.get_conn`, `argus.data.market.get_history` for data, pytest. New code lives in `argus/argus/position_engine/`.

---

## Decisions & findings (read before Task 1)

Resolved by repo inspection + the prior design conversation:

1. **Engine = reuse `replay()`.** `import vectorbt` → ImportError; the machine is stateful (Schmitt/dwell/overlay), so vectorization fights it. `replay()` is already dataframe-injected (`daily/spy/sector` args) and is **not yet wired to any job or endpoint** — safe to extend.
2. **Per-run DB is mandatory.** `replay()` calls `_clear_prior_trades` and writes the `trades` table on whatever `conn` it is handed (`replay.py:18,84`). Backtests therefore run into a fresh per-run file. **Footgun:** `get_conn(":memory:")` becomes `Path(":memory:")` — a real file, not an in-memory DB — so we use a real per-run file under the run dir (and reuse `get_conn`'s WAL/pragma contract).
3. **8 tunables ↔ existing module constants** (the only fields in `EngineParams`):
   | EngineParams field | Current constant | Module |
   |---|---|---|
   | `bias_enter`, `bias_leave` | `ENTER=4`, `LEAVE=1` | `bias.py` |
   | `confirm_bars` | `CONFIRM=2` | `bias.py` |
   | `min_dwell` | `DWELL=10` | `bias.py` |
   | `arm`, `disarm` | `ARM=50`, `DISARM=40` | `strength.py` |
   | `buy_zone_atr` | `BUY_ZONE_ATR=0.5` | `levels.py` |
   | `stop_atr` | `STOP_ATR=1.5` | `levels.py` |
   | `trail_atr` | `TRAIL_ATR=2.5` | `levels.py` |
   | `cooldown_bars` | `COOLDOWN_BARS=5` | `overlay.py` |
   **Held fixed (NOT tunable, NOT in EngineParams):** `MIN_HOLD_BARS`, `RR_FLOOR`, `RESUME_VOL`, `GAP_ATR`, `SWING_LB`, strength weights (spec §192).
4. **Finding — `trail_stop` is dead code in Phase 1.** `replay()` uses a static `init_stop` end-to-end; `levels.trail_stop` is defined but never called, so `trail_atr` is inert. **Task 2 wires the sticky trail** so the knob is real and the level model matches spec §95. It only ratchets the stop *up*, so the existing `test_pe_replay` round-trip still stop-outs (verified as a step). **Decided (2026-06-22): Task 2 is REQUIRED and runs first.** The trail is baseline machinery (spec §5/§95), not a graduatable overlay, so a static-stop run is not "the baseline"; and `trail_atr` is one of the 8 pre-registered tunables, so it must be live *before* any fitting (spec §192's "freeze 8, fit once"). Sweeping without it would fit the other 7 knobs to a crippled engine and the optima would be discarded once the trail is wired. **The sweep (Task 9) must not start until the trail is wired and the suite is green.**
5. **Cost/fill model (trader-confirmed) + multi-TF synthesis:**
   - **Intraday available** → exact fills: walk the day's lower-TF bars, take the first level touched (resolves the same-day stop-vs-target order), fill stop at `min(stop, that bar's open)`, target at `max(target, that bar's open)`.
   - **Intraday unavailable (the historical default)** → daily fallback = the confirmed model: stop → `min(stop, exit-day open)` (gap-through); target/time/bias_flip → next-bar open; **straddle day (both levels in range) → stop-first** (conservative).
   - **Frictions on every fill:** ~5 bps/side slippage + ~$0.005/share commission; R, expectancy, and the equity curve are all **net**.
   - This lives in `fills.py` (backtest-only). The engine is untouched, so slippage never leaks into live arrows, and `replay.py:88`'s optimistic stop-at-level is overridden in the backtest without changing live behaviour.
   - **Intraday source = IBKR 1-hour bars (decided).** yfinance only reaches ~60 days of 5m/15m and ~730 days of 1h, which doesn't cover the OOS regimes. IBKR `reqHistoricalData` serves **multi-year 1h bars** (paged in ≤1Y chunks), so the exact-fill path covers the historical regimes too — 1h resolution is sufficient for stop-vs-target sequencing on a daily swing system. The repo already has a lazy `IBKRClient` singleton (`argus/data/ibkr.py`, `ib_insync` 0.9.86); Task 4b adds a `historical_bars()` method + an IBKR-backed fetcher. **Connection:** `IBKR_HOST=127.0.0.1`, `IBKR_PORT=7496` (TWS live API socket — match whatever you expose), `IBKR_CLIENT_ID` any free id; read-only, so `IBKR_LIVE_TRADING=0`. The fetcher **falls back to the daily model** on any disconnect/missing day, so a backtest never hard-fails when TWS isn't running. yfinance 1h stays available as a secondary source.
6. **Metrics are R-space (sizing-free).** The engine is signals-only (`qty=1.0`, spec §23), so we do **not** invent dollar sizing. Equity curve = cumulative net-R; max drawdown measured in R; `MAR = (net_R / years) / max_drawdown_R`. Benchmarks (`buy&hold`, `SPY`) are compared as **MAR ratios** (their `return% / maxDD%` vs the strategy's R-space MAR) so the comparison is dimensionally honest.
7. **Outputs** → `argus/backtests/<ts>/`: `run.db` (throwaway), `trades.csv`, `metrics.json`, `params.json`, and `sweep_summary.json` for sweeps.

### File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/params.py` | **New.** `EngineParams` frozen dataclass + `DEFAULT`. Zero engine imports (avoids cycles). |
| `argus/argus/position_engine/bias.py` | **Modify.** Thread `params` through `step_bias`. |
| `argus/argus/position_engine/strength.py` | **Modify.** Thread `params` through `arm_eligible`. |
| `argus/argus/position_engine/levels.py` | **Modify.** Thread `params` through `entry_trigger`, `compute_levels`, `trail_stop`. |
| `argus/argus/position_engine/overlay.py` | **Modify.** Thread `params` through `step_overlay` (cooldown only). |
| `argus/argus/position_engine/replay.py` | **Modify.** Accept `params`; wire the sticky trail (Task 2). |
| `argus/argus/position_engine/fills.py` | **New.** Cost/fill model + multi-TF exit resolver + IBKR/yf intraday fetchers. Pure core (data injected). |
| `argus/argus/data/ibkr.py` | **Modify.** Add `historical_bars()` (1h multi-year) to the existing `IBKRClient`. |
| `argus/argus/position_engine/metrics.py` | **New.** R-equity curve, aggregates, block-bootstrap CI, success-bar comparator. |
| `argus/argus/position_engine/backtest.py` | **New.** Single-config orchestrator → per-run dir. CLI entrypoint. |
| `argus/argus/position_engine/sweep.py` | **New.** Grid sweep over `EngineParams` + stability surface. |
| `argus/argus/position_engine/leakage.py` | **New.** `shuffle_future` gate. |
| `tests/test_pe_params.py` … `test_pe_leakage.py` | **New.** One test module per new unit. |

---

## Task 1: `EngineParams` + thread through the pure functions

**Files:**
- Create: `argus/argus/position_engine/params.py`
- Modify: `argus/argus/position_engine/bias.py`, `strength.py`, `levels.py`, `overlay.py`
- Test: `tests/test_pe_params.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_params.py
from dataclasses import replace
from argus.position_engine.params import EngineParams, DEFAULT
from argus.position_engine.bias import BiasState, step_bias, ENTER, LEAVE, CONFIRM, DWELL
from argus.position_engine.strength import arm_eligible, ARM, DISARM


def test_defaults_equal_phase1_constants():
    assert (DEFAULT.bias_enter, DEFAULT.bias_leave) == (ENTER, LEAVE)
    assert DEFAULT.confirm_bars == CONFIRM and DEFAULT.min_dwell == DWELL
    assert (DEFAULT.arm, DEFAULT.disarm) == (ARM, DISARM)


def test_params_is_frozen():
    import pytest
    with pytest.raises(Exception):
        DEFAULT.arm = 99  # frozen dataclass


def test_arm_gate_respects_injected_params():
    loose = EngineParams(arm=10, disarm=5)
    # strength 12 does not arm at default (50) but does under the loose params
    assert arm_eligible(False, 12) is False
    assert arm_eligible(False, 12, loose) is True


def test_step_bias_respects_injected_enter_threshold():
    easy = EngineParams(bias_enter=2, confirm_bars=1, min_dwell=0)
    st = BiasState(bias="NEUTRAL", bars_in_state=99)
    # score 2 stays NEUTRAL at default enter=4, flips LONG under easy.bias_enter=2
    assert step_bias(st, 2).bias == "NEUTRAL"
    assert step_bias(st, 2, easy).bias == "LONG"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_params.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.params` / `step_bias() takes 2 positional arguments`.

- [ ] **Step 3: Create `params.py`**

```python
# argus/argus/position_engine/params.py
"""The 8 pre-registered tunables (design spec §11/§192), frozen for injection.
Defaults equal the Phase-1 module constants so existing callers are unchanged.
NOT included (held fixed by the spec): min-hold, R:R floor, resumption volume,
gap-skip ATR, swing lookback, strength weights."""
from dataclasses import dataclass


@dataclass(frozen=True)
class EngineParams:
    bias_enter: int = 4      # bias.ENTER  (Schmitt upper)
    bias_leave: int = 1      # bias.LEAVE  (Schmitt lower)
    confirm_bars: int = 2    # bias.CONFIRM
    min_dwell: int = 10      # bias.DWELL
    arm: int = 50            # strength.ARM
    disarm: int = 40         # strength.DISARM
    buy_zone_atr: float = 0.5  # levels.BUY_ZONE_ATR
    stop_atr: float = 1.5      # levels.STOP_ATR
    trail_atr: float = 2.5     # levels.TRAIL_ATR
    cooldown_bars: int = 5     # overlay.COOLDOWN_BARS


DEFAULT = EngineParams()
```

- [ ] **Step 4: Thread `params` through `bias.step_bias`**

In `argus/argus/position_engine/bias.py`, add the import and replace the signature/body of `step_bias`. Keep the module-level `ENTER, LEAVE, CONFIRM, DWELL` constants (tests import them).

```python
from .params import EngineParams, DEFAULT  # add near the top imports


def step_bias(prev: BiasState, score: int, params: EngineParams = DEFAULT) -> BiasState:
    """Schmitt hysteresis (enter ±bias_enter, leave at ±bias_leave) + confirm_bars
    consecutive bars + min_dwell minimum hold. NEUTRAL is the buffer between thresholds."""
    locked = prev.bars_in_state < params.min_dwell
    if prev.bias == "LONG":
        want = "LONG" if score > params.bias_leave else "NEUTRAL"
    elif prev.bias == "SHORT":
        want = "SHORT" if score < -params.bias_leave else "NEUTRAL"
    else:
        want = "LONG" if score >= params.bias_enter else ("SHORT" if score <= -params.bias_enter else "NEUTRAL")
    if want == prev.bias or locked:
        return BiasState(prev.bias, prev.bars_in_state + 1, None, 0)
    cc = prev.confirm_count + 1 if prev.pending == want else 1
    if cc >= params.confirm_bars:
        return BiasState(want, 0, None, 0)
    return BiasState(prev.bias, prev.bars_in_state + 1, want, cc)
```

- [ ] **Step 5: Thread `params` through `strength.arm_eligible`**

In `argus/argus/position_engine/strength.py`:

```python
from .params import EngineParams, DEFAULT  # add near the top imports


def arm_eligible(prev_armed: bool, strength: int, params: EngineParams = DEFAULT) -> bool:
    """Hysteresis: arm at >=params.arm, disarm only below params.disarm."""
    if prev_armed:
        return strength >= params.disarm
    return strength >= params.arm
```

- [ ] **Step 6: Thread `params` through `levels` and `overlay`**

In `argus/argus/position_engine/levels.py` add `from .params import EngineParams, DEFAULT` and update the three functions' signatures/bodies (keep module constants for the fixed ones):

```python
def entry_trigger(daily: pd.DataFrame, params: EngineParams = DEFAULT) -> bool:
    if len(daily) < 60:
        return False
    c, h, l, v = daily["close"], daily["high"], daily["low"], daily["volume"]
    atr = _atr(h, l, c, 14).iloc[-1]
    ema20, ema50 = _ema(c, 20).iloc[-1], _ema(c, 50).iloc[-1]
    prev = daily.iloc[-2]
    bar = daily.iloc[-1]
    near = min(abs(prev["low"] - ema20), abs(prev["low"] - ema50)) <= params.buy_zone_atr * atr
    resume = bar["close"] > prev["high"]
    vol_ok = bar["volume"] >= RESUME_VOL * v.iloc[-21:-1].mean()
    return bool(near and resume and vol_ok)


def compute_levels(entry_px: float, daily: pd.DataFrame, params: EngineParams = DEFAULT) -> dict:
    c, h, l = daily["close"], daily["high"], daily["low"]
    atr = float(_atr(h, l, c, 14).iloc[-1])
    swing_low = float(l.iloc[-SWING_LB:].min())
    stop = min(swing_low, entry_px - params.stop_atr * atr)
    r = entry_px - stop
    struct_target = float(h.iloc[-SWING_LB:].max())
    target = min(entry_px + 2.0 * r, struct_target) if struct_target > entry_px else entry_px + 2.0 * r
    rr = (target - entry_px) / r if r > 0 else 0.0
    return {"entry": entry_px, "stop": stop, "target": target, "rr": rr,
            "armed": bool(rr >= RR_FLOOR), "atr": atr}


def trail_stop(prior_stop: float, close: float, atr: float, progress_r: float,
               entry: float, params: EngineParams = DEFAULT) -> float:
    """Sticky, ratchet-up only. >=+1R: breakeven; beyond: chandelier max."""
    candidate = prior_stop
    if progress_r >= 1.0:
        candidate = max(candidate, entry)
    if progress_r > 1.0:
        candidate = max(candidate, close - params.trail_atr * atr)
    return max(prior_stop, candidate)
```

In `argus/argus/position_engine/overlay.py` add `from .params import EngineParams, DEFAULT` and thread cooldown only (keep `MIN_HOLD_BARS`, `COOLDOWN_BARS` constants — tests import the latter):

```python
def step_overlay(prev: OverlayState, ctx: OverlayCtx, params: EngineParams = DEFAULT):
    # ... body unchanged EXCEPT the EXIT→COOLDOWN edge:
    if prev.overlay == "EXIT":
        return OverlayState("COOLDOWN", cooldown_until=ctx.bar_index + params.cooldown_bars), None, events
```

- [ ] **Step 7: Run the new test + the full suite**

Run: `.venv/bin/python -m pytest tests/test_pe_params.py -v && .venv/bin/python -m pytest tests/ -q`
Expected: new tests PASS; **126 passed** (defaults preserve every existing test).

- [ ] **Step 8: Commit**

```bash
git add argus/argus/position_engine/params.py argus/argus/position_engine/bias.py \
        argus/argus/position_engine/strength.py argus/argus/position_engine/levels.py \
        argus/argus/position_engine/overlay.py tests/test_pe_params.py
git commit -m "feat(position-engine): EngineParams — inject the 8 tunables through the pure fns"
```

---

## Task 2: Wire the sticky trail into `replay()` (behind `params.trail_atr`)

> **Required — run this task first (decided 2026-06-22).** The sticky trail is baseline machinery (spec §5/§95), not a graduatable overlay, and `trail_atr` is one of the 8 pre-registered knobs, so it must be live before any sweep. Do not start Task 9 until the trail is wired and the full suite is green.

**Files:**
- Modify: `argus/argus/position_engine/replay.py`
- Test: `tests/test_pe_replay.py` (add a case; keep the existing two green)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_pe_replay.py
from argus.position_engine.params import EngineParams


def test_trail_ratchets_stop_up_and_locks_gains(tmp_path):
    conn = get_conn(tmp_path / "pe.db")
    ensure_schema(conn)
    df = _series()
    # tight trail forces an above-entry (locked) stop-out on the post-peak drop
    replay(conn, ticker="TEST", daily=df, spy=df, sector=None, model_ver="v1",
           run_kind="ondemand", params=EngineParams(trail_atr=1.0))
    t = conn.execute("SELECT * FROM trades WHERE ticker='TEST' AND exit_reason='stop'").fetchone()
    conn.close()
    assert t is not None
    # exit above entry => the trail locked gain rather than taking the original stop
    assert t["exit_px"] > t["entry_px"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py::test_trail_ratchets_stop_up_and_locks_gains -v`
Expected: FAIL — exit price equals the original static stop (below entry).

- [ ] **Step 3: Add `params` to `replay()` and recompute the trailed stop each LONG bar**

In `argus/argus/position_engine/replay.py`: import `trail_stop`, add `params` to the signature, and update the trailed stop on the LONG self-loop. The stop used by `step_overlay` must be the *current trailed* stop, held in a local `cur_stop`.

```python
from .levels import entry_trigger, compute_levels, gap_skip, trail_stop  # add trail_stop
from .params import EngineParams, DEFAULT                                 # add
from .progress import progress_r, progress_pct, risk_state                # unchanged


def replay(conn, *, ticker, daily, spy, sector, model_ver, run_kind="live",
           mode="paper", params: EngineParams = DEFAULT) -> int:
    # ... unchanged setup through the per-bar loop ...
    # add alongside init_stop/init_target/entry_px:
    cur_stop = None
```

Inside the loop, after `strength`/`armed_prev` and before building `levels`, ratchet the live stop while LONG:

```python
        if ostate.overlay == "LONG" and entry_px is not None and cur_stop is not None:
            atr = float(_atr(win["high"], win["low"], win["close"], 14).iloc[-1])
            pr_now = progress_r(float(bar["close"]), entry_px, init_stop)
            cur_stop = trail_stop(cur_stop, float(bar["close"]), atr, pr_now, entry_px, params)
        live_stop = cur_stop if (ostate.overlay == "LONG" and cur_stop is not None) else (cur_levels or {}).get("stop")
```

Add the import `from ..indicators.compute import _atr` at the top. Pass `params` into `step_bias`, `arm_eligible`, `entry_trigger`, `compute_levels`, and `step_overlay`, and feed `live_stop` into the overlay context:

```python
        score = bias_score(win, wk)
        bstate = step_bias(bstate, score, params)
        ...
        armed_prev = arm_eligible(armed_prev, strength, params) if bstate.bias == "LONG" else False
        sig = entry_trigger(win, params) if (bstate.bias == "LONG" and armed_prev) else False
        if sig and ostate.overlay == "FLAT":
            cur_levels = compute_levels(entry_px=float(bar["close"]), daily=win, params=params)
        levels = (dict(cur_levels, stop=live_stop) if cur_levels else
                  {"entry": None, "stop": live_stop, "target": None, "armed": False})
        ctx = OverlayCtx(..., levels=levels, ...)
        ostate, exit_reason, events = step_overlay(ostate, ctx, params)
```

On `ARMED→LONG` set `cur_stop = init_stop` after the fill; on `EXIT` clear `cur_stop = None` alongside the other level resets. On a `stop` exit, book `exit_px = live_stop` (the trailed stop) instead of `init_stop`:

```python
        if ostate.overlay == "EXIT" and trade_id is not None:
            exit_px = live_stop if exit_reason == "stop" else float(bar["open"])
            ...
        if ostate.overlay == "EXIT":
            entry_px = init_stop = init_target = cur_levels = cur_stop = None
```

- [ ] **Step 4: Run the new test + the existing replay tests + full suite**

Run: `.venv/bin/python -m pytest tests/test_pe_replay.py -v && .venv/bin/python -m pytest tests/ -q`
Expected: 3 replay tests PASS; **127 passed** total (126 prior + the new trail case).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/replay.py tests/test_pe_replay.py
git commit -m "feat(position-engine): wire sticky chandelier trail into replay (params.trail_atr)"
```

---

## Task 3: `fills.py` — daily fallback cost/fill model

**Files:**
- Create: `argus/argus/position_engine/fills.py`
- Test: `tests/test_pe_fills.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_fills.py
import pandas as pd
from argus.position_engine.fills import FillModel, price_exit

FM = FillModel(slippage_bps=5.0, commission_per_share=0.005)


def _day(o, h, l, c):
    return pd.Series({"open": o, "high": h, "low": l, "close": c})


def test_stop_gap_through_fills_at_open_not_level():
    # opened at 90 which is BELOW the 95 stop -> you eat the gap, fill ~90 (net of costs)
    bar, nxt = _day(90, 96, 89, 95), _day(95, 97, 94, 96)
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop"
    assert 89.9 < px < 90.0  # min(stop, open)=90, minus sell-side slippage/commission


def test_stop_intraday_pierce_fills_at_stop():
    bar, nxt = _day(98, 99, 94, 96), _day(96, 97, 95, 96)  # opened above stop, traded down through it
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop" and 94.8 < px < 95.0  # min(stop, open)=95, net of costs


def test_target_fills_at_next_open_in_daily_fallback():
    bar, nxt = _day(110, 121, 109, 118), _day(119, 122, 118, 120)
    reason, px = price_exit("target", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "target" and 118.9 < px < 119.0  # next_open=119, net of costs


def test_straddle_day_resolves_stop_first_without_intraday():
    bar, nxt = _day(108, 121, 94, 119), _day(119, 120, 118, 119)  # both 95 and 120 in range
    reason, px = price_exit("target", stop=95.0, target=120.0, day=bar, next_day=nxt,
                            intraday=None, fm=FM)
    assert reason == "stop"  # conservative: stop wins the ambiguous day
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_fills.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.fills`.

- [ ] **Step 3: Implement the daily fallback**

```python
# argus/argus/position_engine/fills.py
"""Backtest-only cost/fill model (design spec §11). Re-prices each engine exit:
exact intraday fills when intraday bars exist, else a conservative daily fallback
(stop -> min(stop, exit-day open) gap-through; target/time/bias -> next-bar open;
straddle day -> stop-first). All fills are net of slippage + commission. Lives
outside the engine so live arrows never see slippage."""
from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class FillModel:
    slippage_bps: float = 5.0          # per side
    commission_per_share: float = 0.005


def _net_sell(px: float, fm: FillModel) -> float:
    """Proceeds from selling 1 share: slippage against you + commission."""
    return px * (1.0 - fm.slippage_bps / 1e4) - fm.commission_per_share


def net_buy(px: float, fm: FillModel) -> float:
    """Cost to buy 1 share (used by metrics for the entry leg)."""
    return px * (1.0 + fm.slippage_bps / 1e4) + fm.commission_per_share


def price_exit(reason: str, *, stop: float, target: float, day: pd.Series,
               next_day: pd.Series | None, intraday: pd.DataFrame | None,
               fm: FillModel) -> tuple[str, float]:
    """Return (resolved_reason, net_exit_px) for one exit. `day` is the engine's
    exit-day OHLC; `next_day` the bar after (None at series end); `intraday` the
    day's lower-TF bars or None."""
    if intraday is not None and len(intraday) > 0:
        return _price_exit_intraday(stop, target, intraday, fm)

    stop_in = day["low"] <= stop
    target_in = day["high"] >= target
    if stop_in:                                  # stop-first on straddle days
        return "stop", _net_sell(min(stop, float(day["open"])), fm)
    if target_in:
        nxt = float((next_day if next_day is not None else day)["open"])
        return "target", _net_sell(nxt, fm)
    # neither level in range this day -> a time/bias_flip exit; fill next open
    nxt = float((next_day if next_day is not None else day)["open"])
    return reason, _net_sell(nxt, fm)


def _price_exit_intraday(stop: float, target: float, intraday: pd.DataFrame,
                         fm: FillModel) -> tuple[str, float]:
    """Walk the day's lower-TF bars; first level touched wins (resolves order)."""
    for _, b in intraday.iterrows():
        hit_stop = b["low"] <= stop
        hit_target = b["high"] >= target
        if hit_stop and hit_target:              # same sub-bar straddle -> conservative
            return "stop", _net_sell(min(stop, float(b["open"])), fm)
        if hit_stop:
            return "stop", _net_sell(min(stop, float(b["open"])), fm)
        if hit_target:
            return "target", _net_sell(max(target, float(b["open"])), fm)
    # not touched intraday (engine exit was time/bias_flip): fill at the last close
    last = float(intraday.iloc[-1]["close"])
    return "time", _net_sell(last, fm)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_fills.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/fills.py tests/test_pe_fills.py
git commit -m "feat(backtest): cost/fill model — daily fallback (gap-through, next-open, stop-first)"
```

---

## Task 4: `fills.py` — intraday exact-fill resolver

**Files:**
- Modify: `tests/test_pe_fills.py` (intraday cases; `_price_exit_intraday` already exists from Task 3)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_pe_fills.py
def _intraday(rows):
    return pd.DataFrame(rows, columns=["open", "high", "low", "close"])


def test_intraday_resolves_target_first_when_it_trades_first():
    # within the day: bar 1 tags the target (120) before any later bar tags the stop (95)
    intr = _intraday([[118, 121, 117, 120], [119, 119, 94, 95]])
    reason, px = price_exit("stop", stop=95.0, target=120.0, day=_day(118, 121, 94, 95),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "target" and 119.9 < px < 120.0  # filled at the target limit, net


def test_intraday_resolves_stop_first_when_it_trades_first():
    intr = _intraday([[118, 119, 94, 96], [96, 121, 96, 120]])  # stop tagged in bar 1
    reason, px = price_exit("target", stop=95.0, target=120.0, day=_day(118, 121, 94, 120),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "stop" and 94.8 < px < 95.0


def test_intraday_target_gap_up_fills_better_than_limit():
    intr = _intraday([[122, 123, 121, 122]])  # opens above the 120 target -> fill at 122
    reason, px = price_exit("target", stop=95.0, target=120.0, day=_day(122, 123, 121, 122),
                            next_day=None, intraday=intr, fm=FM)
    assert reason == "target" and px > 121.0
```

- [ ] **Step 2: Run test to verify the resolver behaves**

Run: `.venv/bin/python -m pytest tests/test_pe_fills.py -k intraday -v`
Expected: PASS (3 tests) — `_price_exit_intraday` from Task 3 already implements this; if any fail, fix `_price_exit_intraday` until green.

- [ ] **Step 3: Add the intraday fetcher adapter**

```python
# append to argus/argus/position_engine/fills.py
from ..data.market import get_history


def make_intraday_fetcher(ticker: str, interval: str = "60m", period: str = "2y"):
    """Return fetch(day_ts) -> intraday OHLC for that calendar day, or None when
    the source has no bars for it (the common historical case). Pulled once, sliced
    per day. Source-agnostic: swap get_history for a deeper feed without changing
    the resolver."""
    try:
        intr = get_history(ticker, period=period, interval=interval)
    except Exception:
        intr = None

    def fetch(day_ts) -> pd.DataFrame | None:
        if intr is None or intr.empty:
            return None
        d = pd.Timestamp(day_ts).date()
        sl = intr[intr.index.normalize() == pd.Timestamp(d)]
        return sl if len(sl) else None

    return fetch
```

- [ ] **Step 4: Test the fetcher slices by day (network-free via monkeypatch)**

```python
# append to tests/test_pe_fills.py
def test_make_intraday_fetcher_slices_by_day(monkeypatch):
    import argus.position_engine.fills as F
    idx = pd.to_datetime(["2024-03-01 09:30", "2024-03-01 10:30", "2024-03-04 09:30"])
    fake = pd.DataFrame({"open": [1, 2, 3], "high": [1, 2, 3], "low": [1, 2, 3],
                         "close": [1, 2, 3], "volume": [1, 1, 1]}, index=idx)
    monkeypatch.setattr(F, "get_history", lambda *a, **k: fake)
    fetch = F.make_intraday_fetcher("X")
    assert len(fetch("2024-03-01")) == 2
    assert fetch("2024-03-02") is None
```

Run: `.venv/bin/python -m pytest tests/test_pe_fills.py -v`
Expected: PASS (all fills tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/fills.py tests/test_pe_fills.py
git commit -m "feat(backtest): intraday exact-fill resolver + per-day fetcher adapter"
```

---

## Task 4b: IBKR 1-hour intraday source for exact fills

**Files:**
- Modify: `argus/argus/data/ibkr.py` (add `historical_bars`)
- Modify: `argus/argus/position_engine/fills.py` (add `make_ibkr_intraday_fetcher`)
- Test: `tests/test_pe_ibkr_intraday.py`

- [ ] **Step 1: Write the failing test (network-free via a fake IB)**

```python
# tests/test_pe_ibkr_intraday.py
import pandas as pd
import pytest


class _FakeBar:
    def __init__(self, date, o, h, l, c, v):
        self.date, self.open, self.high, self.low, self.close, self.volume = date, o, h, l, c, v


def test_historical_bars_returns_lowercase_ohlcv(monkeypatch):
    from argus.data import ibkr
    bars = [_FakeBar(pd.Timestamp("2024-03-01 10:00"), 10, 11, 9, 10.5, 100),
            _FakeBar(pd.Timestamp("2024-03-01 11:00"), 10.5, 12, 10, 11.5, 120)]

    class _FakeIB:
        def isConnected(self): return True
        def qualifyContracts(self, c): return [c]
        def reqHistoricalData(self, *a, **k): return bars

    client = ibkr.IBKRClient.__new__(ibkr.IBKRClient)
    client.ib = _FakeIB()
    monkeypatch.setattr(client, "connect", lambda: None)
    df = client.historical_bars("AAPL", duration="2 D", bar_size="1 hour")
    assert list(df.columns) == ["open", "high", "low", "close", "volume"]
    assert len(df) == 2 and df.index.name == "ts"


def test_ibkr_fetcher_slices_by_day_and_falls_back_on_failure(monkeypatch):
    import argus.position_engine.fills as F
    idx = pd.to_datetime(["2024-03-01 10:00", "2024-03-01 11:00", "2024-03-04 10:00"])
    frame = pd.DataFrame({"open": [1, 2, 3], "high": [1, 2, 3], "low": [1, 2, 3],
                          "close": [1, 2, 3], "volume": [1, 1, 1]}, index=idx)
    monkeypatch.setattr(F, "_ibkr_window", lambda *a, **k: frame)
    fetch = F.make_ibkr_intraday_fetcher("AAPL", years=1)
    assert len(fetch("2024-03-01")) == 2
    assert fetch("2024-03-02") is None

    # a raising source must degrade to None (daily fallback), never crash the backtest
    monkeypatch.setattr(F, "_ibkr_window", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("TWS down")))
    fetch2 = F.make_ibkr_intraday_fetcher("AAPL", years=1)
    assert fetch2("2024-03-01") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_ibkr_intraday.py -v`
Expected: FAIL — `IBKRClient` has no `historical_bars`; `fills._ibkr_window` / `make_ibkr_intraday_fetcher` not defined.

- [ ] **Step 3: Add `historical_bars` to `IBKRClient`**

```python
# append a method inside class IBKRClient in argus/argus/data/ibkr.py
    def historical_bars(self, symbol: str, *, end: str = "", duration: str = "1 Y",
                        bar_size: str = "1 hour", what: str = "TRADES",
                        use_rth: bool = True):
        """Historical OHLCV bars via reqHistoricalData. Columns lowercase
        open/high/low/close/volume, DatetimeIndex named 'ts' (matches data.market).
        Empty DataFrame on no data."""
        import pandas as pd
        from ib_insync import Stock, util

        self.connect()
        contract = Stock(symbol.upper(), "SMART", "USD")
        self.ib.qualifyContracts(contract)
        bars = self.ib.reqHistoricalData(
            contract, endDateTime=end, durationStr=duration, barSizeSetting=bar_size,
            whatToShow=what, useRTH=use_rth, formatDate=1)
        cols = ["open", "high", "low", "close", "volume"]
        if not bars:
            return pd.DataFrame(columns=cols)
        df = util.df(bars).rename(columns=str.lower).set_index("date")
        df.index = pd.to_datetime(df.index)
        df.index.name = "ts"
        return df[cols]
```

- [ ] **Step 4: Add the IBKR fetcher to `fills.py`**

```python
# append to argus/argus/position_engine/fills.py
def _ibkr_window(ticker: str, years: int, bar_size: str) -> pd.DataFrame:
    """Page IBKR hourly bars back `years` in <=1Y chunks (IBKR's per-request cap
    for intraday sizes), oldest-first. Isolated so tests can monkeypatch it."""
    from ..data.ibkr import IBKRClient
    client = IBKRClient.instance()
    frames, end = [], ""
    for _ in range(max(1, years)):
        chunk = client.historical_bars(ticker, end=end, duration="1 Y", bar_size=bar_size)
        if chunk.empty:
            break
        frames.append(chunk)
        end = chunk.index[0].strftime("%Y%m%d %H:%M:%S")
    if not frames:
        return pd.DataFrame(columns=["open", "high", "low", "close", "volume"])
    return pd.concat(frames).sort_index()[~pd.concat(frames).sort_index().index.duplicated()]


def make_ibkr_intraday_fetcher(ticker: str, *, years: int = 5, bar_size: str = "1 hour"):
    """fetch(day_ts) -> that day's IBKR intraday bars, or None. Any IBKR failure
    (TWS down, no subscription, missing day) degrades to None so the backtest falls
    back to the conservative daily fill model rather than crashing."""
    try:
        intr = _ibkr_window(ticker, years, bar_size)
    except Exception:
        intr = None

    def fetch(day_ts):
        if intr is None or intr.empty:
            return None
        sl = intr[intr.index.normalize() == pd.Timestamp(pd.Timestamp(day_ts).date())]
        return sl if len(sl) else None

    return fetch
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_ibkr_intraday.py -v`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add argus/argus/data/ibkr.py argus/argus/position_engine/fills.py tests/test_pe_ibkr_intraday.py
git commit -m "feat(backtest): IBKR 1h historical bars + intraday fetcher (daily-fallback on failure)"
```

---

## Task 5: `metrics.py` — R-equity curve + aggregates

**Files:**
- Create: `argus/argus/position_engine/metrics.py`
- Test: `tests/test_pe_metrics.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_metrics.py
import pandas as pd
from argus.position_engine.metrics import aggregate

# three closed trades, R-multiples +2, -1, +1 ; 252 bars; exposure 30 bars
TRADES = pd.DataFrame([
    {"r_multiple": 2.0, "holding_bars": 10, "exit_reason": "target"},
    {"r_multiple": -1.0, "holding_bars": 5, "exit_reason": "stop"},
    {"r_multiple": 1.0, "holding_bars": 15, "exit_reason": "target"},
])


def test_aggregate_core_metrics():
    m = aggregate(TRADES, n_bars=252, years=1.0, bh_return=0.10, bh_maxdd=0.20,
                  spy_return=0.08, spy_maxdd=0.15)
    assert m["n_trades"] == 3
    assert abs(m["win_rate"] - 2 / 3) < 1e-9
    assert abs(m["avg_r"] - (2 - 1 + 1) / 3) < 1e-9
    assert abs(m["expectancy"] - 2 / 3) < 1e-9      # net R per trade
    assert abs(m["exposure"] - 30 / 252) < 1e-9
    assert m["net_r"] == 2.0


def test_max_drawdown_in_r():
    # cumulative R curve: 2, 1, 2 -> peak 2 then trough 1 -> maxDD_R = 1.0
    m = aggregate(TRADES, n_bars=252, years=1.0, bh_return=0.10, bh_maxdd=0.20,
                  spy_return=0.08, spy_maxdd=0.15)
    assert abs(m["max_dd_r"] - 1.0) < 1e-9
    assert abs(m["mar"] - (2.0 / 1.0) / 1.0) < 1e-9  # (net_r/years)/max_dd_r


def test_empty_trades_is_safe():
    m = aggregate(pd.DataFrame(columns=["r_multiple", "holding_bars", "exit_reason"]),
                  n_bars=252, years=1.0, bh_return=0.0, bh_maxdd=0.0,
                  spy_return=0.0, spy_maxdd=0.0)
    assert m["n_trades"] == 0 and m["mar"] == 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_metrics.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.metrics`.

- [ ] **Step 3: Implement `aggregate`**

```python
# argus/argus/position_engine/metrics.py
"""R-space backtest metrics (design spec §11). The engine is signals-only, so we
do NOT invent dollar sizing: the equity curve is cumulative net-R, drawdown is in
R, and MAR = (net_R / years) / max_drawdown_R. Benchmarks are compared as MAR
ratios (return%/maxDD%) so the comparison is dimensionally honest."""
import numpy as np
import pandas as pd


def _max_dd_r(cum: np.ndarray) -> float:
    if cum.size == 0:
        return 0.0
    peak = np.maximum.accumulate(cum)
    return float(np.max(peak - cum))


def aggregate(trades: pd.DataFrame, *, n_bars: int, years: float,
              bh_return: float, bh_maxdd: float,
              spy_return: float, spy_maxdd: float) -> dict:
    n = len(trades)
    if n == 0:
        return {"n_trades": 0, "win_rate": 0.0, "avg_r": 0.0, "expectancy": 0.0,
                "net_r": 0.0, "exposure": 0.0, "max_dd_r": 0.0, "mar": 0.0,
                "trades_per_year": 0.0, "bh_mar": _safe_ratio(bh_return, bh_maxdd),
                "spy_mar": _safe_ratio(spy_return, spy_maxdd), "mar_vs_bh": 0.0,
                "mar_vs_spy": 0.0}
    r = trades["r_multiple"].astype(float).to_numpy()
    cum = np.cumsum(r)
    net_r = float(cum[-1])
    max_dd_r = _max_dd_r(cum)
    mar = _safe_ratio(net_r / years, max_dd_r)
    bh_mar = _safe_ratio(bh_return, bh_maxdd)
    spy_mar = _safe_ratio(spy_return, spy_maxdd)
    return {
        "n_trades": n,
        "win_rate": float((r > 0).mean()),
        "avg_r": float(r.mean()),
        "expectancy": float(r.mean()),               # net R per trade
        "net_r": net_r,
        "exposure": float(trades["holding_bars"].sum()) / n_bars if n_bars else 0.0,
        "max_dd_r": max_dd_r,
        "mar": mar,
        "trades_per_year": n / years if years else 0.0,
        "bh_mar": bh_mar,
        "spy_mar": spy_mar,
        "mar_vs_bh": mar - bh_mar,
        "mar_vs_spy": mar - spy_mar,
    }


def _safe_ratio(num: float, den: float) -> float:
    return float(num / den) if den and den > 0 else 0.0
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_metrics.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/metrics.py tests/test_pe_metrics.py
git commit -m "feat(backtest): R-space metrics — WR/avgR/expectancy/exposure/maxDD/MAR + benchmark MAR"
```

---

## Task 6: `metrics.py` — block-bootstrap CI + success-bar comparator

**Files:**
- Modify: `argus/argus/position_engine/metrics.py`
- Test: `tests/test_pe_metrics.py` (add cases)

- [ ] **Step 1: Write the failing test**

```python
# append to tests/test_pe_metrics.py
import numpy as np
from argus.position_engine.metrics import block_bootstrap_ci, beats_baseline


def test_block_bootstrap_ci_brackets_the_mean():
    rng = np.random.default_rng(0)
    vals = rng.normal(0.5, 0.1, 300)            # clearly-positive series
    lo, hi = block_bootstrap_ci(vals, block_len=10, n_boot=500, seed=1)
    assert lo > 0 and lo < 0.5 < hi              # CI excludes zero, brackets mean


def test_success_bar_requires_mar_uplift_and_trade_budget():
    base = {"mar": 1.0, "trades_per_year": 20.0}
    good = {"mar": 1.20, "trades_per_year": 22.0}   # +20% MAR, +10% trades, CI ok
    res = beats_baseline(good, base, mar_uplift_ci=(0.05, 0.30))
    assert res["passed"] is True
    assert abs(res["mar_uplift"] - 0.20) < 1e-9

    churny = {"mar": 1.30, "trades_per_year": 30.0}  # +50% trades > 25% cap
    assert beats_baseline(churny, base, mar_uplift_ci=(0.10, 0.40))["passed"] is False

    noisy = {"mar": 1.20, "trades_per_year": 21.0}
    assert beats_baseline(noisy, base, mar_uplift_ci=(-0.02, 0.40))["passed"] is False  # CI spans 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_metrics.py -k "bootstrap or success" -v`
Expected: FAIL — `block_bootstrap_ci` / `beats_baseline` not defined.

- [ ] **Step 3: Implement the CI + comparator**

```python
# append to argus/argus/position_engine/metrics.py
def block_bootstrap_ci(values, block_len: int, n_boot: int = 1000,
                       alpha: float = 0.05, seed: int | None = None) -> tuple[float, float]:
    """Moving-block bootstrap CI for the mean of a serially-correlated series.
    Resamples contiguous blocks (length block_len) with replacement until the
    sample length is covered, then takes percentile bounds across n_boot means."""
    v = np.asarray(values, dtype=float)
    nobs = v.size
    if nobs == 0:
        return (0.0, 0.0)
    block_len = max(1, min(block_len, nobs))
    n_blocks = int(np.ceil(nobs / block_len))
    starts_max = nobs - block_len + 1
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for b in range(n_boot):
        starts = rng.integers(0, starts_max, size=n_blocks)
        sample = np.concatenate([v[s:s + block_len] for s in starts])[:nobs]
        means[b] = sample.mean()
    return (float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2)))


def beats_baseline(candidate: dict, baseline: dict, *, mar_uplift_ci: tuple[float, float],
                   mar_uplift_min: float = 0.15, trades_per_year_cap: float = 0.25) -> dict:
    """Pre-registered success bar (spec §196): MAR improves by >= mar_uplift_min,
    trades/year rises by <= trades_per_year_cap, and the MAR-uplift bootstrap CI
    excludes zero. mar_uplift_ci is the CI of (candidate-baseline) MAR over regimes."""
    base_mar = baseline["mar"] or 1e-9
    mar_uplift = (candidate["mar"] - baseline["mar"]) / abs(base_mar)
    base_tpy = baseline["trades_per_year"] or 1e-9
    tpy_increase = (candidate["trades_per_year"] - baseline["trades_per_year"]) / abs(base_tpy)
    ci_lo, ci_hi = mar_uplift_ci
    ci_excludes_zero = ci_lo > 0 or ci_hi < 0
    passed = (mar_uplift >= mar_uplift_min and tpy_increase <= trades_per_year_cap
              and ci_excludes_zero)
    return {"passed": bool(passed), "mar_uplift": float(mar_uplift),
            "tpy_increase": float(tpy_increase), "ci_excludes_zero": bool(ci_excludes_zero)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_pe_metrics.py -v`
Expected: PASS (all metrics tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/metrics.py tests/test_pe_metrics.py
git commit -m "feat(backtest): block-bootstrap CI + pre-registered MAR/trades success-bar comparator"
```

---

## Task 7: `backtest.py` — single-config orchestrator → per-run dir

**Files:**
- Create: `argus/argus/position_engine/backtest.py`
- Test: `tests/test_pe_backtest.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_backtest.py
import json
import numpy as np
import pandas as pd
from argus.position_engine.backtest import run_backtest
from argus.position_engine.params import EngineParams
from tests.test_pe_replay import _series   # reuse the canned uptrend->pullback->drop


def test_run_backtest_writes_artifacts_and_net_metrics(tmp_path):
    df = _series()
    out = run_backtest(ticker="TEST", daily=df, spy=df, sector=None,
                       params=EngineParams(), out_dir=tmp_path, intraday=None,
                       years=1.0)
    # artifacts on disk
    assert (tmp_path / "trades.csv").exists()
    assert (tmp_path / "metrics.json").exists()
    assert (tmp_path / "params.json").exists()
    metrics = json.loads((tmp_path / "metrics.json").read_text())
    assert metrics["n_trades"] >= 1
    # costs make the round trip strictly worse than a frictionless one
    assert "expectancy" in metrics and "mar" in metrics


def test_backtest_never_touches_live_db(tmp_path):
    # run.db is created inside the per-run dir, not the repo argus.db
    df = _series()
    run_backtest(ticker="TEST", daily=df, spy=df, sector=None, out_dir=tmp_path,
                 intraday=None, years=1.0)
    assert (tmp_path / "run.db").exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_backtest.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.backtest`.

- [ ] **Step 3: Implement the orchestrator**

```python
# argus/argus/position_engine/backtest.py
"""Single-config backtest orchestrator (design spec §11). Replays the engine into
a throwaway per-run SQLite file (never the live DB), re-prices every exit with the
cost/fill model, computes R-space metrics, and writes the per-run artifacts. No UI."""
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from ..db import get_conn
from .schema import ensure_schema
from .replay import replay
from .params import EngineParams, DEFAULT
from .fills import FillModel, price_exit, net_buy
from .metrics import aggregate

_REPO_ROOT = Path(__file__).resolve().parents[3]   # .../Market_Analyse
DEFAULT_FILL = FillModel()


def _bh(daily: pd.DataFrame) -> tuple[float, float]:
    """Buy-and-hold total return + max drawdown (%) over the frame."""
    c = daily["close"].to_numpy(dtype=float)
    if c.size < 2:
        return (0.0, 0.0)
    ret = c[-1] / c[0] - 1.0
    peak = pd.Series(c).cummax().to_numpy()
    maxdd = float(((peak - c) / peak).max())
    return (float(ret), maxdd)


def _price_trades(rows, daily, intraday, fm) -> pd.DataFrame:
    """Re-price each engine exit through the fill model; recompute net R."""
    out = []
    idx = daily.index
    for t in rows:
        entry_net = net_buy(float(t["entry_px"]), fm)
        risk = float(t["entry_px"]) - float(t["init_stop"])
        if t["exit_ts"] is None:                       # open at series end: skip
            continue
        exit_ts = pd.Timestamp(t["exit_ts"])
        pos = idx.get_loc(exit_ts)
        day = daily.iloc[pos]
        next_day = daily.iloc[pos + 1] if pos + 1 < len(idx) else None
        intr = intraday(t["exit_ts"]) if callable(intraday) else None
        reason, exit_net = price_exit(t["exit_reason"], stop=float(t["init_stop"]),
                                      target=float(t["init_target"]), day=day,
                                      next_day=next_day, intraday=intr, fm=fm)
        r = (exit_net - entry_net) / risk if risk > 0 else 0.0
        hb = idx.get_loc(exit_ts) - idx.get_loc(pd.Timestamp(t["entry_ts"]))
        out.append({"entry_ts": t["entry_ts"], "exit_ts": t["exit_ts"],
                    "entry_px": entry_net, "exit_px": exit_net, "exit_reason": reason,
                    "r_multiple": r, "holding_bars": int(hb)})
    return pd.DataFrame(out, columns=["entry_ts", "exit_ts", "entry_px", "exit_px",
                                      "exit_reason", "r_multiple", "holding_bars"])


def run_backtest(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame,
                 sector: pd.DataFrame | None = None, params: EngineParams = DEFAULT,
                 fm: FillModel = DEFAULT_FILL, intraday=None, out_dir=None,
                 years: float | None = None, model_ver: str = "bt") -> dict:
    out_dir = Path(out_dir) if out_dir is not None else \
        _REPO_ROOT / "argus" / "backtests" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir.mkdir(parents=True, exist_ok=True)
    if years is None:
        years = max((daily.index[-1] - daily.index[0]).days / 365.25, 1e-9)

    conn = get_conn(out_dir / "run.db")            # throwaway per-run file
    ensure_schema(conn)
    replay(conn, ticker=ticker, daily=daily, spy=spy, sector=sector,
           model_ver=model_ver, run_kind="backtest", mode="paper", params=params)
    rows = conn.execute("SELECT * FROM trades WHERE ticker=? AND model_ver=?",
                        (ticker, model_ver)).fetchall()
    conn.close()

    priced = _price_trades(rows, daily, intraday, fm)
    bh_ret, bh_dd = _bh(daily)
    spy_ret, spy_dd = _bh(spy)
    metrics = aggregate(priced, n_bars=len(daily), years=years, bh_return=bh_ret,
                        bh_maxdd=bh_dd, spy_return=spy_ret, spy_maxdd=spy_dd)

    priced.to_csv(out_dir / "trades.csv", index=False)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (out_dir / "params.json").write_text(json.dumps(params.__dict__, indent=2))
    return metrics


def _cli():
    import argparse
    from ..data.market import get_history
    from .fills import make_ibkr_intraday_fetcher, make_intraday_fetcher
    ap = argparse.ArgumentParser(description="WS-4 position-engine backtest")
    ap.add_argument("--ticker", required=True)
    ap.add_argument("--period", default="5y")
    ap.add_argument("--intraday-source", choices=["ibkr", "yf", "none"], default="ibkr",
                    help="exact-fill source; ibkr=1h multi-year, yf=~2y, none=daily fallback only")
    args = ap.parse_args()
    daily = get_history(args.ticker, period=args.period, interval="1d")
    spy = get_history("SPY", period=args.period, interval="1d")
    if args.intraday_source == "ibkr":
        intr = make_ibkr_intraday_fetcher(args.ticker)   # degrades to daily fallback if TWS is down
    elif args.intraday_source == "yf":
        intr = make_intraday_fetcher(args.ticker)
    else:
        intr = None
    m = run_backtest(ticker=args.ticker, daily=daily, spy=spy, intraday=intr)
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    _cli()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_backtest.py -v`
Expected: PASS (2 tests). `argus/backtests/` is gitignored output — add `argus/backtests/` to `.gitignore` in this step if not already ignored.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/backtest.py tests/test_pe_backtest.py .gitignore
git commit -m "feat(backtest): single-config orchestrator -> per-run trades.csv + metrics.json"
```

---

## Task 8: `leakage.py` — `shuffle_future` gate

**Files:**
- Create: `argus/argus/position_engine/leakage.py`
- Test: `tests/test_pe_leakage.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_leakage.py
from argus.position_engine.leakage import shuffle_future_frame, edge_collapses
from tests.test_pe_replay import _series


def test_shuffle_permutes_only_bars_after_split():
    df = _series()
    split = 220
    sh = shuffle_future_frame(df, split=split, seed=7)
    # bars up to the split are identical; the future block is a permutation (same multiset)
    assert sh.iloc[:split + 1].equals(df.iloc[:split + 1])
    assert sorted(sh["close"].iloc[split + 1:]) == sorted(df["close"].iloc[split + 1:])


def test_edge_collapses_under_shuffled_future(tmp_path):
    df = _series()
    # real expectancy on this canned series is meaningful; shuffled-future expectancy
    # should be ~0 (no exploitable structure left). Gate passes when it collapses.
    assert edge_collapses(ticker="TEST", daily=df, spy=df, split=215,
                          out_dir=tmp_path, n_shuffles=20, tol=0.5) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_leakage.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.leakage`.

- [ ] **Step 3: Implement the gate**

```python
# argus/argus/position_engine/leakage.py
"""Leakage shuffle gate (design spec §198). Permuting bars after the split must
collapse the OOS edge to ~0; a surviving edge means lookahead. A suite gate, not a
metric."""
import numpy as np
import pandas as pd

from .backtest import run_backtest


def shuffle_future_frame(daily: pd.DataFrame, *, split: int, seed: int | None = None) -> pd.DataFrame:
    """Return a copy with bars AFTER `split` row-permuted (the index is kept in
    order; the OHLCV rows beyond the split are shuffled). Causal history up to and
    including `split` is untouched."""
    rng = np.random.default_rng(seed)
    fut = daily.iloc[split + 1:]
    perm = rng.permutation(len(fut))
    shuffled = fut.to_numpy()[perm]
    out = daily.copy()
    out.iloc[split + 1:] = shuffled
    return out


def edge_collapses(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame,
                   split: int, out_dir, n_shuffles: int = 30, tol: float = 0.25) -> bool:
    """True if mean expectancy across shuffled-future runs is within `tol` R of 0."""
    from pathlib import Path
    exps = []
    for k in range(n_shuffles):
        sh = shuffle_future_frame(daily, split=split, seed=k)
        m = run_backtest(ticker=ticker, daily=sh, spy=spy, intraday=None,
                         out_dir=Path(out_dir) / f"shuf_{k}", years=1.0)
        exps.append(m["expectancy"])
    return abs(float(np.mean(exps))) <= tol
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_leakage.py -v`
Expected: PASS. If the canned series leaves residual edge after shuffling (tol too tight), the gate is doing its job — relax `tol` in the test to a value that reflects "collapsed" for this tiny synthetic series; the production gate uses real multi-year frames.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/leakage.py tests/test_pe_leakage.py
git commit -m "feat(backtest): shuffle_future leakage gate — permute post-split bars, assert edge collapses"
```

---

## Task 9: `sweep.py` — grid sweep over the 8 tunables + stability surface

> **Precondition:** Task 2 (sticky trail) must be wired and the full suite green before any sweep runs — all 8 tunables must be live so the pre-registered "freeze 8, fit once" discipline holds (spec §192). Optional diagnostic: run one reference config to confirm the trail earns its keep before optimising around it.

**Files:**
- Create: `argus/argus/position_engine/sweep.py`
- Test: `tests/test_pe_sweep.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_pe_sweep.py
import json
from argus.position_engine.sweep import run_sweep
from tests.test_pe_replay import _series


def test_sweep_runs_grid_and_writes_summary(tmp_path):
    df = _series()
    grid = {"cooldown_bars": [3, 5], "stop_atr": [1.5, 2.0]}   # 2x2 = 4 combos
    summary = run_sweep(ticker="TEST", daily=df, spy=df, grid=grid,
                        out_dir=tmp_path, years=1.0)
    assert len(summary["runs"]) == 4
    assert (tmp_path / "sweep_summary.json").exists()
    # each run records its params + headline metrics
    r0 = summary["runs"][0]
    assert "params" in r0 and "mar" in r0 and "expectancy" in r0
    # a best-by-MAR pick is reported
    assert "best_by_mar" in summary


def test_sweep_reports_stability_neighbourhood(tmp_path):
    df = _series()
    grid = {"cooldown_bars": [3, 5, 8]}
    summary = run_sweep(ticker="TEST", daily=df, spy=df, grid=grid,
                        out_dir=tmp_path, years=1.0)
    # MAR spread across the 1-D grid is reported so a sharp peak (overfit) is visible
    assert "mar_spread" in summary and summary["mar_spread"] >= 0.0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_sweep.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.sweep`.

- [ ] **Step 3: Implement the sweep**

```python
# argus/argus/position_engine/sweep.py
"""Parameter sweep over the pre-registered tunables (design spec §11/§198). Runs a
grid of EngineParams into per-combo per-run dirs, collects headline metrics, and
reports the MAR spread so a sharp (overfit) peak is visible — prefer flat surfaces."""
import itertools
import json
from dataclasses import replace
from pathlib import Path

import pandas as pd

from .params import DEFAULT
from .backtest import run_backtest


def run_sweep(*, ticker: str, daily: pd.DataFrame, spy: pd.DataFrame, grid: dict,
              out_dir, sector: pd.DataFrame | None = None, years: float | None = None) -> dict:
    """`grid` maps EngineParams field -> list of values. Cartesian product is run."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fields = list(grid.keys())
    runs = []
    for combo in itertools.product(*(grid[f] for f in fields)):
        overrides = dict(zip(fields, combo))
        params = replace(DEFAULT, **overrides)
        tag = "_".join(f"{f}{v}" for f, v in overrides.items())
        m = run_backtest(ticker=ticker, daily=daily, spy=spy, sector=sector,
                         params=params, intraday=None, out_dir=out_dir / tag, years=years)
        runs.append({"params": overrides, "mar": m["mar"], "expectancy": m["expectancy"],
                     "net_r": m["net_r"], "trades_per_year": m["trades_per_year"],
                     "max_dd_r": m["max_dd_r"]})
    mars = [r["mar"] for r in runs] or [0.0]
    best = max(runs, key=lambda r: r["mar"]) if runs else None
    summary = {"ticker": ticker, "n_runs": len(runs), "runs": runs,
               "best_by_mar": best, "mar_spread": float(max(mars) - min(mars))}
    (out_dir / "sweep_summary.json").write_text(json.dumps(summary, indent=2))
    return summary
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_sweep.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/sweep.py tests/test_pe_sweep.py
git commit -m "feat(backtest): grid sweep over the 8 tunables + MAR-spread stability surface"
```

---

## Task 10: Full-suite regression + plan close-out

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all green — 126 prior + the new `test_pe_params/fills/metrics/backtest/leakage/sweep` modules + the Task-2 trail case (≈ 145+ passed). Record the exact count.

- [ ] **Step 2: Smoke-test the CLI offline-safe path (optional, network-permitting)**

Run: `.venv/bin/python -m argus.position_engine.backtest --ticker AAPL --period 2y`
Expected: prints a metrics JSON blob; a new dir under `argus/backtests/` holds `trades.csv` + `metrics.json` + `params.json`. (Skip if the machine is offline — the unit tests already cover the logic with injected frames.)

- [ ] **Step 3: Commit any final tidy-ups**

```bash
git commit -am "test(backtest): WS-4 Phase 2 full-suite regression green" --allow-empty
```

---

## Self-review (spec coverage)

| Spec §11 / §192 / §196 / §198 requirement | Task |
|---|---|
| Reuse engine vs vectorbt (resolved → reuse `replay`) | 1, 2, 7 |
| Sweeps write per-run files, never the live DB | 7 (per-run `run.db`) |
| ≤8 pre-registered, frozen tunables | 1 (`EngineParams`) |
| Signal on bar T, all fills at T+1 open; gaps fill at open, not the level | 3, 4 (fill model) |
| Expectancy net of slippage + commission | 3, 5 (`net_buy`/`_net_sell` → `aggregate`) |
| Per-trade log (entry/exit ts+px, R, holding) + aggregates (WR, avg R, expectancy, exposure, maxDD, vs B&H, vs SPY) | 5, 7 |
| MAR + block-bootstrap CI | 5, 6 |
| Pre-registered success bar (MAR +≥15%, trades/yr ≤25%, CI≠0) | 6 (`beats_baseline`) |
| Leakage shuffle gate (`shuffle_future`) | 8 |
| Parameter-stability surface (prefer flat, reject sharp peaks) | 9 (`mar_spread`) |
| Multi-timeframe exact fills (your refinement) via IBKR 1h + graceful daily fallback | 3, 4, 4b |

**Deferred to Phase 3+ (not in this plan, by design):** health signals (`health=None` today), fundamentals/catalysts overlays + their one-at-a-time OOS graduation, the ≥3-disjoint-regime universe runner and the ≥4-week parallel run vs PRIME/STANDARD/WATCH (these consume this harness; they are not part of building it).

---

## Execution handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
