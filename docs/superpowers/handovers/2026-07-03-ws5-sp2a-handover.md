# WS-5 SP2a Handover — ETF Multi-Underlying (0DTE hub symbol switch)

**Date:** 2026-07-03 · **State:** plan approved and committed; execution NOT started.
**Next action:** execute the plan via `superpowers:subagent-driven-development` (user chose Subagent-Driven).

## What this is

SP2a extends the vendored `/odte` hub (SP1, merged at `aff923e`) so the active underlying can be
switched between **SPY / QQQ / IWM / DIA** in-process — one symbol at a time, no restart. Indices
(SPX/NDX/RUT/DJX) are deferred to SP2b (need `Index()` contracts + live Gateway).

## Authoritative documents

- Spec (approved): `docs/superpowers/specs/2026-06-30-ws5-sp2a-etf-multi-underlying-design.md` (commit `a83eb23`)
- Plan (approved, execute this): `docs/superpowers/plans/2026-06-30-ws5-sp2a-etf-multi-underlying.md` (commit `9bf161e`)

The plan is self-contained: 8 TDD tasks with complete code, commands, and expected outputs.
T1–T3 upstream (`~/OptionsAnalysis`), T4 re-vendor, T5–T7 dashboard, T8 verification sweep.
All tasks pending. SDD progress ledger (create on first completed task):
`.superpowers/sdd/progress.md` in the Market_Analyse repo root.

## Repo states at handover

- **Market_Analyse**: on `main` @ `9bf161e` (plan commit). Implementation branch
  `ws5-sp2a-etf-multi-underlying` is created from `main` in plan Task 4 Step 1.
  - NEVER stage/commit/revert: `sentiment_bridge.py` (modified) and
    `scripts/com.argus.calendar.plist` (untracked) — unrelated standing WIP. Explicit-path `git add` only.
  - `ws4-validation-robust` (@ `9e506fa`) is a separate in-flight WS-4 workstream — do not touch.
- **OptionsAnalysis (upstream)**: on `main` @ `f7c1240`, clean except untracked `CLAUDE.md`
  (leave it; it is excluded from vendoring). No `backend/.venv` yet — plan Task 1 Step 1 provisions it.
  Feature branch `ws5-sp2a-symbol-switch` is created there in Task 1, merged back to main in Task 3.

## Execution requirements (user-mandated)

1. **Subagent-driven development**: fresh implementer subagent per task, task reviewer after each,
   final whole-branch review at the end (superpowers:requesting-code-review).
2. **Manager oversight** (explicit user instruction: "make sure to have a manager agents and a
   cross project manager to oversee the changes"): a delivery project-manager agent and a
   cross-project manager agent act as execution checkpoints. In the original session these were
   agents `aefa52c4ede1a8b6d` (delivery PM) and `adc62f673c235703f` (cross-project manager),
   continuable via SendMessage. If those IDs are unreachable (new session), re-spawn two
   `project-manager` subagents (sonnet) in those roles. Checkpoint cadence: after T3 (upstream
   gate), after T4 (vendor integrity), and before the final review.

## Key verified facts (do not re-derive)

- Only ~one symbol fits the IBKR line budget: ~80 option lines + underlying per symbol vs the
  95 soft limit / ~100 IBKR cap — hence switch, not concurrency.
- Upstream gitignores `frontend/dist`; SP1's committed dist in `odte/frontend/dist` must be
  retained (re-vendor excludes it; SP2a changes no frontend source). The vendored frontend is
  symbol-agnostic (renders `state.symbol` from the ws snapshot) — zero frontend edits.
- `HTTPException` is NOT yet imported in upstream `backend/app/main.py` (line 13) — Task 2 adds it.
- `HealthResponse` is constructed in exactly one place (main.py `/health` handler); Pydantic
  response_model strips fields not in the schema, so `symbol` goes into the schema (Task 1).
- ib_insync tickers carry `.contract` — the underlying subscription is cancelled via
  `connector.cancel_market_data(market.underlying_ticker.contract)`.
- The ingest loop already re-bootstraps whenever `market_ready` is false — `_switch_symbol` is
  teardown + reset only; `_set_active_window(app, [], reason="switch")` tears down all options.
- Dashboard health proxy (`app/api/odte/health/route.ts`) forwards backend JSON verbatim —
  needs no changes for `symbol`.
- Dashboard tests: vitest, node env, pure-lib only, NO @testing-library.
- Service: launchd `com.argus.odte` on `127.0.0.1:8788`; restart with
  `launchctl kickstart -k gui/$(id -u)/com.argus.odte`.
- IBKR Gateway is down: live end-to-end swap unverifiable this cycle; acceptance =
  fake-connector pytest + Task 4 offline contract smoke (spec caveat).

## After T8

Use `superpowers:finishing-a-development-branch` on `ws5-sp2a-etf-multi-underlying`
(SP1 precedent: merge to main locally). Then SP2b (indices) and SP3 (WS-1 companion grid)
remain future cycles requiring fresh user confirmation.
