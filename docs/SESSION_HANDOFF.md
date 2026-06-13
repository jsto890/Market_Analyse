# Session Handoff — WS-1 Options Intel (branch ws1-options-intel)

> Written from the WS-1 branch perspective. The controller reconciles this with the WS-6 handoff at integration. A fresh session can resume from this file alone.

## 1. Current state

- **WS-1 (options intel): COMPLETE on branch `ws1-options-intel`** (10 tasks, 10 commits). Awaiting controller integration to main and a calendar-gated validation week.
- Parallel stream: WS-6 catalysts is on its own branch (`ws6-catalysts`). Both feed into Phase B.
- The scorer carries a **beta** tag — full acceptance requires ≥ 5 sessions of close snapshots followed by a signed-off labelled week (see §5 below).

## 2. WS-1 branch commits (4193a5a..HEAD)

```
3fd0226 feat(options_intel): blind labelling sheet for scorer validation
42d6db6 feat(scripts): options snapshot/score/gex jobs — Tue–Sat pre-close + close chain via wrapper
d3a4bcc feat(dashboard): scored unusual rows + as-of banner; GEX levels card on index tickers
ebde5a9 feat(options_intel): /api/unusual + /api/gex endpoints; flow serves scored close snapshot overnight
a869019 feat(options_intel): GEX engine — spot-sweep profile, zero-gamma flip, walls, documented dealer-sign
e05a862 feat(options_intel): robust relative-unusual scorer — median/MAD, own-baseline, persistence
45bab3f feat(options_intel): chain snapshotter — moneyness-banded, idempotent, heartbeated
318bab4 feat(options_intel): snapshot universe — indices + watchlist + bridge, capped
4193a5a feat(options_intel): package + WS-1 schema (snapshots, unusual, gex)
```

## 3. What landed (WS-1)

| Task | Deliverable | Key files |
|---|---|---|
| Schema | `options_snapshots`, `unusual_activity`, `gex_levels` DDL; idempotent `ensure_schema()` | `argus/argus/options_intel/schema.py` |
| Universe | Snapshot universe builder (indices + watchlist + bridge, capped) | `argus/argus/options_intel/universe.py` |
| Snapshotter | Moneyness-banded (±20%) chain snapshotter; idempotent per `(snap_date, kind, symbol, expiry, strike, type)`; heartbeated | `argus/argus/options_intel/snapshot.py` |
| Scorer | Robust relative-unusual scorer: median/MAD z on `log1p(vol)`; own-baseline ≥10d; MAD=0 → std-dev fallback → suppress; OI≥50 eligibility; persistence bonus; **beta tag** | `argus/argus/options_intel/unusual.py` |
| GEX engine | BS-gamma spot-sweep profile; zero-gamma flip + call/put walls; dealer-sign is a documented assumption; OI-based so next non-zero-DTE expiry only | `argus/argus/options_intel/gex.py` |
| Clock | Market-session helpers (ET-aware open/pre/close windows) | `argus/argus/options_intel/clock.py` |
| Label tool | Blind labelling CSV export for scorer validation | `argus/argus/options_intel/label_sheet.py` |
| API | `GET /api/unusual/{symbol}` (scored rows + as_of); `GET /api/gex/{symbol}` (gamma levels + caveat); `GET /api/flow/{symbol}` falls back to scored close snapshot overnight | `argus/argus/api/routes.py` |
| Dashboard | OptionsPanel: σ-score column + as-of banner; GexCard on index tickers | `dashboard/components/ticker/OptionsPanel.tsx`, `dashboard/components/ticker/GexCard.tsx` |
| Jobs + plists | `options_close_job.sh`; `com.argus.options-snapshot-preclose.plist` (05:50 AEST); `com.argus.options-snapshot-close.plist` (06:10 AEST) | `scripts/` |

## 4. Integration actions (controller does at merge)

The following steps are **not done on the branch** — the controller performs them once on main after merging:

1. Install the two launchd plists:
   ```bash
   cp scripts/com.argus.options-snapshot-preclose.plist ~/Library/LaunchAgents/
   cp scripts/com.argus.options-snapshot-close.plist ~/Library/LaunchAgents/
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.options-snapshot-preclose.plist
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.argus.options-snapshot-close.plist
   ```
2. Restart the live Argus API so `/api/unusual`, `/api/gex`, and the closed-market flow fallback are live:
   ```bash
   launchctl kickstart -k gui/$(id -u)/ai.argus.api
   ```
3. Seed the DB with a first manual run:
   ```bash
   bash scripts/options_close_job.sh
   ```
4. Verify the endpoints:
   ```bash
   curl -s http://127.0.0.1:8088/api/unusual/SPY | python3 -m json.tool | head -20
   curl -s http://127.0.0.1:8088/api/gex/SPY    | python3 -m json.tool | head -20
   ```

## 5. Calendar-gated acceptance (scorer beta tag)

The scorer is tagged **beta, validation pending** because median/MAD z-scores are statistically meaningful only after a sufficient own-baseline window (~20 trading sessions per contract). The beta tag is removed only after the following steps:

1. **Accumulate ≥ 5 close-snapshot sessions** (the plists run Tue–Sat at 06:10 AEST, so ≥ 5 US market-close sessions).
2. **Export the blind labelling sheet:**
   ```bash
   python -m argus.options_intel.label_sheet <out.csv>
   ```
3. **User labels the week** — for each flagged contract: was there a significant move in the underlying within the next 1–3 sessions? Mark each row YES / NO / AMBIGUOUS.
4. **Review** — check hit rate vs the cross_z and own_z cutoffs; adjust thresholds if needed.
5. **Remove the beta tag** after the user signs off the labelled week.

## 6. Timing note (Sydney timezone drift)

The plists fire at **05:50 AEST / 06:10 AEST** (pre-close and close). Mapping to ET:

- **During AEST ↔ EDT (northern-hemisphere summer):** AEST = UTC+10, EDT = UTC-4 → 14h offset. 05:50 AEST = 15:50 ET (pre-close ✓), 06:10 AEST = 16:10 ET (post-close ✓).
- **During AEDT (daylight saving in effect, ~Oct–Apr):** AEDT = UTC+11 → 15h offset. 05:50 AEDT = 14:50 ET (~2h early); 06:10 AEDT = 15:10 ET (intraday, not post-close). The plists will need a seasonal time adjustment or a clock-check wrapper during AEDT. This is a known drift (master plan §2.4); the snapshotter heartbeat will surface the timing gap.

## 7. Architecture pointers

- Master plan: `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md` (§4.1 guardrails, §9 board).
- WS-1 implementation plan: `docs/superpowers/plans/2026-06-13-phase-b-ws1-options-intel.md`.
- Options intel module: `argus/argus/options_intel/` — `schema.py`, `universe.py`, `snapshot.py`, `unusual.py`, `gex.py`, `clock.py`, `label_sheet.py`.
- API endpoints: `argus/argus/api/routes.py` (`/api/unusual/{symbol}`, `/api/gex/{symbol}`, `/api/flow/{symbol}` fallback).
- Dashboard components: `dashboard/components/ticker/OptionsPanel.tsx`, `dashboard/components/ticker/GexCard.tsx`.
- Scheduling scripts: `scripts/options_close_job.sh`, `scripts/com.argus.options-snapshot-{preclose,close}.plist`.
- Prior session handoff state (Phase A + B-0 integration summary): preserved in git history — see commit `838edee` and earlier for the merged-main context.
