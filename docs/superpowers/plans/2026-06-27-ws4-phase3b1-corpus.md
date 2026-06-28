# WS-4 Phase 3b-1 · Corpus + Cached Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable, offline calibration corpus: point-in-time S&P 500 membership (checked-in JSON) + a SQLite cache of adjusted daily OHLCV per member, with a coverage manifest — the data substrate Phase 3b-2/3b-3 read repeatedly without re-fetching.

**Architecture:** Two layers. (1) A **one-shot tool** `tools/corpus/build_sp500_membership.py` reconstructs in-index date intervals from Wikipedia (current list + change log) using `requests`+`bs4` and writes the deterministic artifact `config/sp500_membership.json`. It runs by hand once; the JSON is committed. (2) A package module `argus/argus/position_engine/corpus.py` *reads* that JSON and builds/queries the SQLite price cache. Network fetching is injected (a `fetch(ticker, start)` callable, mirroring `fills.make_intraday_fetcher`) so the build logic is unit-testable network-free. Prices are **adjusted** (`auto_adjust=True`) so splits/dividends don't create false deterioration signals.

**Tech Stack:** Python 3.11 (pandas, numpy, sqlite3 via `argus.db.get_conn`, yfinance, requests, bs4), pytest. Package code under `argus/argus/position_engine/`; the one-shot builder under `tools/corpus/`; tests under `argus/tests/`. venv = `argus/.venv`, run from the `argus/` dir.

## Global Constraints

- **venv + cwd:** run from `argus/` with `.venv/bin/python` (`.venv/bin/python -m pytest tests/...`). Package = `argus/argus/`, tests = `argus/tests/`. `git add` paths are repo-root-relative → `argus/argus/...`, `argus/tests/...`, `tools/...`, `config/...`.
- **No parquet:** neither pyarrow nor fastparquet is installed; do NOT add them. Cache is **SQLite** (`corpus.db`) via the existing `get_conn`.
- **Offline & deterministic at runtime:** `corpus.py` must never scrape at import/call time — it reads the committed `config/sp500_membership.json`. Only the `tools/corpus/` one-shot script touches Wikipedia.
- **Adjusted prices:** corpus bars use `auto_adjust=True` (split/dividend-adjusted). Document this — it differs from the live `get_history` (`auto_adjust=False`).
- **Injected fetch:** all build functions take a `fetch` callable so tests run network-free. No test may hit the network.
- **Output location:** `argus/backtests/_corpus/` (gitignored via `argus/backtests/`). Never write into the repo tree elsewhere.
- **Commit trailer:** end every commit message with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Decisions & findings (read before Task 1)

