# WS-4 Exit Premise-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the go/no-go experiment that tests whether any pre-registered early-exit overlay beats hold-to-structural-stop on the joint MAR-AND-expectancy gate, OOS, over the existing S&P 500 corpus.

**Architecture:** Two new pure-ish units under `argus/argus/position_engine/`. `exits.py` holds five candidate exit rules + a `health_exit` control as pure path-functionals plus T+1 re-pricing. `premise.py` extracts baseline trades (via `replay`) into enriched held paths, computes an oracle ceiling, applies each rule, and runs a paired name-cluster aggregate-level bootstrap → conjunction p-value `max(p_mar,p_exp)` → Holm over the candidate rules → `premise_check_report.json`. Network/DB are injected so tests run offline.

**Tech Stack:** Python 3.11 (pandas, numpy, scipy via existing helpers), sqlite via `get_conn`, pytest. Reuses `metrics.aggregate`, `evalstats.holm`, `replay`, `corpus`, `indicators.compute._atr`.

## Global Constants (from the spec)

- **venv + cwd:** run from `argus/` with `.venv/bin/python`. Package `argus/argus/`, tests `argus/tests/`. `git add` paths repo-root-relative (`argus/...`).
- **No new dependencies.** Reuse `metrics.aggregate` (NOT `metrics.beats_baseline` — its 15%-uplift + trades/year cap is incompatible with early-exit-only overlays). Holm = `evalstats.holm`.
- **Rule family (5 candidates, fixed params):** `giveback_trail` (activate 1.5R, keep 0.60·peak), `chandelier_high` (HH − 3.0·ATR14), `donchian_break` (close < prior-20-bar low), `no_progress` (8 bars without a new high), `profit_target_3r` (close ≥ entry + 3.0R). Plus `health_exit` control (any 3a flag) — REPORTED, excluded from Holm.
- **Fill:** rule triggers on a completed bar at offset `t`; exit fills at `path.open[t+1]` (T+1); realized R = `(fill − entry_px)/r`. A rule that never triggers (or triggers on the last held bar) yields the trade's baseline `r_multiple`. Uniform for all rules incl. `profit_target_3r`.
- **Indicators:** ATR14 and the 20-bar Donchian low are computed on the FULL daily series and sliced to the held window (never recomputed on the truncated window).
- **Inference:** pooled OOS years 2021–2024; paired name-cluster bootstrap (`n_boot=2000`); `p_rule = max(p_mar, p_exp)`; min 30 active OOS trades else `ABSTAIN_LOW_N`; Holm over candidate rules only; GO iff ≥1 candidate wins. Per-year deltas are a non-gating `regime_robust` annotation (≥3/4 positive on both). Report carries `preregistration_sha`.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

### File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/exits.py` | **New.** 5 candidate rules + `health_exit` control (pure path functionals) + `realized_r` + `RULES`/`CONTROL` dicts. |
| `argus/argus/position_engine/premise.py` | **New.** `_enrich`, `extract_trades`, `_metrics`, `oracle_ceiling`, `bootstrap_rule`, `apply_rules`, `rule_correlation`, `evaluate`, `run_premise`. |
| `argus/tests/test_pe_exits.py`, `test_pe_premise.py` | **New.** One per unit. |

---

## Task 1: `exits.py` — rule family + re-pricing

**Files:**
- Create: `argus/argus/position_engine/exits.py`
- Test: `argus/tests/test_pe_exits.py`

**Interfaces:**
- Produces:
  - `giveback_trail(path, entry_px, r) -> int | None`, `chandelier_high(...)`, `donchian_break(...)`, `no_progress(...)`, `profit_target_3r(...)`, `health_exit(...)` — each returns the 0-based offset (into `path`) of the trigger bar, or `None`. `path` is the held OHLC slice with extra columns `atr14`, `donch_low20`, `health_flags`.
  - `realized_r(path, entry_px, r, offset, baseline_r) -> float`.
  - `RULES: dict[str, callable]` (the 5 candidates), `CONTROL: dict[str, callable]` (`health_exit`).

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_exits.py
import numpy as np
import pandas as pd
from argus.position_engine.exits import (
    giveback_trail, chandelier_high, donchian_break, no_progress,
    profit_target_3r, health_exit, realized_r, RULES, CONTROL,
)


def _path(highs, lows, closes, opens=None, atr=1.0, donch=None, flags=None):
    n = len(closes)
    return pd.DataFrame({
        "open": opens if opens is not None else closes,
        "high": highs, "low": lows, "close": closes,
        "volume": np.full(n, 1e6),
        "atr14": np.full(n, atr) if np.isscalar(atr) else atr,
        "donch_low20": [np.nan] * n if donch is None else donch,
        "health_flags": [""] * n if flags is None else flags,
    }, index=pd.date_range("2022-01-03", periods=n, freq="B"))


