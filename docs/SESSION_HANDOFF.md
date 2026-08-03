# Session Handoff — 2026-08-03

`main` is clean, pushed, and everything below is *open work*, not work in flight. There is
no half-finished branch to pick up. Read §1 before touching weights or the scoring blend.

Recent landmarks: `89fa54c` (conformance P0–P5), `9e6746f` (backlog G2–G7), `81c9638` (label
gates retired), `342bb43` + `73e0fb6` (weight checkpoint verdict + instrument fixes).

---

## 1. The technical leg has no measurable edge — and it is 45% of the score

**This is the most important open item in the repo.** The 2026-08-03 weight checkpoint
(`docs/weight_optimisation/weight_decision.md`, section "Checkpoint result — 2026-08-03")
found that the technical leg's univariate per-day rank-IC is:

| horizon | 1d | 5d | 10d | 20d |
|---|---|---|---|---|
| technical alone | −0.024 (t=−0.52) | +0.025 (t=+0.64) | +0.009 (t=+0.19) | −0.056 (t=−1.38) |
| sentiment alone | +0.003 (t=+0.07) | +0.062 (t=+1.36) | +0.130 (t=+2.46) | +0.220 (t=+4.17) |

|t| never reaches 1.4 at any horizon and the sign is negative at two of four. The corrected
date-fixed-effect ridge agrees (technical ≈ 0 everywhere). Every alpha-grid curve marches to
alpha = 1.000 — "delete the technical leg" — not because sentiment is strong but because
there is nothing to trade off against.

**Do not respond by re-running the weight search.** No blend-weight search on this panel can
answer it; the question is whether the ~70-agent technical ensemble produces a usable
cross-sectional ranking at all. That is a different investigation: score the ensemble's
output directly against forward returns, per-family, rather than as one blended leg.

Weights stay at 35 / 45 / 20 until that is answered.

## 2. The sentiment feed's cross-section collapses on fallback days — LIVE

Distinct sentiment values per report date:

| date | names | distinct values | sd |
|---|---|---|---|
| 2026-06-23 | 35 | 28 | 0.267 |
| 2026-07-24 | 33 | **4** | 0.138 |
| 2026-07-26 | 85 | 56 | 0.398 |
| 2026-08-01 | 35 | **7** | 0.105 |

Mean distinct values fell 31.2 (June) → 21.4 (post-07-19), coinciding with the X-API-402 →
Stocktwits fallback going live (see the `session_20260720_sentiment_fallback` memory). It is
intermittent — some days are fine — but on a bad day the leg carrying 0.35 of the live score
resolves ~33 names into 4 buckets and cannot rank anything.

Two consequences: it is a live scoring defect today, **and** it invalidates the obvious next
move on §1/§5 ("wait for more dates, re-run"), because the re-run would measure a different
instrument. Fix or characterise this before trusting any new panel data.

Start at whatever writes `sentiment_score` in the bridge path and check what the Stocktwits
branch emits versus the X branch — the symptom is quantisation, so suspect coarse bucketing
or a small integer scale in the fallback.

## 3. `earnings_proximity` has never fired — wiring, not missing data

It fired **0 times in 927 logged vote rows**. Chain:

- `argus/argus/catalyst/agents.py:37` reads `pool.metrics["days_to_earnings"]`
- the only writer is `argus/argus/catalyst/sources.py:171`, behind `if ibkr is not None`
- the live pipeline injects `_IBKRNewsShim` whose `fundamentals()` returns `{}`
  (`sentiment_bridge.py:249`)
- but `argus/argus/agents/strategies.py:17` **already computes days-to-earnings from
  yfinance** — so the value exists, it just never reaches the catalyst pool

The `earnings ≤ 14d` display flag (`argus/argus/catalyst/score.py:50`) is dead from the same
field. Harmless today only because `meta_score` renormalises over non-abstaining votes, so
the 0.25 weight is not silently shrinking the leg.

Decide: wire the yfinance value through to `pool.metrics`, or retire the agent. Do not just
lower the weight — that leaves a dead agent in the config.

## 4. `weights_config.py` cannot express a retired agent

`argus/argus/weights_config.py` validates `if set(weights) != expected_keys: return False`,
so dropping one key silently reverts the **entire** catalyst block to in-code defaults — and
those differ from the YAML (`earnings_proximity` 0.15 in code vs 0.25 in
`config/weights.yaml:18`, plus three other mismatches). Combined with the enforced
[0.05, 0.50] per-weight floor, there is no way to say "this agent is retired".

This is a live drift trap: it activates the moment anyone edits the catalyst block, and the
0.25-vs-0.15 divergence means the fallback is not a no-op.

Relax the validator to permit a retired key, or allow 0.0, before touching `catalyst_intra`.

## 5. Unexplained 26-day hole in the panel

