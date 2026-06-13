# Phase B / WS-6: Catalysts Everywhere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Binding rules:** master plan §4.1. Scope boundary: files listed per task only; out-of-scope discoveries reported, never fixed. No `sudo`/`launchctl`; live-API restart is a controller integration step.

**Goal:** Every ticker view — bridge name or hand-searched — shows 1–3 catalysts: the next/last earnings (with the last reaction when available) and recent analyst upgrades/downgrades, via a new any-ticker `/api/catalysts/{symbol}` endpoint and a one-line header strip. Closes WS-6 items 1–3; item 4 (econ-calendar chips) is explicitly deferred to WS-3 which builds `econ_calendar`.

**Architecture:** A new `argus/argus/catalysts/` package wraps yfinance's `calendar` (next earnings — no lxml), `upgrades_downgrades` (analyst actions — no lxml) and, when available, `earnings_dates` (past surprises — needs lxml) into one normalized payload. A pure price-reaction helper derives the % move on a past earnings day from existing history. The dashboard gets a compact `CatalystStrip` in the ticker header, fed by the new endpoint, so coverage no longer depends on a bridge row.

**Tech Stack:** Python 3.11 (`argus/.venv`), yfinance 1.3.0, pandas, FastAPI; Next.js 14 + SWR.

**Verified starting facts (2026-06-13):**
- `yf.Ticker(s).calendar` → dict with `"Earnings Date"` (list of upcoming date(s)) — works WITHOUT lxml.
- `yf.Ticker(s).upgrades_downgrades` → DataFrame, DatetimeIndex (action date), columns `Firm, ToGrade, FromGrade, Action, priceTargetAction` — works WITHOUT lxml.
- `yf.Ticker(s).earnings_dates` → past+future earnings with EPS estimate/actual/surprise BUT calls `pd.read_html` → **requires `lxml`, which is NOT installed in `argus/.venv`** (raises `ImportError: Import lxml failed`). The provider must degrade gracefully without it; installing lxml is a flagged enhancement (controller step), not a blocker.
- `argus/argus/data/market.py:61` `get_history(symbol, period="2y", interval="1d")` → DataFrame cols `open,high,low,close,volume`, DatetimeIndex.
- Existing: `argus/argus/api/routes.py` registers routes inside `build_app()`; `GET /api/fundamentals/{symbol}` routes to IBKR. `CatalystsCard.tsx` (ticker page) renders bridge-row catalyst tokens + `/api/argus/fundamentals/{ticker}`. **Today-table catalyst chips column ALREADY EXISTS** (`SignalGroups.tsx:384` `CatalystCount`) — WS-6 item 1 is already done; this plan VERIFIES it and does not rebuild it.
- `argus/argus/data/__init__.py` re-exports `data` functions (routes import `from ..data import …`). Argus app object `argus.main:app`. pytest baseline this branch: 22.
- Header component: `dashboard/components/ticker/Header.tsx`; ticker page `dashboard/app/t/[ticker]/page.tsx:90` renders `<Header …/>`.

---

### Task 1: Earnings-reaction helper (pure, TDD)

**Files:**
- Create: `argus/argus/catalysts/__init__.py` (empty)
- Create: `argus/argus/catalysts/reaction.py`
- Test: `argus/tests/test_cat_reaction.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_cat_reaction.py
import pandas as pd

from argus.catalysts.reaction import earnings_reaction_pct


def _hist():
    idx = pd.to_datetime(["2026-05-26", "2026-05-27", "2026-05-28", "2026-05-29"])
    return pd.DataFrame({"open": [100, 101, 102, 110],
                         "high": [101, 102, 103, 112],
                         "low": [99, 100, 101, 109],
                         "close": [100, 101, 103, 111],
                         "volume": [1, 1, 1, 1]}, index=idx)


def test_reaction_uses_next_session_close_over_prior_close():
    # earnings reported after close 2026-05-28 (close 103) -> reaction on 05-29 (close 111)
    pct = earnings_reaction_pct(_hist(), "2026-05-28")
    assert pct is not None
    assert round(pct, 1) == 7.8  # (111-103)/103*100


def test_reaction_same_day_when_no_next_session():
    # earnings date is the last available bar -> fall back to that day's open->close
    pct = earnings_reaction_pct(_hist(), "2026-05-29")
    assert round(pct, 1) == 0.9  # (111-110)/110*100


def test_reaction_none_when_date_absent():
    assert earnings_reaction_pct(_hist(), "2020-01-01") is None
```

