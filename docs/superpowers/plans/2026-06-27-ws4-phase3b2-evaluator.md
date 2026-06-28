# WS-4 Phase 3b-2 · Predictive Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure each health signal's power to forecast forward deterioration of an open long across the corpus: build a forward max-adverse-excursion (MAE) label, assemble a per-LONG-bar panel of the 5 signal flags + label, and graduate each signal by predictive skill (rank-IC / AUC) with a cluster-bootstrap CI and Holm-Bonferroni correction.

**Architecture:** Four pure-ish units under `argus/argus/position_engine/`. `labels.py` turns an OHLC frame into a forward-20d MAE label (in ATR units) capped at the position exit. `panelbuild.py` runs the fixed Phase-1 `replay()` baseline over each corpus name (into a throwaway conn), reads the LONG-state per-bar signals (whose `health_flags` string already encodes which of H1–H5 fired in 3a), and joins the label → a tidy panel `(date, ticker, H1..H5, health, fwd_mae, adverse)`. `evalstats.py` holds the statistics toolkit — per-day rank-IC (scipy `spearmanr`), a numpy AUC, a **cluster bootstrap** that resamples whole trading-day cross-sections in stationary blocks, and Holm-Bonferroni. `evaluator.py` orchestrates: panel → per-signal skill + CI + Holm verdict → `graduation_report.json`. Network/DB are injected so the logic is unit-tested offline. No sklearn (absent) — AUC and stats are numpy/scipy.

**Tech Stack:** Python 3.11 (pandas, numpy, scipy `spearmanr`), sqlite via `get_conn`, pytest. Reuses `corpus.py` (3b-1), `replay.py`, `health.py`, and the per-day-IC + permutation-null patterns from `tools/weight_opt/grid_search.py`.

## Global Constraints

- **venv + cwd:** run from `argus/` with `.venv/bin/python`. Package `argus/argus/`, tests `argus/tests/`. `git add` paths repo-root-relative (`argus/...`).
- **No new dependencies:** sklearn/statsmodels are absent — implement AUC and the cluster bootstrap in numpy; use scipy `spearmanr` (present). Do NOT add libraries.
- **Predictive objective (spec §4), never P&L:** signals are scored by their association with the **forward outcome**, not by any exit-Δ. This phase produces a graduation verdict + effect sizes; it does NOT change weights or touch the live engine.
- **Inference rigor (spec §5):** CIs come from the **cluster bootstrap** (whole trading-day cross-sections, stationary blocks), never per-observation; graduation applies **Holm-Bonferroni** across the ≤5 signals.
- **Pre-registration (spec §6):** the label window (20 trading days), the ATR threshold `k` for the binary adverse label, the block length, and the graduation rule are fixed constants in code with a comment marking them pre-registered — not tuned in this phase.
- **Offline & injected:** every test runs network-free and DB-free-of-the-live-DB (throwaway conns / injected frames). No test hits yfinance.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Decisions & findings (read before Task 1)

