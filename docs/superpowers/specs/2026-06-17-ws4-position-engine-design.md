# WS-4 · Position Engine — Design Spec

**Status:** Design approved (2026-06-17). Next: implementation plan via `writing-plans`.
**Source:** WS-4 of `docs/superpowers/plans/2026-06-12-platform-v2-master-plan.md`, refined through a 5-perspective review (research / trading / product / UX / software) + a 2-agent (quant + software) pressure-test.

**Goal:** A per-ticker, long-only swing position-timing engine that emits an always-on directional **bias** and, under a long bias, a precise anti-whipsaw **trade overlay** (entry/exit with typed reasons) — replacing the static PRIME/STANDARD/WATCH setup-quality labels with a state machine over time.

**Architecture:** Two decoupled axes. **Bias** (LONG/NEUTRAL/SHORT × strength) is slow, hysteretic, always present, and built from technicals. **Trade overlay** (FLAT→ARMED→LONG→EXIT→COOLDOWN) is the long-only action layer, active only under a LONG bias, with a cooldown that prevents buy-today/sell-tomorrow churn. Discovery (the separate sentiment bridge) finds names; this engine only *times* them. Pure signal/level functions + a thin side-effect layer persist to SQLite; an on-demand "Run model" button and the live stream render identical chart arrows from one table.

**Tech stack:** Python (pandas, numpy, scipy) in `argus/argus/position_engine/`, SQLite via `argus.db.get_conn`, FastAPI endpoints, Next.js dashboard surfaces.

---

## 1. Scope & non-goals (v1)

**In scope:**
- Long-only swing trades, holding days–weeks. Operating timeframe **daily** for v1 (1h/15m later).
- Multi-timeframe inputs: weekly trend filter × daily entry trigger × (intraday confirmation as data allows).
- The two-axis state machine, the technicals level model, the alert-only health monitor, the backtest harness, the on-demand run + live stream, the Today-table badge + per-ticker deep view.

**Explicit non-goals / deferrals (decided):**
- **Sentiment is out of the engine** — discovery only. (Possible *future* validated health/exit signal; never entry or levels.)
- **Signals-only:** the engine does NOT track real broker holdings. It emits states on charts; the user maps to their own book. (Position-aware / IBKR integration deferred to the gated auto-trading phase.)
- **Single-shot entries.** DCA is supported as **manual-leg avg-cost accounting only** — no "add here" signal in v1.
- **Health is alert-only** — it raises a visible warning and a suggested-exit marker while LONG; it does **not** auto-close in v1.
- **SHORT is a bearish read only** — never traded; it disables arming and force-exits an open long.
- No automated trading (that is the later, separately-gated phase).

---

## 2. The two-axis state model

Persisted as **two enum columns**, not one combined enum, with the invariant: `overlay ∈ {ARMED,LONG,EXIT} ⟹ bias = LONG`. Two columns keep each axis's transition table ~5 edges (a combined enum would be a 15-cell cross-product); modifiers attach to the axis they belong to; the bias→overlay coupling is a one-line invariant.

### Axis 1 — Bias (always-on, slow)
`bias ∈ {LONG, NEUTRAL, SHORT}`, plus `bias_strength ∈ [0,100]` (modifier; 3 display tiers).
- **LONG** — bullish regime; the only bias from which trades arm.
- **NEUTRAL** — the buffer between directional thresholds; always reachable, genuinely sticky.
- **SHORT** — bearish read; disables arming, force-exits open longs. Never executed.

### Axis 2 — Trade overlay (long-only)
`overlay ∈ {FLAT, ARMED, LONG, EXIT, COOLDOWN}`.
- **FLAT** — bias LONG, no trigger yet (resting "no position").
- **ARMED** — entry trigger fired on bar T; **fill pending at T+1 open** (transient, 1 bar).
- **LONG** — position on; self-loops while held (DCA/trail/move-target are *events* on this loop).
- **EXIT** — close fired this bar; carries mandatory `exit_reason`; transient (1 bar).
- **COOLDOWN** — post-exit lockout; structurally blocks re-arm until `cooldown_until`.

---

## 3. Bias computation (direction) + hysteresis

Bias **direction** is a rules-based (not ML) weekly-weighted technical vote; **strength** (§4) is a separate composite. Starting indicators/thresholds (all to be optimised OOS, not asserted):