def test_giveback_trail_fires_after_activation_then_giveback():
    # entry 100, r=10; peak hits +2R (high 120) then close falls to +1.0R (110) = 50% of peak < 60% -> exit
    highs = [101, 110, 120, 118, 110]
    out = giveback_trail(_path(highs, [99]*5, [100, 109, 119, 117, 110]), 100.0, 10.0)
    assert out == 4                       # peakR=2.0 at t2; closeR=1.0 <= 0.6*2.0 at t4


def test_giveback_trail_silent_before_activation():
    # never reaches +1.5R -> no exit
    out = giveback_trail(_path([101, 104, 103], [99]*3, [100, 103, 101]), 100.0, 10.0)
    assert out is None


def test_chandelier_high_fires_on_close_below_peak_minus_3atr():
    # HH=120 at t1; line=120-3*2=114; close 113 at t2 < 114 -> exit t2
    out = chandelier_high(_path([110, 120, 116], [99]*3, [109, 119, 113], atr=2.0), 100.0, 10.0)
    assert out == 2


def test_donchian_break_fires_on_close_below_prior_20_low():
    out = donchian_break(_path([110]*3, [100]*3, [109, 108, 95], donch=[np.nan, 100.0, 100.0]), 100.0, 10.0)
    assert out == 2                       # close 95 < donch 100 at t2


def test_no_progress_fires_after_8_bars_without_new_high():
    highs = [110] + [109] * 9            # new high only at t0
    out = no_progress(_path(highs, [100]*10, [105]*10), 100.0, 10.0)
    assert out == 8                       # t - last_new_high(0) >= 8 at t=8


def test_profit_target_3r_fires_on_3R_close():
    out = profit_target_3r(_path([131]*3, [99]*3, [120, 129, 131]), 100.0, 10.0)
    assert out == 2                       # close 131 >= 100 + 3*10


def test_health_exit_fires_on_first_flag():
    out = health_exit(_path([110]*4, [100]*4, [105]*4, flags=["", "", "H2", ""]), 100.0, 10.0)
    assert out == 2


def test_realized_r_fills_at_next_open_and_baseline_on_none():
    p = _path([110]*4, [100]*4, [105]*4, opens=[100, 102, 104, 106])
    assert realized_r(p, 100.0, 10.0, 1, baseline_r=0.5) == (104.0 - 100.0) / 10.0   # T+1 open
    assert realized_r(p, 100.0, 10.0, None, baseline_r=0.5) == 0.5                     # never fired
    assert realized_r(p, 100.0, 10.0, 3, baseline_r=0.5) == 0.5                        # last bar -> baseline