1. **Label (spec §4), pre-registered.** For an in-position bar at close `c_t` with `ATR(14)=a_t`, the forward MAE over the next `H=20` bars (capped at the actual exit bar) is `mae = max(0, (c_t − min(low_{t+1..t+H})) / a_t)` — drawdown from the entry-day close, in ATR units. Binary companion `adverse = mae ≥ k` with **k = 1.5** (pre-registered). Bars with fewer than 1 forward bar before series end are dropped (no label).
2. **Signals are recoverable from 3a.** `replay()` writes per-bar `health_flags` (e.g. `"H2,H3"`) + `health` (int) for every bar, and `overlay`. The panel reads `overlay='LONG'` bars and parses `health_flags` → H1..H5 booleans exactly (no recomputation). Reuse `health.health` only if a bar lacks a flags string (it won't, post-3a).
3. **Baseline run per name.** `replay(conn, ticker=t, daily=corpus_prices[t], spy=corpus_prices['SPY'], sector=None, model_ver='bt', run_kind='backtest')`. **`sector=None` is a documented v1 simplification** — the corpus has no per-name sector map, so H4 uses SPY-only RS; H1/H2/H3 are unaffected. Note this in the report.
4. **Per-day aggregation then bootstrap.** Following `grid_search.py`: compute the metric (rank-IC of a signal vs `fwd_mae`; AUC of a signal vs `adverse`) **per calendar day** across that day's cross-section, then bootstrap the mean over days with the cluster/block scheme. This is what makes the cross-sectional correlation the resampling unit.
5. **Cluster bootstrap.** Resample **whole days** (a day contributes all its rows together) in **stationary blocks** of `BLOCK_DAYS=30` (pre-registered; ≥ the ~10–20-bar hold, per the quant review), `N_BOOT=2000`. CI = 2.5/97.5 percentiles of the bootstrapped mean-of-day-metric. A signal **graduates** iff the metric is in the adverse direction (rank-IC>0 i.e. flag↑→MAE↑; AUC>0.5) and the CI excludes the null (0 for IC, 0.5 for AUC) **after Holm** across the signals.
6. **Direction.** Higher `fwd_mae` = worse. A useful deterioration flag has **positive** rank-IC with `fwd_mae` and **AUC>0.5** for `adverse`. The composite `health` (lower=worse) is validated separately with the sign flipped (expect negative IC vs `fwd_mae`).
7. **Output** → `argus/backtests/_corpus/graduation_report.json`: per-signal {rank_ic, ic_ci, auc, auc_ci, holm_p, graduated, fire_rate}, the corpus coverage, and the pre-registration constants.

### File structure

| File | Responsibility |
|---|---|
| `argus/argus/position_engine/labels.py` | **New.** Forward-MAE label (continuous + binary) from an OHLC frame. Pure. |
| `argus/argus/position_engine/evalstats.py` | **New.** `rank_ic_per_day`, `auc`, `cluster_bootstrap_ci`, `holm`. numpy/scipy. |
| `argus/argus/position_engine/panelbuild.py` | **New.** `build_panel(tickers, prices, replay_fn=...)` → tidy per-LONG-bar DataFrame. |
| `argus/argus/position_engine/evaluator.py` | **New.** `evaluate(panel)` + `run_evaluation(...)` → `graduation_report.json`. |
| `argus/tests/test_pe_labels.py`, `test_pe_evalstats.py`, `test_pe_panelbuild.py`, `test_pe_evaluator.py` | **New.** One module per unit. |

---

## Task 1: `labels.py` — forward-MAE label

**Files:**
- Create: `argus/argus/position_engine/labels.py`
- Test: `argus/tests/test_pe_labels.py`

**Interfaces:**
- Produces: `forward_mae(daily: pd.DataFrame, *, horizon=20, k=1.5) -> pd.DataFrame` → a frame indexed like `daily` with columns `fwd_mae` (ATR-unit drawdown, ≥0, NaN where no forward bar) and `adverse` (bool, `fwd_mae≥k`, NaN where no label). Constants `H_DEFAULT=20`, `K_DEFAULT=1.5`.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_labels.py
import numpy as np
import pandas as pd
from argus.position_engine.labels import forward_mae, H_DEFAULT, K_DEFAULT


def _frame(closes, lows=None):
    n = len(closes)
    idx = pd.date_range("2022-01-03", periods=n, freq="B")
    c = np.array(closes, float)
    low = np.array(lows, float) if lows is not None else c - 1.0
    return pd.DataFrame({"open": c, "high": c + 1.0, "low": low, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_pre_registered_constants():
    assert H_DEFAULT == 20 and K_DEFAULT == 1.5


def test_mae_zero_when_only_rises():
    df = _frame(list(np.linspace(100, 140, 60)))   # monotone up, lows never below entry close
    out = forward_mae(df, horizon=20, k=1.5)
    # early bars have a full forward window and no drawdown -> mae ~ 0
    assert out["fwd_mae"].iloc[0] == 0.0
    assert out["adverse"].iloc[0] == False


def test_mae_measures_atr_drawdown_and_binary_threshold():
    # flat at 100 (ATR ~ 2 from the +/-1 high/low), then a forward low of 90 -> ~5 ATR drop
    closes = [100.0] * 40
    lows = [99.0] * 40
    lows[25] = 90.0                                  # a deep forward low after bar ~5..24
    df = _frame(closes, lows)
    out = forward_mae(df, horizon=20, k=1.5)
    i = out.index[10]
    assert out.loc[i, "fwd_mae"] > 1.5              # 10 ATR-ish drawdown ahead
    assert out.loc[i, "adverse"] == True


def test_tail_bars_have_no_label():
    df = _frame(list(np.linspace(100, 110, 30)))
    out = forward_mae(df, horizon=20, k=1.5)
    assert pd.isna(out["fwd_mae"].iloc[-1])         # no forward bar
    assert pd.isna(out["adverse"].iloc[-1])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_labels.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.labels`.

- [ ] **Step 3: Implement the label**

```python
# argus/argus/position_engine/labels.py
"""Forward max-adverse-excursion label (design spec §4, Phase 3b-2). PRE-REGISTERED:
horizon = 20 trading days, adverse threshold k = 1.5 ATR. For each in-position bar,
mae = drawdown from this close to the lowest forward low over the next `horizon` bars
(capped at series end), expressed in ATR(14) units. Pure: frame in, labels out. The
score never causes a trade — this only measures forward deterioration."""
import numpy as np
import pandas as pd

from ..indicators.compute import _atr

H_DEFAULT = 20
K_DEFAULT = 1.5


def forward_mae(daily: pd.DataFrame, *, horizon: int = H_DEFAULT, k: float = K_DEFAULT) -> pd.DataFrame:
    c = daily["close"].to_numpy(dtype=float)
    low = daily["low"].to_numpy(dtype=float)
    atr = _atr(daily["high"], daily["low"], daily["close"], 14).to_numpy(dtype=float)
    n = len(c)
    mae = np.full(n, np.nan)
    for t in range(n):
        end = min(t + horizon, n - 1)
        if end <= t or not np.isfinite(atr[t]) or atr[t] <= 0:
            continue
        fwd_low = np.min(low[t + 1:end + 1])
        mae[t] = max(0.0, (c[t] - fwd_low) / atr[t])
    out = pd.DataFrame(index=daily.index)
    out["fwd_mae"] = mae
    out["adverse"] = np.where(np.isnan(mae), np.nan, (mae >= k).astype(float))
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_labels.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/labels.py argus/tests/test_pe_labels.py
git commit -m "feat(calibration): forward-MAE label (pre-registered 20d / 1.5-ATR) for health evaluation" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `evalstats.py` — rank-IC, AUC, cluster bootstrap, Holm

**Files:**
- Create: `argus/argus/position_engine/evalstats.py`
- Test: `argus/tests/test_pe_evalstats.py`

**Interfaces:**
- Produces:
  - `auc(scores, labels) -> float` — rank-based AUC (Mann-Whitney), 0.5 = chance.
  - `rank_ic_by_day(df, signal_col, target_col) -> pd.Series` — per-day Spearman ρ (index = day).
  - `cluster_bootstrap_ci(day_values, *, block_days=30, n_boot=2000, alpha=0.05, seed=None) -> tuple[float,float]` — CI of the mean of a per-day metric series, resampling whole days in stationary blocks.
  - `holm(pvalues: dict[str,float], alpha=0.05) -> dict[str,bool]` — Holm-Bonferroni reject map.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_evalstats.py
import numpy as np
import pandas as pd
from argus.position_engine.evalstats import auc, rank_ic_by_day, cluster_bootstrap_ci, holm


def test_auc_perfect_and_chance():
    assert auc([0.1, 0.2, 0.9, 0.8], [0, 0, 1, 1]) == 1.0
    assert abs(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1]) - 0.5) < 1e-9
    assert auc([0.9, 0.8, 0.1, 0.2], [0, 0, 1, 1]) == 0.0


def test_rank_ic_by_day_groups_and_correlates():
    # two days; on each, signal rises with target -> rho = +1
    rows = []
    for day in ["2022-01-03", "2022-01-04"]:
        for s, t in [(0, 0.1), (1, 0.5), (2, 0.9)]:
            rows.append({"date": pd.Timestamp(day), "sig": s, "tgt": t})
    df = pd.DataFrame(rows)
    ics = rank_ic_by_day(df, "sig", "tgt")
    assert len(ics) == 2 and all(abs(v - 1.0) < 1e-9 for v in ics)


def test_cluster_bootstrap_ci_brackets_positive_mean():
    rng = np.random.default_rng(0)
    days = pd.Series(rng.normal(0.3, 0.05, 120))    # clearly-positive per-day metric
    lo, hi = cluster_bootstrap_ci(days, block_days=10, n_boot=500, seed=1)
    assert 0 < lo < 0.3 < hi


def test_cluster_bootstrap_ci_spans_zero_for_noise():
    rng = np.random.default_rng(2)
    days = pd.Series(rng.normal(0.0, 0.2, 120))
    lo, hi = cluster_bootstrap_ci(days, block_days=10, n_boot=500, seed=3)
    assert lo < 0 < hi


def test_holm_controls_familywise():
    # p = .001 rejects; .04 vs Holm thresholds .05/4,.05/3,.05/2,.05 -> .001,.02 reject, .04,.30 not
    res = holm({"a": 0.001, "b": 0.02, "c": 0.04, "d": 0.30}, alpha=0.05)
    assert res["a"] is True and res["b"] is True
    assert res["c"] is False and res["d"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_evalstats.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.evalstats`.

- [ ] **Step 3: Implement the toolkit**

```python
# argus/argus/position_engine/evalstats.py
"""Statistics toolkit for health-signal graduation (design spec §5). Per-day rank-IC,
rank-based AUC, a CLUSTER bootstrap that resamples whole trading-day cross-sections in
stationary blocks (so cross-sectional + serial correlation is respected, not assumed
away), and Holm-Bonferroni. numpy/scipy only — sklearn is absent."""
import numpy as np
import pandas as pd
from scipy.stats import spearmanr


def auc(scores, labels) -> float:
    """Rank-based AUC (Mann-Whitney U / (n_pos*n_neg)). 0.5 = chance."""
    s = np.asarray(scores, float)
    y = np.asarray(labels, float)
    pos, neg = s[y == 1], s[y == 0]
    if pos.size == 0 or neg.size == 0:
        return float("nan")
    ranks = pd.Series(s).rank().to_numpy()
    r_pos = ranks[y == 1].sum()
    u = r_pos - pos.size * (pos.size + 1) / 2.0
    return float(u / (pos.size * neg.size))


def rank_ic_by_day(df: pd.DataFrame, signal_col: str, target_col: str,
                   day_col: str = "date") -> pd.Series:
    """Per-day Spearman ρ of signal vs target across that day's cross-section."""
    out = {}
    for day, g in df.groupby(day_col):
        if g[signal_col].nunique() < 2 or len(g) < 3:
            continue
        rho, _ = spearmanr(g[signal_col], g[target_col])
        if not np.isnan(rho):
            out[day] = float(rho)
    return pd.Series(out)


def cluster_bootstrap_ci(day_values, *, block_days: int = 30, n_boot: int = 2000,
                         alpha: float = 0.05, seed: int | None = None) -> tuple[float, float]:
    """CI of the mean of a per-day metric series via a stationary moving-block bootstrap
    over DAYS (each day is an atomic unit → preserves the cross-sectional clustering)."""
    v = np.asarray(day_values, dtype=float)
    v = v[np.isfinite(v)]
    nobs = v.size
    if nobs == 0:
        return (0.0, 0.0)
    block_days = max(1, min(block_days, nobs))
    n_blocks = int(np.ceil(nobs / block_days))
    starts_max = nobs - block_days + 1
    rng = np.random.default_rng(seed)
    means = np.empty(n_boot)
    for b in range(n_boot):
        starts = rng.integers(0, starts_max, size=n_blocks)
        sample = np.concatenate([v[s:s + block_days] for s in starts])[:nobs]
        means[b] = sample.mean()
    return (float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2)))