**Weekly (dominant):** price vs 30-week SMA (±1); 30-wk SMA slope over 10 weeks (rising +1 / flat 0 / falling −1, flat band ≈ |slope| < 0.3·ATR_w/10wk); weekly market structure HH+HL (+1) / LH+LL (−1) / mixed (0).
**Daily (refines, cannot override a hostile weekly):** price vs 50-EMA (±1); 50-EMA vs 200-SMA alignment (±1); ADX(14)≥20 with +DI>−DI (+1) / −DI>+DI (−1) / ADX<20 (0).

`bias_score = 2·(weekly votes) + (daily votes)` → −9…+9 (weekly double-weighted).

**Anti-flicker — three brakes, all required to change bias:**
1. **Schmitt trigger (dual threshold):** enter LONG at `bias_score ≥ +4`; leave LONG only at `≤ +1` (symmetric for SHORT at −4 / −1). The +1…+3 / −1…−3 gaps **are** NEUTRAL — once directional you hold through middling scores.
2. **Confirmation:** the threshold must hold **2 consecutive weekly (or weekly-equivalent) bars**.
3. **Minimum dwell:** once committed, bias cannot change for **≥10 trading days**.

NEUTRAL is never a target outcome — it is the region between thresholds, reached only by decaying out of LONG/SHORT or at cold-start. Forbidden: `LONG↔SHORT` direct (must pass through NEUTRAL).

---

## 4. Strength (0–100) + entry gate

Five transparent components, **fixed near-equal weights** (≈20% each — fitted weights add 4 indefensible DoF):

| # | Component | Definition (start) | →0–100 |
|---|-----------|-----|--------|
| S1 | Trend quality | ADX(14) daily | clamp((ADX−15)/25)·100 |
| S2 | Momentum | 12-wk ROC | percentile-rank vs own 1yr |
| S3 | Relative strength | 13-wk return − SPY (and sector ETF), averaged | logistic at 0 |
| S4 | Distance from anchor MA | (close−50EMA)/ATR | **inverted-U** (peak +0.5…+2 ATR; penalise <0 and >4 — no chasing blow-offs) |
| S5 | Volume confirmation | 20d up/down volume ratio | logistic at 1.0 |

`bias_strength = mean(S1…S5)`. Tiers: **weak [0,40) · building [40,70) · strong [70,100]**.

**Entry gate:** a trade may **arm** only when `bias = LONG ∧ strength ≥ 50`, with its own hysteresis (arm ≥50, disarm <40). Strength does **not** set levels and does not size positions in v1 — it only gates eligibility + the displayed tier (keeps levels independent of a strength bug).

---

## 5. Level model (entry / stop / target)

Structural and ATR-scaled, **independent of bias score and strength**. Must beat the baselines (§11).

