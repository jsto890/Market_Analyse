# Phase B / WS-1: Options Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Binding rules:** master plan §4.1 (`docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md`). Scope boundary: files listed per task only; out-of-scope discoveries are reported, never fixed. No agent runs `sudo` or `launchctl`; plist bootstraps, pip installs and live-API restarts are controller steps at integration.

**Goal:** Chain snapshots accumulating nightly for the tracked universe, a statistically sound relative-unusual scorer replacing the naive `vol>2×OI` filter, daily GEX levels for the index underlyings, and an options panel that is never silently empty — overnight it serves yesterday's scored close snapshot, clearly labelled.

**Architecture:** A new `argus/argus/options_intel/` package owns schema, universe, snapshotter, scorer and GEX engine — all SQLite access through `argus.db.get_conn()` (B-0 contract). Two launchd jobs (pre-close 05:50 local, close 06:10 local, both through `scripts/job_wrapper.sh`) snapshot the chain; the close job then scores unusual activity and computes GEX. `flow_summary` gains a closed-market fallback that reads the latest scored snapshot instead of live volume. The dashboard OptionsPanel renders scores + an as-of banner; index tickers get a GEX levels card.

**Tech Stack:** Python 3.11 (`argus/.venv`), yfinance 1.3.0, scipy 1.17.1 (`scipy.stats.norm` — py_vollib NOT installed, do not add it), sqlite3 via `argus.db`, FastAPI, launchd + job_wrapper; Next.js 14 + SWR for the panel.

**Verified starting facts (2026-06-13):**
- `argus/argus/data/market.py:133` `get_options_chain(symbol, expiration=None)` → `{symbol, expiration, expirations, calls:[records], puts:[records], summary:{call_oi,put_oi,pcr_vol,pcr_oi,…}}`; `{"symbol", "error": "no chain"}` on failure. yfinance chain records carry `strike, openInterest, volume, lastPrice, bid, ask, impliedVolatility, contractSymbol`.
- `argus/argus/flow/options_flow.py:34` `flow_summary(symbol, expiration)` — current unusual = `volume > 2×openInterest`, top-5 by volume. Payload keys consumed by `dashboard/components/ticker/OptionsPanel.tsx` (via proxy `/api/argus/flow/{sym}`): `symbol, expiration, spot, summary, iv_atm_call, iv_atm_put, iv_skew, max_pain, flags, unusual_calls_top, unusual_puts_top, disclaimer`.
- B-0 contracts: `argus.db.get_conn()` (WAL, busy_timeout=5000, row_factory=Row), `argus.db.heartbeat(job,status,detail)`, CLI `python -m argus.heartbeat`, `scripts/job_wrapper.sh`, heartbeats render on `/sources`. Argus app object: `argus.main:app` (module-level `build_app()`).
- Watchlist table lives in the SAME `argus.db`: `watchlist(ticker TEXT PRIMARY KEY, pinned_at TEXT, price_at_pin REAL)` (created by the dashboard).
- Bridge universe: `reports/bridge_latest.csv`, columns include `ticker` and `fetch_symbol` (use `fetch_symbol` for yfinance) and `conviction`. `BRIDGE_DIR` env names the reports dir (`.env` contract).
- pmset pre-wake 05:45 local weekdays is ACTIVE (user ran setup_wakes.sh). 05:50 local ≈ 15:50 ET during AEST↔EDT alignment; during AEDT the jobs drift ~2h late vs ET — heartbeat badges surface this; accepted (master plan §2.4).
- **Plan-vs-reality correction (document, don't fight):** master plan §2.4 claims missed EOD chains are "re-fetchable". For free yfinance they are NOT — only the CURRENT chain is served. Catch-up is same-trading-day only (a late fetch after close is still that session's chain). The scorer's gap tolerance ("≥10 non-zero-volume days", not "20 consecutive") is therefore load-bearing, and missed nights are permanently missed rows.
- argus pytest baseline: 22 passed. Dashboard vitest baseline: 45 passed.

---

### Task 1: `options_intel` package + schema module

**Files:**
- Create: `argus/argus/options_intel/__init__.py` (empty)
- Create: `argus/argus/options_intel/schema.py`
- Test: `argus/tests/test_oi_schema.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_oi_schema.py
from argus.db import get_conn
from argus.options_intel.schema import ensure_schema


def test_ensure_schema_creates_tables_idempotently(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    ensure_schema(conn)  # idempotent
    names = {r["name"] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    conn.close()
    assert {"options_snapshots", "unusual_activity", "gex_levels"} <= names


def test_snapshot_upsert_key(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    row = ("2026-06-13", "close", "SPY", "2026-06-20", 600.0, "C",
           100, 50, 1.2, 1.1, 1.3, 0.18, "2026-06-13T06:10:00")
    with conn:
        conn.execute("INSERT OR REPLACE INTO options_snapshots "
                     "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
                     "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
        conn.execute("INSERT OR REPLACE INTO options_snapshots "
                     "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
                     "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", row)
    n = conn.execute("SELECT COUNT(*) FROM options_snapshots").fetchone()[0]
    conn.close()
    assert n == 1  # PK collapses the duplicate
```

- [ ] **Step 2: Run to verify failure**

Run: `cd argus && .venv/bin/python -m pytest tests/test_oi_schema.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'argus.options_intel'`

- [ ] **Step 3: Write `schema.py`** (and the empty `__init__.py`)

```python
# argus/argus/options_intel/schema.py
"""WS-1 tables (master plan §2.2). Idempotent DDL — the snapshotter calls
ensure_schema() on every run; that IS the migration mechanism for this module
(same pattern as the heartbeats table in argus.db). Columns extend the §2.2
sketch with snap_date/kind for the idempotency key — noted in dashboard/README.md.
"""
import sqlite3

_DDL = [
    """CREATE TABLE IF NOT EXISTS options_snapshots (
      snap_date TEXT NOT NULL,          -- US trading date YYYY-MM-DD
      kind TEXT NOT NULL,               -- 'preclose' | 'close'
      symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      strike REAL NOT NULL,
      type TEXT NOT NULL,               -- 'C' | 'P'
      oi INTEGER, vol INTEGER, last REAL, bid REAL, ask REAL, iv REAL,
      ts TEXT NOT NULL,
      PRIMARY KEY (snap_date, kind, symbol, expiry, strike, type)
    )""",
    "CREATE INDEX IF NOT EXISTS idx_snap_sym_date ON options_snapshots(symbol, snap_date)",
    """CREATE TABLE IF NOT EXISTS unusual_activity (
      snap_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      contract TEXT NOT NULL,           -- e.g. SPY 2026-06-20 600C
      side TEXT NOT NULL,               -- 'C' | 'P'
      expiry TEXT NOT NULL, strike REAL NOT NULL,
      score REAL NOT NULL, cross_z REAL, own_z REAL,
      persistence INTEGER NOT NULL DEFAULT 0,
      vol INTEGER, oi INTEGER, last REAL,
      basis TEXT NOT NULL,
      ts TEXT NOT NULL,
      PRIMARY KEY (snap_date, symbol, contract)
    )""",
    """CREATE TABLE IF NOT EXISTS gex_levels (
      date TEXT NOT NULL, symbol TEXT NOT NULL,
      expiry TEXT NOT NULL,
      zero_gamma REAL, call_wall REAL, put_wall REAL, total_gex REAL,
      profile_json TEXT,
      PRIMARY KEY (date, symbol)
    )""",
]


def ensure_schema(conn: sqlite3.Connection) -> None:
    with conn:
        for stmt in _DDL:
            conn.execute(stmt)
```

