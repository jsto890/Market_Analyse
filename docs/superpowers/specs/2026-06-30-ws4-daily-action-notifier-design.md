# WS-4 Daily Action Notifier — Design

**Date:** 2026-06-30 · **Status:** design approved, awaiting plan.
**Follows:** [2026-06-29-ws4-exit-premise-check-design.md](2026-06-29-ws4-exit-premise-check-design.md)

## Goal

A **notify-only, position-agnostic** daily action-list generator: translate the engine's
persisted daily signals for the watched universe into a concrete action list — new entries
(with bracket levels), exits, and trailing-stop adjustments — and surface it so the user can
execute manually. **No order placement, no IBKR reconciliation, no sizing.** The user is the gate.

## Background / decisions

- **Autonomy = notify-only** (user-chosen, safest): no order path exists by design. This is
  deliberate given the engine's edge is thin and still being validated (the Phase-2 corpus
  validation is the gate); ship the safe surfacing layer first, add execution later if warranted.
- **Position-agnostic** (user-chosen): reads only the engine's own `position_signals` table —
  no `IBKRClient.positions()`, no broker dependency. The list reports the engine's calls for the
  universe; the user maps them to their own account.
- **Exit policy = hold-to-structural-stop** (premise check confirmed no overlay beats it), so the
  only exit action is "engine exited" and the only stop action is the trailing-stop update.

## Architecture

One new pure-ish unit, `argus/argus/position_engine/actions.py`. It reads the two most recent
`position_signals` bars per universe ticker (for a given `model_ver`/`run_kind`) and diffs them
into typed actions; a formatter renders them; the daily run writes a JSON + markdown artifact.

```
position_signals (engine writes per bar) --diff latest 2 bars/ticker--> [ENTRY | EXIT | TRAIL] actions
   -> format_actions (markdown) + actions.json  -> surfaced in the daily run output / morning brief
```

## Components

### `daily_actions(conn, *, universe, model_ver="bt", run_kind="live", asof=None) -> list[dict]`
For each ticker in `universe`, load its two latest signal bars (≤ `asof` if given) and diff:

| condition (prev → today) | action `kind` | fields emitted |
|---|---|---|
| not `LONG` → `LONG` | `ENTRY` | `ticker, entry, stop, target` |
| `LONG` → `EXIT`/`FLAT`/`COOLDOWN` | `EXIT` | `ticker` |
| `LONG` → `LONG`, `stop` changed | `TRAIL` | `ticker, stop, prev_stop` |
| `LONG` → `LONG`, stop unchanged | (none — silent hold) | — |
| fewer than 2 bars | (skip) | — |

Returns a list of dicts `{kind, ticker, ...}`. Pure given a conn — no network. `overlay`,
`entry`, `stop`, `target` all come from the `position_signals` row.

### `format_actions(actions, *, asof) -> str`
Human-readable markdown grouped by kind: `## New entries` (ticker + buy/stop/target), `## Exits`
(sell), `## Stop adjustments` (move stop X→Y). Empty groups omitted; "no actions today" when all
empty.

### Daily artifact
The daily run writes `actions.json` (the typed list + `asof`) and the formatted markdown to the
run output directory, and the markdown is appended to the existing morning-brief output. Delivery
channel is a thin seam — Discord/email is a later, separate add (out of scope here).

## Data flow & error handling

- Universe defaults to the current selection/watchlist (passed in by the caller — the daily job
  already knows it); a ticker with no signals or a single bar is skipped (logged), never crashes
  the batch.
- Stop-change detection uses an exact float compare with a small epsilon (`abs(Δ) > 1e-6`) to
  avoid spurious TRAILs from float noise.

## Testing (TDD, offline)

Synthetic two-bar `position_signals` sequences inserted into a tempfile conn:
- not-LONG→LONG emits one ENTRY with the right entry/stop/target;
- LONG→EXIT (and LONG→FLAT, LONG→COOLDOWN) each emit one EXIT;
- LONG→LONG with a moved stop emits one TRAIL with `prev_stop`/`stop`; unchanged stop emits nothing;
- a ticker with <2 bars is skipped;
- `format_actions` renders each group and "no actions today" when empty.

## Out of scope (explicit)

Order placement, IBKR position reconciliation, position sizing, P&L tracking, and any live-money
path. These are deliberately excluded — this is the notify-only surfacing layer. A future
execution layer (propose-and-confirm or automatic) would be a separate, P2-gated design.

## Caveat

This surfaces the engine's calls; it does not assert the calls are profitable. Promoting beyond
notify-only is **gated on the Phase-2 corpus validation** confirming a robust net-of-cost edge.