def test_rule_dicts_split_candidates_and_control():
    assert set(RULES) == {"giveback_trail", "chandelier_high", "donchian_break",
                          "no_progress", "profit_target_3r"}
    assert set(CONTROL) == {"health_exit"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_exits.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.exits`.

- [ ] **Step 3: Implement `exits.py`**

```python
# argus/argus/position_engine/exits.py
"""Early-exit overlays for the exit premise-check (design spec §Components). Each rule is a
pure path-functional: given the held OHLC slice (with precomputed `atr14`, `donch_low20`,
`health_flags` columns), entry price and risk r, it returns the 0-based offset of the bar
whose close triggers an exit, or None. `realized_r` re-prices at the T+1 open. Rules only
exit at or before the structural exit (the path ends at it), so an overlay can only differ
from hold by exiting EARLIER. PRE-REGISTERED fixed params — do not tune."""
import numpy as np
import pandas as pd


def giveback_trail(path, entry_px, r, *, activate=1.5, keep=0.60):
    high = path["high"].to_numpy(float)
    close = path["close"].to_numpy(float)
    peak = -np.inf
    for t in range(len(path)):
        peak = max(peak, (high[t] - entry_px) / r)
        if peak >= activate and (close[t] - entry_px) / r <= keep * peak:
            return t
    return None


def chandelier_high(path, entry_px, r, *, k=3.0):
    high = path["high"].to_numpy(float)
    close = path["close"].to_numpy(float)
    atr = path["atr14"].to_numpy(float)
    hh = -np.inf
    for t in range(len(path)):
        hh = max(hh, high[t])
        if np.isfinite(atr[t]) and close[t] < hh - k * atr[t]:
            return t
    return None


def donchian_break(path, entry_px, r, *, n=20):
    close = path["close"].to_numpy(float)
    dl = path["donch_low20"].to_numpy(float)
    for t in range(len(path)):
        if np.isfinite(dl[t]) and close[t] < dl[t]:
            return t
    return None


def no_progress(path, entry_px, r, *, m=8):
    high = path["high"].to_numpy(float)
    hh, last_new = high[0], 0
    for t in range(len(path)):
        if high[t] > hh:
            hh, last_new = high[t], t
        if t - last_new >= m:
            return t
    return None


def profit_target_3r(path, entry_px, r, *, mult=3.0):
    close = path["close"].to_numpy(float)
    for t in range(len(path)):
        if close[t] >= entry_px + mult * r:
            return t
    return None


def health_exit(path, entry_px, r):
    flags = path["health_flags"].tolist()
    for t in range(len(path)):
        if flags[t] and str(flags[t]).strip():
            return t
    return None


def realized_r(path, entry_px, r, offset, baseline_r) -> float:
    """R at a T+1-open fill; baseline_r if the rule never fired or fired on the last held bar."""
    if offset is None or offset + 1 >= len(path) or r <= 0:
        return float(baseline_r)
    fill = float(path["open"].iloc[offset + 1])
    return (fill - entry_px) / r


RULES = {"giveback_trail": giveback_trail, "chandelier_high": chandelier_high,
         "donchian_break": donchian_break, "no_progress": no_progress,
         "profit_target_3r": profit_target_3r}
CONTROL = {"health_exit": health_exit}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_exits.py -v`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/exits.py argus/tests/test_pe_exits.py
git commit -m "feat(premise): exit-overlay rule family + T+1 re-pricing (giveback/chandelier/donchian/no-progress/target + health control)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `premise.py` — enriched-path trade extraction

**Files:**
- Create: `argus/argus/position_engine/premise.py`
- Test: `argus/tests/test_pe_premise.py`

**Interfaces:**
- Consumes: `replay`, `ensure_schema`, `get_conn`, `indicators.compute._atr`.
- Produces:
  - `_enrich(daily) -> pd.DataFrame` — adds `atr14`, `donch_low20` (full-series).
  - `extract_trades(ticker, daily, spy, *, replay_fn=replay) -> list[dict]` — each dict: `ticker, entry_ts, entry_px, r, hold_r, mfe_r, path` where `path` is the enriched held slice with a `health_flags` column.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_premise.py
import numpy as np
import pandas as pd
from argus.position_engine.premise import _enrich, extract_trades


def _series():
    # inlined uptrend->pullback->continuation->drop with a LONG round-trip (from test_pe_replay)
    seg = list(np.linspace(50, 148, 217))
    closes = seg + [145.0, 142.5, 140.5, 139.5] + [142.0] + [142.5] + [144.0, 145.5, 147.0] \
        + list(np.linspace(146.0, 120, 18))
    c = np.array(closes, float)
    n = len(c)
    high = c + 1.0
    low = c - 1.0
    vol = np.full(n, 1e6)
    high[221] = c[221] + 0.8
    vol[221] = 1.7e6
    idx = pd.date_range("2024-01-01", periods=n, freq="D")
    return pd.DataFrame({"open": c, "high": high, "low": low, "close": c, "volume": vol}, index=idx)


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_enrich_adds_full_series_indicator_columns():
    d = _enrich(_series())
    assert {"atr14", "donch_low20"}.issubset(d.columns)
    assert d["atr14"].iloc[-1] > 0
    assert np.isnan(d["donch_low20"].iloc[0])         # shifted -> first is NaN


def test_extract_trades_returns_enriched_paths():
    df = _series()
    spy = _spy(len(df), df.index)
    trades = extract_trades("TEST", df, spy)
    assert len(trades) >= 1
    t = trades[0]
    assert {"ticker", "entry_ts", "entry_px", "r", "hold_r", "mfe_r", "path"} <= set(t)
    assert t["r"] > 0
    assert {"atr14", "donch_low20", "health_flags"}.issubset(t["path"].columns)
    assert len(t["path"]) >= 2                          # at least entry..exit
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.premise`.

- [ ] **Step 3: Implement `_enrich` + `extract_trades`**

```python
# argus/argus/position_engine/premise.py
"""Exit premise-check (design spec 2026-06-29). Extracts baseline trades into enriched held
paths, sizes the oracle ceiling, applies the exit-overlay family, and runs a paired
name-cluster aggregate-level bootstrap -> conjunction p (max(p_mar,p_exp)) -> Holm over the
candidate rules -> premise_check_report.json. Reuses metrics.aggregate (NOT beats_baseline).

INFERENCE (pre-registered): pooled OOS 2021-2024; name-cluster paired bootstrap n_boot=2000;
p_rule=max(p_mar,p_exp); >=30 active trades else ABSTAIN; Holm over candidate rules only;
GO iff >=1 candidate wins; per-year deltas are a non-gating regime annotation."""
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

from ..db import get_conn
from ..indicators.compute import _atr
from .schema import ensure_schema
from .replay import replay
from .metrics import aggregate
from .evalstats import holm
from .exits import RULES, CONTROL, realized_r

CANDIDATES = list(RULES)
OOS_YEARS = (2021, 2022, 2023, 2024)
MIN_TRADES = 30
N_BOOT = 2000


def _enrich(daily: pd.DataFrame) -> pd.DataFrame:
    d = daily.copy()
    d["atr14"] = _atr(d["high"], d["low"], d["close"], 14)
    d["donch_low20"] = d["low"].rolling(20).min().shift(1)
    return d


def extract_trades(ticker, daily, spy, *, replay_fn=replay) -> list:
    d = _enrich(daily)
    idx = d.index
    fd, tmp = tempfile.mkstemp(suffix=".db"); os.close(fd)
    conn = get_conn(tmp)
    try:
        ensure_schema(conn)
        replay_fn(conn, ticker=ticker, daily=daily, spy=spy, sector=None,
                  model_ver="bt", run_kind="backtest", mode="paper")
        trows = conn.execute(
            "SELECT entry_ts, entry_px, init_stop, exit_ts, r_multiple, mfe_r FROM trades "
            "WHERE ticker=? AND exit_ts IS NOT NULL ORDER BY entry_ts", (ticker,)).fetchall()
        flags = {r["ts"]: (r["health_flags"] or "") for r in conn.execute(
            "SELECT ts, health_flags FROM position_signals WHERE ticker=? AND overlay='LONG'",
            (ticker,))}
    finally:
        conn.close(); os.unlink(tmp)

    out = []
    for t in trows:
        e, x = pd.Timestamp(t["entry_ts"]), pd.Timestamp(t["exit_ts"])
        if e not in idx or x not in idx:
            continue
        ep, xp = idx.get_loc(e), idx.get_loc(x)
        r = float(t["entry_px"]) - float(t["init_stop"])
        if r <= 0:
            continue
        path = d.iloc[ep:xp + 1].copy()
        path["health_flags"] = [flags.get(str(ts.date()), "") for ts in path.index]
        out.append({"ticker": ticker, "entry_ts": e, "entry_px": float(t["entry_px"]),
                    "r": r, "hold_r": float(t["r_multiple"]),
                    "mfe_r": float(t["mfe_r"]) if t["mfe_r"] is not None else float(t["r_multiple"]),
                    "path": path})
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/premise.py argus/tests/test_pe_premise.py
git commit -m "feat(premise): enriched-path baseline-trade extraction (replay -> held OHLC + atr/donchian/flags)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `_metrics` + oracle ceiling

**Files:**
- Modify: `argus/argus/position_engine/premise.py`
- Test: `argus/tests/test_pe_premise.py`

**Interfaces:**
- Produces:
  - `_metrics(r_values, years) -> tuple[float, float]` — `(mar, expectancy)` via `aggregate`, on the already-entry-date-ordered R list.
  - `oracle_ceiling(trades, years) -> dict` — `hold_mar/hold_exp/oracle_mar/oracle_exp/uplift_mar/uplift_exp`.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_premise.py
from argus.position_engine.premise import _metrics, oracle_ceiling


def test_metrics_returns_mar_and_expectancy():
    mar, exp = _metrics([1.0, -0.5, 2.0, -0.5], years=1.0)
    assert abs(exp - 0.5) < 1e-9                       # mean R
    assert mar > 0                                     # net 2.0 over a drawdown


def test_oracle_ceiling_beats_hold():
    # NB metrics.aggregate gives mar=0 when there is NO drawdown (the _safe_ratio convention),
    # so the oracle series must still contain a loss for MAR to be well-defined.
    trades = [{"entry_ts": pd.Timestamp("2021-01-04"), "hold_r": 0.5, "mfe_r": 2.0},
              {"entry_ts": pd.Timestamp("2021-02-01"), "hold_r": -0.4, "mfe_r": -0.2},
              {"entry_ts": pd.Timestamp("2021-03-01"), "hold_r": 1.0, "mfe_r": 3.0}]
    oc = oracle_ceiling(trades, years=1.0)
    assert abs(oc["hold_exp"] - np.mean([0.5, -0.4, 1.0])) < 1e-9
    assert abs(oc["oracle_exp"] - np.mean([2.0, -0.2, 3.0])) < 1e-9   # oracle = max(hold, mfe)
    assert oc["uplift_exp"] > 0 and oc["uplift_mar"] > 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py::test_metrics_returns_mar_and_expectancy -v`
Expected: FAIL — `ImportError: cannot import name '_metrics'`.

- [ ] **Step 3: Implement `_metrics` + `oracle_ceiling`** (append to `premise.py`)

```python
def _metrics(r_values, years) -> tuple:
    """(MAR, expectancy) for an entry-date-ordered R list, via metrics.aggregate. bh/spy args
    are 0 (they only feed mar_vs_* fields, not mar). n_bars feeds exposure only (unused here)."""
    r = list(r_values)
    df = pd.DataFrame({"r_multiple": r, "holding_bars": [1] * len(r)})
    m = aggregate(df, n_bars=max(len(r), 1), years=years, bh_return=0.0, bh_maxdd=0.0,
                  spy_return=0.0, spy_maxdd=0.0)
    return float(m["mar"]), float(m["expectancy"])


def oracle_ceiling(trades, years) -> dict:
    s = sorted(trades, key=lambda t: t["entry_ts"])
    h_mar, h_exp = _metrics([t["hold_r"] for t in s], years)
    o_mar, o_exp = _metrics([max(t["hold_r"], t["mfe_r"]) for t in s], years)
    return {"hold_mar": h_mar, "hold_exp": h_exp, "oracle_mar": o_mar, "oracle_exp": o_exp,
            "uplift_mar": o_mar - h_mar, "uplift_exp": o_exp - h_exp}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: PASS (all premise tests so far).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/premise.py argus/tests/test_pe_premise.py
git commit -m "feat(premise): MAR/expectancy helper + oracle ceiling (sizes the exit-timing prize)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: paired name-cluster bootstrap

**Files:**
- Modify: `argus/argus/position_engine/premise.py`
- Test: `argus/tests/test_pe_premise.py`

**Interfaces:**
- Consumes: `_metrics`.
- Produces: `bootstrap_rule(df, years, *, n_boot=N_BOOT, seed=0, min_rep=10) -> dict` where `df` has columns `ticker, entry_ts, rule_r, hold_r`. Returns `{p_mar, p_exp, p_rule, ci_mar, ci_exp}`. Resamples whole names (clusters), sorts each resample by `entry_ts`, recomputes MAR via `_metrics` on rule and hold (paired), and the expectancy delta as the mean per-trade `(rule_r − hold_r)` on the same resample.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_premise.py
from argus.position_engine.premise import bootstrap_rule


def _rule_df(n_names=40, edge=0.0, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(n_names):
        for j in range(3):
            hold = rng.normal(0.2, 1.0)
            rows.append({"ticker": f"T{k}", "entry_ts": pd.Timestamp("2021-01-04") + pd.Timedelta(days=k * 5 + j),
                         "hold_r": hold, "rule_r": hold + edge})
    return pd.DataFrame(rows)


def test_bootstrap_rule_small_p_for_clear_edge():
    bs = bootstrap_rule(_rule_df(edge=0.6, seed=1), years=1.0, n_boot=400, seed=2)
    assert bs["p_exp"] < 0.05 and bs["p_rule"] == max(bs["p_mar"], bs["p_exp"])


def test_bootstrap_rule_large_p_for_no_edge():
    bs = bootstrap_rule(_rule_df(edge=0.0, seed=3), years=1.0, n_boot=400, seed=4)
    assert bs["p_exp"] > 0.05
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py::test_bootstrap_rule_small_p_for_clear_edge -v`
Expected: FAIL — `ImportError: cannot import name 'bootstrap_rule'`.

- [ ] **Step 3: Implement `bootstrap_rule`** (append to `premise.py`)

```python
def bootstrap_rule(df, years, *, n_boot=N_BOOT, seed=0, min_rep=10) -> dict:
    """Paired name-cluster bootstrap of the (rule - hold) MAR and expectancy deltas. Each
    replicate resamples whole names with replacement, sorts by entry date, and recomputes MAR
    via aggregate() on both the rule and hold R-series (paired). One-sided p = P(delta <= 0)."""
    names = df["ticker"].unique()
    rng = np.random.default_rng(seed)
    dmar, dexp = [], []
    for _ in range(n_boot):
        drawn = rng.choice(names, size=len(names), replace=True)
        rs = pd.concat([df[df["ticker"] == nm] for nm in drawn]).sort_values("entry_ts")
        if len(rs) < min_rep:
            continue
        mar_r, _ = _metrics(rs["rule_r"].tolist(), years)
        mar_h, _ = _metrics(rs["hold_r"].tolist(), years)
        dmar.append(mar_r - mar_h)
        dexp.append(float((rs["rule_r"] - rs["hold_r"]).mean()))
    dmar, dexp = np.asarray(dmar, float), np.asarray(dexp, float)
    if dmar.size == 0:
        return {"p_mar": 1.0, "p_exp": 1.0, "p_rule": 1.0, "ci_mar": (np.nan, np.nan),
                "ci_exp": (np.nan, np.nan)}
    p_mar, p_exp = float(np.mean(dmar <= 0)), float(np.mean(dexp <= 0))
    return {"p_mar": p_mar, "p_exp": p_exp, "p_rule": max(p_mar, p_exp),
            "ci_mar": (float(np.quantile(dmar, 0.025)), float(np.quantile(dmar, 0.975))),
            "ci_exp": (float(np.quantile(dexp, 0.025)), float(np.quantile(dexp, 0.975)))}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/premise.py argus/tests/test_pe_premise.py
git commit -m "feat(premise): paired name-cluster aggregate-level bootstrap (MAR+expectancy deltas, conjunction p)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: rule application + exit-offset correlation

**Files:**
- Modify: `argus/argus/position_engine/premise.py`
- Test: `argus/tests/test_pe_premise.py`

**Interfaces:**
- Consumes: `RULES`, `CONTROL`, `realized_r`.
- Produces:
  - `apply_rules(trades) -> pd.DataFrame` — one row per `(trade, rule)` with `trade, ticker, entry_ts, rule, rule_r, hold_r, exit_offset, active` (`active` = the rule exits strictly before the structural exit).
  - `rule_correlation(apply_df) -> dict[str, float]` — for each candidate pair, fraction of trades exiting within ±1 bar.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_premise.py
from argus.position_engine.premise import apply_rules, rule_correlation


def _toy_trade(entry_ts="2021-02-01"):
    n = 30
    c = np.concatenate([np.linspace(100, 140, 12), np.linspace(139, 110, 18)])  # run up then drop
    path = pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6), "atr14": np.full(n, 2.0),
                         "donch_low20": np.full(n, 115.0), "health_flags": [""] * n},
                        index=pd.date_range(entry_ts, periods=n, freq="B"))
    return {"ticker": "T0", "entry_ts": pd.Timestamp(entry_ts), "entry_px": 100.0,
            "r": 10.0, "hold_r": (c[-1] - 100.0) / 10.0, "mfe_r": (c.max() - 100.0) / 10.0,
            "path": path}


def test_apply_rules_one_row_per_trade_and_rule():
    df = apply_rules([_toy_trade(), _toy_trade("2022-02-01")])
    assert set(df["rule"].unique()) == {"giveback_trail", "chandelier_high", "donchian_break",
                                        "no_progress", "profit_target_3r", "health_exit"}
    assert len(df) == 2 * 6
    # the giveback rule should fire on this run-up-then-drop path and beat the round-tripped hold
    gb = df[(df["rule"] == "giveback_trail")]
    assert gb["active"].all()
    assert (gb["rule_r"] > gb["hold_r"]).all()


def test_rule_correlation_is_fraction_in_0_1():
    df = apply_rules([_toy_trade(), _toy_trade("2022-02-01")])
    corr = rule_correlation(df)
    assert all(0.0 <= v <= 1.0 for v in corr.values())
    assert "chandelier_high|giveback_trail" in corr or "giveback_trail|chandelier_high" in corr
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py::test_apply_rules_one_row_per_trade_and_rule -v`
Expected: FAIL — `ImportError: cannot import name 'apply_rules'`.

- [ ] **Step 3: Implement `apply_rules` + `rule_correlation`** (append to `premise.py`)

```python
def apply_rules(trades) -> pd.DataFrame:
    allrules = {**RULES, **CONTROL}
    rows = []
    for i, t in enumerate(trades):
        for name, fn in allrules.items():
            off = fn(t["path"], t["entry_px"], t["r"])
            rr = realized_r(t["path"], t["entry_px"], t["r"], off, t["hold_r"])
            active = off is not None and off + 1 < len(t["path"])
            rows.append({"trade": i, "ticker": t["ticker"], "entry_ts": t["entry_ts"],
                         "rule": name, "rule_r": rr, "hold_r": t["hold_r"],
                         "exit_offset": -1 if off is None else int(off), "active": bool(active)})
    return pd.DataFrame(rows)


def rule_correlation(apply_df) -> dict:
    rules = sorted(apply_df["rule"].unique())
    piv = apply_df.pivot(index="trade", columns="rule", values="exit_offset")
    out = {}
    for i, a in enumerate(rules):
        for b in rules[i + 1:]:
            both = piv[[a, b]].dropna()
            agree = ((both[a] - both[b]).abs() <= 1).mean() if len(both) else 0.0
            out[f"{a}|{b}"] = float(agree)
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/premise.py argus/tests/test_pe_premise.py
git commit -m "feat(premise): apply exit overlays per trade + exit-offset correlation report" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `evaluate` + `run_premise` + report

**Files:**
- Modify: `argus/argus/position_engine/premise.py`
- Test: `argus/tests/test_pe_premise.py`

**Interfaces:**
- Consumes: `bootstrap_rule`, `apply_rules`, `rule_correlation`, `oracle_ceiling`, `extract_trades`, `holm`.
- Produces:
  - `evaluate(apply_df, years, *, n_boot=N_BOOT, seed=0) -> tuple[dict, bool]` — per-rule `{status, n_active, p_mar, p_exp, p_rule, ci_mar, ci_exp, holm_win}`; `health_exit` excluded from Holm; returns `(results, go)`.
  - `run_premise(*, corpus_dir, membership_path, out_dir=None, names=None, fetch_prices=None) -> dict` — orchestrates extraction over the corpus OOS window, evaluates, writes `premise_check_report.json` with `preregistration_sha`.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_premise.py
from argus.position_engine.premise import evaluate


def _apply_df(good_edge=0.8, n_names=40, seed=0):
    # build a synthetic apply_df directly: giveback_trail has a real edge, others none, health hurts
    rng = np.random.default_rng(seed)
    rows = []
    for k in range(n_names):
        for j in range(2):
            hold = rng.normal(0.1, 1.0)
            ets = pd.Timestamp("2021-03-01") + pd.Timedelta(days=k * 4 + j)
            for rule, edge in [("giveback_trail", good_edge), ("chandelier_high", 0.0),
                               ("donchian_break", 0.0), ("no_progress", 0.0),
                               ("profit_target_3r", -0.3), ("health_exit", -0.5)]:
                rows.append({"trade": k * 2 + j, "ticker": f"T{k}", "entry_ts": ets, "rule": rule,
                             "rule_r": hold + edge, "hold_r": hold, "exit_offset": 3, "active": True})
    return pd.DataFrame(rows)


def test_evaluate_graduates_real_edge_and_excludes_control_from_holm():
    res, go = evaluate(_apply_df(good_edge=0.8, seed=1), years=1.0, n_boot=400, seed=2)
    assert go is True
    assert res["giveback_trail"]["holm_win"] is True
    assert "holm_win" not in res["health_exit"]                 # control not in Holm
    assert res["health_exit"]["p_rule"] > 0.5                   # control hurts


def test_evaluate_abstains_below_min_trades():
    df = _apply_df(good_edge=0.8, seed=1)
    df = df[df["trade"] < 10]                                    # ~20 active < 30 floor
    res, go = evaluate(df, years=1.0, n_boot=200, seed=2)
    assert res["giveback_trail"]["status"] == "ABSTAIN_LOW_N"
    assert go is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py::test_evaluate_graduates_real_edge_and_excludes_control_from_holm -v`
Expected: FAIL — `ImportError: cannot import name 'evaluate'`.

- [ ] **Step 3: Implement `evaluate` + `run_premise`** (append to `premise.py`)

```python
def _git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return "unknown"


def evaluate(apply_df, years, *, n_boot=N_BOOT, seed=0) -> tuple:
    res, pvals = {}, {}
    for name in CANDIDATES + list(CONTROL):
        sub = apply_df[apply_df["rule"] == name]
        n_active = int(sub["active"].sum())
        if n_active < MIN_TRADES:
            res[name] = {"status": "ABSTAIN_LOW_N", "n_active": n_active}
            continue
        bs = bootstrap_rule(sub[["ticker", "entry_ts", "rule_r", "hold_r"]], years,
                            n_boot=n_boot, seed=seed)
        res[name] = {"status": "OK", "n_active": n_active, **bs}
        if name in CANDIDATES:
            pvals[name] = bs["p_rule"]
    rej = holm(pvals, alpha=0.05) if pvals else {}
    for name in CANDIDATES:
        if res[name].get("status") == "OK":
            res[name]["holm_win"] = bool(rej.get(name, False))
    go = any(res[n].get("holm_win") for n in CANDIDATES)
    return res, go


def _year_deltas(apply_df, name, years_each=1.0) -> dict:
    sub = apply_df[apply_df["rule"] == name]
    out = {}
    for y in OOS_YEARS:
        g = sub[sub["entry_ts"].dt.year == y].sort_values("entry_ts")
        if len(g) < 5:
            continue
        mar_r, exp_r = _metrics(g["rule_r"].tolist(), years_each)
        mar_h, exp_h = _metrics(g["hold_r"].tolist(), years_each)
        out[str(y)] = {"d_mar": mar_r - mar_h, "d_exp": exp_r - exp_h}
    return out


def run_premise(*, corpus_dir, membership_path, out_dir=None, names=None,
                fetch_prices=None, seed=0) -> dict:
    """Live orchestration. `fetch_prices(name)->daily` defaults to reading corpus_dir/corpus.db;
    `names` defaults to all corpus tickers. Pools OOS 2021-2024 trades, evaluates, writes report."""
    from .corpus import load_prices
    out_dir = Path(out_dir) if out_dir is not None else Path(corpus_dir)
    conn = get_conn(Path(corpus_dir) / "corpus.db")
    if names is None:
        names = [r["ticker"] for r in conn.execute(
            "SELECT DISTINCT ticker FROM prices ORDER BY ticker") if r["ticker"] != "SPY"]
    fetch_prices = fetch_prices or (lambda nm: load_prices(conn, nm, start="2014-01-01", end="2024-12-31"))
    spy = load_prices(conn, "SPY", start="2014-01-01", end="2024-12-31")

    trades = []
    for nm in names:
        d = fetch_prices(nm)
        if d is None or len(d) < 60:
            continue
        trades.extend(extract_trades(nm, d, spy))
    conn.close()

    oos = [t for t in trades if t["entry_ts"].year in OOS_YEARS]
    years = float(len(OOS_YEARS))
    apply_df = apply_rules(oos)
    res, go = evaluate(apply_df, years, seed=seed)
    for name in CANDIDATES:
        if res[name].get("holm_win"):
            yd = _year_deltas(apply_df, name)
            pos = sum(1 for v in yd.values() if v["d_mar"] > 0 and v["d_exp"] > 0)
            res[name]["per_year"] = yd
            res[name]["regime_robust"] = bool(pos >= 3)
    report = {"window": "2021-2024", "n_trades_oos": len(oos), "n_names": len(names),
              "years": years, "oracle": oracle_ceiling(oos, years) if oos else {},
              "rule_correlation": rule_correlation(apply_df) if len(apply_df) else {},
              "verdict": "GO" if go else "NO-GO", "rules": res,
              "preregistration_sha": _git_sha()}
    (out_dir / "premise_check_report.json").write_text(
        __import__("json").dumps(report, indent=2, default=float))
    return report
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_premise.py -v`
Expected: PASS. (If `giveback_trail` doesn't graduate due to bootstrap noise, raise `good_edge` to 1.0 — it must be unambiguous.)

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/premise.py argus/tests/test_pe_premise.py
git commit -m "feat(premise): family evaluation (Holm over candidates, ABSTAIN floor, regime annotation) + run_premise report" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: full-suite regression + live runner

**Files:**
- Create (throwaway, gitignored): `argus/backtests/_run_premise.py`

- [ ] **Step 1: Run the entire suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all green — prior 203 + the new `exits`/`premise` tests. Record the count.

- [ ] **Step 2: Write the throwaway live runner**

```python
# argus/backtests/_run_premise.py  (gitignored; mirrors _run_graduation.py)
import sys, json, warnings
from pathlib import Path
warnings.filterwarnings("ignore")
_ARGUS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ARGUS_ROOT))
from argus.position_engine.premise import run_premise

MAX = int(sys.argv[1]) if len(sys.argv) > 1 else 0
import numpy as np
from argus.db import get_conn
conn = get_conn(_ARGUS_ROOT / "backtests" / "_corpus" / "corpus.db")
alln = [r["ticker"] for r in conn.execute("SELECT DISTINCT ticker FROM prices ORDER BY ticker") if r["ticker"] != "SPY"]
conn.close()
names = sorted(np.random.default_rng(0).choice(alln, size=MAX, replace=False).tolist()) if MAX else None
rep = run_premise(corpus_dir=str(_ARGUS_ROOT / "backtests" / "_corpus"),
                  membership_path=str(_ARGUS_ROOT.parent / "config" / "sp500_membership.json"),
                  names=names)
print("VERDICT", rep["verdict"], "n_oos", rep["n_trades_oos"])
print("oracle uplift", {k: round(v, 3) for k, v in rep["oracle"].items() if k.startswith("uplift")})
for nm, r in rep["rules"].items():
    if r.get("status") == "OK":
        print(f"  {nm}: p_rule={r['p_rule']:.4f} holm_win={r.get('holm_win')} "
              f"p_mar={r['p_mar']:.3f} p_exp={r['p_exp']:.3f} n={r['n_active']}")
    else:
        print(f"  {nm}: {r['status']} n={r.get('n_active')}")
print("DONE")
```

- [ ] **Step 3: Pre-registration commit (freeze before the live run)**

```bash
git add argus/argus/position_engine/exits.py argus/argus/position_engine/premise.py
git commit --allow-empty -m "chore(premise): pre-registration freeze — exits.py + premise.py params locked before OOS run" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Record this commit SHA; the live `run_premise` writes it into `premise_check_report.json["preregistration_sha"]`.

- [ ] **Step 4: Live run (network/compute — slow, ~hours for full corpus)**

Run a representative subset first:
`.venv/bin/python backtests/_run_premise.py 150`
Expected: prints `VERDICT GO|NO-GO`, the oracle uplift, and per-rule p-values. (Run with no arg for the full 618-name corpus once the subset looks sane.)

- [ ] **Step 5: Commit the regression marker**

```bash
git commit --allow-empty -m "test(premise): exit premise-check full-suite regression green" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
|---|---|
| 5 candidate rules + health_exit control, fixed params, pure path functionals | 1 |
| T+1-open re-pricing; never-fire → baseline R | 1 |
| Full-series indicator warmup (atr14, donchian) sliced to held window | 2 |
| Trade extraction with health_flags column | 2 |
| Oracle ceiling (mfe_r) = prize size | 3 |
| Paired name-cluster aggregate-level MAR bootstrap (not per-trade mean) | 4 |
| Conjunction p = max(p_mar, p_exp) | 4, 6 |
| Apply rules per trade + exit-offset correlation report | 5 |
| Pooled-OOS gate, 30-trade ABSTAIN floor, Holm over candidates only, control excluded | 6 |
| Per-year regime-robust annotation (non-gating) | 6 |
| premise_check_report.json with preregistration_sha | 6, 7 |
| Pre-registration freeze before live run | 7 |
| Reuse aggregate (NOT beats_baseline), holm | 3, 4, 6 |

**Deferred / out of scope (per spec):** Romano–Wolf step-down max-T (only if Holm borderline); "hold-longer/looser-stop" overlays; intraday limit-fill for the target.