- [ ] **Step 2: Run to verify failure** — `cd argus && .venv/bin/python -m pytest tests/test_cat_reaction.py -v` → module missing.

- [ ] **Step 3: Implement**

```python
# argus/argus/catalysts/reaction.py
"""Earnings price reaction (master plan WS-6.2): the % move attributable to a
past earnings release. Convention: if a later session exists, reaction =
prior-close → next-session-close (captures after-close reports and gaps); if the
earnings day is the last bar we have, fall back to that day's open→close."""
from __future__ import annotations

import pandas as pd


def earnings_reaction_pct(history: pd.DataFrame, earnings_date: str) -> float | None:
    if history is None or history.empty:
        return None
    idx = pd.to_datetime(history.index).normalize()
    target = pd.Timestamp(earnings_date).normalize()
    locs = (idx == target).nonzero()[0]
    if len(locs) == 0:
        return None
    i = int(locs[0])
    if i + 1 < len(history):
        prior = float(history["close"].iloc[i])
        after = float(history["close"].iloc[i + 1])
        return (after - prior) / prior * 100 if prior else None
    o = float(history["open"].iloc[i])
    c = float(history["close"].iloc[i])
    return (c - o) / o * 100 if o else None
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 25 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/catalysts/__init__.py argus/argus/catalysts/reaction.py argus/tests/test_cat_reaction.py
git commit -m "feat(catalysts): earnings price-reaction helper"
```

---

### Task 2: Catalyst provider (TDD, injected fetchers)

**Files:**
- Create: `argus/argus/catalysts/provider.py`
- Test: `argus/tests/test_cat_provider.py`

- [ ] **Step 1: Write the failing tests**