`docs/weight_optimisation/panel.csv` has no report dates between **2026-06-23 and
2026-07-19**. No other gap exceeds 4 days. That gap cost the weight checkpoint its only clean
out-of-block validation window, so it is worth knowing whether the daily job stopped, the
reports stopped being written, or the ingest stopped picking them up. Check the launchd
history for `com.market-review.daily` and the report directory over that period.

## 6. Smaller open items

- **Does `PRIME_LONG` survive as a tier?** The OOS label backtest found `adj >= 0.40` is
  itself −0.166pp forward, and it survives only as the tier's definition. Deleting the tier
  is a schema change across dashboard, alerts and screener. Badge copy is already renamed to
  "Extended" so the UI no longer reads as a recommendation, which buys time.
- **1D chart segment** and the **settings page** — still unbuilt.
- **Mention-ratio denominator** — unresolved.
- **e2e runs against `next dev`**, not a production build. Switching would make the gate
  match what ships. Note `reuseExistingServer` means two concurrent playwright runs fight
  over port 3100 — never run two at once, and shard with `--shard=N/4` to stay inside the
  600s command timeout.
- **WS-7 gap-continuation is shelved**, verdict in
  `docs/superpowers/specs/2026-07-16-ws7-gate1-gap-continuation-prereg.md` §7. Third
  mechanical lever to fail the same bar. The edge is selection.

### What the 2026-08-02 mocks show that the pages deliberately do not

The mocks in `docs/design/mockups/` are the spec for the rotation, macro and tape
screens, and the pages were built to match them — but seven mock elements have no
feed behind them and were cut on purpose. They are not missing work. Plan and
per-task rulings: `docs/superpowers/plans/2026-08-03-rotation-macro-tape-mocks.md`.

- **Rotation verdict paragraph** and the **"Ahead of it" prose card** — no model
  writes rotation prose.
- **ETF chips** (Technology XLK, Comms XLC, Real Estate XLRE…) — our universe is
  yfinance *industries* ("Semiconductor Equipment & Materials", "Uranium"), not 11
  GICS sectors with ETF proxies.
- **"Macro tone for this sector"** on rotation, and **"Rotation quadrant · Leading"**
  on macro — the same join failure in both directions. Macro scopes are
  `sector:<sector_taxonomy family>`; rotation rows are yfinance industries, and no
  exact join exists, so either would render nothing on every live scope.
- **"All 412 articles →"** — there is no articles route (`app/` has no `news/`). The
  headline count stays; the link goes.
- **Release actuals** ("Chicago PMI 51.2 vs 49.8 est") on the tape — the morning-report
  feed carries no actual or consensus values.

Two deliberate deviations, likewise not bugs: RRG points stay **numbered rather than
named** (industry names ellipsise at chart scale — `RRGChart.tsx:312-315`), and the tape
prints **Sydney local time** though the mock labels itself ET.

Copy on these screens was rewritten three times to match the code rather than the mock,
which claims things that are false here — a 6-hour half-life, 34 wire sources,
per-sentence FinBERT averaging, a 0.6–1.0 reliability multiplier, a *shaded* neutral
band (it is three dashed price lines), and tiles "sorted by 24h change" (`byMovement`
pins the aggregate scopes first). **Treat the mocks as layout, never as data.**

---

## Running the stack

```
API (launchd, port 8088)   launchctl kickstart -k gui/$UID/ai.argus.api
dashboard dev              cd dashboard && npm run dev          # port 3100
desktop app                open -a MarketAnalyse
rebuild desktop app        cd dashboard && npm run app:build    # slow; tauri build
dashboard tests            cd dashboard && npm run test:all
argus tests                cd argus && .venv/bin/python -m pytest
```

`argus/.venv` is the interpreter for every offline job — run those from the `argus/`
directory. It now pins scikit-learn, matplotlib and pyarrow (`argus/requirements.txt`),
which the scheduled analysis jobs need and which were absent until 2026-08-03.

**Four argus tests fail on a clean tree and always have** — all network-dependent:
`test_cat_endpoint.py::test_catalysts_endpoint_shape`,
`test_eod_fallback.py::TestEODLadderFetch::test_eod_ladder_fetch`,
`test_oi_universe.py::test_universe_indices_first_dedup_and_cap`,
`test_oi_universe.py::test_universe_survives_missing_inputs`.

## Re-running the weight checkpoint

`tools/weight_opt/run_revalidation.sh` is a one-shot: it removes its own launchd plist on
success. Launch it **detached** (`nohup ./tools/weight_opt/run_revalidation.sh &`) — as a
tracked background task it gets SIGTERM'd at session end, which is what made the 2026-07-21
and first 2026-08-03 runs look like crashes. The permutation null takes ~90 minutes.

Before believing any output: read the `independent_windows` and `p_holm` columns, not
`p_value`. The within-day shuffle is anti-conservative under overlapping forward windows, and
a horizon whose p-floor exceeds 0.05 now prints `UNTESTABLE` rather than claiming a result.