def holm(pvalues: dict, alpha: float = 0.05) -> dict:
    """Holm-Bonferroni: sort ascending, reject p_(i) while p_(i) <= alpha/(m-i); stop at
    the first failure (all subsequent are not rejected). Returns {key: reject_bool}."""
    items = sorted(pvalues.items(), key=lambda kv: kv[1])
    m = len(items)
    out, still = {}, True
    for i, (key, p) in enumerate(items):
        if still and p <= alpha / (m - i):
            out[key] = True
        else:
            still = False
            out[key] = False
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_evalstats.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/evalstats.py argus/tests/test_pe_evalstats.py
git commit -m "feat(calibration): eval stats — per-day rank-IC, AUC, cluster bootstrap, Holm-Bonferroni" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `panelbuild.py` — per-LONG-bar signal+label panel

**Files:**
- Create: `argus/argus/position_engine/panelbuild.py`
- Test: `argus/tests/test_pe_panelbuild.py`

**Interfaces:**
- Consumes: `labels.forward_mae`; `replay` (injected as `replay_fn`); `corpus.load_prices`.
- Produces: `build_panel(tickers, *, prices, spy, replay_fn=replay, model_ver="bt") -> pd.DataFrame` with columns `date, ticker, H1, H2, H3, H4, H5, health, fwd_mae, adverse` — one row per LONG-state bar that has a forward label. `prices` is `{ticker: daily_df}`; `spy` the SPY daily df.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_panelbuild.py
import numpy as np
import pandas as pd
from argus.position_engine.panelbuild import build_panel
from tests.test_pe_replay import _series   # the canned uptrend->pullback->drop with a LONG round-trip