```python
# argus/tests/test_cat_provider.py
import pandas as pd

from argus.catalysts.provider import build_catalysts


def fake_calendar(sym):
    return {"Earnings Date": [pd.Timestamp("2026-08-01").date()]}


def fake_upgrades(sym):
    idx = pd.to_datetime(["2026-06-03", "2026-05-10", "2026-01-02"])
    return pd.DataFrame({"Firm": ["UBS", "MS", "GS"],
                         "ToGrade": ["Buy", "Overweight", "Sell"],
                         "FromGrade": ["Neutral", "Equalweight", "Neutral"],
                         "Action": ["up", "up", "down"]}, index=idx)


def fake_history(sym, period="2y", interval="1d"):
    idx = pd.to_datetime(["2026-05-27", "2026-05-28", "2026-05-29"])
    return pd.DataFrame({"open": [101, 102, 110], "high": [1, 1, 1], "low": [1, 1, 1],
                         "close": [101, 103, 111], "volume": [1, 1, 1]}, index=idx)


def fake_past_earnings(sym):
    # earnings_dates-style: DatetimeIndex desc, 'Surprise(%)' column
    idx = pd.to_datetime(["2026-08-01", "2026-05-28", "2026-02-27"])
    return pd.DataFrame({"Surprise(%)": [float("nan"), 12.4, 8.0]}, index=idx)


def test_build_full_payload(monkeypatch):
    c = build_catalysts("AAPL", today="2026-06-13", calendar=fake_calendar,
                        upgrades=fake_upgrades, history=fake_history,
                        past_earnings=fake_past_earnings)
    assert c["symbol"] == "AAPL"
    assert c["next_earnings"] == "2026-08-01"
    # last past earnings before today = 2026-05-28, surprise +12.4%, reaction +7.8%
    assert c["last_earnings"]["date"] == "2026-05-28"
    assert round(c["last_earnings"]["reaction_pct"], 1) == 7.8
    assert c["last_earnings"]["surprise_pct"] == 12.4
    # analyst actions: most-recent first, capped at 3, only within ~90d of today kept
    firms = [a["firm"] for a in c["analyst"]]
    assert firms[0] == "UBS"            # 2026-06-03 newest
    assert "GS" not in firms            # 2026-01-02 too old (>90d)


def test_degrades_without_past_earnings(monkeypatch):
    def boom(sym):
        raise ImportError("Import lxml failed")
    c = build_catalysts("AAPL", today="2026-06-13", calendar=fake_calendar,
                        upgrades=fake_upgrades, history=fake_history,
                        past_earnings=boom)
    assert c["next_earnings"] == "2026-08-01"     # still works
    assert c["last_earnings"] is None              # gracefully absent
    assert c["analyst"]                            # still works
    assert c["degraded"] == ["past_earnings"]


def test_empty_symbol_safe(monkeypatch):
    c = build_catalysts("ZZZZ", today="2026-06-13",
                        calendar=lambda s: {}, upgrades=lambda s: None,
                        history=lambda s, **k: None, past_earnings=lambda s: None)
    assert c["next_earnings"] is None and c["last_earnings"] is None and c["analyst"] == []
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement**

```python
# argus/argus/catalysts/provider.py
"""Any-ticker catalysts (master plan WS-6.3). Composes yfinance surfaces that
work WITHOUT lxml (calendar, upgrades_downgrades) plus, when lxml is present,
earnings_dates for past surprises. Fetchers are injected for testability; the
module-level defaults wire the real yfinance + get_history calls.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Callable, Optional

import pandas as pd

from ..data import get_history
from .reaction import earnings_reaction_pct

ANALYST_WINDOW_DAYS = 90
ANALYST_MAX = 3


def _default_calendar(sym): import yfinance as yf; return yf.Ticker(sym).calendar
def _default_upgrades(sym): import yfinance as yf; return yf.Ticker(sym).upgrades_downgrades
def _default_past(sym): import yfinance as yf; return yf.Ticker(sym).earnings_dates
def _default_history(sym, **k): return get_history(sym, period="1y")


def _next_earnings(cal) -> Optional[str]:
    if not cal:
        return None
    ed = cal.get("Earnings Date") if hasattr(cal, "get") else None
    if not ed:
        return None
    d = ed[0] if isinstance(ed, (list, tuple)) and ed else ed
    try:
        return pd.Timestamp(d).date().isoformat()
    except Exception:
        return None


def _last_earnings(past_df, hist, today: str) -> Optional[dict]:
    if past_df is None or len(past_df) == 0:
        return None
    t = pd.Timestamp(today).normalize()
    idx = pd.to_datetime(past_df.index).normalize()
    past = sorted([d for d in idx if d <= t], reverse=True)
    if not past:
        return None
    d = past[0]
    surprise = None
    for col in ("Surprise(%)", "Surprise %", "surprise"):
        if col in past_df.columns:
            v = past_df.loc[past_df.index.normalize() == d, col]
            if len(v) and pd.notna(v.iloc[0]):
                surprise = round(float(v.iloc[0]), 1)
            break
    reaction = earnings_reaction_pct(hist, d.date().isoformat()) if hist is not None else None
    return {"date": d.date().isoformat(),
            "surprise_pct": surprise,
            "reaction_pct": round(reaction, 1) if reaction is not None else None}


def _analyst(up_df, today: str) -> list[dict]:
    if up_df is None or len(up_df) == 0:
        return []
    t = pd.Timestamp(today).normalize()
    out = []
    for ts, row in up_df.iterrows():
        d = pd.Timestamp(ts).normalize()
        if (t - d).days > ANALYST_WINDOW_DAYS or d > t:
            continue
        out.append({"date": d.date().isoformat(), "firm": str(row.get("Firm", "")),
                    "to": str(row.get("ToGrade", "")), "from": str(row.get("FromGrade", "")),
                    "action": str(row.get("Action", ""))})
    out.sort(key=lambda a: a["date"], reverse=True)
    return out[:ANALYST_MAX]


def build_catalysts(symbol: str, today: Optional[str] = None,
                    calendar: Callable = _default_calendar,
                    upgrades: Callable = _default_upgrades,
                    history: Callable = _default_history,
                    past_earnings: Callable = _default_past) -> dict:
    sym = symbol.upper()
    today = today or datetime.now(timezone.utc).date().isoformat()
    degraded: list[str] = []

    def _try(fn, name, *a, **k):
        try:
            return fn(*a, **k)
        except Exception:
            degraded.append(name)
            return None

    cal = _try(calendar, "calendar", sym)
    up = _try(upgrades, "upgrades", sym)
    hist = _try(history, "history", sym)
    past = _try(past_earnings, "past_earnings", sym)

    return {"symbol": sym,
            "next_earnings": _next_earnings(cal),
            "last_earnings": _last_earnings(past, hist, today),
            "analyst": _analyst(up, today),
            "degraded": degraded}
```

- [ ] **Step 4: Run to verify pass** → 3 passed; full suite 28 passed.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/catalysts/provider.py argus/tests/test_cat_provider.py
git commit -m "feat(catalysts): any-ticker provider — next/last earnings + analyst actions, lxml-optional"
```

---

### Task 3: `/api/catalysts/{symbol}` endpoint (TDD)

**Files:**
- Modify: `argus/argus/api/routes.py`
- Test: `argus/tests/test_cat_endpoint.py`

- [ ] **Step 1: Write the failing test** (inject via monkeypatching the provider's default fetchers is awkward through HTTP; instead the endpoint delegates to `build_catalysts(symbol)` and the test monkeypatches `argus.catalysts.provider`'s defaults — simplest is to patch at the route by having the route call `build_catalysts`, and the test patches the yfinance-backed defaults through `build_catalysts`'s kwargs is not reachable over HTTP, so the test asserts the SHAPE against a stubbed module-level fetcher):

```python
# argus/tests/test_cat_endpoint.py
import pandas as pd
from fastapi.testclient import TestClient


def test_catalysts_endpoint_shape(monkeypatch):
    import argus.catalysts.provider as prov
    monkeypatch.setattr(prov, "_default_calendar",
                        lambda s: {"Earnings Date": [pd.Timestamp("2026-08-01").date()]})
    monkeypatch.setattr(prov, "_default_upgrades",
                        lambda s: pd.DataFrame(
                            {"Firm": ["UBS"], "ToGrade": ["Buy"], "FromGrade": ["Neutral"],
                             "Action": ["up"]}, index=pd.to_datetime([pd.Timestamp.utcnow().normalize()])))
    monkeypatch.setattr(prov, "_default_history", lambda s, **k: None)
    monkeypatch.setattr(prov, "_default_past", lambda s: None)

    from argus.main import app
    c = TestClient(app)
    r = c.get("/api/catalysts/AAPL")
    assert r.status_code == 200
    body = r.json()
    assert body["symbol"] == "AAPL"
    assert body["next_earnings"] == "2026-08-01"
    assert body["analyst"][0]["firm"] == "UBS"
    assert "degraded" in body
```

(If `argus.main` import-time route binding captures the provider defaults before the monkeypatch — it won't, because the route calls `build_catalysts(symbol)` fresh per request and `build_catalysts` reads the module-level names at call time — proceed. If a test-ordering issue appears, isolate via `subprocess` like `test_heartbeat_cli.py` and report.)

- [ ] **Step 2: Add the route** in `argus/argus/api/routes.py` next to `/api/fundamentals`, import `from ..catalysts.provider import build_catalysts` with the relative imports:

```python
    @app.get("/api/catalysts/{symbol}")
    def catalysts(symbol: str):
        return build_catalysts(symbol)
```

- [ ] **Step 3: Run** → test green; full suite 29 passed.

- [ ] **Step 4: Real-network smoke** (one symbol, confirms the no-lxml path works live):

```bash
cd argus && .venv/bin/python -c "
from argus.catalysts.provider import build_catalysts
import json; print(json.dumps(build_catalysts('AAPL'), indent=2, default=str))"
```
Expected: `next_earnings` a date, `analyst` non-empty, `last_earnings` likely null with `degraded: ["past_earnings"]` (lxml absent — correct graceful path). Paste output.

- [ ] **Step 5: Commit**

```bash
git add argus/argus/api/routes.py argus/tests/test_cat_endpoint.py
git commit -m "feat(catalysts): /api/catalysts/{symbol} any-ticker endpoint"
```

---

### Task 4: Header catalyst strip (dashboard)

**Files:**
- Create: `dashboard/components/ticker/CatalystStrip.tsx`
- Modify: `dashboard/app/t/[ticker]/page.tsx` (render under Header)

- [ ] **Step 1: Component** (one line; degrades to nothing when no catalysts — never an empty box):

```tsx
// dashboard/components/ticker/CatalystStrip.tsx
"use client";

import useSWR from "swr";

interface Catalysts {
  next_earnings: string | null;
  last_earnings: { date: string; surprise_pct: number | null; reaction_pct: number | null } | null;
  analyst: { date: string; firm: string; to: string; action: string }[];
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  });

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

export default function CatalystStrip({ ticker }: { ticker: string }) {
  const { data } = useSWR<Catalysts>(`/api/argus/catalysts/${ticker}`, fetcher, {
    refreshInterval: 3_600_000, shouldRetryOnError: false,
  });
  if (!data) return null;
  const parts: React.ReactNode[] = [];
  if (data.last_earnings) {
    const r = data.last_earnings.reaction_pct;
    parts.push(
      <span key="le">
        earnings {fmtDate(data.last_earnings.date)}
        {r !== null ? (
          <span className={r >= 0 ? "text-pos" : "text-neg"}>
            {" "}({r >= 0 ? "+" : ""}{r.toFixed(1)}%)
          </span>
        ) : null}
      </span>
    );
  }
  if (data.next_earnings) parts.push(<span key="ne">next earnings {fmtDate(data.next_earnings)}</span>);
  const a = data.analyst[0];
  if (a) parts.push(<span key="an">{a.firm} {a.action === "up" ? "↑" : a.action === "down" ? "↓" : "→"} {a.to} {fmtDate(a.date)}</span>);
  if (parts.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[12px] text-muted mt-1 px-0.5">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-line">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
```

- [ ] **Step 2: Render it** in `dashboard/app/t/[ticker]/page.tsx` directly under `<Header … />`: `<CatalystStrip ticker={ticker} />` (import at top).

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npx vitest run` 45 passed (fetch+render, no new unit surface). Dev server (port 3100, `ARGUS_DB=… BRIDGE_DIR=…`): `/t/AAPL` shows the strip with next-earnings + analyst (last-earnings reaction appears only once lxml is installed — note as deferred enhancement). Paste the strip text.

- [ ] **Step 4: Commit**

```bash
git add dashboard/components/ticker/CatalystStrip.tsx "dashboard/app/t/[ticker]/page.tsx"
git commit -m "feat(dashboard): header catalyst strip — next/last earnings + analyst action (B/WS-6)"
```

---

### Task 5: Verify Today chips, docs, board, sweep

**Files:**
- Modify: `argus/README.md`, `dashboard/README.md`, `docs/SESSION_HANDOFF.md`, master plan §9

- [ ] **Step 1: Verify WS-6 item 1 (Today catalyst chips).** Confirm `dashboard/components/today/SignalGroups.tsx` `CatalystCount` column still renders (grep `CatalystCount`); record in the report that item 1 was already complete — no code change. If it has regressed, STOP and report (out of scope to rebuild here).
- [ ] **Step 2: Docs** — `argus/README.md`: endpoint row `GET /api/catalysts/{symbol}` + a `catalysts` module line noting the lxml-optional past-earnings path. `dashboard/README.md`: note the header CatalystStrip + that past-earnings reaction needs lxml in the argus venv. `docs/SESSION_HANDOFF.md`: WS-6 done on branch; integration pending (API restart; optional `argus/.venv/bin/pip install lxml` to unlock past-earnings surprises — flagged, controller/user choice); item 4 (econ-calendar chips) deferred to WS-3. Master plan §9: Phase B / WS-6 row → `Done`, link this plan, date.
- [ ] **Step 3: Sweep** — `cd argus && .venv/bin/python -m pytest tests/ -v` (29 expected); `cd dashboard && npx vitest run` (45) + `npx tsc --noEmit`. Paste tails.
- [ ] **Step 4: Commit**

```bash
git add argus/README.md dashboard/README.md docs/SESSION_HANDOFF.md docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md
git commit -m "chore(catalysts): docs + status board for WS-6"
```

---

## Acceptance (whole phase)

1. argus suite green (29); dashboard vitest green (45); tsc clean.
2. `GET /api/catalysts/{symbol}` returns next earnings + analyst actions for ANY symbol (not just bridge names); `degraded` lists `past_earnings` until lxml is installed.
3. Ticker header shows the catalyst strip; reaction % on last earnings appears once lxml is installed (flagged enhancement).
4. Today-table catalyst chips column confirmed present (item 1 already shipped).
5. Deferred + documented: lxml install unlocks past-earnings surprise/reaction; WS-6 item 4 (index econ-calendar catalyst chips) waits on WS-3's `econ_calendar`.