1. **Membership source.** Wikipedia "List of S&P 500 companies" has the current constituents table plus a "Selected changes to the list" table (Date / Added ticker / Removed ticker), which Wikipedia maintains back well before 2014. Reconstruction walks the change log **backward** from today's members: start = current set with `end=None` (still in index); for each change going back in time, a *removed* ticker re-enters the set (it was a member before its removal date → open an interval ending at that date), an *added* ticker leaves the set (close its membership start at that date). Produces `{ticker: [[start, end], ...]}` ISO dates, `end=null` meaning still-in-index.
2. **START_YEAR = 2014** (spec §3) — gives ≥3 regimes incl. the 2022 bear. Members whose interval ends before 2014 are dropped.
3. **`config/sp500_membership.json` is committed** (it is data, not output; `config/` holds the project's other JSON like `sector_constituents.json`). Re-runs of the tool overwrite it; commits capture point-in-time snapshots.
4. **Parser:** `requests` + `bs4` with the stdlib `html.parser` (lxml/html5lib are absent). Do NOT use `pd.read_html`.
5. **Price fetch:** `yf.Ticker(sym).history(start=START, interval="1d", auto_adjust=True)` → lowercase OHLCV, `DatetimeIndex`. Mirrors `tools/weight_opt/historical_bridge_dataset.py::_fetch_prices` but adjusted-from-2014 and injected for tests.
6. **SQLite schema:** one table `prices(ticker TEXT, date TEXT, open REAL, high REAL, low REAL, close REAL, volume REAL, PRIMARY KEY(ticker, date))`. `INSERT OR REPLACE` keeps the build idempotent.
7. **Manifest:** `corpus_manifest.json` = `{built_at, start, n_members, fetched:[{ticker,n_bars,first,last}], skipped:[{ticker,reason}]}` so 3b-2 knows coverage without re-querying.
8. **Benchmarks:** SPY + the 11 sector ETFs are fetched into the same `prices` table (they're just tickers); the membership JSON carries a reserved `_benchmarks` key listing them so the build always includes them.

### File structure

| File | Responsibility |
|---|---|
| `tools/corpus/build_sp500_membership.py` | **New, one-shot.** Scrape Wikipedia → reconstruct intervals → write `config/sp500_membership.json`. Not imported by the package. |
| `config/sp500_membership.json` | **New, committed data.** `{ "_benchmarks": [...], "members": {ticker: [[start,end],...]} }`. |
| `argus/argus/position_engine/corpus.py` | **New.** `load_membership`, `members_active_between`, `build_corpus(fetch=...)`, `load_prices`, `load_manifest`. Pure-ish (fetch + paths injected). |
| `argus/tests/test_pe_corpus.py` | **New.** Unit tests with a fake fetch + a fixture membership JSON. |

---

## Task 1: `corpus.py` — membership loader + active-window query

Start with the *consumer* of the membership JSON (pure, no network), so the data contract is locked before the scraper is written.

**Files:**
- Create: `argus/argus/position_engine/corpus.py`
- Test: `argus/tests/test_pe_corpus.py`

**Interfaces:**
- Produces:
  - `load_membership(path) -> dict` → `{"benchmarks": [...], "members": {ticker: [(start, end_or_None), ...]}}` (dates as `pd.Timestamp`, `end=None` = still active).
  - `members_active_between(membership, start, end) -> set[str]` → every ticker whose membership overlaps `[start, end]`, plus all benchmarks.

- [ ] **Step 1: Write the failing test**

```python
# argus/tests/test_pe_corpus.py
import json
import pandas as pd
from argus.position_engine.corpus import load_membership, members_active_between

_FIXTURE = {
    "_benchmarks": ["SPY", "XLK"],
    "members": {
        "AAA": [["2012-01-01", "2016-06-30"]],          # left index mid-corpus
        "BBB": [["2018-03-01", None]],                  # joined 2018, still in
        "CCC": [["2010-01-01", None]],                  # always in
        "DDD": [["2009-01-01", "2013-01-01"]],          # left before corpus window
    },
}


def _write(tmp_path):
    p = tmp_path / "membership.json"
    p.write_text(json.dumps(_FIXTURE))
    return p


def test_load_membership_parses_intervals_and_benchmarks(tmp_path):
    m = load_membership(_write(tmp_path))
    assert m["benchmarks"] == ["SPY", "XLK"]
    assert m["members"]["BBB"] == [(pd.Timestamp("2018-03-01"), None)]
    assert m["members"]["AAA"][0][1] == pd.Timestamp("2016-06-30")


def test_members_active_between_overlap_and_benchmarks(tmp_path):
    m = load_membership(_write(tmp_path))
    active = members_active_between(m, pd.Timestamp("2014-01-01"), pd.Timestamp("2024-01-01"))
    assert {"AAA", "BBB", "CCC"} <= active     # overlap the window
    assert "DDD" not in active                 # left before 2014
    assert {"SPY", "XLK"} <= active            # benchmarks always included


def test_members_active_between_excludes_non_overlapping(tmp_path):
    m = load_membership(_write(tmp_path))
    active = members_active_between(m, pd.Timestamp("2017-01-01"), pd.Timestamp("2017-12-31"))
    assert "AAA" not in active                 # AAA left 2016-06-30
    assert "BBB" not in active                 # BBB joined 2018-03-01
    assert "CCC" in active
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -v`
Expected: FAIL — `ModuleNotFoundError: argus.position_engine.corpus`.

- [ ] **Step 3: Implement the loader + query**

```python
# argus/argus/position_engine/corpus.py
"""Calibration corpus (design spec §3, Phase 3b-1). Reads the committed point-in-time
S&P 500 membership and builds/queries a SQLite cache of ADJUSTED daily OHLCV. Runtime
code never scrapes — membership comes from config/sp500_membership.json (built once by
tools/corpus/build_sp500_membership.py). Network fetching is injected for testability."""
import json
from pathlib import Path

import pandas as pd

from ..db import get_conn


def load_membership(path) -> dict:
    """Parse the committed membership JSON into typed intervals.
    Returns {"benchmarks": [...], "members": {ticker: [(start_ts, end_ts_or_None), ...]}}."""
    raw = json.loads(Path(path).read_text())
    members = {}
    for tkr, ivals in raw.get("members", {}).items():
        members[tkr] = [(pd.Timestamp(s), pd.Timestamp(e) if e else None) for s, e in ivals]
    return {"benchmarks": list(raw.get("_benchmarks", [])), "members": members}


def members_active_between(membership: dict, start, end) -> set:
    """Every member whose in-index interval overlaps [start, end], plus all benchmarks."""
    start, end = pd.Timestamp(start), pd.Timestamp(end)
    out = set(membership["benchmarks"])
    for tkr, ivals in membership["members"].items():
        for s, e in ivals:
            e_eff = e if e is not None else end
            if s <= end and e_eff >= start:          # interval overlaps the window
                out.add(tkr)
                break
    return out
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/corpus.py argus/tests/test_pe_corpus.py
git commit -m "feat(corpus): point-in-time S&P 500 membership loader + active-window query" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `corpus.py` — SQLite price cache build (injected fetch) + read-back

**Files:**
- Modify: `argus/argus/position_engine/corpus.py`
- Test: `argus/tests/test_pe_corpus.py` (add cases)

**Interfaces:**
- Consumes: `members_active_between` (Task 1).
- Produces:
  - `ensure_price_schema(conn)` — creates the `prices` table.
  - `build_corpus(tickers, *, conn, fetch, start="2014-01-01") -> dict` — fetches each ticker via `fetch(ticker, start) -> DataFrame|None`, writes `INSERT OR REPLACE`, returns a manifest dict `{fetched:[...], skipped:[...]}`. Idempotent.
  - `load_prices(conn, ticker, start=None, end=None) -> pd.DataFrame` — OHLCV frame, `DatetimeIndex` named `ts`, ascending.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_corpus.py
import numpy as np
from argus.db import get_conn
from argus.position_engine.corpus import (
    ensure_price_schema, build_corpus, load_prices,
)


def _fake_frame(n=30, start="2014-01-02"):
    idx = pd.bdate_range(start, periods=n)
    c = np.linspace(100, 130, n)
    return pd.DataFrame({"open": c, "high": c + 1, "low": c - 1, "close": c,
                         "volume": np.full(n, 1e6)}, index=idx)


def test_build_corpus_writes_prices_and_manifest(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)

    def fetch(ticker, start):
        return None if ticker == "BAD" else _fake_frame()

    man = build_corpus(["AAA", "BAD", "SPY"], conn=conn, fetch=fetch, start="2014-01-01")
    assert {r["ticker"] for r in man["fetched"]} == {"AAA", "SPY"}
    assert man["skipped"][0]["ticker"] == "BAD"
    px = load_prices(conn, "AAA")
    conn.close()
    assert list(px.columns) == ["open", "high", "low", "close", "volume"]
    assert len(px) == 30 and px.index.is_monotonic_increasing


def test_build_corpus_is_idempotent(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)
    fetch = lambda t, s: _fake_frame()
    build_corpus(["AAA"], conn=conn, fetch=fetch, start="2014-01-01")
    build_corpus(["AAA"], conn=conn, fetch=fetch, start="2014-01-01")   # 2nd run must not duplicate
    n = conn.execute("SELECT COUNT(*) c FROM prices WHERE ticker='AAA'").fetchone()["c"]
    conn.close()
    assert n == 30                                  # INSERT OR REPLACE on (ticker,date)


def test_load_prices_respects_date_window(tmp_path):
    conn = get_conn(tmp_path / "corpus.db")
    ensure_price_schema(conn)
    build_corpus(["AAA"], conn=conn, fetch=lambda t, s: _fake_frame(60), start="2014-01-01")
    sl = load_prices(conn, "AAA", start="2014-01-10", end="2014-02-10")
    conn.close()
    assert sl.index.min() >= pd.Timestamp("2014-01-10")
    assert sl.index.max() <= pd.Timestamp("2014-02-10")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -k "build or load_prices" -v`
Expected: FAIL — `ImportError: cannot import name 'ensure_price_schema'`.

- [ ] **Step 3: Implement the cache build + read-back**

```python
# add to argus/argus/position_engine/corpus.py
_PRICE_COLS = ["open", "high", "low", "close", "volume"]


def ensure_price_schema(conn) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prices ("
        "ticker TEXT NOT NULL, date TEXT NOT NULL, open REAL, high REAL, low REAL, "
        "close REAL, volume REAL, PRIMARY KEY (ticker, date))")
    conn.commit()


def build_corpus(tickers, *, conn, fetch, start="2014-01-01") -> dict:
    """Fetch each ticker via fetch(ticker, start)->DataFrame|None and upsert into prices.
    A None/empty frame or a raising fetch records a skip (never crashes the build)."""
    fetched, skipped = [], []
    for tkr in tickers:
        try:
            df = fetch(tkr, start)
        except Exception as exc:                      # degrade, never abort the corpus
            skipped.append({"ticker": tkr, "reason": repr(exc)})
            continue
        if df is None or len(df) == 0:
            skipped.append({"ticker": tkr, "reason": "no data"})
            continue
        rows = [(tkr, ts.strftime("%Y-%m-%d"), float(r["open"]), float(r["high"]),
                 float(r["low"]), float(r["close"]), float(r["volume"]))
                for ts, r in df.iterrows()]
        conn.executemany(
            "INSERT OR REPLACE INTO prices (ticker,date,open,high,low,close,volume) "
            "VALUES (?,?,?,?,?,?,?)", rows)
        conn.commit()
        fetched.append({"ticker": tkr, "n_bars": len(rows),
                        "first": rows[0][1], "last": rows[-1][1]})
    return {"fetched": fetched, "skipped": skipped}


def load_prices(conn, ticker, start=None, end=None) -> pd.DataFrame:
    """Adjusted OHLCV for one ticker as an ascending DatetimeIndex frame named 'ts'."""
    q = "SELECT date, open, high, low, close, volume FROM prices WHERE ticker=?"
    params = [ticker]
    if start is not None:
        q += " AND date>=?"; params.append(pd.Timestamp(start).strftime("%Y-%m-%d"))
    if end is not None:
        q += " AND date<=?"; params.append(pd.Timestamp(end).strftime("%Y-%m-%d"))
    q += " ORDER BY date"
    rows = conn.execute(q, params).fetchall()
    df = pd.DataFrame(rows, columns=["date"] + _PRICE_COLS)
    df.index = pd.to_datetime(df["date"]); df.index.name = "ts"
    return df[_PRICE_COLS]
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -v`
Expected: PASS (all corpus tests).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/corpus.py argus/tests/test_pe_corpus.py
git commit -m "feat(corpus): idempotent SQLite price cache build (injected fetch) + windowed read-back" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `corpus.py` — yfinance adjusted fetcher + run-corpus orchestrator + manifest

**Files:**
- Modify: `argus/argus/position_engine/corpus.py`
- Test: `argus/tests/test_pe_corpus.py` (add a monkeypatched-network case + manifest case)

**Interfaces:**
- Consumes: `load_membership`, `members_active_between`, `build_corpus` (Tasks 1–2).
- Produces:
  - `yf_adjusted(ticker, start) -> pd.DataFrame|None` — the real (network) fetcher, isolated so tests monkeypatch it.
  - `run_corpus(*, membership_path, out_dir, start="2014-01-01", end=None, fetch=None) -> dict` — loads membership, computes the active universe + benchmarks, opens `out_dir/corpus.db`, builds, writes `out_dir/corpus_manifest.json`, returns the manifest.

- [ ] **Step 1: Write the failing test**

```python
# append to argus/tests/test_pe_corpus.py
import argus.position_engine.corpus as C


def test_run_corpus_builds_db_and_manifest(tmp_path, monkeypatch):
    mp = tmp_path / "membership.json"
    mp.write_text(json.dumps(_FIXTURE))
    monkeypatch.setattr(C, "yf_adjusted", lambda t, s: _fake_frame())
    man = C.run_corpus(membership_path=mp, out_dir=tmp_path,
                       start="2014-01-01", end="2024-01-01")
    assert (tmp_path / "corpus.db").exists()
    assert (tmp_path / "corpus_manifest.json").exists()
    on_disk = json.loads((tmp_path / "corpus_manifest.json").read_text())
    names = {r["ticker"] for r in on_disk["fetched"]}
    assert {"AAA", "BBB", "CCC", "SPY", "XLK"} <= names   # active members + benchmarks
    assert "DDD" not in names                              # left before the window
    assert on_disk["start"] == "2014-01-01" and on_disk["n_members"] >= 5


def test_run_corpus_default_fetch_is_yf_adjusted(tmp_path, monkeypatch):
    # when fetch is not injected, run_corpus must route through the (monkeypatched) yf_adjusted
    mp = tmp_path / "m.json"; mp.write_text(json.dumps({"_benchmarks": ["SPY"], "members": {}}))
    called = {}
    def fake(t, s): called["hit"] = t; return _fake_frame()
    monkeypatch.setattr(C, "yf_adjusted", fake)
    C.run_corpus(membership_path=mp, out_dir=tmp_path, start="2014-01-01", end="2024-01-01")
    assert called.get("hit") == "SPY"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -k run_corpus -v`
Expected: FAIL — `AttributeError: module ... has no attribute 'yf_adjusted'` / `run_corpus`.

- [ ] **Step 3: Implement the fetcher + orchestrator**

```python
# add to argus/argus/position_engine/corpus.py (top: add imports)
from datetime import datetime, timezone


def yf_adjusted(ticker: str, start: str):
    """Split/dividend-adjusted daily OHLCV from yfinance, lowercase columns, DatetimeIndex.
    Isolated (not inlined) so build orchestration is monkeypatchable in tests."""
    import yfinance as yf
    raw = yf.Ticker(ticker).history(start=start, interval="1d", auto_adjust=True)
    if raw is None or raw.empty:
        return None
    raw = raw.rename(columns=str.lower)
    raw.index = pd.to_datetime(raw.index).tz_localize(None)
    cols = [c for c in _PRICE_COLS if c in raw.columns]
    return raw[cols] if len(cols) == len(_PRICE_COLS) else None


def run_corpus(*, membership_path, out_dir, start="2014-01-01", end=None, fetch=None) -> dict:
    """Build the full corpus: active members over [start,end] + benchmarks -> corpus.db,
    and write corpus_manifest.json. `fetch` defaults to the live yf_adjusted."""
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    end = pd.Timestamp(end) if end is not None else pd.Timestamp.utcnow().normalize()
    membership = load_membership(membership_path)
    universe = sorted(members_active_between(membership, start, end))

    def _default_fetch(t, s):
        return yf_adjusted(t, s)
    fetch = fetch or _default_fetch

    conn = get_conn(out_dir / "corpus.db")
    ensure_price_schema(conn)
    built = build_corpus(universe, conn=conn, fetch=fetch, start=start)
    conn.close()

    manifest = {"built_at": datetime.now(timezone.utc).isoformat(),
                "start": start, "end": end.strftime("%Y-%m-%d"),
                "n_members": len(universe), **built}
    (out_dir / "corpus_manifest.json").write_text(json.dumps(manifest, indent=2))
    return manifest


def load_manifest(out_dir) -> dict:
    return json.loads((Path(out_dir) / "corpus_manifest.json").read_text())
```

Note: `_default_fetch` calls the module-global `yf_adjusted`, so `monkeypatch.setattr(C, "yf_adjusted", ...)` is honoured (do not bind `yf_adjusted` as a default arg value).

- [ ] **Step 4: Run the test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pe_corpus.py -v`
Expected: PASS (all corpus tests, network-free).

- [ ] **Step 5: Commit**

```bash
git add argus/argus/position_engine/corpus.py argus/tests/test_pe_corpus.py
git commit -m "feat(corpus): yfinance adjusted fetcher + run_corpus orchestrator + manifest" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: One-shot membership builder + the committed `config/sp500_membership.json`

This produces the committed data artifact Task 1 consumes. It is a `tools/` script (not package code, not imported), so its "test" is running it once and sanity-checking the output against known index changes.

**Files:**
- Create: `tools/corpus/build_sp500_membership.py`
- Create (generated, committed): `config/sp500_membership.json`

- [ ] **Step 1: Write the builder**

```python
# tools/corpus/build_sp500_membership.py
"""One-shot: reconstruct point-in-time S&P 500 membership from Wikipedia and write
config/sp500_membership.json. Run by hand (network); the JSON is the committed artifact
that argus.position_engine.corpus reads. Uses requests + bs4 (stdlib html.parser) —
NOT pd.read_html (lxml/html5lib absent)."""
import json
import re
from datetime import date
from pathlib import Path

import requests
from bs4 import BeautifulSoup

URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
START_YEAR = 2014
BENCHMARKS = ["SPY", "XLK", "XLF", "XLV", "XLY", "XLC", "XLI", "XLP", "XLE", "XLB", "XLRE", "XLU"]
OUT = Path(__file__).resolve().parents[2] / "config" / "sp500_membership.json"


def _soup() -> BeautifulSoup:
    r = requests.get(URL, headers={"User-Agent": "argus-corpus/1.0"}, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def _current_members(soup) -> set[str]:
    table = soup.find("table", {"id": "constituents"})
    out = set()
    for row in table.find("tbody").find_all("tr")[1:]:
        cells = row.find_all("td")
        if cells:
            out.add(cells[0].get_text(strip=True).replace(".", "-"))   # BRK.B -> BRK-B (yf)
    return out


def _changes(soup):
    """Yield (date, added_ticker_or_None, removed_ticker_or_None), newest-first, as the
    'Selected changes to the list' table is ordered."""
    table = soup.find("table", {"id": "changes"})
    for row in table.find("tbody").find_all("tr"):
        cells = row.find_all(["td", "th"])
        txt = [c.get_text(strip=True) for c in cells]
        m = re.search(r"[A-Z][a-z]+ \d{1,2}, \d{4}", " ".join(txt[:2]))
        if not m:
            continue
        import datetime as _dt
        d = _dt.datetime.strptime(m.group(0), "%B %d, %Y").date()
        # Wikipedia columns: Date | Added(ticker, name) | Removed(ticker, name) | Reason
        added = txt[1].replace(".", "-") if len(txt) > 1 and txt[1] else None
        removed = txt[3].replace(".", "-") if len(txt) > 3 and txt[3] else None
        yield d, added or None, removed or None


def reconstruct() -> dict:
    soup = _soup()
    current = _current_members(soup)
    # walk changes backward from today; open/extend intervals
    intervals: dict[str, list] = {t: [[None, None]] for t in current}   # start unknown yet, end=None
    active = set(current)
    for d, added, removed in _changes(soup):                            # newest-first
        iso = d.isoformat()
        if added and added in active:        # this add is when `added` STARTED its current stint
            for iv in intervals[added]:
                if iv[1] is None and iv[0] is None:
                    iv[0] = iso
            active.discard(added)
        if removed:                          # `removed` was a member UNTIL this date -> reopen
            intervals.setdefault(removed, []).append([None, iso])
            active.add(removed)
    # any still-active with unknown start began before our data window
    for t in list(intervals):
        for iv in intervals[t]:
            if iv[0] is None:
                iv[0] = f"{START_YEAR}-01-01"
    # drop intervals entirely before START_YEAR; coerce shape
    members = {}
    for t, ivs in intervals.items():
        keep = [[s, e] for s, e in ivs if (e is None or e >= f"{START_YEAR}-01-01")]
        if keep:
            members[t] = keep
    return {"_benchmarks": BENCHMARKS, "members": members}


def main():
    data = reconstruct()
    OUT.write_text(json.dumps(data, indent=2, sort_keys=True))
    print(f"wrote {OUT} — {len(data['members'])} members + {len(data['_benchmarks'])} benchmarks")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the builder (network) and sanity-check**

Run: `.venv/bin/python tools/corpus/build_sp500_membership.py`
Expected: writes `config/sp500_membership.json`; prints ~600–700 members (current 500 + names that have left since 2014) + 12 benchmarks. **Sanity checks** (Wikipedia HTML drifts — adjust the parser if these fail): the JSON parses; a known still-member like `AAPL` has `end=null`; a known removal like `"end"` date on a name dropped in the corpus window is present; `SPY` is in `_benchmarks`. If the `changes`/`constituents` table ids changed, fix the selectors until the checks hold.

- [ ] **Step 3: Verify the package consumes the real artifact**

Run: `.venv/bin/python -c "from argus.position_engine.corpus import load_membership, members_active_between; import pandas as pd; m=load_membership('../config/sp500_membership.json'); print('members', len(m['members']), 'active 2014-2024', len(members_active_between(m, pd.Timestamp('2014-01-01'), pd.Timestamp('2024-01-01'))))"`
Expected: prints non-trivial counts (members ≳ 600; active over 2014–2024 ≳ 550 incl. benchmarks). (Path is `../config/...` because cwd is `argus/`.)

- [ ] **Step 4: Commit the builder + the generated artifact**

```bash
git add tools/corpus/build_sp500_membership.py config/sp500_membership.json
git commit -m "feat(corpus): one-shot S&P 500 point-in-time membership builder + committed snapshot" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Full-suite regression + optional live corpus smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the entire suite**

Run: `.venv/bin/python -m pytest tests/ -q`
Expected: all green — prior 172 + the new `test_pe_corpus` cases. Record the exact count.

- [ ] **Step 2: Optional live corpus smoke (network-permitting, slow)**

Run a tiny real build to prove the end-to-end path (cwd = `argus/`):
`.venv/bin/python -c "from argus.position_engine.corpus import run_corpus; m=run_corpus(membership_path='../config/sp500_membership.json', out_dir='backtests/_corpus', start='2022-01-01', end='2022-03-01'); print('fetched', len(m['fetched']), 'skipped', len(m['skipped']))"`
Expected: builds `argus/backtests/_corpus/corpus.db` + `corpus_manifest.json`; most names fetched, a few skips. Skip if offline — the unit tests already cover the logic with injected frames. (This writes into the gitignored `argus/backtests/`.)

- [ ] **Step 3: Commit the regression marker**

```bash
git commit --allow-empty -m "test(corpus): WS-4 Phase 3b-1 corpus full-suite regression green" \
           -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review (spec §3 coverage)

| Spec §3 requirement | Task |
|---|---|
| Point-in-time S&P 500 membership (not current-only) | 4 (builder) + 1 (loader/query) |
| Include names for their in-index period only | 1 (`members_active_between` overlap) |
| Delisting names retained (their last history) | 3 (`yf_adjusted` fetches whatever history exists; left-index names still fetched if active in-window) |
| Adjusted daily OHLCV, ~2014→present | 3 (`auto_adjust=True`, `start=2014`) |
| SQLite cache (no parquet), fetch-once / read-many | 2 (`prices` table, `INSERT OR REPLACE`, `load_prices`) |
| Skip + log insufficient/failed names | 2 (`build_corpus` skip list) |
| Benchmarks (SPY + 11 sector ETFs) cached | 4 (`_benchmarks`) + 3 (always in universe) |
| `corpus_manifest.json` coverage artifact | 3 (`run_corpus`) |

**Deferred to 3b-2/3b-3 (not here):** the forward-MAE label, per-signal rank-IC/AUC + cluster bootstrap + Holm graduation (3b-2), and the ridge/shrink-to-1/N calibrator + walk-forward OOS gate (3b-3). Those consume this corpus; they are not part of building it. Reuse `tools/weight_opt/{grid_search,historical_bridge_dataset}.py` patterns there.

---

## Execution handoff

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