- [ ] **Step 4: Run to verify pass** — `cd argus && .venv/bin/python -m pytest tests/test_oi_schema.py -v` → 2 passed. Then full suite (`tests/ -v`) → 24 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_intel/__init__.py argus/argus/options_intel/schema.py argus/tests/test_oi_schema.py
git commit -m "feat(options_intel): package + WS-1 schema (snapshots, unusual, gex)"
```

---

### Task 2: Universe resolver

**Files:**
- Create: `argus/argus/options_intel/universe.py`
- Test: `argus/tests/test_oi_universe.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_oi_universe.py
import csv

from argus.db import get_conn
from argus.options_intel.universe import snapshot_universe

INDICES = ["SPY", "QQQ", "IWM", "DIA"]


def _write_bridge(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["ticker", "fetch_symbol", "conviction"])
        w.writeheader()
        w.writerows(rows)


def test_universe_indices_first_dedup_and_cap(tmp_path, monkeypatch):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    with conn:
        conn.execute("CREATE TABLE watchlist (ticker TEXT PRIMARY KEY, pinned_at TEXT, price_at_pin REAL)")
        conn.execute("INSERT INTO watchlist VALUES ('NVDA','2026-06-01',100.0)")
        conn.execute("INSERT INTO watchlist VALUES ('SPY','2026-06-01',600.0)")  # dup with index
    conn.close()
    bridge = tmp_path / "bridge_latest.csv"
    _write_bridge(bridge, [
        {"ticker": "AMD", "fetch_symbol": "AMD", "conviction": "9"},
        {"ticker": "SAAB-B", "fetch_symbol": "SAAB-B.ST", "conviction": "5"},
        {"ticker": "NVDA", "fetch_symbol": "NVDA", "conviction": "8"},  # dup with watchlist
    ])
    monkeypatch.setenv("BRIDGE_DIR", str(tmp_path))
    u = snapshot_universe(db_path=db, cap=5)
    assert u[:4] == INDICES                      # indices always first
    assert u == ["SPY", "QQQ", "IWM", "DIA", "NVDA"]  # cap=5: watchlist beats bridge


def test_universe_survives_missing_inputs(tmp_path, monkeypatch):
    db = tmp_path / "empty.db"
    monkeypatch.setenv("BRIDGE_DIR", str(tmp_path / "nope"))
    u = snapshot_universe(db_path=db, cap=50)
    assert u == INDICES  # no watchlist table, no bridge file → indices only, no crash
```

- [ ] **Step 2: Run to verify failure** (module missing), then **Step 3: write the resolver**

```python
# argus/argus/options_intel/universe.py
"""Snapshot universe: index underlyings + watchlist + today's bridge tickers.

Priority when capped: indices > watchlist (pin order) > bridge (conviction desc).
Bridge symbols use fetch_symbol (yfinance symbol). Missing inputs are skipped,
never fatal — an empty bridge day still snapshots the indices.
"""
import csv
import os
import sqlite3
from pathlib import Path
from typing import Optional, Union

from ..db import get_conn

INDEX_UNDERLYINGS = ["SPY", "QQQ", "IWM", "DIA"]


def _watchlist(db_path) -> list[str]:
    try:
        conn = get_conn(db_path)
        rows = conn.execute(
            "SELECT ticker FROM watchlist ORDER BY pinned_at").fetchall()
        conn.close()
        return [r["ticker"].upper() for r in rows]
    except sqlite3.Error:
        return []


def _bridge() -> list[str]:
    bridge_dir = os.environ.get("BRIDGE_DIR")
    if not bridge_dir:
        return []
    p = Path(bridge_dir) / "bridge_latest.csv"
    if not p.exists():
        return []
    with open(p, newline="") as f:
        rows = list(csv.DictReader(f))

    def conv(r):
        try:
            return float(r.get("conviction") or 0)
        except ValueError:
            return 0.0

    rows.sort(key=conv, reverse=True)
    return [(r.get("fetch_symbol") or r.get("ticker") or "").upper()
            for r in rows if r.get("ticker")]


def snapshot_universe(db_path: Optional[Union[str, Path]] = None, cap: int = 50) -> list[str]:
    out: list[str] = []
    for sym in INDEX_UNDERLYINGS + _watchlist(db_path) + _bridge():
        if sym and sym not in out:
            out.append(sym)
        if len(out) >= cap:
            break
    return out
```

- [ ] **Step 4: Run to verify pass** → 2 passed; full suite 26 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_intel/universe.py argus/tests/test_oi_universe.py
git commit -m "feat(options_intel): snapshot universe — indices + watchlist + bridge, capped"
```

---

### Task 3: Snapshotter

**Files:**
- Create: `argus/argus/options_intel/snapshot.py`
- Test: `argus/tests/test_oi_snapshot.py`

- [ ] **Step 1: Write the failing tests** (fetcher injected — no network in tests)

```python
# argus/tests/test_oi_snapshot.py
from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.snapshot import snapshot_symbol


def fake_chain(symbol, expiration=None):
    if symbol == "BAD":
        return {"symbol": "BAD", "error": "no chain"}
    exp = expiration or "2026-06-20"
    mk = lambda k, oi, vol: {"strike": k, "openInterest": oi, "volume": vol,
                             "lastPrice": 1.0, "bid": 0.9, "ask": 1.1,
                             "impliedVolatility": 0.2}
    return {"symbol": symbol, "expiration": exp,
            "expirations": ["2026-06-20", "2026-06-27", "2026-09-18"],
            "calls": [mk(95, 100, 10), mk(100, 200, 30), mk(130, 50, 5)],
            "puts": [mk(95, 80, 20), mk(100, 150, 40)],
            "summary": {}}


def test_snapshot_writes_rows_within_moneyness(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    n = snapshot_symbol(conn, "TEST", kind="close", snap_date="2026-06-13",
                        spot=100.0, fetch=fake_chain, max_expiries=2)
    rows = conn.execute("SELECT DISTINCT expiry FROM options_snapshots").fetchall()
    conn.close()
    assert n == 8  # 2 expiries × (calls 95,100 + puts 95,100); strike 130 = 30% OTM dropped
    assert {r["expiry"] for r in rows} == {"2026-06-20", "2026-06-27"}


def test_snapshot_idempotent_rerun(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    snapshot_symbol(conn, "TEST", "close", "2026-06-13", 100.0, fake_chain, 2)
    snapshot_symbol(conn, "TEST", "close", "2026-06-13", 100.0, fake_chain, 2)
    n = conn.execute("SELECT COUNT(*) FROM options_snapshots").fetchone()[0]
    conn.close()
    assert n == 8  # INSERT OR REPLACE — same day+kind replaces, never duplicates


def test_snapshot_bad_symbol_returns_zero(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db)
    ensure_schema(conn)
    assert snapshot_symbol(conn, "BAD", "close", "2026-06-13", None, fake_chain, 2) == 0
    conn.close()
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: write the snapshotter**

```python
# argus/argus/options_intel/snapshot.py
"""Chain snapshotter (master plan WS-1.1).

CLI:  python -m argus.options_intel.snapshot --kind preclose|close

Per symbol: nearest `max_expiries` expirations, strikes within ±20% of spot,
batched INSERT OR REPLACE keyed (snap_date, kind, symbol, expiry, strike, type).
One bad symbol never kills the run. Heartbeat: options-snapshot-<kind>.

Catch-up reality (deviation from master plan §2.4, documented in the plan):
yfinance serves only the CURRENT chain — a missed night cannot be backfilled
the next day. A late same-day run is still valid for that session; the unusual
scorer tolerates gaps by design (own-baseline needs ≥10 non-zero-vol days,
not consecutive days).
"""
import argparse
import sys
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..data import get_options_chain, get_quote
from ..db import get_conn, heartbeat
from .schema import ensure_schema
from .universe import snapshot_universe