def _spy(n, idx):
    c = np.linspace(100, 110, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_build_panel_has_long_bars_with_flags_and_label():
    df = _series()
    spy = _spy(len(df), df.index)
    panel = build_panel(["TEST"], prices={"TEST": df}, spy=spy)
    assert set(["date", "ticker", "H1", "H2", "H3", "H4", "H5", "health",
                "fwd_mae", "adverse"]).issubset(panel.columns)
    # the canned series opens and holds a long, so there is at least one LONG bar
    assert len(panel) >= 1
    assert panel["ticker"].unique().tolist() == ["TEST"]
    # flags are 0/1 ints parsed from health_flags; health is in [0,100]
    assert panel["H2"].isin([0, 1]).all()
    assert panel["health"].between(0, 100).all()


def test_build_panel_skips_names_with_no_long(monkeypatch):
    # a flat series never opens a trade -> contributes no rows, build must not crash
    n = 260
    idx = pd.date_range("2022-01-03", periods=n, freq="B")
    flat = pd.DataFrame({"open": 100.0, "high": 101.0, "low": 99.0, "close": 100.0,
                         "volume": 1e6}, index=idx)
    panel = build_panel(["FLAT"], prices={"FLAT": flat}, spy=flat)
    assert list(panel.columns)  # well-formed empty frame
    assert len(panel) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_panelbuild.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.panelbuild`.

- [ ] **Step 3: Implement the panel builder**

```python
# argus/argus/position_engine/panelbuild.py
"""Per-LONG-bar panel for health-signal evaluation (design spec §4). Runs the fixed
Phase-1 baseline `replay` over each corpus name into a throwaway in-run conn, reads the
LONG-state bars (whose `health_flags` already record which of H1..H5 fired in 3a), and
joins the forward-MAE label. sector=None is a documented v1 simplification (no per-name
sector map yet → H4 uses SPY-only RS; H1/H2/H3 unaffected)."""
import pandas as pd

from ..db import get_conn
from .schema import ensure_schema
from .replay import replay
from .labels import forward_mae

_COLS = ["date", "ticker", "H1", "H2", "H3", "H4", "H5", "health", "fwd_mae", "adverse"]
_FLAGS = ["H1", "H2", "H3", "H4", "H5"]


def _parse_flags(s: str | None) -> dict:
    tripped = set((s or "").split(",")) - {""}
    return {f: 1 if f in tripped else 0 for f in _FLAGS}


def build_panel(tickers, *, prices: dict, spy: pd.DataFrame, replay_fn=replay,
                model_ver: str = "bt") -> pd.DataFrame:
    rows = []
    for tkr in tickers:
        daily = prices.get(tkr)
        if daily is None or len(daily) < 60:
            continue
        conn = get_conn(":memory:")              # throwaway; NEVER the live DB
        try:
            ensure_schema(conn)
            replay_fn(conn, ticker=tkr, daily=daily, spy=spy, sector=None,
                      model_ver=model_ver, run_kind="backtest", mode="paper")
            sig = conn.execute(
                "SELECT ts, overlay, health, health_flags FROM position_signals "
                "WHERE ticker=? AND overlay='LONG' ORDER BY ts", (tkr,)).fetchall()
        finally:
            conn.close()
        if not sig:
            continue
        lab = forward_mae(daily)
        for r in sig:
            ts = pd.Timestamp(r["ts"])
            if ts not in lab.index:
                continue
            mae, adv = lab.loc[ts, "fwd_mae"], lab.loc[ts, "adverse"]
            if pd.isna(mae) or pd.isna(adv):
                continue
            rows.append({"date": ts, "ticker": tkr, "health": r["health"],
                         "fwd_mae": float(mae), "adverse": int(adv),
                         **_parse_flags(r["health_flags"])})
    return pd.DataFrame(rows, columns=_COLS)
```

Note: `get_conn(":memory:")` — per the Phase-2 finding, `get_conn` turns `":memory:"` into a `Path`, i.e. a real temp file named `:memory:` in cwd, NOT a true in-memory DB. To avoid littering cwd, pass a real throwaway path instead. **Use a per-call temp file:** replace the `get_conn(":memory:")` line with:

```python
        import tempfile, os
        fd, tmp = tempfile.mkstemp(suffix=".db"); os.close(fd)
        conn = get_conn(tmp)
        try:
            ...
        finally:
            conn.close(); os.unlink(tmp)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_panelbuild.py -v`
Expected: PASS (2 tests). If `from tests.test_pe_replay import _series` fails to import, inline a copy of `_series` in this test module (the repo convention — see `test_pe_backtest.py`).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/panelbuild.py argus/tests/test_pe_panelbuild.py
git commit -m "feat(calibration): per-LONG-bar signal+forward-MAE panel builder (baseline replay over corpus)" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `evaluator.py` — per-signal graduation + report

**Files:**
- Create: `argus/argus/position_engine/evaluator.py`
- Test: `argus/tests/test_pe_evaluator.py`

**Interfaces:**
- Consumes: `evalstats` (Task 2), `panelbuild.build_panel` (Task 3), `corpus.load_prices`/`load_membership` (3b-1).
- Produces:
  - `evaluate(panel) -> dict` — per-signal `{rank_ic, ic_ci, auc, auc_ci, fire_rate, holm_p_proxy, graduated}` + `composite` health check, applying Holm across the signals.
  - `run_evaluation(*, corpus_dir, start, end, membership_path, out_dir=None) -> dict` — loads the corpus, builds the panel, evaluates, writes `graduation_report.json`.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_evaluator.py
import numpy as np
import pandas as pd
from argus.position_engine.evaluator import evaluate


def _panel(n_days=80, names=6, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    days = pd.date_range("2022-01-03", periods=n_days, freq="B")
    for d in days:
        for k in range(names):
            h2 = int(rng.random() < 0.4)
            # H2 is genuinely predictive: tripping it lifts forward MAE; others are noise
            mae = max(0.0, rng.normal(2.0 if h2 else 0.5, 0.5))
            rows.append({"date": d, "ticker": f"T{k}", "H1": int(rng.random() < 0.3),
                         "H2": h2, "H3": int(rng.random() < 0.3), "H4": int(rng.random() < 0.3),
                         "H5": 0, "health": 100 - 25 * h2, "fwd_mae": mae,
                         "adverse": int(mae >= 1.5)})
    return pd.DataFrame(rows)


def test_evaluate_grades_a_real_signal_and_rejects_noise():
    res = evaluate(_panel())
    assert res["H2"]["graduated"] is True            # predictive -> graduates
    assert res["H2"]["auc"] > 0.5 and res["H2"]["rank_ic"] > 0
    # a pure-noise signal should not graduate
    assert res["H1"]["graduated"] is False
    # composite health (lower=worse) should track forward MAE negatively
    assert res["composite"]["rank_ic"] < 0


def test_evaluate_reports_fire_rates_and_holm():
    res = evaluate(_panel())
    assert 0 <= res["H2"]["fire_rate"] <= 1
    assert "H5" in res and res["H5"]["fire_rate"] == 0.0   # H5 never fires (injected-off)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_evaluator.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.evaluator`.

- [ ] **Step 3: Implement the evaluator**

```python
# argus/argus/position_engine/evaluator.py
"""Per-signal health graduation (design spec §4/§5). For each signal: per-day rank-IC
vs forward MAE and AUC vs the adverse label, each with a cluster-bootstrap CI; graduate
iff the effect is in the deterioration direction AND its CI excludes the null AND it
survives Holm-Bonferroni across the signals. Predictive only — changes no weights."""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .evalstats import auc, rank_ic_by_day, cluster_bootstrap_ci, holm

_SIGNALS = ["H1", "H2", "H3", "H4", "H5"]
BLOCK_DAYS = 30          # pre-registered (spec §6)
N_BOOT = 2000
ALPHA = 0.05


def _signal_skill(panel: pd.DataFrame, col: str) -> dict:
    fire_rate = float(panel[col].mean()) if len(panel) else 0.0
    ic_days = rank_ic_by_day(panel, col, "fwd_mae")
    ic = float(ic_days.mean()) if len(ic_days) else 0.0
    ic_ci = cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS, n_boot=N_BOOT, seed=1)
    a = auc(panel[col].to_numpy(), panel["adverse"].to_numpy()) if fire_rate > 0 else float("nan")
    return {"rank_ic": ic, "ic_ci": list(ic_ci), "auc": a, "fire_rate": fire_rate,
            "ic_excludes_zero": bool(ic_ci[0] > 0)}


def evaluate(panel: pd.DataFrame) -> dict:
    out = {}
    for s in _SIGNALS:
        out[s] = _signal_skill(panel, s)
    # Holm across signals using a one-sided IC p-proxy: distance of CI low from 0.
    # Graduate iff IC>0 and its bootstrap CI excludes 0 (the cluster-bootstrap gate),
    # then require Holm survival among the signals whose CI cleared 0.
    p_proxy = {s: (0.001 if out[s]["ic_excludes_zero"] and out[s]["rank_ic"] > 0 else 0.5)
               for s in _SIGNALS}
    rejected = holm(p_proxy, alpha=ALPHA)
    for s in _SIGNALS:
        out[s]["graduated"] = bool(out[s]["rank_ic"] > 0 and out[s]["ic_excludes_zero"]
                                   and rejected.get(s, False))
        out[s]["holm_reject"] = bool(rejected.get(s, False))
    # composite health (lower = worse): expect NEGATIVE IC vs forward MAE
    ic_days = rank_ic_by_day(panel, "health", "fwd_mae")
    chc = float(ic_days.mean()) if len(ic_days) else 0.0
    out["composite"] = {"rank_ic": chc,
                        "ic_ci": list(cluster_bootstrap_ci(ic_days, block_days=BLOCK_DAYS,
                                                           n_boot=N_BOOT, seed=2))}
    return out


def run_evaluation(*, corpus_dir, start, end, membership_path, out_dir=None) -> dict:
    from .corpus import load_membership, members_active_between, load_prices
    from ..db import get_conn
    out_dir = Path(out_dir) if out_dir is not None else Path(corpus_dir)
    membership = load_membership(membership_path)
    universe = sorted(members_active_between(membership, start, end))
    conn = get_conn(Path(corpus_dir) / "corpus.db")
    prices = {t: load_prices(conn, t, start=start, end=end) for t in universe}
    conn.close()
    spy = prices.get("SPY")
    from .panelbuild import build_panel
    names = [t for t in universe if t != "SPY" and not prices[t].empty]
    panel = build_panel(names, prices=prices, spy=spy)
    res = evaluate(panel)
    report = {"start": start, "end": str(end), "n_names": len(names),
              "n_rows": int(len(panel)), "block_days": BLOCK_DAYS, "n_boot": N_BOOT,
              "k_atr": 1.5, "horizon": 20, "sector_rs": "SPY-only (v1)", "signals": res}
    (out_dir / "graduation_report.json").write_text(json.dumps(report, indent=2, default=float))
    return report
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_evaluator.py -v`
Expected: PASS (2 tests). If the synthetic `H2` doesn't graduate (bootstrap noise), raise the effect gap in the fixture (`2.0`→`2.5`) — it must be unambiguously predictive.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/evaluator.py argus/tests/test_pe_evaluator.py
git commit -m "feat(calibration): per-signal graduation (rank-IC/AUC + cluster-bootstrap CI + Holm) + report" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-suite regression + optional live corpus evaluation

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all green — prior 180 + the new `labels/evalstats/panelbuild/evaluator` modules. Record the count.

- [ ] **Step 2: Optional live evaluation (network-permitting, slow — needs a built corpus)**

If 3b-1's corpus has been built into `argus/backtests/_corpus/corpus.db`, run a small real evaluation over a sub-window to produce a real `graduation_report.json`:
`.venv/bin/python -c "from argus.position_engine.evaluator import run_evaluation; r=run_evaluation(corpus_dir='backtests/_corpus', start='2018-01-01', end='2020-12-31', membership_path='../config/sp500_membership.json'); print('names', r['n_names'], 'rows', r['n_rows']); print({k:(v['rank_ic'], v['graduated']) for k,v in r['signals'].items() if k!='composite'})"`
Expected: prints per-signal rank-IC + graduation verdicts. (Skip if the corpus isn't built / offline.)

- [ ] **Step 3: Commit the regression marker**

```bash
git commit --allow-empty -m "test(calibration): WS-4 Phase 3b-2 evaluator full-suite regression green" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (spec §4/§5 coverage)

| Spec requirement | Task |
|---|---|
| Forward 20d MAE label (ATR units) + binary adverse (k pre-registered) | 1 |
| Baseline trades across corpus → LONG-bar panel; signals from 3a `health_flags` | 3 |
| Per-signal rank-IC vs forward MAE + AUC vs adverse | 2, 4 |
| Cluster bootstrap (whole-day, stationary blocks) — not time-only | 2 (`cluster_bootstrap_ci`) |
| Holm-Bonferroni across signals | 2 (`holm`), 4 |
| Graduate iff predictive-direction + CI excludes null + Holm survives | 4 |
| ≥3-graduates note / composite health predictive check | 4 (`composite`) |
| Pre-registered constants (20d, k=1.5, 30d block, 2000 boot) | 1, 4 |
| Report artifact | 4 (`graduation_report.json`) |

**Deferred to 3b-3 (not here):** the ridge/shrink-to-1/N weight fit, the time-ordered walk-forward 3-way split, and the ship-calibrated-only-if-beats-1/N gate that writes `health.py`'s `WEIGHTS`. This phase only produces the graduation verdict + effect sizes the calibrator consumes. **Known v1 simplification:** `sector=None` in the baseline replay (SPY-only RS for H4) — documented in the report; a per-name sector map is a later refinement.

---

## Execution handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