- **Entry trigger** (only when armed): price pulled back within **0.5·ATR(14) of the 20- or 50-EMA**, AND the bar closes **above the prior bar's high**, AND resumption volume **≥ 1.2× 20-day avg**. **Fill at T+1 open.** **Gap-skip:** if T+1 opens > `entry_signal_close + 0.75·ATR`, skip the fill (no chasing — *clean entries only for v1*; a "gap-continuation" archetype is a deferred decision).
- **Initial stop:** `min(10-day swing low, entry − 1.5·ATR)`. Initial risk `R = entry − stop` (immutable basis for R-multiples).
- **Target:** `T1 = entry + 1.0R`; `T2 = min(entry + 2.0R, nearest overhead structure)` (prior swing high / measured move / 1.618 fib — don't target into a wall).
- **R:R floor:** reject any armed setup with structural R:R < **1.8:1** (hard filter).
- **Sticky, rule-trailed stop** (only ratchets up, never down, never silent): at +1R → breakeven+costs; beyond +1R → `max(prior_stop, close − 2.5·ATR)` (Chandelier). Each move logged + chart-visible; frozen between triggers.
- **Catalyst gate (overlay — off until graduated):** no fresh entry if confirmed earnings within **next 5 trading days** (arm suppressed, shown "blocked: earnings in N d"); a post-event positive catalyst may lift strength by ≤+10 or defer a time-stop, never create an entry or lower a stop.

---

## 6. Trade overlay state machine

### Legal transitions
| from → to | trigger |
|---|---|
| FLAT → ARMED | entry conditions true on completed bar T (bias=LONG ∧ strength≥50 ∧ §5 trigger) |
| ARMED → LONG | T+1 open fill → emit `entry` event, open `trades` row |
| ARMED → FLAT | trigger invalidated before fill (e.g. gap-skip) |
| LONG → LONG | self-loop; may carry `add_leg`/`trim`/`trail_stop`/`move_target` events |
| LONG → EXIT | `target` / `stop` / `time` hit, OR `bias_flip` (§coupling). **Health does NOT drive this edge in v1 (alert-only).** |
| EXIT → COOLDOWN | settle after close emitted; set `cooldown_until = ts + cooldown_bars` |
| COOLDOWN → FLAT | `ts ≥ cooldown_until` ∧ bias still LONG |

### Forbidden edges (asserted in tests)
`FLAT→LONG` (must go via ARMED — guards the T+1 fill / no same-bar lookahead); `COOLDOWN→ARMED|LONG` while locked; `EXIT→LONG`; `EXIT→EXIT`; `LONG→ARMED`; bias `LONG→SHORT`/`SHORT→LONG` direct; any `overlay∈{ARMED,LONG,EXIT}` with `bias≠LONG`.

### Bias coupling (evaluated before the overlay's own transition each bar)
`if bias≠LONG and overlay∈{ARMED,LONG}: overlay→EXIT, exit_reason='bias_flip'`. ARMED-pre-fill drops to FLAT. So a bias flip out of LONG is itself an exit trigger.

### Cooldown is a STATE (backed by `cooldown_until`)
Making it a state means the only legal exit from COOLDOWN is the timed `→FLAT` edge — re-entry is structurally impossible (testable as a forbidden edge) rather than a guard you might forget.

### Anti-whipsaw rules (the user's core concern — starting numbers, to be optimised OOS)
1. **Entry confirmation** built into §5 (pullback + resumption-close-above-prior-high + volume).
2. **Minimum hold:** no discretionary/time exit for **≥3 trading days** (only the protective stop can fire inside min-hold).
3. **Post-exit cooldown:** **5 trading days** locked from re-arming; re-arm requires a *fresh* trigger; after a **stop-out specifically**, also require strength to re-cross ≥50 from below. Kills buy-today/sell-tomorrow/buy-again churn.
4. **Typed exit reason** `∈ {target, stop, health, time, bias_flip}` rendered distinctly: target = up-then-flat marker; stop = red-down at the tagged stop line; bias_flip = grey regime marker ("regime changed, not a trade signal"); the cooldown line is drawn so the user sees *why* there's no instant re-entry. A stop-out is **not** drawn as a bias flip (bias may still read LONG after a shake-out).

Parameters to sweep jointly on a **churn metric** (trades/yr + median hold), not return alone: entry-confirm, min-hold {3,5}, cooldown {3,5,8}, re-arm strength re-cross {on/off}.

---

## 7. Health monitor (v1 alert-only)

Raises a visible "deteriorating" flag + suggested-exit marker; **does not auto-close** in v1. Five precise, individually-graduatable signals:

| # | Signal | Definition |
|---|--------|-----------|
| H1 | Momentum rollover | 12-wk ROC crosses below its 4-wk MA while RSI(14)<50 for 2 consecutive days |
| H2 | Trend break | daily close below 50-EMA by >0.5·ATR for 2 consecutive closes |
| H3 | Distribution | ≥3 of last 10 days are high-volume down days (close lower 1/3 of range, vol>1.5× avg) |
| H4 | RS decay | 13-wk excess vs SPY+sector turns negative and falls 3 consecutive weeks |
| H5 | Catalyst risk | held into earnings (gate breach) or a downgrade printed while LONG |

`health ∈ [0,100]` (display anchors: <35 degraded · 35–70 nominal · >70 strong) + `health_flags` (tripped sub-signals).

**Censoring-aware evaluation** (required before any health signal could ever drive exits): for each OOS trade, simulate both the baseline exit and "exit T+1 open after the flag fired"; compare the **paired** per-trade Δ; trades that hit the structural stop before any flag are **right-censored** (ties). Graduate a signal only if mean paired Δ is positive with a block-bootstrap CI (over time blocks) excluding zero across ≥3 disjoint point-in-time universes.

---

## 8. Inputs & roles

| Input | Role | Sets levels? |
|---|---|---|
| **Technicals** | core — bias direction, strength, entry/stop/target. Multi-timeframe. | **Yes (primary)** |
| **Catalysts** | event modulator — earnings entry gate; beat/upgrade lifts strength / flags exit | gates/shifts |
| **Fundamentals** | slow bias filter — quality/estimate-trend tilts strength | no |
| **Sentiment** | discovery only (out of engine v1) | no |

Discipline: **technicals-only is the backtestable baseline**; fundamentals & catalysts are overlays that must each independently beat it OOS before switching on.

---

## 9. Display

**Two-tier (UX guidance):** the **Today table** shows the **bias badge** (LONG/NEUTRAL/SHORT) with strength tier as intensity, plus a small **trade-state chip** (ARMED/IN/EXIT) when a trade is live — ≤4 distinguishable glanceable elements. Sub-states (add/trim/hold) appear **only on the deep ticker view**.
- **Color discipline:** use a **non-P&L palette** for state badges (e.g. grey SKIP/weak, steel-blue WATCH/NEUTRAL, teal IN/LONG, amber action) so green/red are not confused with profit/loss — a green LONG can be underwater, a red exit can be a winner. **Red reserved for stop-hits**; target-hits use a distinct (amber/green-flat) marker; the EXIT badge carries its reason inline.
- **Progress (two decoupled readings, never one bar meaning both):** primary label = **R-multiple** ("+0.7R", basis = original risk); a stop→target bar with the entry as a tick is the spatial backup; a **separate risk chip** for the current (possibly trailed) stop ("stop +0.4R · locked"). On any target move the prior progress is **frozen** with a visible "target moved" marker (never silently rescales). Health shown alongside with named anchors.

---

## 10. Data model

`argus/argus/position_engine/schema.py`, idempotent `ensure_schema(conn)` (mirrors `options_intel/schema.py`).

- **`position_signals`** (per-bar): `ts, ticker, tf, model_ver, bias, bias_strength, strength_tier, overlay, entry, stop, target, avg_cost, leg_count, progress_r, progress_pct, progress_denom, progress_anchor, health, health_flags, risk_state, structure, exit_reason, cooldown_until, run_kind, data_date`. PK `(ticker, tf, ts, model_ver, run_kind)`.
- **`trades`** (round-trip): `ticker, tf, model_ver, mode{paper|live}, side, entry_ts, entry_px, qty, init_stop, init_target, exit_ts, exit_px, exit_reason, r_multiple, mae_r, mfe_r, holding_bars, leg_count`. UNIQUE `(ticker, tf, model_ver, mode, entry_ts)`. **Backtest mode writes per-run files, never this table.**
- **`trade_legs`** (DCA child): `trade_id, leg_no, ts, px, qty, kind{entry|add|trim}`. R-basis stays fixed to `init_stop`/original entry; `avg_cost` moves only the reward *numerator*, never the risk denominator of R.
- **`position_events`** (typed log): `trade_id, ticker, tf, model_ver, ts, kind{entry|add_leg|trim|trail_stop|move_target|exit}, exit_reason, old_denom, new_denom, old/new target/stop, frozen_anchor, detail`. UNIQUE `(ticker, tf, model_ver, ts, kind)`.

**Anti-silent-rescale rule:** `position_events.record_event()` is the **only** writer permitted to change `progress_denom`, and it freezes the prior `progress_r` into `progress_anchor` + appends the event in one transaction. The per-bar writer computes `progress_r/progress_pct` as **pure functions** of the current denom. Test: every bar where `progress_denom` changed has a matching event row.

**On-demand vs live:** live daily job writes `run_kind='live'`; the "Run model" endpoint writes `run_kind='ondemand'`, cached on `(ticker, model_ver, data_date)` (repeat clicks read straight from the table). Both render identical arrows from `overlay` transitions (`→LONG` = green-up at entry; `→EXIT` = red-down). Live-stream names need no run.

---

## 11. Backtest harness & validation discipline

`argus/argus/position_engine/backtest.py` — **a development/optimisation tool, no UI.** Replays the full machine over ticker × period × interval; per-trade log (entry/exit ts+px, R, MAE/MFE, holding) + aggregates (WR, avg R, expectancy, exposure, max DD, vs buy-and-hold, vs SPY).

**Hard rules:** signal computes on completed bar T; **all fills at T+1 open** (gaps fill at open, not the level); expectancy reported **net of modeled slippage + commission**; **point-in-time, survivorship-safe universes** only ("past bridge picks" disallowed as an independence universe). Sweeps write to **per-run files, never the live DB**.

**Degrees-of-freedom budget — ≤8 tunable params, pre-registered & frozen before fitting:** bias enter/leave Schmitt spread; confirm bars; min-dwell; strength arm/disarm spread; entry buy-zone ATR; initial-stop ATR; trail ATR; cooldown length. Strength weights are **not** tunable; min-hold & R:R floor held fixed unless pre-registered.

**Overlay graduation:** each overlay (fundamentals/catalysts/health) is a single binary switch on the frozen baseline, ≤2 new params, evaluated **one at a time**, must beat baseline OOS across **≥3 disjoint point-in-time universes** with a block-bootstrap CI (over time regimes) excluding zero.

**Pre-registered success bar (locked):** an overlay graduates only if it improves the baseline's **return-to-max-drawdown (MAR) by ≥15%** with a bootstrap CI excluding zero, **and** does not increase **trades/year by >25%**.

**Leakage shuffle test (suite gate):** `shuffle_future=True` permutes bars > T before fills; the OOS edge must collapse to ~0. Sample size is counted in **regimes, not tickers** (cross-sectional correlation); refuse to graduate anything validated on <3 genuinely distinct regimes incl. ≥1 drawdown regime. Prefer **flat** parameter-stability surfaces (a sharp peak = overfit, reject).

**Engine decision (design-phase):** vectorbt vs extending `tools/backtest` — resolved in the implementation plan, since the trade-log schema + chart-marker contract hang off it.

---

## 12. Module structure

`argus/argus/position_engine/` — pure files (no I/O): `bias.py`, `strength.py`, `levels.py`, `overlay.py`, `health.py`, `progress.py`. Side-effect files: `events.py` (sole denom writer), `store.py`, `backtest.py`, `api.py`, plus `schema.py`, `clock.py` (ET-anchored, mirrors `options_intel/clock.py`), `__init__.py`.

**Testability:** ~25 transition tests (bias ~12 + overlay ~13) + forbidden-edge assertions + the denom-audit + the leakage shuffle test; pure functions tested as value tables so the suite grows additively, not multiplicatively.

---

## 13. Bridge integration & migration

Bridge CSV gains `position_state, entry, stop, target, progress, health`. Today table shows the bias badge + trade chip. PRIME/STANDARD/WATCH keep computing as **setup-quality priors** (and preserve label-efficacy history) but **leave the UI once the state machine is validated** — run both in parallel for **≥4 weeks** of daily reports, then cut over. Every signal row stores `model_ver`; the performance page gains a Position Engine tab (rolling WR/avg-R by version, health-vs-forward-return calibration).

---

## 14. Open questions / deferred (post-v1)

- **DCA add-signal:** promote `add-armed` from accounting to a signal only once pullback-adds beat single-entry OOS on the same names.
- **Position-aware mode:** connect IBKR/manual holdings to split BUY vs HOLD/ADD (gated auto-trading phase).
- **Health auto-exit:** flip from alert-only to a transition driver only after each signal graduates (§7) — and resolve the intraday-detection vs daily-T+1-fill **clock collision** (pin health exits to T+1 open, or move the operating timeframe intraday — never mix clocks silently).
- **Gap-continuation entry archetype:** a second entry style for the strong gap-up leaders the clean-entry rule systematically skips.
- **Short-side trading:** out of scope (SHORT stays a read).

---

## 15. v1 deliverable boundary

A working long-only daily Position Engine: bias + strength + levels + overlay state machine (technicals-only baseline), alert-only health, persistence (4 tables), the backtest harness with the leakage gate + pre-registered success bar, the on-demand "Run model" endpoint + chart arrows, the Today-table bias badge + deep-view progress/risk/health, and the ≥4-week parallel run vs PRIME/STANDARD/WATCH. Fundamentals/catalysts ship as **off-by-default overlays** pending OOS graduation.