MONEYNESS_BAND = 0.20


def us_trading_date(now: datetime | None = None) -> str:
    """The US session date this snapshot belongs to (ET calendar date)."""
    et = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    return et.date().isoformat()


def snapshot_symbol(conn, symbol: str, kind: str, snap_date: str,
                    spot: float | None, fetch=get_options_chain,
                    max_expiries: int = 4) -> int:
    first = fetch(symbol)
    if "error" in first:
        return 0
    expiries = list(first.get("expirations") or [])[:max_expiries]
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for i, exp in enumerate(expiries):
        chain = first if i == 0 and first.get("expiration") == exp else fetch(symbol, exp)
        if "error" in chain:
            continue
        for side, key in (("C", "calls"), ("P", "puts")):
            for r in chain.get(key, []):
                k = r.get("strike")
                if k is None:
                    continue
                if spot and abs(k / spot - 1.0) > MONEYNESS_BAND:
                    continue
                rows.append((snap_date, kind, symbol.upper(), exp, float(k), side,
                             int(r.get("openInterest") or 0), int(r.get("volume") or 0),
                             r.get("lastPrice"), r.get("bid"), r.get("ask"),
                             r.get("impliedVolatility"), ts))
    with conn:
        conn.executemany(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    return len(rows)


def run(kind: str) -> int:
    conn = get_conn()
    ensure_schema(conn)
    snap_date = us_trading_date()
    universe = snapshot_universe()
    total, failed = 0, []
    for sym in universe:
        try:
            q = get_quote(sym) or {}
            n = snapshot_symbol(conn, sym, kind, snap_date, q.get("price"))
            total += n
            if n == 0:
                failed.append(sym)
        except Exception:
            failed.append(sym)
        time.sleep(0.5)  # be polite to yfinance
    conn.close()
    detail = f"{total} rows, {len(universe)} symbols, {snap_date}"
    if failed:
        detail += f", failed: {','.join(failed[:8])}"
    heartbeat(f"options-snapshot-{kind}", "error" if total == 0 else "ok", detail)
    return 0 if total > 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=["preclose", "close"], required=True)
    args = ap.parse_args()
    return run(args.kind)


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 29 passed.

- [ ] **Step 5: One real-network smoke (single symbol, scratch DB — NOT the live DB):**

```bash
cd argus && ARGUS_DB=/tmp/oi_smoke.db .venv/bin/python -c "
from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.snapshot import snapshot_symbol, us_trading_date
from argus.data import get_quote
conn = get_conn(); ensure_schema(conn)
q = get_quote('SPY') or {}
n = snapshot_symbol(conn, 'SPY', 'close', us_trading_date(), q.get('price'))
print('rows:', n)
print(conn.execute('SELECT COUNT(DISTINCT expiry) FROM options_snapshots').fetchone()[0], 'expiries')
conn.close()"
```
Expected: `rows:` in the hundreds, `4 expiries` (weekend: yesterday's chain — fine). Paste output.

- [ ] **Step 6: Commit**

```bash
git add argus/argus/options_intel/snapshot.py argus/tests/test_oi_snapshot.py
git commit -m "feat(options_intel): chain snapshotter — moneyness-banded, idempotent, heartbeated"
```

---

### Task 4: Relative-unusual scorer

**Files:**
- Create: `argus/argus/options_intel/unusual.py`
- Test: `argus/tests/test_oi_unusual.py`

The quant-adopted design (master plan WS-1.2), exactly: eligibility `OI ≥ 50`; metric `log1p(vol)`; **cross-sectional** robust z vs same-expiry contracts within ±2% moneyness (median + MAD, MAD scaled ×1.4826, MAD=0 → z=0); **own-baseline** robust z vs that contract's prior `close` snapshots, requiring ≥10 non-zero-volume days else the term is suppressed and the basis says "insufficient history"; `score = max(cross_z, own_z_or_-inf_suppressed)` + 0.5 persistence bonus if the contract scored ≥ 3.0 the previous session; rows with `score ≥ 2.0` persist to `unusual_activity` (top 15 per symbol/side), basis in plain words.

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_oi_unusual.py
from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.unusual import robust_z, score_symbol


def _snap(conn, snap_date, symbol, strike, side, oi, vol, expiry="2026-06-20", spot=100.0):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,?,1.0,0.9,1.1,0.2,?)",
            (snap_date, "close", symbol, expiry, strike, side, oi, vol, snap_date))


def test_robust_z_flags_outlier_not_noise():
    assert robust_z(50.0, [1.0, 1.1, 0.9, 1.0, 1.05]) > 3
    assert abs(robust_z(1.0, [1.0, 1.1, 0.9, 1.0, 1.05])) < 1


def test_robust_z_mad_zero_guard():
    assert robust_z(5.0, [2.0, 2.0, 2.0]) == 0.0


