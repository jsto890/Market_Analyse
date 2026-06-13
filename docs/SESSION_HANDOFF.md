# Session Handoff — Phase A complete / Phase B-0 next

_Last updated: 2026-06-13_

A fresh session must be able to resume from this file alone.

---

## 1. Current state

**Phase A is complete** on branch `phase-a-bug-sweep` (worktree at
`/Users/josephstorey/Market_Analyse/.worktrees/phase-a`).

All 9 tasks landed; bugs B1–B8 fixed; regression scripts green.

**Phase B-0 (data-plane foundation)** is the immediate next step — it gates all
ingester workstreams (WS-1/3/5 cannot write production data until B-0 lands). See
`docs/superpowers/plans/2026-06-12-phase-b0-data-plane.md` for the 9-task plan.

---

## 2. Phase A commits (`git log --oneline 838edee..HEAD` on `phase-a-bug-sweep`)

```
<HEAD>  chore(dashboard): smoke chart-pill check, docs + status board for Phase A
2abe949 feat(dashboard): chart info strip — session, range, volume, 52w, extended price (B8)
ffef5d2 feat(argus): /api/extended/{symbol} — pre/post-session last price
64c654f feat(dashboard): bar-stats helpers for chart info strip
f7de1bf fix(dashboard): options panel — pricing columns, honest error/market-state copy (B6, B7)
54f9979 feat(dashboard): US session-state helper (DST-safe)
936c92d fix(dashboard): coherent since-called line — date @ basis → now (pct, days) (B5)
a98cbd3 fix(dashboard): Sources reads ACCOUNTS_CSV env with designed empty state (B4)
3030575 fix(dashboard): Today-table sliver rows — phantom collapsed expansion rows; add row-height regression check (B3)
93fa9c7 fix(dashboard): chart ranges client-side over single 2Y fetch; 200-EMA renders on all periods (B1, B2)
1877b54 feat(dashboard): chart-range helper for client-side period switching
```

---

## 3. What was fixed (B1–B8)

| Bug | Fix |
|---|---|
| B1 Chart pills don't work | Single 2Y fetch; pills switch client-side via `lib/chart-range.ts` |
| B2 200MA toggle does nothing | EMA-200 computed over full 2Y series; visible range is independent of lookback |
| B3 Sliver rows in Today table | Removed phantom collapsed expansion rows from `DataTable.tsx`; `scripts/row-heights.mjs` guards regression |
| B4 Sources tab empty | `app/api/accounts/route.ts` reads `ACCOUNTS_CSV` env; designed empty state when unset |
| B5 "Since called" looks weird | `lib/called-since.ts` — "Called DATE @ $PRICE → now $PRICE (+X%, N days)" |
| B6 Unusual calls/puts empty overnight | Options panel now serves last close snapshot with "as of close" banner |
| B7 Options panel mislabels failures | Correct error copy: "Argus API down" / "no chain data" / "market closed, showing last snapshot" |
| B8 Chart lacks context info | Chart info strip: last close, day range, volume vs 20d-avg, 52-week position, pre/after-market price |

**Key implementation notes:**
- B3 repro: the bug was a height collapse, not a text issue — the text filter would have missed it. `row-heights.mjs` uses a height-only Playwright check.
- Today table reads `BRIDGE_DIR` CSVs directly (not the DB) — `BRIDGE_DIR` env controls the path.
- `lib/market-clock.ts` is DST-safe (handles US and AU DST shift weeks separately).

---

## 4. Regression suite — current green baseline

```
vitest run          → 10 files, 45 tests, 0 failures
pytest tests/ -v    → 18 passed (argus catalyst tests)
row-heights.mjs     → rows=42 slivers=0  (exit 0)
smoke.mjs           → 8/8 routes PASS
  acceptable fail: 404 /api/argus/history/SIVE (SIVE.ST alias, history not available; argus offline)
```

Run smoke with:
```bash
# Start dev server first (port 3100):
cd /Users/josephstorey/Market_Analyse/.worktrees/phase-a/dashboard
ARGUS_DB=/Users/josephstorey/Market_Analyse/argus.db \
BRIDGE_DIR=/Users/josephstorey/Market_Analyse/reports \
PORT=3100 npm run dev

# In another terminal:
SMOKE_URL=http://localhost:3100 node scripts/row-heights.mjs
SMOKE_URL=http://localhost:3100 node scripts/smoke.mjs
```

---

## 5. In-flight / next steps

### Immediate: merge Phase A + start Phase B-0

1. **Merge `phase-a-bug-sweep` into `main`** (or submit PR via `gh pr create`).
2. **Restart the live Argus API** so the new `/api/extended/{symbol}` endpoint is served
   (currently the live API runs old code; the chart info strip's pre/after-market price
   calls this endpoint and will show "—" until the API is restarted).
   ```bash
   launchctl kickstart -k gui/$(id -u)/ai.argus.api
   ```
3. **Start Phase B-0** on its own branch using
   `docs/superpowers/plans/2026-06-12-phase-b0-data-plane.md` (9 tasks):
   - Canonical `ARGUS_DB` env var across both runtimes
   - WAL + `busy_timeout` contract
   - `heartbeats` table
   - `pmset` scheduled wakes + idempotent backfill pattern
   - `.env` secrets consolidation
   - Daily driver consolidated into this repo

### Controller integration note

The B-0 branch edits the master plan's §9 status board for its own row (B-0 → Done).
After both Phase A and B-0 are merged to `main`, OVERVIEW.md gains its "Platform v2
direction" section (per §4.1 living-documentation rule).

---

## 6. Architecture pointers

- **Master plan:** `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md`
  — single source of truth; §9 status board tracks all phases.
- **Phase A impl plan:** `docs/superpowers/plans/2026-06-12-phase-a-bug-sweep.md`
- **Phase B-0 impl plan:** `docs/superpowers/plans/2026-06-12-phase-b0-data-plane.md`
- **Dashboard README:** `dashboard/README.md` — chart design, env vars, helper modules,
  regression scripts.
- **Argus API:** FastAPI at `http://127.0.0.1:8088`; launchd job `ai.argus.api`;
  venv at `argus/.venv` (symlink to Homebrew Python venv — do not delete).
- **DB:** `argus.db` in repo root; path set via `ARGUS_DB` env; `dashboard/lib/db.ts`
  and `argus/db.py` must read from the same file.

---

## 7. Gotchas

- `argus/.venv` and `node_modules` are **symlinks** in the worktree — do not recreate them.
- Main checkout (`/Users/josephstorey/Market_Analyse`) is **off-limits for writes** while the
  worktree is active — edit only within the worktree path.
- Manual bridge runs skip broad cashtag discovery → fewer candidates than the daily run.
- `ACCOUNTS_CSV` is not set by default → Sources tab shows its designed empty state
  (that is expected; it is not a bug).
- SIVE history 404 in smoke is acceptable — SIVE is a watchlist pin with a `.ST` alias
  that the Argus history proxy cannot resolve; the Argus API must be running for a real fix.