def test_score_symbol_outlier_beats_low_oi_noise(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    # neighbours at similar moneyness, quiet volume
    for k in (98.0, 99.0, 100.0, 101.0, 102.0):
        _snap(conn, "2026-06-13", "TEST", k, "C", oi=500, vol=20)
    # the genuinely unusual contract: eligible OI, huge volume
    _snap(conn, "2026-06-13", "TEST", 99.5, "C", oi=500, vol=5000)
    # low-OI lottery ticket with big vol/OI ratio — must NOT rank (ineligible)
    _snap(conn, "2026-06-13", "TEST", 100.5, "C", oi=10, vol=400)
    n = score_symbol(conn, "TEST", "2026-06-13", spot=100.0)
    rows = conn.execute(
        "SELECT * FROM unusual_activity ORDER BY score DESC").fetchall()
    conn.close()
    assert n >= 1
    assert rows[0]["strike"] == 99.5
    assert all(r["strike"] != 100.5 for r in rows)          # OI<50 excluded
    assert "insufficient history" in rows[0]["basis"]        # no own-baseline yet


def test_own_baseline_and_persistence(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    # 12 prior sessions of quiet volume for one contract (own baseline)
    for i in range(1, 13):
        _snap(conn, f"2026-05-{i:02d}", "TEST", 100.0, "C", oi=500, vol=20)
        _snap(conn, f"2026-05-{i:02d}", "TEST", 101.0, "C", oi=500, vol=20)
    # yesterday: the contract was already unusual (for persistence)
    _snap(conn, "2026-06-12", "TEST", 100.0, "C", oi=500, vol=4000)
    _snap(conn, "2026-06-12", "TEST", 101.0, "C", oi=500, vol=20)
    score_symbol(conn, "TEST", "2026-06-12", spot=100.0)
    # today: unusual again
    _snap(conn, "2026-06-13", "TEST", 100.0, "C", oi=500, vol=5000)
    _snap(conn, "2026-06-13", "TEST", 101.0, "C", oi=500, vol=20)
    score_symbol(conn, "TEST", "2026-06-13", spot=100.0)
    row = conn.execute(
        "SELECT * FROM unusual_activity WHERE snap_date='2026-06-13' AND strike=100.0"
    ).fetchone()
    conn.close()
    assert row is not None
    assert row["own_z"] is not None and row["own_z"] > 3   # baseline existed
    assert row["persistence"] == 1
    assert "2nd day" in row["basis"]
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: write the scorer**

```python
# argus/argus/options_intel/unusual.py
"""Relative-unusual scorer (master plan WS-1.2, quant-adopted design).

Replaces the naive vol>2×OI filter. Run after the close snapshot:
    python -m argus.options_intel.unusual          (scores all of today's snapshot symbols)
"""
import math
import statistics
import sys
from datetime import datetime, timezone

from ..db import get_conn, heartbeat
from .schema import ensure_schema

MIN_OI = 50
MONEYNESS_NEIGHBOURHOOD = 0.02
MIN_BASELINE_DAYS = 10
SCORE_FLOOR = 2.0
PERSIST_THRESHOLD = 3.0
TOP_N = 15


def robust_z(value: float, baseline: list[float]) -> float:
    if len(baseline) < 3:
        return 0.0
    med = statistics.median(baseline)
    mad = statistics.median(abs(x - med) for x in baseline)
    if mad == 0:
        return 0.0
    return (value - med) / (1.4826 * mad)


def _contract(symbol, expiry, strike, side) -> str:
    return f"{symbol} {expiry} {strike:g}{side}"


def score_symbol(conn, symbol: str, snap_date: str, spot: float | None) -> int:
    rows = conn.execute(
        "SELECT * FROM options_snapshots WHERE symbol=? AND snap_date=? AND kind='close'",
        (symbol, snap_date)).fetchall()
    if not rows or not spot:
        return 0
    eligible = [r for r in rows if (r["oi"] or 0) >= MIN_OI]
    scored = []
    for r in eligible:
        metric = math.log1p(r["vol"] or 0)
        mny = r["strike"] / spot
        neighbours = [math.log1p(n["vol"] or 0) for n in eligible
                      if n["expiry"] == r["expiry"] and n["type"] == r["type"]
                      and n["strike"] != r["strike"]
                      and abs(n["strike"] / spot - mny) <= MONEYNESS_NEIGHBOURHOOD]
        cross = robust_z(metric, neighbours)
        hist = [math.log1p(h["vol"]) for h in conn.execute(
            "SELECT vol FROM options_snapshots WHERE symbol=? AND expiry=? AND strike=? "
            "AND type=? AND kind='close' AND snap_date<? AND vol>0 ORDER BY snap_date",
            (symbol, r["expiry"], r["strike"], r["type"], snap_date)).fetchall()]
        own = robust_z(metric, hist) if len(hist) >= MIN_BASELINE_DAYS else None
        score = max(cross, own) if own is not None else cross
        contract = _contract(symbol, r["expiry"], r["strike"], r["type"])
        prev = conn.execute(
            "SELECT score FROM unusual_activity WHERE symbol=? AND contract=? "
            "AND snap_date<? ORDER BY snap_date DESC LIMIT 1",
            (symbol, contract, snap_date)).fetchone()
        persistence = 1 if prev and prev["score"] >= PERSIST_THRESHOLD else 0
        score += 0.5 * persistence
        if score < SCORE_FLOOR:
            continue
        parts = [f"{cross:.1f} robust-σ vs similar-moneyness strikes"]
        parts.append(f"{own:.1f}σ vs own {len(hist)}-day baseline" if own is not None
                     else "insufficient history for own-baseline")
        if persistence:
            parts.append("2nd day")
        scored.append((r, score, cross, own, persistence, contract, "; ".join(parts)))

    scored.sort(key=lambda t: t[1], reverse=True)
    kept, per_side = [], {"C": 0, "P": 0}
    for t in scored:
        side = t[0]["type"]
        if per_side[side] < TOP_N:
            kept.append(t)
            per_side[side] += 1
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with conn:
        conn.execute("DELETE FROM unusual_activity WHERE symbol=? AND snap_date=?",
                     (symbol, snap_date))
        conn.executemany(
            "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,strike,"
            "score,cross_z,own_z,persistence,vol,oi,last,basis,ts) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [(snap_date, symbol, c, r["type"], r["expiry"], r["strike"],
              round(s, 2), round(cz, 2), round(oz, 2) if oz is not None else None,
              p, r["vol"], r["oi"], r["last"], basis, ts)
             for (r, s, cz, oz, p, c, basis) in kept])
    return len(kept)


def main() -> int:
    from ..data import get_quote
    conn = get_conn()
    ensure_schema(conn)
    latest = conn.execute(
        "SELECT MAX(snap_date) AS d FROM options_snapshots WHERE kind='close'").fetchone()
    if not latest or not latest["d"]:
        heartbeat("options-unusual", "error", "no close snapshots to score")
        conn.close()
        return 1
    snap_date = latest["d"]
    symbols = [r["symbol"] for r in conn.execute(
        "SELECT DISTINCT symbol FROM options_snapshots WHERE snap_date=? AND kind='close'",
        (snap_date,)).fetchall()]
    total = 0
    for sym in symbols:
        q = get_quote(sym) or {}
        total += score_symbol(conn, sym, snap_date, q.get("price"))
    conn.close()
    heartbeat("options-unusual", "ok", f"{total} rows, {len(symbols)} symbols, {snap_date}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify pass** → 4 passed; full suite 33 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_intel/unusual.py argus/tests/test_oi_unusual.py
git commit -m "feat(options_intel): robust relative-unusual scorer — median/MAD, own-baseline, persistence"
```

---

### Task 5: GEX engine

**Files:**
- Create: `argus/argus/options_intel/gex.py`
- Test: `argus/tests/test_oi_gex.py`

Quant-adopted design (master plan WS-1.5): Black-Scholes gamma re-evaluated at each candidate spot on a ±15% sweep; `GEX(S′) = Σ gamma(S′,K,T,σ)·OI·100·S′²·0.01·dealer_sign`; zero-gamma = interpolated zero crossing; walls = strike argmax |gamma·OI| per side at current spot; **expiry = nearest with DTE ≥ 1** (OI-based GEX invalid for 0DTE); dealer_sign is the documented assumption table, not a fact.

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_oi_gex.py
import json

from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.gex import bs_gamma, compute_gex


def _snap(conn, symbol, expiry, strike, side, oi, iv=0.2, snap_date="2026-06-13"):
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO options_snapshots "
            "(snap_date,kind,symbol,expiry,strike,type,oi,vol,last,bid,ask,iv,ts) "
            "VALUES (?,?,?,?,?,?,?,100,1.0,0.9,1.1,?,?)",
            (snap_date, "close", symbol, expiry, strike, side, oi, iv, snap_date))


def test_bs_gamma_peaks_atm():
    atm = bs_gamma(100, 100, 30 / 365, 0.2)
    otm = bs_gamma(100, 130, 30 / 365, 0.2)
    assert atm > 0 and atm > otm * 5


def test_compute_gex_skips_zero_dte_and_finds_flip(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    # a 0DTE expiry that MUST be skipped
    _snap(conn, "SPY", "2026-06-13", 100.0, "C", oi=99999)
    # the proper ≥1DTE expiry: symmetric call/put book around spot
    for k in (90.0, 95.0, 100.0, 105.0, 110.0):
        _snap(conn, "SPY", "2026-07-17", k, "C", oi=1000)
        _snap(conn, "SPY", "2026-07-17", k, "P", oi=1000)
    res = compute_gex(conn, "SPY", "2026-06-13", spot=100.0,
                      today="2026-06-13")
    row = conn.execute("SELECT * FROM gex_levels").fetchone()
    conn.close()
    assert res is not None
    assert row["expiry"] == "2026-07-17"            # 0DTE skipped
    # symmetric book with sign(C)=-1, sign(P)=+1 → GEX ≈ 0 at every S' → flip ≈ spot region
    assert row["zero_gamma"] is not None
    assert 85.0 <= row["zero_gamma"] <= 115.0
    assert row["call_wall"] in (90.0, 95.0, 100.0, 105.0, 110.0)
    profile = json.loads(row["profile_json"])
    assert len(profile["spots"]) == len(profile["gex"]) == 61


def test_compute_gex_no_eligible_expiry(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    _snap(conn, "SPY", "2026-06-13", 100.0, "C", oi=100)   # only 0DTE
    assert compute_gex(conn, "SPY", "2026-06-13", 100.0, today="2026-06-13") is None
    conn.close()
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: write the engine**

```python
# argus/argus/options_intel/gex.py
"""GEX engine (master plan WS-1.5, quant-corrected formula).

DEALER-SIGN CONVENTION (assumption, not a fact — SpotGamma-style
"customers buy calls and puts from dealers"):

    | side | dealer position | sign in GEX sum |
    |------|-----------------|-----------------|
    | call | short           | -1              |
    | put  | short           | +1              |

The levels card must state "model assumes dealer positioning; levels are
estimates, not measurements". OI-based GEX is valid only for DTE >= 1 —
the profile uses the nearest expiry with DTE >= 1 and the UI labels it
"OI-based — reflects overnight book, not today's flow".

CLI:  python -m argus.options_intel.gex   (computes for SPY/QQQ/IWM/DIA)
"""
import json
import math
import sys
from datetime import date, datetime, timezone

from scipy.stats import norm

from ..db import get_conn, heartbeat
from .schema import ensure_schema
from .universe import INDEX_UNDERLYINGS

DEALER_SIGN = {"C": -1.0, "P": +1.0}
SWEEP_PCT = 0.15
SWEEP_POINTS = 61
DEFAULT_IV = 0.20


def bs_gamma(s: float, k: float, t: float, sigma: float) -> float:
    if s <= 0 or k <= 0 or t <= 0 or sigma <= 0:
        return 0.0
    d1 = (math.log(s / k) + 0.5 * sigma * sigma * t) / (sigma * math.sqrt(t))
    return float(norm.pdf(d1) / (s * sigma * math.sqrt(t)))


def _nearest_eligible_expiry(conn, symbol: str, snap_date: str, today: str) -> str | None:
    rows = conn.execute(
        "SELECT DISTINCT expiry FROM options_snapshots "
        "WHERE symbol=? AND snap_date=? AND kind='close' ORDER BY expiry",
        (symbol, snap_date)).fetchall()
    for r in rows:
        dte = (date.fromisoformat(r["expiry"]) - date.fromisoformat(today)).days
        if dte >= 1:
            return r["expiry"]
    return None


def compute_gex(conn, symbol: str, snap_date: str, spot: float | None,
                today: str | None = None) -> dict | None:
    today = today or date.today().isoformat()
    if not spot:
        return None
    expiry = _nearest_eligible_expiry(conn, symbol, snap_date, today)
    if not expiry:
        return None
    rows = conn.execute(
        "SELECT strike, type, oi, iv FROM options_snapshots "
        "WHERE symbol=? AND snap_date=? AND kind='close' AND expiry=? AND oi>0",
        (symbol, snap_date, expiry)).fetchall()
    if not rows:
        return None
    t_years = max((date.fromisoformat(expiry) - date.fromisoformat(today)).days, 1) / 365.0

    spots = [spot * (1 - SWEEP_PCT + 2 * SWEEP_PCT * i / (SWEEP_POINTS - 1))
             for i in range(SWEEP_POINTS)]
    gex_curve = []
    for sp in spots:
        total = 0.0
        for r in rows:
            iv = r["iv"] if r["iv"] and r["iv"] > 0 else DEFAULT_IV
            total += (bs_gamma(sp, r["strike"], t_years, iv) * (r["oi"] or 0)
                      * 100 * sp * sp * 0.01 * DEALER_SIGN[r["type"]])
        gex_curve.append(total)

    zero = None
    for i in range(1, len(spots)):
        a, b = gex_curve[i - 1], gex_curve[i]
        if a == 0 or (a < 0) != (b < 0):
            zero = spots[i - 1] if b == a else spots[i - 1] + (spots[i] - spots[i - 1]) * (-a) / (b - a)
            break

    def wall(side: str) -> float | None:
        best, best_v = None, -1.0
        for r in rows:
            if r["type"] != side:
                continue
            iv = r["iv"] if r["iv"] and r["iv"] > 0 else DEFAULT_IV
            v = abs(bs_gamma(spot, r["strike"], t_years, iv) * (r["oi"] or 0))
            if v > best_v:
                best, best_v = r["strike"], v
        return best

    mid = SWEEP_POINTS // 2
    out = {"date": snap_date, "symbol": symbol, "expiry": expiry,
           "zero_gamma": round(zero, 2) if zero is not None else None,
           "call_wall": wall("C"), "put_wall": wall("P"),
           "total_gex": round(gex_curve[mid], 0),
           "profile_json": json.dumps({"spots": [round(s, 2) for s in spots],
                                       "gex": [round(g, 0) for g in gex_curve]})}
    with conn:
        conn.execute(
            "INSERT OR REPLACE INTO gex_levels "
            "(date,symbol,expiry,zero_gamma,call_wall,put_wall,total_gex,profile_json) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (out["date"], out["symbol"], out["expiry"], out["zero_gamma"],
             out["call_wall"], out["put_wall"], out["total_gex"], out["profile_json"]))
    return out


def main() -> int:
    from ..data import get_quote
    conn = get_conn()
    ensure_schema(conn)
    latest = conn.execute(
        "SELECT MAX(snap_date) AS d FROM options_snapshots WHERE kind='close'").fetchone()
    if not latest or not latest["d"]:
        heartbeat("options-gex", "error", "no close snapshots")
        conn.close()
        return 1
    done = []
    for sym in INDEX_UNDERLYINGS:
        q = get_quote(sym) or {}
        if compute_gex(conn, sym, latest["d"], q.get("price")):
            done.append(sym)
    conn.close()
    heartbeat("options-gex", "ok" if done else "error",
              f"levels for {','.join(done) or 'none'} @ {latest['d']}")
    return 0 if done else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 36 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/options_intel/gex.py argus/tests/test_oi_gex.py
git commit -m "feat(options_intel): GEX engine — spot-sweep profile, zero-gamma flip, walls, documented dealer-sign"
```

---

### Task 6: API endpoints + closed-market flow fallback

**Files:**
- Create: `argus/argus/options_intel/clock.py` (tiny US-session helper for Python)
- Modify: `argus/argus/flow/options_flow.py` (snapshot fallback in `flow_summary`)
- Modify: `argus/argus/api/routes.py` (add `/api/unusual/{symbol}`, `/api/gex/{symbol}`)
- Test: `argus/tests/test_oi_endpoints.py`

- [ ] **Step 1: Write `clock.py`** (mirrors `dashboard/lib/market-clock.ts`; no test needed beyond endpoint tests — it is three lines of zoneinfo math):

```python
# argus/argus/options_intel/clock.py
"""US session state (mirror of dashboard/lib/market-clock.ts; no holidays)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo


def us_market_open(now: datetime | None = None) -> bool:
    et = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("America/New_York"))
    if et.weekday() >= 5:
        return False
    mins = et.hour * 60 + et.minute
    return 9 * 60 + 30 <= mins < 16 * 60
```

- [ ] **Step 2: Write the failing endpoint tests**

```python
# argus/tests/test_oi_endpoints.py
import os

from fastapi.testclient import TestClient


def _seed(db):
    from argus.db import get_conn
    from argus.options_intel.schema import ensure_schema
    conn = get_conn(db)
    ensure_schema(conn)
    with conn:
        conn.execute(
            "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,strike,"
            "score,cross_z,own_z,persistence,vol,oi,last,basis,ts) VALUES "
            "('2026-06-12','SPY','SPY 2026-06-20 600C','C','2026-06-20',600.0,"
            "3.8,3.8,NULL,0,5000,500,1.25,'3.8 robust-σ vs similar-moneyness strikes; "
            "insufficient history for own-baseline','2026-06-12T20:10:00')")
        conn.execute(
            "INSERT OR REPLACE INTO gex_levels VALUES "
            "('2026-06-12','SPY','2026-06-20',598.5,605.0,590.0,1.2e9,'{}')")
    conn.close()


def test_unusual_and_gex_endpoints(tmp_path, monkeypatch):
    db = str(tmp_path / "t.db")
    monkeypatch.setenv("ARGUS_DB", db)
    _seed(db)
    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/unusual/SPY")
    assert r.status_code == 200
    body = r.json()
    assert body["as_of"] == "2026-06-12"
    assert body["rows"][0]["score"] == 3.8
    g = c.get("/api/gex/SPY")
    assert g.status_code == 200
    assert g.json()["zero_gamma"] == 598.5
    assert "OI-based" in g.json()["caveat"]
    assert c.get("/api/gex/ZZZQ").status_code == 404
```

(Note: `argus.main` may already be imported by an earlier test in the session — if the
`ARGUS_DB` monkeypatch doesn't bite because routes resolve the conn per request via
`get_conn()` it WILL bite, since `get_conn()` reads the env lazily. If the test fails on
import-order grounds, isolate with `subprocess` like `test_heartbeat_cli.py` does and
report the adaptation.)

- [ ] **Step 3: Add the routes** in `argus/argus/api/routes.py`, next to `/api/heartbeats`, with the import `from ..options_intel.schema import ensure_schema` placed with the relative imports:

```python
    @app.get("/api/unusual/{symbol}")
    def unusual(symbol: str):
        conn = get_conn()
        ensure_schema(conn)
        try:
            latest = conn.execute(
                "SELECT MAX(snap_date) AS d FROM unusual_activity WHERE symbol=?",
                (symbol.upper(),)).fetchone()
            if not latest or not latest["d"]:
                raise HTTPException(404, "no scored snapshots for symbol")
            rows = conn.execute(
                "SELECT * FROM unusual_activity WHERE symbol=? AND snap_date=? "
                "ORDER BY score DESC", (symbol.upper(), latest["d"])).fetchall()
            return {"symbol": symbol.upper(), "as_of": latest["d"],
                    "rows": [dict(r) for r in rows]}
        finally:
            conn.close()

    @app.get("/api/gex/{symbol}")
    def gex(symbol: str):
        conn = get_conn()
        ensure_schema(conn)
        try:
            row = conn.execute(
                "SELECT * FROM gex_levels WHERE symbol=? ORDER BY date DESC LIMIT 1",
                (symbol.upper(),)).fetchone()
            if not row:
                raise HTTPException(404, "no gex levels for symbol")
            out = dict(row)
            out["caveat"] = ("OI-based — reflects overnight book, not today's flow; "
                             "model assumes dealer positioning (estimates, not measurements)")
            return out
        finally:
            conn.close()
```

- [ ] **Step 4: Closed-market fallback in `flow_summary`.** In `argus/argus/flow/options_flow.py`, after the naive `unusual_calls`/`unusual_puts` computation and before the `return`, add (imports `from ..db import get_conn`, `from ..options_intel.clock import us_market_open` at top):

```python
    # Closed-market fallback (B6 completion): live same-day volume is meaningless
    # overnight — serve the latest SCORED close snapshot instead, labelled.
    scored_as_of = None
    if not us_market_open():
        try:
            conn = get_conn()
            latest = conn.execute(
                "SELECT MAX(snap_date) AS d FROM unusual_activity WHERE symbol=?",
                (symbol.upper(),)).fetchone()
            if latest and latest["d"]:
                rows = conn.execute(
                    "SELECT * FROM unusual_activity WHERE symbol=? AND snap_date=? "
                    "ORDER BY score DESC", (symbol.upper(), latest["d"])).fetchall()
                if rows:
                    scored_as_of = latest["d"]
                    to_rec = lambda r: {
                        "strike": r["strike"], "expiry": r["expiry"],
                        "volume": r["vol"], "openInterest": r["oi"],
                        "lastPrice": r["last"], "score": r["score"], "basis": r["basis"]}
                    unusual_calls_records = [to_rec(r) for r in rows if r["side"] == "C"][:5]
                    unusual_puts_records = [to_rec(r) for r in rows if r["side"] == "P"][:5]
            conn.close()
        except Exception:
            scored_as_of = None  # fall through to live lists; never break the panel
```

and change the returned dict: when `scored_as_of` is set, `unusual_calls_top`/`unusual_puts_top` use the snapshot records and the payload gains `"unusual_as_of": scored_as_of` (additive key — `None` when live). Keep everything else identical (payload stays backward compatible).

- [ ] **Step 5: Run** — `cd argus && .venv/bin/python -m pytest tests/test_oi_endpoints.py -v` → green; full suite → 37 passed. Then commit:

```bash
git add argus/argus/options_intel/clock.py argus/argus/flow/options_flow.py argus/argus/api/routes.py argus/tests/test_oi_endpoints.py
git commit -m "feat(options_intel): /api/unusual + /api/gex endpoints; flow serves scored close snapshot overnight"
```

(Live `curl :8088` checks are deferred to integration — the launchd service runs main-checkout code.)

---

### Task 7: Dashboard — scored rows, as-of banner, GEX card

**Files:**
- Modify: `dashboard/components/ticker/OptionsPanel.tsx`
- Create: `dashboard/components/ticker/GexCard.tsx`
- Modify: `dashboard/app/t/[ticker]/page.tsx` (render GexCard for index tickers)

- [ ] **Step 1: OptionsPanel additions** (READ the file first; all changes additive):
  1. Extend `UnusualRow` with `score?: unknown; basis?: unknown;` and the payload type with `unusual_as_of?: string | null`.
  2. In `UnusualTable`, when any row has a numeric `score`, render a leading `σ` column: `{num(row.score) !== null ? num(row.score)!.toFixed(1) : "—"}` with `title={String(row.basis ?? "")}` on the cell (hover shows the plain-words basis).
  3. When `data.unusual_as_of` is set, render ABOVE the unusual tables (replacing the Task A-7 explanation paragraph in that case — keep the paragraph only when `unusual_as_of` is absent AND the closed+empty condition holds):

```tsx
          <p className="font-mono text-[11px] text-muted border-t border-line pt-2">
            as of {data.unusual_as_of} close (US) — robust-score (beta), validation pending
          </p>
```

- [ ] **Step 2: GexCard**

```tsx
// dashboard/components/ticker/GexCard.tsx
"use client";

import useSWR from "swr";
import Panel from "@/components/ui/Panel";

interface GexLevels {
  date: string; symbol: string; expiry: string;
  zero_gamma: number | null; call_wall: number | null; put_wall: number | null;
  total_gex: number | null; caveat: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

export default function GexCard({ ticker }: { ticker: string }) {
  const { data, error } = useSWR<GexLevels>(`/api/argus/gex/${ticker}`, fetcher, {
    refreshInterval: 300_000,
    shouldRetryOnError: false,
  });
  if (error) return null; // 404 = no levels yet (first close snapshot pending) — card simply absent
  if (!data) return null;
  const row = (label: string, v: number | null) => (
    <div className="flex justify-between font-mono text-[12px] tabular-nums">
      <span className="text-muted">{label}</span>
      <span className="text-foreground">{v !== null ? v.toFixed(2) : "—"}</span>
    </div>
  );
  return (
    <Panel title={`Gamma levels · ${data.expiry}`}>
      <div className="space-y-1">
        {row("zero gamma", data.zero_gamma)}
        {row("call wall", data.call_wall)}
        {row("put wall", data.put_wall)}
        <p className="font-mono text-[10px] text-muted pt-1 border-t border-line">
          {data.caveat} · {data.date}
        </p>
      </div>
    </Panel>
  );
}
```

(If `Panel`'s API differs from this usage, adapt to the real API as established in B-0 Task 6 and report.)

- [ ] **Step 3: Render it** in `dashboard/app/t/[ticker]/page.tsx`: for `["SPY","QQQ","IWM","DIA"].includes(ticker.toUpperCase())`, render `<GexCard ticker={ticker} />` adjacent to the OptionsPanel (follow the page's existing card layout).

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npx vitest run` 45 passed (no new unit surface — the new code is fetch+render). Dev server (port 3100, `ARGUS_DB=/Users/josephstorey/Market_Analyse/argus.db BRIDGE_DIR=/Users/josephstorey/Market_Analyse/reports`): `/t/SPY` shows the GexCard absent (404 — no levels yet; correct designed state) and the options panel unchanged for live data. The full as-of/scored path is verifiable only after the first close snapshot lands — note as deferred-to-first-run.

- [ ] **Step 5: Commit**

```bash
git add dashboard/components/ticker/OptionsPanel.tsx dashboard/components/ticker/GexCard.tsx "dashboard/app/t/[ticker]/page.tsx"
git commit -m "feat(dashboard): scored unusual rows + as-of banner; GEX levels card on index tickers"
```

---

### Task 8: Scheduling — two plists + close-job chain

**Files:**
- Create: `scripts/com.argus.options-snapshot-preclose.plist`
- Create: `scripts/com.argus.options-snapshot-close.plist`
- Create: `scripts/options_close_job.sh` (mode 755)
- Modify: `scripts/README.md` (two rows)

- [ ] **Step 1: The close-job chain script** (snapshot → score → gex; each step independent, wrapper provides env/caffeinate/heartbeat envelope per job):

```zsh
#!/usr/bin/env zsh
# options_close_job.sh — close snapshot, then scorer, then GEX (master plan WS-1).
# Runs through job_wrapper.sh; each sub-step also writes its own heartbeat.
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PY="$REPO/argus/.venv/bin/python"
cd "$REPO/argus"
"$PY" -m argus.options_intel.snapshot --kind close
"$PY" -m argus.options_intel.unusual
"$PY" -m argus.options_intel.gex
```

- [ ] **Step 2: The plists** (committed to `scripts/` as the canonical copies; the controller installs them into `~/Library/LaunchAgents/` at integration). Pre-close — 05:50 local weekdays (≈15:50 ET during AEST↔EDT; pmset pre-wake at 05:45 is already active):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.argus.options-snapshot-preclose</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/zsh</string>
        <string>/Users/josephstorey/Market_Analyse/scripts/job_wrapper.sh</string>
        <string>options-preclose</string>
        <string>/Users/josephstorey/Market_Analyse/argus/.venv/bin/python</string>
        <string>-m</string><string>argus.options_intel.snapshot</string>
        <string>--kind</string><string>preclose</string>
    </array>
    <key>WorkingDirectory</key><string>/Users/josephstorey/Market_Analyse/argus</string>
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>5</integer><key>Minute</key><integer>50</integer></dict>
        <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>5</integer><key>Minute</key><integer>50</integer></dict>
        <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>5</integer><key>Minute</key><integer>50</integer></dict>
        <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>5</integer><key>Minute</key><integer>50</integer></dict>
        <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>5</integer><key>Minute</key><integer>50</integer></dict>
    </array>
    <key>StandardOutPath</key><string>/tmp/argus-options-preclose.log</string>
    <key>StandardErrorPath</key><string>/tmp/argus-options-preclose.err</string>
</dict>
</plist>
```

Close job — same structure, Label `com.argus.options-snapshot-close`, 06:10, ProgramArguments = wrapper + `options-close` + `/bin/zsh` + `/Users/josephstorey/Market_Analyse/scripts/options_close_job.sh`, logs `/tmp/argus-options-close.{log,err}`. (Write the full file — copy the structure above with those substitutions.)

**Timing note for the plist comments:** Tue–Sat 05:50/06:10 AEST would be the strictly-correct ET weekday mapping (Mon US close = Tue Sydney morning); the master plan and the pmset wake both use Mon–Fri local, accepting that Monday's local run hits the *Friday* US session (idempotent same-date re-snapshot — harmless) and Saturday's US-Friday close is captured by Saturday... it is NOT (no Saturday run). Net effect: Friday's US close snapshot is taken Saturday 06:10 *only if* the user's machine ran the Monday 05:50 job against stale data. **Decision (keep simple, document):** schedule Tue–Sat (Weekday 2–6) so each run lands the morning after a US session: Tue run ← Mon US session, …, Sat run ← Fri US session. Use Weekday integers 2,3,4,5,6 in BOTH plists, contradicting the sketch above — the sketch shows the structure, the Weekday set is 2–6. The pmset wake (MTWRF) misses Saturday: the Sat 06:10 run fires only if the machine is awake — accepted gap (Friday close otherwise missed; heartbeats surface it; user can extend pmset later).

- [ ] **Step 3: `scripts/README.md`** — add two table rows:

```markdown
| `options_close_job.sh` | close chain snapshot → unusual scorer → GEX | `com.argus.options-snapshot-close` 06:10 local Tue–Sat |
| (module) `argus.options_intel.snapshot --kind preclose` | pre-close chain snapshot | `com.argus.options-snapshot-preclose` 05:50 local Tue–Sat |
```

- [ ] **Step 4: Verify** — `plutil -lint scripts/com.argus.options-snapshot-*.plist` → both OK; `zsh -n scripts/options_close_job.sh` → clean; `chmod +x scripts/options_close_job.sh` and confirm 755. Do NOT bootstrap — controller does at integration.

- [ ] **Step 5: Commit**

```bash
git add scripts/com.argus.options-snapshot-preclose.plist scripts/com.argus.options-snapshot-close.plist scripts/options_close_job.sh scripts/README.md
git commit -m "feat(scripts): options snapshot/score/gex jobs — Tue–Sat pre-close + close chain via wrapper"
```

---

### Task 9: Validation labelling tool (acceptance path for the scorer)

**Files:**
- Create: `argus/argus/options_intel/label_sheet.py`
- Test: `argus/tests/test_oi_label_sheet.py`

The master plan's acceptance ("on a hand-labelled validation week, top-ranked rows must be genuinely unusual") is **calendar-gated** — it needs ≥5 sessions of snapshots that cannot exist at build time. This task ships the tooling; the panel's scored view carries "robust-score (beta), validation pending" (Task 7) until the user signs off a labelled week.

- [ ] **Step 1: Failing test**

```python
# argus/tests/test_oi_label_sheet.py
import csv

from argus.db import get_conn
from argus.options_intel.schema import ensure_schema
from argus.options_intel.label_sheet import write_sheet


def test_sheet_mixes_top_and_random_without_leaking_rank(tmp_path):
    db = tmp_path / "t.db"
    conn = get_conn(db); ensure_schema(conn)
    with conn:
        for i in range(30):
            conn.execute(
                "INSERT INTO unusual_activity (snap_date,symbol,contract,side,expiry,"
                "strike,score,cross_z,own_z,persistence,vol,oi,last,basis,ts) VALUES "
                "('2026-06-12','SPY',?,'C','2026-06-20',?,?,?,NULL,0,100,500,1.0,'b','t')",
                (f"SPY 2026-06-20 {600+i}C", 600.0 + i, 5.0 - i * 0.1, 5.0 - i * 0.1))
        for i in range(40):
            conn.execute(
                "INSERT OR REPLACE INTO options_snapshots (snap_date,kind,symbol,expiry,"
                "strike,type,oi,vol,last,bid,ask,iv,ts) VALUES "
                "('2026-06-12','close','SPY','2026-06-20',?, 'C', 200, 10,1,0.9,1.1,0.2,'t')",
                (500.0 + i,))
    out = tmp_path / "sheet.csv"
    write_sheet(conn, out, top_n=10, random_n=10, seed=42)
    conn.close()
    rows = list(csv.DictReader(open(out)))
    assert len(rows) == 20
    assert set(rows[0].keys()) == {"snap_date", "symbol", "contract", "vol", "oi",
                                   "last", "label_unusual_yn", "notes"}
    # no score/rank columns — labelling must be blind
```

- [ ] **Step 2: Implement**

```python
# argus/argus/options_intel/label_sheet.py
"""Blind labelling sheet for scorer validation (master plan WS-1.2 acceptance).

Usage (after >=5 sessions of close snapshots):
    python -m argus.options_intel.label_sheet /tmp/unusual_validation.csv

Mixes the top-N scored contracts with N random eligible-but-unscored contracts,
shuffled, WITHOUT score columns — the human labels each row unusual y/n blind,
then compares against the scorer's verdicts.
"""
import csv
import random
import sys

from ..db import get_conn
from .schema import ensure_schema
from .unusual import MIN_OI


def write_sheet(conn, path, top_n: int = 20, random_n: int = 20, seed: int | None = None):
    top = conn.execute(
        "SELECT snap_date,symbol,contract,vol,oi,last FROM unusual_activity "
        "ORDER BY score DESC LIMIT ?", (top_n,)).fetchall()
    scored = {r["contract"] for r in top}
    pool = [r for r in conn.execute(
        "SELECT snap_date,symbol,expiry,strike,type,vol,oi,last FROM options_snapshots "
        "WHERE kind='close' AND oi>=? ORDER BY snap_date DESC LIMIT 2000",
        (MIN_OI,)).fetchall()
        if f"{r['symbol']} {r['expiry']} {r['strike']:g}{r['type']}" not in scored]
    rng = random.Random(seed)
    sample = rng.sample(pool, min(random_n, len(pool)))
    rows = ([dict(snap_date=r["snap_date"], symbol=r["symbol"], contract=r["contract"],
                  vol=r["vol"], oi=r["oi"], last=r["last"]) for r in top]
            + [dict(snap_date=r["snap_date"], symbol=r["symbol"],
                    contract=f"{r['symbol']} {r['expiry']} {r['strike']:g}{r['type']}",
                    vol=r["vol"], oi=r["oi"], last=r["last"]) for r in sample])
    rng.shuffle(rows)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["snap_date", "symbol", "contract", "vol", "oi",
                                          "last", "label_unusual_yn", "notes"])
        w.writeheader()
        for r in rows:
            w.writerow({**r, "label_unusual_yn": "", "notes": ""})


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m argus.options_intel.label_sheet <out.csv>", file=sys.stderr)
        return 2
    conn = get_conn()
    ensure_schema(conn)
    write_sheet(conn, sys.argv[1])
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 3: Run** → test green; full suite 38 passed. **Step 4: Commit**

```bash
git add argus/argus/options_intel/label_sheet.py argus/tests/test_oi_label_sheet.py
git commit -m "feat(options_intel): blind labelling sheet for scorer validation"
```

---

### Task 10: Docs, board, regression sweep

**Files:**
- Modify: `argus/README.md` (endpoints + module), `dashboard/README.md` (schema notes), `docs/SESSION_HANDOFF.md`, master plan §9 (Phase B / WS-1 row)

- [ ] **Step 1:** `argus/README.md`: endpoint rows for `GET /api/unusual/{symbol}`, `GET /api/gex/{symbol}`; a short `options_intel` module paragraph (snapshotter cadence, scorer design one-liner, GEX caveat). `dashboard/README.md` schema notes: one line each for `options_snapshots`, `unusual_activity`, `gex_levels` (columns + writer, per §4.1 schema discipline).
- [ ] **Step 2:** `docs/SESSION_HANDOFF.md` — rewrite from this branch's perspective (WS-1 done on branch, integration pending: plist bootstrap ×2, API restart, first-run verification, validation-week labelling flow). Master plan §9: add/update the Phase B row → WS-1 `Done (awaiting validation week)`, link this plan, date.
- [ ] **Step 3: Full sweep** — `cd argus && .venv/bin/python -m pytest tests/ -v` (38 expected); `cd dashboard && npx vitest run` (45) + `npx tsc --noEmit`. Paste tails.
- [ ] **Step 4: Commit**

```bash
git add argus/README.md dashboard/README.md docs/SESSION_HANDOFF.md docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md
git commit -m "chore(options_intel): docs, schema notes, status board for WS-1"
```

---

## Acceptance (whole phase)

1. argus suite green (38); dashboard vitest green (45); tsc clean.
2. After integration: both plists loaded (`launchctl print` shows wrapper-wrapped jobs); first manual run of `options_close_job.sh` writes snapshot rows + heartbeats (`options-snapshot-close`, `options-unusual`, `options-gex`) visible on `/sources`.
3. `curl :8088/api/unusual/SPY` returns scored rows with `as_of` after the first close run; `curl :8088/api/gex/SPY` returns levels with the OI-based caveat.
4. Overnight (US closed), `/t/SPY` options panel shows scored unusual rows with the "as of <date> close (US)" banner — never an empty table (B6 closed for good).
5. GexCard renders on SPY/QQQ/IWM/DIA with zero-gamma/call-wall/put-wall + caveat.
6. Scorer validation: after ≥5 sessions, `python -m argus.options_intel.label_sheet` produces the blind sheet; the "beta" tag is removed only after the user signs off a labelled week (calendar-gated — tracked in SESSION_HANDOFF, not in this build).
7. Known deferred (documented): hourly intraday snapshots (laptop asleep during US session — revisit with the Q6 VPS decision); Saturday close-capture depends on the machine being awake at 06:10 Saturday (pmset wake is MTWRF only).
